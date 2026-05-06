/**
 * src/app/api/users/route.ts
 * ──────────────────────────
 * Server-side API route for user management operations that require
 * the Firebase Admin SDK:
 *   POST   /api/users  → create a Firebase Auth account + Firestore profile
 *   DELETE /api/users  → delete Firebase Auth account (Firestore profile deleted client-side)
 *
 * This route is only callable by authenticated Admin users.
 * The caller's ID token is verified before any action is taken.
 */

import { NextRequest, NextResponse } from "next/server"
import * as admin from "firebase-admin"

// ─── Init Admin SDK (singleton) ───────────────────────────────────────────────

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

// ─── Auth verification helper ─────────────────────────────────────────────────

async function verifyCallerIsAdmin(req: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace("Bearer ", "").trim()
  if (!token) return null

  try {
    const app     = getAdminApp()
    const decoded = await admin.auth(app).verifyIdToken(token)
    const db      = admin.firestore(app)
    db.settings({ databaseId: "ai-studio-bdfef43d-2be7-481f-aa32-115cee100a5e" })

    // Check system /users or /user_index + client profile for admin role
    const sysDoc = await db.collection("users").doc(decoded.uid).get()
    if (sysDoc.exists && sysDoc.data()?.role === "system_admin") {
      return { uid: decoded.uid }
    }

    const idxDoc = await db.collection("user_index").doc(decoded.uid).get()
    if (!idxDoc.exists) return null

    const { clientId } = idxDoc.data() as { clientId: string }
    const profileDoc = await db
      .collection("clients").doc(clientId)
      .collection("users").doc(decoded.uid)
      .get()

    if (profileDoc.data()?.role === "admin") return { uid: decoded.uid }
    return null
  } catch {
    return null
  }
}

// ─── POST /api/users — create user ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await verifyCallerIsAdmin(req)
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as {
    email: string
    password: string
    displayName: string
    clientId: string
    role: string
    name: string
    plant?: string
    department?: string
  }

  const { email, password, displayName, clientId, role, name, plant, department } = body

  if (!email || !password || !clientId || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const app = getAdminApp()
    const db  = admin.firestore(app)
    db.settings({ databaseId: "ai-studio-bdfef43d-2be7-481f-aa32-115cee100a5e" })

    // 1. Create Firebase Auth account
    const userRecord = await admin.auth(app).createUser({
      email,
      password,
      displayName: displayName ?? name,
    })

    const uid = userRecord.uid
    const now = new Date().toISOString().split("T")[0]

    // 2. Write Firestore profile + user_index in a batch
    const batch = db.batch()

    batch.set(
      db.collection("clients").doc(clientId).collection("users").doc(uid),
      { name, email, role, plant: plant ?? "", department: department ?? "", clientId, createdAt: now }
    )

    batch.set(
      db.collection("user_index").doc(uid),
      { clientId }
    )

    await batch.commit()

    return NextResponse.json({ uid }, { status: 201 })
  } catch (err: unknown) {
    const code    = (err as { code?: string }).code ?? ""
    const message = (err as { message?: string }).message ?? "Unknown error"
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 })
    }
    console.error("POST /api/users error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── DELETE /api/users — delete Auth account ─────────────────────────────────

export async function DELETE(req: NextRequest) {
  const caller = await verifyCallerIsAdmin(req)
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { uid } = await req.json() as { uid: string }
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 })

  try {
    const app = getAdminApp()
    await admin.auth(app).deleteUser(uid)
    // Firestore profile and user_index are deleted client-side via deleteUserProfile()
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = (err as { message?: string }).message ?? "Unknown error"
    console.error("DELETE /api/users error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
