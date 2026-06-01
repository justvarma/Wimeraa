// ─── ROLES ────────────────────────────────────────────────────────────────────
export enum UserRole {
  SYSTEM_ADMIN      = "system_admin",     // Wimera-level: client management only
  ADMIN             = "admin",
  STOREKEEPER       = "storekeeper",
  PTC_MANAGER       = "ptc_manager",      // Master PTC: creates WO shells
  PTC_DIE_CASTING   = "ptc_die_casting",  // Fills DC operational details + logs production
  PTC_COATING       = "ptc_coating",      // Fills Coating details + logs
  PTC_CNC_VMC       = "ptc_cnc_vmc",      // Fills CNC/VMC details + logs
  QI_DIE_CASTING    = "qi_die_casting",   // QI scoped to Die Casting only
  QI_COATING        = "qi_coating",       // QI scoped to Coating only
  QI_MACHINING      = "qi_machining",     // QI scoped to CNC/VMC Machining only
  INVENTORY_QI      = "inventory_qi",     // QI scoped to Inventory approval only
  QUALITY_INSPECTOR = "quality_inspector",// Legacy single QI (kept for compat)
  FQI               = "fqi",
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SYSTEM_ADMIN]:      "System Admin (Wimera)",
  [UserRole.ADMIN]:             "Admin",
  [UserRole.STOREKEEPER]:       "Storekeeper",
  [UserRole.PTC_MANAGER]:       "PDC Manager",
  [UserRole.PTC_DIE_CASTING]:   "PDC – Die Casting",
  [UserRole.PTC_COATING]:       "PDC – Coating",
  [UserRole.PTC_CNC_VMC]:       "PDC – CNC/VMC",
  [UserRole.QI_DIE_CASTING]:    "QI – Die Casting",
  [UserRole.QI_COATING]:        "QI – Coating",
  [UserRole.QI_MACHINING]:      "QI – Machining",
  [UserRole.INVENTORY_QI]:      "Inventory QI",
  [UserRole.QUALITY_INSPECTOR]: "Quality Inspector",
  [UserRole.FQI]:               "Final Quality Inspector",
}

// All QI sub-roles (process-scoped)
export const QI_PROCESS_ROLES = [UserRole.QI_DIE_CASTING, UserRole.QI_COATING, UserRole.QI_MACHINING]

// Map QI role → process stage
export const QI_ROLE_PROCESS_MAP: Record<string, ProcessStage> = {
  [UserRole.QI_DIE_CASTING]: "die_casting",
  [UserRole.QI_COATING]:     "coating",
  [UserRole.QI_MACHINING]:   "cnc_vmc",
}

// All process-level PTC sub-roles
export const PROCESS_PTC_ROLES = [UserRole.PTC_DIE_CASTING, UserRole.PTC_COATING, UserRole.PTC_CNC_VMC]

export type ProcessStage = "die_casting" | "coating" | "cnc_vmc"

export const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  die_casting: "Die Casting",
  coating:     "Coating",
  cnc_vmc:     "CNC/VMC Machining",
}

export const PROCESS_OPERATION_LABELS: Record<ProcessStage, string> = {
  die_casting: "Molten Metal Casting",
  coating:     "Surface Treatment Application",
  cnc_vmc:     "Precision Machining Operation",
}

export const PROCESS_RULES: Record<ProcessStage, { scrap: boolean; description: string }> = {
  die_casting: { scrap: true,  description: "Scrap weight is calculated as Input Weight − Output Weight. All flash, waste metal and sprue are tracked." },
  coating:     { scrap: false, description: "Coating process does not generate machining scrap. Only material waste (chemical loss, overspray) is tracked." },
  cnc_vmc:     { scrap: true,  description: "Scrap weight is calculated as Input Weight − Output Weight. All machining chips and swarf are tracked." },
}

// Which PTC sub-role manages which process
export const PROCESS_PTC_ROLE_MAP: Record<ProcessStage, UserRole> = {
  die_casting: UserRole.PTC_DIE_CASTING,
  coating:     UserRole.PTC_COATING,
  cnc_vmc:     UserRole.PTC_CNC_VMC,
}

export type Shift = string

// ─── CONFIG TYPES (stored in Firestore, admin-configurable) ───────────────────

/**
 * ShiftConfig — Company Admin defines any number of ordered shifts per day with break windows.
 * Stored at: clients/{clientId}/shifts/{id}.
 */
export interface ShiftBreak {
  id: string
  startTime: string
  endTime: string
  name?: string
}

export interface ShiftConfig {
  id: string
  name: string
  startTime: string
  endTime: string
  breaks: ShiftBreak[]
  /** @deprecated legacy compatibility */
  breakStart?: string
  /** @deprecated legacy compatibility */
  breakEnd?: string
  startNextDay?: boolean
  endNextDay?: boolean
  order: number
  isActive: boolean
}

export const DEFAULT_SHIFT_CONFIGS: ShiftConfig[] = [
  {
    id: "default_morning",
    name: "Morning Shift",
    startTime: "06:00",
    endTime: "14:00",
    breaks: [{ id: "break_1", startTime: "10:00", endTime: "10:15", name: "Break 1" }],
    order: 1,
    isActive: true,
  },
  {
    id: "default_evening",
    name: "Evening Shift",
    startTime: "14:00",
    endTime: "06:00",
    breaks: [{ id: "break_1", startTime: "18:00", endTime: "18:15", name: "Break 1" }],
    order: 2,
    isActive: true,
  },
]

/**
 * RoleConfig — Company Admin defines roles available for user assignment.
 * Each config entry maps a custom display name to a system permission level (UserRole).
 * This allows renaming roles, adding additional named positions, or deactivating unused roles.
 * Stored at: clients/{clientId}/roles/{id}
 *
 * System roles (isSystem: true) are pre-seeded and cannot be hard-deleted — only deactivated.
 * Custom roles (isSystem: false) can be fully deleted.
 */
