"use client"
/**
 * ShiftProductionEntry.tsx
 *
 * Drop this component into your Pipeline tab (PDC subrole view).
 *
 * What it does:
 * ─────────────
 * 1. Loads all process_work_orders_v2 for the current PDC's process from DB.
 * 2. Loads all wo_machine_assignments_v2 linked to those PWOs from DB.
 * 3. Lets the PDC select a PWO → see all machines assigned to it.
 * 4. For each machine the PDC fills in (post-shift):
 *      • Parts Produced  (good / rework / rejected breakdown)
 *      • Raw Material Used (KG) — auto-validates vs assigned KG
 *      • Leftover KG  (assigned − used, stored in DB)
 *      • Downtime minutes + shortcoming category
 *      • Notes
 *      • Operator confirmation (name + timestamp auto-stamped)
 * 5. On Save:
 *      • Updates each wo_machine_assignments_v2 doc with actuals
 *      • Updates the parent process_work_orders_v2 with totals
 *      • Updates work_orders (legacy) partsCompleted / goodParts / reworkParts / rejectedParts
 *      • Writes a wo_audit_log entry
 *
 * PDC Manager view  (WOHierarchyTree → SWONode expanded body)
 * ─────────────────
 * Import <MachineAssignmentDropdown clientId={clientId} processWoId={swo.processWoId} /> and render it inside
 * the expanded section — it live-reads DB and renders a styled select.
 */

import { useState, useEffect, useCallback } from "react"
import {
  CheckCircle2, ChevronDown, ChevronRight, AlertTriangle,
  RefreshCw, Settings2, Package, Zap, User, Calendar,
  BarChart3, Save, Loader2, Info,
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

const cls   = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white"
const roCls = "w-full border border-slate-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 bg-slate-50 cursor-not-allowed"
const lbl   = "block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1"

const statusPill = (s: string) =>
  s === "scheduled"   ? "bg-amber-100 text-amber-800 border-amber-200" :
  s === "in_progress" ? "bg-blue-100 text-blue-800 border-blue-200" :
  s === "completed"   ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
  "bg-slate-100 text-slate-600 border-slate-200"

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

  useEffect(() => { reload() }, [reload])
  return { pwos, assignments, loading, error, reload }
}

type MachineRowState = {
  goodParts: number
  reworkParts: number
  rejectedParts: number
  rawMaterialUsedKg: number
  downtimeMinutes: number
  shortcomingCategory: string
  shortcomingNotes: string
  operatorConfirmedBy: string
}

