"use client"
/**
 * ShiftProductionEntry.tsx  (patched)
 *
 * Changes vs original:
 * 1. Program is selected PER MACHINE (not at PWO level).
 * 2. Shift actuals can only be filled on or after the shift date.
 * 3. Per-machine form is simplified: parts produced + shortage explanation
 *    + raw material used/leftover (good/rework/rejected are QI's job).
 * 4. All actuals (partsProduced, rawMaterialUsedKg, leftoverKg,
 *    downtimeMinutes, shortcomingCategory, shortcomingNotes, programId,
 *    programName, operatorConfirmedBy) are written to DB on save.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  CheckCircle2, ChevronDown, ChevronRight,
  RefreshCw, Settings2, Package, Zap, User, Calendar,
  Save, Loader2, Info, Lock, XCircle,
} from "lucide-react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, PROCESS_STAGE_LABELS,
  type ProcessStage, type Shift,
} from "@/lib/store"

import { getNextProcess } from "@/lib/workflow"
import { db } from "@/lib/firebase"
import {
  collection, query, where, getDocs, updateDoc, addDoc,
  doc, serverTimestamp, setDoc,
} from "firebase/firestore"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MachineAssignment = {
  id: string
  processWoId: string
  machineId: string
  machineName: string
  operatorName: string
  shiftDate: string
  shift: Shift | string
  programId: string
  programName: string
  partsCommitted: number
  producedQty: number
  partsProduced?: number
  goodParts?: number
  reworkParts?: number
  rejectedParts?: number
  rawMaterialUsedKg: number
  leftoverKg: number
  downtimeMinutes: number
  shortcomingCategory: string
  shortcomingNotes: string
  operatorConfirmedBy: string
  operatorConfirmedAt: string
  actualsLocked: boolean
  draftSavedAt?: string
  qiInspectedAt?: string
  qiInspectedBy?: string
  qaStatus?: "pending" | "approved" | "rework" | "rejected"
  pdcApprovalStatus?: "pending" | "approved" | "rejected"
  pdcRejectedReason?: string
}

export type ProcessWOV2 = {
  id: string
  processWoNumber: string
  parentWoId: string
  rootWoId: string
  processType: ProcessStage | string
  status: string
  shiftDate: string
  shift: Shift | string
  targetParts: number
  requiredQtyKg: number
  bufferPercent: number
  assignedQtyKg: number
  takenQtyKg: number
  leftoverQtyKg: number
  shortcomingCategory: string
  shortcomingNotes: string
  totalProduced?: number
  totalGood?: number
  totalRework?: number
  totalRejected?: number
  totalRawUsedKg?: number
  totalLeftoverKg?: number
  actualsSubmittedAt?: string
  actualsSubmittedBy?: string
  pdcApprovedAt?: string
  pdcApprovedBy?: string
  nextProcessWoId?: string
}

// ─── Styling ──────────────────────────────────────────────────────────────────

const cls   = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white"
const roCls = "w-full border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 bg-slate-50 cursor-not-allowed"
const lbl   = "block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1"

function Field({ label, req, hint, children }: {
  label: string; req?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className={lbl}>{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1 leading-tight">{hint}</p>}
    </div>
  )
}

const getProducedCount = (assignment: Pick<MachineAssignment, "partsProduced" | "producedQty">) =>
  Number(assignment.partsProduced ?? assignment.producedQty ?? 0)

const getRemainingParts = (assignment: Pick<MachineAssignment, "partsCommitted" | "partsProduced" | "producedQty">) =>
  Math.max(0, Number(assignment.partsCommitted || 0) - getProducedCount(assignment))

const isAssignmentComplete = (assignment: Pick<MachineAssignment, "partsCommitted" | "partsProduced" | "producedQty">) =>
  getRemainingParts(assignment) === 0

// ─── Data hook ────────────────────────────────────────────────────────────────

function useShiftData(clientId: string, processType: ProcessStage | null) {
  const [pwos,        setPwos]        = useState<ProcessWOV2[]>([])
  const [assignments, setAssignments] = useState<MachineAssignment[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!clientId || !processType) return
    setLoading(true); setError(null)
    try {
      const pwoSnap = await getDocs(
        query(
          collection(db, "clients", clientId, "process_work_orders_v2"),
          where("processType", "==", processType)
        )
      )
      const pwoList: ProcessWOV2[] = pwoSnap.docs.map(d => ({
        id: d.id, ...(d.data() as Omit<ProcessWOV2, "id">)
      }))
      setPwos(pwoList)

      if (pwoList.length === 0) { setAssignments([]); return }
      const pwoIds = pwoList.map(p => p.id)
      const chunks: string[][] = []
      for (let i = 0; i < pwoIds.length; i += 30) chunks.push(pwoIds.slice(i, i + 30))

      const allAssignments: MachineAssignment[] = []
      for (const chunk of chunks) {
        const aSnap = await getDocs(
          query(
            collection(db, "clients", clientId, "wo_machine_assignments_v2"),
            where("processWoId", "in", chunk)
          )
        )
        aSnap.docs.forEach(d => allAssignments.push({ id: d.id, ...(d.data() as Omit<MachineAssignment, "id">) }))
      }
      setAssignments(allAssignments)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [clientId, processType])

  useEffect(() => {
    queueMicrotask(() => { void reload() })
  }, [reload])
  return { pwos, assignments, loading, error, reload }
}

// ─── Per-machine row state ────────────────────────────────────────────────────

type MachineRowEdit = {
  partsProduced: number
  rawMaterialUsedKg: number
  downtimeMinutes: number
  shortcomingCategory: string
  shortcomingNotes: string
  operatorConfirmedBy: string
  /** per-machine program selection */
  programId: string
  programName: string
}

// ─── Machine Row ──────────────────────────────────────────────────────────────

