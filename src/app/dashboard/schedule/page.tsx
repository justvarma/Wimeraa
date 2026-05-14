"use client"

import { useState, useRef, useMemo } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, type MonthlySchedule } from "@/lib/store"
import { CalendarDays, Plus, X, Edit2, Trash2, Search, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react"
import * as XLSX from "xlsx"

const emptyForm = {
  serialNumber: "", partId: "", partName: "", requiredQuantity: "", date: new Date().toISOString().split("T")[0]
}

function mapExcelRow(row: Record<string, unknown>, index: number) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_]/g, "") === k.toLowerCase().replace(/[\s_]/g, ""))
      if (found && row[found] !== undefined && row[found] !== "") return String(row[found])
    }
    return ""
  }
  return {
    serialNumber: Number(get("serialnumber", "serial", "sno", "no")) || index + 1,
    partId: get("partid", "part", "partno", "id") || `PT-IMPORT-${String(index + 1).padStart(4, "0")}`,
    partName: get("partname", "name", "component", "description") || "",
    requiredQuantity: Number(get("requiredquantity", "quantity", "qty", "nos")) || 0,
    date: get("date", "month", "scheduledate") || new Date().toISOString().split("T")[0],
  }
}

export default function SchedulePage() {
  const { currentUser, schedules, workOrders, addSchedule, updateSchedule, deleteSchedule } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<MonthlySchedule | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [search, setSearch] = useState("")
  const [monthFilter, setMonthFilter] = useState("")
  const [importing, setImporting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const role = currentUser?.role as UserRole
  const isAdmin       = role === UserRole.ADMIN
  const isStorekeeper = role === UserRole.STOREKEEPER
  const isPDC         = [UserRole.PTC_MANAGER, UserRole.PTC_DIE_CASTING, UserRole.PTC_COATING, UserRole.PTC_CNC_VMC].includes(role)
  const isFQIOrQI     = role === UserRole.FQI || role === UserRole.QUALITY_INSPECTOR
  // Admin: full manage. PDC + FQI/QI: view-only. Storekeeper: removed per spec.
  const canManage  = isAdmin
  const isViewOnly = isPDC || isFQIOrQI

  const months = [...new Set(schedules.map(s => s.date.slice(0, 7)))].sort().reverse()

  const visible = schedules.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = s.partId.toLowerCase().includes(q) || s.partName.toLowerCase().includes(q)
    const matchMonth = !monthFilter || s.date.startsWith(monthFilter)
    return matchSearch && matchMonth
  })

  const totalRequired = visible.reduce((sum, s) => sum + s.requiredQuantity, 0)
  const scheduleProgress = (scheduleId: string) => {
    const rows = workOrders.filter(wo => wo.masterId === scheduleId)
    const produced = rows.reduce((sum, wo) => sum + (wo.partsCompleted || 0), 0)
    const latest = rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0]
    return { produced, step: latest?.process ? latest.process.replace("_", " ") : "not_started" }
  }

  const openAdd = () => {
    setEditItem(null)
    setForm({ ...emptyForm, serialNumber: String(schedules.length + 1), partId: `PT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(schedules.length+1).padStart(3,"0")}` })
    setShowForm(true)
  }

  const openEdit = (item: MonthlySchedule) => {
    setEditItem(item)
    setForm({
      serialNumber: String(item.serialNumber),
      partId: item.partId,
      partName: item.partName,
      requiredQuantity: String(item.requiredQuantity),
      date: item.date,
    })
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const currentMonth = new Date().toISOString().slice(0, 7)
    if (!editItem && form.date.slice(0, 7) < currentMonth) {
      alert("Cannot add schedule for past months.")
      return
    }
    const payload = {
      serialNumber: editItem ? Number(form.serialNumber) : schedules.length + 1,
      partId: form.partId,
      partName: form.partName,
      requiredQuantity: Number(form.requiredQuantity),
      date: form.date,
      submittedById: currentUser!.id,
    }
    if (editItem) {
      updateSchedule(editItem.id, payload)
    } else {
      addSchedule(payload)
    }
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    const hasAssignedWO = workOrders.some(wo => wo.masterId === id)
    if (hasAssignedWO) {
      alert("This schedule entry is already assigned to a Work Order and cannot be deleted.")
      return
    }
    if (!confirm("Delete this schedule entry?")) return
    deleteSchedule(id)
  }

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setUploadStatus(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
        if (rows.length === 0) { setUploadStatus({ type: "error", message: "The Excel file is empty." }); setImporting(false); return }
        let added = 0
        for (let i = 0; i < rows.length; i++) {
          const mapped = mapExcelRow(rows[i], i)
          if (!mapped.partName) continue
          addSchedule({ ...mapped, submittedById: currentUser!.id })
          added++
        }
        setUploadStatus({ type: "success", message: `Imported ${added} schedule entr${added !== 1 ? "ies" : "y"}.` })
      } catch {
        setUploadStatus({ type: "error", message: "Could not read the file." })
      } finally {
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }
    reader.readAsBinaryString(file)
  }

  const groupedVisible = useMemo(() => {
    const groups: Record<string, MonthlySchedule[]> = {}
    visible.forEach(v => {
      const key = v.date.slice(0, 7)
      groups[key] = [...(groups[key] || []), v]
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [visible])

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Monthly Production Schedule</h1>
          <p className="text-slate-500 mt-1">Customer schedule from Royal Enfield — parts & quantities</p>
        </div>
        <div className="flex gap-3 items-center">
          {isViewOnly && (
            <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest">
              View Only
            </span>
          )}
          {canManage && (
            <>
              <button onClick={() => { setShowUpload(v => !v); setUploadStatus(null) }}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-all">
                <FileSpreadsheet size={17} className="text-emerald-600" /> Upload Excel
              </button>
              <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all">
                <Plus size={18} /> Add Entry
              </button>
            </>
          )}
        </div>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Parts (filtered)</p>
          <p className="text-3xl font-black text-slate-900">{visible.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Required Qty (Nos)</p>
          <p className="text-3xl font-black text-slate-900">{totalRequired.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Schedule Months</p>
          <p className="text-3xl font-black text-slate-900">{months.length}</p>
        </div>
      </div>

      {/* Excel upload */}
      {showUpload && canManage && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-1">Bulk Import Schedule via Excel</h2>
          <p className="text-sm text-slate-500 mb-4">
            Recognised columns:{" "}
            {["SerialNumber","PartId","PartName","RequiredQuantity","Date"].map(c => (
              <span key={c} className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded mr-1">{c}</span>
            ))}
          </p>
          <label className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all ${importing ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/40"}`}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={importing} />
            <div className={`p-4 rounded-full ${importing ? "bg-blue-100" : "bg-slate-100"}`}>
              {importing ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /> : <Upload size={28} className="text-slate-400" />}
            </div>
            <p className="font-bold text-slate-700">{importing ? "Processing…" : "Click to choose file or drag & drop"}</p>
          </label>
          {uploadStatus && (
            <div className={`mt-4 flex items-start gap-3 p-4 rounded-xl border text-sm font-medium ${uploadStatus.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              {uploadStatus.type === "success" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
              {uploadStatus.message}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search part ID or name…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-900 w-64" />
        </div>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All Months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table month-wise (click to expand) */}
      <div className="space-y-3">
        {groupedVisible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <CalendarDays size={40} className="mx-auto mb-2 text-slate-200" />No schedule entries found
          </div>
        ) : groupedVisible.map(([month, entries]) => (
          <details key={month} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" open>
            <summary className="px-5 py-4 bg-slate-50 border-b border-slate-200 cursor-pointer font-black text-slate-800">
              {month} <span className="text-xs text-slate-500 font-semibold">({entries.length} entries)</span>
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-4">S.No</th>
                  <th className="px-5 py-4">Part ID</th>
                  <th className="px-5 py-4">Part Name</th>
                  <th className="px-5 py-4">Required Qty (Nos)</th>
                  <th className="px-5 py-4">End Date</th>
                  <th className="px-5 py-4">Progress</th>
                  {canManage && <th className="px-5 py-4">Actions</th>}
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
              {entries.map(item => { const p = scheduleProgress(item.id); const isAssignedToWO = workOrders.some(wo => wo.masterId === item.id); return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-slate-500">{item.serialNumber}</td>
                  <td className="px-5 py-4 text-sm font-mono text-indigo-600 font-bold">{item.partId}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-800">{item.partName}</td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-900">{item.requiredQuantity.toLocaleString()}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{item.date.slice(0, 7)}</td>
                  <td className="px-5 py-4 text-sm">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-slate-700 font-semibold">Produced: {p.produced}/{item.requiredQuantity}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-600 capitalize">Stage: {p.step.replace("_", " ")}</span>
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <button disabled={isAssignedToWO} onClick={() => openEdit(item)} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed" title={isAssignedToWO ? "Assigned to WO — cannot edit" : ""}>
                          <Edit2 size={13} /> Edit
                        </button>
                        <button disabled={isAssignedToWO} onClick={() => handleDelete(item.id)} className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed" title={isAssignedToWO ? "Assigned to WO — cannot delete" : ""}>
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )})}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-black text-slate-900">{editItem ? "Edit Schedule Entry" : "Add Schedule Entry"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Schedule Month No (Auto)</label>
                  <input type="number" required min="1" value={form.serialNumber} readOnly
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Part ID *</label>
                  <input required value={form.partId} readOnly={true} onChange={e => setForm(p => ({ ...p, partId: e.target.value }))}
                    placeholder="e.g. RE-PT-0021"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Part Name *</label>
                <input required value={form.partName} onChange={e => setForm(p => ({ ...p, partName: e.target.value }))}
                  placeholder="e.g. Cylinder Head Cover — RE Meteor 350"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Required Quantity (Nos) *</label>
                  <input type="number" required min="1" value={form.requiredQuantity} onChange={e => setForm(p => ({ ...p, requiredQuantity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Date *</label>
                  <input type="date" required value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">{editItem ? "Update" : "Add Entry"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
