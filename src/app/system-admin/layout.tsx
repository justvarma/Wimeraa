"use client"

import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Building2, LogOut, ShieldAlert, ChevronLeft, ChevronRight, Warehouse } from "lucide-react"

function cn(...c: (string|boolean|undefined)[]) { return c.filter(Boolean).join(" ") }

export default function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, logout, sidebarCollapsed, setSidebarCollapsed } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !currentUser) router.push("/")
    if (!loading && currentUser && currentUser.role !== UserRole.SYSTEM_ADMIN) router.push("/dashboard")
  }, [currentUser, loading, router])

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"/>
    </div>
  )

  if (!currentUser || currentUser.role !== UserRole.SYSTEM_ADMIN) return null

  const w = sidebarCollapsed ? "w-16" : "w-64"

  return (
    <div className="flex bg-slate-100 min-h-screen">
      {/* Isolated sidebar — NO menu items, just branding + user + logout */}
      <aside className={`${w} bg-slate-950 text-white h-screen fixed left-0 top-0 flex flex-col z-20 transition-all duration-200 border-r border-slate-800`}>
        {/* Header */}
        <div className={cn("border-b border-slate-800 flex items-center", sidebarCollapsed ? "p-3 justify-center" : "p-4 justify-between")}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
                <Warehouse size={15} className="text-white"/>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-black text-white leading-tight truncate">Wimera Platform</h1>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">System Administration</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Warehouse size={15} className="text-white"/>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn("p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0",
              sidebarCollapsed && "absolute -right-3 top-4 bg-slate-950 border border-slate-700 shadow-lg")}
          >
            {sidebarCollapsed ? <ChevronRight size={14}/> : <ChevronLeft size={14}/>}
          </button>
        </div>

        {/* User info */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0"/>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 truncate">System Admin (Wimera)</p>
              </div>
            </div>
            <div className="px-2.5 py-1.5 bg-violet-900/40 border border-violet-700/40 rounded-lg">
              <p className="text-[10px] text-violet-400 font-bold">⚡ Platform-level access</p>
            </div>
          </div>
        )}

        {/* NO nav items — intentionally empty */}
        <div className="flex-1"/>

        {/* Footer */}
        <div className="p-2 border-t border-slate-800">
          {!sidebarCollapsed && (
            <div className="px-3 py-2 mb-1">
              <p className="text-sm text-slate-200 font-bold truncate">{currentUser.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
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

      <main
        className="flex-1 p-8 min-h-screen transition-all duration-200"
        style={{ marginLeft: sidebarCollapsed ? "4rem" : "16rem" }}
      >
        {children}
      </main>
    </div>
  )
}
