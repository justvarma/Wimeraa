import { NextRequest, NextResponse } from "next/server"
import * as admin from "firebase-admin"
import { buildStageSubWorkOrder, getNextProcess } from "@/lib/workflow"
import { QI_ROLE_PROCESS_MAP, UserRole, type ProcessStage, type RejectionEntry, type ReworkEntry, type Shift, type WorkOrder } from "@/lib/store"

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set.")
  }

  return admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccount)),
  })
}

function getAdminDb(app: admin.app.App): admin.firestore.Firestore {
  const db = admin.firestore(app)
  db.settings({ databaseId: "ai-studio-bdfef43d-2be7-481f-aa32-115cee100a5e" })
  return db
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => stripUndefined(item)) as T
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T
  }
  return value
}

async function verifyCaller(req: NextRequest): Promise<{ uid: string; clientId: string; name: string; role: UserRole } | null> {
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) return null

  try {
    const app = getAdminApp()
    const decoded = await admin.auth(app).verifyIdToken(token)
    const db = getAdminDb(app)

    const idxDoc = await db.collection("user_index").doc(decoded.uid).get()
    if (!idxDoc.exists) return null
    const { clientId } = idxDoc.data() as { clientId: string }

    const profileDoc = await db.collection("clients").doc(clientId).collection("users").doc(decoded.uid).get()
    const profile = profileDoc.data() as { name?: string; role?: UserRole } | undefined
    if (!profile?.role) return null

    return { uid: decoded.uid, clientId, name: profile.name ?? decoded.name ?? "QI User", role: profile.role }
  } catch {
    return null
  }
}

function canInspectProcess(role: UserRole, process: ProcessStage): boolean {
  return role === UserRole.ADMIN || role === UserRole.QUALITY_INSPECTOR || QI_ROLE_PROCESS_MAP[role] === process
}

export async function POST(req: NextRequest) {
  const caller = await verifyCaller(req)
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    process: ProcessStage
    date: string
    workOrderId: string
    producedPartCount: number
    goodPartCount: number
    reworkCount: number
    reworkEntries: ReworkEntry[]
    rejectedCount: number
    rejectionEntries: RejectionEntry[]
  }

  if (!body.workOrderId || !body.process || !body.date) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 })
  }
  if (!canInspectProcess(caller.role, body.process)) {
    return NextResponse.json({ error: "QI role is not allowed to inspect this process." }, { status: 403 })
  }

  const total = Number(body.goodPartCount || 0) + Number(body.reworkCount || 0) + Number(body.rejectedCount || 0)
  if (total !== Number(body.producedPartCount || 0)) {
    return NextResponse.json({ error: "Good + Rework + Rejected must equal Produced." }, { status: 400 })
  }

  try {
    const app = getAdminApp()
    const db = getAdminDb(app)
    const now = new Date().toISOString().split("T")[0]
    const workOrdersCol = db.collection("clients").doc(caller.clientId).collection("work_orders")
    const qiCol = db.collection("clients").doc(caller.clientId).collection("qi_inspections")

    const woRef = workOrdersCol.doc(body.workOrderId)
    const woSnap = await woRef.get()
    if (!woSnap.exists) return NextResponse.json({ error: "Work order not found." }, { status: 404 })

    const wo = { id: woSnap.id, ...woSnap.data() } as WorkOrder
    if (wo.process !== body.process || wo.status !== "awaiting_qi") {
      return NextResponse.json({ error: "Work order is not awaiting QI for this process." }, { status: 409 })
    }
    if (wo.assignedQiId && wo.assignedQiId !== caller.uid && caller.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "This vendor WO is assigned to a different QI user." }, { status: 403 })
    }

    const qiRef = qiCol.doc()
    const qiRecord = stripUndefined({
      process: body.process,
      date: body.date,
      masterId: wo.masterId,
      partId: wo.partId,
      partName: wo.partName,
      shift: wo.shift as Shift,
      machine: wo.machine,
      producedPartCount: body.producedPartCount,
      goodPartCount: body.goodPartCount,
      reworkCount: body.reworkCount,
      reworkEntries: body.reworkEntries,
      rejectedCount: body.rejectedCount,
      rejectionEntries: body.rejectionEntries,
      inspectedBy: caller.name,
      inspectedById: caller.uid,
      workOrderId: wo.id,
      operator: wo.operator,
      isExternal: wo.isExternal,
      vendorName: wo.vendorName,
      vendorProductionDate: wo.vendorProductionDate,
      vendorMachine: wo.vendorMachine,
      vendorShift: wo.vendorShift,
      assignedQiId: wo.assignedQiId,
      createdAt: now,
    })

    const nextProcess = body.goodPartCount > 0 ? getNextProcess(body.process) : null
    const finalAcceptedQuantity = body.goodPartCount > 0 && !nextProcess
    const hasAcceptedQuantity = body.goodPartCount > 0
    const rootId = wo.rootWoId || wo.parentWoId || wo.id

    const batch = db.batch()
    batch.set(qiRef, qiRecord)
    batch.update(woRef, stripUndefined({
      goodParts: body.goodPartCount,
      reworkParts: body.reworkCount,
      rejectedParts: body.rejectedCount,
      qiApproval: caller.name,
      status: hasAcceptedQuantity ? (finalAcceptedQuantity ? "finished_goods" : "completed") : "rejected",
    }))

    if (hasAcceptedQuantity && nextProcess) {
      batch.set(workOrdersCol.doc(), stripUndefined({
        ...buildStageSubWorkOrder({
          source: { ...wo, goodParts: body.goodPartCount, reworkParts: body.reworkCount, rejectedParts: body.rejectedCount },
          process: nextProcess,
          createdBy: "System Workflow",
          targetPartNos: body.goodPartCount,
          parentWoId: rootId,
          originQiId: qiRef.id,
        }),
        createdAt: now,
      }))
    }

    if (body.reworkCount > 0) {
      const existingReworks = await workOrdersCol.where("parentWoId", "==", rootId).where("woType", "==", "rework").get()
      batch.set(workOrdersCol.doc(), stripUndefined({
        ...buildStageSubWorkOrder({
          source: { ...wo, goodParts: body.goodPartCount, reworkParts: body.reworkCount, rejectedParts: body.rejectedCount },
          process: body.process,
          createdBy: "System Workflow",
          targetPartNos: body.reworkCount,
          parentWoId: rootId,
          reworkCycleNumber: existingReworks.size + 1,
          defectType: "rework",
          originQiId: qiRef.id,
        }),
        createdAt: now,
      }))
    }

    if (body.rejectedCount > 0) {
      const existingRejections = await workOrdersCol.where("parentWoId", "==", rootId).where("woType", "==", "rejection").get()
      batch.set(workOrdersCol.doc(), stripUndefined({
        ...buildStageSubWorkOrder({
          source: { ...wo, goodParts: body.goodPartCount, reworkParts: body.reworkCount, rejectedParts: body.rejectedCount },
          process: body.process,
          createdBy: "System Workflow",
          targetPartNos: body.rejectedCount,
          parentWoId: rootId,
          reworkCycleNumber: existingRejections.size + 1,
          defectType: "rejection",
          originQiId: qiRef.id,
        }),
        acceptancePoints: "Rejected/NCR tracking WO — separated from accepted production for scrap analysis and reporting.",
        createdAt: now,
      }))
    }

    await batch.commit()
    return NextResponse.json({ qiId: qiRef.id }, { status: 201 })
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? "Unknown error"
    console.error("POST /api/qi-workflow error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}