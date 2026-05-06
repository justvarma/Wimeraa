"use client"
import { useState } from "react"
import { useApp } from "@/components/providers/AppProvider"
import { UserRole, QI_ROLE_PROCESS_MAP, PROCESS_STAGE_LABELS } from "@/lib/store"
import { ClipboardCheck, CheckCircle, XCircle, Eye, X, AlertTriangle, ShieldOff } from "lucide-react"

export default function ApprovalsPage() {
  const { currentUser, materials, updateMaterial } = useApp()
  const role = currentUser?.role as UserRole

  // Only QI roles (all variants) and FQI can approve — NOT Admin
  const isQIDC      = role === UserRole.QI_DIE_CASTING
  const isQICoat    = role === UserRole.QI_COATING
  const isQIMach    = role === UserRole.QI_MACHINING
  const isLegacyQI  = role === UserRole.QUALITY_INSPECTOR
  const isFQI       = role === UserRole.FQI
  const canApprove  = isQIDC || isQICoat || isQIMach || isLegacyQI || isFQI

  const [viewItem,     setViewItem]     = useState<string|null>(null)
  const [rejectModal,  setRejectModal]  = useState<{ id: string; name: string }|null>(null)
  const [rejectReason, setRejectReason] = useState("")

  if (!canApprove) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <ShieldOff size={32} className="text-red-500"/>
        </div>
        <h2 className="text-xl font-black text-slate-800">Access Restricted</h2>
        <p className="text-slate-500 text-sm max-w-sm text-center">
          Only Quality Inspectors (QI) and Final Quality Inspectors (FQI) can approve or reject raw materials.
        </p>
      </div>
    )
  }

  const pending   = materials.filter(m => m.status === "pending")
  const processed = materials.filter(m => m.status !== "pending")

  const handleApprove = (id: string) => {
    updateMaterial(id, { status: "approved", approvedBy: currentUser!.name, rejectedReason: undefined })
  }

  const handleReject = () => {
    if (!rejectModal || !rejectReason.trim()) return
    updateMaterial(rejectModal.id, { status: "rejected", rejectedReason: rejectReason.trim(), approvedBy: undefined })
    setRejectModal(null)
    setRejectReason("")
  }

  // QI sub-role scope label
  const scopeLabel = (() => {
    if (isQIDC)   return `Scoped to ${PROCESS_STAGE_LABELS[QI_ROLE_PROCESS_MAP[role]]}`
    if (isQICoat) return `Scoped to ${PROCESS_STAGE_LABELS[QI_ROLE_PROCESS_MAP[role]]}`
    if (isQIMach) return `Scoped to ${PROCESS_STAGE_LABELS[QI_ROLE_PROCESS_MAP[role]]}`
    return "All processes"
  })()

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-black text-slate-900">Material Approvals</h1>
        <p className="text-slate-600 mt-1">
          Raw materials awaiting QI verification · <span className="font-semibold text-emerald-700">{scopeLabel}</span>
        </p>
      </header>

      {/* Role note */}
      <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-800">
        <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-600"/>
        <p>
          <strong>Approval authority:</strong> Only QI and FQI roles can approve or reject raw materials.
          The Admin has view-only access to inventory — approvals are exclusively the QI team's responsibility.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:"Pending",  value: pending.length,                               bg:"bg-amber-50 border-amber-200",   text:"text-amber-700" },
          { label:"Approved", value: processed.filter(m=>m.status==="approved").length, bg:"bg-emerald-50 border-emerald-200", text:"text-emerald-700" },
          { label:"Rejected", value: processed.filter(m=>m.status==="rejected").length, bg:"bg-red-50 border-red-200",    text:"text-red-700" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-5 ${s.bg}`}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <ClipboardCheck size={18} className="text-amber-600"/>
          <h2 className="font-black text-slate-900">Pending Approvals ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={40} className="mx-auto text-emerald-200 mb-3"/>
            <p className="text-slate-400 font-medium">No pending approvals — all materials reviewed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-3">Material ID</th>
                  <th className="px-5 py-3">Grade</th>
                  <th className="px-5 py-3">Qty (KG)</th>
                  <th className="px-5 py-3">Batch</th>
                  <th className="px-5 py-3">Received By</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pending.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-sm text-indigo-700 font-bold">{item.rawMaterialId}</td>
                    <td className="px-5 py-3">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-black">Grade {item.rawMaterialGrade}</span>
                    </td>
                    <td className="px-5 py-3 font-bold text-slate-900">{item.receivedQuantity} KG</td>
                    <td className="px-5 py-3 text-sm text-slate-600 font-mono">{item.batchNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">{item.receivedBy}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{item.date}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewItem(viewItem === item.id ? null : item.id)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="View details">
                          <Eye size={15}/>
                        </button>
                        <button onClick={() => handleApprove(item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">
                          <CheckCircle size={13}/> Approve
                        </button>
                        <button onClick={() => { setRejectModal({ id: item.id, name: item.rawMaterialId }); setRejectReason("") }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold">
                          <XCircle size={13}/> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Expanded detail row */}
                {pending.map(item => viewItem === item.id && (
                  <tr key={`${item.id}-detail`} className="bg-blue-50">
                    <td colSpan={7} className="px-5 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        {[
                          ["Raw Material ID",      item.rawMaterialId],
                          ["Grade",                `Grade ${item.rawMaterialGrade}`],
                          ["Batch",                item.batchNumber],
                          ["Qty Received",         `${item.receivedQuantity} KG`],
                          ["Wt per Component",     `${item.weightPerComponent} KG`],
                          ["No. of Components",    String(item.numberOfRequiredComponents)],
                          ["Received By",          item.receivedBy],
                          ["Date",                 item.date],
                        ].map(([k,v]) => (
                          <div key={k} className="bg-white rounded-lg p-2.5 border border-blue-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">{k}</p>
                            <p className="font-semibold text-slate-800">{v}</p>
                          </div>
                        ))}
                        {item.notes && (
                          <div className="col-span-2 bg-white rounded-lg p-2.5 border border-blue-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Notes</p>
                            <p className="font-semibold text-slate-800">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Processed materials */}
      {processed.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-black text-slate-900">Processed Materials ({processed.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-5 py-3">Material ID</th>
                  <th className="px-5 py-3">Grade</th>
                  <th className="px-5 py-3">Qty (KG)</th>
                  <th className="px-5 py-3">Batch</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Reviewed By</th>
                  <th className="px-5 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {processed.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-sm text-indigo-700 font-bold">{item.rawMaterialId}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">Grade {item.rawMaterialGrade}</td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900">{item.receivedQuantity} KG</td>
                    <td className="px-5 py-3 text-sm text-slate-500 font-mono">{item.batchNumber}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        item.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>{item.status}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">{item.approvedBy || "—"}</td>
                    <td className="px-5 py-3 text-sm text-slate-500 max-w-xs truncate">{item.rejectedReason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircle size={20} className="text-red-600"/>
                </div>
                <div>
                  <h3 className="font-black text-slate-900">Reject Material</h3>
                  <p className="text-xs text-slate-500">{rejectModal.name}</p>
                </div>
              </div>
              <button onClick={() => setRejectModal(null)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Rejection Reason *</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Describe why this material is being rejected..."
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-red-500 outline-none resize-none"/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim()}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-40">
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
