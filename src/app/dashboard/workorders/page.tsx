"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, PROCESS_STAGE_LABELS, QI_ROLE_PROCESS_MAP,
  type ProcessStage, type Shift, type WorkOrder, type WOStatus, type ShortcomingCategory,
} from "@/lib/store"
import { getSelectableShiftOptions, getShiftLabel } from "@/lib/shiftUtils"
import { buildStageSubWorkOrder } from "@/lib/workflow"
import {
  ClipboardList, Plus, X, Edit2, Trash2, Lock, AlertTriangle,
  ChevronDown, ChevronRight, CheckCircle2, Building2, Pencil,
  GitBranch, ArrowUpRight, Package, Layers, Calendar, Settings2,
  ChevronLeft, Info,
} from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
const selectCls = `${cls} bg-white`
const readOnlyCls = `${cls} bg-slate-50 text-slate-500 cursor-not-allowed`
const lbl = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"

function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={lbl}>
        {label}{req && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

const statusStyle = (s: string) =>
  s === "finished_goods" ? "bg-emerald-200 text-emerald-900" :
  s === "completed"      ? "bg-emerald-100 text-emerald-800" :
  s === "awaiting_qi"    ? "bg-violet-100 text-violet-800" :
  s === "rejected"       ? "bg-red-100 text-red-800" :
  s === "in_progress"    ? "bg-blue-100 text-blue-800" :
  s === "not_started"    ? "bg-amber-100 text-amber-800" :
  s === "draft"          ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-600"

const statusLabel = (s: string) =>
  s === "draft"          ? "Draft — Awaiting Process Details" :
  s === "not_started"    ? "Active SWO — Ready to Start" :
  s === "in_progress"    ? "In Progress" :
  s === "awaiting_qi"    ? "Awaiting QI Validation" :
  s === "rejected"       ? "Rejected — Rework Required" :
  s === "finished_goods" ? "Finished Goods" : "Completed"

const processColor = (p: ProcessStage) =>
  p === "die_casting" ? "bg-orange-100 text-orange-800 border-orange-200" :
  p === "coating"     ? "bg-purple-100 text-purple-800 border-purple-200" :
                        "bg-cyan-100 text-cyan-800 border-cyan-200"

const processIcon = (p: ProcessStage) =>
  p === "die_casting" ? "🔥" : p === "coating" ? "🎨" : "⚙️"

type ProgramOption = {
  id: string
  programId?: string
  programName?: string
  name?: string
  /** Raw material KG required to produce 1 part — from config/program master */
  rawMaterialKgPerPart?: number
}

const createClientId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

// ─── Phase 1 Form (PDC Manager — WO Shell) ────────────────────────────────────
function Phase1Form({ onClose, onSave, initial }: {
  onClose: () => void
  onSave: (data: Partial<WorkOrder>) => void
  initial?: WorkOrder
}) {
  const { schedules } = useApp()
  const today = new Date().toISOString().split("T")[0]
  const isEdit = !!initial
  const isPartLocked = isEdit && initial!.status !== "draft"

  const [form, setForm] = useState({
    date:               initial?.date               || today,
    masterId:           initial?.masterId           || "",
    partId:             initial?.partId             || "",
    partName:           initial?.partName           || "",
    process:            initial?.process            || "die_casting" as ProcessStage,
    targetPartNos:      initial?.targetPartNos      || "" as unknown as number,
    requiredQuantityKg: initial?.requiredQuantityKg || "" as unknown as number,
    workOrderStartDate: initial?.workOrderStartDate  || today,
    dueDate:            initial?.dueDate            || "",
  })

  const handleScheduleChange = (masterId: string) => {
    const sch = schedules.find(s => s.id === masterId)
    setForm(p => ({ ...p, masterId, partId: sch?.partId || "", partName: sch?.partName || "" }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const selectedSchedule = schedules.find(s => s.id === form.masterId)
    if (selectedSchedule && Number(form.targetPartNos) > Number(selectedSchedule.requiredQuantity)) {
      alert(`Required Qty (Nos) cannot exceed monthly schedule quantity (${selectedSchedule.requiredQuantity}).`)
      return
    }
    if (form.workOrderStartDate > form.dueDate) { alert("WO start date cannot be after due date"); return }
    if (selectedSchedule && form.date > selectedSchedule.date) { alert("WO date cannot exceed component due date"); return }
    if (selectedSchedule && form.dueDate > selectedSchedule.date) { alert("WO due date cannot exceed component due date"); return }
    onSave({
      ...form,
      targetPartNos:      Number(form.targetPartNos),
      requiredQuantityKg: Number(form.requiredQuantityKg),
      status: isEdit ? initial!.status : "draft",
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-black text-slate-900">{isEdit ? "Edit Work Order" : "New Work Order"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Phase 1 — PDC Manager: Part, dates, quantities</p>
          </div>
          <button onClick={onClose}><X size={22} className="text-slate-400 hover:text-slate-700"/></button>
        </div>

        <div className="p-4 mx-6 mt-5 mb-0 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
          <strong>PDC Manager scope:</strong> Select the part from the monthly schedule and set quantities/dates. The system creates the first Die Casting SWO automatically; each approved QI decision creates the next process SWO.
        </div>

        {isPartLocked && (
          <div className="mx-6 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
            <span className="shrink-0 font-black">⚠</span>
            <span>This Work Order is <strong>Ready to Start</strong> — Part, process, and dates are locked. You may only edit: Target Qty, Required Weight, and Due Date.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="WO Date" req>
              <input type="date" required value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))} className={cls}
                readOnly={isPartLocked} disabled={isPartLocked}/>
            </Field>
            <Field label="Initial Process" req>
              <input readOnly value={PROCESS_STAGE_LABELS.die_casting} className={readOnlyCls}/>
            </Field>
          </div>

          <Field label="Part (from Monthly Schedule)" req>
            <select required value={form.masterId} onChange={e => handleScheduleChange(e.target.value)} className={selectCls}
              disabled={isPartLocked}>
              <option value="">— Select part from schedule —</option>
              {schedules.map(s => (
                <option key={s.id} value={s.id}>{s.partName} ({s.partId}) — Req: {s.requiredQuantity} nos</option>
              ))}
            </select>
            {isPartLocked && <p className="text-[10px] text-amber-600 mt-1 font-bold">🔒 Part locked — WO is already activated</p>}
          </Field>

          {form.partId && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
              <div><span className="text-slate-500">Part ID:</span> <span className="font-mono font-bold text-indigo-700">{form.partId}</span></div>
              <div><span className="text-slate-500">Process:</span> <span className="font-bold">{PROCESS_STAGE_LABELS[form.process]}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Required Qty (Nos)" req>
              <input type="number" required min="1" value={form.targetPartNos || ""}
                onChange={e => setForm(p=>({...p,targetPartNos:Number(e.target.value)}))} className={cls} placeholder="e.g. 100"/>
            </Field>
            <Field label="Required Weight (KG)" req>
              <input type="number" required min="0.1" step="0.1" value={form.requiredQuantityKg || ""}
                onChange={e => setForm(p=>({...p,requiredQuantityKg:Number(e.target.value)}))} className={cls} placeholder="e.g. 120"/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" req>
              <input type="date" required value={form.workOrderStartDate} onChange={e => setForm(p=>({...p,workOrderStartDate:e.target.value}))} className={cls}/>
            </Field>
            <Field label="Due Date" req>
              <input type="date" required value={form.dueDate} onChange={e => setForm(p=>({...p,dueDate:e.target.value}))} className={cls}/>
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
              {isEdit ? "Save Changes" : "Create WO + Die Casting SWO"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Phase 2 Form — Two-Window Design ─────────────────────────────────────────
function Phase2Form({ wo, onClose, onSave }: {
  wo: WorkOrder; onClose: () => void; onSave: (data: Partial<WorkOrder>) => void
}) {
  const {
    materials, users, ptcs, shifts, workOrders, machines, programs,
    processWorkOrdersV2, mainWorkOrdersV2, woMachineAssignmentsV2,
  } = useApp()

  // Which window we are on (1 = Material Claim, 2 = Day/Shift/Machine)
  const [window, setWindow] = useState<1 | 2>(1)

  // ── Derived config ───────────────────────────────────────────────────────────
  const shiftOptions     = getSelectableShiftOptions(shifts, wo.shift)
  const approvedMats     = materials.filter(m => m.status === "approved")
  const processMachines  = machines.filter(m => m.process === wo.process && m.status === "active")
  const validPDCs        = ptcs.filter(p => p.process === wo.process)
  const processPrograms  = (programs as ProgramOption[]).filter(
    p => !("process" in p) || (p as unknown as { process?: string }).process === wo.process
  )

  // Sub-WOs already assigned to this part/process (for PDC manager snapshot)
  const assignedProcessRows = processWorkOrdersV2.filter(p => {
    if (p.processType !== wo.process) return false
    const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
    return parent?.partId === wo.partId
  })

  // ── Window 1 State ───────────────────────────────────────────────────────────
  const [rawMaterialId,  setRawMaterialId]  = useState(wo.rawMaterialId  || "")
  const [materialGrade,  setMaterialGrade]  = useState(wo.materialGrade  || "")
  const [claimPartsQty,  setClaimPartsQty]  = useState<number>(wo.actualTarget || wo.targetPartNos)
  const [requiredQtyKg,  setRequiredQtyKg]  = useState<number>(wo.requiredQuantityKg || 0)
  const [bufferPercent,  setBufferPercent]  = useState<number>(2)
  const [acquiredQtyKg,  setAcquiredQtyKg]  = useState<number>(wo.requiredQuantityKg || 0)
  const [partPerCycle,   setPartPerCycle]   = useState<number>(wo.partPerCycle || 1)
  const [weightPerPart,  setWeightPerPart]  = useState<number>(wo.weightPerPart || 0)
  const [ptcId,          setPtcId]          = useState(wo.ptcId || (validPDCs[0]?.id || ""))
  const [isExternal,     setIsExternal]     = useState(wo.isExternal || false)
  const [vendorId,       setVendorId]       = useState(wo.vendorId || "")
  const [vendorName,     setVendorName]     = useState(wo.vendorName || "")

  // ── Window 2 State ───────────────────────────────────────────────────────────
  const [shiftDate,      setShiftDate]      = useState(wo.date || new Date().toISOString().split("T")[0])
  const [selectedShift,  setSelectedShift]  = useState<Shift>(wo.shift || (shiftOptions[0]?.id as Shift) || "" as Shift)
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>(
    wo.machine ? wo.machine.split(",").map(s => s.trim()).filter(Boolean).map(name => machines.find(m => m.name === name)?.id || "").filter(Boolean) : []
  )
  const [programId,      setProgramId]      = useState(wo.programId || (processPrograms[0]?.id || ""))
  // Per-machine committed parts: { machineId: qty }
  const [machinePartsMap, setMachinePartsMap] = useState<Record<string, number>>(wo.machineProducedMap || {})
  const [notes,          setNotes]          = useState("")

  // ── Derived calculations ─────────────────────────────────────────────────────
  const selectedMat     = approvedMats.find(m => m.id === rawMaterialId)
  const availableKg     = selectedMat ? selectedMat.receivedQuantity - (selectedMat.usedQuantity || 0) : 0
  const stockShortfall  = availableKg < wo.requiredQuantityKg

  // From config: kg per part (program master or fallback)
  const selectedProgram = processPrograms.find(p => p.id === programId)
  const kgPerPartConfig = selectedProgram?.rawMaterialKgPerPart || weightPerPart || 0
  const configDerivedKg = Number((claimPartsQty * kgPerPartConfig).toFixed(3))

  const assignedQtyKg   = Number((requiredQtyKg * (1 + bufferPercent / 100)).toFixed(2))
  const additionalQtyKg = Number((acquiredQtyKg  - assignedQtyKg).toFixed(2)) // read-only
  const leftoverQtyKg   = Number((assignedQtyKg  - acquiredQtyKg).toFixed(2))
  const autoOutputKg    = Number((claimPartsQty  * (weightPerPart || 0)).toFixed(2))

  // Occupied machines for this shift+date
  const occupiedMachineIds = new Set(
    woMachineAssignmentsV2
      .filter(a => a.shiftDate === shiftDate && a.shift === selectedShift)
      .map(a => a.machineId)
  )
  // Also check legacy WO machine reservations
  const legacyOccupiedNames = new Set(
    workOrders
      .filter(w => w.id !== wo.id && w.machine && w.date === shiftDate && w.shift === selectedShift &&
        !["completed","finished_goods","rejected"].includes(w.status))
      .flatMap(w => w.machine.split(",").map(s => s.trim()).filter(Boolean))
  )
  const isMachineOccupied = (m: typeof machines[0]) =>
    occupiedMachineIds.has(m.id) || legacyOccupiedNames.has(m.name)

  const totalMachineCommit = Object.values(machinePartsMap).reduce((s, v) => s + (Number(v) || 0), 0)
  const selectedMachineNames = selectedMachineIds.map(id => machines.find(m => m.id === id)?.name || "").filter(Boolean)
  const operatorsDisplay = selectedMachineIds.map(id => machines.find(m => m.id === id)?.operatorName || "Unassigned").join(", ")

  // Toggle machine selection
  const toggleMachine = (id: string) => {
    setSelectedMachineIds(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id)
        setMachinePartsMap(m => { const c = {...m}; delete c[id]; return c })
        return next
      }
      return [...prev, id]
    })
  }

  // ── Window 1 validation ──────────────────────────────────────────────────────
  const w1Valid = rawMaterialId && !stockShortfall && claimPartsQty > 0 && requiredQtyKg > 0 && ptcId

  // ── Final submit ─────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!w1Valid) { setWindow(1); return }
    if (!isExternal && selectedMachineIds.length === 0) { alert("Select at least one machine."); return }
    if (selectedMachineIds.some(id => occupiedMachineIds.has(id))) { alert("One or more selected machines are occupied for this shift."); return }
    if (!isExternal && totalMachineCommit > claimPartsQty) { alert("Sum of per-machine parts cannot exceed total claimed qty."); return }

    const machine = isExternal ? "" : selectedMachineNames.join(", ")
    const operator = isExternal
      ? ""
      : selectedMachineIds.map(id => machines.find(m => m.id === id)?.operatorName || "Unassigned").join(", ")

    onSave({
      rawMaterialId,
      materialGrade,
      rawMaterialGrade: selectedMat?.rawMaterialGrade || materialGrade,
      ptcId,
      isExternal,
      vendorId,
      vendorName,
      shift: selectedShift,
      machine,
      operator,
      actualTarget:    claimPartsQty,
      partPerCycle,
      weightPerPart,
      actualOutputKg:  autoOutputKg,
      inputWeightKg:   wo.requiredQuantityKg,
      machineProducedMap: machinePartsMap,
      // Store full material-claim context in acceptancePoints for audit
      acceptancePoints: [
        "As per configured QI checkpoints",
        `Req:${requiredQtyKg}kg Buffer:${bufferPercent}% Assigned:${assignedQtyKg}kg Acquired:${acquiredQtyKg}kg Additional:${additionalQtyKg}kg Leftover:${leftoverQtyKg}kg`,
        `MachineParts:${JSON.stringify(machinePartsMap)}`,
        notes ? `Notes:${notes}` : "",
      ].filter(Boolean).join(" | "),
      // Granular fields for DB / downstream use
      requiredQtyKg,
      bufferPercent,
      assignedQtyKg,
      takenQtyKg:      acquiredQtyKg,
      leftoverQtyKg,
      additionalQtyKg,
      shiftDate,
      programId,
      programName:     selectedProgram?.programName || selectedProgram?.name || "",
      notes,
      status: "not_started",
    })
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${processColor(wo.process)}`}>
                {processIcon(wo.process)} {PROCESS_STAGE_LABELS[wo.process]}
              </span>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Draft — Fill Operational Details
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900">{wo.partName}</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{wo.partId} · Target: {wo.targetPartNos} nos · Req: {wo.requiredQuantityKg} KG</p>
          </div>
          <button onClick={onClose}><X size={22} className="text-slate-400 hover:text-slate-700"/></button>
        </div>

        {/* ── Step tabs ── */}
        <div className="flex border-b border-slate-200 shrink-0">
          {([
            { n: 1 as const, icon: Package,   label: "Window 1 — Material Claim" },
            { n: 2 as const, icon: Settings2, label: "Window 2 — Day / Shift / Machines" },
          ]).map(({ n, icon: Icon, label }) => (
            <button key={n}
              onClick={() => { if (n === 2 && !w1Valid) { alert("Complete Window 1 first."); return } setWindow(n) }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black border-b-2 transition-colors
                ${window === n
                  ? "border-blue-600 text-blue-700 bg-blue-50/60"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}>
              <Icon size={13}/>
              <span className="hidden sm:block">{label}</span>
              <span className="sm:hidden">Win {n}</span>
            </button>
          ))}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ═══════════════════════════════════════════════════════════
              WINDOW 1 — Material Claim & Quantity Planning
          ═══════════════════════════════════════════════════════════ */}
          {window === 1 && <>

            {/* PDC Manager context — what the manager entered */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Info size={11}/> PDC Manager Context (read-only)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {[
                  ["Part",         wo.partName],
                  ["Part ID",      wo.partId],
                  ["Process",      PROCESS_STAGE_LABELS[wo.process]],
                  ["Target Qty",   `${wo.targetPartNos} nos`],
                  ["Req. Weight",  `${wo.requiredQuantityKg} KG`],
                  ["Start → Due",  `${wo.workOrderStartDate} → ${wo.dueDate}`],
                ].map(([k,v]) => (
                  <div key={k}>
                    <span className="text-slate-400">{k}: </span>
                    <span className="font-semibold text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-WO Snapshot (from process work orders) */}
            {assignedProcessRows.length > 0 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-2">
                <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={11}/> Assigned Sub Work Orders Snapshot
                </p>
                <select className={selectCls} defaultValue="">
                  <option value="" disabled>Select to view committed / taken / leftover</option>
                  {assignedProcessRows.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.processWoNumber} | Committed: {p.targetParts} nos | Required: {p.requiredQtyKg} KG | Taken: {p.takenQtyKg} KG | Leftover: {p.leftoverQtyKg} KG
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-indigo-600">
                  {assignedProcessRows.length} sub-WO(s) found for this part/process.
                </p>
              </div>
            )}

            {/* Raw Material Selection */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Package size={11}/> Raw Material Selection
              </p>
              <Field label="Approved Material Stock" req>
                <select required value={rawMaterialId} onChange={e => {
                  const mat = approvedMats.find(m => m.id === e.target.value)
                  setRawMaterialId(e.target.value)
                  setMaterialGrade(mat?.rawMaterialGrade || "")
                }} className={selectCls}>
                  <option value="">— Select approved material —</option>
                  {approvedMats.map(m => (
                    <option key={m.id} value={m.id}>
                      Grade {m.rawMaterialGrade} · {m.rawMaterialId} · {(m.receivedQuantity-(m.usedQuantity||0)).toFixed(1)} KG available
                    </option>
                  ))}
                </select>
              </Field>
              {rawMaterialId && (
                <div className={`p-3 rounded-xl text-xs font-medium border ${stockShortfall ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                  Available: <strong>{availableKg.toFixed(1)} KG</strong> ·
                  Required (WO): <strong>{wo.requiredQuantityKg} KG</strong> ·
                  Grade: <strong>{selectedMat?.rawMaterialGrade}</strong>
                  {stockShortfall ? " — ⚠ INSUFFICIENT STOCK" : " — ✓ Stock OK"}
                </div>
              )}
            </div>

            {/* Material Claim & Quantity Planning */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-4">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                Quantity Planning & Material Claim
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Parts I Will Produce (Claim)" req hint="How many of the total target you are committing to">
                  <input type="number" required min="1" max={wo.targetPartNos} value={claimPartsQty}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setClaimPartsQty(v)
                      // Auto-derive required kg from config if available
                      if (kgPerPartConfig > 0) setRequiredQtyKg(Number((v * kgPerPartConfig).toFixed(3)))
                    }} className={cls}/>
                </Field>
                <Field label="Required Qty (KG)" req hint="Qty needed from config (part × kg/part)">
                  <input type="number" required min="0.1" step="0.01" value={requiredQtyKg}
                    onChange={e => setRequiredQtyKg(Number(e.target.value))} className={cls}/>
                </Field>
              </div>

              {kgPerPartConfig > 0 && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  Config rate: <strong>{kgPerPartConfig} KG/part</strong> → Auto Required: <strong>{configDerivedKg} KG</strong> for {claimPartsQty} parts
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Buffer %" req hint="CRV buffer added on top of required qty">
                  <input type="number" required min="0" step="0.1" value={bufferPercent}
                    onChange={e => setBufferPercent(Number(e.target.value))} className={cls}/>
                </Field>
                <Field label="Assigned Qty (KG)" hint="Required + Buffer — auto-calculated">
                  <input readOnly value={assignedQtyKg} className={readOnlyCls}/>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Acquired Qty (KG)" req hint="How much you physically took from inventory">
                  <input type="number" required min="0" step="0.01" value={acquiredQtyKg}
                    onChange={e => setAcquiredQtyKg(Number(e.target.value))} className={cls}/>
                </Field>
                <Field label="Additional Qty (KG)" hint="Acquired − Assigned (read-only)">
                  <input readOnly value={additionalQtyKg} className={`${readOnlyCls} ${additionalQtyKg > 0 ? "text-amber-600" : additionalQtyKg < 0 ? "text-red-600" : ""}`}/>
                </Field>
              </div>

              {/* Summary strip */}
              <div className="grid grid-cols-5 text-center gap-1">
                {[
                  { label: "Required",  value: `${requiredQtyKg} KG`,  color: "bg-slate-100 text-slate-700" },
                  { label: "Buffer",    value: `${bufferPercent}%`,     color: "bg-blue-50 text-blue-700" },
                  { label: "Assigned",  value: `${assignedQtyKg} KG`,  color: "bg-indigo-50 text-indigo-700" },
                  { label: "Acquired",  value: `${acquiredQtyKg} KG`,  color: "bg-teal-50 text-teal-700" },
                  { label: "Leftover",  value: `${leftoverQtyKg} KG`,  color: leftoverQtyKg < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-xl p-2 ${color}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
                    <p className="text-xs font-black mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {weightPerPart > 0 && claimPartsQty > 0 && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  Projected output: <strong>{autoOutputKg} KG</strong> ({claimPartsQty} × {weightPerPart} KG/part)
                </div>
              )}
            </div>

            {/* External vendor toggle */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={isExternal} onChange={e => setIsExternal(e.target.checked)} className="w-4 h-4 accent-violet-600"/>
                <span className="text-sm font-bold text-slate-800">External / Vendor Production</span>
              </label>
              {isExternal && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vendor ID">
                    <input value={vendorId} onChange={e => setVendorId(e.target.value)} placeholder="VND-001" className={cls}/>
                  </Field>
                  <Field label="Vendor Name" req>
                    <input required value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Precision Parts Ltd" className={cls}/>
                  </Field>
                </div>
              )}
            </div>
          </>}

          {/* ═══════════════════════════════════════════════════════════
              WINDOW 2 — Day / Shift / Machine Allocation
          ═══════════════════════════════════════════════════════════ */}
          {window === 2 && <>

            {/* W1 summary strip */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package size={11}/> Window 1 Summary
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  ["Claim",     `${claimPartsQty} nos`],
                  ["Required",  `${requiredQtyKg} KG`],
                  ["Acquired",  `${acquiredQtyKg} KG`],
                  ["Leftover",  `${leftoverQtyKg} KG`],
                ].map(([k,v]) => (
                  <div key={k} className="bg-white rounded-lg p-2 border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{k}</p>
                    <p className="font-black text-slate-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Date + Shift */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={11}/> Production Day &amp; Shift
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Production Date" req hint="Single day — one entry per shift">
                  <input type="date" required value={shiftDate}
                    min={wo.workOrderStartDate} max={wo.dueDate}
                    onChange={e => setShiftDate(e.target.value)} className={cls}/>
                </Field>
                <Field label="Shift" req hint="Derived from shift configuration">
                  <select required value={selectedShift} onChange={e => setSelectedShift(e.target.value as Shift)} className={selectCls}>
                    <option value="">— Select shift —</option>
                    {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label || s.id}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* Machine Allocation */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
              <p className="text-[10px] font-black text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                <Settings2 size={11}/> Machine Allocation — {PROCESS_STAGE_LABELS[wo.process]} only
              </p>

              {processMachines.length === 0 ? (
                <p className="text-xs text-red-600 font-bold">No active machines configured for {PROCESS_STAGE_LABELS[wo.process]}.</p>
              ) : (
                <div className="space-y-2">
                  {processMachines.map(m => {
                    const occupied = isMachineOccupied(m)
                    const checked  = selectedMachineIds.includes(m.id)
                    return (
                      <div key={m.id} className={`rounded-xl border p-3 transition-colors ${checked ? "border-indigo-300 bg-white" : occupied ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
                        <label className={`flex items-center gap-2.5 cursor-pointer ${occupied && !checked ? "opacity-50 cursor-not-allowed" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={occupied && !checked}
                            onChange={() => toggleMachine(m.id)}
                            className="w-4 h-4 accent-indigo-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${occupied && !checked ? "text-red-500" : "text-slate-800"}`}>{m.name}</p>
                            <p className="text-[10px] text-slate-400">Operator: {m.operatorName || "Unassigned"}{occupied && !checked ? " · OCCUPIED this shift" : ""}</p>
                          </div>
                        </label>

                        {checked && (
                          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                            <div>
                              <p className={lbl}>Operator (auto)</p>
                              <input readOnly value={m.operatorName || "Unassigned"} className={readOnlyCls}/>
                            </div>
                            <div>
                              <p className={lbl}>Parts this machine will make <span className="text-red-500">*</span></p>
                              <input
                                type="number" min="0" max={claimPartsQty}
                                value={machinePartsMap[m.id] ?? 0}
                                onChange={e => setMachinePartsMap(prev => ({ ...prev, [m.id]: Number(e.target.value) }))}
                                className={cls}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {selectedMachineIds.length > 0 && (
                <div className={`p-2.5 rounded-lg text-xs font-medium border ${totalMachineCommit > claimPartsQty ? "bg-red-50 border-red-200 text-red-700" : totalMachineCommit === claimPartsQty ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  Machine commit total: <strong>{totalMachineCommit}</strong> / <strong>{claimPartsQty}</strong> claimed parts
                  {totalMachineCommit > claimPartsQty ? " — ⚠ Exceeds claim" : totalMachineCommit === claimPartsQty ? " — ✓ Fully allocated" : " — ⏳ Partially allocated"}
                </div>
              )}
            </div>

            {/* Program */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Program Assignment</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Program (from Program Master)" req>
                  <select required value={programId} onChange={e => setProgramId(e.target.value)} className={selectCls}>
                    <option value="">— Select program —</option>
                    {processPrograms.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.programId || p.id} — {p.programName || p.name || ""}
                        {p.rawMaterialKgPerPart ? ` (${p.rawMaterialKgPerPart} KG/part)` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Operator(s) (auto-assigned)">
                  <input readOnly value={operatorsDisplay || "Select machine(s) above"} className={readOnlyCls}/>
                </Field>
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <Field label="Notes (optional)" hint="Shift-wise observations, shortcomings, remarks">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Machine 2 had brief coolant interruption at 14:30…"
                  className={`${cls} resize-none`}
                />
              </Field>
            </div>
          </>}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-slate-200 p-4 flex items-center gap-3">
          {window === 2 && (
            <button type="button" onClick={() => setWindow(1)}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
              <ChevronLeft size={14}/> Back
            </button>
          )}
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <div className="flex-1"/>
          {window === 1 && (
            <button type="button"
              disabled={!w1Valid}
              onClick={() => setWindow(2)}
              title={!w1Valid ? "Complete all required fields in Window 1 first" : ""}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              Next — Machine Allocation <ChevronRight size={14}/>
            </button>
          )}
          {window === 2 && (
            <button type="button"
              disabled={
                selectedMachineIds.length === 0 ||
                !selectedShift ||
                selectedMachineIds.some(id => occupiedMachineIds.has(id)) ||
                totalMachineCommit > claimPartsQty
              }
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle2 size={16}/> Activate Work Order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WorkOrdersPage() {
  const {
    currentUser, workOrders, shifts, addWorkOrder, updateWorkOrder, deleteWorkOrder,
    deductMaterial, schedules, machines, programs, mainWorkOrdersV2, processWorkOrdersV2,
    woMachineAssignmentsV2, addMainWorkOrderV2, addProcessWorkOrderV2,
    updateProcessWorkOrderV2, addWoMachineAssignmentV2, addWoAuditLog,
  } = useApp()
  const role = currentUser?.role as UserRole

  const [showPhase1, setShowPhase1]   = useState(false)
  const [editWO,     setEditWO]       = useState<WorkOrder | null>(null)
  const [phase2WO,   setPhase2WO]     = useState<WorkOrder | null>(null)
  const [expanded,   setExpanded]     = useState<string | null>(null)
  const [statusFilter,  setStatusFilter]  = useState("all")
  const [processFilter, setProcessFilter] = useState("all")
  const [showV2Planner, setShowV2Planner] = useState(false)
  const [v2ScheduleId,  setV2ScheduleId]  = useState("")
  const [v2ShiftDate,   setV2ShiftDate]   = useState("")
  const [v2StartDate,   setV2StartDate]   = useState("")
  const [v2EndDate,     setV2EndDate]     = useState("")
  const [v2TargetParts, setV2TargetParts] = useState("")
  const [v2Shift,       setV2Shift]       = useState<Shift | "">("" as Shift | "")
  const [v2MachineIds,  setV2MachineIds]  = useState<string[]>([])
  const [v2ProgramId,   setV2ProgramId]   = useState("")
  const [v2Produced,    setV2Produced]    = useState("")
  const [v2TakenQtyKg,  setV2TakenQtyKg]  = useState("")
  const [v2BufferPercent, setV2BufferPercent] = useState("2")
  const [v2Shortcoming, setV2Shortcoming] = useState("machine_breakdown")
  const [v2Notes,       setV2Notes]       = useState("")
  const [v2ProcessWoId, setV2ProcessWoId] = useState("")

  const v2SelectedSchedule = schedules.find(s => s.id === v2ScheduleId)
  const v2ScheduleMonthRange = useMemo(() => {
    if (!v2SelectedSchedule?.date) return null
    const base  = new Date(v2SelectedSchedule.date)
    const year  = base.getUTCFullYear()
    const month = base.getUTCMonth()
    const start = new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0]
    const end   = new Date(Date.UTC(year, month + 1, 0)).toISOString().split("T")[0]
    return { start, end }
  }, [v2SelectedSchedule])

  const v2EligibleSchedules = useMemo(() => schedules.map(s => {
    const committed = workOrders.filter(w => w.masterId === s.id).reduce((sum, w) => sum + Number(w.targetPartNos || 0), 0)
    const remaining = Math.max(Number(s.requiredQuantity || 0) - committed, 0)
    return { ...s, remaining }
  }).filter(s => s.remaining > 0), [schedules, workOrders])

  const v2DayCount = useMemo(() => {
    if (!v2StartDate || !v2EndDate) return 0
    const s = new Date(v2StartDate).getTime()
    const e = new Date(v2EndDate).getTime()
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0
    return Math.floor((e - s) / 86400000) + 1
  }, [v2StartDate, v2EndDate])

  const v2NextWoNo      = `WO-${String(mainWorkOrdersV2.length + 1).padStart(3, "0")}`
  const v2NextProcessNo = `PWO-${String(processWorkOrdersV2.length + 1).padStart(3, "0")}`
  const v2ChosenProcessWO = processWorkOrdersV2.find(p => p.id === v2ProcessWoId)
  const v2RequiredQtyKg = Number(v2ChosenProcessWO?.requiredQtyKg || v2SelectedSchedule?.requiredQuantityInKgs || 0)
  const v2AssignedQtyKg = Number((v2RequiredQtyKg * (1 + Number(v2BufferPercent || 0) / 100)).toFixed(2))
  const v2TakenQty      = Number(v2TakenQtyKg || 0)
  const v2AdditionalQty = Number((v2TakenQty - v2AssignedQtyKg).toFixed(2))
  const v2LeftoverQty   = Number((v2AssignedQtyKg - v2TakenQty).toFixed(2))

  const isPDCManager  = role === UserRole.PTC_MANAGER
  const isAdmin       = role === UserRole.ADMIN
  const isPDCDC       = role === UserRole.PTC_DIE_CASTING
  const isPDCCoat     = role === UserRole.PTC_COATING
  const isPDCCNC      = role === UserRole.PTC_CNC_VMC
  const isProcessPDC  = isPDCDC || isPDCCoat || isPDCCNC
  const isScopedQI    = role === UserRole.QI_DIE_CASTING || role === UserRole.QI_COATING || role === UserRole.QI_MACHINING || role === UserRole.QUALITY_INSPECTOR

  const myProcess: ProcessStage | null =
    isPDCDC ? "die_casting" : isPDCCoat ? "coating" : isPDCCNC ? "cnc_vmc" : null

  const visible = useMemo(() => {
    const filtered = workOrders.filter(w => {
      const matchStatus  = statusFilter  === "all" || w.status  === statusFilter
      const matchProcess = processFilter === "all" || w.process === processFilter
      const matchRole = !myProcess || (
        w.process === myProcess && (w.status === "draft" || w.status === "rejected")
      )
      return matchStatus && matchProcess && matchRole
    })
    return [...filtered].sort((a, b) => {
      const aRoot = a.woType === "rework" ? (a.parentWoId ?? a.id) : a.id
      const bRoot = b.woType === "rework" ? (b.parentWoId ?? b.id) : b.id
      if (aRoot !== bRoot) return aRoot.localeCompare(bRoot)
      const aIsSWO = a.woType === "rework" ? 1 : 0
      const bIsSWO = b.woType === "rework" ? 1 : 0
      if (aIsSWO !== bIsSWO) return aIsSWO - bIsSWO
      return (a.reworkCycleNumber ?? 0) - (b.reworkCycleNumber ?? 0)
    })
  }, [workOrders, statusFilter, processFilter, myProcess])

  const visibleGrouped = useMemo(() => {
    if (isProcessPDC) return visible.map(wo => ({ root: wo, children: [] as WorkOrder[] }))
    const roots = visible.filter(w => !w.parentWoId)
    return roots.map(root => ({
      root,
      children: visible.filter(w => w.parentWoId === root.id),
    }))
  }, [visible, isProcessPDC])

  const swoByParent = useMemo(() => {
    const map: Record<string, typeof workOrders> = {}
    workOrders.filter(w => (w.woType === "rework" || w.woType === "rejection") && w.parentWoId).forEach(w => {
      map[w.parentWoId!] = [...(map[w.parentWoId!] ?? []), w]
    })
    return map
  }, [workOrders])

  // ── PDC Manager: sub-WO dropdown per parent WO ──────────────────────────────
  // For each parent WO shown to the manager, collect its process sub-WOs
  const subWOsByParentLegacyId = useMemo(() => {
    const map: Record<string, typeof processWorkOrdersV2> = {}
    processWorkOrdersV2.forEach(p => {
      const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
      if (parent) {
        // Find the corresponding legacy WO for this mainV2
        const legacyWO = workOrders.find(w => w.masterId === parent.scheduleId && w.partId === parent.partId)
        if (legacyWO) {
          map[legacyWO.id] = [...(map[legacyWO.id] || []), p]
        }
      }
    })
    return map
  }, [processWorkOrdersV2, mainWorkOrdersV2, workOrders])

  const handlePhase1Save = async (data: Partial<WorkOrder>) => {
    if (editWO) {
      updateWorkOrder(editWO.id, data)
    } else {
      const primaryWO: Omit<WorkOrder, "id" | "createdAt"> = {
        ...(data as WorkOrder),
        process: "die_casting",
        status: "draft",
        partsCompleted: 0, goodParts: 0, reworkParts: 0, rejectedParts: 0,
        scrapWeight: 0, inputWeightKg: 0, productionStarted: false,
        materialGrade: "", rawMaterialId: "", rawMaterialGrade: "",
        shift: "" as Shift, machine: "", operator: "",
        actualTarget: Number(data.targetPartNos || 0), partPerCycle: 0, weightPerPart: 0, actualOutputKg: 0,
        acceptancePoints: "Primary WO shell — SWOs are system-generated per process stage.",
        isExternal: false,
        createdBy: currentUser!.name,
        woType: "standard",
        workflowStep: -1,
        workflowLabel: "Primary Work Order",
      }
      const parentId = await addWorkOrder(primaryWO)
      await addWorkOrder(buildStageSubWorkOrder({
        source: { ...primaryWO, id: parentId, createdAt: new Date().toISOString().split("T")[0] },
        process: "die_casting",
        createdBy: "System Workflow",
        parentWoId: parentId,
      }))
    }
    setEditWO(null); setShowPhase1(false)
  }

  const handlePhase2Save = async (data: Partial<WorkOrder>) => {
    if (!phase2WO) return
    if (data.rawMaterialId && phase2WO.requiredQuantityKg > 0) {
      const ok = await deductMaterial(data.rawMaterialId, phase2WO.requiredQuantityKg)
      if (!ok) {
        alert(`Stock deduction failed — insufficient inventory for Grade ${data.materialGrade}.`)
        return
      }
    }
    updateWorkOrder(phase2WO.id, {
      ...data,
      status: "not_started",
      phase2CompletedBy: currentUser!.name,
      phase2CompletedAt: new Date().toISOString().split("T")[0],
    })
    setPhase2WO(null)
  }

  const canDeleteWO   = (wo: WorkOrder) => (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")
  const canEditPhase1 = (wo: WorkOrder) => (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")
  const canFillPhase2 = (wo: WorkOrder) => wo.status === "draft" && (isAdmin || (isProcessPDC && wo.process === myProcess))

  const v2Save = async () => {
    const effectiveShiftDate = v2ShiftDate || v2StartDate
    const effectiveShift = v2Shift || (shifts[0]?.id as Shift | undefined) || ""
    if (!currentUser || !v2SelectedSchedule || !effectiveShiftDate || !effectiveShift) return
    if (!v2StartDate || !v2EndDate || !v2ScheduleMonthRange) { alert("Start and end dates are required."); return }
    if (v2StartDate > v2EndDate) { alert("Start date cannot be after end date."); return }
    if (v2StartDate < v2ScheduleMonthRange.start || v2EndDate > v2ScheduleMonthRange.end) { alert("Dates must be within the selected monthly schedule period."); return }
    const requiresMachineAssignment = isProcessPDC || isAdmin
    const selectedMachineIds = v2MachineIds
    if (requiresMachineAssignment && selectedMachineIds.length === 0) { alert("Select at least one machine."); return }
    if (requiresMachineAssignment && !v2ProgramId) { alert("Select a program."); return }
    const produced = Number(v2Produced || 0)
    const planned  = Number(v2TargetParts || 0)
    if (planned <= 0) { alert("Parts to be made must be greater than zero."); return }
    if (produced < 0) { alert("Produced qty cannot be negative."); return }
    if (produced > planned) { alert("Produced qty cannot exceed planned qty."); return }
    let perMachineCommit = 0
    if (requiresMachineAssignment) {
      const hasMachineConflict = selectedMachineIds.some(machineId =>
        woMachineAssignmentsV2.some(a => a.machineId === machineId && a.shiftDate === effectiveShiftDate && a.shift === effectiveShift))
      if (hasMachineConflict) { alert("One or more selected machines are already assigned for this shift/date."); return }
      perMachineCommit = Math.ceil(planned / selectedMachineIds.length)
      const overCapacityMachine = selectedMachineIds.find(machineId => {
        const load = woMachineAssignmentsV2.filter(a => a.machineId === machineId && a.shiftDate === effectiveShiftDate)
          .reduce((sum, a) => sum + Number(a.partsCommitted || 0), 0)
        return load + perMachineCommit > 500
      })
      if (overCapacityMachine) { alert("Machine capacity exceeded for shift (limit 500 parts/shift)."); return }
    }
    const program = (programs as ProgramOption[]).find(p => p.id === v2ProgramId)
    if (isProcessPDC && v2ChosenProcessWO) {
      await updateProcessWorkOrderV2(v2ChosenProcessWO.id, {
        shiftDate: effectiveShiftDate, shift: effectiveShift, targetParts: planned,
        requiredQtyKg: v2RequiredQtyKg, bufferPercent: Number(v2BufferPercent || 0),
        assignedQtyKg: v2AssignedQtyKg, takenQtyKg: v2TakenQty, leftoverQtyKg: v2LeftoverQty,
        shortcomingCategory: v2Shortcoming as ShortcomingCategory,
        shortcomingNotes: v2Notes.trim(), updatedAt: new Date().toISOString().split("T")[0],
      })
      const selectedCount = selectedMachineIds.length || 1
      const machineParts  = Math.floor(planned / selectedCount)
      for (const machineId of selectedMachineIds) {
        const machine = machines.find(m => m.id === machineId)
        await addWoMachineAssignmentV2({
          id: createClientId("ma"), processWoId: v2ChosenProcessWO.id, machineId,
          machineName: machine?.name || "", operatorName: machine?.operatorName || "Unassigned",
          shiftDate: effectiveShiftDate, shift: effectiveShift, programId: v2ProgramId,
          programName: program?.programName || "",
          partsCommitted: machineParts, producedQty: Number(v2Produced || 0),
          rejectedQty: 0, reworkQty: 0, createdAt: new Date().toISOString().split("T")[0],
        })
      }
      await addWoAuditLog({ id: createClientId("audit"), woId: v2ChosenProcessWO.parentWoId, processWoId: v2ChosenProcessWO.id, action: "v2_process_wo_filled_by_pdc", field: "status", oldValue: String(v2ChosenProcessWO.status || "scheduled"), newValue: "scheduled", actorId: currentUser.id, actorName: currentUser.name, createdAt: new Date().toISOString().split("T")[0] })
      setShowV2Planner(false)
      return
    }
    const mainId    = createClientId("main")
    const processId = createClientId("proc")
    await addMainWorkOrderV2({
      id: mainId, woNumber: v2NextWoNo, scheduleId: v2SelectedSchedule.id, partMasterId: v2SelectedSchedule.partMasterId || "",
      partId: v2SelectedSchedule.partId, partName: v2SelectedSchedule.partName,
      scheduleStartDate: v2StartDate, scheduleEndDate: v2EndDate, status: "scheduled",
      qty: { plannedQty: planned, reservedQty: 0, consumedQty: 0, producedQty: 0, balanceQty: planned },
      createdById: currentUser.id, createdByName: currentUser.name, createdAt: new Date().toISOString().split("T")[0],
    })
    await addProcessWorkOrderV2({
      id: processId, processWoNumber: v2NextProcessNo, parentWoId: mainId, rootWoId: mainId,
      processType: "die_casting", status: "scheduled",
      shiftDate: effectiveShiftDate, shift: effectiveShift, targetParts: planned,
      requiredQtyKg: Number(v2SelectedSchedule.requiredQuantityInKgs || 0), bufferPercent: 2,
      assignedQtyKg: v2AssignedQtyKg, takenQtyKg: v2TakenQty, leftoverQtyKg: v2LeftoverQty,
      shortcomingCategory: v2Shortcoming as ShortcomingCategory, shortcomingNotes: v2Notes.trim(),
      createdAt: new Date().toISOString().split("T")[0],
    })
    // Mirror draft shell in legacy WO list
    const primaryLegacyWoId = await addWorkOrder({
      date: new Date().toISOString().split("T")[0],
      masterId: v2SelectedSchedule.id, partId: v2SelectedSchedule.partId,
      partName: v2SelectedSchedule.partName, process: "die_casting",
      targetPartNos: planned, requiredQuantityKg: Number(v2SelectedSchedule.requiredQuantityInKgs || 0),
      workOrderStartDate: v2StartDate, dueDate: v2EndDate, status: "draft",
      partsCompleted: 0, goodParts: 0, reworkParts: 0, rejectedParts: 0,
      scrapWeight: 0, inputWeightKg: 0, productionStarted: false,
      materialGrade: "", rawMaterialId: "", rawMaterialGrade: "",
      shift: effectiveShift, machine: "", operator: "",
      actualTarget: planned, partPerCycle: 0, weightPerPart: 0, actualOutputKg: 0,
      acceptancePoints: "V2 WO created from schedule — pending process execution details.",
      isExternal: false, createdBy: currentUser.name, woType: "standard",
      workflowStep: -1, workflowLabel: "Primary Work Order",
    })
    await addWorkOrder(buildStageSubWorkOrder({
      source: {
        id: primaryLegacyWoId, createdAt: new Date().toISOString().split("T")[0],
        date: new Date().toISOString().split("T")[0],
        masterId: v2SelectedSchedule.id, partId: v2SelectedSchedule.partId,
        partName: v2SelectedSchedule.partName, process: "die_casting",
        targetPartNos: planned, requiredQuantityKg: Number(v2SelectedSchedule.requiredQuantityInKgs || 0),
        workOrderStartDate: v2StartDate, dueDate: v2EndDate, status: "draft",
        partsCompleted: 0, goodParts: 0, reworkParts: 0, rejectedParts: 0,
        scrapWeight: 0, inputWeightKg: 0, productionStarted: false,
        materialGrade: "", rawMaterialId: "", rawMaterialGrade: "",
        shift: effectiveShift, machine: "", operator: "",
        actualTarget: planned, partPerCycle: 0, weightPerPart: 0, actualOutputKg: 0,
        acceptancePoints: "V2 WO created from schedule — pending process execution details.",
        isExternal: false, createdBy: currentUser.name, woType: "standard",
        workflowStep: -1, workflowLabel: "Primary Work Order",
      },
      process: "die_casting", createdBy: "System Workflow", parentWoId: primaryLegacyWoId,
    }))
    if (requiresMachineAssignment) {
      for (const machineId of selectedMachineIds) {
        const machine   = machines.find(m => m.id === machineId)
        await addWoMachineAssignmentV2({
          id: createClientId("ma"), processWoId: processId, machineId,
          machineName: machine?.name || "", operatorName: machine?.operatorName || "Unassigned",
          shiftDate: effectiveShiftDate, shift: effectiveShift, programId: v2ProgramId,
          programName: program?.programName || "",
          partsCommitted: perMachineCommit, producedQty: Number(v2Produced || 0),
          rejectedQty: 0, reworkQty: 0, createdAt: new Date().toISOString().split("T")[0],
        })
      }
    }
    await addWoAuditLog({ id: createClientId("audit"), woId: mainId, processWoId: processId, action: "v2_wo_created_and_scheduled", field: "status", oldValue: "draft", newValue: "scheduled", actorId: currentUser.id, actorName: currentUser.name, createdAt: new Date().toISOString().split("T")[0] })
    setShowV2Planner(false)
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Work Orders</h1>
          <p className="text-slate-600 mt-1">
            {isPDCManager
              ? "Create work order shells — process PDCs will fill operational details"
              : isProcessPDC
              ? `${PROCESS_STAGE_LABELS[myProcess!]} — View & fill operational details for your process`
              : "Production planning & management"}
          </p>
        </div>
        {(isPDCManager || isAdmin) && (
          <button onClick={() => setShowV2Planner(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md">
            <Plus size={18}/> Work Order Execution Window
          </button>
        )}
      </header>

      {/* ── V2 Planner modal (unchanged from original) ── */}
      {showV2Planner && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">WO V2 Execution Window</h3>
              <button onClick={() => setShowV2Planner(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold">Close</button>
            </div>
            {(isPDCManager || isAdmin) && <>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 font-semibold">
              PDC Manager View: Create WO from monthly schedule.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Field label="Monthly Schedule (Pending)" req>
                <select className={selectCls} value={v2ScheduleId} onChange={e=>{ const id = e.target.value; setV2ScheduleId(id); const selected = v2EligibleSchedules.find(s => s.id === id); setV2TargetParts(String(selected?.remaining || "")) }}>
                  <option value="">Choose Monthly Schedule</option>
                  {v2EligibleSchedules.map(s=><option key={s.id} value={s.id}>{s.partId} — {s.partName} (Remaining: {s.remaining})</option>)}
                </select>
              </Field>
              <Field label="WO Number" req><input className={cls} value={v2NextWoNo} readOnly /></Field>
              <Field label="Part" req><input className={cls} value={v2SelectedSchedule ? `${v2SelectedSchedule.partId} — ${v2SelectedSchedule.partName}` : ""} readOnly/></Field>
              <Field label="Parts to be made" req><input className={cls} value={v2TargetParts} readOnly /></Field>
              <Field label="Start Date" req><input type="date" min={v2ScheduleMonthRange?.start} max={v2ScheduleMonthRange?.end} className={cls} value={v2StartDate} onChange={e=>setV2StartDate(e.target.value)} /></Field>
              <Field label="End Date" req><input type="date" min={v2ScheduleMonthRange?.start} max={v2ScheduleMonthRange?.end} className={cls} value={v2EndDate} onChange={e=>setV2EndDate(e.target.value)} /></Field>
              <Field label="No. of Days"><input className={cls} value={v2DayCount ? String(v2DayCount) : ""} readOnly /></Field>
            </div>
            {/* Sub-WO snapshot with committed/taken/leftover */}
            <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Sub Work Orders Snapshot — Committed / Taken / Leftover / Raw Material</p>
              {processWorkOrdersV2.filter(p => !v2ScheduleId || mainWorkOrdersV2.find(m => m.id === p.parentWoId)?.scheduleId === v2ScheduleId).length === 0 ? (
                <p className="text-xs text-slate-400">No sub work orders yet for this schedule.</p>
              ) : (
                <select className={selectCls}>
                  <option value="" disabled>Select sub-WO to inspect</option>
                  {processWorkOrdersV2
                    .filter(p => !v2ScheduleId || mainWorkOrdersV2.find(m => m.id === p.parentWoId)?.scheduleId === v2ScheduleId)
                    .map(p => {
                      const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
                      return (
                        <option key={p.id} value={p.id}>
                          {parent?.woNumber || p.parentWoId} · {p.processWoNumber} | Committed: {p.targetParts} nos | Required: {p.requiredQtyKg} KG | Taken: {p.takenQtyKg} KG | Leftover: {p.leftoverQtyKg} KG
                        </option>
                      )
                    })}
                </select>
              )}
            </div>
            </>}
            {isProcessPDC && <>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 font-semibold">
              Process PDC View ({PROCESS_STAGE_LABELS[myProcess!]}): Accept assigned WO, then capture shift-wise machine/program/operator allocation.
            </div>
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-black text-slate-800">Window 1 — Assigned Sub Work Order + Material Claim</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Sub Work Order" req>
                  <select className={selectCls} value={v2ProcessWoId} onChange={e=>setV2ProcessWoId(e.target.value)}>
                    <option value="">Select assigned sub work order</option>
                    {processWorkOrdersV2.filter(p=>p.processType===myProcess).map(p=>(
                      <option key={p.id} value={p.id}>{p.processWoNumber} | Committed: {p.targetParts} | Taken: {p.takenQtyKg} KG | Leftover: {p.leftoverQtyKg} KG</option>
                    ))}
                  </select>
                </Field>
                <Field label="Required Qty (KG)"><input className={cls} value={v2RequiredQtyKg || ""} readOnly/></Field>
                <Field label="Buffer %"><input className={cls} value={v2BufferPercent} onChange={e=>setV2BufferPercent(e.target.value)} /></Field>
                <Field label="Acquired Qty (KG)"><input className={cls} value={v2TakenQtyKg} onChange={e=>setV2TakenQtyKg(e.target.value)} /></Field>
              </div>
              <div className="text-xs text-slate-700 p-2 rounded-lg bg-slate-50 border border-slate-200">
                Assigned (Required+Buffer): <strong>{v2AssignedQtyKg} KG</strong> · Additional (Acquired−Assigned): <strong>{v2AdditionalQty} KG</strong> · Leftover: <strong>{v2LeftoverQty} KG</strong>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-black text-slate-800 mb-2">Machine Assignment (Shift-wise)</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Machines (multi-select)" req>
                  <div className="max-h-32 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1">
                    {machines.map(m => {
                      const occupied = !!(v2ShiftDate && v2Shift && woMachineAssignmentsV2.some(a => a.machineId === m.id && a.shiftDate === v2ShiftDate && a.shift === v2Shift))
                      const checked = v2MachineIds.includes(m.id)
                      return (
                        <label key={m.id} className={`flex items-center gap-2 text-xs ${occupied ? "text-slate-400" : "text-slate-700"}`}>
                          <input type="checkbox" disabled={occupied} checked={checked}
                            onChange={e => setV2MachineIds(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))}/>
                          {m.name} {occupied ? "(Occupied)" : `(Op: ${m.operatorName || "Unassigned"})`}
                        </label>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Program" req>
                  <select className={selectCls} value={v2ProgramId} onChange={e=>setV2ProgramId(e.target.value)}>
                    <option value="">From Program Master</option>
                    {(programs as ProgramOption[]).map(p=><option key={p.id} value={p.id}>{p.programId || p.id} - {p.programName || p.name}</option>)}
                  </select>
                </Field>
                <Field label="Operator(s)"><input className={cls} value={v2MachineIds.map(id => machines.find(m => m.id === id)?.operatorName || "Unassigned").join(", ")} readOnly /></Field>
                <Field label="Parts Produced" req><input className={cls} value={v2Produced} onChange={e=>setV2Produced(e.target.value)} placeholder="Machine-wise output"/></Field>
                <Field label="Shortcoming Category">
                  <select className={selectCls} value={v2Shortcoming} onChange={e=>setV2Shortcoming(e.target.value)}>
                    <option value="machine_breakdown">Machine Breakdown</option>
                    <option value="material_shortage">Material Shortage</option>
                    <option value="operator_absent">Operator Absent</option>
                    <option value="power_failure">Power Failure</option>
                    <option value="program_issue">Program Issue</option>
                    <option value="tool_change">Tool Change</option>
                    <option value="qa_hold">QA Hold</option>
                  </select>
                </Field>
              </div>
            </div>
            </>}
            {isScopedQI && (
              <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
                <p className="text-xs font-black text-emerald-800">QI View — Machine-wise inspection context</p>
                <div className="text-xs text-emerald-900 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {woMachineAssignmentsV2.slice(0, 8).map(a => (
                    <div key={a.id} className="rounded-lg border border-emerald-200 bg-white p-2">
                      <p><strong>Machine:</strong> {a.machineName} · <strong>Op:</strong> {a.operatorName}</p>
                      <p><strong>Shift:</strong> {a.shiftDate} / {a.shift}</p>
                      <p><strong>Produced:</strong> {a.producedQty} · <strong>Rework:</strong> {a.reworkQty} · <strong>Rejected:</strong> {a.rejectedQty}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={v2Save} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Save V2 WO</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Role info banners ── */}
      {isPDCManager && (
        <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-sm text-indigo-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-indigo-500"/>
          <p><strong>Your role:</strong> Create Work Order shells with part, dates, and quantities. Draft WOs appear in yellow — process PDCs will complete operational details to activate them.</p>
        </div>
      )}
      {isProcessPDC && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-blue-500"/>
          <p><strong>Your role ({PROCESS_STAGE_LABELS[myProcess!]}):</strong> Click <strong>&quot;Fill Details&quot;</strong> on any <em>Draft</em> WO for your process to enter material, shift, machine, and program details.</p>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Status</p>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white">
            <option value="all">All Status</option>
            {["draft","not_started","in_progress","awaiting_qi","completed","rejected","finished_goods"].map(s =>
              <option key={s} value={s}>{statusLabel(s as WOStatus)}</option>)}
          </select>
        </div>
        {!myProcess ? (
          <div className="space-y-1">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Process</p>
            <select value={processFilter} onChange={e => setProcessFilter(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white">
              <option value="all">All Process</option>
              {(["die_casting","coating","cnc_vmc"] as ProcessStage[]).map(p =>
                <option key={p} value={p}>{PROCESS_STAGE_LABELS[p]}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Process</p>
            <div className="px-3 py-2.5 text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-700">{PROCESS_STAGE_LABELS[myProcess]} view</div>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">View Summary</p>
          <div className="px-3 py-2.5 text-xs rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium">
            Showing {visibleGrouped.length} parent WO(s). Expand a parent to view SWO branches.
          </div>
        </div>
      </div>

      {/* ── Work Order Cards ── */}
      <div className="space-y-4">
        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <ClipboardList size={40} className="mx-auto text-slate-200 mb-3"/>
            <p className="text-slate-400 font-medium">No work orders found</p>
          </div>
        ) : visibleGrouped.map(({ root: wo, children: childSWOs }) => {
          const progress    = wo.targetPartNos > 0 ? Math.round((wo.partsCompleted / wo.targetPartNos) * 100) : 0
          const isDraft     = wo.status === "draft"
          const isSWO       = wo.woType === "rework"
          const parentWo    = isSWO && wo.parentWoId ? workOrders.find(w => w.id === wo.parentWoId) : null
          const treeChildren = childSWOs.length > 0 ? childSWOs : (swoByParent[wo.id] ?? [])

          // Sub-WOs for this WO (PDC manager view) — process work orders linked to it
          const linkedSubWOs = subWOsByParentLegacyId[wo.id] || []

          return (
            <div key={wo.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isSWO ? "border-l-4 border-l-amber-400 border-t border-r border-b border-slate-200 ml-4" : isDraft ? "border-amber-200" : "border-slate-200"}`}>
              <div className={`p-5 flex items-start justify-between flex-wrap gap-3 ${isSWO ? "bg-amber-50/30" : isDraft ? "bg-amber-50/40" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{wo.id}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${processColor(wo.process)}`}>
                      {processIcon(wo.process)} {PROCESS_STAGE_LABELS[wo.process]}
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${statusStyle(wo.status)}`}>
                      {statusLabel(wo.status)}
                    </span>
                    {wo.isExternal && (
                      <span className="flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full border border-violet-200">
                        <Building2 size={9}/> Vendor: {wo.vendorName}
                      </span>
                    )}
                    {isSWO && (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded-full border border-amber-300">
                        <GitBranch size={9}/> REWORK SWO · Cycle #{wo.reworkCycleNumber ?? 1}
                      </span>
                    )}
                    {isSWO && parentWo && (
                      <span className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                        <ArrowUpRight size={9}/> Parent: {parentWo.id}
                      </span>
                    )}
                    {!isSWO && treeChildren.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                        <GitBranch size={9}/> {treeChildren.length} Rework SWO{treeChildren.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {wo.status !== "draft" && wo.status !== "not_started" && <Lock size={11} className="text-slate-300"/>}
                  </div>

                  <h3 className="font-black text-slate-900 text-base">{wo.partName}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{wo.partId}</p>

                  {!isDraft ? (
                    <p className="text-xs text-slate-500 mt-1.5">
                      <span className="font-bold text-slate-700">{wo.machine}</span> ·
                      <span className="ml-1">{getShiftLabel(shifts, wo.shift)}</span> ·
                      Operator: <span className="font-bold text-slate-700">{wo.operator}</span> ·
                      Grade <span className="font-bold text-slate-700">{wo.materialGrade}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 mt-1.5 font-medium">⏳ Awaiting process PDC to fill operational details</p>
                  )}

                  <p className="text-xs text-slate-500 mt-0.5">
                    Target: <span className="font-bold">{wo.targetPartNos} nos</span> ·
                    Req: <span className="font-bold">{wo.requiredQuantityKg} KG</span> ·
                    Start: {wo.workOrderStartDate} · Due: {wo.dueDate}
                    {wo.phase2CompletedBy && <span className="ml-2 text-slate-400">· Ops filled by: <em>{wo.phase2CompletedBy}</em></span>}
                  </p>

                  {/* ── Sub-WO summary dropdown (PDC Manager view) ─────────────── */}
                  {(isPDCManager || isAdmin) && linkedSubWOs.length > 0 && (
                    <div className="mt-2">
                      <select
                        defaultValue=""
                        className="text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 text-indigo-800 font-semibold max-w-full"
                        onChange={() => {/* read-only view — no action */}}
                      >
                        <option value="" disabled>
                          📋 {linkedSubWOs.length} Sub-WO{linkedSubWOs.length > 1 ? "s" : ""} — select to view details
                        </option>
                        {linkedSubWOs.map(p => {
                          const committed  = p.targetParts || 0
                          const leftover   = p.leftoverQtyKg ?? 0
                          const taken      = p.takenQtyKg ?? 0
                          const required   = p.requiredQtyKg ?? 0
                          return (
                            <option key={p.id} value={p.id}>
                              {p.processWoNumber} | Process: {PROCESS_STAGE_LABELS[p.processType as ProcessStage] || p.processType} | Committed: {committed} nos | Required: {required} KG | Taken: {taken} KG | Leftover: {leftover} KG
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canFillPhase2(wo) && (
                    <button onClick={() => setPhase2WO(wo)}
                      className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm">
                      <Pencil size={13}/> Fill Details
                    </button>
                  )}
                  {canEditPhase1(wo) && (
                    <button onClick={() => { setEditWO(wo); setShowPhase1(true) }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                      <Edit2 size={15}/>
                    </button>
                  )}
                  {canDeleteWO(wo) && (
                    <button onClick={() => deleteWorkOrder(wo.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={15}/>
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === wo.id ? null : wo.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    {expanded === wo.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {!isDraft && (
                <div className="px-5 pb-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{wo.partsCompleted}/{wo.targetPartNos} parts · Good: {wo.goodParts} · Rework: {wo.reworkParts} · Rejected: {wo.rejectedParts}</span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${progress===100?"bg-emerald-500":"bg-blue-500"}`} style={{width:`${progress}%`}}/>
                  </div>
                </div>
              )}

              {/* Expanded details */}
              {expanded === wo.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {[
                      ["WO ID",    wo.id],
                      ["Part ID",  wo.partId],
                      ["Process",  PROCESS_STAGE_LABELS[wo.process]],
                      ["Status",   statusLabel(wo.status)],
                      ...(!isDraft ? [
                        ["Machine",       wo.machine],
                        ["Operator",      wo.operator],
                        ["Shift",         getShiftLabel(shifts, wo.shift)],
                        ["Material Grade",wo.materialGrade],
                        ["Parts/Cycle",   String(wo.partPerCycle)],
                        ["Weight/Part",   `${wo.weightPerPart} KG`],
                        ["Output KG",     `${wo.actualOutputKg} KG`],
                        ["Acceptance",    wo.acceptancePoints],
                      ] : []),
                      ["Created By", wo.createdBy],
                      ["Created At", wo.createdAt],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                        <p className="font-semibold text-slate-800 text-xs break-words">{v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Machine-wise parts breakdown (if stored) */}
                  {wo.machineProducedMap && Object.keys(wo.machineProducedMap).length > 0 && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Machine-wise Parts Allocation</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(wo.machineProducedMap).map(([machineId, qty]) => {
                          const m = machines.find(mc => mc.id === machineId)
                          return (
                            <div key={machineId} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                              <span className="font-bold text-indigo-800">{m?.name || machineId}</span>
                              <span className="text-indigo-600">→ {qty} parts</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {!isDraft && wo.acceptancePoints && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Acceptance Criteria / Audit Log</p>
                      <p className="text-xs text-amber-800">{wo.acceptancePoints}</p>
                    </div>
                  )}

                  {/* SWO Traceability */}
                  {isSWO && parentWo && (
                    <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GitBranch size={11}/> Rework Traceability
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {[
                          ["Parent WO ID",  parentWo.id],
                          ["Parent Part",   parentWo.partName],
                          ["Rework Cycle",  `#${wo.reworkCycleNumber ?? 1}`],
                          ["Rework Parts",  `${wo.reworkPartCount ?? wo.targetPartNos} parts`],
                          ["Parent Status", parentWo.status.replace("_"," ")],
                          ["Parent Progress", `${parentWo.goodParts} good / ${parentWo.reworkParts} rework / ${parentWo.rejectedParts} rejected`],
                        ].map(([k,v]) => (
                          <div key={k} className="bg-white border border-amber-100 rounded-lg p-2">
                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                            <p className="font-bold text-slate-800 break-words">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Child SWO list */}
                  {!isSWO && treeChildren.length > 0 && (
                    <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GitBranch size={11}/> Rework Sub Work Orders ({treeChildren.length})
                      </p>
                      <div className="space-y-2">
                        {treeChildren.map(swo => (
                          <div key={swo.id} className="flex items-center gap-3 bg-white border border-indigo-100 rounded-xl p-3 text-xs">
                            <GitBranch size={12} className="text-amber-500 shrink-0"/>
                            <span className="font-mono font-bold text-indigo-700">{swo.id}</span>
                            <span className="text-slate-500">Cycle #{swo.reworkCycleNumber ?? 1}</span>
                            <span className="font-bold text-slate-700">{swo.reworkPartCount ?? swo.targetPartNos} parts</span>
                            <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${statusStyle(swo.status)}`}>
                              {statusLabel(swo.status)}
                            </span>
                            <span className="text-slate-400 shrink-0">{swo.createdAt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modals ── */}
      {showPhase1 && (
        <Phase1Form
          onClose={() => { setShowPhase1(false); setEditWO(null) }}
          onSave={handlePhase1Save}
          initial={editWO || undefined}
        />
      )}
      {phase2WO && (
        <Phase2Form wo={phase2WO} onClose={() => setPhase2WO(null)} onSave={handlePhase2Save}/>
      )}
    </div>
  )
}