"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, ROLE_LABELS, PROCESS_STAGE_LABELS } from "@/lib/store"
import { Package, Users, AlertTriangle, CheckCircle, ClipboardList, Clock, Factory, TrendingUp, ArrowRight } from "lucide-react"
import Link from "next/link"

function StatCard({ title, value, icon: Icon, color, bg, href }: {
  title: string; value: string|number; icon: React.ElementType; color: string; bg: string; href?: string
}) {
  const inner = (
    <div className={`bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow ${href?"cursor-pointer hover:border-blue-200":""}`}>
      <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-4`}><Icon className={color} size={22}/></div>
      <p className="text-slate-600 text-sm font-medium">{title}</p>
      <h3 className="text-3xl font-black text-slate-900 mt-1">{value}</h3>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

const PROCESS_COLORS: Record<string,string> = {
  die_casting:"bg-orange-100 text-orange-700 border-orange-200",
  coating:"bg-purple-100 text-purple-700 border-purple-200",
  cnc_vmc:"bg-cyan-100 text-cyan-700 border-cyan-200",
}
const PROCESS_ICON: Record<string,string> = { die_casting:"🔥", coating:"🎨", cnc_vmc:"⚙️" }

export default function DashboardPage() {
  const { currentUser, materials, workOrders, users, schedules, processRecords } = useApp()
  const role = currentUser?.role as UserRole
  const router = useRouter()

  // INVENTORY_QI has no dashboard — redirect to their scoped page
  useEffect(() => {
    if (role === UserRole.INVENTORY_QI) router.replace("/dashboard/inventory-qi")
  }, [role, router])

  if (role === UserRole.INVENTORY_QI) return null
  const pendingMaterials  = materials.filter(m => m.status === "pending").length
  const approvedMaterials = materials.filter(m => m.status === "approved").length
  const activeWOs         = workOrders.filter(w => w.status === "in_progress").length
  const draftWOs          = workOrders.filter(w => w.status === "draft").length
  const completedWOs      = workOrders.filter(w => w.status === "completed").length
  const totalGood         = processRecords.reduce((s,r)=>s+r.goodParts,0)
  const totalRejected     = processRecords.reduce((s,r)=>s+r.rejectedParts,0)
  const totalProduced     = processRecords.reduce((s,r)=>s+r.outputQuantity,0)
  const rejRate           = totalProduced>0 ? ((totalRejected/totalProduced)*100).toFixed(1) : "0.0"

  // Stats per role
  const roleStats = () => {
    switch (role) {
      case UserRole.ADMIN:
        return [
          { title:"Pending Approvals",  value:pendingMaterials,  icon:AlertTriangle, color:"text-amber-600",   bg:"bg-amber-50",   href:"/dashboard/approvals" },
          { title:"Approved Materials", value:approvedMaterials, icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
          { title:"Active Work Orders", value:activeWOs,         icon:ClipboardList, color:"text-blue-600",    bg:"bg-blue-50",    href:"/dashboard/workorders" },
          { title:"Draft WOs (Pending)",value:draftWOs,          icon:Clock,         color:"text-slate-600",   bg:"bg-slate-50",   href:"/dashboard/workorders" },
        ]
      case UserRole.STOREKEEPER:
        return [
          { title:"My Submissions",    value:materials.filter(m=>m.submittedById===currentUser?.id).length, icon:Package,       color:"text-blue-600",    bg:"bg-blue-50" },
          { title:"Pending",           value:pendingMaterials,                                               icon:Clock,         color:"text-amber-600",   bg:"bg-amber-50" },
          { title:"Approved",          value:approvedMaterials,                                              icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
          { title:"Schedule Entries",  value:schedules.length,                                               icon:ClipboardList, color:"text-indigo-600",  bg:"bg-indigo-50", href:"/dashboard/schedule" },
        ]
      case UserRole.PTC_MANAGER:
        return [
          { title:"Total WOs Created", value:workOrders.filter(w=>w.createdBy===currentUser?.name).length, icon:ClipboardList, color:"text-indigo-600",  bg:"bg-indigo-50", href:"/dashboard/workorders" },
          { title:"Draft (Awaiting)",   value:draftWOs,                                                     icon:Clock,         color:"text-amber-600",   bg:"bg-amber-50",   href:"/dashboard/workorders" },
          { title:"Active",            value:activeWOs,                                                     icon:Factory,       color:"text-blue-600",    bg:"bg-blue-50",    href:"/dashboard/workorders" },
          { title:"Completed",         value:completedWOs,                                                  icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
        ]
      case UserRole.PTC_DIE_CASTING:
      case UserRole.PTC_COATING:
      case UserRole.PTC_CNC_VMC: {
        const myProc = role===UserRole.PTC_DIE_CASTING?"die_casting":role===UserRole.PTC_COATING?"coating":"cnc_vmc"
        const myWOs  = workOrders.filter(w=>w.process===myProc)
        return [
          { title:`${PROCESS_STAGE_LABELS[myProc]} WOs`, value:myWOs.length,                             icon:Factory,       color:"text-blue-600",    bg:"bg-blue-50",    href:"/dashboard/workorders" },
          { title:"Draft (Need Details)",                  value:myWOs.filter(w=>w.status==="draft").length, icon:AlertTriangle, color:"text-amber-600",   bg:"bg-amber-50",   href:"/dashboard/workorders" },
          { title:"In Progress",                           value:myWOs.filter(w=>w.status==="in_progress").length, icon:TrendingUp, color:"text-indigo-600", bg:"bg-indigo-50", href:"/dashboard/production" },
          { title:"Completed",                             value:myWOs.filter(w=>w.status==="completed").length, icon:CheckCircle, color:"text-emerald-600",bg:"bg-emerald-50" },
        ]
      }
      case UserRole.QI_DIE_CASTING:
      case UserRole.QI_COATING:
      case UserRole.QI_MACHINING:
      case UserRole.QUALITY_INSPECTOR:
        return [
          { title:"Pending Approvals",  value:pendingMaterials,  icon:AlertTriangle, color:"text-amber-600",   bg:"bg-amber-50",   href:"/dashboard/approvals" },
          { title:"Good Parts (Total)", value:totalGood,          icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
          { title:"Rejected (Total)",   value:totalRejected,      icon:AlertTriangle, color:"text-red-600",     bg:"bg-red-50" },
          { title:"Rejection Rate",     value:`${rejRate}%`,      icon:TrendingUp,    color:"text-orange-600",  bg:"bg-orange-50" },
        ]
      case UserRole.FQI:
        return [
          { title:"Total Produced",     value:totalProduced,      icon:Factory,       color:"text-blue-600",    bg:"bg-blue-50" },
          { title:"Good Parts",         value:totalGood,          icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
          { title:"Rejected",           value:totalRejected,      icon:AlertTriangle, color:"text-red-600",     bg:"bg-red-50" },
          { title:"Rejection Rate",     value:`${rejRate}%`,      icon:TrendingUp,    color:"text-orange-600",  bg:"bg-orange-50" },
        ]
      case UserRole.INVENTORY_QI:
        return [
          { title:"Pending Review",  value:pendingMaterials,  icon:AlertTriangle, color:"text-amber-600",   bg:"bg-amber-50",   href:"/dashboard/inventory-qi" },
          { title:"Approved",        value:approvedMaterials, icon:CheckCircle,   color:"text-emerald-600", bg:"bg-emerald-50" },
          { title:"Total Stock",     value:materials.length,  icon:Package,       color:"text-blue-600",    bg:"bg-blue-50",    href:"/dashboard/inventory-qi" },
          { title:"Rejected",        value:materials.filter(m=>m.status==="rejected").length, icon:Clock, color:"text-red-600", bg:"bg-red-50" },
        ]
      default: return []
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-black text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Welcome, <span className="font-semibold text-slate-900">{currentUser?.name}</span>
          <span className="ml-2 text-xs px-2.5 py-1 bg-slate-100 rounded-full font-bold text-slate-600">{ROLE_LABELS[role]}</span>
        </p>
      </header>

      {/* Role-specific stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {roleStats().map(s => <StatCard key={s.title} {...s}/>)}
      </div>

      {/* Two-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Work Orders */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-900">Recent Work Orders</h2>
            <Link href="/dashboard/workorders" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">View all <ArrowRight size={12}/></Link>
          </div>
          <div className="space-y-2">
            {workOrders.slice().reverse().slice(0,5).map(wo => (
              <div key={wo.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-sm truncate">{wo.partName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-400">{wo.id}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PROCESS_COLORS[wo.process]||""}`}>
                      {PROCESS_ICON[wo.process]} {PROCESS_STAGE_LABELS[wo.process]}
                    </span>
                  </div>
                </div>
                <span className={`ml-3 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  wo.status==="completed"?"bg-emerald-100 text-emerald-700":
                  wo.status==="in_progress"?"bg-blue-100 text-blue-700":
                  wo.status==="draft"?"bg-slate-100 text-slate-600":
                  "bg-amber-100 text-amber-700"}`}>
                  {wo.status==="not_started"?"Ready":wo.status.replace("_"," ")}
                </span>
              </div>
            ))}
            {workOrders.length===0 && <p className="text-sm text-slate-400 text-center py-6">No work orders yet</p>}
          </div>
        </div>

        {/* Process overview */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-900">Process Overview</h2>
            <Link href="/dashboard/production" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">View all <ArrowRight size={12}/></Link>
          </div>
          <div className="space-y-3">
            {(["die_casting","coating","cnc_vmc"] as const).map(proc => {
              const pWOs    = workOrders.filter(w=>w.process===proc)
              const done    = pWOs.filter(w=>w.status==="completed").length
              const active  = pWOs.filter(w=>w.status==="in_progress").length
              const draft   = pWOs.filter(w=>w.status==="draft").length
              return (
                <div key={proc} className="p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PROCESS_COLORS[proc]}`}>
                      {PROCESS_ICON[proc]} {PROCESS_STAGE_LABELS[proc]}
                    </span>
                    <span className="text-xs font-bold text-slate-600">{pWOs.length} WOs total</span>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    {draft>0 && <span className="px-2 py-0.5 bg-slate-200 rounded-full text-slate-600 font-bold">{draft} draft</span>}
                    {active>0 && <span className="px-2 py-0.5 bg-blue-100 rounded-full text-blue-700 font-bold">{active} active</span>}
                    {done>0  && <span className="px-2 py-0.5 bg-emerald-100 rounded-full text-emerald-700 font-bold">{done} done</span>}
                    {pWOs.length===0 && <span className="text-slate-400 italic">No WOs yet</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            {[
              ["Total Produced",   totalProduced,   "text-slate-900"],
              ["Good Parts",       totalGood,       "text-emerald-700"],
              ["Rejected Parts",   totalRejected,   "text-red-700"],
              ["Rejection Rate",   `${rejRate}%`,   "text-orange-600"],
            ].map(([k,v,c]) => (
              <div key={k as string} className="flex justify-between text-sm">
                <span className="text-slate-500">{k}</span>
                <span className={`font-black ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly schedule summary - Admin & Storekeeper */}
      {(role===UserRole.ADMIN||role===UserRole.STOREKEEPER) && schedules.length>0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-900">Monthly Schedule</h2>
            <Link href="/dashboard/schedule" className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">Manage <ArrowRight size={12}/></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="pb-3 text-left">#</th><th className="pb-3 text-left">Part ID</th><th className="pb-3 text-left">Part Name</th><th className="pb-3 text-right">Req Qty</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {schedules.slice(0,6).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400">{s.serialNumber}</td>
                    <td className="py-2.5 font-mono text-indigo-600 text-xs">{s.partId}</td>
                    <td className="py-2.5 font-medium text-slate-900">{s.partName}</td>
                    <td className="py-2.5 text-right font-black text-slate-900">{s.requiredQuantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