export interface RoleConfig {
  id: string              // doc ID; for system roles this equals the UserRole enum value
  name: string            // display label e.g. "Senior QI – Die Casting"
  permissionKey: string   // UserRole enum value that controls actual access
  description: string
  isSystem: boolean       // true = pre-seeded from enum, cannot delete
  isActive: boolean
}

export const DEFAULT_ROLE_CONFIGS: RoleConfig[] = [
  { id: UserRole.ADMIN,             name: "Admin",                       permissionKey: UserRole.ADMIN,             description: "Full access to all modules and configuration.",                     isSystem: true, isActive: true },
  { id: UserRole.STOREKEEPER,       name: "Storekeeper",                 permissionKey: UserRole.STOREKEEPER,       description: "Manages raw material inventory, add/edit/delete entries.",          isSystem: true, isActive: true },
  { id: UserRole.PTC_MANAGER,       name: "PDC Manager",                 permissionKey: UserRole.PTC_MANAGER,       description: "Creates Work Order shells, oversees all production tracking.",       isSystem: true, isActive: true },
  { id: UserRole.PTC_DIE_CASTING,   name: "PDC – Die Casting",           permissionKey: UserRole.PTC_DIE_CASTING,   description: "Fills Die Casting operational details and logs production.",         isSystem: true, isActive: true },
  { id: UserRole.PTC_COATING,       name: "PDC – Coating",               permissionKey: UserRole.PTC_COATING,       description: "Fills Coating process details and logs production.",                 isSystem: true, isActive: true },
  { id: UserRole.PTC_CNC_VMC,       name: "PDC – CNC/VMC",               permissionKey: UserRole.PTC_CNC_VMC,       description: "Fills CNC/VMC machining details and logs production.",              isSystem: true, isActive: true },
  { id: UserRole.QI_DIE_CASTING,    name: "QI – Die Casting",            permissionKey: UserRole.QI_DIE_CASTING,    description: "Quality Inspector scoped to Die Casting stage only.",               isSystem: true, isActive: true },
  { id: UserRole.QI_COATING,        name: "QI – Coating",                permissionKey: UserRole.QI_COATING,        description: "Quality Inspector scoped to Coating stage only.",                   isSystem: true, isActive: true },
  { id: UserRole.QI_MACHINING,      name: "QI – Machining",              permissionKey: UserRole.QI_MACHINING,      description: "Quality Inspector scoped to CNC/VMC Machining stage only.",         isSystem: true, isActive: true },
  { id: UserRole.INVENTORY_QI,      name: "Inventory QI",                permissionKey: UserRole.INVENTORY_QI,      description: "Approves or rejects raw material inventory entries.",                isSystem: true, isActive: true },
  { id: UserRole.QUALITY_INSPECTOR, name: "Quality Inspector",           permissionKey: UserRole.QUALITY_INSPECTOR, description: "Legacy full-scope Quality Inspector (all processes).",              isSystem: true, isActive: true },
  { id: UserRole.FQI,               name: "Final Quality Inspector",     permissionKey: UserRole.FQI,               description: "Performs final QI and disposition (finished goods / rework).",     isSystem: true, isActive: true },
]

// ─── ENTITY TYPES ─────────────────────────────────────────────────────────────

export interface User {
  id: string; name: string; email: string; password: string
  role: UserRole; plant?: string; department?: string; createdAt: string
}

export interface MachineDef {
  id: string; name: string; process: ProcessStage; type: string; status: "active"|"maintenance"|"inactive"
  operatorName?: string
}

export interface DeviceConfig {
  id: string
  custId: string
  plantId: string
  deviceId: string
  deviceName: string
  machineType: string
  gatewayId: string
  gatewayName: string
  licensing: "1m" | "3m" | "6m" | "1yr"
  gatewayType: "Edj10" | "Edj20"
  availabilityPostTime: string
  availabilityDutyCycle: string
  availabilityRunDuration: string
  interlock: "enable" | "disable"
  algorithm: string
  availabilityDepValues: string[]
  performancePostTime: string
  debounceTime: string
  partCountType: "digital" | "ai" | "other"
  otherPartCountType?: "OTH1" | "OTH2" | ""
  partCountPins: string[]
  performanceDepValues: string[]
  pinScanTime: string
  pinPostTime: string
  emicPostTime: string
  frequency: "50hz" | "60hz"
  phaseSequence: "1-1P2W" | "2-2P2W" | "3-3P3W" | "4-4P4W"
  emicConfigValues: string[]
  createdAt: string
}

export interface OperationConfig {
  id: string
  operationId: string
  processName: "Milling" | "Face Turning" | "Drilling" | "Boring" | "Chamfering" | "Tapping" | "Sloting" | "Back Facing" | "Groovine" | "Thredening"
  createdAt: string
}

export interface ProgramProcessConfig {
  operationId: string
  loadingSeconds: number
  runSeconds: number
  unloadingSeconds: number
  partsPerCycle: number
  totalCycles: number
  saved?: boolean
}

export interface ProgramMaster {
  id: string
  programId: string
  programName: string
  programType: "die_casting" | "coating" | "machining"
  weightPerPart: number
  pricePerPart: number
  processConfigs: ProgramProcessConfig[]
  createdAt: string
}

export interface RawMaterial {
  id: string; rawMaterialId: string; material: string; rawMaterialGrade: string
  receivedQuantity: number; usedQuantity: number; date: string
  receivedBy: string; approvedBy?: string | null; batchNumber: string
  numberOfRequiredComponents: number; weightPerComponent: number
  status: "pending"|"approved"|"rejected"; submittedById: string
  rejectedReason?: string | null; notes?: string
}

