"use client"

import { Sidebar } from "@/components/layout/Sidebar"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, sidebarCollapsed } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/")
    }
    // System admin must not access company dashboard routes
    if (!loading && currentUser?.role === UserRole.SYSTEM_ADMIN) {
      router.push("/system-admin/clients")
    }
  }, [currentUser, loading, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!currentUser) return null

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
