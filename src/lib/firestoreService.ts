/**
 * firestoreService.ts
 * -------------------
 * All Firestore reads, writes, and real-time listeners.
 *
 * Collection layout (multi-tenant):
 *
 *   /users/{uid}                           ← system-admin profiles (Wimera level)
 *   /user_index/{uid}                      ← { clientId } lookup for client users
 *   /clients/{clientId}/
 *     users/{uid}
 *     raw_materials/{id}
 *     schedules/{id}
 *     ptcs/{id}
 *     work_orders/{id}
 *     daily_entries/{id}
 *     process_records/{id}
 *     downtime_events/{id}
 *     qi_inspections/{id}
 *     fqi_inspections/{id}
 *     roles/{id}          ← RoleConfig — admin-managed role definitions
 *     shifts/{id}         ← ShiftConfig — admin-managed shift definitions
 *
 * Every listener returns an unsubscribe function — call it in useEffect cleanup.
 */

import {
  collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc, getDocs,
  onSnapshot, serverTimestamp,
  query, where, orderBy,
  writeBatch,
  runTransaction,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./firebase"
import type {
  User, RawMaterial, RawMaterialMaster, PartMaster, MonthlySchedule, PTC,
  WorkOrder, DailyProductionEntry, ProcessRecord,
  DowntimeEvent, QIInspection, FQIInspection,
  ShiftConfig, RoleConfig, MachineDef, DeviceConfig, OperationConfig,
} from "./store"

// ─── Path helpers ─────────────────────────────────────────────────────────────

const clientCol = (clientId: string, col: string) =>
    collection(db, "clients", clientId, col)

const clientDoc = (clientId: string, col: string, id: string) =>
    doc(db, "clients", clientId, col, id)

// ─── Generic helpers ──────────────────────────────────────────────────────────

type Unsub = () => void

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefined(item)) as T
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T
  }
  return value
}

/**
 * Subscribe to an entire sub-collection with optional constraints.
 * The snapshot strips Firestore metadata and maps `id` from the doc.
 */
function subscribeCol<T>(
    clientId: string,
    colName: string,
    setter: (items: T[]) => void,
    constraints: QueryConstraint[] = [],
    onError?: (err: Error) => void,
): Unsub {
  const q = query(clientCol(clientId, colName), ...constraints)
  return onSnapshot(
      q,
      snap => { setter(snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)) },
      onError ?? (() => {}),
  )
}

// ─── System-level: Clients ────────────────────────────────────────────────────

export interface ClientRecord {
  id: string
  name: string
  contactEmail: string
  createdAt: string
}

export function subscribeClients(setter: (clients: ClientRecord[]) => void): Unsub {
  return onSnapshot(collection(db, "clients"), snap => {
    setter(
        snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientRecord)
    )
  })
}