export interface RawMaterialMaster {
  id: string
  material: string
  grade: string
}

export interface PartMaster {
  id: string
  partId: string
  partName: string
  materialRequired: string
  grade: string
  bufferPercent: number
  weightAfterDieCastingKg: number
  weightAfterMachiningKg: number
}

export interface MonthlySchedule {
  id: string; serialNumber: number; partMasterId?: string; partId: string; partName: string
  requiredQuantity: number; requiredQuantityInKgs?: number; reservedQuantity?: number
  issuedQuantityKg?: number; balanceQuantity?: number; date: string; submittedById: string; createdAt: string
}

// PDC = Process Dispatch Code — created by Admin/PTC Manager, one per process+shift+date
export interface PTC {
  id: string; process: ProcessStage; shift: Shift; date: string
  createdBy: string; createdById: string; createdAt: string
}

export interface DailyProductionEntry {
  id: string; workOrderId: string; date: string; shift: Shift
  machine: string; operator: string; partId: string; partName: string
  requiredInputKg: number; requiredOutputNos: number; acceptancePoints: string
  isExternal: boolean; vendorId?: string; vendorName?: string
  createdBy: string; createdAt: string
}

// Work Order status flow:
//   "draft"       → created by PTC_MANAGER (missing process operational details)
//   "not_started" → process PTC has filled all details, ready to start
//   "in_progress" → at least one production record exists
//   "completed"   → target met
export type WOStatus = "draft" | "not_started" | "paused" | "in_progress" | "awaiting_qi" | "completed" | "rejected" | "finished_goods"

// ─── Phase 1 (New WO Architecture) ──────────────────────────────────────────
// NOTE: These types are introduced incrementally so UI/Firestore migration can
// happen in phases without breaking current WorkOrder flows.
export type WoLifecycleStatus =
  | "draft"
  | "scheduled"
  | "accepted"
  | "in_progress"
  | "qa_pending"
  | "qa_approved"
  | "rework"
  | "completed"
  | "closed"
  | "cancelled"
  | "paused"

export type ProcessWoType = "die_casting" | "trimming" | "shot_blasting" | "machining" | "packing"

export type ShortcomingCategory =
  | "machine_breakdown"
  | "material_shortage"
  | "operator_absent"
  | "power_failure"
  | "program_issue"
  | "tool_change"
  | "qa_hold"

export interface QtyLedger {
  plannedQty: number    // target from monthly schedule
  reservedQty: number   // allocated for WO
  consumedQty: number   // actually used in production
  producedQty: number   // output count
  balanceQty: number    // remaining reserved material/qty
}

export interface MainWorkOrderV2 {
  id: string
  woNumber: string
  scheduleId: string
  partMasterId: string
  partId: string
  partName: string
  scheduleStartDate: string
  scheduleEndDate: string
  status: WoLifecycleStatus
  qty: QtyLedger
  createdById: string
  createdByName: string
  createdAt: string
  updatedAt?: string
}

export interface ProcessWorkOrderV2 {
  id: string
  processWoNumber: string
  parentWoId: string
  rootWoId: string
  processType: ProcessWoType
  status: WoLifecycleStatus
  shiftDate: string
  shift: Shift | ""
  targetParts: number
  requiredQtyKg: number
  bufferPercent: number
  assignedQtyKg: number
  takenQtyKg: number
  leftoverQtyKg: number
  totalProduced?: number
  totalGood?: number
  totalRework?: number
  totalRejected?: number
  totalRawUsedKg?: number
  totalLeftoverKg?: number
  qiCompletedAt?: string
  qiCompletedBy?: string
  pdcApprovedAt?: string
  pdcApprovedBy?: string
  nextProcessWoId?: string
  shortcomingCategory?: ShortcomingCategory
  shortcomingNotes?: string
  createdAt: string
  updatedAt?: string
}

export interface WoMachineAssignmentV2 {
  id: string
  processWoId: string
  machineId: string
  machineName: string
  operatorId?: string
  operatorName: string
  shiftDate: string
  shift: Shift | ""
  programId?: string
  programName?: string
  partsCommitted: number
  producedQty: number
  partsProduced?: number
  rawMaterialUsedKg?: number
  leftoverKg?: number
  rejectedQty: number
  reworkQty: number
  goodParts?: number
  reworkParts?: number
  rejectedParts?: number
  reworkEntries?: ReworkEntry[]
  rejectionEntries?: RejectionEntry[]
  qiInspectedBy?: string
  qiInspectedById?: string
  qiInspectedAt?: string
  pdcApprovalStatus?: "pending" | "approved" | "rejected"
  pdcApprovedBy?: string
  pdcApprovedById?: string
  pdcApprovedAt?: string
  pdcRejectedBy?: string
  pdcRejectedById?: string
  pdcRejectedAt?: string
  pdcRejectedReason?: string
  runtimeMinutes?: number
  downtimeMinutes?: number
  shortcomingCategory?: ShortcomingCategory
  shortcomingNotes?: string
  operatorConfirmedBy?: string
  operatorConfirmedAt?: string
  actualsLocked?: boolean
  draftSavedAt?: string
  qaStatus?: "pending" | "approved" | "rework" | "rejected"
  createdAt: string
  updatedAt?: string
}

export interface WoAuditLog {
  id: string
  woId: string
  processWoId?: string
  action: string
  field?: string
  oldValue?: string
  newValue?: string
  actorId: string
  actorName: string
  createdAt: string
}

