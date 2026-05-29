"use client"

import { useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, PROCESS_STAGE_LABELS, type ProcessStage } from "@/lib/store"
import { BarChart3, TrendingUp, TrendingDown, CheckCircle2, XCircle, Package, Factory, ShieldAlert } from "lucide-react"

const PROCESS_COLORS: Record<ProcessStage, { bg: string; border: string; text: string; bar: string }> = {
  die_casting: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", bar: "bg-orange-500" },
  coating:     { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", bar: "bg-purple-500" },
  cnc_vmc:     { bg: "bg-cyan-50",   border: "border-cyan-200",   text: "text-cyan-700",   bar: "bg-cyan-500"   },
}

const ALLOWED_ROLES = [
  UserRole.ADMIN,
  UserRole.PTC_MANAGER,
  UserRole.PTC_DIE_CASTING,
  UserRole.PTC_COATING,
  UserRole.PTC_CNC_VMC,
]

// PDC roles are scoped to their own process
const PDC_PROCESS_MAP: Partial<Record<UserRole, ProcessStage>> = {
  [UserRole.PTC_DIE_CASTING]: "die_casting",
  [UserRole.PTC_COATING]:     "coating",
  [UserRole.PTC_CNC_VMC]:     "cnc_vmc",
}

function StatCard({ label, value, sub, icon: Icon, color, breakdown }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; breakdown?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4" title={breakdown}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { currentUser, workOrders, processRecords, materials, qiInspections, fqiInspections } = useApp()
  const role = currentUser?.role as UserRole

  // Scoped process for PDC sub-roles; null = all processes (Admin + PDC Manager)
  const scopedProcess = PDC_PROCESS_MAP[role] ?? null
  const processes: ProcessStage[] = scopedProcess ? [scopedProcess] : ["die_casting", "coating", "cnc_vmc"]

  // Filtered data
  const filteredWOs = useMemo(() =>
    workOrders.filter(wo => !scopedProcess || wo.process === scopedProcess),
    [workOrders, scopedProcess])

  const filteredRecords = useMemo(() =>
    processRecords.filter(r => !scopedProcess || r.process === scopedProcess),
    [processRecords, scopedProcess])

  const filteredQI = useMemo(() =>
    qiInspections.filter(q => !scopedProcess || q.process === scopedProcess),
    [qiInspections, scopedProcess])

  const filteredFQI = useMemo(() =>
    fqiInspections.filter(f => !scopedProcess || f.process === scopedProcess),
    [fqiInspections, scopedProcess])

  const machineWiseAfterQI = useMemo(() => {
    const rows = filteredRecords
      .filter(r => Boolean(r.machineName))
      .map(r => ({
        machine: r.machineName || "Unknown",
        process: r.process,
        produced: r.outputQuantity || 0,
        good: r.goodParts || 0,
        rejected: r.rejectedParts || 0,
      }))

    const map = new Map<string, { machine: string; process: string; produced: number; good: number; rejected: number; efficiency: number }>()
    rows.forEach(r => {
      const key = `${r.process}__${r.machine}`
      const prev = map.get(key) ?? { machine: r.machine, process: r.process, produced: 0, good: 0, rejected: 0, efficiency: 0 }
      prev.produced += r.produced
      prev.good += r.good
      prev.rejected += r.rejected
      prev.efficiency = prev.produced > 0 ? (prev.good / prev.produced) * 100 : 0
      map.set(key, prev)
    })
    return Array.from(map.values()).sort((a, b) => b.produced - a.produced)
  }, [filteredRecords])

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <ShieldAlert size={48} className="text-red-400"/>
        <p className="text-lg font-bold text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">Reports are available to Admin and PDC roles only.</p>
      </div>
    )
  }

  // FQI aggregate stats
  const fqiFinishedGoods = filteredFQI.reduce((s, f) => s + f.finishedGoodsCount, 0)
  const fqiReworkLoop    = filteredFQI.reduce((s, f) => s + f.reworkLoopCount, 0)
  const fqiRejected      = filteredFQI.reduce((s, f) => s + f.rejectedReturnCount, 0)
  const fqiTotal         = filteredFQI.reduce((s, f) => s + f.producedPartCount, 0)
  const fqiYield         = fqiTotal > 0 ? ((fqiFinishedGoods / fqiTotal) * 100).toFixed(1) : "0.0"

  // Aggregate stats
  const totalGood     = filteredRecords.reduce((s, r) => s + r.goodParts, 0)
  const totalRejected = filteredRecords.reduce((s, r) => s + r.rejectedParts, 0)
  const totalRework   = filteredRecords.reduce((s, r) => s + r.reworkParts, 0)
  const totalOutput   = filteredRecords.reduce((s, r) => s + r.outputQuantity, 0)
  const rejRate       = totalOutput > 0 ? ((totalRejected / totalOutput) * 100).toFixed(1) : "0.0"
  const yieldRate     = totalOutput > 0 ? (((totalGood) / totalOutput) * 100).toFixed(1) : "0.0"

  const pendingMat    = materials.filter(m => m.status === "pending").length
  const approvedMat   = materials.filter(m => m.status === "approved").length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
          <BarChart3 size={22} className="text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">
            {scopedProcess
              ? `Production & quality summary — ${PROCESS_STAGE_LABELS[scopedProcess]} only`
              : "Cross-process production & quality summary"}
          </p>
        </div>
        {scopedProcess && (
          <div className={`ml-auto px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-widest ${PROCESS_COLORS[scopedProcess].bg} ${PROCESS_COLORS[scopedProcess].border} ${PROCESS_COLORS[scopedProcess].text}`}>
            Scoped: {PROCESS_STAGE_LABELS[scopedProcess]}
          </div>
        )}
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Parts Produced"  value={totalOutput}      icon={Factory}       color="bg-blue-500"
          breakdown={`Total jobs: ${filteredWOs.length}\nOutput contributions are summed from all process records.`}/>
        <StatCard label="Good Parts"            value={totalGood}        icon={CheckCircle2}  color="bg-emerald-500"
          breakdown={`Total output: ${totalOutput}\nGood parts: ${totalGood}\nFormula: (good / output) * 100`}/>
        <StatCard label="Rejected"              value={totalRejected}    icon={XCircle}       color="bg-red-500"
          breakdown={`Total output: ${totalOutput}\nRejected parts: ${totalRejected}\nRejection rate: ${rejRate}%`}/>
        <StatCard label="Yield Rate"            value={`${yieldRate}%`}  icon={TrendingUp}    color="bg-indigo-500"
          sub={`Rejection: ${rejRate}%`}
          breakdown={`Total output: ${totalOutput}\nGood: ${totalGood}\nRejected: ${totalRejected}\nIn rework: ${totalRework}\nFormula: (good / output) * 100`}/>
      </div>

      {/* Work Order summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-black text-slate-800 mb-4">Work Order Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["draft", "not_started", "in_progress", "completed"] as const).map(status => {
            const count = filteredWOs.filter(w => w.status === status).length
            const labels: Record<string, string> = {
              draft: "Draft", not_started: "Not Started", in_progress: "In Progress", completed: "Completed"
            }
            const colors: Record<string, string> = {
              draft: "bg-slate-100 text-slate-600 border-slate-200",
              not_started: "bg-amber-50 text-amber-700 border-amber-200",
              in_progress: "bg-blue-50 text-blue-700 border-blue-200",
              completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
            }
            return (
              <div key={status} className={`rounded-xl border p-4 text-center ${colors[status]}`}>
                <p className="text-3xl font-black">{count}</p>
                <p className="text-[11px] font-black uppercase tracking-widest mt-1">{labels[status]}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-process breakdown */}
      <div className="grid gap-4">
        <h2 className="text-base font-black text-slate-800">Process Breakdown</h2>
        {processes.map(proc => {
          const recs   = filteredRecords.filter(r => r.process === proc)
          const good   = recs.reduce((s, r) => s + r.goodParts, 0)
          const rej    = recs.reduce((s, r) => s + r.rejectedParts, 0)
          const rework = recs.reduce((s, r) => s + r.reworkParts, 0)
          const total  = recs.reduce((s, r) => s + r.outputQuantity, 0)
          const wos    = filteredWOs.filter(w => w.process === proc)
          const qi     = filteredQI.filter(q => q.process === proc)
          const yld    = total > 0 ? ((good / total) * 100).toFixed(1) : "—"
          const c      = PROCESS_COLORS[proc]

          return (
            <div key={proc} className={`rounded-2xl border p-6 ${c.bg} ${c.border}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-black text-base ${c.text}`}>{PROCESS_STAGE_LABELS[proc]}</h3>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${c.border} ${c.text} bg-white/60`}>
                  {wos.length} Work Orders · {qi.length} QI Records
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total Output", val: total },
                  { label: "Good Parts",   val: good },
                  { label: "Rework",       val: rework },
                  { label: "Rejected",     val: rej },
                ].map(f => (
                  <div key={f.label} className="bg-white/70 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-slate-800">{f.val}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{f.label}</p>
                  </div>
                ))}
              </div>
              {total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                    <span>Yield Rate</span><span>{yld}%</span>
                  </div>
                  <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                    <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${yld}%` }}/>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* FQI (Final Quality Inspection) Summary — Issue 9 fix */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-black text-slate-800 mb-4">Machine-wise Report (After QI)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Process", "Machine", "Produced", "Good", "Rejected", "Efficiency"].map(h => (
                <th key={h} className="text-left px-3 py-2 text-slate-800 font-black">{h}</th>
              ))}
            </tr>
            </thead>
            <tbody>
            {machineWiseAfterQI.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-600">No machine-wise process records yet.</td></tr>
            ) : machineWiseAfterQI.map(r => (
              <tr key={`${r.process}-${r.machine}`} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-900">{PROCESS_STAGE_LABELS[r.process as ProcessStage]}</td>
                <td className="px-3 py-2 text-slate-900 font-medium">{r.machine}</td>
                <td className="px-3 py-2 text-slate-800">{r.produced}</td>
                <td className="px-3 py-2 text-emerald-700 font-semibold">{r.good}</td>
                <td className="px-3 py-2 text-red-700 font-semibold">{r.rejected}</td>
                <td className="px-3 py-2 text-indigo-700 font-black">{r.efficiency.toFixed(1)}%</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredFQI.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-rose-500"/> Final Quality Inspection (FQI) Outcomes
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Finished Goods",  val: fqiFinishedGoods, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
              { label: "Rework Loop",     val: fqiReworkLoop,    color: "text-amber-600 bg-amber-50 border-amber-200" },
              { label: "Rejected",        val: fqiRejected,      color: "text-red-600 bg-red-50 border-red-200" },
              { label: "FQI Yield",       val: `${fqiYield}%`,  color: "text-blue-600 bg-blue-50 border-blue-200" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
                <p className="text-3xl font-black">{s.val}</p>
                <p className="text-[11px] font-black uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Material summary (Admin + PDC Manager only) */}
      {(role === UserRole.ADMIN || role === UserRole.PTC_MANAGER) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
            <Package size={16} className="text-slate-500"/> Raw Material Status
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Pending Approval", val: pendingMat, color: "text-amber-600 bg-amber-50 border-amber-200" },
              { label: "Approved",         val: approvedMat, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
              { label: "Total Batches",    val: materials.length, color: "text-blue-600 bg-blue-50 border-blue-200" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
                <p className="text-3xl font-black">{s.val}</p>
                <p className="text-[11px] font-black uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}