function MachineRow({
  assignment,
  assignedKg,
  onChange,
  isLocked,
}: {
  assignment: MachineAssignment
  assignedKg: number
  onChange: (id: string, data: Partial<MachineRowState>) => void
  isLocked: boolean
}) {
  const [open, setOpen] = useState(!isLocked)

  const good    = assignment.goodParts     ?? 0
  const rework  = assignment.reworkParts   ?? 0
  const rejected= assignment.rejectedParts ?? 0
  const produced= good + rework + rejected
  const used    = assignment.rawMaterialUsedKg ?? 0
  const leftover= Number((assignedKg - used).toFixed(3))
  const overUsed= used > assignedKg

  const committed = assignment.partsCommitted

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all
      ${isLocked ? "border-emerald-200 bg-emerald-50/20" : "border-indigo-200 bg-white"}`}>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black
          ${isLocked ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white"}`}>
          {isLocked ? <CheckCircle2 size={16}/> : <Settings2 size={15}/>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm">{assignment.machineName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Op: <span className="font-semibold text-slate-600">{assignment.operatorName || "Unassigned"}</span>
            · Committed: <span className="font-semibold">{committed} parts</span>
            · Shift: <span className="font-semibold">{assignment.shiftDate} / {assignment.shift}</span>
          </p>
        </div>
        {open ? <ChevronDown size={15} className="text-slate-400 shrink-0"/> : <ChevronRight size={15} className="text-slate-400 shrink-0"/>}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
          <div className="mt-3 space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <BarChart3 size={10}/> Parts Produced Breakdown
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Good Parts" req><input type="number" min="0" value={assignment.goodParts ?? ""} onChange={e => onChange(assignment.id, { goodParts: Number(e.target.value) })} className={cls} /></Field>
                <Field label="Rework Parts"><input type="number" min="0" value={assignment.reworkParts ?? ""} onChange={e => onChange(assignment.id, { reworkParts: Number(e.target.value) })} className={cls} /></Field>
                <Field label="Rejected Parts"><input type="number" min="0" value={assignment.rejectedParts ?? ""} onChange={e => onChange(assignment.id, { rejectedParts: Number(e.target.value) })} className={cls} /></Field>
              </div>
              <div className="mt-2 p-2 rounded-lg text-xs font-medium border">Total: <strong>{produced}</strong> / <strong>{committed}</strong></div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Package size={10}/> Raw Material Usage</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Raw Material Used (KG)" req><input type="number" min="0" step="0.001" value={assignment.rawMaterialUsedKg ?? ""} onChange={e => onChange(assignment.id, { rawMaterialUsedKg: Number(e.target.value) })} className={`${cls} ${overUsed ? "border-red-400 focus:ring-red-400" : ""}`} /></Field>
                <Field label="Leftover KG"><input readOnly value={used > 0 ? leftover.toFixed(3) : ""} className={`${roCls} ${leftover < 0 ? "text-red-600" : "text-teal-700"}`} /></Field>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Zap size={10}/> Downtime &amp; Shortcomings</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Downtime (minutes)"><input type="number" min="0" value={assignment.downtimeMinutes ?? ""} onChange={e => onChange(assignment.id, { downtimeMinutes: Number(e.target.value) })} className={cls} /></Field>
                <Field label="Shortcoming Category"><select value={assignment.shortcomingCategory ?? "none"} onChange={e => onChange(assignment.id, { shortcomingCategory: e.target.value })} className={cls}><option value="none">None</option><option value="machine_breakdown">Machine Breakdown</option><option value="material_shortage">Material Shortage</option><option value="operator_absent">Operator Absent</option><option value="power_failure">Power Failure</option><option value="program_issue">Program Issue</option><option value="tool_change">Tool Change</option><option value="qa_hold">QA Hold</option><option value="other">Other</option></select></Field>
              </div>
              <Field label="Notes / Observations"><textarea rows={2} value={assignment.shortcomingNotes ?? ""} onChange={e => onChange(assignment.id, { shortcomingNotes: e.target.value })} className={`${cls} resize-none`} /></Field>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
              <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-1.5"><User size={10}/> Operator Confirmation</p>
              <Field label="Confirmed by (Operator Name)" req><input type="text" value={assignment.operatorConfirmedBy ?? ""} onChange={e => onChange(assignment.id, { operatorConfirmedBy: e.target.value })} className={cls} /></Field>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ShiftProductionEntry() {
  const { currentUser, workOrders, updateWorkOrder } = useApp()
  const role = currentUser?.role as UserRole

  const myProcess: ProcessStage | null =
    role === UserRole.PTC_DIE_CASTING  ? "die_casting" :
    role === UserRole.PTC_COATING       ? "coating"      :
    role === UserRole.PTC_CNC_VMC       ? "cnc_vmc"      :
    role === UserRole.ADMIN             ? "die_casting"  :
    null

  const clientId: string = (currentUser as unknown as { clientId?: string })?.clientId ?? ""

  const { pwos, assignments, loading, error, reload } = useShiftData(clientId, myProcess)

  const [selectedPwoId, setSelectedPwoId] = useState<string>("")
  const selectedPwo = pwos.find(p => p.id === selectedPwoId)
  const [editMap, setEditMap] = useState<Record<string, Partial<MachineAssignment>>>({})
  const [saving,  setSaving]  = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => { setEditMap({}); setSaved(false) }, [selectedPwoId])

  const baseAssignments = assignments.filter(a => a.processWoId === selectedPwoId)
  let mergedAssignments = baseAssignments.map(a => ({ ...a, ...editMap[a.id] }))
  if (selectedPwo && mergedAssignments.length === 0) {
    const legacy = workOrders.find(w => w.id === selectedPwo.rootWoId || w.id === selectedPwo.parentWoId)
    if (legacy?.machineProducedMap && Object.keys(legacy.machineProducedMap).length > 0) {
      mergedAssignments = Object.entries(legacy.machineProducedMap).map(([machineId, qty], idx) => ({
        id: `tmp-${selectedPwo.id}-${machineId}-${idx}`,
        processWoId: selectedPwo.id, machineId, machineName: machineId, operatorName: "",
        shiftDate: selectedPwo.shiftDate, shift: selectedPwo.shift, programId: "", programName: "",
        partsCommitted: Number(qty) || 0, producedQty: 0, partsProduced: 0,
        goodParts: 0, reworkParts: 0, rejectedParts: 0, rawMaterialUsedKg: 0, leftoverKg: 0,
        downtimeMinutes: 0, shortcomingCategory: "none", shortcomingNotes: "",
        operatorConfirmedBy: "", operatorConfirmedAt: "", actualsLocked: false,
        ...(editMap[`tmp-${selectedPwo.id}-${machineId}-${idx}`] || {}),
      }))
    }
  }
  const handleChange = (id: string, data: Partial<MachineRowState>) => setEditMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...data } }))
  const pwoAssignments = mergedAssignments
  const perMachineKg = selectedPwo && pwoAssignments.length > 0 ? Number(((selectedPwo.assignedQtyKg ?? 0) / pwoAssignments.length).toFixed(3)) : 0
  const totals = mergedAssignments.reduce((acc, a) => ({ produced: acc.produced + ((a.goodParts ?? 0) + (a.reworkParts ?? 0) + (a.rejectedParts ?? 0)), good: acc.good + (a.goodParts ?? 0), rework: acc.rework + (a.reworkParts ?? 0), rejected: acc.rejected + (a.rejectedParts ?? 0), rawUsed: acc.rawUsed + (a.rawMaterialUsedKg ?? 0), leftover: acc.leftover + Number(((perMachineKg) - (a.rawMaterialUsedKg ?? 0)).toFixed(3)), downtime: acc.downtime + (a.downtimeMinutes ?? 0) }), { produced: 0, good: 0, rework: 0, rejected: 0, rawUsed: 0, leftover: 0, downtime: 0 })
  const allLocked = mergedAssignments.length > 0 && mergedAssignments.every(a => a.actualsLocked)
  const hasUnsaved = Object.keys(editMap).length > 0

  
  const handleSaveDraft = async () => {
    if (!selectedPwo || !clientId || mergedAssignments.length === 0) return
    setSavingDraft(true)
    try {
      const now = new Date().toISOString()
      for (const ma of mergedAssignments) {
        if (ma.actualsLocked) continue
        const edits = editMap[ma.id]
        if (!edits) continue
        const draftPayload = {
          goodParts: Number(edits.goodParts ?? ma.goodParts ?? 0),
          reworkParts: Number(edits.reworkParts ?? ma.reworkParts ?? 0),
          rejectedParts: Number(edits.rejectedParts ?? ma.rejectedParts ?? 0),
          rawMaterialUsedKg: Number(edits.rawMaterialUsedKg ?? ma.rawMaterialUsedKg ?? 0),
          downtimeMinutes: Number(edits.downtimeMinutes ?? ma.downtimeMinutes ?? 0),
          shortcomingCategory: edits.shortcomingCategory ?? ma.shortcomingCategory ?? "none",
          shortcomingNotes: edits.shortcomingNotes ?? ma.shortcomingNotes ?? "",
          operatorConfirmedBy: edits.operatorConfirmedBy ?? ma.operatorConfirmedBy ?? "",
          draftSavedAt: now,
          updatedAt: serverTimestamp(),
        }
        if (String(ma.id).startsWith("tmp-")) {
          await addDoc(collection(db, "clients", clientId, "wo_machine_assignments_v2"), {
            processWoId: selectedPwo.id, machineId: ma.machineId, machineName: ma.machineName, operatorName: ma.operatorName || "",
            shiftDate: ma.shiftDate || selectedPwo.shiftDate, shift: ma.shift || selectedPwo.shift,
            programId: ma.programId || "", programName: ma.programName || "", partsCommitted: ma.partsCommitted || 0,
            producedQty: Number(draftPayload.goodParts) + Number(draftPayload.reworkParts) + Number(draftPayload.rejectedParts),
            ...draftPayload, createdAt: now,
          })
        } else {
          await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", ma.id), draftPayload)
        }
      }
      await addDoc(collection(db, "clients", clientId, "wo_audit_logs"), {
        woId: selectedPwo.parentWoId, processWoId: selectedPwo.id, action: "shift_actuals_draft_saved",
        field: "draft", oldValue: "", newValue: "saved", actorId: currentUser!.id, actorName: currentUser!.name, createdAt: now,
      })
      await reload()
    } finally {
      setSavingDraft(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedPwo || !clientId) return
    for (const ma of mergedAssignments) {
      if (!ma.actualsLocked && !ma.operatorConfirmedBy?.trim()) { alert(`Please enter operator confirmation for machine: ${ma.machineName}`); return }
    }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      for (const ma of mergedAssignments) {
        if (ma.actualsLocked) continue
        const edits = editMap[ma.id] ?? {}
        const good = Number(edits.goodParts ?? ma.goodParts ?? 0)
        const rework = Number(edits.reworkParts ?? ma.reworkParts ?? 0)
        const rejected = Number(edits.rejectedParts ?? ma.rejectedParts ?? 0)
        const used = Number(edits.rawMaterialUsedKg ?? ma.rawMaterialUsedKg ?? 0)
        const payload = { producedQty: good + rework + rejected, partsProduced: good + rework + rejected, goodParts: good, reworkParts: rework, rejectedParts: rejected, rawMaterialUsedKg: used, leftoverKg: Number(((ma.leftoverKg ?? 0) + (perMachineKg - used)).toFixed(3)), downtimeMinutes: Number(edits.downtimeMinutes ?? ma.downtimeMinutes ?? 0), shortcomingCategory: edits.shortcomingCategory ?? ma.shortcomingCategory ?? "none", shortcomingNotes: edits.shortcomingNotes ?? ma.shortcomingNotes ?? "", operatorConfirmedBy: edits.operatorConfirmedBy ?? ma.operatorConfirmedBy ?? "", operatorConfirmedAt: now, actualsLocked: true, updatedAt: serverTimestamp() }
        if (String(ma.id).startsWith("tmp-")) {
          await addDoc(collection(db, "clients", clientId, "wo_machine_assignments_v2"), {
            processWoId: selectedPwo.id, machineId: ma.machineId, machineName: ma.machineName, operatorName: ma.operatorName || "",
            shiftDate: ma.shiftDate || selectedPwo.shiftDate, shift: ma.shift || selectedPwo.shift,
            programId: ma.programId || "", programName: ma.programName || "", partsCommitted: ma.partsCommitted || 0,
            ...payload, createdAt: now,
          })
        } else {
          await updateDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", ma.id), payload)
        }
      }
      await updateDoc(doc(db, "clients", clientId, "process_work_orders_v2", selectedPwo.id), { totalProduced: totals.produced, totalGood: totals.good, totalRework: totals.rework, totalRejected: totals.rejected, totalRawUsedKg: Number(totals.rawUsed.toFixed(3)), totalLeftoverKg: Number(totals.leftover.toFixed(3)), actualsSubmittedAt: now, actualsSubmittedBy: currentUser!.name, status: "completed", updatedAt: serverTimestamp() })
      const legacyWO = workOrders.find(w => w.id === selectedPwo.rootWoId || w.id === selectedPwo.parentWoId)
      if (legacyWO) updateWorkOrder(legacyWO.id, { partsCompleted: (legacyWO.partsCompleted ?? 0) + totals.produced, goodParts: (legacyWO.goodParts ?? 0) + totals.good, reworkParts: (legacyWO.reworkParts ?? 0) + totals.rework, rejectedParts: (legacyWO.rejectedParts ?? 0) + totals.rejected, status: "in_progress" })
      await addDoc(collection(db, "clients", clientId, "wo_audit_logs"), { woId: selectedPwo.parentWoId, processWoId: selectedPwo.id, action: "shift_actuals_submitted", field: "producedQty", oldValue: "0", newValue: String(totals.produced), actorId: currentUser!.id, actorName: currentUser!.name, notes: `Machines: ${mergedAssignments.map(m => m.machineName).join(", ")}. Total raw used: ${totals.rawUsed.toFixed(2)} KG. Downtime: ${totals.downtime} min.`, createdAt: now })
      setSaved(true); setEditMap({}); await reload()
    } catch (e: unknown) {
      alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally { setSaving(false) }
  }

  if (!myProcess) return <div className="p-8 text-center text-slate-400"><Info size={24} className="mx-auto mb-2 opacity-40"/><p className="text-sm">No process assigned to your role.</p></div>

  return <div className="space-y-6 max-w-4xl mx-auto"><div className="flex items-center justify-between flex-wrap gap-3"><div><h2 className="text-2xl font-black text-slate-900">Shift Production Entry</h2><p className="text-sm text-slate-500 mt-0.5">{PROCESS_STAGE_LABELS[myProcess]} · Fill machine-wise actuals after each shift</p></div><button type="button" onClick={reload} disabled={loading} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{loading ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}Refresh</button></div>{error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={15}/>{error}</div>}<div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4"><p className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Calendar size={10}/> Select Process Work Order (SWO)</p><select value={selectedPwoId} onChange={e => setSelectedPwoId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"><option value="">— Select a process work order —</option>{pwos.map(p => <option key={p.id} value={p.id}>{p.processWoNumber} · {p.shiftDate} / {String(p.shift)} · Target: {p.targetParts} parts · {p.actualsSubmittedAt ? "✓ Actuals Submitted" : "Pending actuals"}</option>)}</select></div>{selectedPwo && <div className="space-y-4">{mergedAssignments.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">No machine assignments were found in DB. We loaded fallback machines from SWO allocation if available; you can enter and submit now to create DB assignment rows.</div> : mergedAssignments.map(ma => <MachineRow key={ma.id} assignment={ma} assignedKg={perMachineKg} onChange={handleChange} isLocked={!!ma.actualsLocked} />)}{mergedAssignments.length > 0 && !allLocked && <div className="sticky bottom-4 flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-xl"><div className="flex-1">{saved && <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-bold"><CheckCircle2 size={15}/> Actuals saved successfully</span>}{!saved && hasUnsaved && <span className="text-sm text-amber-700 font-semibold">Unsaved changes — submit to lock actuals in DB</span>}</div><button type="button" onClick={handleSubmit} disabled={saving || !hasUnsaved} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{saving ? <><Loader2 size={15} className="animate-spin"/> Saving…</> : <><Save size={15}/> Submit Shift Actuals</>}</button><button type="button" onClick={handleSaveDraft} disabled={savingDraft || !hasUnsaved} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-300 text-indigo-700 rounded-xl text-sm font-black disabled:opacity-40">{savingDraft ? <><Loader2 size={15} className="animate-spin"/> Saving Draft…</> : "Save Draft"}</button></div>}</div>}</div>
}

type MachineAssignmentDropdownProps = { clientId: string; processWoId?: string; woId?: string }

export function MachineAssignmentDropdown({ clientId, processWoId, woId }: MachineAssignmentDropdownProps) {
  const [assignments, setAssignments] = useState<MachineAssignment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientId) return
    const load = async () => {
      setLoading(true)
      try {
        let resolvedProcessWoId = processWoId
        if (!resolvedProcessWoId && woId) {
          const p1 = await getDocs(query(collection(db, "clients", clientId, "process_work_orders_v2"), where("rootWoId", "==", woId)))
          if (!p1.empty) resolvedProcessWoId = p1.docs[0].id
          if (!resolvedProcessWoId) {
            const p2 = await getDocs(query(collection(db, "clients", clientId, "process_work_orders_v2"), where("parentWoId", "==", woId)))
            if (!p2.empty) resolvedProcessWoId = p2.docs[0].id
          }
        }
        if (!resolvedProcessWoId) { setAssignments([]); return }
        const snap = await getDocs(query(collection(db, "clients", clientId, "wo_machine_assignments_v2"), where("processWoId", "==", resolvedProcessWoId)))
        setAssignments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MachineAssignment, "id">) })))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clientId, processWoId, woId])

  if (loading) return <div className="flex items-center gap-1.5 text-[10px] text-slate-400 py-1"><Loader2 size={10} className="animate-spin"/> Loading machine data…</div>
  if (assignments.length === 0) return <p className="text-[10px] text-slate-400 italic py-1">No machine assignments in DB for this SWO yet.</p>

  return <div className="space-y-1.5"><p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5"><Settings2 size={9}/> Machine-wise Actuals</p><select defaultValue="" className="w-full text-xs border border-indigo-200 rounded-xl px-3 py-2 bg-indigo-50 text-indigo-900 font-semibold" onChange={() => {}}><option value="" disabled>🔧 {assignments.length} machine{assignments.length > 1 ? "s" : ""} — select to view actuals</option>{assignments.map(a => { const produced = (a.goodParts ?? 0) + (a.reworkParts ?? 0) + (a.rejectedParts ?? 0); return <option key={a.id} value={a.id}>{a.machineName}{a.actualsLocked ? ` | ✓ Produced: ${produced} (Good: ${a.goodParts ?? 0} · Rework: ${a.reworkParts ?? 0} · Rejected: ${a.rejectedParts ?? 0}) | Raw Used: ${a.rawMaterialUsedKg ?? 0} KG | Leftover: ${a.leftoverKg ?? 0} KG | Downtime: ${a.downtimeMinutes ?? 0} min | Op: ${a.operatorConfirmedBy || "—"}` : ` | ⏳ Pending actuals | Committed: ${a.partsCommitted} parts`}</option> })}</select>{assignments.some(a => a.actualsLocked) && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">{assignments.filter(a => a.actualsLocked).map(a => { const produced=(a.goodParts ?? 0)+(a.reworkParts ?? 0)+(a.rejectedParts ?? 0); return <div key={a.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2"><p className="text-[10px] font-black text-emerald-800">{a.machineName}</p><p className="text-[10px] text-slate-700">Produced: {produced} (G:{a.goodParts ?? 0} / Rw:{a.reworkParts ?? 0} / Rj:{a.rejectedParts ?? 0})</p><p className="text-[10px] text-slate-700">Raw: {a.rawMaterialUsedKg ?? 0} KG · Leftover: {a.leftoverKg ?? 0} KG · Down: {a.downtimeMinutes ?? 0} min</p></div>})}</div>}</div>
}