function MachineRow({
  assignment,
  perMachineAssignedKg,
  edit,
  onChange,
  isLocked,
  isFuture,
}: {
  assignment: MachineAssignment
  perMachineAssignedKg: number
  edit: MachineRowEdit
  onChange: (data: Partial<MachineRowEdit>) => void
  isLocked: boolean
  isFuture: boolean
}) {
  const [open, setOpen] = useState(!isLocked)
  const isOpen = open && !isLocked

  const savedProduced = getProducedCount(assignment)
  const remainingParts = Math.max(0, assignment.partsCommitted - edit.partsProduced)
  const hasSavedShortfall = assignment.actualsLocked && savedProduced > 0 && savedProduced < assignment.partsCommitted
  const used      = edit.rawMaterialUsedKg ?? 0
  const leftover  = Number((perMachineAssignedKg - used).toFixed(3))
  const overUsed  = used > perMachineAssignedKg

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all
      ${isLocked  ? "border-emerald-200 bg-emerald-50/20" :
        isFuture  ? "border-slate-200 bg-slate-50/40 opacity-60" :
                    "border-indigo-200 bg-white"}`}>

      {/* Header */}
      <button
        type="button"
        onClick={() => !isFuture && setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
        disabled={isFuture}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black
          ${isLocked  ? "bg-emerald-500 text-white" :
            isFuture  ? "bg-slate-300 text-white" :
                        "bg-indigo-600 text-white"}`}>
          {isLocked ? <CheckCircle2 size={16}/> : isFuture ? <Lock size={14}/> : <Settings2 size={15}/>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm">{assignment.machineName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Op: <span className="font-semibold text-slate-600">{assignment.operatorName || "Unassigned"}</span>
            · Committed: <span className="font-semibold">{assignment.partsCommitted} parts</span>
            · Shift: <span className="font-semibold">{assignment.shiftDate} / {assignment.shift}</span>
            {hasSavedShortfall && <span className="ml-2 text-amber-600 font-bold">· {assignment.partsCommitted - savedProduced} parts still pending</span>}
            {isFuture && <span className="ml-2 text-amber-600 font-bold">· Can only fill on/after shift date</span>}
          </p>
        </div>
        {isOpen ? <ChevronDown size={15} className="text-slate-400 shrink-0"/> : <ChevronRight size={15} className="text-slate-400 shrink-0"/>}
      </button>

      {isOpen && !isFuture && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100">

          {/* Program view — read-only */}
          <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-2">Program (for this machine)</p>
            <Field label="Program" hint="Read-only in shift entry">
              <input
                readOnly
                value={edit.programName || assignment.programName || "Not set"}
                className={roCls}
              />
            </Field>
          </div>

          {/* Parts produced */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3">
              Parts Produced
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Parts Produced"
                req
                hint={hasSavedShortfall ? `Already submitted ${savedProduced}; enter the new total after completing the remaining ${assignment.partsCommitted - savedProduced}.` : "Total count from this machine this shift"}
              >
                <input
                  type="number" min={hasSavedShortfall ? savedProduced : 0} max={assignment.partsCommitted}
                  value={edit.partsProduced === 0 && !isLocked ? "" : edit.partsProduced}
                  onChange={e => onChange({ partsProduced: Number(e.target.value) })}
                  className={cls}
                  placeholder="e.g. 48"
                />
              </Field>
              <div className="flex items-end">
                <div className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs">
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Committed</p>
                  <p className="text-lg font-black text-slate-800">{assignment.partsCommitted}</p>
                  {hasSavedShortfall && (
                    <p className="text-blue-600 font-bold text-[10px] mt-0.5">
                      {savedProduced} saved · {remainingParts} remaining
                    </p>
                  )}
                  {edit.partsProduced > 0 && edit.partsProduced < assignment.partsCommitted && (
                    <p className="text-amber-600 font-bold text-[10px] mt-0.5">
                      ⚠ {assignment.partsCommitted - edit.partsProduced} short
                    </p>
                  )}
                  {edit.partsProduced >= assignment.partsCommitted && edit.partsProduced > 0 && (
                    <p className="text-emerald-600 font-bold text-[10px] mt-0.5">✓ Target met</p>
                  )}
                </div>
              </div>
            </div>

            {/* Shortage explanation — required when produced < committed */}
            {edit.partsProduced > 0 && edit.partsProduced < assignment.partsCommitted && (
              <div className="mt-3 space-y-2">
                <Field label="Shortage Reason" req>
                  <select
                    value={edit.shortcomingCategory}
                    onChange={e => onChange({ shortcomingCategory: e.target.value })}
                    className={cls}
                  >
                    <option value="none">Select reason…</option>
                    <option value="machine_breakdown">Machine Breakdown</option>
                    <option value="material_shortage">Material Shortage</option>
                    <option value="operator_absent">Operator Absent</option>
                    <option value="power_failure">Power Failure</option>
                    <option value="program_issue">Program Issue</option>
                    <option value="tool_change">Tool Change / Setup Time</option>
                    <option value="qa_hold">QA Hold</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Shortage Details" req hint="Explain what happened">
                  <textarea
                    rows={2}
                    value={edit.shortcomingNotes}
                    onChange={e => onChange({ shortcomingNotes: e.target.value })}
                    className={`${cls} resize-none`}
                    placeholder="Brief description of the shortage cause…"
                  />
                </Field>
              </div>
            )}

            {/* General notes even when on target */}
            {(edit.partsProduced === 0 || edit.partsProduced >= assignment.partsCommitted) && (
              <div className="mt-3">
                <Field label="Shift Notes (optional)">
                  <textarea
                    rows={2}
                    value={edit.shortcomingNotes}
                    onChange={e => onChange({ shortcomingNotes: e.target.value })}
                    className={`${cls} resize-none`}
                    placeholder="Any observations for this shift…"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Raw material */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Package size={10}/> Raw Material Usage
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Raw Material Used (KG)" req hint={`Assigned to this machine: ${perMachineAssignedKg.toFixed(3)} KG`}>
                <input
                  type="number" min="0" step="0.001"
                  value={used === 0 && !isLocked ? "" : used}
                  onChange={e => onChange({ rawMaterialUsedKg: Number(e.target.value) })}
                  className={`${cls} ${overUsed ? "border-red-400 focus:ring-red-400" : ""}`}
                  placeholder={`≤ ${perMachineAssignedKg.toFixed(3)}`}
                />
                {overUsed && (
                  <p className="text-[10px] text-red-600 font-bold mt-1">
                    ⚠ Exceeds assigned {perMachineAssignedKg.toFixed(3)} KG
                  </p>
                )}
              </Field>
              <Field label="Leftover (KG)" hint="Auto-calculated">
                <input
                  readOnly
                  value={used > 0 ? leftover.toFixed(3) : "—"}
                  className={`${roCls} ${leftover < 0 ? "text-red-600" : "text-teal-700 font-bold"}`}
                />
              </Field>
            </div>
          </div>

          {/* Downtime */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap size={10}/> Downtime (optional)
            </p>
            <Field label="Downtime (minutes)">
              <input
                type="number" min="0"
                value={edit.downtimeMinutes === 0 ? "" : edit.downtimeMinutes}
                onChange={e => onChange({ downtimeMinutes: Number(e.target.value) })}
                className={cls}
                placeholder="0"
              />
            </Field>
          </div>

          {/* Operator confirmation */}
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User size={10}/> Operator Confirmation
            </p>
            <Field label="Confirmed by (Operator Name)" req>
              <input
                type="text"
                value={edit.operatorConfirmedBy}
                onChange={e => onChange({ operatorConfirmedBy: e.target.value })}
                className={cls}
                placeholder="Full name of operator"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShiftProductionEntry() {
  const { currentUser, workOrders, updateWorkOrder, shifts } = useApp()
  const role = currentUser?.role as UserRole

  const myProcess: ProcessStage | null =
    role === UserRole.PTC_DIE_CASTING ? "die_casting" :
    role === UserRole.PTC_COATING     ? "coating"     :
    role === UserRole.PTC_CNC_VMC     ? "cnc_vmc"     :
    role === UserRole.PTC_MANAGER     ? "die_casting" :
    role === UserRole.ADMIN           ? "die_casting" :
    null

  const clientId: string = (
    (currentUser as unknown as { clientId?: string })?.clientId || ""
  )

  const { pwos, assignments, loading, error, reload } = useShiftData(clientId, myProcess)

  const [selectedPwoId, setSelectedPwoId] = useState<string>("")
  const selectedPwo = pwos.find(p => p.id === selectedPwoId)

  const assignmentsByPwoId = useMemo(() => {
    const map = new Map<string, MachineAssignment[]>()
    for (const assignment of assignments) {
      const existing = map.get(assignment.processWoId) ?? []
      existing.push(assignment)
      map.set(assignment.processWoId, existing)
    }
    return map
  }, [assignments])

  const processPwoById = useMemo(() => new Map(pwos.map(pwo => [pwo.id, pwo])), [pwos])

  // ── Date/shift gate: actuals unlock only after the scheduled shift starts. ──

  const getShiftStartAt = useCallback((shiftDate: string, shiftId: Shift | string) => {
    const shiftConfig = shifts.find(shift => shift.id === shiftId)
    const startTime = shiftConfig?.startTime || "00:00"
    const startAt = new Date(`${shiftDate}T${startTime}:00`)
    if (shiftConfig?.startNextDay) startAt.setDate(startAt.getDate() + 1)
    return startAt
  }, [shifts])

  const hasShiftStarted = useCallback((shiftDate: string, shiftId: Shift | string) => {
    return new Date() >= getShiftStartAt(shiftDate, shiftId)
  }, [getShiftStartAt])

  const getShiftStartLabel = useCallback((shiftDate: string, shiftId: Shift | string) => {
    const shiftConfig = shifts.find(shift => shift.id === shiftId)
    return `${shiftDate} ${shiftConfig?.startTime || "00:00"}`
  }, [shifts])

  const pdcReviewAssignments = useMemo(() => assignments.filter(assignment =>
    Boolean(processPwoById.get(assignment.processWoId)) &&
    isAssignmentComplete(assignment) &&
    Boolean(assignment.qiInspectedAt) &&
    (assignment.pdcApprovalStatus || "pending") === "pending"
  ), [assignments, processPwoById])

  const getPwoEntryState = useCallback((pwo: ProcessWOV2) => {
    if (pwo.status === "paused") return "paused" as const
    if (!hasShiftStarted(pwo.shiftDate, pwo.shift)) return "future" as const
    const pwoAssignments = assignmentsByPwoId.get(pwo.id) ?? []
    if (pwoAssignments.length === 0) return "pending" as const
    return pwoAssignments.some(assignment => !isAssignmentComplete(assignment)) ? "pending" as const : "submitted" as const
  }, [assignmentsByPwoId, hasShiftStarted])

  // editMap: machineAssignment.id → partial overrides
  const [editMap, setEditMap] = useState<Record<string, MachineRowEdit>>({})
  const [saving,      setSaving]      = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [pdcReviewingId, setPdcReviewingId] = useState<string | null>(null)
  const [pdcRejectReasons, setPdcRejectReasons] = useState<Record<string, string>>({})

  // Reset edits when PWO changes, and clear a submitted/future SWO that is no longer enterable after DB refresh.
  useEffect(() => {
    queueMicrotask(() => {
      if (selectedPwo && getPwoEntryState(selectedPwo) !== "pending") {
        setSelectedPwoId("")
      }
      setEditMap({})
      setSaved(false)
    })
  }, [getPwoEntryState, selectedPwo, selectedPwoId])

  // ── Build merged assignment list ──────────────────────────────────────────

  const baseAssignments = assignmentsByPwoId.get(selectedPwoId) ?? []

  let mergedAssignments: MachineAssignment[] = baseAssignments.map(a => ({ ...a }))

  // Fallback: build synthetic rows from legacy WO machine map
  if (selectedPwo && mergedAssignments.length === 0) {
    const legacy = workOrders.find(
      w => w.id === selectedPwo.rootWoId || w.id === selectedPwo.parentWoId
    )
    if (legacy?.machineProducedMap && Object.keys(legacy.machineProducedMap).length > 0) {
      mergedAssignments = Object.entries(legacy.machineProducedMap).map(([machineId, qty], idx) => ({
        id: `tmp-${selectedPwo.id}-${machineId}-${idx}`,
        processWoId: selectedPwo.id, machineId, machineName: machineId, operatorName: "",
        shiftDate: selectedPwo.shiftDate, shift: selectedPwo.shift, programId: "", programName: "",
        partsCommitted: Number(qty) || 0, producedQty: 0, partsProduced: 0,
        goodParts: 0, reworkParts: 0, rejectedParts: 0, rawMaterialUsedKg: 0, leftoverKg: 0,
        downtimeMinutes: 0, shortcomingCategory: "none", shortcomingNotes: "",
        operatorConfirmedBy: "", operatorConfirmedAt: "", actualsLocked: false,
      }))
    } else if (legacy?.machine) {
      const names = legacy.machine.split(",").map(m => m.trim()).filter(Boolean)
      const each = names.length > 0 ? Math.floor((selectedPwo.targetParts || 0) / names.length) : 0
      mergedAssignments = names.map((name, idx) => ({
        id: `tmp-${selectedPwo.id}-${name}-${idx}`,
        processWoId: selectedPwo.id, machineId: name, machineName: name, operatorName: "",
        shiftDate: selectedPwo.shiftDate, shift: selectedPwo.shift, programId: "", programName: "",
        partsCommitted: each, producedQty: 0, partsProduced: 0,
        goodParts: 0, reworkParts: 0, rejectedParts: 0, rawMaterialUsedKg: 0, leftoverKg: 0,
        downtimeMinutes: 0, shortcomingCategory: "none", shortcomingNotes: "",
        operatorConfirmedBy: "", operatorConfirmedAt: "", actualsLocked: false,
      }))
    }
  }

  // Auto-submit complete saved drafts once their scheduled shift has arrived.
  useEffect(() => {
    if (!clientId || !currentUser?.name) return
    const dueDrafts = assignments.filter(a =>
      Boolean(a.draftSavedAt) &&
      !a.actualsLocked &&
      hasShiftStarted(a.shiftDate, a.shift) &&
      isAssignmentComplete(a)
    )
    if (dueDrafts.length === 0) return

    const autoSubmitDrafts = async () => {
      const now = new Date().toISOString()
      const affectedPwoIds = new Set(dueDrafts.map(a => a.processWoId))
      for (const assignment of dueDrafts) {
        await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", assignment.id), {
          operatorConfirmedAt: assignment.operatorConfirmedAt || now,
          actualsLocked: true,
          updatedAt: serverTimestamp(),
        })
      }
      for (const processWoId of affectedPwoIds) {
        const pwoAssignments = assignments.filter(a => a.processWoId === processWoId)
        const allLocked = pwoAssignments.every(a => a.actualsLocked || dueDrafts.some(d => d.id === a.id))
        if (allLocked) {
          const produced = pwoAssignments.reduce((sum, a) => sum + getProducedCount(a), 0)
          const rawUsed = pwoAssignments.reduce((sum, a) => sum + Number(a.rawMaterialUsedKg || 0), 0)
          const leftover = pwoAssignments.reduce((sum, a) => sum + Number(a.leftoverKg || 0), 0)
          await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", processWoId), {
            totalProduced: produced,
            totalRawUsedKg: Number(rawUsed.toFixed(3)),
            totalLeftoverKg: Number(leftover.toFixed(3)),
            actualsSubmittedAt: now,
            actualsSubmittedBy: "Auto-submit from saved draft",
            status: "completed",
            updatedAt: serverTimestamp(),
          })
        }
      }
      await reload()
    }

    void autoSubmitDrafts()
  }, [assignments, clientId, currentUser?.name, hasShiftStarted, reload])

  // ── Per-machine KG allocation ─────────────────────────────────────────────

  const perMachineKg = (selectedPwo && mergedAssignments.length > 0)
    ? Number(((selectedPwo.assignedQtyKg ?? 0) / mergedAssignments.length).toFixed(3))
    : 0

  // ── Edit helpers ──────────────────────────────────────────────────────────

  const getEdit = (id: string): MachineRowEdit => {
    const assignment = mergedAssignments.find(ma => ma.id === id)
    const defaults: MachineRowEdit = {
      partsProduced: assignment ? getProducedCount(assignment) : 0,
      rawMaterialUsedKg: Number(assignment?.rawMaterialUsedKg ?? 0),
      downtimeMinutes: Number(assignment?.downtimeMinutes ?? 0),
      shortcomingCategory: assignment?.shortcomingCategory || "none",
      shortcomingNotes: assignment?.shortcomingNotes || "",
      operatorConfirmedBy: assignment?.operatorConfirmedBy || "",
      programId: assignment?.programId || "",
      programName: assignment?.programName || "",
    }
    return { ...defaults, ...(editMap[id] ?? {}) }
  }

  const handleChange = (id: string, data: Partial<MachineRowEdit>) => {
    const assignment = mergedAssignments.find(ma => ma.id === id)
    if (!assignment || isAssignmentComplete(assignment) || !hasShiftStarted(assignment.shiftDate, assignment.shift)) return

    const safeData = { ...data }
    if (safeData.partsProduced !== undefined) {
      const minProduced = assignment.actualsLocked ? getProducedCount(assignment) : 0
      safeData.partsProduced = Math.min(assignment.partsCommitted, Math.max(minProduced, safeData.partsProduced))
    }
    if (assignment.actualsLocked && safeData.rawMaterialUsedKg !== undefined) {
      safeData.rawMaterialUsedKg = Math.max(Number(assignment.rawMaterialUsedKg ?? 0), safeData.rawMaterialUsedKg)
    }
    if (assignment.actualsLocked && safeData.downtimeMinutes !== undefined) {
      safeData.downtimeMinutes = Math.max(Number(assignment.downtimeMinutes ?? 0), safeData.downtimeMinutes)
    }

    setEditMap(prev => ({ ...prev, [id]: { ...getEdit(id), ...safeData } }))
  }

  const hasUnsaved = Object.keys(editMap).length > 0
  const pendingAssignments = mergedAssignments.filter(a => !isAssignmentComplete(a) && hasShiftStarted(a.shiftDate, a.shift))
  const allLocked  = mergedAssignments.length > 0 && pendingAssignments.length === 0

  // ── Totals (for PWO-level update) ─────────────────────────────────────────

  const totals = mergedAssignments.reduce((acc, a) => {
    const e = getEdit(a.id)
    const rowIsComplete = isAssignmentComplete(a)
    const produced = rowIsComplete ? getProducedCount(a)          : e.partsProduced
    const used     = rowIsComplete ? (a.rawMaterialUsedKg ?? 0)   : e.rawMaterialUsedKg
    const down     = rowIsComplete ? (a.downtimeMinutes ?? 0)     : e.downtimeMinutes
    const left     = Number((perMachineKg - used).toFixed(3))
    return {
      produced:  acc.produced  + produced,
      rawUsed:   acc.rawUsed   + used,
      leftover:  acc.leftover  + Math.max(0, left),
      downtime:  acc.downtime  + down,
    }
  }, { produced: 0, rawUsed: 0, leftover: 0, downtime: 0 })

  // ── Validation ────────────────────────────────────────────────────────────

  const validateBeforeSubmit = (): string | null => {
    for (const ma of mergedAssignments) {
      if (isAssignmentComplete(ma)) continue
      if (!hasShiftStarted(ma.shiftDate, ma.shift)) continue
      const e = getEdit(ma.id)
      const savedProduced = getProducedCount(ma)
      if (ma.actualsLocked && e.partsProduced <= savedProduced) {
        return `Enter the remaining ${ma.partsCommitted - savedProduced} parts for machine: ${ma.machineName}`
      }
      if (!e.operatorConfirmedBy.trim()) return `Enter operator confirmation for machine: ${ma.machineName}`
      if (e.partsProduced < ma.partsCommitted && (e.shortcomingCategory === "none" || !e.shortcomingNotes.trim())) {
        return `Provide shortage reason + details for machine: ${ma.machineName} (produced ${e.partsProduced} of ${ma.partsCommitted})`
      }
    }
    return null
  }

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!selectedPwo || !clientId || mergedAssignments.length === 0) return
    setSavingDraft(true)
    try {
      const now = new Date().toISOString()
      for (const ma of mergedAssignments) {
        if (isAssignmentComplete(ma) || !hasShiftStarted(ma.shiftDate, ma.shift)) continue
        const e = getEdit(ma.id)
        if (!Object.keys(editMap).includes(ma.id)) continue
        const payload = {
          partsProduced:       e.partsProduced,
          producedQty:         e.partsProduced,
          rawMaterialUsedKg:   e.rawMaterialUsedKg,
          leftoverKg:          Number((perMachineKg - e.rawMaterialUsedKg).toFixed(3)),
          downtimeMinutes:     e.downtimeMinutes,
          shortcomingCategory: e.shortcomingCategory,
          shortcomingNotes:    e.shortcomingNotes,
          operatorConfirmedBy: e.operatorConfirmedBy,
          programId:           e.programId,
          programName:         e.programName || ma.programName || "",
          draftSavedAt:        now,
          updatedAt:           serverTimestamp(),
        }
        if (String(ma.id).startsWith("tmp-")) {
          await addDoc(collection(db, "clients", clientId, "wo_machine_assignments_v2"), {
            processWoId: selectedPwo.id, machineId: ma.machineId, machineName: ma.machineName,
            operatorName: ma.operatorName || "", shiftDate: ma.shiftDate, shift: ma.shift,
            partsCommitted: ma.partsCommitted, goodParts: 0, reworkParts: 0, rejectedParts: 0,
            ...payload, createdAt: now,
          })
        } else {
          await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", ma.id), payload)
        }
      }
      await reload()
    } finally {
      setSavingDraft(false)
    }
  }

  // ── Submit final ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedPwo || !clientId) return
    const validationError = validateBeforeSubmit()
    if (validationError) { alert(validationError); return }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      for (const ma of mergedAssignments) {
        if (isAssignmentComplete(ma) || !hasShiftStarted(ma.shiftDate, ma.shift)) continue
        const e = getEdit(ma.id)
        const leftoverKg = Number((perMachineKg - e.rawMaterialUsedKg).toFixed(3))
        const payload = {
          partsProduced:       e.partsProduced,
          producedQty:         e.partsProduced,
          rawMaterialUsedKg:   e.rawMaterialUsedKg,
          leftoverKg:          Math.max(0, leftoverKg),
          downtimeMinutes:     e.downtimeMinutes,
          shortcomingCategory: e.shortcomingCategory,
          shortcomingNotes:    e.shortcomingNotes,
          operatorConfirmedBy: e.operatorConfirmedBy,
          operatorConfirmedAt: now,
          programId:           e.programId,
          programName:         e.programName || ma.programName || "",
          actualsLocked:       e.partsProduced >= ma.partsCommitted,
          updatedAt:           serverTimestamp(),
        }
        if (String(ma.id).startsWith("tmp-")) {
          await addDoc(collection(db, "clients", clientId, "wo_machine_assignments_v2"), {
            processWoId: selectedPwo.id, machineId: ma.machineId, machineName: ma.machineName,
            operatorName: ma.operatorName || "", shiftDate: ma.shiftDate, shift: ma.shift,
            partsCommitted: ma.partsCommitted, goodParts: 0, reworkParts: 0, rejectedParts: 0,
            ...payload, createdAt: now,
          })
        } else {
          await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", ma.id), payload)
        }
      }

      const willAllBeLocked = mergedAssignments.every(a => {
        if (!hasShiftStarted(a.shiftDate, a.shift)) return true
        if (isAssignmentComplete(a)) return true
        const e = getEdit(a.id)
        return e.partsProduced >= a.partsCommitted
      })

      // Update PWO totals
      await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", selectedPwo.id), {
        totalProduced:    totals.produced,
        totalRawUsedKg:   Number(totals.rawUsed.toFixed(3)),
        totalLeftoverKg:  Number(totals.leftover.toFixed(3)),
        actualsSubmittedAt:  willAllBeLocked ? now : "",
        actualsSubmittedBy:  willAllBeLocked ? currentUser!.name : "",
        status:              willAllBeLocked ? "completed" : "in_progress",
        updatedAt:           serverTimestamp(),
      })

      // Update legacy WO with only the newly added production count. Existing DB actuals are cumulative.
      const previousProducedTotal = mergedAssignments.reduce((sum, assignment) => sum + getProducedCount(assignment), 0)
      const producedDelta = Math.max(0, totals.produced - previousProducedTotal)
      const legacyWO = workOrders.find(
        w => w.id === selectedPwo.rootWoId || w.id === selectedPwo.parentWoId
      )
      if (legacyWO && producedDelta > 0) {
        updateWorkOrder(legacyWO.id, {
          partsCompleted: (legacyWO.partsCompleted ?? 0) + producedDelta,
          status: "in_progress",
        })
      }

      setSaved(true)
      setEditMap({})
      await reload()
      setTimeout(() => setSaved(false), 4000)
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally {
      setSaving(false)
    }
  }

  const completePdcReviewForPwo = async (pwo: ProcessWOV2, now: string) => {
    const nextProcess = getNextProcess(pwo.processType as ProcessStage)
    const pwoAssignments = assignmentsByPwoId.get(pwo.id) ?? []
    const totalGood = pwoAssignments.reduce((sum, assignment) => sum + Number(assignment.goodParts ?? 0), 0)

    if (!nextProcess || totalGood <= 0) {
      await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", pwo.id), {
        status: "completed",
        pdcApprovedAt: now,
        pdcApprovedBy: currentUser!.name,
        updatedAt: serverTimestamp(),
      })
      return
    }

    const existingNext = await getDocs(query(
      collection(db, "clients", clientId, "process_work_orders_v2"),
      where("rootWoId", "==", pwo.rootWoId),
      where("processType", "==", nextProcess)
    ))
    const existingNextId = existingNext.docs[0]?.id
    let nextProcessWoId = existingNextId || ""

    if (!nextProcessWoId) {
      const nextRef = doc(collection(db, "clients", clientId, "process_work_orders_v2"))
      nextProcessWoId = nextRef.id
      const nextRequiredKg = pwo.targetParts > 0
        ? Number(((pwo.requiredQtyKg || 0) * (totalGood / pwo.targetParts)).toFixed(3))
        : 0
      await setDoc(nextRef, {
        id: nextProcessWoId,
        processWoNumber: `${pwo.processWoNumber}-${String(nextProcess).toUpperCase()}`,
        parentWoId: pwo.parentWoId,
        rootWoId: pwo.rootWoId,
        processType: nextProcess,
        status: "scheduled",
        shiftDate: now.split("T")[0],
        shift: "",
        targetParts: totalGood,
        requiredQtyKg: nextRequiredKg,
        bufferPercent: pwo.bufferPercent || 0,
        assignedQtyKg: 0,
        takenQtyKg: 0,
        leftoverQtyKg: 0,
        shortcomingCategory: "none",
        shortcomingNotes: `Auto-created after ${PROCESS_STAGE_LABELS[pwo.processType as ProcessStage]} PDC approval.`,
        createdAt: now,
        updatedAt: now,
      })
    }

    await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", pwo.id), {
      status: "qa_approved",
      pdcApprovedAt: now,
      pdcApprovedBy: currentUser!.name,
      nextProcessWoId,
      updatedAt: serverTimestamp(),
    })
  }

  const handlePdcApprove = async (assignment: MachineAssignment) => {
    if (!clientId || !currentUser || pdcReviewingId) return
    const pwo = processPwoById.get(assignment.processWoId)
    if (!pwo) return

    setPdcReviewingId(assignment.id)
    try {
      const now = new Date().toISOString()
      await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", assignment.id), {
        pdcApprovalStatus: "approved",
        pdcApprovedBy: currentUser.name,
        pdcApprovedById: currentUser.id,
        pdcApprovedAt: now,
        pdcRejectedReason: "",
        updatedAt: serverTimestamp(),
      })

      const siblings = assignmentsByPwoId.get(assignment.processWoId) ?? []
      const nextSiblings = siblings.map(item => item.id === assignment.id ? { ...item, pdcApprovalStatus: "approved" as const } : item)
      const completeSiblings = nextSiblings.filter(item => isAssignmentComplete(item))
      const allApproved = completeSiblings.length > 0 && completeSiblings.every(item => Boolean(item.qiInspectedAt) && item.pdcApprovalStatus === "approved")
      if (allApproved) await completePdcReviewForPwo(pwo, now)

      await reload()
    } catch (e: unknown) {
      alert("PDC approval failed: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally {
      setPdcReviewingId(null)
    }
  }

  const handlePdcReject = async (assignment: MachineAssignment) => {
    if (!clientId || !currentUser || pdcReviewingId) return
    const reason = (pdcRejectReasons[assignment.id] || "").trim()
    if (!reason) {
      alert("Enter a rejection reason before sending this report back to QI.")
      return
    }

    setPdcReviewingId(assignment.id)
    try {
      const now = new Date().toISOString()
      await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", assignment.id), {
        pdcApprovalStatus: "rejected",
        pdcRejectedReason: reason,
        pdcRejectedBy: currentUser.name,
        pdcRejectedById: currentUser.id,
        pdcRejectedAt: now,
        qiInspectedAt: "",
        qaStatus: "pending",
        updatedAt: serverTimestamp(),
      })
      setPdcRejectReasons(prev => ({ ...prev, [assignment.id]: "" }))
      await reload()
    } catch (e: unknown) {
      alert("PDC rejection failed: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally {
      setPdcReviewingId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!myProcess) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Info size={24} className="mx-auto mb-2 opacity-40"/>
        <p className="text-sm">No process assigned to your role.</p>
      </div>
    )
  }


  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Shift Production Entry</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {PROCESS_STAGE_LABELS[myProcess]} · Fill machine-wise actuals after each shift
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* PDC review queue for machine-wise QI reports */}
      {pdcReviewAssignments.length > 0 && (
        <section className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-black text-slate-900">QI Reports Pending PDC Approval</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Approve accepted QI classifications to move good parts to the next process, or reject with a reason to send it back to QI.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-200">
              {pdcReviewAssignments.length} Pending
            </span>
          </div>

          <div className="space-y-3">
            {pdcReviewAssignments.map(assignment => {
              const pwo = processPwoById.get(assignment.processWoId)
              const isReviewing = pdcReviewingId === assignment.id
              return (
                <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-black text-slate-900 text-sm">{assignment.machineName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {pwo?.processWoNumber || assignment.processWoId} · Produced {getProducedCount(assignment)} · QI: {assignment.qiInspectedBy || "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">Good</p>
                        <p className="text-lg font-black text-emerald-700">{assignment.goodParts ?? 0}</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider">Rework</p>
                        <p className="text-lg font-black text-amber-700">{assignment.reworkParts ?? 0}</p>
                      </div>
                      <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                        <p className="text-[9px] font-black text-red-500 uppercase tracking-wider">Rejected</p>
                        <p className="text-lg font-black text-red-700">{assignment.rejectedParts ?? 0}</p>
                      </div>
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={pdcRejectReasons[assignment.id] || ""}
                    onChange={e => setPdcRejectReasons(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-400 outline-none"
                    placeholder="Required only when rejecting — explain what QI must correct…"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handlePdcReject(assignment)}
                      disabled={isReviewing}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-black disabled:opacity-50"
                    >
                      <XCircle size={15}/> Reject to QI
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePdcApprove(assignment)}
                      disabled={isReviewing}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-50"
                    >
                      <CheckCircle2 size={15}/> Approve & Forward
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* PWO selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar size={10}/> Select Process Work Order (SWO)
        </p>
        <select
          value={selectedPwoId}
          onChange={e => setSelectedPwoId(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">— Select a pending process work order —</option>
          {[...pwos]
            .sort((a, b) => `${a.shiftDate}-${String(a.shift)}`.localeCompare(`${b.shiftDate}-${String(b.shift)}`))
            .map(p => {
              const entryState = getPwoEntryState(p)
              const label = entryState === "submitted" ? "✓ Submitted" : entryState === "paused" ? "⏸ Paused" : entryState === "future" ? "🔒 Future" : "Pending"
              return (
                <option key={p.id} value={p.id} disabled={entryState !== "pending"}>
                  {p.processWoNumber} · {p.shiftDate} / {String(p.shift)} · Target: {p.targetParts} parts · {label}
                </option>
              )
            })}
        </select>
        <p className="text-[10px] text-slate-400 mt-2">
          Submitted SWOs are locked from the latest DB assignment status, so only pending shift-end actuals can be opened for entry.
        </p>

        {/* PWO summary */}
        {selectedPwo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ["Shift Date",     selectedPwo.shiftDate],
              ["Shift",         String(selectedPwo.shift)],
              ["Target Parts",  String(selectedPwo.targetParts)],
              ["Assigned KG",   `${selectedPwo.assignedQtyKg ?? 0} KG`],
              ["Per Machine KG",`${perMachineKg.toFixed(3)} KG`],
              ["Status",        selectedPwo.status],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">{k}</p>
                <p className="font-bold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        )}

        {/* Future shift notice */}
        {selectedPwo && !hasShiftStarted(selectedPwo.shiftDate, selectedPwo.shift) && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <Lock size={14} className="shrink-0 mt-0.5"/>
            <span>
              This shift starts at <strong>{getShiftStartLabel(selectedPwo.shiftDate, selectedPwo.shift)}</strong>.
              Actuals can only be filled once this exact date and shift time has arrived.
            </span>
          </div>
        )}
      </div>

      {/* Machine rows */}
      {selectedPwo && mergedAssignments.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          No machine assignments found. Please fill machine mapping in Work Orders (Phase 2 → Window 2), then refresh.
        </div>
      )}

      {selectedPwo && mergedAssignments.length > 0 && (
        <div className="space-y-4">
          {mergedAssignments.map(ma => (
            <MachineRow
              key={ma.id}
              assignment={ma}
              perMachineAssignedKg={perMachineKg}
              edit={getEdit(ma.id)}
              onChange={data => handleChange(ma.id, data)}
              isLocked={isAssignmentComplete(ma)}
              isFuture={!hasShiftStarted(ma.shiftDate, ma.shift)}
            />
          ))}

          {/* Totals bar */}
          {!allLocked && pendingAssignments.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-3">Shift Totals Preview</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ["Total Produced",   String(totals.produced)],
                  ["Raw Used (KG)",    totals.rawUsed.toFixed(3)],
                  ["Leftover (KG)",    totals.leftover.toFixed(3)],
                  ["Downtime (min)",   String(totals.downtime)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white rounded-xl p-2.5 border border-slate-200 text-center">
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">{k}</p>
                    <p className="text-lg font-black text-slate-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action bar */}
          {!allLocked && pendingAssignments.length > 0 && (
            <div className="sticky bottom-4 flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-xl">
              <div className="flex-1">
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-bold">
                    <CheckCircle2 size={15}/> Actuals saved successfully
                  </span>
                )}
                {!saved && hasUnsaved && (
                  <span className="text-sm text-amber-700 font-semibold">
                    Unsaved changes — submit to lock in DB
                  </span>
                )}
                {!saved && !hasUnsaved && pendingAssignments.length > 0 && (
                  <span className="text-sm text-slate-500 font-semibold">
                    Pending DB values loaded — submit when ready to lock
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || !hasUnsaved}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-300 text-indigo-700 rounded-xl text-sm font-black disabled:opacity-40"
              >
                {savingDraft ? <><Loader2 size={15} className="animate-spin"/> Saving…</> : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || pendingAssignments.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <><Loader2 size={15} className="animate-spin"/> Saving…</> : <><Save size={15}/> Submit Shift Actuals</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MachineAssignmentDropdown (read-only, for PDC Manager tree view) ─────────

type MachineAssignmentDropdownProps = {
  clientId: string
  processWoId?: string
  woId?: string
  processType?: string
  shiftDate?: string
  shift?: string
  fallbackMachineMap?: Record<string, number>
}

export function MachineAssignmentDropdown({
  clientId, processWoId, woId, processType, shiftDate, shift, fallbackMachineMap,
}: MachineAssignmentDropdownProps) {
  const [assignments, setAssignments] = useState<MachineAssignment[]>([])
  const [loading,     setLoading]     = useState(false)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    const load = async () => {
      setLoading(true); setLoadError(null)
      try {
        let resolvedId = processWoId
        if (!resolvedId && woId) {
          const p1 = await getDocs(query(collection(db, "clients", clientId, "process_work_orders_v2"), where("rootWoId", "==", woId)))
          if (!p1.empty) resolvedId = p1.docs[0].id
          if (!resolvedId) {
            const p2 = await getDocs(query(collection(db, "clients", clientId, "process_work_orders_v2"), where("parentWoId", "==", woId)))
            if (!p2.empty) resolvedId = p2.docs[0].id
          }
        }
        if (!resolvedId && processType && shiftDate && shift) {
          const p3 = await getDocs(query(
            collection(db, "clients", clientId, "process_work_orders_v2"),
            where("processType", "==", processType),
            where("shiftDate", "==", shiftDate),
            where("shift", "==", shift)
          ))
          if (!p3.empty) resolvedId = p3.docs[0].id
        }
        if (!resolvedId) { setAssignments([]); return }
        const snap = await getDocs(query(
          collection(db, "clients", clientId, "wo_machine_assignments_v2"),
          where("processWoId", "==", resolvedId)
        ))
        setAssignments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MachineAssignment, "id">) })))
      } catch (e: unknown) {
        setLoadError(e instanceof Error ? e.message : "Failed to load")
        setAssignments([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientId, processWoId, woId, processType, shiftDate, shift])

  if (loading) return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 py-1">
      <Loader2 size={10} className="animate-spin"/> Loading…
    </div>
  )
  if (loadError) return <p className="text-[10px] text-red-600 py-1">Error: {loadError}</p>

  if (assignments.length === 0 && fallbackMachineMap && Object.keys(fallbackMachineMap).length > 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] text-amber-700 py-1">No DB assignments yet — showing allocation fallback.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(fallbackMachineMap).map(([machineId, qty]) => (
            <div key={machineId} className="rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-[10px] font-black text-amber-800">{machineId}</p>
              <p className="text-[10px] text-amber-700">Committed: {qty} parts · Pending shift-end actuals</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (assignments.length === 0) return (
    <p className="text-[10px] text-slate-400 italic py-1">No machine assignments in DB for this SWO yet.</p>
  )

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
        <Settings2 size={9}/> Machine-wise Actuals
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {assignments.map(a => {
          const produced = getProducedCount(a)
          const remaining = getRemainingParts(a)
          const complete = remaining === 0
          return (
            <div key={a.id} className={`rounded-lg border p-2 ${complete ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-800">{a.machineName}</p>
                {complete ? (
                  <span className="text-[9px] text-emerald-700 font-bold">✓ Complete</span>
                ) : (
                  <span className="text-[9px] text-amber-700 font-bold">⏳ {remaining} pending</span>
                )}
              </div>
              {a.programName && <p className="text-[10px] text-indigo-700 font-semibold">Program: {a.programName}</p>}
              <p className="text-[10px] text-slate-700">Produced: <strong>{produced}</strong> / {a.partsCommitted}</p>
              <p className="text-[10px] text-slate-700">Raw Used: {a.rawMaterialUsedKg ?? 0} KG · Leftover: {a.leftoverKg ?? 0} KG</p>
              {a.downtimeMinutes > 0 && <p className="text-[10px] text-slate-500">Downtime: {a.downtimeMinutes} min</p>}
              <p className="text-[10px] text-slate-400">Op: {a.operatorConfirmedBy || "—"}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}