"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, ROLE_LABELS, DEFAULT_SHIFT_CONFIGS, type RoleConfig, type ShiftConfig } from "@/lib/store"
import {
  Settings, Users, Plus, Edit2, Trash2, X, ShieldAlert,
  ShieldCheck, Clock, CheckCircle, XCircle, AlertCircle,
  Coffee, ChevronDown,
} from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  admin:             "bg-blue-100 text-blue-700",
  storekeeper:       "bg-teal-100 text-teal-700",
  ptc_manager:       "bg-indigo-100 text-indigo-700",
  ptc_die_casting:   "bg-orange-100 text-orange-700",
  ptc_coating:       "bg-purple-100 text-purple-700",
  ptc_cnc_vmc:       "bg-cyan-100 text-cyan-700",
  qi_die_casting:    "bg-orange-100 text-orange-600",
  qi_coating:        "bg-purple-100 text-purple-600",
  qi_machining:      "bg-cyan-100 text-cyan-600",
  inventory_qi:      "bg-lime-100 text-lime-700",
  quality_inspector: "bg-emerald-100 text-emerald-700",
  fqi:               "bg-rose-100 text-rose-700",
  system_admin:      "bg-violet-100 text-violet-700",
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
          {label}
        </label>
        {children}
      </div>
  )
}

