"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import { confirmDialog } from "@/lib/confirm";

const RETENTION_DAYS = 30;

// Compute the "auto-purge in" countdown live from deleted_at, so the value
// updates without requiring a page reload.
function computePurge(deletedAt) {
  if (!deletedAt) return { label: `${RETENTION_DAYS} days`, daysLeft: RETENTION_DAYS };
  const purgeAt = new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const ms = purgeAt - Date.now();
  if (ms <= 0) return { label: "Purging soon", daysLeft: 0 };
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  let label;
  if (days >= 2) label = `${days}d ${hours}h`;
  else if (days === 1) label = `1d ${hours}h`;
  else if (hours >= 1) label = `${hours}h ${minutes}m`;
  else label = `${minutes}m`;
  return { label, daysLeft: days };
}

export default function RecycleBinPage() {
  const user = useSelector((state) => state.auth.user);
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [restoring, setRestoring] = useState(null);
  const [archivedSenders, setArchivedSenders] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [, setTick] = useState(0);

  // Re-render every minute so the auto-purge countdown stays current.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const handlePreview = async (item) => {
    setPreviewLoading(true);
    setPreview({ ...item, data: null });
    try {
      const res = await api.post("/recycle-bin/preview/", { model: item.model, id: item.id });
      setPreview({ ...item, data: res.data });
    } catch {
      setPreview({ ...item, data: { _error: 'Could not load preview.' } });
    }
    finally { setPreviewLoading(false); }
  };

  const loadArchivedSenders = () => {
    api.get("/communications/archived-senders/").then(r => setArchivedSenders(r.data)).catch(() => {});
  };

  const handleUnarchiveSender = async (sender) => {
    try {
      await api.post("/communications/unarchive-sender/", { id: sender.id });
      toast.success(`${sender.email} removed from auto-archive list`);
      loadArchivedSenders();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to unarchive")); }
  };

  const loadItems = () => {
    setLoading(true);
    api.get("/recycle-bin/")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(); loadArchivedSenders(); }, []);

  const handleRestore = async (item) => {
    setRestoring(item.id);
    try {
      await api.post("/recycle-bin/restore/", { model: item.model, id: item.id });
      toast.success(`"${item.name}" restored`);
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to restore")); }
    finally { setRestoring(null); }
  };

  const handlePurge = async (item) => {
    if (!(await confirmDialog(`Permanently delete "${item.name}"? This cannot be undone.`))) return;
    try {
      await api.post("/recycle-bin/purge/", { model: item.model, id: item.id });
      toast.success("Permanently deleted");
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const handleEmptyAll = async () => {
    if (!(await confirmDialog("Permanently delete ALL items in the recycle bin? This cannot be undone."))) return;
    try {
      const res = await api.post("/recycle-bin/empty/");
      toast.success(res.data.status);
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to empty")); }
  };

  const types = ["all", ...new Set(items.map((i) => i.type))];
  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  // Stats for the hero tiles
  const expiringSoon = items.filter((i) => computePurge(i.deleted_at).daysLeft <= 5).length;
  const recentCount = items.filter((i) => {
    if (!i.deleted_at) return false;
    return (Date.now() - new Date(i.deleted_at).getTime()) < 24 * 60 * 60 * 1000;
  }).length;

  const TYPE_TONES = {
    all: { iconBg: "from-indigo-500 to-violet-500", soft: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
    email: { iconBg: "from-blue-500 to-blue-600", soft: "bg-blue-50 text-blue-700 ring-blue-200" },
    inquiry: { iconBg: "from-purple-500 to-purple-600", soft: "bg-purple-50 text-purple-700 ring-purple-200" },
    account: { iconBg: "from-emerald-500 to-emerald-600", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    quotation: { iconBg: "from-amber-500 to-amber-600", soft: "bg-amber-50 text-amber-700 ring-amber-200" },
    order: { iconBg: "from-rose-500 to-rose-600", soft: "bg-rose-50 text-rose-700 ring-rose-200" },
    invoice: { iconBg: "from-teal-500 to-teal-600", soft: "bg-teal-50 text-teal-700 ring-teal-200" },
  };
  const toneFor = (t) => TYPE_TONES[t?.toLowerCase()] || { iconBg: "from-slate-400 to-slate-500", soft: "bg-slate-100 text-slate-600 ring-slate-200" };

  return (
    <div className="space-y-5">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 p-6 shadow-xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-violet-300/20 rounded-full blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Archive</h1>
              <p className="text-indigo-100 text-sm mt-0.5">Restore or permanently remove deleted items \u00b7 30 day retention</p>
            </div>
          </div>
          {isAdminOrManager && items.length > 0 && (
            <button onClick={handleEmptyAll} className="flex items-center gap-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-semibold rounded-xl ring-1 ring-white/30 transition-all shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Empty Archive
            </button>
          )}
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-indigo-100">Total Archived</p>
          <p className="relative text-3xl font-extrabold mt-1">{items.length}</p>
          <p className="relative text-[11px] text-indigo-100 mt-0.5">items in archive</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-amber-50">Expiring Soon</p>
          <p className="relative text-3xl font-extrabold mt-1">{expiringSoon}</p>
          <p className="relative text-[11px] text-amber-50 mt-0.5">\u2264 5 days remaining</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-emerald-50">Archived Today</p>
          <p className="relative text-3xl font-extrabold mt-1">{recentCount}</p>
          <p className="relative text-[11px] text-emerald-50 mt-0.5">in last 24 hours</p>
        </div>
      </div>

      {/* Filter Pills */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap p-1.5 bg-white rounded-2xl border border-slate-200/70 shadow-sm w-fit">
          {types.map((t) => {
            const isActive = filter === t;
            const count = t === "all" ? items.length : items.filter((i) => i.type === t).length;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  isActive
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="capitalize">{t === "all" ? "All" : t}</span>
                <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-full blur-xl opacity-40" />
            <div className="relative animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/70 shadow-sm">
          <div className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 items-center justify-center mb-4 shadow-inner">
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </div>
          <p className="text-slate-700 font-bold text-lg">Archive is empty</p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Deleted items will appear here for 30 days before being permanently removed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[2.5fr_1fr_1.3fr_1fr_1.4fr] gap-4 px-5 py-3 bg-gradient-to-r from-slate-50 to-slate-50/40 border-b border-slate-200/70 text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
            <div>Name</div>
            <div>Type</div>
            <div>Deleted</div>
            <div>Auto-purge in</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const { label, daysLeft } = computePurge(item.deleted_at);
              const purgeTone = daysLeft <= 5 ? "bg-rose-50 text-rose-700 ring-rose-200"
                : daysLeft <= 15 ? "bg-amber-50 text-amber-700 ring-amber-200"
                : "bg-slate-50 text-slate-600 ring-slate-200";
              const stripeTone = daysLeft <= 5 ? "from-rose-500 to-rose-400"
                : daysLeft <= 15 ? "from-amber-500 to-amber-400"
                : "from-indigo-500 to-violet-500";
              const tone = toneFor(item.type);
              return (
                <div
                  key={`${item.model}-${item.id}`}
                  onClick={() => handlePreview(item)}
                  className="group relative grid grid-cols-1 md:grid-cols-[2.5fr_1fr_1.3fr_1fr_1.4fr] gap-3 md:gap-4 px-5 py-3.5 hover:bg-slate-50/60 cursor-pointer transition-colors items-center"
                >
                  <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gradient-to-b ${stripeTone} opacity-0 group-hover:opacity-100 transition-opacity`} />

                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${tone.iconBg} flex items-center justify-center shadow-sm`}>
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700 transition-colors">{item.name}</p>
                      <p className="text-[11px] text-slate-400 md:hidden mt-0.5 capitalize">{item.type}</p>
                    </div>
                  </div>

                  {/* Type */}
                  <div className="hidden md:flex">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 ${tone.soft}`}>
                      {item.type}
                    </span>
                  </div>

                  {/* Deleted */}
                  <div className="hidden md:flex items-center gap-1.5 text-[12px] text-slate-500">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="font-medium">{item.deleted_at ? format(new Date(item.deleted_at), "MMM d, yyyy h:mm a") : "\u2014"}</span>
                  </div>

                  {/* Auto-purge in */}
                  <div className="hidden md:flex">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ring-1 ${purgeTone}`} title={item.deleted_at ? `Deleted ${format(new Date(item.deleted_at), "MMM d, yyyy h:mm a")}` : ""}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {label}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={restoring === item.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg ring-1 ring-emerald-200/60 disabled:opacity-50 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {restoring === item.id ? "Restoring..." : "Restore"}
                    </button>
                    <button
                      onClick={() => handlePurge(item)}
                      className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete Forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name || "Preview"} size="lg">
        {previewLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
        ) : preview?.data?._error ? (
          <p className="text-sm text-gray-500 py-4">{preview.data._error}</p>
        ) : preview?.data ? (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Type badge */}
            <div className="flex items-center gap-2">
              <StatusBadge status={preview.type.toLowerCase()} />
              {preview.data.status && <StatusBadge status={preview.data.status} />}
              {preview.data.direction && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${preview.data.direction === "inbound" ? "text-blue-700 bg-blue-50" : "text-green-700 bg-green-50"}`}>
                  {preview.data.direction === "inbound" ? "Received" : "Sent"}
                </span>
              )}
            </div>

            {/* Key-value fields */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {preview.data.company_name && <div><span className="text-gray-400 block text-xs">Company</span><span className="font-medium">{preview.data.company_name}</span></div>}
              {preview.data.client_name && <div><span className="text-gray-400 block text-xs">Client</span><span className="font-medium">{preview.data.client_name}</span></div>}
              {preview.data.external_email && <div><span className="text-gray-400 block text-xs">Email</span><span className="font-medium">{preview.data.external_email}</span></div>}
              {preview.data.subject && <div className="col-span-2"><span className="text-gray-400 block text-xs">Subject</span><span className="font-medium">{preview.data.subject}</span></div>}
              {preview.data.to_email && <div><span className="text-gray-400 block text-xs">To</span><span className="font-medium">{preview.data.to_email}</span></div>}
              {preview.data.email && <div><span className="text-gray-400 block text-xs">Email</span><span className="font-medium">{preview.data.email}</span></div>}
              {preview.data.name && <div><span className="text-gray-400 block text-xs">Name</span><span className="font-medium">{preview.data.name}</span></div>}
              {preview.data.phone && <div><span className="text-gray-400 block text-xs">Phone</span><span className="font-medium">{preview.data.phone}</span></div>}
              {preview.data.order_number && <div><span className="text-gray-400 block text-xs">Order #</span><span className="font-medium">{preview.data.order_number}</span></div>}
              {preview.data.quotation_number && <div><span className="text-gray-400 block text-xs">Quotation #</span><span className="font-medium">{preview.data.quotation_number}</span></div>}
              {preview.data.invoice_number && <div><span className="text-gray-400 block text-xs">Invoice #</span><span className="font-medium">{preview.data.invoice_number}</span></div>}
              {preview.data.total != null && <div><span className="text-gray-400 block text-xs">Total</span><span className="font-medium">{preview.data.currency || "USD"} {Number(preview.data.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
              {preview.data.product_name && <div><span className="text-gray-400 block text-xs">Product</span><span className="font-medium">{preview.data.product_name}</span></div>}
              {preview.data.title && <div className="col-span-2"><span className="text-gray-400 block text-xs">Title</span><span className="font-medium">{preview.data.title}</span></div>}
              {preview.data.created_at && <div><span className="text-gray-400 block text-xs">Created</span><span className="font-medium">{(() => { try { return format(new Date(preview.data.created_at), "MMM d, yyyy h:mm a"); } catch { return "—"; } })()}</span></div>}
            </div>

            {/* Body/Content */}
            {preview.data.body && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Content</span>
                <div className="bg-gray-50 rounded-lg p-4 text-sm max-h-60 overflow-y-auto">
                  {preview.data.body?.includes("<") ? (
                    <div dangerouslySetInnerHTML={{ __html: preview.data.body }} />
                  ) : (
                    <p className="whitespace-pre-wrap">{preview.data.body}</p>
                  )}
                </div>
              </div>
            )}
            {preview.data.description && !preview.data.body && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Description</span>
                <p className="text-sm bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">{preview.data.description}</p>
              </div>
            )}
            {preview.data.notes && (
              <div>
                <span className="text-gray-400 block text-xs mb-1">Notes</span>
                <p className="text-sm bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{preview.data.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button onClick={() => { handleRestore(preview); setPreview(null); }} className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100">Restore</button>
              <button onClick={() => { handlePurge(preview); setPreview(null); }} className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100">Delete Forever</button>
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Archived Senders Section */}
      {isAdminOrManager && archivedSenders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Auto-Archived Senders</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Future emails from these senders are auto-archived. Remove to resume normal delivery.</p>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1.2fr] gap-4 px-5 py-2.5 bg-slate-50/40 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
            <div>Sender Email</div>
            <div>Archived By</div>
            <div>Date</div>
            <div className="text-right">Action</div>
          </div>
          <div className="divide-y divide-slate-100">
            {archivedSenders.map((s) => (
              <div key={s.id} className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_1.2fr] gap-3 md:gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors items-center">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center text-xs font-bold ring-1 ring-blue-200/60">
                    {s.email?.[0]?.toUpperCase() || "?"}
                  </div>
                  <p className="font-semibold text-slate-800 text-sm truncate">{s.email}</p>
                </div>
                <div className="text-[12px] text-slate-500 font-medium">{s.archived_by || "—"}</div>
                <div className="text-[12px] text-slate-500">{(() => { try { return format(new Date(s.created_at), "MMM d, yyyy"); } catch { return "—"; } })()}</div>
                <div className="flex items-center justify-end">
                  <button onClick={() => handleUnarchiveSender(s)} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg ring-1 ring-emerald-200/60 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Unarchive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How Archive Works Panel */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50/60 to-yellow-50/40 border border-amber-200/70 shadow-sm">
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-amber-200/30 rounded-full blur-2xl" />
        <div className="relative p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="font-bold text-amber-900 text-sm">How Archive works</h3>
          </div>
          <ul className="space-y-2 text-sm text-amber-900/90 ml-1">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>Deleted items from <strong className="font-bold">Activities, Inquiries, Proforma Invoices, Accounts, Quotes, Sales Orders</strong> and all other modules are moved here</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="font-bold">Promotions, Spam, Social, Updates</strong> emails are <strong className="font-bold">auto-archived after 2 days</strong></span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>All archived items are <strong className="font-bold">stored for 30 days</strong>, then permanently deleted</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Click <strong className="font-bold text-emerald-700">Restore</strong> to recover an item back to its original location</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>Click <strong className="font-bold text-rose-700">Delete Forever</strong> to permanently remove immediately</span>
            </li>
            {isAdminOrManager && (
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong className="font-bold">Empty Archive</strong> permanently removes everything (admin/manager only)</span>
              </li>
            )}
            {isAdminOrManager && (
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span><strong className="font-bold">Auto-Archived Senders</strong> shows senders whose emails are automatically archived. Click "Unarchive" to stop.</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
