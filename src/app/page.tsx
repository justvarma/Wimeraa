"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Warehouse, LogIn, ShieldAlert, Eye, EyeOff, Lock, Mail } from "lucide-react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"

const ACCOUNTS = [
  // System Admin (Wimera-level)
  { label:"System Admin",      email:"sysadmin@wimera.com",      password:"wimera123",  color:"bg-violet-500", role:"Client Management only" },
  // Admin
  { label:"Admin",             email:"admin@wimera.com",         password:"admin123",    color:"bg-blue-500",    role:"Full access — no PTC mgmt" },
  // Storekeeper
  { label:"Storekeeper",       email:"storekeeper@wimera.com",   password:"store123",    color:"bg-teal-500",    role:"Inventory & Schedule" },
  // PTC roles
  { label:"PTC Manager",       email:"ptc@wimera.com",           password:"ptc123",      color:"bg-indigo-500",  role:"Creates Work Order shells + PTC" },
  { label:"PTC – Die Casting", email:"ptc.dc@wimera.com",        password:"ptcdc123",    color:"bg-orange-500",  role:"Die Casting operations" },
  { label:"PTC – Coating",     email:"ptc.coat@wimera.com",      password:"ptcco123",    color:"bg-purple-500",  role:"Coating operations" },
  { label:"PTC – CNC/VMC",     email:"ptc.cnc@wimera.com",       password:"ptccnc123",   color:"bg-cyan-500",    role:"Machining operations" },
  // QI sub-roles (each scoped to one process)
  { label:"QI – Die Casting",  email:"qi.dc@wimera.com",         password:"qidc123",     color:"bg-orange-400",  role:"QI: Die Casting only" },
  { label:"QI – Coating",      email:"qi.coat@wimera.com",       password:"qico123",     color:"bg-purple-400",  role:"QI: Coating only" },
  { label:"QI – Machining",    email:"qi.cnc@wimera.com",        password:"qicnc123",    color:"bg-cyan-400",    role:"QI: Machining only" },
  { label:"Inventory QI",      email:"inv.qi@wimera.com",        password:"invqi123",    color:"bg-lime-500",    role:"QI: Inventory approval only" },
  // Final QI
  { label:"Final QI",          email:"fqi@wimera.com",           password:"fqi123",      color:"bg-rose-500",    role:"Final quality gate — all processes" },
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [pwd, setPwd]     = useState("")
  const [show, setShow]   = useState(false)
  const [err, setErr]     = useState<string|null>(null)
  const [busy, setBusy]   = useState(false)
  const { login, currentUser, loading } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!loading && currentUser) {
      if (currentUser.role === UserRole.SYSTEM_ADMIN) router.push("/system-admin/clients")
      else if (currentUser.role === UserRole.INVENTORY_QI) router.push("/dashboard/inventory-qi")
      else router.push("/dashboard")
    }
  }, [currentUser, loading, router])

  const doLogin = (em: string, pw: string) => {
    setErr(null); setBusy(true)
    const r = login(em.trim(), pw)
    if (r.success) {
      const isSysAdmin    = em.trim() === "sysadmin@wimera.com"
      const isInventoryQI = em.trim() === "inv.qi@wimera.com"
      if (isSysAdmin)    router.push("/system-admin/clients")
      else if (isInventoryQI) router.push("/dashboard/inventory-qi")
      else               router.push("/dashboard")
    }
    else { setErr(r.error || "Login failed"); setBusy(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-blue-700/5 blur-[140px] rounded-full pointer-events-none"/>
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-indigo-700/5 blur-[140px] rounded-full pointer-events-none"/>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-5 gap-0 shadow-2xl rounded-2xl overflow-hidden border border-slate-800 relative z-10">
        {/* Left — accounts */}
        <div className="lg:col-span-2 bg-slate-900 p-7 flex flex-col gap-4">
          <div>
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20">
              <Warehouse className="text-white" size={24}/>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight leading-tight">
              GK Manufacturing<br/><span className="text-blue-400">ERP — Wimera Systems</span>
            </h1>
            <p className="text-slate-500 mt-2 text-xs leading-relaxed">Role-based manufacturing ERP. Each QI role is scoped to a single process.</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Demo accounts</p>
            <div className="space-y-1 overflow-y-auto max-h-80">
              {ACCOUNTS.map(a => (
                <button key={a.email} onClick={() => doLogin(a.email, a.password)} disabled={busy}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 hover:border-slate-600 transition-all group text-left disabled:opacity-40">
                  <div className={`w-2 h-2 rounded-full ${a.color} shrink-0`}/>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-300 group-hover:text-white truncate">{a.label}</p>
                    <p className="text-[10px] text-slate-600 truncate">{a.role}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 font-mono shrink-0">{a.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — form */}
        <div className="lg:col-span-3 bg-slate-900/40 backdrop-blur p-8 flex flex-col justify-center">
          <h2 className="text-2xl font-black text-white mb-1">Sign In</h2>
          <p className="text-slate-500 text-sm mb-8">Enter your credentials or click a demo account</p>

          {err && (
            <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex gap-3 items-start">
              <ShieldAlert size={18} className="shrink-0 mt-0.5"/><p>{err}</p>
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); doLogin(email, pwd) }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@wimera.com" required
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-xl py-3 pl-9 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input type={show?"text":"password"} value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" required
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-xl py-3 pl-9 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 mt-2">
              {busy ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"/> : <><LogIn size={18}/>Sign In</>}
            </button>
          </form>
          <p className="text-slate-700 text-xs mt-8 text-center">© 2026 Wimera Systems Pvt Ltd. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
