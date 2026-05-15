"use client"

import { useState, useRef } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, type RawMaterial } from "@/lib/store"
import { Package, Plus, X, Edit2, Search, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react"
import * as XLSX from "xlsx"

const GRADES = ["A", "B", "C", "D", "E", "Other"]

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
  }
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${styles[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  )
}

function mapExcelRow(row: Record<string, unknown>, index: number, submittedBy: string) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_]/g, "") === k.toLowerCase().replace(/[\s_]/g, ""))
      if (found && row[found] !== undefined && row[found] !== "") return String(row[found])
    }
    return ""
  }
  return {
    rawMaterialId: get("rawmaterialid", "materialid", "id") || `RM-IMPORT-${Date.now()}-${index}`,
    material: get("material", "metal") || "Aluminium",
    rawMaterialGrade: get("rawmaterialgrade", "grade") || "A",
    receivedQuantity: Number(get("receivedquantity", "quantity", "qty")) || 0,
    date: get("date", "receiveddate", "receivedon") || new Date().toISOString().split("T")[0],
    receivedBy: get("receivedby", "receiver") || submittedBy,
    batchNumber: get("batchnumber", "batch", "batchno", "batchid") || `BATCH-${Date.now()}-${index}`,
    numberOfRequiredComponents: Number(get("numberofrequiredcomponents", "components", "noofcomponents")) || 0,
    weightPerComponent: Number(get("weightpercomponent", "weightperunit", "weight")) || 0,
    notes: get("notes", "remarks"),
  }
}

const emptyForm = {
  rawMaterialId: "", material: "Aluminium", rawMaterialGrade: "A", receivedQuantity: "",
  date: new Date().toISOString().split("T")[0], receivedBy: "",
  batchNumber: "", numberOfRequiredComponents: "", weightPerComponent: "", notes: ""
}

