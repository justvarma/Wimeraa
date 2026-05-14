"use client"
import { useState, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import {
  UserRole, PROCESS_STAGE_LABELS, PROCESS_PTC_ROLE_MAP, QI_ROLE_PROCESS_MAP, 
  type ProcessStage, type Shift, type WorkOrder,
} from "@/lib/store"
import { getSelectableShiftOptions, getShiftLabel } from "@/lib/shiftUtils"
import { buildStageSubWorkOrder, hasOpenMachineAssignment } from "@/lib/workflow"
import { ClipboardList, Plus, X, Edit2, Trash2, Lock, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, Building2, Pencil, GitBranch, ArrowUpRight } from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
const selectCls = `${cls} bg-white`
const lbl = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"

function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return <div><label className={lbl}>{label}{req && <span className="text-red-500 ml-0.5">*</span>}</label>{children}</div>
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

// ─── Phase 1 Form (PDC Manager — WO Shell) ────────────────────────────────────
function Phase1Form({ onClose, onSave, initial }: {
  onClose: () => void
  onSave: (data: Partial<WorkOrder>) => void
  initial?: WorkOrder
}) {
  const { schedules } = useApp()
  const allSchedules = schedules
  const today = new Date().toISOString().split("T")[0]
  const isEdit = !!initial
  // FIX §5.2: When editing a not_started WO, only machine/operator/cycleTime/shift/targetQty are editable
  // Part, dates, process are locked once WO leaves draft
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

  // When a schedule part is selected, auto-fill partId and partName
  const handleScheduleChange = (masterId: string) => {
    const sch = schedules.find(s => s.id === masterId)
    setForm(p => ({ ...p, masterId, partId: sch?.partId || "", partName: sch?.partName || "" }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const selectedSchedule = schedules.find(s => s.id === form.masterId)
    if (form.workOrderStartDate > form.dueDate) {
      alert("WO start date cannot be after due date")
      return
    }
    if (selectedSchedule && form.date > selectedSchedule.date) {
      alert("WO date cannot exceed component due date")
      return
    }
    if (selectedSchedule && form.dueDate > selectedSchedule.date) {
      alert("WO due date cannot exceed component due date")
      return
    }
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

        {/* FIX §5.2: Locked fields notice for not_started WOs */}
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
              <input readOnly value={PROCESS_STAGE_LABELS.die_casting} className={`${cls} bg-slate-50 text-slate-500 cursor-not-allowed`}/>
            </Field>
          </div>

          <Field label="Part (from Monthly Schedule)" req>
            <select required value={form.masterId} onChange={e => handleScheduleChange(e.target.value)} className={selectCls}
              disabled={isPartLocked}>
              <option value="">— Select part from schedule —</option>
              {allSchedules.map(s => (
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

// ─── Phase 2 Form (Process PDC — Operational Details) ─────────────────────────
function Phase2Form({ wo, onClose, onSave }: {
  wo: WorkOrder; onClose: () => void; onSave: (data: Partial<WorkOrder>) => void
}) {
  const { materials, users, ptcs, shifts, workOrders, machines } = useApp()
  const shiftOptions = getSelectableShiftOptions(shifts, wo.shift)
  const approvedMats = materials.filter(m => m.status === "approved")
  const processOperators = users.filter(u =>
    u.role === PROCESS_PTC_ROLE_MAP[wo.process] || u.role === UserRole.ADMIN
  )
  const ptcManagers = users.filter(u => u.role === UserRole.PTC_MANAGER || u.role === UserRole.ADMIN)
  const processMachines = machines.filter(m => m.process === wo.process && m.status === "active")
  const validPDCs = ptcs.filter(p => p.process === wo.process)
  const qiUsers = users.filter(u => u.role === UserRole.QUALITY_INSPECTOR || u.role === UserRole.ADMIN || QI_ROLE_PROCESS_MAP[u.role] === wo.process)

  const [form, setForm] = useState({
    materialGrade:  wo.materialGrade  || "",
    rawMaterialId:  wo.rawMaterialId  || "",
    shift:          wo.shift          || shiftOptions[0]?.id || "" as Shift,
    machine:        wo.machine        || (processMachines[0]?.name || ""),
    operator:       wo.operator       || "",
    actualTarget:   wo.actualTarget   || wo.targetPartNos,
    partPerCycle:   wo.partPerCycle   || 1,
    weightPerPart:  wo.weightPerPart  || (wo.requiredQuantityKg / wo.targetPartNos || 0),
    acceptancePoints: wo.acceptancePoints || "As per configured QI checkpoints",
    cycleTimeMinutes: wo.cycleTimeMinutes || 5,
    ptcId:          wo.ptcId          || (validPDCs[0]?.id || ""),
    isExternal:     wo.isExternal     || false,
    vendorId:       wo.vendorId       || "",
    vendorName:     wo.vendorName     || "",
    vendorProductionDate: wo.vendorProductionDate || new Date().toISOString().split("T")[0],
    vendorMachine:  wo.vendorMachine  || wo.machine || "",
    vendorShift:    wo.vendorShift    || wo.shift || shiftOptions[0]?.id || "" as Shift,
    assignedQiId:   wo.assignedQiId   || "",
  })
  const reservedMachines = new Set(
    workOrders
      .filter(w => w.id !== wo.id && w.machine && w.date === wo.date && w.shift === form.shift && !["completed", "finished_goods", "rejected"].includes(w.status))
      .flatMap(w => String(w.machine).split(",").map(m => m.trim()).filter(Boolean))
  )

  const selectedMachineNames = form.machine.split(",").map(m => m.trim()).filter(Boolean)
  const selectedQi = qiUsers.find(u => u.id === form.assignedQiId)
  const vendorReady = !form.isExternal || Boolean(form.vendorName.trim() && form.vendorProductionDate && form.vendorMachine.trim() && form.vendorShift && form.assignedQiId)

  const selectedMat = approvedMats.find(m => m.id === form.rawMaterialId)
  const availableKg = selectedMat ? selectedMat.receivedQuantity - (selectedMat.usedQuantity || 0) : 0
  const shortfall   = availableKg < wo.requiredQuantityKg

  const handleMatChange = (id: string) => {
    const mat = approvedMats.find(m => m.id === id)
    setForm(p => ({ ...p, rawMaterialId: id, materialGrade: mat?.rawMaterialGrade || "", rawMaterialGrade: mat?.rawMaterialGrade || "" }))
  }

  const autoOutputKg = ((form.actualTarget || 0) * (form.weightPerPart || 0)).toFixed(2)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (shortfall) { alert(`Insufficient stock! Available: ${availableKg.toFixed(1)} KG, Required: ${wo.requiredQuantityKg} KG`); return }
    if (selectedMachineNames.length===0) { alert("At least one machine is required."); return }
    if (selectedMachineNames.some(machine => reservedMachines.has(machine))) { alert("One or more machines are already occupied for this shift"); return }
    if (!vendorReady) { alert("Vendor production requires vendor name, date, machine, shift, and assigned QI user."); return }
    onSave({
      ...form,
      machine: selectedMachineNames.join(", "),
      vendorMachine: form.isExternal ? form.vendorMachine.trim() : "",
      vendorProductionDate: form.isExternal ? form.vendorProductionDate : "",
      vendorShift: form.isExternal ? form.vendorShift : "" as Shift,
      assignedQiId: form.isExternal ? form.assignedQiId : "",
      assignedQiName: form.isExternal ? selectedQi?.name || "" : "",
      rawMaterialGrade: selectedMat?.rawMaterialGrade || form.materialGrade,
      actualOutputKg: Number(autoOutputKg),
      inputWeightKg: wo.requiredQuantityKg,
      status: "not_started",
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${processColor(wo.process)}`}>
                {processIcon(wo.process)} {PROCESS_STAGE_LABELS[wo.process]}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900">Fill Operational Details</h2>
            <p className="text-xs text-slate-500 mt-0.5">Phase 2 — {PROCESS_STAGE_LABELS[wo.process]} PDC: Machine, operator, material, shift planning</p>
          </div>
          <button onClick={onClose}><X size={22} className="text-slate-400 hover:text-slate-700"/></button>
        </div>

        {/* WO summary */}
        <div className="mx-6 mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
          <p className="font-black text-slate-900 mb-2">{wo.partName}</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-slate-500">Part ID: </span><span className="font-mono font-bold text-indigo-700">{wo.partId}</span></div>
            <div><span className="text-slate-500">Target: </span><span className="font-bold">{wo.targetPartNos} nos</span></div>
            <div><span className="text-slate-500">Req. Weight: </span><span className="font-bold">{wo.requiredQuantityKg} KG</span></div>
            <div><span className="text-slate-500">Start: </span><span className="font-bold">{wo.workOrderStartDate}</span></div>
            <div><span className="text-slate-500">Due: </span><span className="font-bold">{wo.dueDate}</span></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Material */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Material Selection</p>
            <Field label="Raw Material (Approved Stock)" req>
              <select required value={form.rawMaterialId} onChange={e => handleMatChange(e.target.value)} className={selectCls}>
                <option value="">— Select material —</option>
                {approvedMats.map(m => (
                  <option key={m.id} value={m.id}>
                    Grade {m.rawMaterialGrade} — {m.rawMaterialId} — {(m.receivedQuantity-(m.usedQuantity||0)).toFixed(1)} KG available
                  </option>
                ))}
              </select>
            </Field>
            {form.rawMaterialId && (
              <div className={`p-3 rounded-xl text-xs font-medium border ${shortfall ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                Available stock: <strong>{availableKg.toFixed(1)} KG</strong> ·
                Required: <strong>{wo.requiredQuantityKg} KG</strong> ·
                Grade: <strong>{selectedMat?.rawMaterialGrade}</strong>
                {shortfall ? " — ⚠ INSUFFICIENT STOCK" : " — ✓ Stock OK"}
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Scheduling</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Shift" req>
                <select required value={form.shift} onChange={e => setForm(p=>({...p,shift:e.target.value as Shift}))} className={selectCls}>
                  <option value="">— Select shift —</option>
                  {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="PDC Code" req>
                <select required value={form.ptcId} onChange={e => setForm(p=>({...p,ptcId:e.target.value}))} className={selectCls}>
                  <option value="">— Select PDC —</option>
                  {validPDCs.map(p => <option key={p.id} value={p.id}>{p.id} · {getShiftLabel(shifts, p.shift)} · {p.date}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Machine & Operator */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Machine & Operator</p>
            <Field label="Machine" req>
              <div className="space-y-2">{processMachines.map(m => { const checked = selectedMachineNames.includes(m.name); const occupied = reservedMachines.has(m.name); return <label key={m.id} className={`flex items-center gap-2 text-sm ${occupied?"text-red-600":"text-slate-700"}`}><input type="checkbox" checked={checked} disabled={occupied && !checked} onChange={e=>{ setForm(p=>{ const set=new Set(p.machine.split(",").map(x=>x.trim()).filter(Boolean)); if(e.target.checked) set.add(m.name); else set.delete(m.name); return {...p, machine:Array.from(set).join(", ")} }) }} />{m.name}{occupied && !checked ? " — occupied for selected shift/date" : ""}</label>})}</div>
            </Field>
            <Field label="Operator" req>
              <select required value={form.operator} onChange={e => setForm(p=>({...p,operator:e.target.value}))} className={selectCls}>
                <option value="">— Select operator —</option>
                {processOperators.map(u => <option key={u.id} value={u.name}>{u.name} ({u.department})</option>)}
                <option value="External Operator">External Operator</option>
              </select>
            </Field>
          </div>

          {/* Production parameters */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-3">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Production Parameters</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Actual Target (Nos)" req>
                <input type="number" required min="1" value={form.actualTarget}
                  onChange={e => setForm(p=>({...p,actualTarget:Number(e.target.value)}))} className={cls}/>
              </Field>
              <Field label="Parts per Cycle" req>
                <input type="number" required min="1" value={form.partPerCycle}
                  onChange={e => setForm(p=>({...p,partPerCycle:Number(e.target.value)}))} className={cls}/>
              </Field>
              <Field label="Weight per Part (KG)" req>
                <input type="number" required min="0.01" step="0.01" value={form.weightPerPart}
                  onChange={e => setForm(p=>({...p,weightPerPart:Number(e.target.value)}))} className={cls}/>
              </Field>
              <Field label="Cycle Time (min)">
                <input type="number" min="1" value={form.cycleTimeMinutes}
                  onChange={e => setForm(p=>({...p,cycleTimeMinutes:Number(e.target.value)}))} className={cls}/>
              </Field>
            </div>
            {form.weightPerPart > 0 && form.actualTarget > 0 && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                Auto Output: <strong>{autoOutputKg} KG</strong> ({form.actualTarget} × {form.weightPerPart} KG/part)
              </div>
            )}
          </div>

          {/* Acceptance points are now system-defined and not entered manually here. */}

          {/* Vendor/External toggle */}
          <div className="p-4 border border-slate-200 rounded-xl space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.isExternal} onChange={e => setForm(p=>({...p,isExternal:e.target.checked}))} className="w-4 h-4 accent-violet-600"/>
              <span className="text-sm font-bold text-slate-800">External / Vendor Production</span>
              <span className="text-xs text-slate-500">— Work is carried out by an external vendor</span>
            </label>
            {form.isExternal && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field label="Vendor ID">
                  <input value={form.vendorId} onChange={e => setForm(p=>({...p,vendorId:e.target.value}))} placeholder="VND-001" className={cls}/>
                </Field>
                <Field label="Vendor Name" req>
                  <input required value={form.vendorName} onChange={e => setForm(p=>({...p,vendorName:e.target.value}))} placeholder="Precision Parts Ltd" className={cls}/>
                </Field>
                <Field label="Vendor Production Date" req>
                  <input required type="date" value={form.vendorProductionDate} onChange={e => setForm(p=>({...p,vendorProductionDate:e.target.value}))} className={cls}/>
                </Field>
                <Field label="Vendor Machine" req>
                  <input required value={form.vendorMachine} onChange={e => setForm(p=>({...p,vendorMachine:e.target.value}))} placeholder="Vendor machine / line" className={cls}/>
                </Field>
                <Field label="Vendor Shift" req>
                  <select required value={form.vendorShift} onChange={e => setForm(p=>({...p,vendorShift:e.target.value as Shift}))} className={selectCls}>
                    <option value="">— Select vendor shift —</option>
                    {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Assigned QI User" req>
                  <select required value={form.assignedQiId} onChange={e => setForm(p=>({...p,assignedQiId:e.target.value}))} className={selectCls}>
                    <option value="">— Select QI user —</option>
                    {qiUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit"
              disabled={selectedMachineNames.length===0 || !form.operator || !form.rawMaterialId || shortfall || !form.ptcId || selectedMachineNames.some(machine => reservedMachines.has(machine)) || !vendorReady}
              title={!form.ptcId ? "A valid PDC code must be selected" : selectedMachineNames.some(machine => reservedMachines.has(machine)) ? "One or more machines are already occupied for this shift" : !vendorReady ? "Vendor production requires vendor name, date, machine, shift, and assigned QI user" : shortfall ? "Insufficient material stock" : ""}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <CheckCircle2 size={16}/> Activate Work Order
            </button>
          </div>
          {!form.ptcId && (
            <p className="text-xs text-red-600 font-bold text-center -mt-2">⚠ A PDC code must be selected before activating</p>
          )}
          {validPDCs.length === 0 && (
            <p className="text-xs text-red-600 font-bold text-center -mt-2">⚠ No PDC codes exist for {PROCESS_STAGE_LABELS[wo.process]}. Ask Admin/PDC Manager to create one first.</p>
          )}
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WorkOrdersPage() {
  const { currentUser, workOrders, materials, shifts, addWorkOrder, updateWorkOrder, deleteWorkOrder, deductMaterial } = useApp()
  const role = currentUser?.role as UserRole

  const [showPhase1, setShowPhase1] = useState(false)
  const [editWO, setEditWO]         = useState<WorkOrder | null>(null)
  const [phase2WO, setPhase2WO]     = useState<WorkOrder | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [statusFilter, setStatusFilter]   = useState("all")
  const [processFilter, setProcessFilter] = useState("all")
  const [typeFilter, setTypeFilter]       = useState<"all" | "standard" | "stage" | "rework" | "rejection">("all")

  const isPDCManager   = role === UserRole.PTC_MANAGER
  const isAdmin        = role === UserRole.ADMIN
  const isPDCDC        = role === UserRole.PTC_DIE_CASTING
  const isPDCCoat      = role === UserRole.PTC_COATING
  const isPDCCNC       = role === UserRole.PTC_CNC_VMC
  const isProcessPDC   = isPDCDC || isPDCCoat || isPDCCNC

  // What process can this PDC user see/edit?
  const myProcess: ProcessStage | null =
    isPDCDC ? "die_casting" : isPDCCoat ? "coating" : isPDCCNC ? "cnc_vmc" : null

  const visible = useMemo(() => {
    const filtered = workOrders.filter(w => {
      const matchStatus  = statusFilter  === "all" || w.status  === statusFilter
      const matchProcess = processFilter === "all" || w.process === processFilter
      const matchType    = typeFilter === "all" ||
                           (typeFilter === "rework"   && w.woType === "rework") ||
                           (typeFilter === "stage"    && w.woType === "stage") ||
                           (typeFilter === "rejection" && w.woType === "rejection") ||
                           (typeFilter === "standard" && (!w.woType || w.woType === "standard"))
      // Process PDCs see only actionable SWOs:
      // - draft (to fill details)
      // - rejected (for rework loop handling)
      const matchRole = !myProcess || (
        w.process === myProcess &&
        w.woType !== "standard" &&
        (w.status === "draft" || w.status === "rejected")
      )
      return matchStatus && matchProcess && matchType && matchRole
    })
    // Sort: parent WOs first, then their SWOs follow immediately (by parentWoId + cycle)
    return [...filtered].sort((a, b) => {
      const aRoot = a.woType === "rework" ? (a.parentWoId ?? a.id) : a.id
      const bRoot = b.woType === "rework" ? (b.parentWoId ?? b.id) : b.id
      if (aRoot !== bRoot) return aRoot.localeCompare(bRoot)
      // Same root: parent first (no parentWoId), then SWOs by cycle
      const aIsSWO = a.woType === "rework" ? 1 : 0
      const bIsSWO = b.woType === "rework" ? 1 : 0
      if (aIsSWO !== bIsSWO) return aIsSWO - bIsSWO
      return (a.reworkCycleNumber ?? 0) - (b.reworkCycleNumber ?? 0)
    })
  }, [workOrders, statusFilter, processFilter, typeFilter, myProcess])

  // Build a lookup: parentWoId → child SWOs (for expanded view)
  const swoByParent = useMemo(() => {
    const map: Record<string, typeof workOrders> = {}
    workOrders.filter(w => (w.woType === "rework" || w.woType === "rejection") && w.parentWoId).forEach(w => {
      map[w.parentWoId!] = [...(map[w.parentWoId!] ?? []), w]
    })
    return map
  }, [workOrders])

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
        acceptancePoints: "Primary WO shell — SWOs are system-generated per process stage.", isExternal: false,
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
    // FIX §5.1: Real-time inventory deduction when WO is activated
    if (data.rawMaterialId && phase2WO.requiredQuantityKg > 0) {
      const ok = await deductMaterial(data.rawMaterialId, phase2WO.requiredQuantityKg)
      if (!ok) {
        alert(`Stock deduction failed — insufficient inventory for Grade ${data.materialGrade}. Please check stock levels.`)
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

  // FIX §5.2: SRS allows delete when status is "draft" OR "not_started" (production not yet started)
  const canDeleteWO = (wo: WorkOrder) =>
    (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")

  const canEditPhase1 = (wo: WorkOrder) =>
    (isPDCManager || isAdmin) && (wo.status === "draft" || wo.status === "not_started")

  const canFillPhase2 = (wo: WorkOrder) =>
    wo.status === "draft" &&
    wo.woType !== "standard" &&
    (isAdmin || (isProcessPDC && wo.process === myProcess))

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
          <button onClick={() => { setEditWO(null); setShowPhase1(true) }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md">
            <Plus size={18}/> New Work Order
          </button>
        )}
      </header>

      {/* Role info banner */}
      {isPDCManager && (
        <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-sm text-indigo-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-indigo-500"/>
          <p><strong>Your role:</strong> Create Work Order shells with part, dates, and quantities. Draft WOs appear in yellow — process PDCs (Die Casting, Coating, CNC/VMC) will complete the operational details to activate them.</p>
        </div>
      )}
      {isProcessPDC && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-blue-500"/>
          <p><strong>Your role ({PROCESS_STAGE_LABELS[myProcess!]}):</strong> Click <strong>"Fill Details"</strong> on any <em>Draft</em> work order for your process to enter machine, operator, shift, material, and acceptance criteria.</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all","draft","not_started","in_progress","awaiting_qi","completed","rejected","finished_goods"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${statusFilter===s?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {s === "all" ? "All" : s === "draft" ? "Draft" : s === "not_started" ? "Active" : s === "in_progress" ? "In Progress" : s === "awaiting_qi" ? "Awaiting QI" : s === "rejected" ? "Rejected" : s === "finished_goods" ? "FG" : "Completed"}
          </button>
        ))}
        {!myProcess && (
          <>
            <span className="w-px bg-slate-200 mx-1"/>
            {["all","die_casting","coating","cnc_vmc"].map(p => (
              <button key={p} onClick={() => setProcessFilter(p)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${processFilter===p?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {p === "all" ? "All Process" : `${processIcon(p as ProcessStage)} ${PROCESS_STAGE_LABELS[p as ProcessStage]}`}
              </button>
            ))}
          </>
        )}
        {/* WO Type filter */}
        <span className="w-px bg-slate-200 mx-1"/>
        {(["all", "standard", "stage", "rework", "rejection"] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${typeFilter===t?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            {t === "rework" && <GitBranch size={12}/>}
            {t === "all" ? "All Types" : t === "standard" ? "Primary WO" : t === "stage" ? "Process SWO" : t === "rejection" ? "Rejection WO" : "Rework SWO"}
          </button>
        ))}
      </div>

      {/* Work Order Cards */}
      <div className="space-y-4">
        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <ClipboardList size={40} className="mx-auto text-slate-200 mb-3"/>
            <p className="text-slate-400 font-medium">No work orders found</p>
          </div>
        ) : visible.map(wo => {
          const progress = wo.targetPartNos > 0 ? Math.round((wo.partsCompleted / wo.targetPartNos) * 100) : 0
          const isDraft  = wo.status === "draft"

          const isSWO = wo.woType === "rework"
          const parentWo = isSWO && wo.parentWoId ? workOrders.find(w => w.id === wo.parentWoId) : null
          const childSWOs = swoByParent[wo.id] ?? []

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
                    {wo.isExternal && <span className="flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full border border-violet-200"><Building2 size={9}/> Vendor: {wo.vendorName}</span>}
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
                    {!isSWO && childSWOs.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                        <GitBranch size={9}/> {childSWOs.length} Rework SWO{childSWOs.length > 1 ? "s" : ""}
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
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 size={15}/></button>
                  )}
                  {canDeleteWO(wo) && (
                    <button onClick={() => deleteWorkOrder(wo.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15}/></button>
                  )}
                  <button onClick={() => setExpanded(expanded === wo.id ? null : wo.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                    {expanded === wo.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                  </button>
                </div>
              </div>

              {/* Progress bar — only for non-draft */}
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
                      ["WO ID",          wo.id],
                      ["Part ID",        wo.partId],
                      ["Process",        PROCESS_STAGE_LABELS[wo.process]],
                      ["Status",         statusLabel(wo.status)],
                      ...(!isDraft ? [
                        ["Machine",      wo.machine],
                        ["Operator",     wo.operator],
                        ["Shift",        getShiftLabel(shifts, wo.shift)],
                        ["Material Grade", wo.materialGrade],
                        ["Parts/Cycle",  String(wo.partPerCycle)],
                        ["Weight/Part",  `${wo.weightPerPart} KG`],
                        ["Output KG",    `${wo.actualOutputKg} KG`],
                        ["Acceptance",   wo.acceptancePoints],
                      ] : []),
                      ["Created By",     wo.createdBy],
                      ["Created At",     wo.createdAt],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                        <p className="font-semibold text-slate-800 text-xs break-words">{v}</p>
                      </div>
                    ))}
                  </div>
                  {!isDraft && wo.acceptancePoints && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Acceptance Criteria</p>
                      <p className="text-xs text-amber-800">{wo.acceptancePoints}</p>
                    </div>
                  )}

                  {/* SWO Traceability — show parent info on rework SWOs */}
                  {isSWO && parentWo && (
                    <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GitBranch size={11}/> Rework Traceability
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        {[
                          ["Parent WO ID",     parentWo.id],
                          ["Parent Part",      parentWo.partName],
                          ["Rework Cycle",     `#${wo.reworkCycleNumber ?? 1}`],
                          ["Rework Parts",     `${wo.reworkPartCount ?? wo.targetPartNos} parts`],
                          ["Parent Status",    parentWo.status.replace("_", " ")],
                          ["Parent Progress",  `${parentWo.goodParts} good / ${parentWo.reworkParts} rework / ${parentWo.rejectedParts} rejected`],
                        ].map(([k,v]) => (
                          <div key={k} className="bg-white border border-amber-100 rounded-lg p-2">
                            <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                            <p className="font-bold text-slate-800 break-words">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Child SWO list — shown on parent WOs */}
                  {!isSWO && childSWOs.length > 0 && (
                    <div className="mt-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <GitBranch size={11}/> Rework Sub Work Orders ({childSWOs.length})
                      </p>
                      <div className="space-y-2">
                        {childSWOs.map(swo => (
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

      {/* Modals */}
      {(showPhase1) && (
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
