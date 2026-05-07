"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, SHIFT_LABELS, MACHINES, REASON_CODES,
  type ProcessStage, type Shift, type ReworkEntry, type RejectionEntry,
} from "@/lib/store"
import {
  Plus, Trash2, CheckCircle2, AlertTriangle, XCircle, ClipboardList,
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
function PrevShiftCard({ inspection }: { inspection: ReturnType<typeof usePrevInspections>[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition text-sm font-bold text-slate-700"
      >
        <span className="flex items-center gap-2">
          <History size={14} className="text-slate-500" />
          {inspection.date} — {SHIFT_LABELS[inspection.shift as Shift]} — {inspection.partName}
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

// ─── BLANK FORM ───────────────────────────────────────────────────────────────
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
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function QIInspectionPage({ process }: { process: ProcessStage }) {
  const { currentUser, workOrders, qiInspections, addQIInspection, updateWorkOrder, shifts } = useApp()
  const theme = THEME[process]
  const machines = MACHINES.filter(m => m.process === process && m.status !== "inactive")

  const shiftOptions: Shift[] = shifts.length > 0
    ? [...shifts].sort((a, b) => a.order - b.order).map(s => s.id)
    : ["shift_1", "shift_2"]

  const [form, setForm] = useState<FormState>(blank())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showPrev, setShowPrev] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  const prevInspections = usePrevInspections(process, qiInspections)

  // Work orders for this process
  const eligibleWOs = useMemo(() =>
    workOrders.filter(wo => wo.process === process && wo.status !== "draft"),
    [workOrders, process])

  const selectedWO = useMemo(() =>
    eligibleWOs.find(wo => wo.id === form.workOrderId) ?? null,
    [eligibleWOs, form.workOrderId])

  const set = (k: keyof FormState, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  // Derived counts
  const produced = parseInt(form.producedPartCount) || 0
  const good = parseInt(form.goodPartCount) || 0
  const rework = parseInt(form.reworkCount) || 0
  const rejected = parseInt(form.rejectedCount) || 0
  const sumCheck = good + rework + rejected

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
    if (produced > 0 && sumCheck !== produced) errs.balance = `Good + Rework + Rejected must equal Produced (${sumCheck} ≠ ${produced})`
    if (rework > 0 && form.reworkEntries.length === 0) errs.reworkEntries = "Rework reasons are required"
    if (rework > 0) {
      const rTotal = form.reworkEntries.reduce((s, e) => s + e.quantity, 0)
      if (rTotal !== rework) errs.reworkEntries = `Rework reason quantities (${rTotal}) must equal rework count (${rework})`
    }
    if (rejected > 0 && form.rejectionEntries.length === 0) errs.rejectionEntries = "Rejection reasons are required"
    if (rejected > 0) {
      const rjTotal = form.rejectionEntries.reduce((s, e) => s + e.quantity, 0)
      if (rjTotal !== rejected) errs.rejectionEntries = `Rejection reason quantities (${rjTotal}) must equal rejected count (${rejected})`
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    const wo = selectedWO!
    addQIInspection({
      process,
      date: form.date,
      masterId: wo.masterId,
      partId: wo.partId,
      partName: wo.partName,
      shift: form.shift as Shift,
      machine: form.machine,
      producedPartCount: produced,
      goodPartCount: good,
      reworkCount: rework,
      reworkEntries: form.reworkEntries,
      rejectedCount: rejected,
      rejectionEntries: form.rejectionEntries,
      inspectedBy: currentUser!.name,
      inspectedById: currentUser!.id,
      workOrderId: wo.id,
    })
    // Update WorkOrder with QI results so WO cards reflect accurate part counts
    updateWorkOrder(wo.id, {
      goodParts:     wo.goodParts     + good,
      reworkParts:   wo.reworkParts   + rework,
      rejectedParts: wo.rejectedParts + rejected,
      qiApproval:    currentUser!.name,
      status: (wo.partsCompleted >= wo.targetPartNos) ? 'completed' : wo.status,
    })
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setForm(blank())
    }, 3000)
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
  if (!canAccess) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <AlertCircle size={48} className="text-red-400 mb-4" />
      <p className="text-slate-500 font-medium">Access restricted to Quality Inspectors.</p>
    </div>
  )

  // History records
  const historyRecords = useMemo(() =>
    [...qiInspections]
      .filter(i => i.process === process)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [qiInspections, process])

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
              <PrevShiftCard key={i.id} inspection={i} />
            ))}
          </div>
        )}
      </section>

      {/* Success banner */}
      {submitted && (
        <div className="flex items-center gap-3 bg-emerald-50 border-2 border-emerald-300 text-emerald-800 rounded-2xl px-6 py-4 font-bold animate-pulse">
          <CheckCircle2 size={22} />
          Inspection record submitted successfully!
        </div>
      )}

      {/* Inspection Form */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className={`px-6 py-4 border-b border-slate-100 flex items-center gap-3`}>
          <ShieldCheck size={20} className="text-blue-600" />
          <h2 className="font-black text-slate-900">New Inspection Record</h2>
          <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${theme.badge}`}>
            {PROCESS_LABEL[process]}
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Row 1: Date + WO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Inspection Date" error={errors.date}>
              <input
                type="date"
                value={form.date}
                onChange={e => set("date", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Work Order (Master ID)" error={errors.workOrderId}>
              <select
                value={form.workOrderId}
                onChange={e => {
                  set("workOrderId", e.target.value)
                  const wo = eligibleWOs.find(w => w.id === e.target.value)
                  if (wo) {
                    set("machine", wo.machine)
                    set("shift", wo.shift)
                  }
                }}
                className={inputCls}
              >
                <option value="">— Select Work Order —</option>
                {eligibleWOs.map(wo => (
                  <option key={wo.id} value={wo.id}>
                    {wo.masterId} · {wo.partId} · {wo.partName}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Selected WO info */}
          {selectedWO && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-slate-400 font-black uppercase tracking-widest">Part ID</p><p className="font-bold text-slate-700">{selectedWO.partId}</p></div>
              <div><p className="text-slate-400 font-black uppercase tracking-widest">Part Name</p><p className="font-bold text-slate-700">{selectedWO.partName}</p></div>
              <div><p className="text-slate-400 font-black uppercase tracking-widest">Target</p><p className="font-bold text-slate-700">{selectedWO.targetPartNos} pcs</p></div>
              <div><p className="text-slate-400 font-black uppercase tracking-widest">WO Status</p><p className="font-bold text-slate-700 capitalize">{selectedWO.status.replace("_", " ")}</p></div>
            </div>
          )}

          {/* Row 2: Shift + Machine */}
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

          {/* Row 3: Part counts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Field label="Produced Part Count" error={errors.producedPartCount}>
              <input
                type="number" min="0"
                value={form.producedPartCount}
                onChange={e => set("producedPartCount", e.target.value)}
                className={inputCls}
                placeholder="Total produced"
              />
            </Field>
            <Field label="Good Part Count" error={errors.goodPartCount}>
              <input
                type="number" min="0"
                value={form.goodPartCount}
                onChange={e => set("goodPartCount", e.target.value)}
                className={`${inputCls} border-emerald-300 focus:ring-emerald-400`}
                placeholder="Accepted parts"
              />
            </Field>
            <div className="space-y-5">
              <Field label="Rework Count" error={errors.reworkCount}>
                <input
                  type="number" min="0"
                  value={form.reworkCount}
                  onChange={e => {
                    set("reworkCount", e.target.value)
                    if (Number(e.target.value) === 0) set("reworkEntries", [])
                  }}
                  className={`${inputCls} border-amber-300 focus:ring-amber-400`}
                  placeholder="Rework parts"
                />
              </Field>
            </div>
          </div>

          {/* Balance check */}
          {produced > 0 && (
            <div className={`rounded-xl px-5 py-3 flex items-center gap-3 text-sm font-bold ${sumCheck === produced ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {sumCheck === produced
                ? <><CheckCircle2 size={16} /> Parts balanced: {good} Good + {rework} Rework + {rejected} Rejected = {produced} Produced ✓</>
                : <><AlertTriangle size={16} /> {errors.balance || `Sum mismatch: ${sumCheck} ≠ ${produced} produced`}</>
              }
            </div>
          )}

          {/* Rejected count (separate row for visual clarity) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Rejected Part Count" error={errors.rejectedCount}>
              <input
                type="number" min="0"
                value={form.rejectedCount}
                onChange={e => {
                  set("rejectedCount", e.target.value)
                  if (Number(e.target.value) === 0) set("rejectionEntries", [])
                }}
                className={`${inputCls} border-red-300 focus:ring-red-400`}
                placeholder="Rejected parts"
              />
            </Field>
          </div>

          {/* Rework reasons */}
          {rework > 0 && (
            <div className="border-2 border-amber-200 bg-amber-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <p className="font-black text-amber-900 text-sm">Rework Reasons <span className="text-amber-600 font-bold">(Required — {rework} parts)</span></p>
              </div>
              <ReasonEditor
                entries={form.reworkEntries}
                onChange={e => set("reworkEntries", e)}
                type="rework"
                totalAllowed={rework}
              />
              {errors.reworkEntries && (
                <p className="text-[10px] text-red-600 font-bold">{errors.reworkEntries}</p>
              )}
            </div>
          )}

          {/* Rejection reasons */}
          {rejected > 0 && (
            <div className="border-2 border-red-200 bg-red-50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-red-600" />
                <p className="font-black text-red-900 text-sm">Rejection Reasons <span className="text-red-600 font-bold">(Required — {rejected} parts)</span></p>
              </div>
              <ReasonEditor
                entries={form.rejectionEntries}
                onChange={e => set("rejectionEntries", e)}
                type="rejection"
                totalAllowed={rejected}
              />
              {errors.rejectionEntries && (
                <p className="text-[10px] text-red-600 font-bold">{errors.rejectionEntries}</p>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 flex items-center justify-between flex-wrap gap-4">
            <button
              type="button"
              onClick={() => { setForm(blank()); setErrors({}) }}
              className="text-sm font-bold text-slate-500 hover:text-slate-700 transition"
            >
              Reset form
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black px-6 py-3 rounded-xl transition shadow-lg shadow-blue-200"
            >
              <ShieldCheck size={18} />
              Submit Inspection
            </button>
          </div>
        </div>
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
                      <td className="px-4 py-3 text-slate-600 capitalize whitespace-nowrap">{r.shift}</td>
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
