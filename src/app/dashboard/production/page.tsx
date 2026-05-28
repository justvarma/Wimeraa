"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { ShiftProductionEntry } from "@/components/ShiftProductionEntry"
import {
  UserRole, PROCESS_STAGE_LABELS, PROCESS_OPERATION_LABELS, PROCESS_RULES, PROCESS_PTC_ROLE_MAP,
  REASON_CODES, 
  type ProcessStage, type Shift, type WorkOrder, type ProcessRecord,
  type ReworkEntry, type RejectionEntry, type DailyProductionEntry, type DowntimeEvent,
} from "@/lib/store"
import { getSelectableShiftOptions, getShiftLabel } from "@/lib/shiftUtils"
import {
  Plus, X, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
  Trash2, ClipboardList, Lock, Building2, Info, Package, Clock,
} from "lucide-react"

// ─── Shared styling ───────────────────────────────────────────────────────────
const inputCls = "w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
const labelCls = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {note && <p className="text-[10px] text-slate-400 mt-1">{note}</p>}
    </div>
  )
}

const processColor = (p: ProcessStage) =>
  p === "die_casting" ? "bg-orange-100 text-orange-800 border-orange-200" :
  p === "coating"     ? "bg-purple-100 text-purple-800 border-purple-200" :
                        "bg-cyan-100 text-cyan-800 border-cyan-200"

const processIcon = (p: ProcessStage) =>
  p === "die_casting" ? "🔥" : p === "coating" ? "🎨" : "⚙️"

const PROCESS_THEME: Record<ProcessStage, { border: string; bg: string; text: string; num: string }> = {
  die_casting: { border:"border-orange-300", bg:"bg-orange-50",  text:"text-orange-900", num:"bg-orange-600" },
  coating:     { border:"border-purple-300", bg:"bg-purple-50",  text:"text-purple-900", num:"bg-purple-600" },
  cnc_vmc:     { border:"border-cyan-300",   bg:"bg-cyan-50",    text:"text-cyan-900",   num:"bg-cyan-600"   },
}

// ─── Reason Editor ────────────────────────────────────────────────────────────
function ReasonEditor({ entries, onChange, type }: {
  entries: (ReworkEntry|RejectionEntry)[]
  onChange: (e: (ReworkEntry|RejectionEntry)[]) => void
  type: "rework"|"rejection"
}) {
  const codes = REASON_CODES[type]
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-center">
          <select value={entry.reasonCode} onChange={e => onChange(entries.map((x,j)=>j===i?{...x,reasonCode:e.target.value}:x))}
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            {codes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" min="1" value={entry.quantity}
            onChange={e => onChange(entries.map((x,j)=>j===i?{...x,quantity:Number(e.target.value)}:x))}
            className="w-20 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-center" placeholder="Qty"/>
          <button type="button" onClick={() => onChange(entries.filter((_,j)=>j!==i))} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <Trash2 size={14}/>
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...entries,{reasonCode:codes[0],quantity:1}])}
        className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg">
        <Plus size={12}/> Add reason
      </button>
    </div>
  )
}

// ─── Inventory Update Summary (Step 8) ────────────────────────────────────────
function InventorySummary({ wo, form, needsScrap, scrapCalc }: {
  wo: WorkOrder
  form: Omit<ProcessRecord,"id"|"createdAt">
  needsScrap: boolean
  scrapCalc: number
}) {
  return (
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Package size={18} className="text-emerald-700"/>
        <h3 className="font-black text-emerald-900">Step 8 — Inventory Update Preview</h3>
      </div>
      <p className="text-xs text-emerald-700">The following data will be written to Work Order <strong>{wo.id}</strong> upon saving:</p>

      {/* WO link */}
      <div className="bg-white border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
        <p className="font-black text-slate-700 uppercase tracking-wider text-[10px] mb-2">Work Order Details</p>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-slate-500">WO ID: </span><span className="font-mono font-bold text-indigo-700">{wo.id}</span></div>
          <div><span className="text-slate-500">Part: </span><span className="font-bold">{wo.partName}</span></div>
          <div><span className="text-slate-500">Part ID: </span><span className="font-mono">{wo.partId}</span></div>
          <div><span className="text-slate-500">Process: </span><span className="font-bold">{PROCESS_STAGE_LABELS[wo.process]}</span></div>
        </div>
      </div>

      <div className="bg-white border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
        <p className="font-black uppercase tracking-wider text-[10px] mb-1">Inventory Movement</p>
        <p>Production output and material movement will be finalized from the saved production weights. Quality disposition counts are handled in QI/NCR records.</p>
      </div>

      {/* Weight data */}
      <div className="bg-white border border-emerald-200 rounded-xl p-3 text-xs space-y-1.5">
        <p className="font-black text-slate-700 uppercase tracking-wider text-[10px] mb-2">Weight & Waste</p>
        <div className="flex justify-between"><span className="text-slate-500">Input Weight (KG)</span><span className="font-bold font-mono">{form.inputWeightKg} KG</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Output Weight (KG)</span><span className="font-bold font-mono">{form.outputWeightKg} KG</span></div>
        {needsScrap ? (
          <div className="flex justify-between text-orange-700"><span className="font-bold">Scrap Weight (auto-calculated)</span><span className="font-bold font-mono">{scrapCalc.toFixed(3)} KG</span></div>
        ) : (
          <div className="flex justify-between text-slate-400 italic"><span>Scrap Weight</span><span>N/A — Coating process</span></div>
        )}
        <div className="flex justify-between"><span className="text-slate-500">Material Waste</span><span className="font-bold font-mono">{form.materialWasteKg} KG</span></div>
      </div>

      <p className="text-[10px] text-emerald-600 italic">→ Saving will update the Work Order record and mark this production stage as complete.</p>
    </div>
  )
}