export interface ReworkTrace {
  id: string
  reworkWoId: string
  parentWoId: string
  sourceProcessWoId: string
  sourceMachineId: string
  sourceMachineName: string
  sourceOperatorName: string
  defectCategory: string
  reason: string
  quantity: number
  createdAt: string
}

export interface WorkOrder {
  id: string
  // Phase 1 — filled by PTC_MANAGER
  date: string
  masterId: string      // linked schedule entry ID
  partId: string
  partName: string
  process: ProcessStage
  targetPartNos: number        // required quantity (nos)
  requiredQuantityKg: number   // required weight (KG)
  workOrderStartDate: string
  dueDate: string
  // Phase 2 — filled by process PTC sub-role
  materialGrade: string
  rawMaterialId: string
  rawMaterialGrade: string
  shift: Shift | ""
  machine: string
  operator: string
  actualTarget: number
  partPerCycle: number
  weightPerPart: number
  actualOutputKg: number
  acceptancePoints: string
  cycleTimeMinutes?: number
  isExternal: boolean
  vendorId?: string
  vendorName?: string
  vendorProductionDate?: string
  vendorMachine?: string
  vendorShift?: Shift | ""
  assignedQiId?: string
  assignedQiName?: string
  // Progress
  partsCompleted: number; goodParts: number; reworkParts: number; rejectedParts: number
  scrapWeight: number; inputWeightKg: number
  // Status
  status: WOStatus
  productionStarted: boolean
  ptcId?: string
  ptcApproval?: string; qiApproval?: string
  createdAt: string; createdBy: string
  // Track who completed phase 2
  phase2CompletedBy?: string; phase2CompletedAt?: string
  // ─── SWO / Rework Traceability ─────────────────────────────────────────────
  // woType: "standard" = primary WO shell; "stage" = system-generated process SWO; "rework" = SWO spawned from QI/FQI rejection
  woType?: "standard" | "stage" | "rework" | "rejection"
  parentWoId?: string          // ID of the parent/root WO this SWO originated from
  rootWoId?: string            // stable root WO ID for the complete workflow chain
  workflowStep?: number        // zero-based position in the process sequence
  workflowLabel?: string       // human-readable process step label
  reworkCycleNumber?: number   // 1 = first rework loop, 2 = second, etc.
  originFqiId?: string         // ID of the FQIInspection record that triggered this SWO
  originQiId?: string          // ID of the QIInspection record that triggered the next/rework SWO
  reworkPartCount?: number     // how many parts are in this rework batch
  rejectionPartCount?: number  // how many parts are in this rejection/NCR batch
  // V2/extended operational metadata used by dashboard flows
  shiftDate?: string
  processWoId?: string
  programId?: string
  programName?: string
  notes?: string
  requiredQtyKg?: number
  bufferPercent?: number
  assignedQtyKg?: number
  takenQtyKg?: number
  leftoverQtyKg?: number
  additionalQtyKg?: number
  shortcomingCategory?: ShortcomingCategory
  machineProducedMap?: Record<string, number>
  machineProgramAssignment?: Record<string, { programId: string; programName: string }>
}

// ─── PROCESS RECORDS ─────────────────────────────────────────────────────────

export interface ReworkEntry    { reasonCode: string; quantity: number }
export interface RejectionEntry { reasonCode: string; quantity: number }
export type ProcessRecordStatus = "pre_check"|"in_production"|"post_check"|"qi_inspection"|"completed"

export interface ProcessRecord {
  id: string; workOrderId: string; process: ProcessStage
  date: string; shift: Shift
  machineName?: string
  inputAcceptanceChecked: boolean
  ptcApprovalGiven: boolean; ptcApprovedBy?: string
  isVendorProduction: boolean; vendorName?: string
  inputWeightKg: number
  outputQuantity: number; outputWeightKg: number
  qiInspectedBy?: string
  goodParts: number; reworkParts: number; reworkEntries: ReworkEntry[]
  rejectedParts: number; rejectionEntries: RejectionEntry[]
  scrapWeightKg: number; materialWasteKg: number
  status: ProcessRecordStatus
  createdBy: string; createdAt: string
}

export const REASON_CODES: Record<string, string[]> = {
  rework: [
    "Flash / Burr Removal",
    "Surface Finish Correction",
    "Minor Dimensional Correction",
    "Coating Adhesion Failure — Recoat",
    "Thread Re-tapping",
    "Weld / Seam Correction",
    "Other Rework",
  ],
  rejection: [
    "Cold Shut / Misrun",
    "Porosity / Blow Hole",
    "Dimension Out of Tolerance",
    "Surface Crack",
    "Coating Failure — Irreparable",
    "Material Defect",
    "Machine Error — Scrap",
    "Incomplete Fill (Short Shot)",
    "Other Rejection",
  ],
  downtime: [
    "DT-01 — Machine Breakdown",
    "DT-02 — Power Failure",
    "DT-03 — Material Shortage",
    "DT-04 — Tool Change / Setup",
    "DT-05 — Operator Absence",
    "DT-06 — Preventive Maintenance",
    "DT-07 — Quality Hold",
    "DT-08 — Other Downtime",
  ],
}

// ─── DOWNTIME EVENT ───────────────────────────────────────────────────────────

export interface DowntimeEvent {
  id: string
  workOrderId: string
  process: ProcessStage
  machineId: string
  machineName: string
  shift: Shift
  date: string
  startTime: string      // HH:MM
  endTime: string        // HH:MM
  durationMinutes: number
  reasonCode: string
  notes: string
  reportedBy: string
  createdAt: string
}

