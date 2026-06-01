import { PROCESS_STAGE_LABELS, type ProcessStage, type Shift, type WorkOrder } from "@/lib/store"

export const WORK_ORDER_PROCESS_SEQUENCE: ProcessStage[] = ["die_casting", "coating", "cnc_vmc"]

export function getWorkflowStep(process: ProcessStage): number {
  return WORK_ORDER_PROCESS_SEQUENCE.indexOf(process)
}

export function getNextProcess(process: ProcessStage): ProcessStage | null {
  const next = getWorkflowStep(process) + 1
  return WORK_ORDER_PROCESS_SEQUENCE[next] ?? null
}

export function getRootWorkOrderId(wo: WorkOrder): string {
  return wo.rootWoId || wo.parentWoId || wo.id
}

export function hasOpenMachineAssignment(workOrders: WorkOrder[], machine: string, currentWorkOrderId?: string): boolean {
  if (!machine) return false
  return workOrders.some(wo =>
    wo.id !== currentWorkOrderId &&
    wo.machine === machine &&
    wo.status !== "completed" &&
    wo.status !== "finished_goods" &&
    wo.status !== "rejected" &&
    wo.status !== "paused"
  )
}

export function buildStageSubWorkOrder(params: {
  source: WorkOrder
  process: ProcessStage
  createdBy: string
  targetPartNos?: number
  requiredQuantityKg?: number
  parentWoId?: string
  reworkCycleNumber?: number
  originQiId?: string
  defectType?: "rework" | "rejection"
  processWoId?: string
}): Omit<WorkOrder, "id" | "createdAt"> {
  const { source, process, createdBy } = params
  const step = getWorkflowStep(process)

  // FIX: Use explicit params first, then fall back to source.targetPartNos.
  // Do NOT use source.goodParts as a fallback — it is 0 on newly created WOs
  // and would silently zero-out the target on the first stage SWO.
  const targetPartNos = params.targetPartNos != null
    ? params.targetPartNos
    : source.targetPartNos

  const requiredQuantityKg = params.requiredQuantityKg != null
    ? params.requiredQuantityKg
    : source.requiredQuantityKg

  return {
    date: new Date().toISOString().split("T")[0],
    masterId: source.masterId,
    partId: source.partId,
    partName: source.partName,
    process,
    targetPartNos,
    requiredQuantityKg,
    workOrderStartDate: source.workOrderStartDate,
    dueDate: source.dueDate,
    materialGrade: "",
    rawMaterialId: "",
    rawMaterialGrade: "",
    shift: "" as Shift,
    machine: "",
    operator: "",
    actualTarget: 0,
    partPerCycle: 0,
    weightPerPart: source.weightPerPart || (targetPartNos > 0 ? requiredQuantityKg / targetPartNos : 0),
    actualOutputKg: 0,
    acceptancePoints: "",
    isExternal: false,
    partsCompleted: 0,
    goodParts: 0,
    reworkParts: 0,
    rejectedParts: 0,
    scrapWeight: 0,
    inputWeightKg: 0,
    status: params.defectType === "rejection" ? "rejected" : "draft",
    productionStarted: false,
    createdBy,
    woType: params.defectType === "rejection" ? "rejection" : params.reworkCycleNumber ? "rework" : "stage",
    parentWoId: params.parentWoId ?? getRootWorkOrderId(source),
    rootWoId: getRootWorkOrderId(source),
    workflowStep: step,
    workflowLabel: PROCESS_STAGE_LABELS[process],
    reworkCycleNumber: params.reworkCycleNumber,
    originQiId: params.originQiId,
    reworkPartCount: params.defectType === "rework" || (params.reworkCycleNumber && params.defectType !== "rejection") ? targetPartNos : undefined,
    rejectionPartCount: params.defectType === "rejection" ? targetPartNos : undefined,
    ...(params.processWoId ? { processWoId: params.processWoId } : {}),
  }
}