"use client"

import { useState } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, type RawMaterial } from "@/lib/store"
import {
  PackageSearch, CheckCircle2, XCircle, AlertTriangle, Clock,
  Search, Eye, ChevronDown, ChevronUp, ShieldAlert,
} from "lucide-react"

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${map[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
    </div>
  )
}

export default function InventoryQIPage() {
  const { currentUser, materials, updateMaterial } = useApp()
  const [search, setSearch] = useState("")
  const [rejectModal, setRejectModal] = useState<RawMaterial | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Guard: only INVENTORY_QI can access this page
  if (currentUser?.role !== UserRole.INVENTORY_QI) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <ShieldAlert size={48} className="text-red-400"/>
        <p className="text-lg font-bold text-slate-700">Access Denied</p>
        <p className="text-sm text-slate-500">This page is restricted to Inventory QI role only.</p>
      </div>
    )
  }

  // Show only pending items
  const pending = materials.filter(m => {
    if (m.status !== "pending") return false
    const q = search.toLowerCase()
    return (
      m.rawMaterialId.toLowerCase().includes(q) ||
      m.batchNumber.toLowerCase().includes(q) ||
      m.rawMaterialGrade.toLowerCase().includes(q)
    )
  })

  const stats = {
    pending:  materials.filter(m => m.status === "pending").length,
    approved: materials.filter(m => m.status === "approved").length,
    rejected: materials.filter(m => m.status === "rejected").length,
  }

  const handleApprove = (m: RawMaterial) => {
    updateMaterial(m.id, { status: "approved", approvedBy: currentUser.name, rejectedReason: null })
  }

  const handleRejectConfirm = () => {
    if (!rejectModal || !rejectReason.trim()) return
    updateMaterial(rejectModal.id, { status: "rejected", rejectedReason: rejectReason.trim(), approvedBy: null })
    setRejectModal(null)
    setRejectReason("")
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 bg-lime-500 rounded-xl flex items-center justify-center shadow-lg shadow-lime-500/20">
          <PackageSearch size={22} className="text-white"/>
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Inventory Review</h1>
          <p className="text-sm text-slate-500">Approve or reject incoming raw material entries — pending items only</p>
        </div>
        <div className="ml-auto px-3 py-1.5 bg-lime-50 border border-lime-200 rounded-lg">
          <p className="text-[11px] font-black text-lime-700 uppercase tracking-widest">Inventory QI Scope</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pending Review"  value={stats.pending}  icon={Clock}         color="bg-amber-500"/>
        <StatCard label="Approved"        value={stats.approved} icon={CheckCircle2}  color="bg-emerald-500"/>
        <StatCard label="Rejected"        value={stats.rejected} icon={XCircle}       color="bg-red-500"/>
      </div>

      {/* Pending items */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-4">
          <div>
            <h2 className="text-base font-black text-slate-800">Pending Approval</h2>
            <p className="text-xs text-slate-400">{pending.length} item{pending.length !== 1 ? "s" : ""} awaiting your review</p>
          </div>
          <div className="ml-auto relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ID, batch, grade…"
              className="pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 w-64"
            />
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <CheckCircle2 size={40} className="text-emerald-400"/>
            <p className="font-bold text-slate-600">No pending items</p>
            <p className="text-sm">{search ? "No results match your search." : "All inventory entries have been reviewed."}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map(m => {
              const expanded = expandedId === m.id
              const available = m.receivedQuantity - (m.usedQuantity || 0)
              return (
                <div key={m.id} className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Left: info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-black text-slate-800 text-sm">{m.rawMaterialId}</span>
                        <Badge status={m.status}/>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">Grade {m.rawMaterialGrade}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Batch: <span className="font-bold text-slate-700">{m.batchNumber}</span>
                        <span className="mx-2 text-slate-300">•</span>
                        Received: <span className="font-bold text-slate-700">{m.receivedQuantity} kg</span>
                        <span className="mx-2 text-slate-300">•</span>
                        Received by: <span className="font-bold text-slate-700">{m.receivedBy}</span>
                        <span className="mx-2 text-slate-300">•</span>
                        Date: <span className="font-bold text-slate-700">{m.date}</span>
                      </p>
                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(expanded ? null : m.id)}
                        className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 font-bold"
                      >
                        <Eye size={11}/> {expanded ? "Hide details" : "View details"}
                        {expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                      </button>
                      {expanded && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Required Components", value: m.numberOfRequiredComponents },
                            { label: "Weight / Component", value: `${m.weightPerComponent} kg` },
                            { label: "Available Stock",    value: `${available} kg` },
                            { label: "Used",               value: `${m.usedQuantity || 0} kg` },
                          ].map(f => (
                            <div key={f.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{f.label}</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{f.value}</p>
                            </div>
                          ))}
                          {m.notes && (
                            <div className="col-span-2 sm:col-span-4 bg-blue-50 rounded-xl p-3 border border-blue-100">
                              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wide mb-0.5">Notes</p>
                              <p className="text-xs text-blue-800">{m.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(m)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors shadow shadow-emerald-500/20"
                      >
                        <CheckCircle2 size={15}/> Approve
                      </button>
                      <button
                        onClick={() => { setRejectModal(m); setRejectReason("") }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm font-bold transition-colors"
                      >
                        <XCircle size={15}/> Reject
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-600"/>
              </div>
              <div>
                <h3 className="font-black text-slate-800">Reject Material</h3>
                <p className="text-xs text-slate-500">{rejectModal.rawMaterialId} — Batch {rejectModal.batchNumber}</p>
              </div>
            </div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Grade mismatch — received C instead of A…"
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