export const INITIAL_DOWNTIME_EVENTS: DowntimeEvent[] = [
  {
    id: "dt-001", workOrderId: "wo-001", process: "die_casting",
    machineId: "m-dc-01", machineName: "DC-01 — Cold Chamber Press (250T)",
    shift: DEFAULT_SHIFT_CONFIGS[0].id, date: "2026-04-15",
    startTime: "09:15", endTime: "10:00", durationMinutes: 45,
    reasonCode: "DT-01 — Machine Breakdown",
    notes: "Hydraulic seal failure on clamping unit. Replaced seal, production resumed.",
    reportedBy: "Kiran Raj", createdAt: "2026-04-15",
  },
]

// ─── MACHINES ─────────────────────────────────────────────────────────────────

export const DEFAULT_MACHINE_CONFIGS: MachineDef[] = [
  { id: "m-dc-01",  name: "DC-01 — Cold Chamber Press (250T)", process: "die_casting", type: "Cold Chamber Die Caster",  status: "active"      },
  { id: "m-dc-02",  name: "DC-02 — Cold Chamber Press (400T)", process: "die_casting", type: "Cold Chamber Die Caster",  status: "active"      },
  { id: "m-dc-03",  name: "DC-03 — Hot Chamber Press (150T)",  process: "die_casting", type: "Hot Chamber Die Caster",   status: "maintenance" },
  { id: "m-ct-01",  name: "CT-01 — Powder Coat Line A",        process: "coating",     type: "Powder Coating Line",      status: "active"      },
  { id: "m-ct-02",  name: "CT-02 — Powder Coat Line B",        process: "coating",     type: "Powder Coating Line",      status: "active"      },
  { id: "m-ct-03",  name: "CT-03 — E-Coat Tank",               process: "coating",     type: "E-Coat Tank",              status: "active"      },
  { id: "m-cnc-01", name: "CNC-01 — Turning Center (2-Axis)",  process: "cnc_vmc",     type: "CNC Turning Center",       status: "active"      },
  { id: "m-vmc-01", name: "VMC-01 — 3-Axis Milling Center",    process: "cnc_vmc",     type: "VMC Milling Center",       status: "active"      },
  { id: "m-vmc-02", name: "VMC-02 — 4-Axis Milling Center",    process: "cnc_vmc",     type: "VMC Milling Center",       status: "active"      },
  { id: "m-vmc-03", name: "VMC-03 — 5-Axis Precision Center",  process: "cnc_vmc",     type: "VMC Milling Center",       status: "maintenance" },
]

// ─── SEED DATA ────────────────────────────────────────────────────────────────

export const INITIAL_USERS: User[] = [
  { id:"u-000", name:"Vikram Menon",    email:"sysadmin@wimera.com",      password:"wimera123", role:UserRole.SYSTEM_ADMIN,      plant:"Wimera HQ", department:"Platform",   createdAt:"2025-01-01" },
  { id:"u-001", name:"Arun Sharma",    email:"admin@wimera.com",       password:"admin123",  role:UserRole.ADMIN,             plant:"Plant A", department:"Management", createdAt:"2026-01-01" },
  { id:"u-002", name:"Ravi Kumar",     email:"storekeeper@wimera.com", password:"store123",  role:UserRole.STOREKEEPER,       plant:"Plant A", department:"Stores",     createdAt:"2026-01-15" },
  { id:"u-003", name:"Suresh Babu",    email:"ptc@wimera.com",         password:"ptc123",    role:UserRole.PTC_MANAGER,       plant:"Plant A", department:"Production", createdAt:"2026-02-01" },
  { id:"u-004", name:"Kiran Raj",      email:"ptc.dc@wimera.com",      password:"ptcdc123",  role:UserRole.PTC_DIE_CASTING,   plant:"Plant A", department:"Die Casting",createdAt:"2026-02-05" },
  { id:"u-005", name:"Muthu Selvam",   email:"ptc.coat@wimera.com",    password:"ptcco123",  role:UserRole.PTC_COATING,       plant:"Plant A", department:"Coating",   createdAt:"2026-02-05" },
  { id:"u-006", name:"Arjun Das",      email:"ptc.cnc@wimera.com",     password:"ptccnc123", role:UserRole.PTC_CNC_VMC,       plant:"Plant A", department:"Machining", createdAt:"2026-02-05" },
  { id:"u-007", name:"Priya Nair",     email:"qi@wimera.com",          password:"qi1234",    role:UserRole.QUALITY_INSPECTOR, plant:"Plant A", department:"Quality",   createdAt:"2026-01-15" }, // password updated: qi123 → qi1234
  { id:"u-007a",name:"Lakshmi Raj",   email:"qi.dc@wimera.com",        password:"qidc123",   role:UserRole.QI_DIE_CASTING,    plant:"Plant A", department:"Die Casting QC", createdAt:"2026-02-10" },
  { id:"u-007b",name:"Anjali Menon",  email:"qi.coat@wimera.com",      password:"qico123",   role:UserRole.QI_COATING,        plant:"Plant A", department:"Coating QC",     createdAt:"2026-02-10" },
  { id:"u-007c",name:"Sunil Verma",   email:"qi.cnc@wimera.com",       password:"qicnc123",  role:UserRole.QI_MACHINING,      plant:"Plant A", department:"Machining QC",   createdAt:"2026-02-10" },
  { id:"u-008", name:"Meena Reddy",   email:"fqi@wimera.com",          password:"fqi123",    role:UserRole.FQI,               plant:"Plant A", department:"Quality",   createdAt:"2026-02-10" },
  { id:"u-009", name:"Deepa Pillai",  email:"inv.qi@wimera.com",       password:"invqi123",  role:UserRole.INVENTORY_QI,      plant:"Plant A", department:"Stores QC", createdAt:"2026-03-01" },
]

