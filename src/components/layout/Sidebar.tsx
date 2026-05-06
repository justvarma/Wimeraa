"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, ROLE_LABELS, QI_PROCESS_ROLES, QI_ROLE_PROCESS_MAP, PROCESS_STAGE_LABELS } from "@/lib/store"
import {
  LayoutDashboard, Package, Users, LogOut, ClipboardCheck, ClipboardList,
  CalendarDays, Warehouse, Fingerprint, Factory, ShieldCheck,
  Cog, ChevronLeft, ChevronRight, ShieldAlert, BarChart3, Settings, PackageSearch,
} from "lucide-react"

function cn(...c: (string|boolean|undefined)[]) { return c.filter(Boolean).join(" ") }

// ─────────────────────────────────────────────────────────────────────────────
// MENU TABLE — exactly matches the spec, one entry per role×item
//
//  SYSTEM_ADMIN  → No sidebar items (handled by /system-admin layout directly)
//  ADMIN         → Dashboard | Inventory (approve/rej) | Schedule | Work Orders | Pipeline | Quality | Reports | Config
//  STOREKEEPER   → Dashboard | Inventory (add/edit/del)
//  INVENTORY_QI  → Inventory Review (approve/rej only — no Dashboard)
//  PDC_MANAGER   → Dashboard | Inventory (view) | Schedule | Work Orders | Pipeline | Reports
//  PDC_DIE_CAST  → Dashboard | Inventory (view) | Schedule | Work Orders | Pipeline | Reports
//  PDC_COATING   → Dashboard | Inventory (view) | Schedule | Work Orders | Pipeline | Reports
//  PDC_MACHINING → Dashboard | Inventory (view) | Schedule | Work Orders | Pipeline | Reports
//  QI_DIE_CAST   → Dashboard | Pipeline | Quality
//  QI_COATING    → Dashboard | Pipeline | Quality
//  QI_MACHINING  → Dashboard | Pipeline | Quality
//  FINAL_QI      → Dashboard | Schedule (view) | Pipeline | Quality
//  QUALITY_INSP  → (legacy compat — same as FINAL_QI)
// ─────────────────────────────────────────────────────────────────────────────

const PDC_ROLES = [
  UserRole.PTC_MANAGER,
  UserRole.PTC_DIE_CASTING,
  UserRole.PTC_COATING,
  UserRole.PTC_CNC_VMC,
]

const ALL_QI_ROLES = [
  UserRole.QI_DIE_CASTING,
  UserRole.QI_COATING,
  UserRole.QI_MACHINING,
  UserRole.QUALITY_INSPECTOR,
  UserRole.FQI,
]

const MENU = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: [
      UserRole.ADMIN,
      UserRole.STOREKEEPER,
      ...PDC_ROLES,
      ...ALL_QI_ROLES,
    ],
  },

  // ── Inventory ──────────────────────────────────────────────────────────────
  // Storekeeper: full add/edit/delete view  (rendered via isStorekeeper flag in page)
  // Admin: approve/reject view              (rendered via isAdmin flag in page)
  // PDC roles: view-only                   (rendered via isPDC flag in page)
  {
    title: "Inventory",
    href: "/dashboard/inventory",
    icon: Package,
    roles: [
      UserRole.ADMIN,
      UserRole.STOREKEEPER,
      UserRole.PTC_MANAGER,
      UserRole.PTC_DIE_CASTING,
      UserRole.PTC_COATING,
      UserRole.PTC_CNC_VMC,
    ],
  },

  // InventoryQI: dedicated approve/reject page (no dashboard, inventory-only)
  {
    title: "Inventory Review",
    href: "/dashboard/inventory-qi",
    icon: PackageSearch,
    roles: [UserRole.INVENTORY_QI],
  },

  // ── Monthly Schedule ────────────────────────────────────────────────────────
  // Admin + PDC roles: full manage
  // Final_QI / QUALITY_INSPECTOR: view-only  (enforced in the page)
  {
    title: "Schedule",
    href: "/dashboard/schedule",
    icon: CalendarDays,
    roles: [
      UserRole.ADMIN,
      UserRole.PTC_MANAGER,
      UserRole.PTC_DIE_CASTING,
      UserRole.PTC_COATING,
      UserRole.PTC_CNC_VMC,
      UserRole.FQI,
      UserRole.QUALITY_INSPECTOR,
    ],
  },

  // ── Work Orders ─────────────────────────────────────────────────────────────
  {
    title: "Work Orders",
    href: "/dashboard/workorders",
    icon: ClipboardList,
    roles: [
      UserRole.ADMIN,
      UserRole.PTC_MANAGER,
      UserRole.PTC_DIE_CASTING,
      UserRole.PTC_COATING,
      UserRole.PTC_CNC_VMC,
    ],
  },

  // ── Pipeline (= Production tracking) ───────────────────────────────────────
  {
    title: "Pipeline",
    href: "/dashboard/production",
    icon: Factory,
    roles: [
      UserRole.ADMIN,
      UserRole.PTC_MANAGER,
      UserRole.PTC_DIE_CASTING,
      UserRole.PTC_COATING,
      UserRole.PTC_CNC_VMC,
      UserRole.QI_DIE_CASTING,
      UserRole.QI_COATING,
      UserRole.QI_MACHINING,
      UserRole.QUALITY_INSPECTOR,
      UserRole.FQI,
    ],
  },

  // ── Quality ─────────────────────────────────────────────────────────────────
  // Single entry for all QI roles + Admin → /dashboard/quality hub
  // The hub page routes to scoped sub-pages based on role
  {
    title: "Quality",
    href: "/dashboard/quality",
    icon: ShieldCheck,
    roles: [
      UserRole.ADMIN,
      UserRole.QI_DIE_CASTING,
      UserRole.QI_COATING,
      UserRole.QI_MACHINING,
      UserRole.QUALITY_INSPECTOR,
      UserRole.FQI,
    ],
  },

  // ── Reports ─────────────────────────────────────────────────────────────────
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: [
      UserRole.ADMIN,
      UserRole.PTC_MANAGER,
      UserRole.PTC_DIE_CASTING,
      UserRole.PTC_COATING,
      UserRole.PTC_CNC_VMC,
    ],
  },

  // ── Config (Users + Settings) ───────────────────────────────────────────────
  {
    title: "Config",
    href: "/dashboard/config",
    icon: Settings,
    roles: [UserRole.ADMIN],
  },
]