// ─── Process Record Form ──────────────────────────────────────────────────────
function ProcessRecordForm({ wo, onClose, onSave, currentUser: cu }: {
  wo: WorkOrder
  onClose: () => void
  onSave: (r: Omit<ProcessRecord,"id"|"createdAt">) => void
  currentUser: { name: string; role: UserRole }
}) {
  const { users, shifts, machines } = useApp()
  // Role flags for conditional section visibility (Issue 5 — role separation)
  const cuRole = cu.role
  const cuIsAdmin      = cuRole === UserRole.ADMIN
  const cuIsPTCMgr     = cuRole === UserRole.PTC_MANAGER
  const cuIsProcessPTC = [UserRole.PTC_DIE_CASTING, UserRole.PTC_COATING, UserRole.PTC_CNC_VMC].includes(cuRole)
  const cuIsQI         = [UserRole.QUALITY_INSPECTOR, UserRole.QI_DIE_CASTING, UserRole.QI_COATING, UserRole.QI_MACHINING].includes(cuRole)
  // Section visibility: Admin sees all; each role sees only their section(s)
  const showPreCheck  = cuIsAdmin || cuIsPTCMgr || cuIsProcessPTC  // Step 1
  const showProduction = cuIsAdmin || cuIsProcessPTC                 // Steps 2–3
  const showQI         = cuIsAdmin || cuIsQI                         // Step 4
  const ptcManagerUsers = users.filter(u => u.role === UserRole.PTC_MANAGER || u.role === UserRole.ADMIN)
  const processMachines = machines.filter(m => m.process === wo.process && m.status === "active")
  const woMachineOptions = wo.machine.split(",").map(m => m.trim()).filter(Boolean)

  const shiftOptions = getSelectableShiftOptions(shifts, wo.shift)
  const needsScrap = PROCESS_RULES[wo.process].scrap
  const processRule = PROCESS_RULES[wo.process]
  const theme = PROCESS_THEME[wo.process]
  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<Omit<ProcessRecord,"id"|"createdAt">>({
    workOrderId:           wo.id,
    process:               wo.process,
    date:                  today,
    shift:                 (wo.shift as Shift) || shiftOptions[0]?.id || "",
    machineName:           woMachineOptions.join(", ") || processMachines.map(m => m.name).join(", "),
    inputAcceptanceChecked: false,
    ptcApprovalGiven:      false,
    ptcApprovedBy:         "",
    isVendorProduction:    wo.isExternal,
    vendorName:            wo.vendorName || "",
    inputWeightKg:         wo.requiredQuantityKg,
    outputQuantity:        0,
    outputWeightKg:        0,
    qiInspectedBy:         cu.name,   // auto-set to logged-in user (QI logs their own record)
    goodParts:             0,
    reworkParts:           0,
    reworkEntries:         [],
    rejectedParts:         0,
    rejectionEntries:      [],
    scrapWeightKg:         0,
    materialWasteKg:       0,
    status:                "pre_check",
    createdBy:             cu.name,
  })

  const totalClassified = form.goodParts + form.reworkParts + form.rejectedParts
  const countMismatch   = form.outputQuantity > 0 && totalClassified !== form.outputQuantity
  const scrapCalc       = needsScrap ? Math.max(0, form.inputWeightKg - form.outputWeightKg) : 0

  // canSubmit is scoped to each role's section so they can save independently
  const preCheckOk  = form.inputAcceptanceChecked && form.ptcApprovalGiven
  const productionOk = form.outputQuantity > 0 && Boolean(String(form.machineName || "").trim())
  const qiOk        = !countMismatch &&
    (form.reworkParts  === 0 || form.reworkEntries.length  > 0) &&
    (form.rejectedParts === 0 || form.rejectionEntries.length > 0)

  const canSubmit =
    // PTC Manager: needs only pre-check approval
    (cuIsPTCMgr && !cuIsAdmin)    ? preCheckOk :
    // Process PTC: needs pre-check + production data
    (cuIsProcessPTC && !cuIsAdmin) ? preCheckOk && productionOk :
    // QI: needs pre-check (already done) + valid classification
    (cuIsQI && !cuIsAdmin)         ? form.outputQuantity > 0 && qiOk :
    // Admin: full form required
    preCheckOk && productionOk && qiOk

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSave({ ...form, scrapWeightKg: needsScrap ? scrapCalc : 0, status: "completed" })
  }

  const stepNum = (n: number) => (
    <span className={`w-6 h-6 rounded-full ${theme.num} text-white flex items-center justify-center text-xs font-black shrink-0`}>{n}</span>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto">

        {/* ── Header with process context ── */}
        <div className={`sticky top-0 z-10 border-b border-slate-200 ${theme.bg}`}>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${processColor(wo.process)}`}>
                    {processIcon(wo.process)} {PROCESS_STAGE_LABELS[wo.process]}
                  </span>
                  {wo.isExternal && (
                    <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-800 font-bold px-2.5 py-1 rounded-full border border-violet-200">
                      <Building2 size={11}/> External — {wo.vendorName}
                    </span>
                  )}
                </div>
                <h2 className={`text-lg font-black ${theme.text}`}>{PROCESS_OPERATION_LABELS[wo.process]}</h2>
                <p className="text-xs text-slate-600 mt-0.5">{wo.partName} · <span className="font-mono">{wo.id}</span></p>
              </div>
              <button onClick={onClose} className="ml-4 text-slate-400 hover:text-slate-700"><X size={22}/></button>
            </div>

            {/* Process rule banner */}
            <div className={`mt-3 flex items-start gap-2 p-3 rounded-xl border ${needsScrap?"bg-orange-50 border-orange-200 text-orange-800":"bg-slate-100 border-slate-200 text-slate-600"} text-xs`}>
              <Info size={14} className="shrink-0 mt-0.5"/>
              <span><strong>{needsScrap?"Scrap tracking: ON":"Scrap tracking: OFF"}</strong> — {processRule.description}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* ── Step 1: Pre-Process Check ── (PTC Manager + Process PTC + Admin) */}
          {showPreCheck && <section className={`rounded-2xl border ${theme.border} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              {stepNum(1)}
              <h3 className="font-black text-slate-800">Pre-Process Check</h3>
            </div>

            {/* Acceptance points (read from WO) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Acceptance Criteria to Verify</p>
              <p className="text-sm text-amber-900">{wo.acceptancePoints}</p>
            </div>

            {/* Vendor info if external */}
            {wo.isExternal && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p className="text-[10px] font-black text-violet-700 uppercase tracking-wider mb-2">Vendor / External Production</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-violet-600">Vendor ID: </span><span className="font-mono font-bold">{wo.vendorId}</span></div>
                  <div><span className="text-violet-600">Vendor Name: </span><span className="font-bold">{wo.vendorName}</span></div>
                </div>
                <p className="text-xs text-violet-700 mt-2 italic">Quality inspection of vendor-supplied parts must be conducted per the acceptance criteria above.</p>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={form.isVendorProduction}
                    onChange={e => setForm(p=>({...p,isVendorProduction:e.target.checked}))} className="w-4 h-4 accent-violet-600"/>
                  <span className="text-xs font-bold text-violet-800">Confirm: this batch is from external vendor</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Date *">
                <input type="date" required value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className={inputCls}/>
              </Field>
              <Field label="Shift">
                <input readOnly value={getShiftLabel(shifts, wo.shift)} className={`${inputCls} bg-slate-50 text-slate-500 capitalize cursor-not-allowed`}/>
              </Field>
              <Field label="Machines (this entry) *">
                <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white">
                  {(woMachineOptions.length > 0 ? woMachineOptions : processMachines.map(m => m.name)).map(m => {
                    const selected = String(form.machineName || "").split(",").map(v => v.trim()).filter(Boolean).includes(m)
                    return (
                      <label key={m} className="flex items-center gap-2 text-sm text-slate-800">
                        <input type="checkbox" checked={selected} onChange={e => {
                          setForm(p => {
                            const set = new Set(String(p.machineName || "").split(",").map(v => v.trim()).filter(Boolean))
                            if (e.target.checked) set.add(m); else set.delete(m)
                            return { ...p, machineName: Array.from(set).join(", ") }
                          })
                        }} />
                        {m}
                      </label>
                    )
                  })}
                </div>
              </Field>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                <input type="checkbox" checked={form.inputAcceptanceChecked} onChange={e=>setForm(p=>({...p,inputAcceptanceChecked:e.target.checked}))} className="w-4 h-4 accent-blue-600"/>
                <span className="text-sm font-bold text-slate-800">✓ Input acceptance criteria verified against WO spec</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                <input type="checkbox" checked={form.ptcApprovalGiven} onChange={e=>setForm(p=>({...p,ptcApprovalGiven:e.target.checked}))} className="w-4 h-4 accent-blue-600"/>
                <span className="text-sm font-bold text-slate-800">✓ PTC Manager approval obtained to start production</span>
              </label>
              {form.ptcApprovalGiven && (
                <Field label="Approving PTC Manager">
                  <select value={form.ptcApprovedBy||""} onChange={e=>setForm(p=>({...p,ptcApprovedBy:e.target.value}))} className={`${inputCls} bg-white`}>
                    <option value="">— Select PTC Manager —</option>
                    {ptcManagerUsers.map(u=>(
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </section>}

          {/* ── Step 2: Production Run ── (Process PTC + Admin) */}
          {showProduction && <section className={`rounded-2xl border ${theme.border} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              {stepNum(2)}
              <div>
                <h3 className="font-black text-slate-800">{PROCESS_OPERATION_LABELS[wo.process]}</h3>
                <p className="text-xs text-slate-500">Record input material for this production run</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Input Weight (KG) *" note="Total raw material fed into this run">
                <input type="number" required min="0" step="any" value={form.inputWeightKg}
                  onChange={e=>setForm(p=>({...p,inputWeightKg:Number(e.target.value)}))} className={inputCls}/>
              </Field>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">WO Reference</p>
                <p className="font-bold text-slate-700">{wo.requiredQuantityKg} KG required</p>
                <p className="text-slate-500 mt-0.5">{wo.targetPartNos} parts @ {wo.weightPerPart} KG/each</p>
              </div>
            </div>
          </section>}

          {/* ── Step 3: Post-Process Output ── (Process PTC + Admin) */}
          {showProduction && <section className={`rounded-2xl border ${theme.border} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              {stepNum(3)}
              <h3 className="font-black text-slate-800">Post-Process Output Check</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Output Quantity (Nos) *">
                <input type="number" required min="0" value={form.outputQuantity}
                  onChange={e=>setForm(p=>({...p,outputQuantity:Number(e.target.value)}))} className={inputCls}/>
              </Field>
              <Field label="Output Weight (KG) *">
                <input type="number" required min="0" step="any" value={form.outputWeightKg}
                  onChange={e=>setForm(p=>({...p,outputWeightKg:Number(e.target.value)}))} className={inputCls}/>
              </Field>
            </div>

            {/* Scrap — die casting & CNC only, hidden entirely for coating */}
            {needsScrap ? (
              form.outputWeightKg > 0 ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm">
                  <span className="font-bold text-orange-800">Scrap Weight (auto-calculated): </span>
                  <span className="text-orange-700 font-mono font-bold">{scrapCalc.toFixed(3)} KG</span>
                  <span className="text-orange-500 text-xs ml-2">= Input {form.inputWeightKg} − Output {form.outputWeightKg}</span>
                </div>
              ) : null
            ) : (
              <div className="flex items-start gap-2 p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-600">
                <Info size={13} className="shrink-0 mt-0.5"/>
                <span><strong>Coating process:</strong> Scrap weight is not applicable. Only material waste (chemical loss, overspray, etc.) is tracked below.</span>
              </div>
            )}

            <Field label="Material Waste (KG)" note={needsScrap ? "Additional raw material loss beyond scrap (e.g. sprues, vents)" : "Chemical loss, overspray, or other coating material waste"}>
              <input type="number" min="0" step="any" value={form.materialWasteKg}
                onChange={e=>setForm(p=>({...p,materialWasteKg:Number(e.target.value)}))} className={inputCls}/>
            </Field>
          </section>}

          {/* ── Step 4: QI Inspection ── (QI + Admin) */}
          {showQI && <section className={`rounded-2xl border ${theme.border} p-5 space-y-4`}>
            <div className="flex items-center gap-2">
              {stepNum(4)}
              <h3 className="font-black text-slate-800">QI Inspection & Part Classification</h3>
            </div>

            {/* Count validation */}
            {form.outputQuantity > 0 && (
              <div className={`p-3 rounded-xl text-sm border font-medium ${countMismatch?"bg-red-50 border-red-200 text-red-700":"bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                {countMismatch
                  ? `⚠ Mismatch: Good(${form.goodParts}) + Rework(${form.reworkParts}) + Rejected(${form.rejectedParts}) = ${totalClassified} ≠ Output ${form.outputQuantity}`
                  : totalClassified===form.outputQuantity
                    ? `✓ Parts balance confirmed: ${totalClassified} = ${form.outputQuantity}`
                    : `Parts classified: ${totalClassified} of ${form.outputQuantity}`}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <label className="block text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Good Parts</label>
                <input type="number" min="0" value={form.goodParts} onChange={e=>setForm(p=>({...p,goodParts:Number(e.target.value)}))}
                  className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-center font-black text-lg"/>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Rework</label>
                <input type="number" min="0" value={form.reworkParts} onChange={e=>setForm(p=>({...p,reworkParts:Number(e.target.value)}))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none text-center font-black text-lg"/>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <label className="block text-xs font-bold text-red-700 uppercase tracking-wider mb-2">Rejected</label>
                <input type="number" min="0" value={form.rejectedParts} onChange={e=>setForm(p=>({...p,rejectedParts:Number(e.target.value)}))}
                  className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-red-500 outline-none text-center font-black text-lg"/>
              </div>
            </div>

            {form.reworkParts > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Rework Reasons (required)</p>
                <ReasonEditor entries={form.reworkEntries} onChange={e=>setForm(p=>({...p,reworkEntries:e as ReworkEntry[]}))} type="rework"/>
              </div>
            )}
            {form.rejectedParts > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                <p className="text-xs font-black text-red-800 uppercase tracking-wider">Rejection Reasons (required)</p>
                <ReasonEditor entries={form.rejectionEntries} onChange={e=>setForm(p=>({...p,rejectionEntries:e as RejectionEntry[]}))} type="rejection"/>
              </div>
            )}
          </section>}

          {/* ── Step 8: Inventory Update Summary ── */}
          {canSubmit && (
            <InventorySummary wo={wo} form={form} needsScrap={needsScrap} scrapCalc={scrapCalc}/>
          )}

          {/* Validation checklist */}
          {!canSubmit && (
            <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600"/>
              <ul className="space-y-0.5 text-xs">
                {!form.inputAcceptanceChecked && <li>• Input acceptance criteria must be verified</li>}
                {!form.ptcApprovalGiven && <li>• PTC Manager approval is required</li>}
                {form.outputQuantity === 0 && <li>• Output quantity must be entered</li>}
                {countMismatch && <li>• Good + Rework + Rejected must equal Output Quantity ({form.outputQuantity})</li>}
                {form.reworkParts  > 0 && form.reworkEntries.length  === 0 && <li>• Rework reasons are mandatory when rework parts &gt; 0</li>}
                {form.rejectedParts > 0 && form.rejectionEntries.length === 0 && <li>• Rejection reasons are mandatory when rejected parts &gt; 0</li>}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={!canSubmit}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <CheckCircle2 size={16}/> Save & Update Inventory
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Daily Production Entry Form (§5.3) ──────────────────────────────────────
function DailyEntryForm({ wo, onClose, onSave, currentUserName }: {
  wo: WorkOrder; onClose: () => void
  onSave: (data: Omit<DailyProductionEntry,"id"|"createdAt">) => void
  currentUserName: string
}) {
  const { users, shifts, machines } = useApp()
  const today = new Date().toISOString().split("T")[0]
  const processMachines = machines.filter(m => m.process === wo.process && m.status === "active")
  const operators = users.filter(u => u.role === UserRole.PTC_DIE_CASTING || u.role === UserRole.PTC_COATING || u.role === UserRole.PTC_CNC_VMC || u.role === UserRole.ADMIN)

  const shiftOptions = getSelectableShiftOptions(shifts, wo.shift)

  const [form, setForm] = useState({
    date: today, shift: (wo.shift || shiftOptions[0]?.id || "") as Shift,
    machine: wo.machine || processMachines[0]?.name || "",
    operator: wo.operator || "",
    requiredInputKg: wo.requiredQuantityKg,
    requiredOutputNos: wo.targetPartNos,
    acceptancePoints: wo.acceptancePoints || "",
    isExternal: wo.isExternal, vendorId: wo.vendorId || "", vendorName: wo.vendorName || "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ ...form, workOrderId: wo.id, partId: wo.partId, partName: wo.partName, createdBy: currentUserName })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">Daily Production Mapping</h2>
            <p className="text-xs text-slate-500 mt-0.5">{wo.partName} · {wo.id}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-700"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Date *</label><input type="date" required value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className={inputCls}/></div>
            <div><label className={labelCls}>Shift *</label>
              <select required value={form.shift} onChange={e=>setForm(p=>({...p,shift:e.target.value as Shift}))} className={`${inputCls} bg-white`}>
                <option value="">— Select shift —</option>
                {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div><label className={labelCls}>Machine *</label>
            <select required value={form.machine} onChange={e=>setForm(p=>({...p,machine:e.target.value}))} className={`${inputCls} bg-white`}>
              <option value="">— Select machine —</option>
              {processMachines.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
              {form.machine && !processMachines.find(m=>m.name===form.machine) && <option value={form.machine}>{form.machine}</option>}
            </select>
          </div>
          <div><label className={labelCls}>Operator *</label>
            <select required value={form.operator} onChange={e=>setForm(p=>({...p,operator:e.target.value}))} className={`${inputCls} bg-white`}>
              <option value="">— Select operator —</option>
              {operators.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
              <option value="External Operator">External Operator</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Required Input (KG) *</label><input type="number" required min="0.1" step="any" value={form.requiredInputKg} onChange={e=>setForm(p=>({...p,requiredInputKg:Number(e.target.value)}))} className={inputCls}/></div>
            <div><label className={labelCls}>Required Output (Nos) *</label><input type="number" required min="1" value={form.requiredOutputNos} onChange={e=>setForm(p=>({...p,requiredOutputNos:Number(e.target.value)}))} className={inputCls}/></div>
          </div>
          <div><label className={labelCls}>Acceptance Points</label>
            <textarea rows={2} value={form.acceptancePoints} onChange={e=>setForm(p=>({...p,acceptancePoints:e.target.value}))} className={`${inputCls} resize-none`} placeholder="Dimensional, visual, coating thickness..."/>
          </div>
          <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-200 rounded-xl hover:bg-slate-50">
            <input type="checkbox" checked={form.isExternal} onChange={e=>setForm(p=>({...p,isExternal:e.target.checked}))} className="w-4 h-4 accent-violet-600"/>
            <span className="text-sm font-bold text-slate-800">External / Vendor production</span>
          </label>
          {form.isExternal && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Vendor ID</label><input value={form.vendorId} onChange={e=>setForm(p=>({...p,vendorId:e.target.value}))} placeholder="VND-001" className={inputCls}/></div>
              <div><label className={labelCls}>Vendor Name</label><input value={form.vendorName} onChange={e=>setForm(p=>({...p,vendorName:e.target.value}))} placeholder="Precision Parts Ltd" className={inputCls}/></div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Save Daily Entry</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Downtime Event Form (§10) ────────────────────────────────────────────────
function DowntimeForm({ wo, onClose, onSave, currentUserName }: {
  wo: WorkOrder; onClose: () => void
  onSave: (data: Omit<DowntimeEvent,"id"|"createdAt">) => void
  currentUserName: string
}) {
  const { shifts, machines } = useApp()
  const today = new Date().toISOString().split("T")[0]
  const processMachines = machines.filter(m => m.process === wo.process)
  const shiftOptions = getSelectableShiftOptions(shifts, wo.shift)
  const [form, setForm] = useState({
    date: today, shift: (wo.shift || shiftOptions[0]?.id || "") as Shift,
    machineId: processMachines[0]?.id || "", machineName: processMachines[0]?.name || "",
    startTime: "08:00", endTime: "08:30",
    reasonCode: REASON_CODES.downtime[0], notes: "",
  })

  const durationMinutes = (() => {
    try {
      const [sh, sm] = form.startTime.split(":").map(Number)
      const [eh, em] = form.endTime.split(":").map(Number)
      const diff = (eh * 60 + em) - (sh * 60 + sm)
      return diff > 0 ? diff : 0
    } catch { return 0 }
  })()

  const handleMachineChange = (id: string) => {
    const m = processMachines.find(m => m.id === id)
    setForm(p => ({ ...p, machineId: id, machineName: m?.name || "" }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (durationMinutes <= 0) { alert("End time must be after start time"); return }
    onSave({
      workOrderId: wo.id, process: wo.process,
      machineId: form.machineId, machineName: form.machineName,
      shift: form.shift, date: form.date,
      startTime: form.startTime, endTime: form.endTime,
      durationMinutes, reasonCode: form.reasonCode,
      notes: form.notes, reportedBy: currentUserName,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-red-50 border-b border-red-200 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-red-600"/>
            <div>
              <h2 className="text-lg font-black text-red-900">Log Downtime Event</h2>
              <p className="text-xs text-red-600 mt-0.5">{wo.partName} · {wo.id}</p>
            </div>
          </div>
          <button onClick={onClose}><X size={20} className="text-red-400 hover:text-red-700"/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Date *</label><input type="date" required value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className={inputCls}/></div>
            <div><label className={labelCls}>Shift</label>
              <select value={form.shift} onChange={e=>setForm(p=>({...p,shift:e.target.value as Shift}))} className={`${inputCls} bg-white`}>
                <option value="">— Select shift —</option>
                {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div><label className={labelCls}>Machine *</label>
            <select required value={form.machineId} onChange={e=>handleMachineChange(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">— Select machine —</option>
              {processMachines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Start Time *</label><input type="time" required value={form.startTime} onChange={e=>setForm(p=>({...p,startTime:e.target.value}))} className={inputCls}/></div>
            <div><label className={labelCls}>End Time *</label><input type="time" required value={form.endTime} onChange={e=>setForm(p=>({...p,endTime:e.target.value}))} className={inputCls}/></div>
          </div>
          {durationMinutes > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 font-bold">
              Duration: {durationMinutes} minutes
            </div>
          )}
          <div><label className={labelCls}>Downtime Reason *</label>
            <select required value={form.reasonCode} onChange={e=>setForm(p=>({...p,reasonCode:e.target.value}))} className={`${inputCls} bg-white`}>
              {REASON_CODES.downtime.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Notes</label>
            <textarea rows={3} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} className={`${inputCls} resize-none`} placeholder="Describe the issue, action taken, resolution..."/>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700">Log Downtime</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Record Card ──────────────────────────────────────────────────────────────
function RecordCard({ record, wo, shifts }: { record: ProcessRecord; wo: WorkOrder; shifts: ReturnType<typeof useApp>["shifts"] }) {
  const needsScrap = PROCESS_RULES[record.process].scrap
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${processColor(record.process)}`}>
            {processIcon(record.process)} {PROCESS_STAGE_LABELS[record.process]}
          </span>
          {record.isVendorProduction && (
            <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full border border-violet-200">
              <Building2 size={9}/> {record.vendorName}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 font-mono">{record.date} · {getShiftLabel(shifts, record.shift)}</span>
        {record.machineName && <span className="text-xs text-slate-500 font-semibold"> · {record.machineName}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          ["Input (KG)",   `${record.inputWeightKg}`,                  ""],
          ["Output (Nos)", `${record.outputQuantity}`,                  ""],
          ["Output (KG)",  `${record.outputWeightKg}`,                  ""],
          ...(needsScrap ? [["Scrap (KG)", `${record.scrapWeightKg.toFixed(2)}`, "text-orange-600 font-bold"]] : []),
          ["Good Parts",   `${record.goodParts}`,    "text-emerald-700 font-bold"],
          ["Rework",       `${record.reworkParts}`,  "text-amber-700 font-bold"],
          ["Rejected",     `${record.rejectedParts}`,"text-red-700 font-bold"],
          ["Waste (KG)",   `${record.materialWasteKg}`, ""],
        ].map(([k,v,c]) => (
          <div key={k} className="bg-slate-50 rounded-xl p-2.5">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{k}</p>
            <p className={`font-bold text-slate-900 mt-0.5 ${c}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {record.inputAcceptanceChecked && <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-full border border-blue-200">✓ Input Checked</span>}
        {record.ptcApprovalGiven && <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full border border-indigo-200">✓ PTC: {record.ptcApprovedBy}</span>}
        {record.qiInspectedBy && <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-200">✓ QI: {record.qiInspectedBy}</span>}
      </div>
      {record.reworkEntries.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs space-y-1">
          <p className="font-black text-amber-700 uppercase tracking-wider text-[10px] mb-1">Rework</p>
          {record.reworkEntries.map((e,i)=><div key={i} className="flex justify-between text-amber-800"><span>{e.reasonCode}</span><span className="font-mono font-bold">{e.quantity} pcs</span></div>)}
        </div>
      )}
      {record.rejectionEntries.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs space-y-1">
          <p className="font-black text-red-700 uppercase tracking-wider text-[10px] mb-1">Rejections</p>
          {record.rejectionEntries.map((e,i)=><div key={i} className="flex justify-between text-red-800"><span>{e.reasonCode}</span><span className="font-mono font-bold">{e.quantity} pcs</span></div>)}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProductionPage() {
  const {
    currentUser, workOrders, processRecords,
    downtimeEvents, addDowntimeEvent, shifts, mainWorkOrdersV2, processWorkOrdersV2, woMachineAssignmentsV2,
  } = useApp()
  const role = currentUser?.role as UserRole

  const isPTCDC      = role === UserRole.PTC_DIE_CASTING
  const isPTCCoat    = role === UserRole.PTC_COATING
  const isPTCCNC     = role === UserRole.PTC_CNC_VMC
  const isQI         = role === UserRole.QUALITY_INSPECTOR
  const isAdmin      = role === UserRole.ADMIN
  const isPTCManager = role === UserRole.PTC_MANAGER
  const isProcessPTC = isPTCDC || isPTCCoat || isPTCCNC
  const isQIDC      = role === UserRole.QI_DIE_CASTING
  const isQICoat    = role === UserRole.QI_COATING
  const isQIMach    = role === UserRole.QI_MACHINING
  const isAnyQI     = isQI || isQIDC || isQICoat || isQIMach
  const canRecord    = isAdmin || isProcessPTC || isAnyQI || isPTCManager

  const myProcess: ProcessStage|null =
    isPTCDC   ? "die_casting" :
    isPTCCoat ? "coating" :
    isPTCCNC  ? "cnc_vmc" :
    isQIDC    ? "die_casting" :
    isQICoat  ? "coating" :
    isQIMach  ? "cnc_vmc" : null

  const [processFilter, setProcessFilter] = useState<ProcessStage|"all">("all")
  const [expandedWO, setExpandedWO]       = useState<string|null>(null)
  const [showDowntimeForm, setShowDowntimeForm] = useState<WorkOrder|null>(null)

  const filteredWOs = useMemo(() => workOrders.filter(wo =>
    wo.woType !== "standard" && wo.status !== "draft" && wo.status !== "awaiting_qi" && wo.status !== "rejected" && wo.status !== "finished_goods" &&
    (processFilter === "all" || wo.process === processFilter) &&
    (!myProcess || wo.process === myProcess)
  ), [workOrders, processFilter, myProcess])

  const totalGood     = processRecords.reduce((s,r)=>s+r.goodParts,0)
  const totalRework   = processRecords.reduce((s,r)=>s+r.reworkParts,0)
  const totalRejected = processRecords.reduce((s,r)=>s+r.rejectedParts,0)
  const totalScrap    = processRecords.reduce((s,r)=>s+r.scrapWeightKg,0)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-black text-slate-900">Production Process</h1>
        <p className="text-slate-600 mt-1">
          {myProcess
            ? `${PROCESS_STAGE_LABELS[myProcess]} — Log production records and QI inspection`
            : "Die Casting → Coating → CNC/VMC — Record production, QI inspection & inventory update"}
        </p>
      </header>

      {(isProcessPTC || isAdmin) && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-black text-slate-900">Shift-end Machine Actuals</h2>
            <p className="text-xs text-slate-500">PDC subroles must submit end-of-shift machine production, raw usage and downtime here.</p>
          </div>
          <ShiftProductionEntry />
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:"Good Parts",       value: totalGood,                 bg:"bg-emerald-50 border-emerald-200", text:"text-emerald-700" },
          { label:"Rework Parts",     value: totalRework,               bg:"bg-amber-50 border-amber-200",     text:"text-amber-700" },
          { label:"Rejected Parts",   value: totalRejected,             bg:"bg-red-50 border-red-200",         text:"text-red-700" },
          { label:"Total Scrap (KG)", value:`${totalScrap.toFixed(1)}`, bg:"bg-slate-50 border-slate-200",     text:"text-slate-700" },
        ].map(s=>(
          <div key={s.label} className={`rounded-2xl border ${s.bg} p-5 shadow-sm`}>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Process filters */}
      <div className="flex gap-2 flex-wrap">
        {(myProcess
          ? [[myProcess, PROCESS_STAGE_LABELS[myProcess]]]
          : [["all","All Processes"],["die_casting","🔥 Die Casting"],["coating","🎨 Coating"],["cnc_vmc","⚙️ CNC/VMC"]]
        ).map(([val,label])=>(
          <button key={val} onClick={()=>setProcessFilter(val as ProcessStage|"all")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${processFilter===val?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Work Order list */}
      <div className="space-y-4">
        {filteredWOs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <ClipboardList size={40} className="mx-auto text-slate-200 mb-3"/>
            <p className="text-slate-400 font-medium">No active work orders for this process</p>
          </div>
        ) : filteredWOs.map(wo => {
          const records  = processRecords.filter(r => r.workOrderId === wo.id)
          const isExp    = expandedWO === wo.id
          const linkedMain = mainWorkOrdersV2.find(m => m.scheduleId === wo.masterId && m.partId === wo.partId)
          const linkedProcessWoIds = linkedMain
            ? processWorkOrdersV2.filter(p => p.parentWoId === linkedMain.id).map(p => p.id)
            : []
          const machineActuals = woMachineAssignmentsV2.filter(a => linkedProcessWoIds.includes(a.processWoId))
          const producedFromRecords = records.reduce((sum, r) => sum + Number(r.outputQuantity || 0), 0)
          const goodFromRecords = records.reduce((sum, r) => sum + Number(r.goodParts || 0), 0)
          const reworkFromRecords = records.reduce((sum, r) => sum + Number(r.reworkParts || 0), 0)
          const rejectedFromRecords = records.reduce((sum, r) => sum + Number(r.rejectedParts || 0), 0)
          const partsCompletedView = Math.max(Number(wo.partsCompleted || 0), producedFromRecords)
          const goodPartsView = Math.max(Number(wo.goodParts || 0), goodFromRecords)
          const reworkPartsView = Math.max(Number(wo.reworkParts || 0), reworkFromRecords)
          const rejectedPartsView = Math.max(Number(wo.rejectedParts || 0), rejectedFromRecords)
          const progress = wo.targetPartNos > 0 ? Math.round((partsCompletedView/wo.targetPartNos)*100) : 0

          return (
            <div key={wo.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* WO header */}
              <div className="p-5 flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{wo.id}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${processColor(wo.process)}`}>
                      {processIcon(wo.process)} {PROCESS_STAGE_LABELS[wo.process]}
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      wo.status==="completed"  ?"bg-emerald-100 text-emerald-800":
                      wo.status==="in_progress"?"bg-blue-100 text-blue-800":
                                                "bg-amber-100 text-amber-800"}`}>
                      {wo.status === "awaiting_qi" ? "awaiting QI" : wo.status === "finished_goods" ? "finished goods" : wo.status.replace("_"," ")}
                    </span>
                    {wo.productionStarted && <Lock size={11} className="text-slate-300"/>}
                    {wo.isExternal && (
                      <span className="flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full border border-violet-200">
                        <Building2 size={9}/> {wo.vendorName}
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-900">{wo.partName}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Grade <span className="font-bold text-slate-700">{wo.materialGrade}</span> ·
                    <span className="ml-1">{getShiftLabel(shifts, wo.shift)}</span> ·
                    <span className="font-bold text-slate-700 ml-1">{wo.machine}</span> ·
                    Target: {wo.targetPartNos} pcs
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setExpandedWO(isExp?null:wo.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    {isExp ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>
                    {partsCompletedView}/{wo.targetPartNos} ·
                    <span className="text-emerald-700 font-bold"> ✓{goodPartsView}</span>
                    <span className="text-amber-700 font-bold"> ↻{reworkPartsView}</span>
                    <span className="text-red-700 font-bold"> ✕{rejectedPartsView}</span>
                    {PROCESS_RULES[wo.process].scrap && wo.scrapWeight > 0 &&
                      <span className="text-orange-700 font-bold"> Scrap:{wo.scrapWeight.toFixed(1)}kg</span>}
                  </span>
                  <span className="font-bold">{progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${progress===100?"bg-emerald-500":"bg-blue-500"}`} style={{width:`${progress}%`}}/>
                </div>
              </div>

              {/* Expanded section: daily entries + production records + downtime */}
              {isExp && (
                <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-6">

                  {/* ── Shift-end Machine Actual Entries ── */}
                  <div>
                    <h4 className="font-black text-slate-700 text-sm mb-3">
                      Shift-end Machine Actual Entries ({machineActuals.length})
                    </h4>
                    {machineActuals.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">No machine actual entries yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {machineActuals.map(a => (
                          <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-3 text-xs">
                            <p className="font-bold text-slate-800">{a.machineName} · {a.shiftDate} / {getShiftLabel(shifts, a.shift as Shift)}</p>
                            <p className="text-slate-600 mt-1">Committed: {a.partsCommitted} · Produced: {a.partsProduced ?? a.producedQty ?? 0}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Downtime Events (§10) ── */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-black text-slate-700 text-sm">
                        Downtime Events ({downtimeEvents.filter(e=>e.workOrderId===wo.id).length})
                      </h4>
                    </div>
                    {downtimeEvents.filter(e=>e.workOrderId===wo.id).length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">No downtime events recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {downtimeEvents.filter(e=>e.workOrderId===wo.id).map(evt => (
                          <div key={evt.id} className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-black text-red-800">{evt.reasonCode}</span>
                              <span className="text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded-full">{evt.durationMinutes} min</span>
                            </div>
                            <p className="text-red-700">{evt.date} · {evt.startTime}–{evt.endTime} · {evt.machineName}</p>
                            {evt.notes && <p className="text-red-600 italic mt-1">{evt.notes}</p>}
                            <p className="text-red-400 mt-1 text-[10px]">Reported by: {evt.reportedBy}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Downtime Modal */}
      {showDowntimeForm && (
        <DowntimeForm
          wo={showDowntimeForm}
          onClose={() => setShowDowntimeForm(null)}
          onSave={(data) => { addDowntimeEvent(data); setShowDowntimeForm(null) }}
          currentUserName={currentUser!.name}
        />
      )}
    </div>
  )
}