export async function addClient(data: Omit<ClientRecord, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "clients"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Write a user profile after Firebase Auth account is created.
 * Also writes /user_index/{uid} so fetchUserProfile can find the clientId.
 */
export async function createUserProfile(
    clientId: string,
    uid: string,
    data: Omit<User, "id" | "password">,
): Promise<void> {
  const batch = writeBatch(db)
  // User profile inside client tenant
  batch.set(clientDoc(clientId, "users", uid), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  // Global index so we can find their clientId on login
  batch.set(doc(db, "user_index", uid), { clientId })
  await batch.commit()
}

export function subscribeUsers(
    clientId: string,
    setter: (users: User[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<User>(clientId, "users", setter, [], onError)
}

export async function updateUserProfile(
    clientId: string,
    uid: string,
    data: Partial<Omit<User, "id" | "password">>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "users", uid), stripUndefined(data))
}

export async function deleteUserProfile(
    clientId: string,
    uid: string,
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(clientDoc(clientId, "users", uid))
  batch.delete(doc(db, "user_index", uid))
  await batch.commit()
}

// ─── Raw Materials ────────────────────────────────────────────────────────────

export function subscribeMaterials(
    clientId: string,
    setter: (materials: RawMaterial[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<RawMaterial>(
      clientId, "raw_materials", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addMaterial(
    clientId: string,
    data: Omit<RawMaterial, "id">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "raw_materials"), stripUndefined(data))
  return ref.id
}

export async function updateMaterial(
    clientId: string,
    id: string,
    data: Partial<RawMaterial>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "raw_materials", id), stripUndefined(data))
}

export function subscribeMaterialMasters(
    clientId: string,
    setter: (materials: RawMaterialMaster[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<RawMaterialMaster>(
      clientId, "material_masters", setter,
      [orderBy("material", "asc")],
      onError,
  )
}

export async function addMaterialMaster(clientId: string, data: RawMaterialMaster): Promise<void> {
  await setDoc(clientDoc(clientId, "material_masters", data.id), stripUndefined(data))
}

export async function deleteMaterialMaster(clientId: string, id: string): Promise<void> {
  await deleteDoc(clientDoc(clientId, "material_masters", id))
}

export function subscribePartMasters(
    clientId: string,
    setter: (parts: PartMaster[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<PartMaster>(
      clientId, "part_masters", setter,
      [orderBy("partName", "asc")],
      onError,
  )
}

export async function addPartMaster(clientId: string, data: PartMaster): Promise<void> {
  await setDoc(clientDoc(clientId, "part_masters", data.id), stripUndefined(data))
}

export async function deletePartMaster(clientId: string, id: string): Promise<void> {
  await deleteDoc(clientDoc(clientId, "part_masters", id))
}

/**
 * Atomically deduct `requiredKg` from a material's available stock.
 * Returns false without mutating if stock is insufficient.
 */
export async function deductMaterial(
    clientId: string,
    materialId: string,
    requiredKg: number,
): Promise<boolean> {
  const ref = clientDoc(clientId, "raw_materials", materialId)
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error("not-found")
      const mat = snap.data() as RawMaterial
      const available = mat.receivedQuantity - (mat.usedQuantity ?? 0)
      if (available < requiredKg) throw new Error("insufficient")
      tx.update(ref, { usedQuantity: (mat.usedQuantity ?? 0) + requiredKg })
    })
    return true
  } catch {
    return false
  }
}

/**
 * Record additional consumption (scrap + waste) after a production stage.
 */
export async function consumeMaterial(
    clientId: string,
    materialId: string,
    consumedKg: number,
): Promise<void> {
  if (!materialId || consumedKg <= 0) return
  const ref = clientDoc(clientId, "raw_materials", materialId)
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const mat = snap.data() as RawMaterial
    tx.update(ref, { usedQuantity: (mat.usedQuantity ?? 0) + consumedKg })
  })
}

export async function releaseMaterial(
    clientId: string,
    materialId: string,
    releasedKg: number,
): Promise<void> {
  if (!materialId || releasedKg <= 0) return
  const ref = clientDoc(clientId, "raw_materials", materialId)
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const mat = snap.data() as RawMaterial
    const current = mat.usedQuantity ?? 0
    tx.update(ref, { usedQuantity: Math.max(0, current - releasedKg) })
  })
}

// ─── Monthly Schedules ────────────────────────────────────────────────────────