const ROLE_DOT: Record<string, string> = {
  system_admin:      "bg-violet-500",
  admin:             "bg-blue-500",
  storekeeper:       "bg-teal-500",
  ptc_manager:       "bg-indigo-500",
  ptc_die_casting:   "bg-orange-500",
  ptc_coating:       "bg-purple-500",
  ptc_cnc_vmc:       "bg-cyan-500",
  qi_die_casting:    "bg-orange-400",
  qi_coating:        "bg-purple-400",
  qi_machining:      "bg-cyan-400",
  inventory_qi:      "bg-lime-500",
  quality_inspector: "bg-emerald-500",
  fqi:               "bg-rose-500",
}

export function Sidebar() {
  const pathname = usePathname()
  const { currentUser, logout, sidebarCollapsed, setSidebarCollapsed } = useApp()
  const role = currentUser?.role as UserRole
  const w = sidebarCollapsed ? "w-16" : "w-64"

  const isQISub      = QI_PROCESS_ROLES.includes(role)
  const qiProcess    = isQISub ? QI_ROLE_PROCESS_MAP[role] : null
  const isInventoryQI = role === UserRole.INVENTORY_QI

  // Filter to this role's items
  const filtered = MENU.filter(i => role && i.roles.includes(role))

  return (
    <aside className={`${w} bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col z-20 transition-all duration-200 border-r border-slate-800`}>
      {/* Header */}
      <div className={cn("border-b border-slate-800 flex items-center", sidebarCollapsed ? "p-3 justify-center" : "p-4 justify-between")}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Warehouse size={15} className="text-white"/>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black text-white leading-tight truncate">Wimera Systems</h1>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Manufacturing ERP</p>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Warehouse size={15} className="text-white"/>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn("p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0",
            sidebarCollapsed && "absolute -right-3 top-4 bg-slate-900 border border-slate-700 shadow-lg")}
        >
          {sidebarCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
        </button>
      </div>

      {/* User info */}
      {!sidebarCollapsed && currentUser && (
        <div className="px-4 py-2.5 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${ROLE_DOT[role] || "bg-slate-500"}`}/>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-200 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{ROLE_LABELS[role]}</p>
            </div>
          </div>
          {qiProcess && (
            <div className="mt-2 px-2.5 py-1 bg-emerald-900/40 border border-emerald-700/40 rounded-lg">
              <p className="text-[10px] text-emerald-400 font-bold">Scoped: {PROCESS_STAGE_LABELS[qiProcess]}</p>
            </div>
          )}
          {isInventoryQI && (
            <div className="mt-2 px-2.5 py-1 bg-lime-900/40 border border-lime-700/40 rounded-lg">
              <p className="text-[10px] text-lime-400 font-bold">Scoped: Inventory Approval</p>
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 && (
          <div className={cn("p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center", sidebarCollapsed && "p-2")}>
            <ShieldAlert size={22} className="mx-auto text-red-500"/>
            {!sidebarCollapsed && <p className="text-[10px] text-red-400 font-bold mt-1">NO ACCESS</p>}
          </div>
        )}
        {filtered.map(item => {
          // Quality hub: active for /dashboard/quality and all sub-routes
          const isQualityHub = item.href === "/dashboard/quality"
          const active = isQualityHub
            ? pathname.startsWith("/dashboard/quality")
            : item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.title : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl transition-all font-medium text-sm",
                sidebarCollapsed ? "px-0 py-3 justify-center" : "px-3 py-2.5",
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}>
              <item.icon size={17} className="shrink-0"/>
              {!sidebarCollapsed && <span className="truncate">{item.title}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-slate-800">
        {!sidebarCollapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm text-slate-200 font-bold truncate">{currentUser?.name}</p>
            <p className="text-[11px] text-slate-500 truncate">{currentUser?.email}</p>
          </div>
        )}
        <button onClick={logout} title={sidebarCollapsed ? "Logout" : undefined}
          className={cn("flex items-center gap-2.5 w-full rounded-xl transition-colors font-medium text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400",
            sidebarCollapsed ? "px-0 py-3 justify-center" : "px-3 py-2.5")}>
          <LogOut size={17} className="shrink-0"/>
          {!sidebarCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
