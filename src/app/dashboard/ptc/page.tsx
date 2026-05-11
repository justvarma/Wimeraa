"use client"
import { useState } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, ROLE_LABELS, PROCESS_STAGE_LABELS, type ProcessStage, type Shift } from "@/lib/store"
import { getActiveShiftOptions, getShiftLabel } from "@/lib/shiftUtils"
import { Fingerprint, Plus, Trash2, X, AlertTriangle, CheckCircle2 } from "lucide-react"

const PROCESSES: ProcessStage[] = ["die_casting", "coating", "cnc_vmc"]
const PROCESS_COLORS: Record<ProcessStage,string> = {
  die_casting: "bg-orange-100 text-orange-800",
  coating:     "bg-purple-100 text-purple-800",
  cnc_vmc:     "bg-cyan-100 text-cyan-800",
}
function roleLabel(r: UserRole): string {
  return ROLE_LABELS[r] ?? r
}

const PROCESS_PTC_ROLE_OWNER: Record<ProcessStage, UserRole> = {
  die_casting: UserRole.PTC_DIE_CASTING,
  coating:     UserRole.PTC_COATING,
  cnc_vmc:     UserRole.PTC_CNC_VMC,
}

export default function PTCPage() {
  const { currentUser, ptcs, addPTC, deletePTC, shifts } = useApp()
  const shiftOptions = getActiveShiftOptions(shifts)
  const role = currentUser?.role as UserRole
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ process: ProcessStage; shift: Shift; date: string }>({
    process: "die_casting", shift: shiftOptions[0]?.id ?? "", date: new Date().toISOString().split("T")[0],
  })
  const [error, setError] = useState("")

  // Only PTC_MANAGER and Admin can create PTCs
  const canManage = role === UserRole.PTC_MANAGER || role === UserRole.ADMIN

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault(); setError("")
    const clash = ptcs.find(p => p.process===form.process && p.shift===form.shift && p.date===form.date)
    if (!form.shift) { setError("Select a shift before creating the PTC."); return }
    if (clash) { setError(`A PTC already exists for ${PROCESS_STAGE_LABELS[form.process]} / ${getShiftLabel(shifts, form.shift)} on ${form.date}.`); return }
    addPTC({ ...form, createdBy: currentUser!.name, createdById: currentUser!.id })
    setShowForm(false)
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">PTC Management</h1>
          <p className="text-slate-600 mt-1">Process Tracking Codes — one per process per shift per day</p>
        </div>
        {canManage && (
          <button onClick={() => { setShowForm(true); setError("") }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md">
            <Plus size={18}/> Create PTC
          </button>
        )}
      </header>

      {/* Role info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-blue-500"/>
          <div>
            <p className="font-bold mb-1">Rule: PTCs must exist before Work Orders are created</p>
            <p className="text-xs text-blue-700">The <strong>PTC Manager</strong> creates PTCs here. A Work Order requires a matching PTC for its process and shift. One PTC per process per shift per day is allowed.</p>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <p className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2">Process PTC Owners</p>
          <div className="space-y-1.5">
            {(["die_casting","coating","cnc_vmc"] as ProcessStage[]).map(p => (
              <div key={p} className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded-full font-bold border text-xs ${PROCESS_COLORS[p]}`}>🔸 {PROCESS_STAGE_LABELS[p]}</span>
                <span className="text-slate-500 font-medium">→ {roleLabel(PROCESS_PTC_ROLE_OWNER[p])}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PTC Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">PTC ID</th>
                <th className="px-6 py-4">Process</th>
                <th className="px-6 py-4">Shift</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Created By</th>
                <th className="px-6 py-4">Process PTC Owner</th>
                {canManage && <th className="px-6 py-4">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ptcs.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center">
                  <Fingerprint size={40} className="mx-auto text-slate-200 mb-3"/>
                  <p className="text-slate-500 font-medium">No PTCs yet — create one to enable Work Order creation</p>
                </td></tr>
              ) : ptcs.map(ptc => (
                <tr key={ptc.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-sm font-bold text-indigo-600">{ptc.id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${PROCESS_COLORS[ptc.process]}`}>
                      {ptc.process==="die_casting"?"🔥":ptc.process==="coating"?"🎨":"⚙️"} {PROCESS_STAGE_LABELS[ptc.process]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      {getShiftLabel(shifts, ptc.shift)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-800">{ptc.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{ptc.createdBy}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-500">
                      {roleLabel(PROCESS_PTC_ROLE_OWNER[ptc.process])}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-6 py-4">
                      <button onClick={() => { if(confirm("Delete this PTC?")) deletePTC(ptc.id) }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={15}/>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-black text-slate-900">Create PTC</h2>
              <button onClick={() => setShowForm(false)}><X size={22} className="text-slate-400 hover:text-slate-700"/></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5"/>{error}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Process *</label>
                <select required value={form.process} onChange={e => setForm(p=>({...p,process:e.target.value as ProcessStage}))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  {PROCESSES.map(p => <option key={p} value={p}>{PROCESS_STAGE_LABELS[p]}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  This PTC will be available to: <strong>{roleLabel(PROCESS_PTC_ROLE_OWNER[form.process])}</strong>
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Shift *</label>
                <select required value={form.shift} onChange={e => setForm(p=>({...p,shift:e.target.value as Shift}))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900 capitalize">
                  <option value="" disabled>Select shift</option>
                  {shiftOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date *</label>
                <input type="date" required value={form.date} onChange={e => setForm(p=>({...p,date:e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                  <CheckCircle2 size={16} className="inline mr-1.5"/>Create PTC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}