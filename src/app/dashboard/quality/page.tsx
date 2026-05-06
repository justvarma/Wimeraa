"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"
import { ShieldCheck, Flame, Paintbrush, Cog, ArrowRight, AlertCircle, Award } from "lucide-react"

// Map scoped QI roles → their process sub-page
const QI_SCOPE_REDIRECT: Partial<Record<UserRole, string>> = {
  [UserRole.QI_DIE_CASTING]: "/dashboard/quality/die-casting",
  [UserRole.QI_COATING]:     "/dashboard/quality/coating",
  [UserRole.QI_MACHINING]:   "/dashboard/quality/machining",
}

const CARDS = [
  {
    href: "/dashboard/quality/die-casting",
    icon: Flame,
    label: "Die Casting QI",
    description: "Inspect parts from die casting — track good, rework and rejected outputs.",
    color: "border-orange-300 bg-orange-50 hover:border-orange-400",
    iconColor: "text-orange-600",
    badge: "bg-orange-100 text-orange-800",
    process: "die_casting" as const,
  },
  {
    href: "/dashboard/quality/coating",
    icon: Paintbrush,
    label: "Coating QI",
    description: "Inspect parts post-coating — verify surface treatment quality and classify defects.",
    color: "border-purple-300 bg-purple-50 hover:border-purple-400",
    iconColor: "text-purple-600",
    badge: "bg-purple-100 text-purple-800",
    process: "coating" as const,
  },
  {
    href: "/dashboard/quality/machining",
    icon: Cog,
    label: "CNC/VMC Machining QI",
    description: "Inspect precision-machined parts — dimensional accuracy and surface finish checks.",
    color: "border-cyan-300 bg-cyan-50 hover:border-cyan-400",
    iconColor: "text-cyan-600",
    badge: "bg-cyan-100 text-cyan-800",
    process: "cnc_vmc" as const,
  },
  {
    href: "/dashboard/fqi",
    icon: Award,
    label: "Final QI (FQI)",
    description: "Final quality gate — full cross-process inspection before shipment approval.",
    color: "border-rose-300 bg-rose-50 hover:border-rose-400",
    iconColor: "text-rose-600",
    badge: "bg-rose-100 text-rose-800",
    process: null,
  },
]

export default function QualityIndexPage() {
  const { currentUser, qiInspections } = useApp()
  const router = useRouter()
  const role = currentUser?.role as UserRole

  // Scoped QI roles auto-redirect to their own process page
  useEffect(() => {
    const redirect = role && QI_SCOPE_REDIRECT[role]
    if (redirect) router.replace(redirect)
  }, [role, router])

  // FQI goes to their own page
  useEffect(() => {
    if (role === UserRole.FQI) router.replace("/dashboard/fqi")
  }, [role, router])

  const canAccess =
    role === UserRole.QUALITY_INSPECTOR ||
    role === UserRole.ADMIN ||
    role === UserRole.FQI ||
    role in QI_SCOPE_REDIRECT

  if (!canAccess) return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <AlertCircle size={48} className="text-red-400 mb-4"/>
      <p className="text-slate-500 font-medium">Access restricted to Quality roles.</p>
    </div>
  )

  // While redirecting scoped roles, show nothing
  if (role && (QI_SCOPE_REDIRECT[role] || role === UserRole.FQI)) return null

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <div className="flex items-center gap-3 mb-1">
          <ShieldCheck size={28} className="text-blue-600"/>
          <h1 className="text-3xl font-black text-slate-900">Quality Inspection</h1>
        </div>
        <p className="text-slate-500 ml-11">
          In-process quality inspection across all stages. Select a process to begin.
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {(["die_casting", "coating", "cnc_vmc"] as const).map((p, i) => {
          const count = qiInspections.filter(q => q.process === p).length
          const labels = ["Die Casting", "Coating", "Machining"]
          const colors = [
            "text-orange-700 bg-orange-50 border-orange-200",
            "text-purple-700 bg-purple-50 border-purple-200",
            "text-cyan-700 bg-cyan-50 border-cyan-200",
          ]
          return (
            <div key={p} className={`rounded-2xl border p-4 text-center ${colors[i]}`}>
              <p className="text-2xl font-black">{count}</p>
              <p className="text-xs font-black uppercase tracking-widest mt-1">{labels[i]}</p>
              <p className="text-[10px] opacity-70">inspections</p>
            </div>
          )
        })}
      </div>

      {/* Process cards */}
      <div className="grid gap-5">
        {CARDS.map(card => (
          <Link key={card.href} href={card.href}
            className={`group flex items-center gap-6 rounded-2xl border-2 p-6 transition-all ${card.color}`}>
            <div className={`w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 ${card.iconColor}`}>
              <card.icon size={26}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-black text-slate-900">{card.label}</h2>
                {card.process && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${card.badge}`}>
                    {qiInspections.filter(q => q.process === card.process).length} records
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600">{card.description}</p>
            </div>
            <ArrowRight size={20} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all shrink-0"/>
          </Link>
        ))}
      </div>
    </div>
  )
}