export const INITIAL_MATERIALS: RawMaterial[] = [
  { id:"rm-001", rawMaterialId:"RM-2026-001", material:"Aluminium", rawMaterialGrade:"A", receivedQuantity:500, usedQuantity:120, date:"2026-04-10", receivedBy:"Ravi Kumar", approvedBy:"Priya Nair", batchNumber:"BC-2026-001", numberOfRequiredComponents:400, weightPerComponent:1.2, status:"approved", submittedById:"u-002", notes:"ADC-12 Aluminium alloy, high quality grade A" },
  { id:"rm-002", rawMaterialId:"RM-2026-002", material:"Aluminium", rawMaterialGrade:"B", receivedQuantity:200, usedQuantity:0,   date:"2026-04-15", receivedBy:"Ravi Kumar", approvedBy:"Priya Nair", batchNumber:"BC-2026-002", numberOfRequiredComponents:150, weightPerComponent:1.3, status:"approved", submittedById:"u-002" },
  { id:"rm-003", rawMaterialId:"RM-2026-003", material:"Copper", rawMaterialGrade:"A", receivedQuantity:300, usedQuantity:0,   date:"2026-04-18", receivedBy:"Ravi Kumar", batchNumber:"BC-2026-003", numberOfRequiredComponents:240, weightPerComponent:1.2, status:"pending",  submittedById:"u-002" },
  { id:"rm-004", rawMaterialId:"RM-2026-004", material:"Tin", rawMaterialGrade:"C", receivedQuantity:150, usedQuantity:0,   date:"2026-04-20", receivedBy:"Ravi Kumar", batchNumber:"BC-2026-004", numberOfRequiredComponents:100, weightPerComponent:1.5, status:"rejected", submittedById:"u-002", rejectedReason:"Grade mismatch — received C instead of B" },
]

export const INITIAL_SCHEDULES: MonthlySchedule[] = [
  { id:"sch-001", serialNumber:1, partId:"RE-PT-0021", partName:"Cylinder Head Cover — RE Meteor 350",  requiredQuantity:400, date:"2026-04-01", submittedById:"u-001", createdAt:"2026-04-01" },
  { id:"sch-002", serialNumber:2, partId:"RE-PT-0035", partName:"Crankcase Left — RE Classic 350",      requiredQuantity:250, date:"2026-04-01", submittedById:"u-001", createdAt:"2026-04-01" },
  { id:"sch-003", serialNumber:3, partId:"RE-PT-0047", partName:"Gear Box Housing — RE Himalayan 450",  requiredQuantity:180, date:"2026-04-01", submittedById:"u-001", createdAt:"2026-04-01" },
  { id:"sch-004", serialNumber:4, partId:"RE-PT-0062", partName:"Engine Mount Bracket — RE Hunter 350", requiredQuantity:320, date:"2026-04-01", submittedById:"u-001", createdAt:"2026-04-01" },
]

export const INITIAL_PART_MASTERS: PartMaster[] = [
  { id: "re-pt-0062__default", partId: "RE-PT-0062", partName: "Engine Mount Bracket", materialRequired: "Aluminium", grade: "A", bufferPercent: 2, weightAfterDieCastingKg: 1, weightAfterMachiningKg: 0.92 },
  { id: "re-pt-0047__default", partId: "RE-PT-0047", partName: "Gear Box Housing", materialRequired: "Aluminium", grade: "A", bufferPercent: 2, weightAfterDieCastingKg: 1, weightAfterMachiningKg: 0.9 },
  { id: "re-pt-0035__default", partId: "RE-PT-0035", partName: "Crankcase Left", materialRequired: "Aluminium", grade: "A", bufferPercent: 2, weightAfterDieCastingKg: 1, weightAfterMachiningKg: 0.9 },
  { id: "re-pt-0021__default", partId: "RE-PT-0021", partName: "Cylinder Head Cover", materialRequired: "Aluminium", grade: "A", bufferPercent: 2, weightAfterDieCastingKg: 1, weightAfterMachiningKg: 0.9 },
]

export const INITIAL_PTCS: PTC[] = [
  { id:"ptc-001", process:"die_casting", shift:DEFAULT_SHIFT_CONFIGS[0].id, date:"2026-04-15", createdBy:"Suresh Babu", createdById:"u-003", createdAt:"2026-04-15" },
  { id:"ptc-002", process:"coating",     shift:DEFAULT_SHIFT_CONFIGS[1].id, date:"2026-04-20", createdBy:"Suresh Babu", createdById:"u-003", createdAt:"2026-04-20" },
  { id:"ptc-003", process:"cnc_vmc",     shift:DEFAULT_SHIFT_CONFIGS[0].id, date:"2026-04-01", createdBy:"Suresh Babu", createdById:"u-003", createdAt:"2026-04-01" },
]

