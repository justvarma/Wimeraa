"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { MachineAssignmentDropdown } from "@/components/ShiftProductionEntry"
import {
  UserRole, PROCESS_STAGE_LABELS, QI_ROLE_PROCESS_MAP,
  type ProcessStage, type Shift, type WorkOrder, type WOStatus, type ShortcomingCategory,
} from "@/lib/store"
import { getSelectableShiftOptions, getShiftLabel } from "@/lib/shiftUtils"
import { buildStageSubWorkOrder } from "@/lib/workflow"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore"
import {
  ClipboardList, Plus, X, Edit2, Trash2, Lock, AlertTriangle,
  ChevronDown, ChevronRight, CheckCircle2, Building2, Pencil,
  GitBranch, ArrowUpRight, Package, Layers, Calendar, Settings2,
  ChevronLeft, Info, RefreshCw, ShieldCheck, AlertCircle,
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
  rawMaterialKgPerPart?: number
}

const createClientId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

// ─── WO Hierarchy Tree ────────────────────────────────────────────────────────
// Renders the full drill-down: WO → SWOs (per shift) → QI row → Rework WOs → ...
// Each level is independently collapsible. Driven entirely by live workOrders data.

type ReworkNodeProps = {
  reworkWO: WorkOrder
  allWorkOrders: WorkOrder[]
  shifts: ReturnType<typeof useApp>["shifts"]
  machines: ReturnType<typeof useApp>["machines"]
  depth: number
}

function ReworkNode({ reworkWO, allWorkOrders, shifts, machines, depth }: ReworkNodeProps) {
  const [open, setOpen] = useState(false)

  // Children of this rework WO = further rework cycles spawned from it
  const children = allWorkOrders.filter(
    w => w.parentWoId === reworkWO.id && (w.woType === "rework" || w.woType === "rejection") && (w.reworkCycleNumber ?? 0) > (reworkWO.reworkCycleNumber ?? 0)
  )

  const hasQIResult = ["completed", "finished_goods", "awaiting_qi", "rejected"].includes(reworkWO.status)
  const indentPx = depth * 16

  return (
    <div style={{ marginLeft: indentPx }} className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-[-12px] top-0 bottom-0 w-px bg-amber-200" style={{ display: depth > 0 ? "block" : "none" }}/>

      {/* Rework WO row */}
      <div className="border border-amber-200 bg-amber-50/40 rounded-xl overflow-hidden mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-amber-50/80 transition-colors"
        >
          <RefreshCw size={12} className="text-amber-600 shrink-0"/>
          <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
            Rework SWO · Cycle #{reworkWO.reworkCycleNumber ?? 1}
          </span>
          <span className="font-mono text-[10px] text-amber-600 ml-1">{reworkWO.id}</span>
          <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${statusStyle(reworkWO.status)}`}>
            {statusLabel(reworkWO.status)}
          </span>
          <span className="text-slate-400 text-[10px] shrink-0">{reworkWO.reworkPartCount ?? reworkWO.targetPartNos} parts</span>
          {(children.length > 0 || hasQIResult) && (
            open ? <ChevronDown size={13} className="text-amber-500 shrink-0"/> : <ChevronRight size={13} className="text-amber-500 shrink-0"/>
          )}
        </button>

        {/* Rework WO detail strip */}
        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-amber-100">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[10px]">
              {[
                ["Machine",  reworkWO.machine || "—"],
                ["Shift",    getShiftLabel(shifts, reworkWO.shift)],
                ["Operator", reworkWO.operator || "—"],
                ["Grade",    reworkWO.materialGrade || "—"],
                ["Target",   `${reworkWO.targetPartNos} nos`],
                ["Good",     `${reworkWO.goodParts ?? 0}`],
                ["Rework",   `${reworkWO.reworkParts ?? 0}`],
                ["Rejected", `${reworkWO.rejectedParts ?? 0}`],
              ].map(([k, v]) => (
                <div key={k} className="bg-white rounded-lg px-2 py-1.5 border border-amber-100">
                  <p className="text-amber-600 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                  <p className="font-semibold text-slate-800">{v}</p>
                </div>
              ))}
            </div>

            {/* QI result for this rework WO */}
            {hasQIResult && (
              <QIResultRow wo={reworkWO}/>
            )}

            {/* Further rework children */}
            {children.map(child => (
              <ReworkNode
                key={child.id}
                reworkWO={child}
                allWorkOrders={allWorkOrders}
                shifts={shifts}
                machines={machines}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QIResultRow({ wo }: { wo: WorkOrder }) {
  const isPass    = wo.status === "completed" || wo.status === "finished_goods"
  const isRejected = wo.status === "rejected"
  const isPending  = wo.status === "awaiting_qi"

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 flex-wrap text-xs
      ${isPass ? "bg-emerald-50 border-emerald-200" : isRejected ? "bg-red-50 border-red-200" : "bg-violet-50 border-violet-200"}`}>
      {isPass
        ? <ShieldCheck size={13} className="text-emerald-600 shrink-0"/>
        : isRejected
        ? <AlertCircle size={13} className="text-red-500 shrink-0"/>
        : <ShieldCheck size={13} className="text-violet-500 shrink-0"/>
      }
      <span className={`font-black text-[10px] uppercase tracking-wider ${isPass ? "text-emerald-700" : isRejected ? "text-red-700" : "text-violet-700"}`}>
        {isPending ? "Awaiting QI" : isPass ? "QI Passed" : "QI Rejected — Rework Required"}
      </span>
      <span className="text-slate-500 ml-auto flex gap-3">
        <span>Good: <strong className="text-emerald-700">{wo.goodParts ?? 0}</strong></span>
        <span>Rework: <strong className="text-amber-600">{wo.reworkParts ?? 0}</strong></span>
        <span>Rejected: <strong className="text-red-600">{wo.rejectedParts ?? 0}</strong></span>
      </span>
      {wo.phase2CompletedBy && (
        <span className="text-[10px] text-slate-400">Ops by: <em>{wo.phase2CompletedBy}</em></span>
      )}
    </div>
  )
}

