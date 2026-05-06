"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import PIEditorModal from "@/components/finance/PIEditorModal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PdfViewer from "@/components/ui/PdfViewer";
import { confirmDialog } from "@/lib/confirm";

export default function ProformaInvoicesPage() {
  const router = useRouter();
  const [piList, setPiList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  // PI editor state
  const [showPiModal, setShowPiModal] = useState(false);
  const [pi, setPi] = useState(null);
  const [piForm, setPiForm] = useState({});
  const [piItems, setPiItems] = useState([]);
  const [piLoading, setPiLoading] = useState(false);
  const [piSending, setPiSending] = useState(false);
  const [pdfView, setPdfView] = useState(null);

  // Review modal
  const [selectedPI, setSelectedPI] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expandedPiHistory, setExpandedPiHistory] = useState(null);

  const loadPIs = async () => {
    try {
      const res = await api.get("/finance/pi/");
      setPiList(res.data.results || res.data);
    } catch { toast.error("Failed to load proforma invoices"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadPIs();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === piList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(piList.map((p) => p.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await confirmDialog(`Delete ${selectedIds.size} proforma invoice${selectedIds.size > 1 ? "s" : ""}?`))) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/finance/pi/${id}/`)));
      toast.success(`${selectedIds.size} PI${selectedIds.size > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      loadPIs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  // ── Create standalone PI ──
  const handleCreatePI = async () => {
    if (!selectedClient) return;
    try {
      const res = await api.post("/finance/pi/create-standalone/", { client_id: selectedClient });
      toast.success("Proforma Invoice created");
      setShowClientPicker(false);
      setSelectedClient("");
      loadPIs();
      _openPIEditor(res.data.id);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create PI")); }
  };

  // ── Open PI in editor ──
  const _openPIEditor = async (piId) => {
    setPiLoading(true);
    setShowPiModal(true);
    try {
      const res = await api.get(`/finance/pi/${piId}/`);
      setPi(res.data);
      setPiForm(res.data);
      setPiItems(res.data.items || []);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load PI")); setShowPiModal(false); }
    finally { setPiLoading(false); }
  };

  // ── Save PI ──
  const handleSavePI = async () => {
    if (!pi) return;
    try {
      const display_overrides = {};
      Object.entries(piForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/finance/pi/${pi.id}/save-with-items/`, { ...piForm, display_overrides, items: piItems });
      setPi(res.data);
      setPiItems(res.data.items || []);
      toast.success("PI saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  // ── Preview PDF ──
  const handlePreviewPI = async () => {
    if (!pi) return;
    await handleSavePI();
    try {
      const res = await api.get(`/finance/pi/${pi.id}/generate-pdf/`, { responseType: "blob" });
      setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: `PI ${pi.invoice_number} - ${pi.client_company_name}` });
    } catch { toast.error("Failed to preview"); }
  };

  // ── Attach PI to Email (mirrors Quotation Attach-to-Email flow) ──
  // Save → generate PDF → attach to source email's draft → jump to AI Draft.
  // Falls back to direct send-email if no source email exists.
  const handleSendPI = async () => {
    if (!pi) return;
    setPiSending(true);
    try {
      await handleSavePI();
      if (pi.source_communication) {
        const res = await api.post(`/finance/pi/${pi.id}/attach-to-email/`);
        toast.success("PI attached to email — review and send");
        setShowPiModal(false);
        const { client_id, communication_id } = res.data || {};
        if (client_id && communication_id) {
          router.push(`/clients/${client_id}?openDraftFor=${communication_id}`);
        } else {
          loadPIs();
        }
      } else {
        await api.post(`/finance/pi/${pi.id}/send-email/`);
        toast.success("PI sent to client!");
        setShowPiModal(false);
        loadPIs();
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setPiSending(false); }
  };

  // ── Read-only PDF viewer for sent PIs ──
  const _viewPiPdf = async (piId) => {
    try {
      const res = await api.get(`/finance/pi/${piId}/generate-pdf/`, { responseType: "blob" });
      setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: "Proforma Invoice" });
    } catch { toast.error("Failed to load PI PDF"); }
  };

  // ── Edit & Send: open the client's AI Draft modal so the PI flows through
  // the same email pipeline. Always navigates — the client page resolves the
  // right communication server-side (source_communication if set, otherwise
  // the latest inbound email for the client).
  const handleEditAndSend = (piData) => {
    if (!piData.client) {
      _openPIEditor(piData.id);
      return;
    }
    if (piData.source_communication) {
      router.push(`/clients/${piData.client}?openDraftFor=${piData.source_communication}`);
    } else {
      // No source_communication — let the client page resolve via the PI id
      router.push(`/clients/${piData.client}?openPI=${piData.id}`);
    }
  };

  // ── Revise: create v+1 of an existing PI (e.g. when client asks for changes)
  // and jump to the AI Draft of the source email so the new version can be
  // sent through the same email pipeline as the original. Falls back to the
  // standalone editor if the PI has no email link.
  const handleRevise = async (piData) => {
    // Use latest_version (computed by the serializer across the whole chain)
    // so the button always increments past the highest existing version,
    // even if the user clicked Revise on an older row in the chain.
    // Count only sent versions for display
    const sentCount = (piData._allVersions || [piData]).filter(v => v.status === "sent").length || 1;
    if (!(await confirmDialog(`Create a new version after V${sentCount}?\n\nThe previous version will be kept intact and the new V${sentCount + 1} will open in the editor.`))) return;
    try {
      const res = await api.post(`/finance/pi/${piData.id}/revise/`);
      toast.success(`Revision V${res.data.version} created`);
      const newPi = res.data;
      // Open the new revision directly in the PI editor (no AI Draft detour
      // for rate-entry — same flow as the Quotation editor).
      loadPIs();
      _openPIEditor(newPi.id);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create revision")); }
  };

  // ── Convert PI to Order ──
  const handleConvertToOrder = async (piData) => {
    try {
      const res = await api.post(`/finance/pi/${piData.id}/convert-to-order/`);
      toast.success(`Order ${res.data.order_number} created from PI`);
      loadPIs();
      setShowReview(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to convert to order")); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  const draftPIs = piList.filter(p => p.status === "draft");
  const sentPIs = piList.filter(p => p.status === "sent");

  // ── Group revisions into a single "lineage" card ──
  // Walk parent links to find the root for each PI, then bucket every PI
  // under its root. This gives us one card per logical PI lineage with
  // V1/V2/V3 chips inside, instead of 3 separate cards for the same chain.
  const byId = new Map(piList.map(p => [p.id, p]));
  const findRootId = (p) => {
    let cur = p;
    let safety = 0;
    while (cur && cur.parent && byId.has(cur.parent) && safety < 50) {
      cur = byId.get(cur.parent);
      safety++;
    }
    return cur?.id || p.id;
  };
  const groups = new Map(); // rootId → { root, versions: [] }
  piList.forEach(p => {
    const rootId = findRootId(p);
    if (!groups.has(rootId)) groups.set(rootId, { root: byId.get(rootId), versions: [] });
    groups.get(rootId).versions.push(p);
  });
  // Sort each lineage by version, and pick the latest as the "display" row
  const lineages = Array.from(groups.values()).map(g => {
    g.versions.sort((a, b) => (a.version || 1) - (b.version || 1));
    g.latest = g.versions[g.versions.length - 1];
    g.anySent = g.versions.some(v => v.status === "sent");
    g.anyDraft = g.versions.some(v => v.status === "draft");
    return g;
  });
  // Sort lineages by latest version's created_at desc
  lineages.sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));

  const filteredLineages = filter === "all"
    ? lineages
    : lineages.filter(g => g.latest.status === filter);

  return (
    <div>
      <PageHeader
        title="Proforma Invoices"
        subtitle={`${sentPIs.length} sent${draftPIs.length > 0 ? ` · ${draftPIs.length} draft` : ''}`}
        action={
          <button onClick={() => setShowClientPicker(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Create PI
          </button>
        }
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { key: "all", label: "All", count: piList.length },
          { key: "draft", label: "Draft", count: draftPIs.length },
          { key: "sent", label: "Sent", count: sentPIs.length },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <input type="checkbox" checked={selectedIds.size === piList.length && piList.length > 0} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Select All */}
      {selectedIds.size === 0 && piList.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={false} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-xs text-gray-400">Select all</span>
        </div>
      )}

      {filteredLineages.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No proforma invoices in this view.</p>
          <p className="text-sm text-gray-400 mt-1">Create one for a client or generate from an order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLineages.map((g) => {
            const piData = g.latest;            // header reflects the newest version
            const versions = g.versions;        // V1 → Vn chips
            return (
            <div key={g.root.id}
              className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${
                selectedIds.has(piData.id) ? "border-indigo-400 bg-indigo-50/30" :
                g.anySent ? "border-green-300 bg-green-50/20" :
                "border-amber-300 bg-amber-50/30"
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <input type="checkbox" checked={selectedIds.has(piData.id)} onChange={(e) => toggleSelect(piData.id, e)} className="h-4 w-4 mt-1 text-indigo-600 border-gray-300 rounded cursor-pointer flex-shrink-0" />
                  <div className="flex-1 cursor-pointer" onClick={() => {
                    if (piData.status === "sent") _viewPiPdf(piData.id);
                    else _openPIEditor(piData.id);
                  }}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <StatusBadge status={piData.status} />
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{g.root.invoice_number}</span>
                    {versions.filter(v => v.status === "sent").length > 1 && (
                      <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                        {versions.filter(v => v.status === "sent").length} versions
                      </span>
                    )}
                    {piData.order_number && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/orders/${piData.order}`); }}
                        title={`Open order ${piData.order_number}`}
                        className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded font-medium"
                      >
                        Order: {piData.order_number}
                      </button>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm">{piData.client_company_name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {piData.currency} {Number(piData.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {piData.terms_of_delivery ? ` · ${piData.terms_of_delivery}` : ""}
                  </p>
                  {piData.items && piData.items.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {piData.items.map(item => item.product_name).filter(Boolean).join(", ") || "No products"}
                    </p>
                  )}

                  {/* Latest version chip + Version History for sent versions */}
                  {(() => {
                    const sentVersions = versions.filter(v => v.status === "sent");
                    const latestDraft = versions.find(v => v.status === "draft");
                    const latest = sentVersions.length > 0 ? sentVersions[sentVersions.length - 1] : latestDraft;
                    if (!latest) return null;
                    const isSent = latest.status === "sent";
                    const sentNum = isSent ? sentVersions.indexOf(latest) + 1 : sentVersions.length;
                    const cls = isSent
                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); isSent ? _viewPiPdf(latest.id) : _openPIEditor(latest.id); }}
                          title={isSent ? `${latest.invoice_number} · sent — view PDF` : `${latest.invoice_number} · draft`}
                          className={`text-left text-[10px] font-medium px-2 py-1 rounded border transition-colors ${cls}`}
                        >
                          <div className="font-semibold">PI V{sentNum || 1} · {latest.invoice_number} {isSent ? "· Sent" : "· Draft"}</div>
                          {(latest.created_by_name || latest.sent_by_name) && (
                            <div className="font-normal opacity-80 leading-tight mt-0.5">
                              {latest.created_by_name && <>Edited: {latest.created_by_name}</>}
                              {latest.created_by_name && latest.sent_by_name && " · "}
                              {latest.sent_by_name && <>Sent: {latest.sent_by_name}</>}
                            </div>
                          )}
                        </button>
                        {sentVersions.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedPiHistory(prev => prev === g.root.id ? null : g.root.id); }}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {expandedPiHistory === g.root.id ? "▾ Hide History" : `▸ Version History (${sentVersions.length})`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const sentVersions = versions.filter(v => v.status === "sent");
                    if (expandedPiHistory !== g.root.id || sentVersions.length <= 1) return null;
                    return (
                      <div className="mt-2 ml-7 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Version History</p>
                        {sentVersions.map((v, idx) => (
                          <div key={v.id} className="flex items-center justify-between text-[10px] py-1 border-b border-gray-100 last:border-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); _viewPiPdf(v.id); }}
                              className="font-medium text-green-700 hover:underline"
                            >
                              PI V{idx + 1} · {v.invoice_number}
                            </button>
                            <div className="text-gray-500 flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-100 text-green-700">Sent</span>
                              {v.created_by_name && <span>by {v.created_by_name}</span>}
                              {v.created_at && <span>{format(new Date(v.created_at), "dd/MM/yy HH:mm")}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 flex-shrink-0">
                  {piData.created_at ? format(new Date(piData.created_at), "MMM d, yyyy h:mm a") : ""}
                  {g.root.created_by_name && (
                    <p className="text-gray-500 mt-0.5">{g.root.created_by_name}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
                {piData.status === "sent" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRevise({ ...piData, _allVersions: versions }); }}
                    className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded font-medium hover:bg-purple-700"
                    title="Client asked for changes — create a new version"
                  >
                    Revise (V{(versions.filter(v => v.status === "sent").length || 1) + 1})
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); _openPIEditor(piData.id); }}
                    className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded font-medium hover:bg-teal-700"
                  >
                    Continue Draft
                  </button>
                )}
                {!piData.order && piData.status === "sent" && (
                  <button onClick={(e) => { e.stopPropagation(); handleConvertToOrder(piData); }} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700">
                    Convert to Order
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Client Picker Modal */}
      <Modal open={showClientPicker} onClose={() => { setShowClientPicker(false); setSelectedClient(""); }} title="Create Proforma Invoice">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Select an account to create a new Proforma Invoice.</p>
          <SearchableSelect
            label="Account"
            required
            value={selectedClient}
            onChange={(v) => setSelectedClient(v)}
            options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="Select Account"
          />
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreatePI} disabled={!selectedClient} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">Create PI</button>
            <button onClick={() => { setShowClientPicker(false); setSelectedClient(""); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title="Proforma Invoice Details" size="lg">
        {selectedPI && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-xs text-gray-500 block">PI Number</span><span className="font-medium">{selectedPI.invoice_number}</span></div>
              <div><span className="text-xs text-gray-500 block">Status</span><StatusBadge status={selectedPI.status} /></div>
              <div><span className="text-xs text-gray-500 block">Date</span><span className="font-medium">{selectedPI.invoice_date || "—"}</span></div>
              <div><span className="text-xs text-gray-500 block">Client</span><span className="font-medium">{selectedPI.client_company_name}</span></div>
              <div><span className="text-xs text-gray-500 block">Total</span><span className="font-medium">{selectedPI.currency} {Number(selectedPI.total).toLocaleString()}</span></div>
              {selectedPI.order_number && <div><span className="text-xs text-gray-500 block">Linked Order</span><span className="font-medium text-blue-600">{selectedPI.order_number}</span></div>}
              {selectedPI.terms_of_delivery && <div><span className="text-xs text-gray-500 block">Delivery Terms</span><span className="font-medium">{selectedPI.terms_of_delivery}</span></div>}
              {selectedPI.terms_of_trade && <div><span className="text-xs text-gray-500 block">Payment Terms</span><span className="font-medium">{selectedPI.terms_of_trade}</span></div>}
            </div>

            {/* Items */}
            {selectedPI.items && selectedPI.items.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Items</h4>
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="py-2 px-2 text-left">Product</th><th className="py-2 px-2 text-right">Qty</th><th className="py-2 px-2 text-right">Price</th><th className="py-2 px-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {selectedPI.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-2">{item.product_name || "—"}</td>
                        <td className="py-2 px-2 text-right">{Number(item.quantity).toLocaleString()} {item.unit}</td>
                        <td className="py-2 px-2 text-right">{Number(item.unit_price).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-medium">{Number(item.total_price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t">
              <button onClick={() => setShowReview(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
              <div className="flex gap-2">
                {!selectedPI.order && (
                  <button onClick={() => handleConvertToOrder(selectedPI)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Convert to Order</button>
                )}
                <button
                  onClick={() => {
                    setShowReview(false);
                    if (selectedPI.status === "draft") handleEditAndSend(selectedPI);
                    else _openPIEditor(selectedPI.id);
                  }}
                  className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
                >
                  {selectedPI.status === "draft" ? "Edit & Send" : "View PI"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* PI Editor Modal */}
      {piLoading && showPiModal && (
        <Modal open={true} onClose={() => setShowPiModal(false)} title="Loading PI..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}
      <PIEditorModal
        open={showPiModal && !piLoading}
        onClose={() => { setShowPiModal(false); loadPIs(); }}
        pi={pi} piForm={piForm} setPiForm={setPiForm}
        piItems={piItems} setPiItems={setPiItems}
        onSave={handleSavePI} onPreview={handlePreviewPI}
        onSend={handleSendPI} sending={piSending} sendLabel="Attach to Email"
      />
      <PdfViewer url={pdfView?.url} title={pdfView?.title} onClose={() => { if (pdfView?.url) URL.revokeObjectURL(pdfView.url); setPdfView(null); }} />
    </div>
  );
}
