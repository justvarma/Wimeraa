"use client"

import { useState } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, ROLE_LABELS, type User } from "@/lib/store"
import { Users, Plus, X, Edit2, Trash2, AlertCircle } from "lucide-react"

const PLANTS      = ["Plant A", "Plant B", "Plant C"]
const DEPARTMENTS = ["Management", "Stores", "Quality", "Production", "Die Casting", "Coating", "CNC Machining", "Engineering", "HR"]

const blankForm = {
  name: "", email: "", password: "",
  role: UserRole.STOREKEEPER, plant: "Plant A", department: "Stores",
}

export default function UsersPage() {
  const { currentUser, users, addUser, updateUser, deleteUser, roles } = useApp()

  const [showForm,      setShowForm]      = useState(false)
  const [editItem,      setEditItem]      = useState<User | null>(null)
  const [form,          setForm]          = useState({ ...blankForm })
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState("")
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const isAdmin = currentUser?.role === UserRole.ADMIN
  if (!isAdmin) return <div className="p-8 text-slate-500">Access restricted to Admin.</div>

  // Roles available for user assignment — active roles only, no SYSTEM_ADMIN
  const availableRoles: { key: string; label: string }[] =
      roles.filter(r => r.isActive && r.permissionKey !== UserRole.SYSTEM_ADMIN).length > 0
          ? roles
              .filter(r => r.isActive && r.permissionKey !== UserRole.SYSTEM_ADMIN)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(r => ({ key: r.permissionKey, label: r.name }))
          : Object.values(UserRole)
              .filter(r => r !== UserRole.SYSTEM_ADMIN)
              .map(r => ({ key: r, label: ROLE_LABELS[r] }))

  const openAdd = () => {
    setEditItem(null)
    setForm({ ...blankForm })
    setSaveError("")
    setShowForm(true)
  }

  const openEdit = (u: User) => {
    setEditItem(u)
    setForm({
      name:       u.name,
      email:      u.email,
      password:   "",           // never pre-fill password
      role:       u.role,
      plant:      u.plant      || "Plant A",
      department: u.department || "Stores",
    })
    setSaveError("")
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setSaveError("Name and email are required.")
      return
    }
    if (!editItem && !form.password.trim()) {
      setSaveError("Password is required for new users.")
      return
    }

    setSaving(true)
    setSaveError("")

    try {
      if (editItem) {
        // Update profile only — password change is a separate admin flow
        await updateUser(editItem.id, {
          name:       form.name,
          role:       form.role as UserRole,
          plant:      form.plant,
          department: form.department,
        })
        setShowForm(false)
      } else {
        const result = await addUser({
          name:       form.name,
          email:      form.email,
          password:   form.password,
          role:       form.role as UserRole,
          plant:      form.plant,
          department: form.department,
        })
        if (!result.success) {
          setSaveError(result.error ?? "Failed to create user.")
          return
        }
        setShowForm(false)
      }
    } catch (err: any) {
      setSaveError(err?.message ?? "An error occurred.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) { alert("Cannot delete yourself"); return }
    await deleteUser(id)
    setConfirmDelete(null)
  }

  const ROLE_BADGE: Record<string, string> = {
    admin:             "bg-red-100 text-red-700",
    system_admin:      "bg-violet-100 text-violet-700",
    quality_inspector: "bg-purple-100 text-purple-700",
    fqi:               "bg-pink-100 text-pink-700",
    ptc_manager:       "bg-indigo-100 text-indigo-700",
    ptc_die_casting:   "bg-orange-100 text-orange-700",
    ptc_coating:       "bg-purple-100 text-purple-700",
    ptc_cnc_vmc:       "bg-cyan-100 text-cyan-700",
    qi_die_casting:    "bg-orange-100 text-orange-600",
    qi_coating:        "bg-purple-100 text-purple-600",
    qi_machining:      "bg-cyan-100 text-cyan-600",
    inventory_qi:      "bg-lime-100 text-lime-700",
    storekeeper:       "bg-emerald-100 text-emerald-700",
  }

  return (
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900">User Management</h1>
            <p className="text-slate-500 mt-1">Manage system users and role assignments</p>
          </div>
          <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all"
          >
            <Plus size={18} /> Add User
          </button>
        </header>

        {/* Role summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.values(UserRole).map(role => {
            const count = users.filter(u => u.role === role).length
            return (
                <div key={role} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-center">
                  <p className="text-2xl font-black text-slate-900">{count}</p>
                  <p className="text-xs font-bold text-slate-400 mt-1">{ROLE_LABELS[role]}</p>
                </div>
            )
          })}
        </div>

        {/* Users table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Plant</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">{user.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                    <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${ROLE_BADGE[user.role] ?? "bg-slate-100 text-slate-600"}`}>
                      {/* Prefer label from loaded role config, fall back to enum label */}
                      {roles.find(r => r.permissionKey === user.role)?.name
                          ?? ROLE_LABELS[user.role as UserRole]
                          ?? user.role}
                    </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.plant || "—"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.department || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button
                            onClick={() => openEdit(user)}
                            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        {user.id !== currentUser?.id && user.role !== UserRole.SYSTEM_ADMIN && (
                            <button
                                onClick={() => setConfirmDelete(user.id)}
                                className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
              {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">No users found.</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add / Edit Modal */}
        {showForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                  <h2 className="text-xl font-black text-slate-900">{editItem ? "Edit User" : "Add User"}</h2>
                  <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={22} />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Priya Nair"
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Email — read-only when editing */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                    <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="user@company.com"
                        disabled={!!editItem}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    {editItem && (
                        <p className="text-xs text-slate-400 mt-1">Email cannot be changed after creation.</p>
                    )}
                  </div>

                  {/* Password — only for new users */}
                  {!editItem && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                            placeholder="Min 6 characters"
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                  )}

                  {/* Role */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                    <select
                        value={form.role}
                        onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      {availableRoles.map(r => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Plant + Department */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Plant</label>
                      <select
                          value={form.plant}
                          onChange={e => setForm(p => ({ ...p, plant: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {PLANTS.map(pl => <option key={pl}>{pl}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
                      <select
                          value={form.department}
                          onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {saveError && (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
                        <AlertCircle size={14} /> {saveError}
                      </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                        onClick={() => setShowForm(false)}
                        className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
                    >
                      {saving ? "Saving…" : editItem ? "Save Changes" : "Create User"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200">
                <h3 className="font-black text-slate-800 mb-2">Delete User</h3>
                <p className="text-sm text-slate-600 mb-5">
                  This will permanently remove the user account. Are you sure?
                </p>
                <div className="flex gap-3">
                  <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                      onClick={() => handleDelete(confirmDelete)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  )
}