type SWONodeProps = {
  swo: WorkOrder
  allWorkOrders: WorkOrder[]
  shifts: ReturnType<typeof useApp>["shifts"]
  machines: ReturnType<typeof useApp>["machines"]
  swoIndex: number
  clientId: string
}

function SWONode({ swo, allWorkOrders, shifts, machines, swoIndex, clientId }: SWONodeProps) {
  const [open, setOpen] = useState(false)

  // Direct rework WOs whose parent is this SWO (cycle #1 reworks)
  const directReworks = allWorkOrders.filter(
    w => w.parentWoId === swo.id &&
    (w.woType === "rework" || w.woType === "rejection") &&
    (w.reworkCycleNumber ?? 0) >= 1
  )

  const hasQIResult  = ["completed", "finished_goods", "awaiting_qi", "rejected"].includes(swo.status)
  const isDraft      = swo.status === "draft"
  const hasChildren  = hasQIResult || directReworks.length > 0

  return (
    <div className="border border-teal-200 bg-teal-50/20 rounded-xl overflow-hidden">
      {/* SWO header row — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-teal-50/50 transition-colors"
      >
        {/* Shift indicator badge */}
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-[9px] font-black shrink-0">
          {swoIndex}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-teal-800">
              {swo.date || swo.shiftDate
                ? `${swo.date || swo.shiftDate} · ${getShiftLabel(shifts, swo.shift) || swo.shift || "—"}`
                : "Shift details pending"}
            </span>
            {swo.machine && (
              <span className="text-[10px] text-slate-500">
                {swo.machine}
              </span>
            )}
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${statusStyle(swo.status)}`}>
              {statusLabel(swo.status)}
            </span>
            {directReworks.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                <RefreshCw size={8}/> {directReworks.length} rework{directReworks.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isDraft
              ? "⏳ Awaiting process PDC to fill details"
              : `Target: ${swo.targetPartNos} nos · Req: ${swo.requiredQuantityKg} KG · Op: ${swo.operator || "—"} · Grade: ${swo.materialGrade || "—"}`
            }
          </p>
        </div>

        <span className="font-mono text-[10px] text-slate-300 shrink-0 hidden sm:block">{swo.id}</span>
        {hasChildren && (
          open
            ? <ChevronDown size={14} className="text-teal-500 shrink-0"/>
            : <ChevronRight size={14} className="text-teal-500 shrink-0"/>
        )}
      </button>

      {/* SWO expanded body */}
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-teal-100">

          {/* Operational detail grid */}
          {!isDraft && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[10px]">
              {[
                ["Machine",      swo.machine || "—"],
                ["Operator",     swo.operator || "—"],
                ["Shift",        getShiftLabel(shifts, swo.shift) || swo.shift || "—"],
                ["Grade",        swo.materialGrade || "—"],
                ["Target",       `${swo.targetPartNos} nos`],
                ["Req. Weight",  `${swo.requiredQuantityKg} KG`],
                ["Input KG",     `${swo.inputWeightKg ?? 0} KG`],
                ["Output KG",    `${swo.actualOutputKg ?? 0} KG`],
                ["Parts/Cycle",  String(swo.partPerCycle ?? 0)],
                ["Parts Done",   String(swo.partsCompleted ?? 0)],
                ["Good",         String(swo.goodParts ?? 0)],
                ["Rework",       String(swo.reworkParts ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="bg-white rounded-lg px-2 py-1.5 border border-teal-100">
                  <p className="text-teal-600 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                  <p className="font-semibold text-slate-800">{v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Machine-wise allocation */}
          {swo.machineProducedMap && Object.keys(swo.machineProducedMap).length > 0 && (
            <div className="bg-white border border-teal-100 rounded-xl p-2.5">
              <p className="text-[10px] font-black text-teal-700 uppercase tracking-wider mb-2">Machine allocation</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(swo.machineProducedMap).map(([machineId, qty]) => (
                  <span key={machineId} className="text-[10px] bg-teal-50 border border-teal-200 rounded-lg px-2 py-1 font-semibold text-teal-800">
                    {machineId} → {qty} parts
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* QI result strip */}
          {hasQIResult && <QIResultRow wo={swo}/>}

          <MachineAssignmentDropdown clientId={clientId} processWoId={swo.processWoId} woId={swo.id} processType={swo.process} shiftDate={swo.shiftDate || swo.date} shift={swo.shift} fallbackMachineMap={swo.machineProducedMap || {}} />

          {/* Rework children — each recursively rendered */}
          {directReworks.length > 0 && (
            <div className="space-y-2 mt-1 pl-3 border-l-2 border-amber-200">
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1.5 mt-1">
                <RefreshCw size={9}/> Rework Work Orders
              </p>
              {directReworks
                .sort((a, b) => (a.reworkCycleNumber ?? 0) - (b.reworkCycleNumber ?? 0))
                .map(rwo => (
                  <ReworkNode
                    key={rwo.id}
                    reworkWO={rwo}
                    allWorkOrders={allWorkOrders}
                    shifts={shifts}
                    machines={machines}
                    depth={0}
                  />
                ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type WOHierarchyTreeProps = {
  rootWO: WorkOrder
  allWorkOrders: WorkOrder[]
  shifts: ReturnType<typeof useApp>["shifts"]
  machines: ReturnType<typeof useApp>["machines"]
  clientId: string
}

function WOHierarchyTree({ rootWO, allWorkOrders, shifts, machines, clientId }: WOHierarchyTreeProps) {
  // All SWOs directly under this root WO:
  // - Stage SWOs: woType === "stage" (new) or "rework" (legacy), parentWoId === rootWO.id, reworkCycleNumber is 0 or undefined
  // - Each time a PDC fills details for a new shift, a new SWO is created under this root
  const stageSWOs = allWorkOrders
    .filter(w =>
      w.parentWoId === rootWO.id &&
      (w.woType === "stage" || w.woType === "rework") &&
      (w.reworkCycleNumber === undefined || w.reworkCycleNumber === 0)
    )
    .sort((a, b) => {
      // Sort by shift date, then shift id
      const dateA = a.date || a.shiftDate || a.createdAt || ""
      const dateB = b.date || b.shiftDate || b.createdAt || ""
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.shift || "").localeCompare(b.shift || "")
    })

  if (stageSWOs.length === 0) {
    return (
      <div className="text-xs text-slate-400 py-3 flex items-center gap-2">
        <GitBranch size={12} className="text-slate-300"/>
        No shift SWOs yet — process PDC will create them when filling details.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <GitBranch size={10}/> {stageSWOs.length} Shift SWO{stageSWOs.length > 1 ? "s" : ""} — click to expand
      </p>
      {stageSWOs.map((swo, idx) => (
        <SWONode
          key={swo.id}
          swo={swo}
          allWorkOrders={allWorkOrders}
          shifts={shifts}
          machines={machines}
          swoIndex={idx + 1}
          clientId={clientId}
        />
      ))}
    </div>
  )
}

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

  const [window, setWindow] = useState<1 | 2>(1)

  const shiftOptions     = getSelectableShiftOptions(shifts, wo.shift)
  const approvedMats     = materials.filter(m => m.status === "approved")
  const processMachines  = machines.filter(m => m.process === wo.process && m.status === "active")
  const validPDCs        = ptcs.filter(p => p.process === wo.process)
  const processPrograms  = (programs as ProgramOption[]).filter(
    p => !("process" in p) || (p as unknown as { process?: string }).process === wo.process
  )

  const assignedProcessRows = processWorkOrdersV2.filter(p => {
    if (p.processType !== wo.process) return false
    const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
    if (!parent) return false
    const legacyExists = workOrders.some(w => w.masterId === parent.scheduleId && w.partId === parent.partId)
    if (!legacyExists) return false
    return parent?.partId === wo.partId
  })

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

  const [shiftDate,      setShiftDate]      = useState(wo.date || new Date().toISOString().split("T")[0])
  const [selectedShift,  setSelectedShift]  = useState<Shift>(wo.shift || (shiftOptions[0]?.id as Shift) || "" as Shift)
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>(
    wo.machine ? wo.machine.split(",").map(s => s.trim()).filter(Boolean).map(name => machines.find(m => m.name === name)?.id || "").filter(Boolean) : []
  )
  const [programId,      setProgramId]      = useState(wo.programId || (processPrograms[0]?.id || ""))
  const [machinePartsMap, setMachinePartsMap] = useState<Record<string, number>>(wo.machineProducedMap || {})
  const [notes,          setNotes]          = useState("")

  const selectedMat     = approvedMats.find(m => m.id === rawMaterialId)
  const availableKg     = selectedMat ? selectedMat.receivedQuantity - (selectedMat.usedQuantity || 0) : 0
  const stockShortfall  = availableKg < wo.requiredQuantityKg

  const selectedProgram = processPrograms.find(p => p.id === programId)
  const kgPerPartConfig = selectedProgram?.rawMaterialKgPerPart || weightPerPart || 0
  const configDerivedKg = Number((claimPartsQty * kgPerPartConfig).toFixed(3))

  const maxPartsFromStock = (kgPerPartConfig > 0 && availableKg > 0)
    ? Math.floor(availableKg / kgPerPartConfig)
    : null
  const partsExceedStock = kgPerPartConfig > 0 && rawMaterialId
    ? claimPartsQty * kgPerPartConfig > availableKg
    : false

  const assignedQtyKg   = Number((requiredQtyKg * (1 + bufferPercent / 100)).toFixed(2))
  const additionalQtyKgRaw    = Number((acquiredQtyKg - assignedQtyKg).toFixed(2))
  const additionalQtyKg       = Math.max(0, additionalQtyKgRaw)
  const acquiredBelowAssigned = acquiredQtyKg < assignedQtyKg
  const acquiredExceedsStock  = !!(rawMaterialId && acquiredQtyKg > availableKg)
  const leftoverQtyKg   = Number((assignedQtyKg  - acquiredQtyKg).toFixed(2))
  const autoOutputKg    = Number((claimPartsQty  * (weightPerPart || 0)).toFixed(2))

  const occupiedMachineIds = new Set(
    woMachineAssignmentsV2
      .filter(a => a.shiftDate === shiftDate && a.shift === selectedShift)
      .map(a => a.machineId)
  )
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

  const w1Valid = rawMaterialId && !stockShortfall && !partsExceedStock
    && claimPartsQty > 0 && requiredQtyKg > 0 && ptcId
    && !acquiredBelowAssigned && !acquiredExceedsStock

  const handleSubmit = () => {
    if (!w1Valid) { setWindow(1); return }
    if (acquiredBelowAssigned) { alert("Acquired quantity cannot be less than Assigned (Required + Buffer). Please increase Acquired Qty or reduce Buffer %."); return }
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
      acceptancePoints: [
        "As per configured QI checkpoints",
        `Req:${requiredQtyKg}kg Buffer:${bufferPercent}% Assigned:${assignedQtyKg}kg Acquired:${acquiredQtyKg}kg Additional:${additionalQtyKg}kg Leftover:${leftoverQtyKg}kg`,
        `MachineParts:${JSON.stringify(machinePartsMap)}`,
        notes ? `Notes:${notes}` : "",
      ].filter(Boolean).join(" | "),
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">

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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {window === 1 && <>
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
              {rawMaterialId && kgPerPartConfig > 0 && (
                <div className={`p-2.5 rounded-lg text-xs font-medium border ${partsExceedStock ? "bg-red-50 border-red-200 text-red-700" : "bg-teal-50 border-teal-200 text-teal-700"}`}>
                  At <strong>{kgPerPartConfig} KG/part</strong> → this stock supports up to <strong>{maxPartsFromStock} parts</strong>.
                  {partsExceedStock
                    ? ` ⚠ Claimed ${claimPartsQty} parts needs ${(claimPartsQty * kgPerPartConfig).toFixed(2)} KG but only ${availableKg.toFixed(2)} KG available. Reduce claimed parts or select a larger material batch.`
                    : ` ✓ Claimed ${claimPartsQty} parts requires ${(claimPartsQty * kgPerPartConfig).toFixed(2)} KG — within stock.`}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-4">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                Quantity Planning & Material Claim
              </p>

              <Field label="Program (from Program Master)" req hint="Selecting a program auto-fills the required KG from its configured rate">
                <select required value={programId} onChange={e => {
                  const newProgId = e.target.value
                  setProgramId(newProgId)
                  const prog = (programs as ProgramOption[]).find(p => p.id === newProgId)
                  if (prog?.rawMaterialKgPerPart && claimPartsQty > 0) {
                    setRequiredQtyKg(Number((claimPartsQty * prog.rawMaterialKgPerPart).toFixed(3)))
                  }
                }} className={selectCls}>
                  <option value="">— Select program to auto-fill KG rate —</option>
                  {processPrograms.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.programId || p.id} — {p.programName || p.name || ""}
                      {p.rawMaterialKgPerPart ? ` (${p.rawMaterialKgPerPart} KG/part)` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Parts I Will Produce (Claim)" req hint="How many of the total target you are committing to">
                  <input
                    type="number" required min="1"
                    max={maxPartsFromStock ?? wo.targetPartNos}
                    value={claimPartsQty}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setClaimPartsQty(v)
                      if (kgPerPartConfig > 0) setRequiredQtyKg(Number((v * kgPerPartConfig).toFixed(3)))
                    }}
                    className={`${cls} ${partsExceedStock ? "border-red-400 focus:ring-red-400" : ""}`}
                  />
                  {partsExceedStock && rawMaterialId && (
                    <p className="text-[10px] text-red-600 font-bold mt-1">
                      ⚠ Max {maxPartsFromStock} parts from current stock. Reduce claim or select a larger material batch.
                    </p>
                  )}
                </Field>
                <Field label="Required Qty (KG)" req hint="Auto-filled from program rate (parts × KG/part)">
                  {kgPerPartConfig > 0 ? (
                    <input readOnly value={requiredQtyKg} className={readOnlyCls}/>
                  ) : (
                    <input type="number" required min="0.1" step="0.01" value={requiredQtyKg}
                      onChange={e => setRequiredQtyKg(Number(e.target.value))} className={cls}
                      placeholder="Enter manually (no program rate)"/>
                  )}
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
                <Field label="Acquired Qty (KG)" req hint="How much you physically took from inventory (must be ≥ Assigned and ≤ available stock)">
                  <input
                    type="number" required
                    min={assignedQtyKg}
                    max={rawMaterialId ? availableKg : undefined}
                    step="0.01" value={acquiredQtyKg}
                    onChange={e => setAcquiredQtyKg(Number(e.target.value))}
                    className={`${cls} ${acquiredBelowAssigned || acquiredExceedsStock ? "border-red-400 focus:ring-red-400" : ""}`}
                  />
                  {acquiredBelowAssigned && (
                    <p className="text-[10px] text-red-600 font-bold mt-1">
                      ⚠ Acquired must be ≥ Assigned ({assignedQtyKg} KG). Additional qty cannot go negative.
                    </p>
                  )}
                  {acquiredExceedsStock && (
                    <p className="text-[10px] text-red-600 font-bold mt-1">
                      ⚠ Acquired ({acquiredQtyKg} KG) exceeds available stock ({availableKg.toFixed(2)} KG). You cannot take more than what is in inventory.
                    </p>
                  )}
                </Field>
                <Field label="Additional Qty (KG)" hint="Acquired − Assigned (cannot be negative)">
                  <input readOnly value={additionalQtyKg}
                    className={`${readOnlyCls} ${additionalQtyKgRaw < 0 ? "text-red-600" : additionalQtyKg > 0 ? "text-amber-600" : ""}`}/>
                </Field>
              </div>

              <div className="grid grid-cols-5 text-center gap-1">
                {[
                  { label: "Required",  value: `${requiredQtyKg} KG`,  color: "bg-slate-100 text-slate-700" },
                  { label: "Buffer",    value: `${bufferPercent}%`,     color: "bg-blue-50 text-blue-700" },
                  { label: "Assigned",  value: `${assignedQtyKg} KG`,  color: "bg-indigo-50 text-indigo-700" },
                  { label: "Acquired",  value: `${acquiredQtyKg} KG`,  color: acquiredBelowAssigned ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-700" },
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

          {window === 2 && <>
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
              title={
                partsExceedStock ? "Claimed parts exceed available stock" :
                acquiredBelowAssigned ? "Acquired qty must be ≥ Assigned (Required + Buffer)" :
                !w1Valid ? "Complete all required fields in Window 1 first" : ""
              }
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
    currentUser, workOrders, shifts, partMasters, addWorkOrder, updateWorkOrder, deleteWorkOrder,
    deductMaterial, schedules, machines, programs, mainWorkOrdersV2, processWorkOrdersV2,
    woMachineAssignmentsV2, addMainWorkOrderV2, addProcessWorkOrderV2,
    updateProcessWorkOrderV2, addWoMachineAssignmentV2, addWoAuditLog,
  } = useApp()
  const role = currentUser?.role as UserRole
  const clientId = ((currentUser as unknown as { clientId?: string; client_id?: string })?.clientId || (currentUser as unknown as { client_id?: string })?.client_id || "")

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

  const liveWoIds = useMemo(() => new Set(workOrders.map(w => w.id)), [workOrders])

  const visible = useMemo(() => {
    const filtered = workOrders.filter(w => {
      const matchStatus  = statusFilter  === "all" || w.status  === statusFilter
      const matchProcess = processFilter === "all" || w.process === processFilter
      const matchRole = !myProcess || (
        w.process === myProcess && (w.status === "draft" || w.status === "rejected")
      )
      if (w.parentWoId && !liveWoIds.has(w.parentWoId)) return false
      return matchStatus && matchProcess && matchRole
    })
    return [...filtered].sort((a, b) => {
      const aRoot = (a.woType === "rework" || a.woType === "stage") ? (a.parentWoId ?? a.id) : a.id
      const bRoot = (b.woType === "rework" || b.woType === "stage") ? (b.parentWoId ?? b.id) : b.id
      if (aRoot !== bRoot) return aRoot.localeCompare(bRoot)
      const aIsSWO = (a.woType === "rework" || a.woType === "stage") ? 1 : 0
      const bIsSWO = (b.woType === "rework" || b.woType === "stage") ? 1 : 0
      if (aIsSWO !== bIsSWO) return aIsSWO - bIsSWO
      return (a.reworkCycleNumber ?? 0) - (b.reworkCycleNumber ?? 0)
    })
  }, [workOrders, statusFilter, processFilter, myProcess])

  // For PDC Manager: only show root WOs (no parentWoId), all children rendered inside WOHierarchyTree
  // For process PDC roles: flat list of their drafts as before
  const visibleRoots = useMemo(() => {
    if (isProcessPDC) {
      return visible.filter(w => w.process === myProcess && (w.woType === "stage" || w.woType === "rework" || w.woType === "rejection"))
    }
    return visible.filter(w => !w.parentWoId)
  }, [visible, isProcessPDC, myProcess])

  const subWOsByParentLegacyId = useMemo(() => {
    const map: Record<string, typeof processWorkOrdersV2> = {}
    processWorkOrdersV2.forEach(p => {
      const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
      if (parent) {
        const legacyWO = workOrders.find(
          w => w.masterId === parent.scheduleId && w.partId === parent.partId
        )
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
        source: { ...primaryWO, id: parentId, createdAt: new Date().toISOString().split("T")[0], processWoId: "" },
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
    await updateWorkOrder(phase2WO.id, {
      ...data,
      status: "not_started",
      phase2CompletedBy: currentUser!.name,
      phase2CompletedAt: new Date().toISOString().split("T")[0],
    })

    const machineMap = data.machineProducedMap || {}
    const machineIds = Object.keys(machineMap)
    const linkedProcessWoId = (phase2WO as unknown as { processWoId?: string }).processWoId || ""
    const resolvedProcessWO = linkedProcessWoId
      ? processWorkOrdersV2.find(p => p.id === linkedProcessWoId)
      : processWorkOrdersV2.find(p =>
          p.processType === phase2WO.process &&
          p.shiftDate === (data.shiftDate || data.date || phase2WO.date) &&
          p.shift === (data.shift || phase2WO.shift)
        )

    if (resolvedProcessWO) {
      await updateProcessWorkOrderV2(resolvedProcessWO.id, {
        shiftDate: String(data.shiftDate || data.date || phase2WO.date || ""),
        shift: (data.shift || phase2WO.shift || "") as Shift,
        targetParts: Number(data.actualTarget || phase2WO.targetPartNos || 0),
        requiredQtyKg: Number(data.requiredQtyKg || data.requiredQuantityKg || phase2WO.requiredQuantityKg || 0),
        assignedQtyKg: Number(data.assignedQtyKg || 0),
        takenQtyKg: Number(data.takenQtyKg || 0),
        leftoverQtyKg: Number(data.leftoverQtyKg || 0),
        shortcomingCategory: (data.shortcomingCategory as ShortcomingCategory) || "machine_breakdown",
        shortcomingNotes: String(data.notes || ""),
        updatedAt: new Date().toISOString().split("T")[0],
      })

      for (const machineId of machineIds) {
        const already = woMachineAssignmentsV2.find(a => a.processWoId === resolvedProcessWO.id && a.machineId === machineId)
        if (already) continue
        const machine = machines.find(m => m.id === machineId)
        await addWoMachineAssignmentV2({
          id: createClientId("ma"), processWoId: resolvedProcessWO.id, machineId,
          machineName: machine?.name || machineId, operatorName: machine?.operatorName || "Unassigned",
          shiftDate: String(data.shiftDate || data.date || phase2WO.date || ""),
          shift: (data.shift || phase2WO.shift || "") as Shift,
          programId: String(data.programId || ""),
          programName: String(data.programName || ""),
          partsCommitted: Number(machineMap[machineId] || 0), producedQty: 0,
          rejectedQty: 0, reworkQty: 0, createdAt: new Date().toISOString().split("T")[0],
        })
      }
    }

    setPhase2WO(null)
  }

  const canDeleteWO   = (wo: WorkOrder) => (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")
  const canEditPhase1 = (wo: WorkOrder) => (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")
  const canFillPhase2 = (wo: WorkOrder) => {
    const isProcessStageWO = wo.woType === "stage" || wo.woType === "rework" || wo.woType === "rejection"
    return wo.status === "draft" && isProcessStageWO && (isAdmin || (isProcessPDC && wo.process === myProcess))
  }

  const handleDeleteWODeep = async (wo: WorkOrder) => {
    if (!confirm("Delete this Work Order and all linked SWOs/assignments from DB?")) return

    if (!clientId) {
    alert("Unable to delete: client context not available. Please re-login.")
    return
  }

    const subtreeIds = new Set<string>()
    const stack = [wo.id]
    while (stack.length) {
      const id = stack.pop()!
      if (subtreeIds.has(id)) continue
      subtreeIds.add(id)
      workOrders.filter(w => w.parentWoId === id).forEach(ch => stack.push(ch.id))
    }

    // delete legacy work_orders subtree
    for (const id of Array.from(subtreeIds)) await deleteWorkOrder(id)

    if (!clientId) return

    // delete linked process WOs + machine assignments + audit logs
    const pSnap = await getDocs(collection(db, "clients", clientId, "process_work_orders_v2"))
    const linkedProcessIds = pSnap.docs
      .filter(d => {
        const v = d.data() as { rootWoId?: string; parentWoId?: string }
        return subtreeIds.has(d.id) || (v.rootWoId && subtreeIds.has(v.rootWoId)) || (v.parentWoId && subtreeIds.has(v.parentWoId))
      })
      .map(d => d.id)

    for (const pid of linkedProcessIds) {
      const aSnap = await getDocs(query(collection(db, "clients", clientId, "wo_machine_assignments_v2"), where("processWoId", "==", pid)))
      for (const a of aSnap.docs) await deleteDoc(doc(db, "clients", clientId, "wo_machine_assignments_v2", a.id))

      const lSnap = await getDocs(query(collection(db, "clients", clientId, "wo_audit_logs"), where("processWoId", "==", pid)))
      for (const l of lSnap.docs) await deleteDoc(doc(db, "clients", clientId, "wo_audit_logs", l.id))

      await deleteDoc(doc(db, "clients", clientId, "process_work_orders_v2", pid))
    }

    const mSnap = await getDocs(collection(db, "clients", clientId, "main_work_orders_v2"))
    for (const m of mSnap.docs) {
      const mv = m.data() as { partId?: string; scheduleId?: string }
      if (mv.partId === wo.partId && mv.scheduleId === wo.masterId) {
        await deleteDoc(doc(db, "clients", clientId, "main_work_orders_v2", m.id))
      }
    }
  }

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
      process: "die_casting", createdBy: "System Workflow", parentWoId: primaryLegacyWoId, processWoId: processId,
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

      {/* ── V2 Planner modal ── */}
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
            <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Sub Work Orders Snapshot — Committed / Taken / Leftover / Raw Material</p>
              {processWorkOrdersV2.filter(p => {
                const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
                if (!parent) return false
                if (v2ScheduleId && parent.scheduleId !== v2ScheduleId) return false
                return workOrders.some(w => w.masterId === parent.scheduleId && w.partId === parent.partId)
              }).length === 0 ? (
                <p className="text-xs text-slate-400">No sub work orders yet for this schedule.</p>
              ) : (
                <select className={selectCls}>
                  <option value="" disabled>Select sub-WO to inspect</option>
                  {processWorkOrdersV2
                    .filter(p => {
                      const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
                      if (!parent) return false
                      if (v2ScheduleId && parent.scheduleId !== v2ScheduleId) return false
                      return workOrders.some(w => w.masterId === parent.scheduleId && w.partId === parent.partId)
                    })
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
                    {processWorkOrdersV2
                      .filter(p => {
                        if (p.processType !== myProcess) return false
                        const parent = mainWorkOrdersV2.find(m => m.id === p.parentWoId)
                        if (!parent) return false
                        return workOrders.some(w => w.masterId === parent.scheduleId && w.partId === parent.partId)
                      })
                      .map(p=>(
                        <option key={p.id} value={p.id}>{p.processWoNumber} | Committed: {p.targetParts} | Taken: {p.takenQtyKg} KG | Leftover: {p.leftoverQtyKg} KG</option>
                      ))}
                  </select>
                </Field>
                <Field label="Required Qty (KG)"><input className={cls} value={v2RequiredQtyKg || ""} readOnly/></Field>
                <Field label="Buffer %"><input className={cls} value={v2BufferPercent} onChange={e=>setV2BufferPercent(e.target.value)} /></Field>
                <Field label="Acquired Qty (KG)"><input className={cls} value={v2TakenQtyKg} onChange={e=>setV2TakenQtyKg(e.target.value)} /></Field>
              </div>
              <div className="text-xs text-slate-700 p-2 rounded-lg bg-slate-50 border border-slate-200">
                Assigned (Required+Buffer): <strong>{v2AssignedQtyKg} KG</strong> ·
                Additional (Acquired−Assigned): <strong>{Math.max(0, v2AdditionalQty)} KG</strong> · Leftover: <strong>{v2LeftoverQty} KG</strong>
                {v2TakenQty > 0 && v2TakenQty < v2AssignedQtyKg && (
                  <span className="ml-2 text-red-600 font-bold">⚠ Acquired is below Assigned — please take at least {v2AssignedQtyKg} KG</span>
                )}
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
          <p><strong>Your role:</strong> Create Work Order shells with part, dates, and quantities. Expand any WO below to see its full shift-by-shift SWO tree, QI results, and rework cycles.</p>
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
            {isPDCManager || isAdmin
              ? `${visibleRoots.length} parent WO(s) — expand each to see SWOs, QI & reworks`
              : `${visibleRoots.length} WO(s) visible for your process`}
          </div>
        </div>
      </div>

      {/* ── Work Order Cards ── */}
      <div className="space-y-4">
        {visibleRoots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <ClipboardList size={40} className="mx-auto text-slate-200 mb-3"/>
            <p className="text-slate-400 font-medium">No work orders found</p>
          </div>
        ) : visibleRoots.map(wo => {
          // Derive correct target/required from parent WO + part master for SWOs
          // that were built with targetPartNos=0 (goodParts fallback bug).
          const parentWO = wo.parentWoId ? workOrders.find(w => w.id === wo.parentWoId) : null
          const effectiveTarget = wo.targetPartNos > 0
            ? wo.targetPartNos
            : (parentWO?.targetPartNos ?? 0)

          // Look up part master: prefer grade match, fall back to partId only
          const partMaster = partMasters.find(
            pm => pm.partId === wo.partId &&
              pm.grade === (wo.rawMaterialGrade || wo.materialGrade || "A")
          ) ?? partMasters.find(pm => pm.partId === wo.partId)

          // requiredKg = stored value if present, else partMaster.quantityPerPart * target
          const effectiveRequiredKg = wo.requiredQuantityKg > 0
            ? wo.requiredQuantityKg
            : (parentWO?.requiredQuantityKg ??
               (partMaster ? +(partMaster.quantityPerPart * effectiveTarget).toFixed(2) : 0))

          const progress = effectiveTarget > 0 ? Math.round((wo.partsCompleted / effectiveTarget) * 100) : 0
          const isDraft  = wo.status === "draft"

          // For PDC Manager: root WOs are always "standard" type
          // For process PDC: may be stage SWOs they need to fill
          const isStageWO = wo.woType === "rework" && !!wo.parentWoId

          // Count direct shift-SWO children (for badge in manager view)
          const stageSWOCount = (isPDCManager || isAdmin)
            ? workOrders.filter(w =>
                w.parentWoId === wo.id &&
                w.woType === "rework" &&
                (w.reworkCycleNumber === undefined || w.reworkCycleNumber === 0)
              ).length
            : 0

          // Count total rework cycles across all SWOs of this WO
          const totalReworks = (isPDCManager || isAdmin)
            ? workOrders.filter(w =>
                w.woType === "rework" &&
                (w.reworkCycleNumber ?? 0) >= 1 &&
                (() => {
                  // Walk up: is this rework's root ancestor = wo.id?
                  let cur: WorkOrder | undefined = w
                  while (cur?.parentWoId) {
                    if (cur.parentWoId === wo.id) return true
                    cur = workOrders.find(x => x.id === cur!.parentWoId)
                  }
                  return false
                })()
              ).length
            : 0

          const linkedSubWOs = subWOsByParentLegacyId[wo.id] || []

          return (
            <div key={wo.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden
              ${isStageWO ? "border-l-4 border-l-teal-400 border-t border-r border-b border-slate-200 ml-4" : isDraft ? "border-amber-200" : "border-slate-200"}`}>

              {/* ── Card header ── */}
              <div className={`p-5 flex items-start justify-between flex-wrap gap-3 ${isDraft ? "bg-amber-50/30" : ""}`}>
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
                    {/* SWO count badge — PDC Manager view */}
                    {(isPDCManager || isAdmin) && stageSWOCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                        <GitBranch size={9}/> {stageSWOCount} SWO{stageSWOCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {/* Rework count badge */}
                    {(isPDCManager || isAdmin) && totalReworks > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                        <RefreshCw size={9}/> {totalReworks} rework{totalReworks > 1 ? "s" : ""}
                      </span>
                    )}
                    {wo.status !== "draft" && wo.status !== "not_started" && <Lock size={11} className="text-slate-300"/>}
                  </div>

                  <h3 className="font-black text-slate-900 text-base">{wo.partName}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{wo.partId}</p>

                  {!isDraft ? (
                    <p className="text-xs text-slate-500 mt-1.5">
                      <span className="font-bold text-slate-700">{wo.machine}</span>
                      {wo.machine && " · "}
                      <span>{getShiftLabel(shifts, wo.shift)}</span>
                      {wo.operator && <> · Operator: <span className="font-bold text-slate-700">{wo.operator}</span></>}
                      {wo.materialGrade && <> · Grade <span className="font-bold text-slate-700">{wo.materialGrade}</span></>}
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

                  {/* V2 sub-WO snapshot dropdown — PDC Manager */}
                  {(isPDCManager || isAdmin) && linkedSubWOs.length > 0 && (
                    <div className="mt-2">
                      <select
                        defaultValue=""
                        className="text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 text-indigo-800 font-semibold max-w-full"
                        onChange={() => {}}
                      >
                        <option value="" disabled>
                          📋 {linkedSubWOs.length} V2 Sub-WO{linkedSubWOs.length > 1 ? "s" : ""} — select to view
                        </option>
                        {linkedSubWOs.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.processWoNumber} | Process: {PROCESS_STAGE_LABELS[p.processType as ProcessStage] || p.processType} | Committed: {p.targetParts ?? 0} nos | Required: {p.requiredQtyKg ?? 0} KG | Taken: {p.takenQtyKg ?? 0} KG | Leftover: {p.leftoverQtyKg ?? 0} KG
                          </option>
                        ))}
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
                    <button onClick={() => handleDeleteWODeep(wo)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={15}/>
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === wo.id ? null : wo.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                    title={expanded === wo.id ? "Collapse" : "Expand SWO tree"}>
                    {expanded === wo.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                  </button>
                </div>
              </div>

              {/* Progress bar — shown when not draft */}
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

              {/* ── Expanded section ── */}
              {expanded === wo.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-5 space-y-5">

                  {/* PDC Manager: full hierarchy tree */}
                  {(isPDCManager || isAdmin) && (
                    <WOHierarchyTree
                      rootWO={wo}
                      allWorkOrders={workOrders}
                      shifts={shifts}
                      machines={machines}
                      clientId={clientId}
                    />
                  )}

                  {/* Process PDC / other roles: flat detail grid as before */}
                  {!isPDCManager && !isAdmin && (
                    <>
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
                    </>
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