export const INITIAL_WORK_ORDERS: WorkOrder[] = [
  {
    id:"wo-001", date:"2026-04-15", masterId:"sch-001", partId:"RE-PT-0021",
    partName:"Cylinder Head Cover — RE Meteor 350", process:"die_casting",
    targetPartNos:100, requiredQuantityKg:120, workOrderStartDate:"2026-04-15", dueDate:"2026-05-10",
    // Phase 2 filled
    materialGrade:"A", rawMaterialId:"rm-001", rawMaterialGrade:"A",
    shift:DEFAULT_SHIFT_CONFIGS[0].id, machine:"DC-01 — Cold Chamber Press (250T)", operator:"Kiran Raj",
    actualTarget:100, partPerCycle:2, weightPerPart:1.2, actualOutputKg:120,
    acceptancePoints:"Visual inspection, dimensional check ±0.2mm, no cold shut, no porosity",
    cycleTimeMinutes:4, isExternal:false,
    partsCompleted:95, goodParts:88, reworkParts:5, rejectedParts:2, scrapWeight:12.5, inputWeightKg:120,
    status:"in_progress", productionStarted:true, ptcId:"ptc-001",
    ptcApproval:"Suresh Babu", phase2CompletedBy:"Kiran Raj", phase2CompletedAt:"2026-04-15",
    createdAt:"2026-04-15", createdBy:"Suresh Babu",
  },
  {
    id:"wo-002", date:"2026-04-20", masterId:"sch-002", partId:"RE-PT-0035",
    partName:"Crankcase Left — RE Classic 350", process:"coating",
    targetPartNos:50, requiredQuantityKg:65, workOrderStartDate:"2026-04-20", dueDate:"2026-05-20",
    // Phase 2 filled
    materialGrade:"B", rawMaterialId:"rm-002", rawMaterialGrade:"B",
    shift:DEFAULT_SHIFT_CONFIGS[1].id, machine:"CT-02 — Powder Coat Line B", operator:"Muthu Selvam",
    actualTarget:50, partPerCycle:1, weightPerPart:1.3, actualOutputKg:65,
    acceptancePoints:"Coating thickness 80–100 microns, adhesion test cross-cut class 0-1",
    cycleTimeMinutes:6, isExternal:false,
    partsCompleted:0, goodParts:0, reworkParts:0, rejectedParts:0, scrapWeight:0, inputWeightKg:65,
    status:"not_started", productionStarted:false, ptcId:"ptc-002",
    phase2CompletedBy:"Muthu Selvam", phase2CompletedAt:"2026-04-20",
    createdAt:"2026-04-20", createdBy:"Suresh Babu",
  },
  {
    id:"wo-003", date:"2026-04-01", masterId:"sch-003", partId:"RE-PT-0047",
    partName:"Gear Box Housing — RE Himalayan 450", process:"cnc_vmc",
    targetPartNos:30, requiredQuantityKg:39, workOrderStartDate:"2026-04-01", dueDate:"2026-04-25",
    // Phase 2 filled
    materialGrade:"A", rawMaterialId:"rm-001", rawMaterialGrade:"A",
    shift:DEFAULT_SHIFT_CONFIGS[0].id, machine:"VMC-03 — 5-Axis Precision Center", operator:"Arjun Das",
    actualTarget:30, partPerCycle:1, weightPerPart:1.3, actualOutputKg:39,
    acceptancePoints:"Surface finish Ra 1.6, dimensional ±0.05mm, thread M12×1.75 6H",
    cycleTimeMinutes:12, isExternal:true, vendorId:"VND-001", vendorName:"Precision Parts Ltd",
    partsCompleted:30, goodParts:28, reworkParts:1, rejectedParts:1, scrapWeight:3.2, inputWeightKg:39,
    status:"completed", productionStarted:true, ptcId:"ptc-003",
    ptcApproval:"Suresh Babu", qiApproval:"Priya Nair",
    phase2CompletedBy:"Arjun Das", phase2CompletedAt:"2026-04-01",
    createdAt:"2026-04-01", createdBy:"Suresh Babu",
  },
  {
    // Draft WO — only Phase 1 filled by PTC Manager, awaiting process PTC details
    id:"wo-004", date:"2026-04-27", masterId:"sch-004", partId:"RE-PT-0062",
    partName:"Engine Mount Bracket — RE Hunter 350", process:"die_casting",
    targetPartNos:80, requiredQuantityKg:96, workOrderStartDate:"2026-04-28", dueDate:"2026-05-15",
    // Phase 2 NOT filled yet
    materialGrade:"", rawMaterialId:"", rawMaterialGrade:"",
    shift:"" as Shift | "", machine:"", operator:"",
    actualTarget:0, partPerCycle:0, weightPerPart:0, actualOutputKg:0,
    acceptancePoints:"", isExternal:false,
    partsCompleted:0, goodParts:0, reworkParts:0, rejectedParts:0, scrapWeight:0, inputWeightKg:0,
    status:"draft", productionStarted:false,
    createdAt:"2026-04-27", createdBy:"Suresh Babu",
  },
]

export const INITIAL_DAILY_ENTRIES: DailyProductionEntry[] = [
  { id:"dpe-001", workOrderId:"wo-001", date:"2026-04-15", shift:DEFAULT_SHIFT_CONFIGS[0].id, machine:"DC-01 — Cold Chamber Press (250T)", operator:"Kiran Raj", partId:"RE-PT-0021", partName:"Cylinder Head Cover — RE Meteor 350", requiredInputKg:60, requiredOutputNos:50, acceptancePoints:"Visual inspection, dimensional check ±0.2mm", isExternal:false, createdBy:"Kiran Raj", createdAt:"2026-04-15" },
  { id:"dpe-002", workOrderId:"wo-001", date:"2026-04-16", shift:DEFAULT_SHIFT_CONFIGS[0].id, machine:"DC-01 — Cold Chamber Press (250T)", operator:"Kiran Raj", partId:"RE-PT-0021", partName:"Cylinder Head Cover — RE Meteor 350", requiredInputKg:60, requiredOutputNos:50, acceptancePoints:"Visual inspection, dimensional check ±0.2mm", isExternal:false, createdBy:"Kiran Raj", createdAt:"2026-04-16" },
]

