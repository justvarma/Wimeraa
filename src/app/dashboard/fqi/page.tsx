"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, SHIFT_LABELS, MACHINES, REASON_CODES, PROCESS_STAGE_LABELS,
  FQI_DISPOSITION_LABELS,
  type ProcessStage, type Shift, type ReworkEntry, type RejectionEntry, type FQIDisposition,
  type WorkOrder,
} from "@/lib/store"
import {
  Plus, Trash2, CheckCircle2, AlertTriangle, XCircle, ClipboardList,
  Eye, ChevronDown, ChevronRight, AlertCircle, Award, History,
  Package, ArrowRight, RotateCcw, Scale, Info, TrendingDown,
  GitBranch, ExternalLink,
} from "lucide-react"

// ─── Shared styling ───────────────────────────────────────────────────────────
const inputCls =
  "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-rose-400 outline-none bg-white transition"
const labelCls = "block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5"

function Field({
  label, children, error, hint,
}: { label: string; children: React.ReactNode; error?: string; hint?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1 italic">{hint}</p>}
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
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-rose-400 outline-none"
          >
            {codes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="number" min="1"
            value={entry.quantity}
            onChange={e => onChange(entries.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))}
            className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-rose-400 outline-none text-center"
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
          className="flex items-center gap-1 text-xs font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition"
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

// ─── Process badge ────────────────────────────────────────────────────────────
function ProcessBadge({ p }: { p: ProcessStage }) {
  const cls =
    p === "die_casting" ? "bg-orange-100 text-orange-800 border-orange-200" :
    p === "coating"     ? "bg-purple-100 text-purple-800 border-purple-200" :
                          "bg-cyan-100 text-cyan-800 border-cyan-200"
  const icon = p === "die_casting" ? "🔥" : p === "coating" ? "🎨" : "⚙️"
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-widest ${cls}`}>
      {icon} {PROCESS_STAGE_LABELS[p]}
    </span>
  )
}

// ─── Disposition badge ────────────────────────────────────────────────────────
function DispositionBadge({ d }: { d: FQIDisposition }) {
  const cfg = {
    finished_goods: { cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <Award size={11} /> },
    rework_loop:    { cls: "bg-amber-100 text-amber-800 border-amber-200",   icon: <RotateCcw size={11} /> },
    rejected:       { cls: "bg-red-100 text-red-800 border-red-200",         icon: <XCircle size={11} /> },
  }[d]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border ${cfg.cls}`}>
      {cfg.icon}
      {d === "finished_goods" ? "Finished Goods" : d === "rework_loop" ? "Rework Loop" : "Rejected"}
    </span>
  )
}

