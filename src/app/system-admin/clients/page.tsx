"use client"

import { useState } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole } from "@/lib/store"
import {
  Building2, Plus, X, Search, Edit2, Trash2, CheckCircle2,
  AlertTriangle, Globe, Phone, Mail, MapPin, Users, ShieldAlert,
} from "lucide-react"

// ─── Client data model (wimera-level, not company-module data) ────────────────
interface Client {
  id: string
  name: string
  industry: string
  contact: string
  email: string
  phone: string
  location: string
  plan: "starter" | "professional" | "enterprise"
  status: "active" | "suspended" | "trial"
  users: number
  joinedAt: string
}

const PLAN_STYLES: Record<Client["plan"], string> = {
  starter:      "bg-slate-100 text-slate-700 border-slate-200",
  professional: "bg-blue-100 text-blue-700 border-blue-200",
  enterprise:   "bg-violet-100 text-violet-700 border-violet-200",
}

const STATUS_STYLES: Record<Client["status"], string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
  trial:     "bg-amber-100 text-amber-700 border-amber-200",
}

const INITIAL_CLIENTS: Client[] = [
  { id:"cl-001", name:"GK Manufacturing Pvt Ltd",   industry:"Auto Components",  contact:"Ganesh Kumar",     email:"ganesh@gkmanufacturing.com",   phone:"+91 98765 43210", location:"Coimbatore, TN",      plan:"enterprise",    status:"active",    users:12, joinedAt:"2025-03-01" },
  { id:"cl-002", name:"Precision Parts Pvt Ltd",    industry:"Machining",        contact:"Ramesh Iyer",      email:"ramesh@precisionparts.in",      phone:"+91 98400 11234", location:"Pune, MH",             plan:"professional",  status:"active",    users:6,  joinedAt:"2025-06-15" },
  { id:"cl-003", name:"Aero Castings Ltd",          industry:"Die Casting",      contact:"Sujatha Menon",    email:"sujatha@aerocastings.com",      phone:"+91 97890 55678", location:"Hyderabad, TS",        plan:"starter",       status:"trial",     users:3,  joinedAt:"2026-02-01" },
  { id:"cl-004", name:"Bharat Surface Tech",        industry:"Coating & Plating",contact:"Vikram Rajan",     email:"vikram@bharatsurface.com",      phone:"+91 99001 77890", location:"Chennai, TN",          plan:"professional",  status:"suspended", users:5,  joinedAt:"2025-09-10" },
  { id:"cl-005", name:"Nova Auto Systems",          industry:"Auto Components",  contact:"Divya Suresh",     email:"divya@novaauto.com",            phone:"+91 96000 22345", location:"Bengaluru, KA",        plan:"enterprise",    status:"active",    users:18, joinedAt:"2024-12-01" },
]

