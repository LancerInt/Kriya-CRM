"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import PdfViewer from "@/components/ui/PdfViewer";
import { confirmDialog } from "@/lib/confirm";

/**
 * Quotations list page — every quotation row (draft, sent, approved, etc.)
 * with full version history visible inline. Mirrors the Proforma Invoices
 * page so the UX is consistent across both document types.
 */
// Wrapper required for static export: useSearchParams() must sit inside a
// Suspense boundary or Next refuses to prerender the page.
export default function QuotationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <QuotationsPageContent />
    </Suspense>
  );
}

function QuotationsPageContent() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filter, setFilter] = useState("all");

  // Editor state
  const [showQtModal, setShowQtModal] = useState(false);
  const [qt, setQt] = useState(null);
  const [qtForm, setQtForm] = useState({});
  const [qtItems, setQtItems] = useState([]);
  const [qtLoading, setQtLoading] = useState(false);
  const [qtSending, setQtSending] = useState(false);
  const [pdfView, setPdfView] = useState(null);

  const loadQuotations = async () => {
    try {
      const res = await api.get("/quotations/quotations/");
      setList(res.data.results || res.data);
    } catch { toast.error("Failed to load quotations"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadQuotations(); }, []);

  // Deep-link from the dashboard / notifications: ?focus=<quotation_id>
  // auto-opens that quotation in the editor modal once the list arrives.
  // We auto-open at most once per focusId so closing/reloading the list
  // doesn't infinite-loop the modal back open.
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const handledFocusRef = useRef(null);
  useEffect(() => {
    if (!focusId || !list?.length) return;
    if (showQtModal) return;
    if (handledFocusRef.current === focusId) return;
    const exists = list.some((q) => String(q.id) === String(focusId));
    if (exists) {
      handledFocusRef.current = focusId;
      _openEditor(focusId);
    }
  }, [focusId, list]);

  // Single helper for closing the editor — drops the ?focus= deep-link
  // param from the URL so a subsequent list reload doesn't re-trigger
  // the auto-open effect.
  const closeEditor = () => {
    setShowQtModal(false);
    if (focusId) {
      try { router.replace("/quotations", { scroll: false }); } catch {}
    }
    loadQuotations();
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((q) => q.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await confirmDialog(`Delete ${selectedIds.size} quotation${selectedIds.size > 1 ? "s" : ""}?`))) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/quotations/quotations/${id}/`)));
      toast.success(`${selectedIds.size} quotation${selectedIds.size > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      loadQuotations();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const _openEditor = async (qtId) => {
    setQtLoading(true);
    setShowQtModal(true);
    try {
      const res = await api.get(`/quotations/quotations/${qtId}/`);
      setQt(res.data);
      setQtForm(res.data);
      setQtItems(res.data.items || []);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load quotation")); setShowQtModal(false); }
    finally { setQtLoading(false); }
  };

  const handleSaveQt = async () => {
    if (!qt) return;
    try {
      const display_overrides = {};
      Object.entries(qtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
      const res = await api.post(`/quotations/quotations/${qt.id}/save-with-items/`, { ...qtForm, display_overrides, items: qtItems });
      setQt(res.data);
      setQtItems(res.data.items || []);
      toast.success("Quotation saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handlePreviewQt = async () => {
    if (!qt) return;
    await handleSaveQt();
    try {
      const res = await api.get(`/quotations/quotations/${qt.id}/generate-pdf/`, { responseType: "blob" });
      setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: `Quotation ${qt.quotation_number} - ${qt.client_name || "Client"}` });
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendQt = async () => {
    if (!qt) return;
    setQtSending(true);
    try {
      await handleSaveQt();
      await api.post(`/quotations/quotations/${qt.id}/send-to-client/`, { send_via: "email" });
      toast.success("Quotation sent!");
      closeEditor();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setQtSending(false); }
  };

  const handleRevise = async (q) => {
    if (!(await confirmDialog(`Create a new version of ${q.quotation_number}?\n\nThe original will be kept and a new V${(q.version || 1) + 1} will be opened in the editor.`))) return;
    try {
      const res = await api.post(`/quotations/quotations/${q.id}/revise/`);
      toast.success(`Revision V${res.data.version} created`);
      loadQuotations();
      _openEditor(res.data.id);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create revision")); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  const counts = {
    all: list.length,
    draft: list.filter((q) => q.status === "draft").length,
    pending_approval: list.filter((q) => q.status === "pending_approval").length,
    approved: list.filter((q) => q.status === "approved").length,
    sent: list.filter((q) => q.status === "sent").length,
    rejected: list.filter((q) => q.status === "rejected").length,
  };
  const filtered = filter === "all" ? list : list.filter((q) => q.status === filter);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle={`${counts.all} total · ${counts.draft} draft · ${counts.sent} sent · ${counts.approved} approved`}
        action={
          <button onClick={() => router.push("/quotations/new")} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Quotation
          </button>
        }
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { key: "all", label: "All" },
          { key: "draft", label: "Draft" },
          { key: "pending_approval", label: "Pending Approval" },
          { key: "approved", label: "Approved" },
          { key: "sent", label: "Sent" },
          { key: "rejected", label: "Rejected" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label} ({counts[f.key] || 0})
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {selectedIds.size === 0 && filtered.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={false} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-xs text-gray-400">Select all</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No quotations yet.</p>
          <p className="text-sm text-gray-400 mt-1">Generate one from an inquiry or click "New Quotation".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <div key={q.id}
              className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${
                selectedIds.has(q.id) ? "border-indigo-400 bg-indigo-50/30" :
                q.status === "draft" ? "border-amber-300 bg-amber-50/30" :
                q.status === "rejected" ? "border-red-300 bg-red-50/20" :
                "border-green-300 bg-green-50/20"
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <input type="checkbox" checked={selectedIds.has(q.id)} onChange={(e) => toggleSelect(q.id, e)} className="h-4 w-4 mt-1 text-indigo-600 border-gray-300 rounded cursor-pointer flex-shrink-0" />
                  <div className="flex-1 cursor-pointer" onClick={() => _openEditor(q.id)}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={q.status} />
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{q.quotation_number}</span>
                      {(q.version || 1) > 1 && (
                        <span className="text-xs font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded" title={q.parent_number ? `Revised from ${q.parent_number}` : ""}>
                          V{q.version}
                        </span>
                      )}
                      {q.revision_count > 0 && (
                        <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                          {q.revision_count} revision{q.revision_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm">{q.client_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {q.currency} {Number(q.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {q.delivery_terms ? ` · ${q.delivery_terms}` : ""}
                    </p>
                    {q.items && q.items.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {q.items.map((item) => item.product_name).filter(Boolean).join(", ") || "No products"}
                      </p>
                    )}
                    {(q.created_by_name || q.sent_by_name) && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        {q.created_by_name && <><span className="text-gray-400">Edited:</span> <span className="font-medium text-gray-700">{q.created_by_name}</span></>}
                        {q.created_by_name && q.sent_by_name && <span className="mx-1.5 text-gray-300">·</span>}
                        {q.sent_by_name && <><span className="text-gray-400">Sent:</span> <span className="font-medium text-gray-700">{q.sent_by_name}</span></>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 flex-shrink-0">
                  {q.created_at ? format(new Date(q.created_at), "MMM d, yyyy h:mm a") : ""}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded font-medium ${
                  q.status === "sent" || q.status === "approved" || q.status === "accepted" ? "bg-green-100 text-green-700" :
                  q.status === "rejected" ? "bg-red-100 text-red-700" :
                  q.status === "pending_approval" ? "bg-orange-100 text-orange-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {q.status?.replace(/_/g, " ")}
                </span>
                <div className="flex gap-2">
                  {(q.status === "sent" || q.status === "approved" || q.status === "accepted") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRevise(q); }}
                      className="text-xs bg-purple-600 text-white px-3 py-1 rounded font-medium hover:bg-purple-700"
                      title="Create a new version (e.g. when client asks for changes)"
                    >
                      Revise (V{(q.version || 1) + 1})
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); _openEditor(q.id); }}
                    className="text-xs bg-teal-600 text-white px-3 py-1 rounded font-medium hover:bg-teal-700"
                  >
                    {q.status === "draft" ? "Edit" : "View"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {qtLoading && showQtModal && (
        <Modal open={true} onClose={closeEditor} title="Loading Quotation..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}
      <QuotationEditorModal
        open={showQtModal && !qtLoading}
        onClose={closeEditor}
        qt={qt} qtForm={qtForm} setQtForm={setQtForm}
        qtItems={qtItems} setQtItems={setQtItems}
        onSave={handleSaveQt} onPreview={handlePreviewQt}
        onSend={handleSendQt} sending={qtSending}
      />
      <PdfViewer url={pdfView?.url} title={pdfView?.title} onClose={() => { if (pdfView?.url) URL.revokeObjectURL(pdfView.url); setPdfView(null); }} />
    </div>
  );
}
