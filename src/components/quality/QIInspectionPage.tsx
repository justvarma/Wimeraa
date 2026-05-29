"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, REASON_CODES,
  type ProcessStage, type Shift, type ReworkEntry, type RejectionEntry, type ShiftConfig,
  type WoMachineAssignmentV2, type ProcessWorkOrderV2,
} from "@/lib/store"
import { getShiftLabel } from "@/lib/shiftUtils"
import {
  Plus, Trash2, CheckCircle2, ClipboardList,
  Eye, ChevronDown, ChevronRight, AlertCircle, ShieldCheck, History,
} from "lucide-react"

// ─── Shared styling ───────────────────────────────────────────────────────────
const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition"
const labelCls = "block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5"

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error && <p className="text-[10px] text-red-500 font-bold mt-1">{error}</p>}
    </div>
  )
}

// ─── Reason Editor ────────────────────────────────────────────────────────────
function ReasonEditor({
  entries, onChange, type, totalAllowed,
}: {
  entries: (ReworkEntry | RejectionEntry)[]
  onChange: (e: (ReworkEntry | RejectionEntry)[]) => void
  type: "rework" | "rejection"
  totalAllowed: number
}) {
  const codes = REASON_CODES[type]
  const usedTotal = entries.reduce((s, e) => s + e.quantity, 0)

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select
            value={entry.reasonCode}
            onChange={e => onChange(entries.map((x, j) => j === i ? { ...x, reasonCode: e.target.value } : x))}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {codes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="number" min="1"
            value={entry.quantity}
            onChange={e => onChange(entries.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
            className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-center"
            placeholder="Qty"
          />
          <button
            type="button"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {usedTotal < totalAllowed && (
        <button
          type="button"
          onClick={() => onChange([...entries, { reasonCode: codes[0], quantity: 1 }])}
          className="flex items-center gap-1 text-xs font-black text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
        >
          <Plus size={12} /> Add reason
        </button>
      )}
      {totalAllowed > 0 && (
        <p className={`text-[10px] font-bold ${usedTotal === totalAllowed ? "text-emerald-600" : "text-amber-600"}`}>
          {usedTotal} / {totalAllowed} parts assigned to reasons
        </p>
      )}
    </div>
  )
}

// ─── Previous Shift Card ──────────────────────────────────────────────────────
function PrevShiftCard({ inspection, shifts }: { inspection: ReturnType<typeof usePrevInspections>[0]; shifts: ShiftConfig[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition text-sm font-bold text-slate-700"
      >
        <span className="flex items-center gap-2">
          <History size={14} className="text-slate-500" />
          {inspection.date} — {getShiftLabel(shifts, inspection.shift as Shift)} — {inspection.partName}
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
            <p className="text-xs text-emerald-600 font-black uppercase tracking-widest">Good</p>
            <p className="text-2xl font-black text-emerald-700">{inspection.goodPartCount}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
            <p className="text-xs text-amber-600 font-black uppercase tracking-widest">Rework</p>
            <p className="text-2xl font-black text-amber-700">{inspection.reworkCount}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
            <p className="text-xs text-red-600 font-black uppercase tracking-widest">Rejected</p>
            <p className="text-2xl font-black text-red-700">{inspection.rejectedCount}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-600 font-black uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black text-slate-700">{inspection.producedPartCount}</p>
          </div>
          {inspection.reworkEntries.length > 0 && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Rework Reasons</p>
              {inspection.reworkEntries.map((e, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5 border-b border-amber-100 last:border-0">
                  <span>{e.reasonCode}</span><span className="font-bold">{e.quantity} pcs</span>
                </div>
              ))}
            </div>
          )}
          {inspection.rejectionEntries.length > 0 && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-1">Rejection Reasons</p>
              {inspection.rejectionEntries.map((e, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-600 py-0.5 border-b border-red-100 last:border-0">
                  <span>{e.reasonCode}</span><span className="font-bold">{e.quantity} pcs</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function usePrevInspections(process: ProcessStage, inspections: ReturnType<typeof useApp>["qiInspections"]) {
  return useMemo(() =>
    [...inspections]
      .filter(i => i.process === process)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    [process, inspections])
}

// ─── THEME per process ────────────────────────────────────────────────────────
const THEME: Record<ProcessStage, { accent: string; badge: string; header: string; icon: string }> = {
  die_casting: {
    accent: "border-orange-400 bg-orange-50",
    badge: "bg-orange-100 text-orange-800 border border-orange-200",
    header: "text-orange-900",
    icon: "🔥",
  },
  coating: {
    accent: "border-purple-400 bg-purple-50",
    badge: "bg-purple-100 text-purple-800 border border-purple-200",
    header: "text-purple-900",
    icon: "🎨",
  },
  cnc_vmc: {
    accent: "border-cyan-400 bg-cyan-50",
    badge: "bg-cyan-100 text-cyan-800 border border-cyan-200",
    header: "text-cyan-900",
    icon: "⚙️",
  },
}

const PROCESS_LABEL: Record<ProcessStage, string> = {
  die_casting: "Die Casting",
  coating: "Coating",
  cnc_vmc: "CNC/VMC Machining",
}

// ─── Machine-wise QI form state ──────────────────────────────────────────────
interface MachineQiForm {
  goodPartCount: string
  reworkCount: string
  reworkEntries: ReworkEntry[]
  rejectedCount: string
  rejectionEntries: RejectionEntry[]
}

const getAssignmentProduced = (assignment: Pick<WoMachineAssignmentV2, "partsProduced" | "producedQty">) =>
  Number(assignment.partsProduced ?? assignment.producedQty ?? 0)

const isProductionComplete = (assignment: Pick<WoMachineAssignmentV2, "partsCommitted" | "partsProduced" | "producedQty" | "actualsLocked">) =>
  Boolean(assignment.actualsLocked) && getAssignmentProduced(assignment) >= Number(assignment.partsCommitted || 0)

const blankMachineQiForm = (): MachineQiForm => ({
  goodPartCount: "",
  reworkCount: "",
  reworkEntries: [],
  rejectedCount: "",
  rejectionEntries: [],
})

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function QIInspectionPage({ process }: { process: ProcessStage }) {
  const {
    currentUser, workOrders, qiInspections, addQIInspection, shifts,
    processWorkOrdersV2, woMachineAssignmentsV2, updateWoMachineAssignmentV2, updateProcessWorkOrderV2,
  } = useApp()
  const theme = THEME[process]

  const [submitted, setSubmitted] = useState(false)
  const [showPrev, setShowPrev] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [machineQiForms, setMachineQiForms] = useState<Record<string, MachineQiForm>>({})
  const [submittingMachineId, setSubmittingMachineId] = useState<string | null>(null)

  const prevInspections = usePrevInspections(process, qiInspections)

  const processPwoById = useMemo(() => {
    const map = new Map<string, ProcessWorkOrderV2>()
    for (const pwo of processWorkOrdersV2) {
      if (pwo.processType === process) map.set(pwo.id, pwo)
    }
    return map
  }, [processWorkOrdersV2, process])

  const machineAssignmentsReadyForQi = useMemo(() =>
    woMachineAssignmentsV2
      .filter(assignment => {
        const pwo = processPwoById.get(assignment.processWoId)
        return Boolean(pwo) &&
          isProductionComplete(assignment) &&
          (!assignment.qiInspectedAt || assignment.pdcApprovalStatus === "rejected")
      })
      .sort((a, b) => `${a.shiftDate}-${String(a.shift)}-${a.machineName}`.localeCompare(`${b.shiftDate}-${String(b.shift)}-${b.machineName}`)),
    [woMachineAssignmentsV2, processPwoById])


  const getMachineQiForm = (assignment: WoMachineAssignmentV2): MachineQiForm => ({
    ...blankMachineQiForm(),
    ...(machineQiForms[assignment.id] ?? {
      goodPartCount: String(assignment.goodParts ?? ""),
      reworkCount: String(assignment.reworkParts ?? ""),
      reworkEntries: assignment.reworkEntries ?? [],
      rejectedCount: String(assignment.rejectedParts ?? ""),
      rejectionEntries: assignment.rejectionEntries ?? [],
    }),
  })

  const setMachineQiForm = (assignmentId: string, data: Partial<MachineQiForm>) => {
    setMachineQiForms(prev => ({
      ...prev,
      [assignmentId]: { ...blankMachineQiForm(), ...(prev[assignmentId] ?? {}), ...data },
    }))
  }


  const submitMachineInspection = async (assignment: WoMachineAssignmentV2) => {
    if (!currentUser || submittingMachineId) return
    const machineForm = getMachineQiForm(assignment)
    const machineProduced = getAssignmentProduced(assignment)
    const machineGood = parseInt(machineForm.goodPartCount) || 0
    const machineRework = parseInt(machineForm.reworkCount) || 0
    const machineRejected = parseInt(machineForm.rejectedCount) || 0
    const machineClassified = machineGood + machineRework + machineRejected

    if (machineProduced <= 0) {
      alert("No completed production quantity found for this machine.")
      return
    }
    if (machineClassified !== machineProduced) {
      alert(`Good + Rework + Rejected must equal Produced (${machineClassified} ≠ ${machineProduced}) for ${assignment.machineName}.`)
      return
    }
    const reworkReasonTotal = machineForm.reworkEntries.reduce((sum, entry) => sum + entry.quantity, 0)
    if (machineRework > 0 && reworkReasonTotal !== machineRework) {
      alert(`Rework reason quantities (${reworkReasonTotal}) must equal rework count (${machineRework}) for ${assignment.machineName}.`)
      return
    }
    const rejectionReasonTotal = machineForm.rejectionEntries.reduce((sum, entry) => sum + entry.quantity, 0)
    if (machineRejected > 0 && rejectionReasonTotal !== machineRejected) {
      alert(`Rejection reason quantities (${rejectionReasonTotal}) must equal rejected count (${machineRejected}) for ${assignment.machineName}.`)
      return
    }

    const pwo = processPwoById.get(assignment.processWoId)
    if (!pwo) {
      alert("The process work order for this machine assignment is no longer available.")
      return
    }

    setSubmittingMachineId(assignment.id)
    try {
      const now = new Date().toISOString()
      const qaStatus = machineRejected > 0 ? "rejected" : machineRework > 0 ? "rework" : "approved"
      await updateWoMachineAssignmentV2(assignment.id, {
        goodParts: machineGood,
        reworkParts: machineRework,
        rejectedParts: machineRejected,
        reworkQty: machineRework,
        rejectedQty: machineRejected,
        reworkEntries: machineForm.reworkEntries,
        rejectionEntries: machineForm.rejectionEntries,
        qiInspectedBy: currentUser.name,
        qiInspectedById: currentUser.id,
        qiInspectedAt: now,
        qaStatus,
        pdcApprovalStatus: "pending",
        pdcRejectedReason: "",
        updatedAt: now,
      })

      const siblingAssignments = woMachineAssignmentsV2.filter(item => item.processWoId === assignment.processWoId)
      const nextAssignments = siblingAssignments.map(item => item.id === assignment.id ? {
        ...item,
        goodParts: machineGood,
        reworkParts: machineRework,
        rejectedParts: machineRejected,
        qaStatus,
        pdcApprovalStatus: "pending" as const,
      } : item)
      const readySiblings = nextAssignments.filter(item => isProductionComplete(item))
      const allReadySiblingsClassified = readySiblings.length > 0 && readySiblings.every(item => ["approved", "rework", "rejected"].includes(item.qaStatus || "pending"))
      await updateProcessWorkOrderV2(assignment.processWoId, {
        totalGood: nextAssignments.reduce((sum, item) => sum + Number(item.goodParts ?? 0), 0),
        totalRework: nextAssignments.reduce((sum, item) => sum + Number(item.reworkParts ?? 0), 0),
        totalRejected: nextAssignments.reduce((sum, item) => sum + Number(item.rejectedParts ?? 0), 0),
        qiCompletedAt: allReadySiblingsClassified ? now : "",
        qiCompletedBy: allReadySiblingsClassified ? currentUser.name : "",
        updatedAt: now,
      })

      const sourceWO = workOrders.find(wo => wo.id === pwo.rootWoId || wo.id === pwo.parentWoId)
      await addQIInspection({
        process,
        date: new Date().toISOString().split("T")[0],
        masterId: sourceWO?.masterId || pwo.processWoNumber,
        partId: sourceWO?.partId || pwo.processWoNumber,
        partName: sourceWO?.partName || pwo.processWoNumber,
        shift: assignment.shift as Shift,
        machine: assignment.machineName,
        producedPartCount: machineProduced,
        goodPartCount: machineGood,
        reworkCount: machineRework,
        reworkEntries: machineForm.reworkEntries,
        rejectedCount: machineRejected,
        rejectionEntries: machineForm.rejectionEntries,
        inspectedBy: currentUser.name,
        inspectedById: currentUser.id,
        workOrderId: sourceWO?.id || assignment.processWoId,
        operator: assignment.operatorName,
        assignedQiId: sourceWO?.assignedQiId,
        processWoId: assignment.processWoId,
        machineAssignmentId: assignment.id,
        machineId: assignment.machineId,
      })

      setMachineQiForms(prev => {
        const next = { ...prev }
        delete next[assignment.id]
        return next
      })
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Unable to submit machine-wise QI classification.")
    } finally {
      setSubmittingMachineId(null)
    }
  }

  // Auth check — scoped QI roles can only access their own process; QUALITY_INSPECTOR + ADMIN + FQI see all
  const role = currentUser?.role as UserRole
  const SCOPED_MAP: Partial<Record<UserRole, string>> = {
    [UserRole.QI_DIE_CASTING]: "die_casting",
    [UserRole.QI_COATING]:     "coating",
    [UserRole.QI_MACHINING]:   "cnc_vmc",
  }
  const isScopedToThisProcess = SCOPED_MAP[role] === process
  const isFullAccess = role === UserRole.QUALITY_INSPECTOR || role === UserRole.ADMIN || role === UserRole.FQI
  const canAccess = isFullAccess || isScopedToThisProcess

  // History records
  const historyRecords = useMemo(() =>
    [...qiInspections]
      .filter(i => i.process === process)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [qiInspections, process])

  if (!canAccess) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <AlertCircle size={48} className="text-red-400 mb-4" />
      <p className="text-slate-500 font-medium">Access restricted to Quality Inspectors.</p>
    </div>
  )

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">{theme.icon}</span>
            <h1 className="text-3xl font-black text-slate-900">
              QI — {PROCESS_LABEL[process]}
            </h1>
          </div>
          <p className="text-slate-500 ml-12">In-process quality inspection for {PROCESS_LABEL[process]} stage</p>
        </div>
        <button
          onClick={() => setShowHistory(h => !h)}
          className="flex items-center gap-2 text-sm font-bold text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2 hover:bg-slate-50 transition"
        >
          <Eye size={15} />
          {showHistory ? "Hide History" : "View History"}
        </button>
      </header>

      {/* Previous shift data */}
      <section className={`rounded-2xl border-2 ${theme.accent} overflow-hidden`}>
        <button
          onClick={() => setShowPrev(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 font-black text-sm text-slate-700"
        >
          <span className="flex items-center gap-2">
            <History size={16} />
            Previous Shift Inspection Data ({prevInspections.length} records)
          </span>
          {showPrev ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showPrev && (
          <div className="px-6 pb-6 space-y-3">
            {prevInspections.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-2">No previous inspections for this process.</p>
            ) : prevInspections.map(i => (
              <PrevShiftCard key={i.id} inspection={i} shifts={shifts} />
            ))}
          </div>
        )}
      </section>

      {/* Success banner */}
      {submitted && (
        <div className="flex items-center gap-3 bg-emerald-50 border-2 border-emerald-300 text-emerald-800 rounded-2xl px-6 py-4 font-bold animate-pulse">
          <CheckCircle2 size={22} />
          Machine QI report submitted to PDC for approval!
        </div>
      )}

      {/* Machine-wise QI classification from PDC actuals */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <ShieldCheck size={20} className="text-emerald-600" />
          <div>
            <h2 className="font-black text-slate-900">Machine-wise QI Classification</h2>
            <p className="text-xs text-slate-500 mt-0.5">Classify completed PDC machine output, then submit the report to the PDC subrole for approval.</p>
          </div>
          <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${theme.badge}`}>
            {machineAssignmentsReadyForQi.length} Pending
          </span>
        </div>
        {machineAssignmentsReadyForQi.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No completed PDC machine actuals are pending QI classification for {PROCESS_LABEL[process]}.
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {machineAssignmentsReadyForQi.map(assignment => {
              const machineForm = getMachineQiForm(assignment)
              const machineProduced = getAssignmentProduced(assignment)
              const machineGood = parseInt(machineForm.goodPartCount) || 0
              const machineRework = parseInt(machineForm.reworkCount) || 0
              const machineRejected = parseInt(machineForm.rejectedCount) || 0
              const machineClassified = machineGood + machineRework + machineRejected
              const machineBalanced = machineProduced > 0 && machineClassified === machineProduced
              const machinePwo = processPwoById.get(assignment.processWoId)
              const isSubmittingThisMachine = submittingMachineId === assignment.id

              return (
                <div key={assignment.id} className="rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-black text-slate-900">{assignment.machineName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {machinePwo?.processWoNumber || assignment.processWoId} · {assignment.shiftDate} / {getShiftLabel(shifts, assignment.shift as Shift)} · Operator: {assignment.operatorName || "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Produced</p>
                        <p className="text-lg font-black text-indigo-700">{machineProduced}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Committed</p>
                        <p className="text-lg font-black text-slate-700">{assignment.partsCommitted}</p>
                      </div>
                      <div className={`rounded-xl border px-3 py-2 ${machineBalanced ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}>
                        <p className={`text-[9px] font-black uppercase tracking-widest ${machineBalanced ? "text-emerald-500" : "text-amber-500"}`}>Balance</p>
                        <p className={`text-lg font-black ${machineBalanced ? "text-emerald-700" : "text-amber-700"}`}>{machineClassified}/{machineProduced}</p>
                      </div>
                    </div>
                  </div>

                  {assignment.pdcApprovalStatus === "rejected" && assignment.pdcRejectedReason && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-bold">
                      PDC rejected this report: {assignment.pdcRejectedReason}. Please correct and resubmit for approval.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Good Parts">
                      <input
                        type="number" min="0" max={machineProduced}
                        value={machineForm.goodPartCount}
                        onChange={e => setMachineQiForm(assignment.id, { goodPartCount: e.target.value })}
                        className={`${inputCls} border-emerald-300 focus:ring-emerald-400`}
                        placeholder="Accepted"
                      />
                    </Field>
                    <Field label="Rework Parts">
                      <input
                        type="number" min="0" max={machineProduced}
                        value={machineForm.reworkCount}
                        onChange={e => setMachineQiForm(assignment.id, {
                          reworkCount: e.target.value,
                          ...(Number(e.target.value) === 0 ? { reworkEntries: [] } : {}),
                        })}
                        className={`${inputCls} border-amber-300 focus:ring-amber-400`}
                        placeholder="Rework"
                      />
                    </Field>
                    <Field label="Rejected Parts">
                      <input
                        type="number" min="0" max={machineProduced}
                        value={machineForm.rejectedCount}
                        onChange={e => setMachineQiForm(assignment.id, {
                          rejectedCount: e.target.value,
                          ...(Number(e.target.value) === 0 ? { rejectionEntries: [] } : {}),
                        })}
                        className={`${inputCls} border-red-300 focus:ring-red-400`}
                        placeholder="Rejected"
                      />
                    </Field>
                  </div>

                  {machineRework > 0 && (
                    <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3">
                      <p className="font-black text-amber-900 text-sm">Rework Reasons <span className="text-amber-600 font-bold">({machineRework} parts)</span></p>
                      <ReasonEditor
                        entries={machineForm.reworkEntries}
                        onChange={entries => setMachineQiForm(assignment.id, { reworkEntries: entries })}
                        type="rework"
                        totalAllowed={machineRework}
                      />
                    </div>
                  )}

                  {machineRejected > 0 && (
                    <div className="border border-red-200 bg-red-50 rounded-2xl p-4 space-y-3">
                      <p className="font-black text-red-900 text-sm">Rejection Reasons <span className="text-red-600 font-bold">({machineRejected} parts)</span></p>
                      <ReasonEditor
                        entries={machineForm.rejectionEntries}
                        onChange={entries => setMachineQiForm(assignment.id, { rejectionEntries: entries })}
                        type="rejection"
                        totalAllowed={machineRejected}
                      />
                    </div>
                  )}

                  <div className={`rounded-xl px-4 py-3 text-sm font-bold ${machineBalanced ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                    {machineBalanced
                      ? `Balanced: ${machineGood} Good + ${machineRework} Rework + ${machineRejected} Rejected = ${machineProduced} Produced`
                      : `Classified total must equal produced parts (${machineClassified} / ${machineProduced}).`}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => submitMachineInspection(assignment)}
                      disabled={isSubmittingThisMachine}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl transition shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShieldCheck size={16} />
                      {isSubmittingThisMachine ? "Submitting..." : "Submit to PDC Approval"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* History table */}
      {showHistory && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <ClipboardList size={18} className="text-slate-500" />
            <h2 className="font-black text-slate-900">Inspection History — {PROCESS_LABEL[process]}</h2>
            <span className="ml-auto text-xs font-bold text-slate-400">{historyRecords.length} records</span>
          </div>
          {historyRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No inspections recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "WO / Master ID", "Part", "Shift", "Machine", "Produced", "Good", "Rework", "Rejected", "Inspector"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyRecords.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700">{r.masterId}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap max-w-[160px] truncate" title={r.partName}>{r.partName}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{getShiftLabel(shifts, r.shift)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{r.machine.split("—")[0].trim()}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{r.producedPartCount}</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{r.goodPartCount}</td>
                      <td className="px-4 py-3 font-bold text-amber-700">{r.reworkCount}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{r.rejectedCount}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{r.inspectedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}