const emptyForm = {
  name: "", industry: "", contact: "", email: "", phone: "",
  location: "", plan: "starter" as Client["plan"], status: "trial" as Client["status"], users: "",
}

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${style}`}>
      {label}
    </span>
  )
}

export default function ClientManagementPage() {
  const { currentUser } = useApp()
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS)
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState<"all" | Client["plan"]>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | Client["status"]>("all")
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [formError, setFormError] = useState<string | null>(null)

  if (currentUser?.role !== UserRole.SYSTEM_ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <ShieldAlert size={48} className="text-red-400"/>
        <p className="text-lg font-bold text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">Only Wimera System Administrators can access this page.</p>
      </div>
    )
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const match = c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.location.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)
    return match && (planFilter === "all" || c.plan === planFilter) && (statusFilter === "all" || c.status === statusFilter)
  })

  const stats = {
    total:  clients.length,
    active: clients.filter(c => c.status === "active").length,
    trial:  clients.filter(c => c.status === "trial").length,
    users:  clients.reduce((s, c) => s + c.users, 0),
  }

  const openAdd = () => { setForm({ ...emptyForm }); setEditClient(null); setFormError(null); setShowForm(true) }
  const openEdit = (c: Client) => {
    setForm({ name: c.name, industry: c.industry, contact: c.contact, email: c.email, phone: c.phone, location: c.location, plan: c.plan, status: c.status, users: String(c.users) })
    setEditClient(c); setFormError(null); setShowForm(true)
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.contact.trim() || !form.email.trim()) {
      setFormError("Name, contact person, and email are required."); return
    }
    if (editClient) {
      setClients(prev => prev.map(c => c.id === editClient.id
        ? { ...c, ...form, users: Number(form.users) || c.users }
        : c))
    } else {
      const newC: Client = {
        id: `cl-${Date.now()}`, ...form, users: Number(form.users) || 1,
        joinedAt: new Date().toISOString().split("T")[0],
      }
      setClients(prev => [...prev, newC])
    }
    setShowForm(false)
  }

  const handleDelete = (c: Client) => {
    setClients(prev => prev.filter(x => x.id !== c.id))
    setDeleteConfirm(null)
  }

  const toggleStatus = (id: string, current: Client["status"]) => {
    const next: Client["status"] = current === "active" ? "suspended" : "active"
    setClients(prev => prev.map(c => c.id === id ? { ...c, status: next } : c))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-600/20">
          <Building2 size={22} className="text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Client Management</h1>
          <p className="text-sm text-slate-500">Wimera platform-level — manage all client organisations and subscriptions</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
            <p className="text-[11px] font-black text-violet-700 uppercase tracking-widest">⚡ System Admin</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-colors shadow shadow-violet-500/20"
          >
            <Plus size={15}/> Add Client
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Clients",  value: stats.total,  color: "bg-violet-500",  icon: Building2 },
          { label: "Active",         value: stats.active, color: "bg-emerald-500", icon: CheckCircle2 },
          { label: "On Trial",       value: stats.trial,  color: "bg-amber-500",   icon: AlertTriangle },
          { label: "Total Users",    value: stats.users,  color: "bg-blue-500",    icon: Users },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-200 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>
              <s.icon size={20} className="text-white"/>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center flex-wrap gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 w-56"
            />
          </div>
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value as typeof planFilter)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="all">All Plans</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
          <span className="ml-auto text-xs text-slate-400 font-medium">{filtered.length} of {clients.length} clients</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Organisation", "Industry", "Contact", "Plan", "Status", "Users", "Joined", "Actions"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400 text-sm">No clients match your filters.</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={10}/> {c.location}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-600 text-xs">{c.industry}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-700 text-xs">{c.contact}</p>
                    <a href={`mailto:${c.email}`} className="text-[11px] text-blue-500 flex items-center gap-1 mt-0.5 hover:underline">
                      <Mail size={10}/> {c.email}
                    </a>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone size={10}/> {c.phone}
                    </p>
                  </td>
                  <td className="px-5 py-4"><Badge label={c.plan} style={PLAN_STYLES[c.plan]}/></td>
                  <td className="px-5 py-4"><Badge label={c.status} style={STATUS_STYLES[c.status]}/></td>
                  <td className="px-5 py-4 font-bold text-slate-700">{c.users}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{c.joinedAt}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} title="Edit"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                        <Edit2 size={14}/>
                      </button>
                      <button
                        onClick={() => toggleStatus(c.id, c.status)}
                        title={c.status === "active" ? "Suspend" : "Activate"}
                        className={`p-1.5 rounded-lg transition-colors ${c.status === "active" ? "text-amber-400 hover:bg-amber-50 hover:text-amber-600" : "text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600"}`}>
                        {c.status === "active" ? <AlertTriangle size={14}/> : <CheckCircle2 size={14}/>}
                      </button>
                      <button onClick={() => setDeleteConfirm(c)} title="Delete"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Building2 size={18} className="text-violet-600"/>
                </div>
                <h3 className="font-black text-slate-800">{editClient ? "Edit Client" : "Add New Client"}</h3>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={16}/>
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{formError}</div>
            )}

            <div className="space-y-4">
              {[
                { label: "Organisation Name *", key: "name",     type: "text", icon: Building2, placeholder: "e.g. GK Manufacturing Pvt Ltd" },
                { label: "Industry",            key: "industry", type: "text", icon: Globe,      placeholder: "e.g. Auto Components" },
                { label: "Contact Person *",    key: "contact",  type: "text", icon: Users,      placeholder: "Primary contact name" },
                { label: "Email *",             key: "email",    type: "email",icon: Mail,       placeholder: "contact@company.com" },
                { label: "Phone",               key: "phone",    type: "text", icon: Phone,      placeholder: "+91 98765 43210" },
                { label: "Location",            key: "location", type: "text", icon: MapPin,     placeholder: "City, State" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <div className="relative">
                    <f.icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      type={f.type}
                      value={(form as Record<string, string>)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Plan</label>
                  <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value as Client["plan"] }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Client["status"] }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400">
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave}
                className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors">
                {editClient ? "Save Changes" : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={18} className="text-red-600"/>
              </div>
              <div>
                <h3 className="font-black text-slate-800">Delete Client</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to remove <span className="font-bold text-slate-800">{deleteConfirm.name}</span> from the platform?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
