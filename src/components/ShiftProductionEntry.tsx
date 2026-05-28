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

import { useState, useEffect, useCallback } from "react"
import {
  CheckCircle2, ChevronDown, ChevronRight,
  RefreshCw, Settings2, Package, Zap, User, Calendar,
  Save, Loader2, Info, Lock,
} from "lucide-react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, PROCESS_STAGE_LABELS,
  type ProcessStage, type Shift,
} from "@/lib/store"

import { db } from "@/lib/firebase"
import {
  collection, query, where, getDocs, updateDoc, addDoc,
  doc, serverTimestamp,
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
  goodParts: number
  reworkParts: number
  rejectedParts: number
  rawMaterialUsedKg: number
  leftoverKg: number
  downtimeMinutes: number
  shortcomingCategory: string
  shortcomingNotes: string
  operatorConfirmedBy: string
  operatorConfirmedAt: string
  actualsLocked: boolean
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
            {isFuture && <span className="ml-2 text-amber-600 font-bold">· Can only fill on/after shift date</span>}
          </p>
        </div>
        {open ? <ChevronDown size={15} className="text-slate-400 shrink-0"/> : <ChevronRight size={15} className="text-slate-400 shrink-0"/>}
      </button>

      {open && !isFuture && (
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
              <Field label="Parts Produced" req hint="Total count from this machine this shift">
                <input
                  type="number" min="0"
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
  const { currentUser, workOrders, updateWorkOrder } = useApp()
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

  // editMap: machineAssignment.id → partial overrides
  const [editMap, setEditMap] = useState<Record<string, MachineRowEdit>>({})
  const [saving,      setSaving]      = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saved,       setSaved]       = useState(false)

  // Reset edits when PWO changes
  useEffect(() => {
    queueMicrotask(() => {
      setEditMap({})
      setSaved(false)
    })
  }, [selectedPwoId])

  // ── Build merged assignment list ──────────────────────────────────────────

  const baseAssignments = assignments.filter(a => a.processWoId === selectedPwoId)

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

  // ── Date gate: is today on or after the shift date? ───────────────────────

  const today = new Date().toISOString().split("T")[0]

  const isFutureShift = (shiftDate: string) => shiftDate > today

  // ── Per-machine KG allocation ─────────────────────────────────────────────

  const perMachineKg = (selectedPwo && mergedAssignments.length > 0)
    ? Number(((selectedPwo.assignedQtyKg ?? 0) / mergedAssignments.length).toFixed(3))
    : 0

  // ── Edit helpers ──────────────────────────────────────────────────────────

  const getEdit = (id: string): MachineRowEdit => {
    const defaults: MachineRowEdit = {
      partsProduced: 0,
      rawMaterialUsedKg: 0,
      downtimeMinutes: 0,
      shortcomingCategory: "none",
      shortcomingNotes: "",
      operatorConfirmedBy: "",
      programId: "",
      programName: "",
    }
    return { ...defaults, ...(editMap[id] ?? {}) }
  }

  const handleChange = (id: string, data: Partial<MachineRowEdit>) =>
    setEditMap(prev => ({ ...prev, [id]: { ...getEdit(id), ...data } }))

  const hasUnsaved = Object.keys(editMap).length > 0
  const allLocked  = mergedAssignments.length > 0 && mergedAssignments.every(a => a.actualsLocked)

  // ── Totals (for PWO-level update) ─────────────────────────────────────────

  const totals = mergedAssignments.reduce((acc, a) => {
    const e = getEdit(a.id)
    const produced = a.actualsLocked ? (a.partsProduced ?? a.producedQty ?? 0) : e.partsProduced
    const used     = a.actualsLocked ? (a.rawMaterialUsedKg ?? 0)              : e.rawMaterialUsedKg
    const down     = a.actualsLocked ? (a.downtimeMinutes ?? 0)                : e.downtimeMinutes
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
      if (ma.actualsLocked) continue
      if (isFutureShift(ma.shiftDate)) continue
      const e = getEdit(ma.id)
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
        if (ma.actualsLocked || isFutureShift(ma.shiftDate)) continue
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
        if (ma.actualsLocked || isFutureShift(ma.shiftDate)) continue
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
          actualsLocked:       true,
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

      // Update PWO totals
      await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", selectedPwo.id), {
        totalProduced:    totals.produced,
        totalRawUsedKg:   Number(totals.rawUsed.toFixed(3)),
        totalLeftoverKg:  Number(totals.leftover.toFixed(3)),
        actualsSubmittedAt:  now,
        actualsSubmittedBy:  currentUser!.name,
        status:              "completed",
        updatedAt:           serverTimestamp(),
      })

      // Update legacy WO
      const legacyWO = workOrders.find(
        w => w.id === selectedPwo.rootWoId || w.id === selectedPwo.parentWoId
      )
      if (legacyWO) {
        updateWorkOrder(legacyWO.id, {
          partsCompleted: (legacyWO.partsCompleted ?? 0) + totals.produced,
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
          <option value="">— Select a process work order —</option>
          {[...pwos]
            .sort((a, b) => `${a.shiftDate}-${String(a.shift)}`.localeCompare(`${b.shiftDate}-${String(b.shift)}`))
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.processWoNumber} · {p.shiftDate} / {String(p.shift)} · Target: {p.targetParts} parts ·{" "}
                {p.actualsSubmittedAt ? "✓ Submitted" : p.shiftDate > today ? "🔒 Future" : "Pending"}
              </option>
            ))}
        </select>

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
        {selectedPwo && selectedPwo.shiftDate > today && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <Lock size={14} className="shrink-0 mt-0.5"/>
            <span>
              This shift is scheduled for <strong>{selectedPwo.shiftDate}</strong>.
              Actuals can only be filled on or after the shift date.
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
              isLocked={!!ma.actualsLocked}
              isFuture={isFutureShift(ma.shiftDate)}
            />
          ))}

          {/* Totals bar */}
          {!allLocked && mergedAssignments.some(a => !a.actualsLocked && !isFutureShift(a.shiftDate)) && (
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
          {!allLocked && mergedAssignments.some(a => !a.actualsLocked && !isFutureShift(a.shiftDate)) && (
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
                disabled={saving || !hasUnsaved}
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
          const produced = a.partsProduced ?? a.producedQty ?? 0
          return (
            <div key={a.id} className={`rounded-lg border p-2 ${a.actualsLocked ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-800">{a.machineName}</p>
                {a.actualsLocked && <span className="text-[9px] text-emerald-700 font-bold">✓ Locked</span>}
              </div>
              {a.programName && <p className="text-[10px] text-indigo-700 font-semibold">Program: {a.programName}</p>}
              {a.actualsLocked ? (
                <>
                  <p className="text-[10px] text-slate-700">Produced: <strong>{produced}</strong> / {a.partsCommitted}</p>
                  <p className="text-[10px] text-slate-700">Raw Used: {a.rawMaterialUsedKg ?? 0} KG · Leftover: {a.leftoverKg ?? 0} KG</p>
                  {a.downtimeMinutes > 0 && <p className="text-[10px] text-slate-500">Downtime: {a.downtimeMinutes} min</p>}
                  <p className="text-[10px] text-slate-400">Op: {a.operatorConfirmedBy || "—"}</p>
                </>
              ) : (
                <p className="text-[10px] text-amber-600 font-semibold">⏳ Pending shift actuals</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}