// ─── Previous QI data panel ───────────────────────────────────────────────────
function QIHistoryPanel({
  workOrderId, qiInspections,
}: {
  workOrderId: string
  qiInspections: ReturnType<typeof useApp>["qiInspections"]
}) {
  const [open, setOpen] = useState(true)
  const records = useMemo(() =>
    [...qiInspections]
      .filter(q => q.workOrderId === workOrderId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [workOrderId, qiInspections])

  if (records.length === 0) return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500 italic">
      No QI inspection records found for this work order.
    </div>
  )

  return (
    <div className="border border-emerald-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-emerald-50 hover:bg-emerald-100 transition text-sm font-black text-emerald-800"
      >
        <span className="flex items-center gap-2">
          <History size={14} />
          QI Records for this Work Order ({records.length})
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="divide-y divide-emerald-100">
          {records.map(r => (
            <div key={r.id} className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-white">
              <div>
                <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Date / Shift</p>
                <p className="font-bold text-slate-700">{r.date}</p>
                <p className="text-slate-500 capitalize">{r.shift}</p>
              </div>
              <div className="grid grid-cols-3 col-span-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-center">
                  <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">Good</p>
                  <p className="text-lg font-black text-emerald-700">{r.goodPartCount}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-center">
                  <p className="text-[9px] text-amber-600 font-black uppercase tracking-widest">Rework</p>
                  <p className="text-lg font-black text-amber-700">{r.reworkCount}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-2 text-center">
                  <p className="text-[9px] text-red-600 font-black uppercase tracking-widest">Rejected</p>
                  <p className="text-lg font-black text-red-700">{r.rejectedCount}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Blank form ───────────────────────────────────────────────────────────────
interface FormState {
  date: string
  workOrderId: string
  shift: Shift | ""
  machine: string
  producedPartCount: string
  goodPartCount: string
  reworkCount: string
  reworkEntries: ReworkEntry[]
  rejectedCount: string
  rejectionEntries: RejectionEntry[]
  inputWeightKg: string
  outputWeightKg: string
  disposition: FQIDisposition
  notes: string
}

function blank(): FormState {
  return {
    date: new Date().toISOString().split("T")[0],
    workOrderId: "",
    shift: "",
    machine: "",
    producedPartCount: "",
    goodPartCount: "",
    reworkCount: "",
    reworkEntries: [],
    rejectedCount: "",
    rejectionEntries: [],
    inputWeightKg: "",
    outputWeightKg: "",
    disposition: "finished_goods",
    notes: "",
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function FQIPage() {
  const { currentUser, workOrders, qiInspections, fqiInspections, addFQIInspection, updateWorkOrder, addWorkOrder, shifts } = useApp()

  const [form, setForm] = useState<FormState>(blank())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showPrevFQI, setShowPrevFQI] = useState(true)
  // SWO creation state — set after a rework_loop FQI is saved
  const shiftOptions: Shift[] = shifts.length > 0
    ? [...shifts].sort((a, b) => a.order - b.order).map(s => s.id)
    : ["shift_1", "shift_2"]

  const [pendingSWO, setPendingSWO] = useState<{
    parentWo: WorkOrder
    reworkCount: number
    reworkCycle: number
    fqiId: string
  } | null>(null)
  const [swoCreated, setSwoCreated] = useState(false)

  // All completed / in-progress WOs (FQI only applies after all processes done)
  const eligibleWOs = useMemo(() =>
    workOrders.filter(wo => wo.status === "completed" || wo.status === "in_progress"),
    [workOrders])

  const selectedWO = useMemo(() =>
    eligibleWOs.find(wo => wo.id === form.workOrderId) ?? null,
    [eligibleWOs, form.workOrderId])

  // Recent FQI records (previous shift data for review)
  const recentFQI = useMemo(() =>
    [...fqiInspections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [fqiInspections])

  // Machines for selected WO's process
  const machines = useMemo(() => {
    if (!selectedWO) return MACHINES.filter(m => m.status !== "inactive")
    return MACHINES.filter(m => m.process === selectedWO.process && m.status !== "inactive")
  }, [selectedWO])

  // Derived numbers
  const produced = parseInt(form.producedPartCount) || 0
  const good = parseInt(form.goodPartCount) || 0
  const rework = parseInt(form.reworkCount) || 0
  const rejected = parseInt(form.rejectedCount) || 0
  const sumCheck = good + rework + rejected
  const inputKg = parseFloat(form.inputWeightKg) || 0
  const outputKg = parseFloat(form.outputWeightKg) || 0
  const scrapKg = inputKg > 0 ? Math.max(0, parseFloat((inputKg - outputKg).toFixed(3))) : 0

  const set = (k: keyof FormState, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.date) errs.date = "Date is required"
    if (!form.workOrderId) errs.workOrderId = "Work order is required"
    if (!form.shift) errs.shift = "Shift is required"
    if (!form.machine) errs.machine = "Machine is required"
    if (!form.producedPartCount || produced <= 0) errs.producedPartCount = "Produced count is required"
    if (!form.goodPartCount || good < 0) errs.goodPartCount = "Good count is required"
    if (!form.reworkCount || rework < 0) errs.reworkCount = "Rework count is required"
    if (!form.rejectedCount || rejected < 0) errs.rejectedCount = "Rejected count is required"
    if (produced > 0 && sumCheck !== produced)
      errs.balance = `Good + Rework + Rejected must equal Produced (${sumCheck} ≠ ${produced})`
    if (rework > 0 && form.reworkEntries.length === 0)
      errs.reworkEntries = "Rework reasons are required when rework count > 0"
    if (rework > 0) {
      const t = form.reworkEntries.reduce((s, e) => s + e.quantity, 0)
      if (t !== rework) errs.reworkEntries = `Rework reason quantities (${t}) must equal rework count (${rework})`
    }
    if (rejected > 0 && form.rejectionEntries.length === 0)
      errs.rejectionEntries = "Rejection reasons are required when rejected count > 0"
    if (rejected > 0) {
      const t = form.rejectionEntries.reduce((s, e) => s + e.quantity, 0)
      if (t !== rejected) errs.rejectionEntries = `Rejection reason quantities (${t}) must equal rejected count (${rejected})`
    }
    if (!form.inputWeightKg || inputKg <= 0) errs.inputWeightKg = "Input weight is required"
    if (!form.outputWeightKg || outputKg < 0) errs.outputWeightKg = "Output weight is required"
    if (outputKg > inputKg) errs.outputWeightKg = "Output weight cannot exceed input weight"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    const wo = selectedWO!
    addFQIInspection({
      date: form.date,
      masterId: wo.masterId,
      partId: wo.partId,
      partName: wo.partName,
      shift: form.shift as Shift,
      machine: form.machine,
      process: wo.process,
      workOrderId: wo.id,
      producedPartCount: produced,
      goodPartCount: good,
      reworkCount: rework,
      reworkEntries: form.reworkEntries,
      rejectedCount: rejected,
      rejectionEntries: form.rejectionEntries,
      inputWeightKg: inputKg,
      outputWeightKg: outputKg,
      scrapWeightKg: scrapKg,
      disposition: form.disposition,
      finishedGoodsCount: form.disposition === "finished_goods" ? good : 0,
      reworkLoopCount: form.disposition === "rework_loop" ? rework : 0,
      rejectedReturnCount: rejected,
      inspectedBy: currentUser!.name,
      inspectedById: currentUser!.id,
      notes: form.notes.trim(),
    })
    // Update WorkOrder with FQI results so WO cards reflect accurate part counts
    updateWorkOrder(wo.id, {
      goodParts:     wo.goodParts     + good,
      reworkParts:   wo.reworkParts   + rework,
      rejectedParts: wo.rejectedParts + rejected,
      qiApproval:    currentUser!.name,
    })
    // If rework_loop: prepare SWO creation prompt
    if (form.disposition === "rework_loop" && rework > 0) {
      // Count existing rework SWOs for this WO to determine cycle number
      const existingSWOs = workOrders.filter(w => w.parentWoId === wo.id && w.woType === "rework")
      const cycleNumber  = existingSWOs.length + 1
      // We use a stable temp ID for linking; actual FQI id is set by provider
      const fqiTempId = `fqi-pending-${Date.now()}`
      setPendingSWO({ parentWo: wo, reworkCount: rework, reworkCycle: cycleNumber, fqiId: fqiTempId })
      setSwoCreated(false)
    }
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setForm(blank())
    }, 3500)
  }

  const handleCreateSWO = () => {
    if (!pendingSWO) return
    const { parentWo, reworkCount, reworkCycle } = pendingSWO
    addWorkOrder({
      // Inherit part + process identity from parent WO
      date:                 new Date().toISOString().split("T")[0],
      masterId:             parentWo.masterId,
      partId:               parentWo.partId,
      partName:             parentWo.partName,
      process:              parentWo.process,
      targetPartNos:        reworkCount,
      requiredQuantityKg:   parseFloat((reworkCount * (parentWo.weightPerPart || 0)).toFixed(3)),
      workOrderStartDate:   new Date().toISOString().split("T")[0],
      dueDate:              parentWo.dueDate,
      // Phase 2 fields — left blank for process PTC to fill
      materialGrade: "", rawMaterialId: "", rawMaterialGrade: "",
      shift: "" as "shift_1" | "shift_2" | "shift_2" | "",
      machine: "", operator: "",
      actualTarget: reworkCount, partPerCycle: parentWo.partPerCycle,
      weightPerPart: parentWo.weightPerPart, actualOutputKg: 0,
      acceptancePoints: parentWo.acceptancePoints,
      cycleTimeMinutes: parentWo.cycleTimeMinutes,
      isExternal: false,
      // Progress
      partsCompleted: 0, goodParts: 0, reworkParts: 0, rejectedParts: 0,
      scrapWeight: 0, inputWeightKg: 0,
      // Status
      status: "draft",
      productionStarted: false,
      createdBy: currentUser!.name,
      // SWO traceability fields
      woType:              "rework",
      parentWoId:          parentWo.id,
      reworkCycleNumber:   reworkCycle,
      reworkPartCount:     reworkCount,
    })
    setSwoCreated(true)
    setPendingSWO(null)
  }

  // Auth check
  const canAccess = currentUser?.role === UserRole.FQI || currentUser?.role === UserRole.ADMIN
  if (!canAccess) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <AlertCircle size={48} className="text-red-400 mb-4" />
      <p className="text-slate-500 font-medium">Access restricted to Final Quality Inspectors.</p>
    </div>
  )

  return (
    <div className="space-y-8 max-w-5xl">

      {/* ── Header ── */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-rose-600 rounded-2xl flex items-center justify-center shrink-0">
              <Award size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900">Final Quality Inspection</h1>
          </div>
          <p className="text-slate-500 ml-[52px]">
            Final gate before parts are classified as Finished Goods — across all process stages.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(h => !h)}
          className="flex items-center gap-2 text-sm font-bold text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2.5 hover:bg-slate-50 transition"
        >
          <Eye size={15} />
          {showHistory ? "Hide History" : "View FQI History"}
        </button>
      </header>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total FQI Records",   value: fqiInspections.length,                                           color: "bg-rose-50 border-rose-200 text-rose-700" },
          { label: "Finished Goods Batches", value: fqiInspections.filter(f => f.disposition === "finished_goods").length, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { label: "Rework Loop Batches", value: fqiInspections.filter(f => f.disposition === "rework_loop").length,     color: "bg-amber-50 border-amber-200 text-amber-700" },
          { label: "Rejected Batches",    value: fqiInspections.filter(f => f.disposition === "rejected").length,        color: "bg-red-50 border-red-200 text-red-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.color}`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Previous FQI / shift data review ── */}
      <section className="rounded-2xl border-2 border-rose-200 bg-rose-50 overflow-hidden">
        <button
          onClick={() => setShowPrevFQI(p => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-black text-rose-900"
        >
          <span className="flex items-center gap-2">
            <History size={16} />
            Previous Shift &amp; Historical FQI Data ({recentFQI.length} recent records)
          </span>
          {showPrevFQI ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showPrevFQI && (
          <div className="px-6 pb-6 space-y-3">
            {recentFQI.length === 0 ? (
              <p className="text-sm text-rose-700 italic py-2">No previous FQI inspections recorded.</p>
            ) : recentFQI.map(r => (
              <div key={r.id} className="bg-white border border-rose-100 rounded-2xl px-5 py-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-black text-slate-800 text-sm">{r.partName}</span>
                  <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{r.masterId}</span>
                  <ProcessBadge p={r.process} />
                  <DispositionBadge d={r.disposition} />
                  <span className="ml-auto text-xs text-slate-400">{r.date} · {r.shift}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-emerald-600 font-black uppercase">Good</p>
                    <p className="text-base font-black text-emerald-700">{r.goodPartCount}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-amber-600 font-black uppercase">Rework</p>
                    <p className="text-base font-black text-amber-700">{r.reworkCount}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-red-600 font-black uppercase">Rejected</p>
                    <p className="text-base font-black text-red-700">{r.rejectedCount}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-slate-500 font-black uppercase">Input KG</p>
                    <p className="text-base font-black text-slate-700">{r.inputWeightKg}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-slate-500 font-black uppercase">Output KG</p>
                    <p className="text-base font-black text-slate-700">{r.outputWeightKg}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-orange-600 font-black uppercase">Scrap KG</p>
                    <p className="text-base font-black text-orange-700">{r.scrapWeightKg}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Success banner ── */}
      {submitted && (
        <div className="flex items-center gap-3 bg-emerald-50 border-2 border-emerald-300 text-emerald-800 rounded-2xl px-6 py-4 font-bold">
          <CheckCircle2 size={22} />
          FQI record submitted successfully! Parts classified and disposition applied.
        </div>
      )}

      {/* ── SWO Creation Prompt (shown after rework_loop FQI is saved) ── */}
      {pendingSWO && !swoCreated && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
              <GitBranch size={20} className="text-white"/>
            </div>
            <div>
              <h3 className="font-black text-amber-900 text-base">Create Rework Sub Work Order</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                FQI disposition was <strong>Rework Loop</strong>. A Sub Work Order (SWO) must be created to track these parts back through production.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { label: "Parent WO",        value: pendingSWO.parentWo.id },
              { label: "Part",             value: pendingSWO.parentWo.partName },
              { label: "Process",          value: PROCESS_STAGE_LABELS[pendingSWO.parentWo.process] },
              { label: "Rework Qty",       value: `${pendingSWO.reworkCount} parts` },
              { label: "Rework Cycle",     value: `Cycle #${pendingSWO.reworkCycle}` },
              { label: "Est. Weight",      value: `${(pendingSWO.reworkCount * (pendingSWO.parentWo.weightPerPart || 0)).toFixed(2)} KG` },
              { label: "SWO Status",       value: "Will be created as Draft" },
              { label: "Next Step",        value: "Process PTC fills operational details" },
            ].map(f => (
              <div key={f.label} className="bg-white border border-amber-200 rounded-xl p-3">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider mb-0.5">{f.label}</p>
                <p className="font-bold text-slate-800 text-xs break-words">{f.value}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPendingSWO(null)}
              className="px-4 py-2.5 rounded-xl border border-amber-300 text-amber-800 text-sm font-bold hover:bg-amber-100">
              Skip for now
            </button>
            <button onClick={handleCreateSWO}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-black shadow-md">
              <GitBranch size={16}/> Create Rework SWO
            </button>
          </div>
        </div>
      )}

      {/* ── SWO Created confirmation ── */}
      {swoCreated && (
        <div className="flex items-center gap-3 bg-indigo-50 border-2 border-indigo-300 text-indigo-800 rounded-2xl px-6 py-4">
          <GitBranch size={20} className="text-indigo-600 shrink-0"/>
          <div>
            <p className="font-black">Rework Sub Work Order created!</p>
            <p className="text-xs font-medium mt-0.5">The SWO is now in <strong>Draft</strong> status. The process PTC must fill operational details to activate it. View it in the Work Orders page.</p>
          </div>
          <a href="/dashboard/workorders" className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-xs font-bold shrink-0">
            <ExternalLink size={12}/> View WOs
          </a>
        </div>
      )}

      {/* ── FORM ── */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-white">
          <Award size={20} className="text-rose-600" />
          <h2 className="font-black text-slate-900">New Final Quality Inspection</h2>
          <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 uppercase tracking-widest">
            FQI
          </span>
        </div>

        <div className="p-6 space-y-7">

          {/* ── Section 1: Identification ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-black">1</span>
              Batch Identification
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Inspection Date" error={errors.date}>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => set("date", e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Work Order (Master ID)" error={errors.workOrderId}
                hint="Only completed / in-progress work orders are shown">
                <select
                  value={form.workOrderId}
                  onChange={e => {
                    set("workOrderId", e.target.value)
                    const wo = eligibleWOs.find(w => w.id === e.target.value)
                    if (wo) {
                      if (wo.machine) set("machine", wo.machine)
                      if (wo.shift)   set("shift", wo.shift)
                      if (wo.inputWeightKg) set("inputWeightKg", String(wo.inputWeightKg))
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">— Select Work Order —</option>
                  {eligibleWOs.map(wo => (
                    <option key={wo.id} value={wo.id}>
                      {wo.masterId} · {wo.partId} · {wo.partName.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* ── WO detail card ── */}
          {selectedWO && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Part ID</p>
                  <p className="font-bold text-slate-700">{selectedWO.partId}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Part Name</p>
                  <p className="font-bold text-slate-700 leading-tight">{selectedWO.partName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Process</p>
                  <ProcessBadge p={selectedWO.process} />
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">WO Status</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black capitalize ${selectedWO.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                    {selectedWO.status.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Target Parts</p>
                  <p className="font-bold text-slate-700">{selectedWO.targetPartNos} pcs</p>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Parts Completed</p>
                  <p className="font-bold text-slate-700">{selectedWO.partsCompleted} pcs</p>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Good Parts (WO)</p>
                  <p className="font-bold text-emerald-700">{selectedWO.goodParts}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Input Weight</p>
                  <p className="font-bold text-slate-700">{selectedWO.inputWeightKg} KG</p>
                </div>
              </div>

              {/* QI history for this WO */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Info size={10} /> In-process QI records for this batch
                </p>
                <QIHistoryPanel workOrderId={selectedWO.id} qiInspections={qiInspections} />
              </div>
            </div>
          )}

          {/* ── Section 2: Shift & Machine ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-black">2</span>
              Production Context
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Shift" error={errors.shift}>
                <select
                  value={form.shift}
                  onChange={e => set("shift", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select Shift —</option>
                  {shiftOptions.map(s => (
                    <option key={s} value={s}>{SHIFT_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Machine" error={errors.machine}>
                <select
                  value={form.machine}
                  onChange={e => set("machine", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select Machine —</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* ── Section 3: Part Counts ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-black">3</span>
              Part Classification
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <Field label="Produced Part Count" error={errors.producedPartCount}>
                <input
                  type="number" min="0"
                  value={form.producedPartCount}
                  onChange={e => set("producedPartCount", e.target.value)}
                  className={inputCls}
                  placeholder="Total parts"
                />
              </Field>
              <Field label="Good Part Count" error={errors.goodPartCount}>
                <input
                  type="number" min="0"
                  value={form.goodPartCount}
                  onChange={e => set("goodPartCount", e.target.value)}
                  className={`${inputCls} border-emerald-300 focus:ring-emerald-400`}
                  placeholder="Accepted"
                />
              </Field>
              <Field label="Rework Count" error={errors.reworkCount}>
                <input
                  type="number" min="0"
                  value={form.reworkCount}
                  onChange={e => {
                    set("reworkCount", e.target.value)
                    if (Number(e.target.value) === 0) set("reworkEntries", [])
                  }}
                  className={`${inputCls} border-amber-300 focus:ring-amber-400`}
                  placeholder="Rework"
                />
              </Field>
              <Field label="Rejected Count" error={errors.rejectedCount}>
                <input
                  type="number" min="0"
                  value={form.rejectedCount}
                  onChange={e => {
                    set("rejectedCount", e.target.value)
                    if (Number(e.target.value) === 0) set("rejectionEntries", [])
                  }}
                  className={`${inputCls} border-red-300 focus:ring-red-400`}
                  placeholder="Rejected"
                />
              </Field>
            </div>

            {/* Balance checker */}
            {produced > 0 && (
              <div className={`mt-4 rounded-xl px-5 py-3 flex items-center gap-3 text-sm font-bold ${sumCheck === produced ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {sumCheck === produced
                  ? <><CheckCircle2 size={16} /> Balanced: {good} Good + {rework} Rework + {rejected} Rejected = {produced} Total ✓</>
                  : <><AlertTriangle size={16} /> {errors.balance || `Sum ${sumCheck} ≠ ${produced} produced`}</>
                }
              </div>
            )}
          </div>

          {/* ── Rework reasons ── */}
          {rework > 0 && (
            <div className="border-2 border-amber-200 bg-amber-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <p className="font-black text-amber-900 text-sm">Rework Reasons <span className="text-amber-600 font-normal">({rework} parts)</span></p>
              </div>
              <ReasonEditor
                entries={form.reworkEntries}
                onChange={e => set("reworkEntries", e)}
                type="rework"
                totalAllowed={rework}
              />
              {errors.reworkEntries && <p className="text-[10px] text-red-600 font-bold">{errors.reworkEntries}</p>}
            </div>
          )}

          {/* ── Rejection reasons ── */}
          {rejected > 0 && (
            <div className="border-2 border-red-200 bg-red-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-red-600" />
                <p className="font-black text-red-900 text-sm">Rejection Reasons <span className="text-red-600 font-normal">({rejected} parts)</span></p>
              </div>
              <ReasonEditor
                entries={form.rejectionEntries}
                onChange={e => set("rejectionEntries", e)}
                type="rejection"
                totalAllowed={rejected}
              />
              {errors.rejectionEntries && <p className="text-[10px] text-red-600 font-bold">{errors.rejectionEntries}</p>}
            </div>
          )}

          {/* ── Section 4: Scrap Weight ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-black">4</span>
              Scrap Weight Calculation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Input Weight (KG)" error={errors.inputWeightKg}
                hint="Total weight entering this inspection batch">
                <input
                  type="number" min="0" step="0.001"
                  value={form.inputWeightKg}
                  onChange={e => set("inputWeightKg", e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 108.5"
                />
              </Field>
              <Field label="Output Weight (KG)" error={errors.outputWeightKg}
                hint="Weight of accepted finished parts">
                <input
                  type="number" min="0" step="0.001"
                  value={form.outputWeightKg}
                  onChange={e => set("outputWeightKg", e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 103.2"
                />
              </Field>

              {/* Auto-calculated scrap */}
              <div>
                <label className={labelCls}>Scrap Weight (KG) — Auto</label>
                <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border-2 text-sm font-black ${scrapKg > 0 ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                  <TrendingDown size={16} />
                  <span>{inputKg > 0 ? `${scrapKg.toFixed(3)} KG` : "—"}</span>
                  {inputKg > 0 && outputKg > 0 && (
                    <span className="ml-auto text-[10px] font-bold text-orange-600">
                      {((scrapKg / inputKg) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 italic">Input − Output = Scrap</p>
              </div>
            </div>

            {/* Scrap summary bar */}
            {inputKg > 0 && outputKg > 0 && (
              <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <Scale size={16} className="text-orange-600" />
                  <p className="font-black text-orange-900 text-sm">Weight Summary</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center text-xs">
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Input</p>
                    <p className="text-xl font-black text-slate-800">{inputKg.toFixed(3)}<span className="text-sm font-bold"> KG</span></p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Output</p>
                    <p className="text-xl font-black text-emerald-700">{outputKg.toFixed(3)}<span className="text-sm font-bold"> KG</span></p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest">Scrap</p>
                    <p className="text-xl font-black text-orange-700">{scrapKg.toFixed(3)}<span className="text-sm font-bold"> KG</span></p>
                  </div>
                </div>
                {inputKg > 0 && (
                  <div className="mt-3 h-3 bg-slate-200 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(100, (outputKg / inputKg) * 100)}%` }} />
                    <div className="bg-orange-400 h-full transition-all" style={{ width: `${Math.min(100, (scrapKg / inputKg) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Section 5: Disposition ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-black">5</span>
              Final Disposition
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["finished_goods", "rework_loop", "rejected"] as FQIDisposition[]).map(d => {
                const cfg = {
                  finished_goods: {
                    icon: <Award size={22} />,
                    title: "Finished Goods",
                    desc: "Released to dispatch",
                    active: "border-emerald-400 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-100",
                    inactive: "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50",
                    dot: "bg-emerald-500",
                  },
                  rework_loop: {
                    icon: <RotateCcw size={22} />,
                    title: "Rework Loop",
                    desc: "Sent back for correction",
                    active: "border-amber-400 bg-amber-50 text-amber-900 shadow-lg shadow-amber-100",
                    inactive: "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/50",
                    dot: "bg-amber-500",
                  },
                  rejected: {
                    icon: <XCircle size={22} />,
                    title: "Rejected",
                    desc: "Returned to inventory",
                    active: "border-red-400 bg-red-50 text-red-900 shadow-lg shadow-red-100",
                    inactive: "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50/50",
                    dot: "bg-red-500",
                  },
                }[d]

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("disposition", d)}
                    className={`relative flex flex-col items-start gap-2 p-5 rounded-2xl border-2 transition-all text-left ${form.disposition === d ? cfg.active : cfg.inactive}`}
                  >
                    {form.disposition === d && (
                      <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    )}
                    {cfg.icon}
                    <div>
                      <p className="font-black text-sm">{cfg.title}</p>
                      <p className="text-[11px] opacity-70">{cfg.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Disposition consequence indicator */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 flex items-start gap-3 text-xs text-slate-600">
              <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <span>
                {form.disposition === "finished_goods" && <><strong>{good > 0 ? good : "—"} Good parts</strong> will be released as Finished Goods for dispatch. {rejected > 0 ? `${rejected} rejected parts returned to inventory.` : ""}</>}
                {form.disposition === "rework_loop"    && <><strong>{rework > 0 ? rework : "—"} Rework parts</strong> will be sent back to production for correction. Good parts ({good}) held pending rework resolution.</>}
                {form.disposition === "rejected"       && <><strong>{rejected > 0 ? rejected : "—"} Rejected parts</strong> will be returned to inventory. {good > 0 ? `${good} good parts proceed to dispatch.` : ""}</>}
              </span>
            </div>
          </div>

          {/* ── Section 6: Notes ── */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-400 text-white text-[9px] flex items-center justify-center font-black">6</span>
              Inspector Notes (Optional)
            </p>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Any additional observations, special instructions, or handoff notes..."
            />
          </div>

          {/* ── Submit ── */}
          <div className="pt-2 flex items-center justify-between flex-wrap gap-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setForm(blank()); setErrors({}) }}
              className="text-sm font-bold text-slate-400 hover:text-slate-600 transition"
            >
              Reset form
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black px-7 py-3 rounded-xl transition shadow-lg shadow-rose-200"
            >
              <Award size={18} />
              Submit Final Inspection
            </button>
          </div>
        </div>
      </section>

      {/* ── Full History ── */}
      {showHistory && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <ClipboardList size={18} className="text-slate-500" />
            <h2 className="font-black text-slate-900">FQI Inspection History</h2>
            <span className="ml-auto text-xs font-bold text-slate-400">{fqiInspections.length} records</span>
          </div>
          {fqiInspections.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No FQI inspections recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "Master ID", "Part", "Process", "Shift", "Produced", "Good", "Rework", "Rejected", "Input KG", "Output KG", "Scrap KG", "Disposition", "Inspector"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...fqiInspections].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 whitespace-nowrap">{r.masterId}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium max-w-[140px] truncate text-xs" title={r.partName}>{r.partName}</td>
                      <td className="px-4 py-3"><ProcessBadge p={r.process} /></td>
                      <td className="px-4 py-3 text-slate-600 capitalize text-xs whitespace-nowrap">{r.shift}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{r.producedPartCount}</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{r.goodPartCount}</td>
                      <td className="px-4 py-3 font-bold text-amber-700">{r.reworkCount}</td>
                      <td className="px-4 py-3 font-bold text-red-700">{r.rejectedCount}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.inputWeightKg}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.outputWeightKg}</td>
                      <td className="px-4 py-3 font-mono text-xs text-orange-700 font-bold">{r.scrapWeightKg}</td>
                      <td className="px-4 py-3"><DispositionBadge d={r.disposition} /></td>
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