export function subscribeSchedules(
    clientId: string,
    setter: (schedules: MonthlySchedule[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<MonthlySchedule>(
      clientId, "schedules", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addSchedule(
    clientId: string,
    data: Omit<MonthlySchedule, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "schedules"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

export async function updateSchedule(
    clientId: string,
    id: string,
    data: Partial<MonthlySchedule>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "schedules", id), stripUndefined(data))
}

export async function deleteSchedule(
    clientId: string,
    id: string,
): Promise<void> {
  await deleteDoc(clientDoc(clientId, "schedules", id))
}

// ─── PTCs ─────────────────────────────────────────────────────────────────────

export function subscribePTCs(
    clientId: string,
    setter: (ptcs: PTC[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<PTC>(
      clientId, "ptcs", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addPTC(
    clientId: string,
    data: Omit<PTC, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "ptcs"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

export async function deletePTC(
    clientId: string,
    id: string,
): Promise<void> {
  await deleteDoc(clientDoc(clientId, "ptcs", id))
}

// ─── Work Orders ──────────────────────────────────────────────────────────────

export function subscribeWorkOrders(
    clientId: string,
    setter: (workOrders: WorkOrder[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<WorkOrder>(
      clientId, "work_orders", setter,
      [orderBy("createdAt", "desc")],
      onError,
  )
}

export async function addWorkOrder(
    clientId: string,
    data: Omit<WorkOrder, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "work_orders"), stripUndefined({
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  }))
  return ref.id
}

export async function updateWorkOrder(
    clientId: string,
    id: string,
    data: Partial<WorkOrder>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "work_orders", id), stripUndefined(data))
}

export async function deleteWorkOrder(
    clientId: string,
    id: string,
): Promise<void> {
  await deleteDoc(clientDoc(clientId, "work_orders", id))
}

// ─── Daily Production Entries ─────────────────────────────────────────────────

export function subscribeDailyEntries(
    clientId: string,
    setter: (entries: DailyProductionEntry[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<DailyProductionEntry>(
      clientId, "daily_entries", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addDailyEntry(
    clientId: string,
    data: Omit<DailyProductionEntry, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "daily_entries"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

export async function updateDailyEntry(
    clientId: string,
    id: string,
    data: Partial<DailyProductionEntry>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "daily_entries", id), stripUndefined(data))
}

export async function deleteDailyEntry(
    clientId: string,
    id: string,
): Promise<void> {
  await deleteDoc(clientDoc(clientId, "daily_entries", id))
}

// ─── Process Records ──────────────────────────────────────────────────────────

export function subscribeProcessRecords(
    clientId: string,
    setter: (records: ProcessRecord[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<ProcessRecord>(
      clientId, "process_records", setter,
      [orderBy("createdAt", "desc")],
      onError,
  )
}

export async function addProcessRecord(
    clientId: string,
    data: Omit<ProcessRecord, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "process_records"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

export async function updateProcessRecord(
    clientId: string,
    id: string,
    data: Partial<ProcessRecord>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "process_records", id), stripUndefined(data))
}

// ─── Downtime Events ──────────────────────────────────────────────────────────

export function subscribeDowntimeEvents(
    clientId: string,
    setter: (events: DowntimeEvent[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<DowntimeEvent>(
      clientId, "downtime_events", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addDowntimeEvent(
    clientId: string,
    data: Omit<DowntimeEvent, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "downtime_events"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

// ─── QI Inspections ───────────────────────────────────────────────────────────

export function subscribeQIInspections(
    clientId: string,
    setter: (inspections: QIInspection[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<QIInspection>(
      clientId, "qi_inspections", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addQIInspection(
    clientId: string,
    data: Omit<QIInspection, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "qi_inspections"), stripUndefined({
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  }))
  return ref.id
}

// ─── FQI Inspections ──────────────────────────────────────────────────────────

export function subscribeFQIInspections(
    clientId: string,
    setter: (inspections: FQIInspection[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<FQIInspection>(
      clientId, "fqi_inspections", setter,
      [orderBy("date", "desc")],
      onError,
  )
}

export async function addFQIInspection(
    clientId: string,
    data: Omit<FQIInspection, "id" | "createdAt">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "fqi_inspections"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}


export function subscribeMachines(
    clientId: string,
    setter: (machines: MachineDef[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<MachineDef>(clientId, "machines", setter, [orderBy("name", "asc")], onError)
}

export async function seedDefaultMachines(clientId: string, defaults: MachineDef[]): Promise<void> {
  const existing = await getDocs(clientCol(clientId, "machines"))
  if (!existing.empty) return
  const batch = writeBatch(db)
  for (const machine of defaults) batch.set(clientDoc(clientId, "machines", machine.id), machine)
  await batch.commit()
}

export async function createMachineConfig(clientId: string, machine: MachineDef): Promise<void> {
  await setDoc(clientDoc(clientId, "machines", machine.id), stripUndefined(machine))
}

export async function updateMachineConfig(clientId: string, id: string, data: Partial<MachineDef>): Promise<void> {
  await updateDoc(clientDoc(clientId, "machines", id), stripUndefined(data))
}

export async function deleteMachineConfig(clientId: string, id: string): Promise<void> {
  await deleteDoc(clientDoc(clientId, "machines", id))
}

export function subscribeDevices(
    clientId: string,
    setter: (devices: DeviceConfig[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<DeviceConfig>(clientId, "devices", setter, [orderBy("deviceName", "asc")], onError)
}

export async function addDeviceConfig(clientId: string, device: DeviceConfig): Promise<void> {
  await setDoc(clientDoc(clientId, "devices", device.id), stripUndefined(device))
}

export async function updateDeviceConfig(clientId: string, id: string, data: Partial<DeviceConfig>): Promise<void> {
  await updateDoc(clientDoc(clientId, "devices", id), stripUndefined(data))
}

export async function deleteDeviceConfig(clientId: string, id: string): Promise<void> {
  await deleteDoc(clientDoc(clientId, "devices", id))
}

export function subscribeOperations(
    clientId: string,
    setter: (operations: OperationConfig[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<OperationConfig>(clientId, "operations", setter, [orderBy("operationId", "asc")], onError)
}

export async function addOperationConfig(clientId: string, operation: OperationConfig): Promise<void> {
  await setDoc(clientDoc(clientId, "operations", operation.id), stripUndefined(operation))
}

export async function deleteOperationConfig(clientId: string, id: string): Promise<void> {
  await deleteDoc(clientDoc(clientId, "operations", id))
}
// ─── Role Configs ─────────────────────────────────────────────────────────────
// Stored at clients/{clientId}/roles/{id}
// System roles use the UserRole enum value as the doc ID.
// Custom roles use auto-generated doc IDs.

export function subscribeRoles(
    clientId: string,
    setter: (roles: RoleConfig[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<RoleConfig>(clientId, "roles", setter, [], onError)
}

/**
 * Seed all default role configs for a new client.
 * Call this once during client setup.
 */
export async function seedDefaultRoles(
    clientId: string,
    defaults: RoleConfig[],
): Promise<void> {
  const batch = writeBatch(db)
  for (const role of defaults) {
    batch.set(clientDoc(clientId, "roles", role.id), role)
  }
  await batch.commit()
}

export async function addRoleConfig(
    clientId: string,
    data: Omit<RoleConfig, "id">,
): Promise<string> {
  const ref = await addDoc(clientCol(clientId, "roles"), data)
  return ref.id
}

export async function updateRoleConfig(
    clientId: string,
    id: string,
    data: Partial<RoleConfig>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "roles", id), stripUndefined(data))
}

/**
 * Delete a role config. Only allowed for non-system (custom) roles.
 * System roles should be deactivated via updateRoleConfig({ isActive: false }) instead.
 */
export async function deleteRoleConfig(
    clientId: string,
    id: string,
): Promise<void> {
  await deleteDoc(clientDoc(clientId, "roles", id))
}

// ─── Shift Configs ────────────────────────────────────────────────────────────

type ShiftValidationDraft = ShiftConfig | (Omit<ShiftConfig, "id"> & { id?: string })

function normalizeShiftConfig(raw: Record<string, unknown>, id: string): ShiftConfig {
  const legacyStart = typeof raw.breakStart === "string" ? raw.breakStart : "12:00"
  const legacyEnd = typeof raw.breakEnd === "string" ? raw.breakEnd : "12:15"
  const rawBreaks = raw.breaks
  const breaks = Array.isArray(rawBreaks)
    ? rawBreaks
    : [{ id: "break_1", startTime: legacyStart, endTime: legacyEnd, name: "Break 1" }]

  const firstBreak = breaks[0] as { startTime?: string; endTime?: string } | undefined
  return {
    ...raw,
    id,
    breaks: breaks as ShiftConfig["breaks"],
    breakStart: typeof raw.breakStart === "string" ? raw.breakStart : firstBreak?.startTime ?? "12:00",
    breakEnd: typeof raw.breakEnd === "string" ? raw.breakEnd : firstBreak?.endTime ?? "12:15",
  } as ShiftConfig
}

const DAY_MINUTES = 24 * 60
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseTimeToMinutes(value: string, label: string): number {
  const match = TIME_RE.exec(value)
  if (!match) throw new Error(`${label} must be in HH:mm 24-hour format.`)
  return Number(match[1]) * 60 + Number(match[2])
}

function orderedShifts<T extends ShiftValidationDraft>(shifts: T[]): T[] {
  return [...shifts].sort((a, b) => a.order - b.order || String(a.id ?? "").localeCompare(String(b.id ?? "")))
}

function shiftDurationMinutes(shift: ShiftValidationDraft): number {
  const start = parseTimeToMinutes(shift.startTime, `${shift.name} start time`)
  const end = parseTimeToMinutes(shift.endTime, `${shift.name} end time`)
  return (end - start + DAY_MINUTES) % DAY_MINUTES
}

function intervalOnShiftTimeline(
    startTime: string,
    endTime: string,
    parentStart: number,
    parentDuration: number,
    label: string,
): { start: number; end: number; duration: number; isOvernight: boolean } {
  const absoluteStart = parseTimeToMinutes(startTime, `${label} start time`)
  const absoluteEnd = parseTimeToMinutes(endTime, `${label} end time`)
  const isOvernight = absoluteEnd < absoluteStart
  let start = absoluteStart - parentStart
  if (start < 0) start += DAY_MINUTES
  const rawDuration = (absoluteEnd - absoluteStart + DAY_MINUTES) % DAY_MINUTES
  if (rawDuration === 0) throw new Error(`${label} start and end time cannot be the same.`)
  const end = start + rawDuration
  if (start > parentDuration || end > parentDuration) {
    throw new Error(`${label} must remain fully inside its parent shift window.`)
  }
  return { start, end, duration: rawDuration, isOvernight }
}

function validateBreaks(shift: ShiftValidationDraft): void {
  const parentStart = parseTimeToMinutes(shift.startTime, `${shift.name} start time`)
  parseTimeToMinutes(shift.endTime, `${shift.name} end time`)
  const parentDuration = shiftDurationMinutes(shift)
  if (parentDuration === 0) throw new Error(`${shift.name} duration cannot be 0.`)
  const parentSpansOvernight = shift.endTime < shift.startTime
  const intervals = (shift.breaks ?? []).map((shiftBreak, index) => {
    const label = `${shift.name} break ${shiftBreak.name || shiftBreak.id || index + 1}`
    const interval = intervalOnShiftTimeline(
        shiftBreak.startTime,
        shiftBreak.endTime,
        parentStart,
        parentDuration,
        label,
    )
    if (interval.isOvernight && !parentSpansOvernight) {
      throw new Error(`${label} can span overnight only when its parent shift spans overnight.`)
    }
    return interval
  }).sort((a, b) => a.start - b.start)

  const totalBreakMinutes = intervals.reduce((sum, interval) => sum + interval.duration, 0)
  if (totalBreakMinutes > parentDuration) {
    throw new Error(`${shift.name} total break duration cannot exceed shift duration.`)
  }

  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i - 1].end > intervals[i].start) {
      throw new Error(`${shift.name} breaks cannot overlap.`)
    }
  }
}

export function validateShiftConfigs(shifts: ShiftValidationDraft[]): void {
  const activeShifts = orderedShifts(shifts).filter(shift => shift.isActive)

  if (activeShifts.length === 0) {
    throw new Error("At least one active shift is required before confirming the shift schedule.")
  }

  let totalActiveMinutes = 0
  for (const shift of activeShifts) {
    validateBreaks(shift)
    const duration = shiftDurationMinutes(shift)
    if (duration === 0) throw new Error(`${shift.name} duration cannot be 0.`)
    totalActiveMinutes += duration
  }

  for (let i = 0; i < activeShifts.length; i += 1) {
    const current = activeShifts[i]
    const next = activeShifts[(i + 1) % activeShifts.length]
    if (current.endTime !== next.startTime) {
      throw new Error(`Active shifts must form a continuous 24-hour loop: ${current.name} must end at ${next.name}'s start time.`)
    }
  }

  if (totalActiveMinutes !== DAY_MINUTES) {
    throw new Error("Active shifts must cover exactly 24 hours with no gaps or overlaps.")
  }
}

async function getShiftConfigs(clientId: string): Promise<ShiftConfig[]> {
  const snap = await getDocs(query(clientCol(clientId, "shifts"), orderBy("order", "asc")))
  return snap.docs.map(d => normalizeShiftConfig(d.data(), d.id))
}

// Stored at clients/{clientId}/shifts/{id}. Seeded only when the collection is empty.

export function subscribeShifts(
    clientId: string,
    setter: (shifts: ShiftConfig[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  const q = query(clientCol(clientId, "shifts"), orderBy("order", "asc"))
  return onSnapshot(
      q,
      snap => {
        setter(snap.docs.map(d => normalizeShiftConfig(d.data(), d.id)))
      },
      err => { if (onError) onError(err as Error); else console.error(err) },
  )
}

/**
 * Seed default shift configs for a new client.
 * Call this only when clients/{clientId}/shifts is empty.
 */
export async function seedDefaultShifts(
    clientId: string,
    defaults: ShiftConfig[],
): Promise<void> {
  validateShiftConfigs(defaults)
  const existing = await getDocs(clientCol(clientId, "shifts"))
  if (!existing.empty) return

  const batch = writeBatch(db)
  for (const shift of orderedShifts(defaults)) {
    batch.set(clientDoc(clientId, "shifts", shift.id), shift)
  }
  await batch.commit()
}

export async function createShiftConfig(
    clientId: string,
    shift: ShiftConfig,
): Promise<void> {
  const shifts = await getShiftConfigs(clientId)
  if (shifts.some(existing => existing.id === shift.id)) {
    throw new Error(`Shift ${shift.id} already exists.`)
  }

  const normalizedShift = normalizeShiftConfig(shift as unknown as Record<string, unknown>, shift.id)
  validateBreaks(normalizedShift)

  await setDoc(clientDoc(clientId, "shifts", normalizedShift.id), normalizedShift)
}

export async function deleteShiftConfig(
    clientId: string,
    id: string,
): Promise<void> {
  const shifts = await getShiftConfigs(clientId)
  const shiftToDelete = shifts.find(shift => shift.id === id)
  if (!shiftToDelete) throw new Error(`Shift ${id} does not exist.`)

  await deleteDoc(clientDoc(clientId, "shifts", id))
}

export async function updateShiftConfig(
    clientId: string,
    id: string,
    data: Partial<ShiftConfig>,
): Promise<void> {
  const shifts = await getShiftConfigs(clientId)
  const nextShifts = shifts.map(shift => shift.id === id ? normalizeShiftConfig({ ...shift, ...data }, id) : shift)
  if (nextShifts.length === shifts.length && !shifts.some(shift => shift.id === id)) {
    throw new Error(`Shift ${id} does not exist.`)
  }
  const updatedShift = nextShifts.find(shift => shift.id === id)
  if (updatedShift) validateBreaks(updatedShift)
  await updateDoc(clientDoc(clientId, "shifts", id), stripUndefined(data))
}

export async function reorderShiftConfigs(
    clientId: string,
    orderedIds: string[],
): Promise<void> {
  const shifts = await getShiftConfigs(clientId)
  const ids = new Set(orderedIds)
  if (ids.size !== orderedIds.length) throw new Error("Shift reorder list contains duplicate shift IDs.")
  if (ids.size !== shifts.length || shifts.some(shift => !ids.has(shift.id))) {
    throw new Error("Shift reorder list must include every existing shift exactly once.")
  }

  const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]))
  const nextShifts = shifts.map(shift => ({ ...shift, order: orderById.get(shift.id) ?? shift.order }))

  const batch = writeBatch(db)
  for (const shift of nextShifts) {
    batch.update(clientDoc(clientId, "shifts", shift.id), { order: shift.order })
  }
  await batch.commit()
}

export async function confirmShiftConfigs(clientId: string): Promise<void> {
  const shifts = await getShiftConfigs(clientId)
  validateShiftConfigs(shifts)
}