export const INITIAL_PROCESS_RECORDS: ProcessRecord[] = [
  {
    id:"pr-001", workOrderId:"wo-001", process:"die_casting", date:"2026-04-15", shift:DEFAULT_SHIFT_CONFIGS[0].id,
    inputAcceptanceChecked:true, ptcApprovalGiven:true, ptcApprovedBy:"Suresh Babu",
    isVendorProduction:false,
    inputWeightKg:120, outputQuantity:95, outputWeightKg:108.5,
    qiInspectedBy:"Priya Nair",
    goodParts:88, reworkParts:5, reworkEntries:[{reasonCode:"Flash / Burr Removal",quantity:3},{reasonCode:"Minor Dimensional Correction",quantity:2}],
    rejectedParts:2, rejectionEntries:[{reasonCode:"Porosity / Blow Hole",quantity:2}],
    scrapWeightKg:11.5, materialWasteKg:2.0, status:"completed",
    createdBy:"Kiran Raj", createdAt:"2026-04-15",
  },
  {
    id:"pr-002", workOrderId:"wo-003", process:"cnc_vmc", date:"2026-04-01", shift:DEFAULT_SHIFT_CONFIGS[0].id,
    inputAcceptanceChecked:true, ptcApprovalGiven:true, ptcApprovedBy:"Suresh Babu",
    isVendorProduction:true, vendorName:"Precision Parts Ltd",
    inputWeightKg:39, outputQuantity:30, outputWeightKg:35.8,
    qiInspectedBy:"Priya Nair",
    goodParts:28, reworkParts:1, reworkEntries:[{reasonCode:"Surface Finish Correction",quantity:1}],
    rejectedParts:1, rejectionEntries:[{reasonCode:"Dimension Out of Tolerance",quantity:1}],
    scrapWeightKg:3.2, materialWasteKg:0.5, status:"completed",
    createdBy:"Arjun Das", createdAt:"2026-04-01",
  },
]

// ─── QUALITY INSPECTION ───────────────────────────────────────────────────────

export interface QIInspection {
  id: string
  process: ProcessStage
  date: string
  masterId: string       // linked schedule/work order master ID
  partId: string
  partName: string
  shift: Shift
  machine: string
  producedPartCount: number
  goodPartCount: number
  reworkCount: number
  reworkEntries: ReworkEntry[]
  rejectedCount: number
  rejectionEntries: RejectionEntry[]
  inspectedBy: string
  inspectedById: string
  workOrderId: string
  operator?: string
  isExternal?: boolean
  vendorName?: string
  vendorProductionDate?: string
  vendorMachine?: string
  vendorShift?: Shift | ""
  assignedQiId?: string
  processWoId?: string
  machineAssignmentId?: string
  machineId?: string
  createdAt: string
}

export const INITIAL_QI_INSPECTIONS: QIInspection[] = [
  {
    id: "qi-001",
    process: "die_casting",
    date: "2026-04-15",
    masterId: "sch-001",
    partId: "RE-PT-0021",
    partName: "Cylinder Head Cover — RE Meteor 350",
    shift: DEFAULT_SHIFT_CONFIGS[0].id,
    machine: "DC-01 — Cold Chamber Press (250T)",
    producedPartCount: 95,
    goodPartCount: 88,
    reworkCount: 5,
    reworkEntries: [
      { reasonCode: "Flash / Burr Removal", quantity: 3 },
      { reasonCode: "Minor Dimensional Correction", quantity: 2 },
    ],
    rejectedCount: 2,
    rejectionEntries: [{ reasonCode: "Porosity / Blow Hole", quantity: 2 }],
    inspectedBy: "Priya Nair",
    inspectedById: "u-007",
    workOrderId: "wo-001",
    createdAt: "2026-04-15",
  },
]

// ─── FINAL QUALITY INSPECTION ─────────────────────────────────────────────────

export type FQIDisposition = "finished_goods" | "rework_loop" | "rejected"

export const FQI_DISPOSITION_LABELS: Record<FQIDisposition, string> = {
  finished_goods: "Finished Goods — Released to Dispatch",
  rework_loop:    "Rework Loop — Sent Back for Correction",
  rejected:       "Rejected — Returned to Inventory",
}

export interface FQIInspection {
  id: string
  date: string
  masterId: string
  partId: string
  partName: string
  shift: Shift
  machine: string
  process: ProcessStage          // which process stage this batch came from
  workOrderId: string
  producedPartCount: number
  goodPartCount: number
  reworkCount: number
  reworkEntries: ReworkEntry[]
  rejectedCount: number
  rejectionEntries: RejectionEntry[]
  inputWeightKg: number          // entered by FQI
  outputWeightKg: number         // entered by FQI
  scrapWeightKg: number          // auto-calc: input - output
  disposition: FQIDisposition
  finishedGoodsCount: number     // good parts released
  reworkLoopCount: number        // rework parts returned
  rejectedReturnCount: number    // rejected returned to inventory
  inspectedBy: string
  inspectedById: string
  notes: string
  createdAt: string
}

export const INITIAL_FQI_INSPECTIONS: FQIInspection[] = [
  {
    id: "fqi-001",
    date: "2026-04-16",
    masterId: "sch-001",
    partId: "RE-PT-0021",
    partName: "Cylinder Head Cover — RE Meteor 350",
    shift: DEFAULT_SHIFT_CONFIGS[0].id,
    machine: "DC-01 — Cold Chamber Press (250T)",
    process: "die_casting",
    workOrderId: "wo-001",
    producedPartCount: 88,
    goodPartCount: 85,
    reworkCount: 2,
    reworkEntries: [{ reasonCode: "Surface Finish Correction", quantity: 2 }],
    rejectedCount: 1,
    rejectionEntries: [{ reasonCode: "Material Defect", quantity: 1 }],
    inputWeightKg: 108.5,
    outputWeightKg: 103.2,
    scrapWeightKg: 5.3,
    disposition: "finished_goods",
    finishedGoodsCount: 85,
    reworkLoopCount: 2,
    rejectedReturnCount: 1,
    inspectedBy: "Meena Reddy",
    inspectedById: "u-008",
    notes: "Batch passed final inspection. 2 parts sent back for surface correction.",
    createdAt: "2026-04-16",
  },
]