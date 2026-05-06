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
 *     shifts/{id}         ← ShiftConfig — admin-managed shift definitions (shift_1, shift_2)
 *
 * Every listener returns an unsubscribe function — call it in useEffect cleanup.
 */

import {
  collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp,
  query, where, orderBy,
  writeBatch,
  runTransaction,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./firebase"
import type {
  User, RawMaterial, MonthlySchedule, PTC,
  WorkOrder, DailyProductionEntry, ProcessRecord,
  DowntimeEvent, QIInspection, FQIInspection,
  ShiftConfig, RoleConfig,
} from "./store"

// ─── Path helpers ─────────────────────────────────────────────────────────────

const clientCol = (clientId: string, col: string) =>
    collection(db, "clients", clientId, col)

const clientDoc = (clientId: string, col: string, id: string) =>
    doc(db, "clients", clientId, col, id)

// ─── Generic helpers ──────────────────────────────────────────────────────────

type Unsub = () => void

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
  await updateDoc(clientDoc(clientId, "users", uid), data)
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
  const ref = await addDoc(clientCol(clientId, "raw_materials"), data)
  return ref.id
}

export async function updateMaterial(
    clientId: string,
    id: string,
    data: Partial<RawMaterial>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "raw_materials", id), data)
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
  await updateDoc(clientDoc(clientId, "schedules", id), data)
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
  const ref = await addDoc(clientCol(clientId, "work_orders"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
  return ref.id
}

export async function updateWorkOrder(
    clientId: string,
    id: string,
    data: Partial<WorkOrder>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "work_orders", id), data)
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
  await updateDoc(clientDoc(clientId, "daily_entries", id), data)
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
  await updateDoc(clientDoc(clientId, "process_records", id), data)
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
  const ref = await addDoc(clientCol(clientId, "qi_inspections"), {
    ...data,
    createdAt: new Date().toISOString().split("T")[0],
  })
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
  await updateDoc(clientDoc(clientId, "roles", id), data)
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
// Stored at clients/{clientId}/shifts/{id}
// Exactly 2 shifts: doc IDs "shift_1" and "shift_2".
// Seeded with DEFAULT_SHIFT_CONFIGS on client setup.

export function subscribeShifts(
    clientId: string,
    setter: (shifts: ShiftConfig[]) => void,
    onError?: (err: Error) => void,
): Unsub {
  return subscribeCol<ShiftConfig>(
      clientId, "shifts", setter,
      [orderBy("order", "asc")],
      onError,
  )
}

/**
 * Seed default shift configs for a new client.
 * Call this once during client setup.
 */
export async function seedDefaultShifts(
    clientId: string,
    defaults: ShiftConfig[],
): Promise<void> {
  const batch = writeBatch(db)
  for (const shift of defaults) {
    batch.set(clientDoc(clientId, "shifts", shift.id), shift)
  }
  await batch.commit()
}

/**
 * Update a shift config. Use doc IDs "shift_1" or "shift_2".
 */
export async function updateShiftConfig(
    clientId: string,
    id: string,
    data: Partial<ShiftConfig>,
): Promise<void> {
  await updateDoc(clientDoc(clientId, "shifts", id), data)
}