function Input({ value, onChange, type = "text", placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
      <input type={type} value={value} placeholder={placeholder}
             onChange={e => onChange(e.target.value)}
             className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
  )
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
             className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono" />
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "users" | "roles" | "shifts"

export function ConfigPageContent({ forcedTab }: { forcedTab?: Tab } = {}) {
  const {
    currentUser, users, addUser, updateUser, deleteUser,
    roles, addRole, updateRole, deleteRole,
    shifts, updateShift,
  } = useApp()

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const queryTab: Tab = tabParam === "roles" || tabParam === "shifts" || tabParam === "users" ? tabParam : "users"
  const initialTab: Tab = forcedTab ?? queryTab
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const isSystemAdmin = currentUser?.role === UserRole.SYSTEM_ADMIN

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (pathname === "/dashboard/config/shifts" && tab === "shifts") return
    if (tab === "shifts") {
      router.replace("/dashboard/config/shifts")
      return
    }
    router.replace(`/dashboard/config?tab=${tab}`)
  }

  if (currentUser?.role !== UserRole.ADMIN && currentUser?.role !== UserRole.SYSTEM_ADMIN) {
    return (
        <div className="flex flex-col items-center justify-center h-80 gap-4">
          <ShieldAlert size={48} className="text-red-400" />
          <p className="text-lg font-bold text-slate-700">Access Denied</p>
          <p className="text-sm text-slate-500">Config is restricted to Admin only.</p>
        </div>
    )
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-700 rounded-xl flex items-center justify-center">
            <Settings size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Basic Config</h1>
            <p className="text-sm text-slate-500">Manage roles, users, and shift schedules</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {([
            ["users",  Users,       "Users"],
            ["roles",  ShieldCheck, "Roles"],
            ["shifts", Clock,       "Shifts"],
          ] as const)
            .filter(([tab]) => !isSystemAdmin || tab === "users")
            .map(([tab, Icon, label]) => (
              <button key={tab} onClick={() => handleTabChange(tab)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                          activeTab === tab
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                      }`}>
                <Icon size={14} /> {label}
              </button>
          ))}
        </div>

        {activeTab === "users"  && <UsersTab />}
        {activeTab === "roles"  && <RolesTab />}
        {activeTab === "shifts" && <ShiftsTab />}
      </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// USERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function UsersTab() {
  const { currentUser, users, addUser, updateUser, deleteUser, roles } = useApp()
  const isSystemAdmin = currentUser?.role === UserRole.SYSTEM_ADMIN
  const visibleUsers = users.filter(u => u.role !== UserRole.SYSTEM_ADMIN)

  const [showForm,       setShowForm]       = useState(false)
  const [editId,         setEditId]         = useState<string | null>(null)
  const [confirmDelete,  setConfirmDelete]  = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState("")

  const blankForm = {
    name: "", email: "", password: "",
    role: UserRole.STOREKEEPER, plant: "", department: "",
  }
  const [form, setForm] = useState(blankForm)

  const configuredRoles = roles
    .filter(r => r.isActive && r.permissionKey !== UserRole.SYSTEM_ADMIN)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => ({ key: r.permissionKey, label: r.name }))

  const fallbackSystemRoles = Object.values(UserRole)
    .filter(r => r !== UserRole.SYSTEM_ADMIN)
    .map(r => ({ key: r, label: ROLE_LABELS[r] }))

  // If no roles are configured in DB yet, fall back to built-in roles so roles remain visible/assignable.
  const availableRoles: { key: string; label: string }[] = (
    configuredRoles.length > 0 ? configuredRoles : fallbackSystemRoles
  ).filter(r => !isSystemAdmin || r.key === UserRole.ADMIN)

  const openAdd = () => {
    setForm(blankForm)
    setSaveError("")
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (u: typeof users[0]) => {
    setForm({ name: u.name, email: u.email, password: "", role: u.role, plant: u.plant ?? "", department: u.department ?? "" })
    setSaveError("")
    setEditId(u.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return
    if (!editId && !form.password.trim()) { setSaveError("Password is required."); return }
    setSaving(true)
    setSaveError("")

    try {
      if (editId) {
        // Edit: update profile only (password change is separate)
        const updates: Record<string, string> = {
          name: form.name, role: form.role,
          plant: form.plant, department: form.department,
        }
        await updateUser(editId, updates as any)
      } else {
        // Create: calls /api/users via AppProvider (Admin SDK — admin stays logged in)
        const result = await addUser({
          name: form.name, email: form.email, password: form.password,
          role: form.role, plant: form.plant, department: form.department,
        })
        if (!result.success) {
          setSaveError(result.error ?? "Failed to create user.")
          setSaving(false)
          return
        }
      }
      setShowForm(false)
    } catch (err: any) {
      setSaveError(err?.message ?? "An error occurred.")
    } finally {
      setSaving(false)
    }
  }

  return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800">System Users</h2>
              <p className="text-xs text-slate-400">{visibleUsers.length} users registered</p>
            </div>
            <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors">
              <Plus size={15} /> Add User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Name", "Email", "Role", "DOJ", "Actions"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
              {visibleUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-800">{u.name}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{u.email}</td>
                    <td className="px-5 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${ROLE_BADGE[u.role] ?? "bg-slate-100 text-slate-600"}`}>
                      {/* Use role label from config if available */}
                      {roles.find(r => r.permissionKey === u.role)?.name
                          ?? ROLE_LABELS[u.role as UserRole]
                          ?? u.role}
                    </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{u.createdAt || "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(u)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors">
                          <Edit2 size={13} />
                        </button>
                        {u.id !== currentUser!.id && u.role !== UserRole.SYSTEM_ADMIN && (
                            <button onClick={() => setConfirmDelete(u.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2">Available Roles</p>
          <div className="flex flex-wrap gap-2">
            {availableRoles.map(r => (
              <span key={r.key} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-blue-200 text-blue-800">
                {r.label}
              </span>
            ))}
          </div>
        </div>

        {/* Add / Edit Modal */}
        {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-black text-slate-800">{editId ? "Edit User" : "Add User"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <Field label="Full Name">
                    <Input value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. Priya Nair" />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="user@company.com" />
                  </Field>
                  {!editId && (
                      <Field label="Password">
                        <Input type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} placeholder="Min 6 characters" />
                      </Field>
                  )}
                  <Field label="Role">
                    <select value={form.role}
                            onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      {availableRoles.map(r => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </Field>
                  {saveError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
                        <AlertCircle size={14} /> {saveError}
                      </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowForm(false)}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold">
                    {saving ? "Saving…" : editId ? "Save Changes" : "Add User"}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200">
                <h3 className="font-black text-slate-800 mb-2">Delete User</h3>
                <p className="text-sm text-slate-600 mb-5">This will permanently remove the user. Are you sure?</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDelete(null)}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={() => { if (confirmDelete) deleteUser(confirmDelete); setConfirmDelete(null) }}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">
                    Delete
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLES TAB
// ═══════════════════════════════════════════════════════════════════════════════

type RoleForm = { name: string; permissionKey: string; description: string; isActive: boolean }

const BLANK_ROLE: RoleForm = {
  name: "", permissionKey: UserRole.STOREKEEPER, description: "", isActive: true,
}

function RolesTab() {
  const { roles, addRole, updateRole, deleteRole } = useApp()

  const [showForm,      setShowForm]      = useState(false)
  const [editId,        setEditId]        = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form,          setForm]          = useState<RoleForm>(BLANK_ROLE)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState("")

  const sorted = [...roles].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const fallbackRoles: RoleConfig[] = Object.values(UserRole)
    .filter(r => r !== UserRole.SYSTEM_ADMIN)
    .map((r, idx) => ({
      id: `builtin-${r}-${idx}`,
      name: ROLE_LABELS[r],
      permissionKey: r,
      description: "Built-in role",
      isActive: true,
      isSystem: true,
    }))

  const isFallbackMode = sorted.length === 0
  const displayedRoles = isFallbackMode ? fallbackRoles : sorted

  const openAdd = () => {
    setForm(BLANK_ROLE)
    setSaveError("")
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (r: RoleConfig) => {
    setForm({ name: r.name, permissionKey: r.permissionKey, description: r.description ?? "", isActive: r.isActive })
    setSaveError("")
    setEditId(r.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.permissionKey) return
    setSaving(true)
    setSaveError("")
    try {
      const isFallbackEdit = !!editId && editId.startsWith("builtin-")
      if (editId && !isFallbackEdit) {
        await updateRole(editId, { name: form.name, permissionKey: form.permissionKey, description: form.description, isActive: form.isActive })
      } else {
        await addRole({ name: form.name, permissionKey: form.permissionKey, description: form.description, isActive: form.isActive, isSystem: false })
      }
      setShowForm(false)
    } catch (err: any) {
      setSaveError(err?.message ?? "Unable to save role. Check permissions.")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (r: RoleConfig) => {
    setSaveError("")
    try {
      if (r.id.startsWith("builtin-")) {
        await addRole({
          name: r.name,
          permissionKey: r.permissionKey,
          description: r.description,
          isActive: !r.isActive,
          isSystem: false,
        })
        return
      }
      await updateRole(r.id, { isActive: !r.isActive })
    } catch (err: any) {
      setSaveError(err?.message ?? "Unable to update role status. Check permissions.")
    }
  }

  return (
      <div className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <ShieldCheck size={16} className="shrink-0 mt-0.5" />
          <p>Manage role names and status here. Use Add to create a role and Edit to update it.</p>
        </div>
        {saveError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {saveError}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800">Role Definitions</h2>
              <p className="text-xs text-slate-400">{displayedRoles.filter(r => r.isActive).length} active · {displayedRoles.length} total</p>
            </div>
            <div />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Role Name</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest"> </th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
              {displayedRoles.map(r => (
                  <tr key={r.id} className={`transition-colors ${r.isActive ? "hover:bg-slate-50/60" : "opacity-50 bg-slate-50/30"}`}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800">{r.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(r)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                                  r.isActive
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}>
                        {r.isActive
                            ? <><CheckCircle size={11} /> Active</>
                            : <><XCircle size={11} /> Inactive</>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {!r.isSystem && (
                            <button onClick={() => setConfirmDelete(r.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add / Edit Modal */}
        {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-black text-slate-800">{editId ? "Edit Role" : "Add Custom Role"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4">
                  <Field label="Role Name">
                    <Input value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. Senior QI – Die Casting" />
                  </Field>
                  <Field label="Permission Level (System Role)">
                    <select value={form.permissionKey}
                            onChange={e => setForm(p => ({ ...p, permissionKey: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      {Object.values(UserRole)
                          .filter(r => r !== UserRole.SYSTEM_ADMIN)
                          .map(r => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">This controls what the user can access in the system.</p>
                  </Field>
                  <Field label="Description">
                <textarea value={form.description}
                          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                          rows={2} placeholder="Brief description of this role's responsibilities…"
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                  </Field>
                  <div className="flex items-center gap-3">
                    <button type="button"
                            onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                            className={`w-10 h-5 rounded-full transition-colors relative ${form.isActive ? "bg-blue-600" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${form.isActive ? "left-5" : "left-0.5"}`} />
                    </button>
                    <span className="text-sm font-medium text-slate-700">Active (visible for user assignment)</span>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowForm(false)}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving || !form.name.trim()}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold">
                    {saving ? "Saving…" : editId ? "Save Changes" : "Add Role"}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200">
                <h3 className="font-black text-slate-800 mb-2">Delete Custom Role</h3>
                <p className="text-sm text-slate-600 mb-5">
                  This will permanently remove this role definition. Users already assigned this role won't be affected
                  — their permission level remains unchanged.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDelete(null)}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={async () => {
                    if (!confirmDelete) return
                    setSaveError("")
                    try {
                      await deleteRole(confirmDelete)
                    } catch (err: any) {
                      setSaveError(err?.message ?? "Unable to delete role. Check permissions.")
                    } finally {
                      setConfirmDelete(null)
                    }
                  }}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold">
                    Delete
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIFTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

type ShiftForm = {
  name: string
  startTime: string
  endTime: string
  breakStart: string
  breakEnd: string
  isActive: boolean
}

function ShiftsTab() {
  const { shifts, updateShift, addShift, deleteShift, confirmShifts } = useApp()

  const [editId,  setEditId]  = useState<string | null>(null)
  const [form,    setForm]    = useState<ShiftForm | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")
  const [success, setSuccess] = useState("")

  // Fall back to defaults only while Firestore has no shift documents yet.
  const displayShifts = (shifts.length > 0 ? [...shifts] : DEFAULT_SHIFT_CONFIGS)
    .sort((a, b) => a.order - b.order)

  const openEdit = (s: ShiftConfig) => {
    setForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      breakStart: s.breakStart ?? s.breaks?.[0]?.startTime ?? "12:00",
      breakEnd: s.breakEnd ?? s.breaks?.[0]?.endTime ?? "12:15",
      isActive: s.isActive,
    })
    setEditId(s.id)
  }

  const handleSave = async () => {
    if (!editId || !form) return
    if (!form.name.trim() || !form.startTime || !form.endTime) return
    setError("")
    setSuccess("")
    const start = timeToMinutes(form.startTime)
    const end = timeToMinutes(form.endTime)
    const breakStart = timeToMinutes(form.breakStart)
    const breakEnd = timeToMinutes(form.breakEnd)
    const rawShiftDuration = (end - start + 24 * 60) % (24 * 60)
    const shiftDuration = rawShiftDuration === 0 ? 24 * 60 : rawShiftDuration
    const breakDuration = (breakEnd - breakStart + 24 * 60) % (24 * 60)
    const isWithinShift = (t: number, s: number, e: number) => (s === e ? true : (s < e ? (t >= s && t <= e) : (t >= s || t <= e)))
    if (!isWithinShift(breakStart, start, end) || !isWithinShift(breakEnd, start, end) || breakDuration <= 0 || breakDuration >= shiftDuration) {
      setError("Break window must be inside shift start/end time."); return
    }
    setSaving(true)
    try {
      await updateShift(editId, {
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        breaks: [{ id: "break_1", startTime: form.breakStart, endTime: form.breakEnd, name: "Break 1" }],
        breakStart: form.breakStart,
        breakEnd: form.breakEnd,
        startNextDay: start > end,
        endNextDay: end < start,
        isActive: form.isActive,
      })
      setEditId(null)
      setForm(null)
      setSuccess("Shift saved. Confirm the full schedule when all shift changes are complete.")
    } catch (err: any) {
      const msg = err?.message ?? "Unable to save shift configuration."
      if (String(msg).toLowerCase().includes("permission")) {
        setError("Permission denied while saving shifts. Please deploy latest firestore.rules and re-login.")
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => { setEditId(null); setForm(null) }

  const createShift = async () => {
    const nextOrder = (displayShifts.at(-1)?.order ?? 0) + 1
    const id = `shift_${Date.now()}`
    setError("")
    setSuccess("")
    try {
      await addShift({
        id,
        name: `Shift ${nextOrder}`,
        order: nextOrder,
        startTime: "09:00",
        endTime: "17:00",
        breaks: [{ id: "break_1", startTime: "13:00", endTime: "13:30", name: "Break 1" }],
        breakStart: "13:00",
        breakEnd: "13:30",
        isActive: true,
        startNextDay: false,
        endNextDay: false,
      })
      setSuccess("Shift added. Edit all shifts, then confirm the full schedule.")
    } catch (err: any) {
      setError(err?.message ?? "Unable to add shift.")
    }
  }

  const confirmSchedule = async () => {
    setError("")
    setSuccess("")
    const activeCount = displayShifts.filter(shift => shift.isActive).length
    const confirmed = window.confirm(
      `Confirm ${activeCount} active shift${activeCount === 1 ? "" : "s"}? This checks that the ordered start/end times cover one continuous 24-hour loop and that breaks stay inside their shifts.`,
    )
    if (!confirmed) return

    try {
      await confirmShifts()
      setSuccess("Shift schedule confirmed: active shifts cover a continuous 24-hour loop and breaks are valid.")
    } catch (err: any) {
      setError(err?.message ?? "Shift schedule confirmation failed.")
    }
  }

  return (
      <div className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <Clock size={16} className="shrink-0 mt-0.5" />
          <p>
            Add any number of shifts, edit their ordered start/end times, then confirm the schedule when the active shifts cover one continuous 24-hour loop.
            Break windows must remain inside their parent shifts.
          </p>
        </div>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle size={16} /> {success}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={confirmSchedule} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Confirm Shift Schedule</button>
          <button onClick={createShift} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold">Add Shift</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayShifts.map(s => (
              <ShiftCard
                  key={s.id}
                  shift={s}
                  isEditing={editId === s.id}
                  form={editId === s.id ? form! : null}
                  saving={saving}
                  onEdit={() => openEdit(s)}
                  onCancel={cancelEdit}
                  onSave={handleSave}
                  onFormChange={setForm}
                  onDelete={async () => {
                    try {
                      setError("")
                      setSuccess("")
                      await deleteShift(s.id)
                      setSuccess("Shift deleted. Confirm the full schedule when all shift changes are complete.")
                    } catch (err: any) {
                      setError(err?.message ?? "Unable to delete shift.")
                    }
                  }}
                  onToggleActive={async () => {
                    try {
                      setError("")
                      setSuccess("")
                      await updateShift(s.id, { isActive: !s.isActive })
                      setSuccess("Shift status updated. Confirm the full schedule when all shift changes are complete.")
                    } catch (err: any) {
                      const msg = err?.message ?? "Unable to update shift status."
                      if (String(msg).toLowerCase().includes("permission")) {
                        setError("Permission denied while updating shifts. Please deploy latest firestore.rules and re-login.")
                      } else {
                        setError(msg)
                      }
                    }
                  }}
              />
          ))}

        </div>
      </div>
  )
}

function ShiftCard({
                     shift, isEditing, form, saving, onEdit, onCancel, onSave, onFormChange, onToggleActive, onDelete,
                   }: {
  shift: ShiftConfig
  isEditing: boolean
  form: ShiftForm | null
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onFormChange: (f: ShiftForm) => void
  onToggleActive: () => void
  onDelete: () => void
}) {
  const accent = shift.order === 1 ? "blue" : "indigo"
  const accentClasses = {
    header: shift.order === 1 ? "bg-blue-600" : "bg-indigo-600",
    badge:  shift.order === 1 ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700",
    ring:   shift.order === 1 ? "focus:ring-blue-400" : "focus:ring-indigo-400",
  }

  return (
      <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${isEditing ? "border-blue-300 shadow-lg shadow-blue-100" : "border-slate-200"} ${!shift.isActive ? "opacity-60" : ""}`}>
        {/* Card header */}
        <div className={`${accentClasses.header} px-5 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-white/80" />
            <span className="text-sm font-black text-white">Shift {shift.order}</span>
          </div>
          <button onClick={onToggleActive}
                  className={`text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${shift.isActive ? "bg-white/20 text-white hover:bg-white/30" : "bg-black/20 text-white/60 hover:bg-black/30"}`}>
            {shift.isActive ? "Active" : "Inactive"}
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isEditing && form ? (
              /* ─── Edit mode ─────────────────────────────────────────────── */
              <>
                <Field label="Shift Name">
                  <Input value={form.name} onChange={v => onFormChange({ ...form, name: v })} placeholder="e.g. Morning Shift" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Time">
                    <TimeInput value={form.startTime} onChange={v => onFormChange({ ...form, startTime: v })} />
                  </Field>
                  <Field label="End Time">
                    <TimeInput value={form.endTime} onChange={v => onFormChange({ ...form, endTime: v })} />
                  </Field>
                </div>

                <div className="border-t border-dashed border-slate-200 pt-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Coffee size={13} className="text-slate-400" />
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Break Window</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Break Start">
                      <TimeInput value={form.breakStart} onChange={v => onFormChange({ ...form, breakStart: v })} />
                    </Field>
                    <Field label="Break End">
                      <TimeInput value={form.breakEnd} onChange={v => onFormChange({ ...form, breakEnd: v })} />
                    </Field>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={onCancel}
                          className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={onSave} disabled={saving}
                          className={`flex-1 px-4 py-2 rounded-xl ${accentClasses.header} hover:opacity-90 disabled:opacity-60 text-white text-sm font-bold`}>
                    {saving ? "Saving…" : "Save Shift"}
                  </button>
                </div>
              </>
          ) : (
              /* ─── View mode ─────────────────────────────────────────────── */
              <>
                <div>
                  <p className="text-lg font-black text-slate-900">{shift.name}</p>
                  <p className={`inline-flex items-center gap-1 text-xs font-bold mt-1 px-2.5 py-0.5 rounded-full ${accentClasses.badge}`}>
                    <Clock size={10} /> {shift.startTime} – {shift.endTime}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Coffee size={12} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Break</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {shift.breakStart ?? shift.breaks?.[0]?.startTime ?? "--:--"} – {shift.breakEnd ?? shift.breaks?.[0]?.endTime ?? "--:--"}
                    <span className="ml-2 text-xs text-slate-400">
                  ({calcBreakMinutes(shift.breakStart ?? shift.breaks?.[0]?.startTime ?? "00:00", shift.breakEnd ?? shift.breaks?.[0]?.endTime ?? "00:00")} min)
                </span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Total</p>
                    <p className="text-sm font-black text-slate-700">{calcDurationHours(shift.startTime, shift.endTime)}h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Break</p>
                    <p className="text-sm font-black text-slate-700">{calcBreakMinutes(shift.breakStart ?? shift.breaks?.[0]?.startTime ?? "00:00", shift.breakEnd ?? shift.breaks?.[0]?.endTime ?? "00:00")}m</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium">Net</p>
                    <p className="text-sm font-black text-slate-700">{calcNetHours(shift)}h</p>
                  </div>
                </div>

                <button onClick={onEdit}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
                  <Edit2 size={13} /> Edit Shift
                </button>
                <button onClick={onDelete} className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors">
                  <Trash2 size={13} /> Delete Shift
                </button>
              </>
          )}
        </div>
      </div>
  )
}

// ─── Shift calc helpers ───────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function calcDurationHours(start: string, end: string): string {
  let mins = timeToMinutes(end) - timeToMinutes(start)
  if (mins < 0) mins += 24 * 60 // overnight
  return (mins / 60).toFixed(1).replace(".0", "")
}

function calcBreakMinutes(start: string, end: string): number {
  let mins = timeToMinutes(end) - timeToMinutes(start)
  if (mins < 0) mins += 24 * 60
  return mins
}

function calcNetHours(s: ShiftConfig): string {
  let total = timeToMinutes(s.endTime) - timeToMinutes(s.startTime)
  if (total < 0) total += 24 * 60
  const breakMins = calcBreakMinutes(s.breakStart ?? s.breaks?.[0]?.startTime ?? "00:00", s.breakEnd ?? s.breaks?.[0]?.endTime ?? "00:00")
  const net = (total - breakMins) / 60
  return net.toFixed(1).replace(".0", "")
}

export default ConfigPageContent