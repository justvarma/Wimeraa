"use client"

import { Sidebar } from "@/components/layout/Sidebar"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ShieldAlert } from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, sidebarCollapsed } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !currentUser) router.push("/")
  }, [currentUser, loading, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"/>
      </div>
    )
  }

  if (!currentUser) return null

  // Only SYSTEM_ADMIN can access /admin/* routes
  if (currentUser.role !== UserRole.SYSTEM_ADMIN) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <ShieldAlert size={56} className="text-red-500"/>
        <p className="text-2xl font-black text-white">Access Denied</p>
        <p className="text-slate-400 text-sm">This area is restricted to Wimera System Administrators.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-colors"
        >
          Return to Login
        </button>
      </div>
    )
  }

  return (
    <div className="flex bg-slate-100 min-h-screen">
      <Sidebar />
      <main
        className="flex-1 p-8 min-h-screen transition-all duration-200"
        style={{ marginLeft: sidebarCollapsed ? "4rem" : "16rem" }}
      >
        {children}
      </main>
    </div>
  )
}