export default function InventoryPage() {
  const { currentUser, materials, materialMasters, processRecords, workOrders, addMaterial, updateMaterial, users } = useApp()
  const storekeepers = users.filter(u => u.role === "storekeeper" || u.role === "admin")
  const [showForm, setShowForm] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [editItem, setEditItem] = useState<RawMaterial | null>(null)
  const [search, setSearch] = useState("")
  const [gradeFilter, setGradeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [selectedBatchByGroup, setSelectedBatchByGroup] = useState<Record<string, string>>({})
  const [showScrapDetails, setShowScrapDetails] = useState(false)
  const [showOutsourceDetails, setShowOutsourceDetails] = useState(false)

  const role = currentUser?.role as UserRole
  const isAdmin       = role === UserRole.ADMIN
  const isQI          = role === UserRole.QUALITY_INSPECTOR
  const isStorekeeper = role === UserRole.STOREKEEPER
  const isPDC         = [UserRole.PTC_MANAGER, UserRole.PTC_DIE_CASTING, UserRole.PTC_COATING, UserRole.PTC_CNC_VMC].includes(role)

  // Storekeeper: can add/edit/delete their own entries
  const canAdd     = isStorekeeper
  // Admin: approve/reject view only (no add/edit). QI legacy also can approve.
  const canApprove = isAdmin || isQI
  // PDC roles: read-only, no add, no approve
  const isViewOnly = isPDC

  const masterItems = materialMasters.map(m => ({ rawMaterialId: `${m.material.toUpperCase().slice(0,3)}-${m.grade}`, material: m.material, rawMaterialGrade: m.grade }))
  const batchesByMaster = new Map<string, string[]>()
  for (const m of materials) {
    const key = `${m.material || "Aluminium"}__${m.rawMaterialGrade}`
    const arr = batchesByMaster.get(key) ?? []
    if (!arr.includes(m.batchNumber)) arr.push(m.batchNumber)
    batchesByMaster.set(key, arr)
  }

  const visible = materials.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = m.rawMaterialId.toLowerCase().includes(q) || m.batchNumber.toLowerCase().includes(q) || m.rawMaterialGrade.toLowerCase().includes(q) || (m.material || "").toLowerCase().includes(q)
    const matchGrade  = gradeFilter === "all" || m.rawMaterialGrade === gradeFilter
    const matchStatus = statusFilter === "all" || m.status === statusFilter
    // Admin, QI, and PDC see all records; storekeeper sees only own submissions
    const matchUser   = isAdmin || isQI || isPDC ? true : m.submittedById === currentUser?.id
    return matchSearch && matchGrade && matchStatus && matchUser
  })

  const groupedVisibleMap = new Map<string, RawMaterial[]>()
  for (const item of visible) {
    const key = `${item.rawMaterialId}__${item.material || ""}__${item.rawMaterialGrade}`
    groupedVisibleMap.set(key, [...(groupedVisibleMap.get(key) || []), item])
  }
  const groupedVisible = Array.from(groupedVisibleMap.entries())

  // Inventory summary per grade (approved stock only)
  // FIX §4.3: availableKg = receivedQuantity − usedQuantity (not just total received)

  const materialGradeGroups = Array.from(new Map(materials
    .filter(m => m.status === "approved")
    .map(m => [`${m.material || "Unknown"}__${m.rawMaterialGrade}`, { material: m.material || "Unknown", grade: m.rawMaterialGrade, entries: [] as RawMaterial[] }]))
    .values())
  materialGradeGroups.forEach(group => {
    group.entries = materials.filter(m => m.status === "approved" && (m.material || "Unknown") === group.material && m.rawMaterialGrade === group.grade)
  })

  const gradeSummary = GRADES.map(g => {
    const items = materials.filter(m => m.rawMaterialGrade === g && m.status === "approved")
    const totalReceivedKg  = items.reduce((s, m) => s + m.receivedQuantity, 0)
    const totalUsedKg      = items.reduce((s, m) => s + (m.usedQuantity || 0), 0)
    const availableKg      = totalReceivedKg - totalUsedKg
    const totalComponents  = items.reduce((s, m) => s + m.numberOfRequiredComponents, 0)
    return { grade: g, totalReceivedKg, totalUsedKg, availableKg, totalComponents, count: items.length }
  }).filter(s => s.count > 0)
  const totalScrapKg = processRecords.reduce((sum, r) => sum + r.scrapWeightKg, 0)
  const totalWasteKg = processRecords.reduce((sum, r) => sum + r.materialWasteKg, 0)
  const outsourcedWOs = workOrders.filter(wo => wo.isExternal)
  const totalOutsourcedMaterialKg = outsourcedWOs.reduce((sum, wo) => sum + (wo.requiredQuantityKg || 0), 0)

  const openAdd = () => {
    setEditItem(null)
    const first = masterItems[0]
    setForm({ ...emptyForm, receivedBy: currentUser?.name || "", rawMaterialId: first?.rawMaterialId || "", material: first?.material || "", rawMaterialGrade: first?.rawMaterialGrade || "" })
    setShowForm(true)
  }

  const openEdit = (item: RawMaterial) => {
    if (item.status === "approved") return
    setEditItem(item)
    setForm({
      rawMaterialId: item.rawMaterialId,
      material: item.material || "Aluminium",
      rawMaterialGrade: item.rawMaterialGrade,
      receivedQuantity: String(item.receivedQuantity),
      date: item.date,
      receivedBy: item.receivedBy,
      batchNumber: item.batchNumber,
      numberOfRequiredComponents: String(item.numberOfRequiredComponents),
      weightPerComponent: String(item.weightPerComponent),
      notes: item.notes || ""
    })
    setShowForm(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      rawMaterialId: form.rawMaterialId,
      material: form.material,
      rawMaterialGrade: form.rawMaterialGrade,
      receivedQuantity: Number(form.receivedQuantity),
      date: form.date,
      receivedBy: form.receivedBy,
      batchNumber: form.batchNumber,
      numberOfRequiredComponents: Number(form.numberOfRequiredComponents),
      weightPerComponent: Number(form.weightPerComponent),
      notes: form.notes,
      status: "pending" as const,
      submittedById: currentUser!.id,
    }
    if (!masterItems.some(item => item.material === payload.material && item.rawMaterialGrade === payload.rawMaterialGrade)) {
      alert("Selected material/grade is not in Material Master.")
      return
    }
    if (editItem) {
      updateMaterial(editItem.id, { ...payload, approvedBy: null, rejectedReason: null })
    } else {
      addMaterial({ ...payload, usedQuantity: 0, approvedBy: null, rejectedReason: null })
    }
    setShowForm(false)
  }

  const handleApprove = (id: string) => {
    updateMaterial(id, { status: "approved", approvedBy: currentUser!.name, rejectedReason: null })
  }

  const handleReject = (id: string) => {
    const reason = prompt("Enter rejection reason:")
    if (!reason) return
    updateMaterial(id, { status: "rejected", rejectedReason: reason, approvedBy: null })
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
          const mapped = mapExcelRow(rows[i], i, currentUser!.name)
          if (!mapped.rawMaterialId) continue
          addMaterial({ ...mapped, usedQuantity: 0, status: "pending", submittedById: currentUser!.id })
          added++
        }
        setUploadStatus({ type: "success", message: `Imported ${added} material${added !== 1 ? "s" : ""} — all Pending for QI approval.` })
      } catch {
        setUploadStatus({ type: "error", message: "Could not read the file. Ensure it's a valid .xlsx or .xls file." })
      } finally {
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div className="space-y-8">

      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Raw Material Inventory</h1>
          <p className="text-slate-600 mt-1">
            {isAdmin     ? "Review and approve or reject incoming material submissions" :
             isPDC       ? "View-only — stock levels for production planning" :
             isStorekeeper ? "Manage incoming raw materials — add, edit, and track stock" :
             "Grade-wise raw material tracking (quantity in KG)"}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          {isViewOnly && (
            <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest">
              View Only
            </span>
          )}
          {isAdmin && (
            <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black text-amber-700 uppercase tracking-widest">
              Approval Mode
            </span>
          )}
          {canAdd && (
            <>
              <button onClick={() => { setShowUpload(v => !v); setUploadStatus(null) }}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm transition-all">
                <FileSpreadsheet size={17} className="text-emerald-600" /> Upload Excel
              </button>
              <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all">
                <Plus size={18} /> Add Raw Material
              </button>
            </>
          )}
        </div>
      </header>

      {/* Grade summary cards */}
      {gradeSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {gradeSummary.map(s => (
            <div key={s.grade} className={`relative group bg-white rounded-2xl border p-4 shadow-sm ${s.availableKg <= 0 ? "border-red-200 bg-red-50/30" : "border-slate-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Grade {s.grade}</span>
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">{s.count}</span>
              </div>
              <p className={`text-2xl font-black ${s.availableKg <= 0 ? "text-red-600" : "text-slate-900"}`}>
                {s.availableKg.toFixed(1)} <span className="text-sm font-bold text-slate-400">KG avail</span>
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                <span>Rcvd: <span className="font-bold text-slate-700">{s.totalReceivedKg.toFixed(1)}</span></span>
                <span className="text-slate-300">|</span>
                <span>Used: <span className="font-bold text-slate-700">{s.totalUsedKg.toFixed(1)}</span></span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{s.totalComponents.toLocaleString()} components</p>
              {s.availableKg <= 0 && <p className="text-[10px] font-black text-red-600 mt-1 uppercase tracking-wider">⚠ Out of stock</p>}

              {/* Hover panel: material master + approved/assigned details */}
              <div className="hidden group-hover:block absolute z-30 top-full left-0 mt-2 w-[520px] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl p-3">
                <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Configured Materials — Grade {s.grade}</p>
                <table className="w-full text-xs">
                  <thead>
                  <tr className="bg-slate-50">
                    {["Material", "Grade", "Approved KG", "Assigned KG"].map(h => <th key={h} className="text-left px-2 py-1.5 text-slate-600">{h}</th>)}
                  </tr>
                  </thead>
                  <tbody>
                  {materialMasters.filter(mm => mm.grade === s.grade).length === 0 ? (
                    <tr><td colSpan={4} className="px-2 py-2 text-slate-400">No configured material for this grade.</td></tr>
                  ) : materialMasters.filter(mm => mm.grade === s.grade).map(mm => {
                    const relevant = materials.filter(m => m.status === "approved" && (m.material || "").toLowerCase() === mm.material.toLowerCase() && m.rawMaterialGrade === mm.grade)
                    const approvedKg = relevant.reduce((sum, m) => sum + m.receivedQuantity, 0)
                    const assignedKg = relevant.reduce((sum, m) => sum + (m.usedQuantity || 0), 0)
                    return (
                      <tr key={mm.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-800">{mm.material}</td>
                        <td className="px-2 py-1.5 text-slate-700">{mm.grade}</td>
                        <td className="px-2 py-1.5 text-emerald-700 font-semibold">{approvedKg.toFixed(1)}</td>
                        <td className="px-2 py-1.5 text-indigo-700 font-semibold">{assignedKg.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <button onClick={() => setShowScrapDetails(true)} className="relative group text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-rose-200">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Scrap</p>
            <p className="text-2xl font-black text-rose-700">{totalScrapKg.toFixed(1)} <span className="text-sm text-slate-400">KG</span></p>
            <p className="text-xs text-slate-500 mt-1">Click for detailed breakdown</p>
            <div className="hidden group-hover:block absolute z-30 top-full left-0 mt-2 w-[520px] max-w-[90vw] bg-white border border-slate-300 rounded-xl shadow-xl p-3">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Scrap Hover Summary</p>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50">{["Material","Grade","Total Waste KG"].map(h => <th key={h} className="text-left px-2 py-1.5 text-slate-800 font-bold">{h}</th>)}</tr></thead>
                <tbody>
                {processRecords.length === 0 ? <tr><td colSpan={3} className="px-2 py-2 text-slate-400">No scrap/waste entries yet.</td></tr> :
                  Array.from(new Map(processRecords.map(r => {
                    const wo = workOrders.find(w => w.id === r.workOrderId)
                    const mat = materials.find(m => m.id === wo?.rawMaterialId)
                    const material = mat?.material || "—"
                    const grade = mat?.rawMaterialGrade || "—"
                    return [`${material}__${grade}`, { material, grade, wasteKg: 0 }]
                  })).values()).map(group => {
                    const wasteKg = processRecords.reduce((sum, r) => {
                      const wo = workOrders.find(w => w.id === r.workOrderId)
                      const mat = materials.find(m => m.id === wo?.rawMaterialId)
                      return ((mat?.material || "—") === group.material && (mat?.rawMaterialGrade || "—") === group.grade)
                        ? sum + r.materialWasteKg
                        : sum
                    }, 0)
                    return <tr key={`${group.material}-${group.grade}`} className="border-t border-slate-100"><td className="px-2 py-1.5 text-slate-900 font-medium">{group.material}</td><td className="px-2 py-1.5 text-slate-800">{group.grade}</td><td className="px-2 py-1.5 font-semibold text-rose-700">{wasteKg.toFixed(2)}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </button>
          <button onClick={() => setShowOutsourceDetails(true)} className="relative group text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-violet-200">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Outsourced Material</p>
            <p className="text-2xl font-black text-violet-700">{totalOutsourcedMaterialKg.toFixed(1)} <span className="text-sm text-slate-400">KG</span></p>
            <p className="text-xs text-slate-500 mt-1">Click for outsourced WO details</p>
            <div className="hidden group-hover:block absolute z-30 top-full left-0 mt-2 w-[520px] max-w-[90vw] bg-white border border-slate-300 rounded-xl shadow-xl p-3">
              <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Outsourced Material Summary</p>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50">{["Material","Grade","Total Qty KG"].map(h => <th key={h} className="text-left px-2 py-1.5 text-slate-800 font-bold">{h}</th>)}</tr></thead>
                <tbody>
                {outsourcedWOs.length === 0 ? <tr><td colSpan={3} className="px-2 py-2 text-slate-400">No outsourced work orders.</td></tr> :
                  Array.from(new Map(outsourcedWOs.map(wo => {
                    const mat = materials.find(m => m.id === wo.rawMaterialId)
                    const material = mat?.material || "—"
                    const grade = wo.rawMaterialGrade || mat?.rawMaterialGrade || "—"
                    return [`${material}__${grade}`, { material, grade }]
                  })).values()).map(group => {
                    const totalQty = outsourcedWOs
                      .filter(wo => {
                        const mat = materials.find(m => m.id === wo.rawMaterialId)
                        const material = mat?.material || "—"
                        const grade = wo.rawMaterialGrade || mat?.rawMaterialGrade || "—"
                        return material === group.material && grade === group.grade
                      })
                      .reduce((sum, wo) => sum + (wo.requiredQuantityKg || 0), 0)
                    return <tr key={`${group.material}-${group.grade}`} className="border-t border-slate-100"><td className="px-2 py-1.5 text-slate-900 font-medium">{group.material}</td><td className="px-2 py-1.5 text-slate-800">{group.grade}</td><td className="px-2 py-1.5 font-semibold text-violet-700">{totalQty.toFixed(2)}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </button>
        </div>
      )}

            {/* Excel upload panel */}
      {showUpload && canAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-black text-slate-900 mb-1">Bulk Import via Excel</h2>
          <p className="text-sm text-slate-500 mb-4">
            Recognised columns:{" "}
            {["RawMaterialId","RawMaterialGrade","ReceivedQuantity","Date","ReceivedBy","BatchNumber","Notes"].map(c => (
              <span key={c} className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded mr-1">{c}</span>
            ))}
          </p>
          <label className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all ${importing ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/40"}`}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={importing} />
            <div className={`p-4 rounded-full ${importing ? "bg-blue-100" : "bg-slate-100"}`}>
              {importing ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /> : <Upload size={28} className="text-slate-400" />}
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-700">{importing ? "Processing…" : "Click to choose file or drag & drop"}</p>
              <p className="text-xs text-slate-400 mt-0.5">Excel formats only (.xlsx, .xls)</p>
            </div>
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
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by ID, batch, grade…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-900 w-64" />
        </div>
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="all">All Grades</option>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="px-5 py-4">Material ID</th>
                <th className="px-5 py-4">Material</th><th className="px-5 py-4">Grade</th>
                <th className="px-5 py-4">Batch</th>
                <th className="px-5 py-4">Qty (KG)</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Received By</th>
                <th className="px-5 py-4">Approved By</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                  <Package size={40} className="mx-auto mb-2 text-slate-200" />No materials found
                </td></tr>
              ) : groupedVisible.map(([groupKey, items]) => {
                const batchOptions = items.map(i => i.batchNumber)
                const selectedBatch = selectedBatchByGroup[groupKey] || batchOptions[0]
                const item = items.find(i => i.batchNumber === selectedBatch) || items[0]
                return (
                <tr key={groupKey} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4"><p className="font-bold text-slate-900 text-sm font-mono">{item.rawMaterialId}</p>{item.status === "rejected" && item.rejectedReason && (<p className="text-xs text-red-500 mt-0.5">↩ {item.rejectedReason}</p>)}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{item.material || "—"}</td><td className="px-5 py-4"><span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black">Grade {item.rawMaterialGrade}</span></td>
                  <td className="px-5 py-4 text-sm font-mono text-slate-500">{batchOptions.length > 1 ? <select value={selectedBatch} onChange={e => setSelectedBatchByGroup(prev => ({ ...prev, [groupKey]: e.target.value }))} className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700">{batchOptions.map(b => <option key={b} value={b}>{b}</option>)}</select> : selectedBatch}</td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-800">{item.receivedQuantity.toLocaleString()} KG</td><td className="px-5 py-4 text-sm text-slate-500">{item.date}</td><td className="px-5 py-4 text-sm text-slate-600">{item.receivedBy}</td><td className="px-5 py-4 text-sm text-slate-600">{item.approvedBy || "—"}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-5 py-4"><div className="flex gap-2">{canAdd && item.status !== "approved" && (<button onClick={() => openEdit(item)} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"><Edit2 size={13} /> Edit</button>)}{canApprove && item.status === "pending" && (<><button onClick={() => handleApprove(item.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">Approve</button><button onClick={() => handleReject(item.id)} className="text-xs font-bold text-red-500 hover:text-red-700">Reject</button></>)}</div></td>
                </tr>)
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual entry modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-black text-slate-900">{editItem ? "Edit Raw Material" : "Add Raw Material"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Material Master *</label>
                  <select required value={`${form.material}__${form.rawMaterialGrade}`} onChange={e => { const [material, rawMaterialGrade] = e.target.value.split("__"); const firstMatch = masterItems.find(item => item.material === material && item.rawMaterialGrade === rawMaterialGrade); setForm(p => ({ ...p, material, rawMaterialGrade, rawMaterialId: firstMatch?.rawMaterialId || p.rawMaterialId })) }}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">— Select material master —</option>
                    {masterItems.map(item => <option key={`${item.material}__${item.rawMaterialGrade}`} value={`${item.material}__${item.rawMaterialGrade}`}>{item.material} · Grade {item.rawMaterialGrade}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Material *</label>
                  <input required value={form.material} readOnly
                    placeholder="Auto-filled from material master"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Raw Material Grade *</label>
                  <input required value={form.rawMaterialGrade} readOnly
                    placeholder="Auto-filled from material master"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Received Quantity (KG) *</label>
                  <input type="number" required min="0" step="any" value={form.receivedQuantity} onChange={e => setForm(p => ({ ...p, receivedQuantity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date Received *</label>
                  <input type="date" required value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Received By *</label>
                  <select required value={form.receivedBy} onChange={e => setForm(p => ({ ...p, receivedBy: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">— Select receiver —</option>
                    {storekeepers.map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Batch Number *</label>
                  <select required value={form.batchNumber} onChange={e => setForm(p => ({ ...p, batchNumber: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">— Select batch —</option>
                    {(batchesByMaster.get(`${form.rawMaterialId}__${form.rawMaterialGrade}`) || []).map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">No. of Required Components *</label>
                  <input type="number" required min="0" value={form.numberOfRequiredComponents} onChange={e => setForm(p => ({ ...p, numberOfRequiredComponents: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Weight per Component (KG) *</label>
                  <input type="number" required min="0" step="any" value={form.weightPerComponent} onChange={e => setForm(p => ({ ...p, weightPerComponent: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
              {editItem && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                  Saving changes will reset status back to <strong>Pending</strong> for QI re-approval.
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
                  {editItem ? "Save & Resubmit" : "Submit for QI Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showScrapDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-black text-slate-900">Scrap & Waste Detailed Breakdown</h3>
              <button onClick={() => setShowScrapDetails(false)} className="text-slate-500 hover:text-slate-800">Close</button>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>{["Date","Process","Material","Grade","WO","Scrap KG","Waste KG","Total Loss KG"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-800 font-bold">{h}</th>)}</tr></thead>
                <tbody>
                {processRecords.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No scrap/waste records yet.</td></tr>
                ) : processRecords.map(r => {
                  const wo = workOrders.find(w => w.id === r.workOrderId)
                  const mat = materials.find(m => m.id === wo?.rawMaterialId)
                  return <tr key={r.id} className="border-t"><td className="px-3 py-2 text-slate-900">{r.date}</td><td className="px-3 py-2 text-slate-900">{r.process}</td><td className="px-3 py-2 text-slate-900">{mat?.material || "—"}</td><td className="px-3 py-2 text-slate-900">{mat?.rawMaterialGrade || "—"}</td><td className="px-3 py-2 font-mono text-xs text-slate-700">{r.workOrderId}</td><td className="px-3 py-2 text-slate-900">{r.scrapWeightKg.toFixed(2)}</td><td className="px-3 py-2 text-slate-900">{r.materialWasteKg.toFixed(2)}</td><td className="px-3 py-2 font-semibold text-slate-900">{(r.scrapWeightKg+r.materialWasteKg).toFixed(2)}</td></tr>
                })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {showOutsourceDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-black text-slate-900">Outsourced Work Orders — Material Assignment</h3>
              <button onClick={() => setShowOutsourceDetails(false)} className="text-slate-500 hover:text-slate-800">Close</button>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>{["WO","Part","Material","Grade","Qty Assigned KG","Date Given","Expected Return","Expected Parts","Vendor ID","Vendor Name","Status"].map(h => <th key={h} className="px-3 py-2 text-left text-slate-800 font-bold">{h}</th>)}</tr></thead>
                <tbody>
                {outsourcedWOs.length === 0 ? (
                  <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">No outsourced work orders yet.</td></tr>
                ) : outsourcedWOs.map(wo => (
                  <tr key={wo.id} className="border-t">
                    {(() => {
                      const mat = materials.find(m => m.id === wo.rawMaterialId)
                      return (
                        <>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{wo.id}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.partName}</td>
                    <td className="px-3 py-2 text-slate-900">{mat?.material || "—"}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.rawMaterialGrade || mat?.rawMaterialGrade || "—"}</td>
                    <td className="px-3 py-2 text-slate-900 font-semibold">{(wo.requiredQuantityKg || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.vendorProductionDate || wo.workOrderStartDate || "—"}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.dueDate || "—"}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.targetPartNos || 0}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.vendorId || "—"}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.vendorName || "—"}</td>
                    <td className="px-3 py-2 text-slate-900">{wo.status}</td>
                        </>
                      )
                    })()}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}