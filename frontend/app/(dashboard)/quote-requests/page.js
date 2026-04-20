"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import PdfViewer from "@/components/ui/PdfViewer";

function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-100 text-green-800" : pct >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{pct}%</span>;
}

function ChannelBadge({ channel }) {
  const styles = {
    email: "bg-blue-100 text-blue-800",
    whatsapp: "bg-green-100 text-green-800",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[channel] || "bg-gray-100 text-gray-800"}`}>{channel === "whatsapp" ? "WhatsApp" : "Email"}</span>;
}

function stripHtml(html) {
  if (!html) return "";
  let text = html;
  // Convert block elements to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  text = text.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  // Collapse multiple blank lines but keep single line breaks
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export default function QuoteRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQR, setSelectedQR] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedHistory, setExpandedHistory] = useState(null); // qr.id of expanded version history
  const [showCreateQuote, setShowCreateQuote] = useState(false);
  const [clients, setClients] = useState([]);
  const [createClient, setCreateClient] = useState("");
  const [createClientSearch, setCreateClientSearch] = useState("");
  const [showCreateClientDD, setShowCreateClientDD] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);

  // Quotation editor state
  const [showQtModal, setShowQtModal] = useState(false);
  const [qt, setQt] = useState(null);
  const [qtForm, setQtForm] = useState({});
  const [qtLoading, setQtLoading] = useState(false);
  const [qtSending, setQtSending] = useState(false);
  const [pdfView, setPdfView] = useState(null); // { url, title }
  const [qtItems, setQtItems] = useState([]);

  const loadRequests = async () => {
    try {
      const res = await api.get("/communications/quote-requests/");
      setRequests(res.data.results || res.data);
    } catch { toast.error("Failed to load quote requests"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadRequests(); }, []);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === requests.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(requests.map((r) => r.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected inquiry${selectedIds.size > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/communications/quote-requests/${id}/`)));
      toast.success(`${selectedIds.size} inquiry${selectedIds.size > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      loadRequests();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const handleReview = (qr) => {
    setSelectedQR(qr);
    setShowReview(true);
  };

  // "Enter Rates" — open the Quotation Editor in-place so the executive can
  // type product/qty/price directly. If the inquiry already has a linked
  // quotation we open it; otherwise we create one (AI-prefilled from the
  // source email) and then open it. No detour through AI Draft — that's
  // only used at SEND time, not at rate-entry time.
  const handleEnterRates = async (qr) => {
    if (!qr.client) {
      toast.error("This inquiry has no client linked yet");
      return;
    }
    try {
      let quotationId = qr.linked_quotation;
      if (!quotationId) {
        const res = await api.post("/quotations/quotations/create-blank/", {
          client_id: qr.client,
          communication_id: qr.source_communication,
        });
        quotationId = res.data.id;
        loadRequests();
      }
      _openQuotationEditor(quotationId);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to open quotation")); }
  };

  const handleGenerateQuote = async (qr) => {
    try {
      const res = await api.post(`/communications/quote-requests/${qr.id}/generate-draft-quote/`);
      toast.success("Draft quotation generated! Enter rates now.");
      loadRequests();
      setShowReview(false);
      // Open the quotation editor immediately
      _openQuotationEditor(res.data.id || qr.linked_quotation);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to generate quote")); }
  };

  // Open existing linked quotation in editor
  const handleOpenQuote = (qr) => {
    if (qr.linked_quotation) {
      _openQuotationEditor(qr.linked_quotation);
      setShowReview(false);
    }
  };

  const _openQuotationEditor = async (quotationId) => {
    setQtLoading(true);
    setShowQtModal(true);
    try {
      const res = await api.get(`/quotations/quotations/${quotationId}/`);
      setQt(res.data);
      setQtForm(res.data);
      setQtItems(res.data.items || []);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load quotation")); setShowQtModal(false); }
    finally { setQtLoading(false); }
  };

  const handleSaveQt = async () => {
    if (!qt) return;
    try {
      // Collect _ prefixed keys into display_overrides for PDF/email
      const display_overrides = {};
      Object.entries(qtForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/quotations/quotations/${qt.id}/save-with-items/`, { ...qtForm, display_overrides, items: qtItems });
      setQt(res.data);
      setQtItems(res.data.items || []);
      toast.success("Quotation saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handlePreviewQt = async () => {
    if (!qt) return;
    const noRate = qtItems.some(item => !parseFloat(item.unit_price));
    if (noRate) {
      toast.error("Please enter rate for all products before previewing");
      return;
    }
    await handleSaveQt();
    try {
      const res = await api.get(`/quotations/quotations/${qt.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      setPdfView({ url: pdfUrl, title: `Quotation ${qt.quotation_number} - ${qt.client_name || "Client"}` });
    } catch { toast.error("Failed to preview"); }
  };

  // Save → generate PDF → attach to the source email's AI Draft, then jump
  // to the AI Draft modal so the user can review the full reply (body + the
  // freshly attached Quotation PDF) and click Send Reply when ready. Replaces
  // the old "send-to-client" flow which mailed the quote out directly.
  const handleAttachQt = async () => {
    if (!qt) return;
    const noRate = qtItems.some(item => !parseFloat(item.unit_price));
    if (noRate) {
      toast.error("Please enter rate for all products before attaching");
      return;
    }
    setQtSending(true);
    try {
      await handleSaveQt();
      const res = await api.post(`/quotations/quotations/${qt.id}/attach-to-email/`);
      toast.success("Quotation attached to email — review and send");
      setShowQtModal(false);
      const { client_id, communication_id } = res.data || {};
      if (client_id && communication_id) {
        router.push(`/clients/${client_id}?openDraftFor=${communication_id}`);
      } else {
        loadRequests();
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to attach")); }
    finally { setQtSending(false); }
  };

  // ── Revise an already-sent quotation: create v+1 of the linked quotation
  // (e.g. when the client comes back asking for changes) and open the new
  // version directly in the Quotation Editor for inline rate edits. The
  // editor's own Send button pushes it through email when ready.
  const handleReviseQuote = async (qr) => {
    if (!qr.linked_quotation) return;
    // Pick the LATEST version in the chain — not the originally-linked V1.
    // QuoteRequest.linked_quotation always points at V1, so naively reusing
    // it would always revise V1 → V2 instead of V2 → V3, V3 → V4, etc.
    const versions = qr.linked_quotation_versions || [];
    const latest = versions.length
      ? versions.reduce((a, b) => ((a.version || 1) >= (b.version || 1) ? a : b))
      : { id: qr.linked_quotation, version: qr.linked_quotation_version || 1 };
    if (!confirm(`Create a new version after V${latest.version}?\n\nThe previous version will be kept and the new V${(latest.version || 1) + 1} will open in the editor.`)) return;
    try {
      const res = await api.post(`/quotations/quotations/${latest.id}/revise/`);
      toast.success(`Revision V${res.data.version} created`);
      loadRequests();
      _openQuotationEditor(res.data.id);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create revision")); }
  };

  // ── Open a specific version chip:
  //   • DRAFT versions  → Quotation Editor (in-place) so the executive can
  //     enter rates and edit details directly. Editor has its own Send button
  //     when ready.
  //   • SENT versions   → open the saved PDF in a new tab as a read-only
  //     viewer. Once a version has been mailed out it must NOT be re-edited
  //     or re-sent — locked as a historical record.
  const openVersionInDraft = (qr, version) => {
    // Always open in the Quotation Editor — for sent versions the editor
    // loads read-only data so the user can see the original quotation details.
    _openQuotationEditor(version.id);
  };

  // ── Quick PDF viewer for sent quotations (read-only) ──
  const _viewQuotationPdf = async (quotationId) => {
    try {
      const res = await api.get(`/quotations/quotations/${quotationId}/generate-pdf/`, { responseType: "blob" });
      setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: "Quotation" });
    } catch { toast.error("Failed to load quotation PDF"); }
  };

  const _viewPiPdf = async (piId) => {
    try {
      const res = await api.get(`/finance/pi/${piId}/generate-pdf/`, { responseType: "blob" });
      setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: "Proforma Invoice" });
    } catch { toast.error("Failed to load PI PDF"); }
  };

  const handleReject = async (qr) => {
    try {
      await api.post(`/communications/quote-requests/${qr.id}/reject/`);
      toast.success("Quote request rejected");
      loadRequests();
      setShowReview(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed")); }
  };

  const handleStatusChange = async (qr, newStatus) => {
    try {
      await api.patch(`/communications/quote-requests/${qr.id}/`, { status: newStatus });
      toast.success("Status updated");
      loadRequests();
    } catch (err) { toast.error(getErrorMessage(err, "Failed")); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  return (
    <div>
      <PageHeader title="Inquiries" subtitle={`${requests.filter(r => r.status === "new").length} new inquiries`} action={
        <button onClick={() => {
          if (clients.length === 0) api.get("/clients/").then(r => setClients((r.data.results || r.data).filter(c => !c.company_name?.includes("(Auto-created)")))).catch(() => {});
          setCreateClient(""); setCreateClientSearch(""); setShowCreateQuote(true);
        }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Create Quote
        </button>
      } />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <input type="checkbox" checked={selectedIds.size === requests.length && requests.length > 0} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Select All */}
      {selectedIds.size === 0 && requests.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={false} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
          <span className="text-xs text-gray-400">Select all</span>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No inquiries yet.</p>
          <p className="text-sm text-gray-400 mt-1">Auto-generated when accounts request quotes via Email or WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((qr) => (
            <div key={qr.id}
              className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${selectedIds.has(qr.id) ? "border-indigo-400 bg-indigo-50/30" : qr.status === "new" ? "border-teal-300 bg-teal-50/30" : "border-gray-200"}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <input type="checkbox" checked={selectedIds.has(qr.id)} onChange={(e) => toggleSelect(qr.id, e)} className="h-4 w-4 mt-1 text-indigo-600 border-gray-300 rounded cursor-pointer flex-shrink-0" />
                  <div className="flex-1 cursor-pointer" onClick={() => handleReview(qr)}>
                  <div className="flex items-center gap-2 mb-1">
                    <ChannelBadge channel={qr.source_channel} />
                    {qr.client_auto_created && <span className="text-xs text-orange-600 font-medium">New Client</span>}
                  </div>
                  <h3 className="font-semibold text-sm">{qr.client_name || qr.sender_name || qr.sender_email || qr.sender_phone || "Unknown"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {qr.extracted_product || "Product not detected"}
                    {qr.extracted_quantity ? ` · ${qr.extracted_quantity} ${qr.extracted_unit}` : ""}
                    {qr.extracted_destination_country ? ` · ${qr.extracted_destination_country}` : ""}
                  </p>
                  {qr.source_subject && <p className="text-xs text-gray-400 mt-0.5 truncate">"{qr.source_subject}"</p>}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 flex-shrink-0">
                  {qr.created_at ? format(new Date(qr.created_at), "MMM d, h:mm a") : ""}
                  {qr.assigned_to_name && <p className="text-gray-500 mt-0.5">{qr.assigned_to_name}</p>}
                </div>
              </div>
              {/* Latest version chip + Version History toggle */}
              {(() => {
                const allQ = qr.linked_quotation_versions || [];
                const allPI = qr.linked_pi_versions || [];
                if (allQ.length === 0 && allPI.length === 0) return null;

                // Find the latest quotation and PI (prefer sent, then latest by date)
                const latestQ = [...allQ].reverse().find(v => v.status === "sent" || v.status === "approved" || v.status === "accepted") || allQ[allQ.length - 1];
                const latestPI = [...allPI].reverse().find(v => v.status === "sent") || (allPI.length > 0 ? allPI[allPI.length - 1] : null);
                const sentQ = allQ.filter(v => v.status === "sent" || v.status === "approved" || v.status === "accepted");
                const sentPI = allPI.filter(v => v.status === "sent");
                const totalSentVersions = sentQ.length + sentPI.length;
                const totalVersions = allQ.length + allPI.length;

                const renderChip = (v, type) => {
                  const isQuote = type === "quote";
                  const sent = isQuote ? (v.status === "sent" || v.status === "approved" || v.status === "accepted") : v.status === "sent";
                  const cls = sent
                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    : v.status === "rejected"
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
                  // Version number = count of sent versions up to this one (drafts don't count)
                  const sentVersionNum = isQuote
                    ? sentQ.filter(s => new Date(s.created_at) <= new Date(v.created_at)).length
                    : sentPI.filter(s => new Date(s.created_at) <= new Date(v.created_at)).length;
                  const displayVersion = sent ? sentVersionNum : `${sentVersionNum || sentQ.length} (Draft)`;
                  const label = isQuote ? `Quote V${displayVersion} · ${v.quotation_number}` : `PI V${displayVersion} · ${v.invoice_number}`;
                  return (
                    <button
                      key={`${type}-${v.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isQuote) { openVersionInDraft(qr, v); }
                        else if (sent) { _viewPiPdf(v.id); }
                        else { router.push(`/proforma-invoices?open=${v.id}`); }
                      }}
                      title={sent ? `${isQuote ? v.quotation_number : v.invoice_number} · sent — view PDF` : `${isQuote ? v.quotation_number : v.invoice_number} · draft`}
                      className={`text-left text-[10px] font-medium px-2 py-1 rounded border transition-colors ${cls}`}
                    >
                      <div className="font-semibold">{label} {sent ? "· Sent" : "· Draft"}</div>
                      <div className="font-normal opacity-80 leading-tight mt-0.5">
                        {v.created_by_name && <>Edited: {v.created_by_name}</>}
                        {v.created_at && <span className="ml-1 opacity-70">{format(new Date(v.created_at), "dd/MM HH:mm")}</span>}
                        {(isQuote ? v.sent_at : null) && <> · Sent: <span className="opacity-70">{format(new Date(v.sent_at), "dd/MM HH:mm")}</span></>}
                      </div>
                    </button>
                  );
                };

                return (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      {latestQ && renderChip(latestQ, "quote")}
                      {latestPI && renderChip(latestPI, "pi")}
                      {totalSentVersions > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedHistory(prev => prev === qr.id ? null : qr.id); }}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
                        >
                          {expandedHistory === qr.id ? "▾ Hide History" : `▸ Version History (${totalSentVersions})`}
                        </button>
                      )}
                    </div>
                    {expandedHistory === qr.id && (
                      <div className="mt-2 ml-7 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Version History</p>
                        {sentQ.map((v, idx) => {
                          const sent = true;
                          const prev = idx > 0 ? sentQ[idx - 1] : null;
                          // Compute changes from previous version
                          const changes = [];
                          if (prev && v.items && prev.items) {
                            const vi = v.items || []; const pi = prev.items || [];
                            vi.forEach((item, i) => {
                              const old = pi[i];
                              if (!old) { changes.push(`Added ${item.product_name || "item"}`); return; }
                              if (item.product_name !== old.product_name && item.product_name) changes.push(`Product: ${old.product_name || "—"} → ${item.product_name}`);
                              if (Number(item.unit_price) !== Number(old.unit_price)) changes.push(`Price: ${old.unit_price || 0} → ${item.unit_price}`);
                              if (Number(item.quantity) !== Number(old.quantity)) changes.push(`Qty: ${old.quantity || 0} → ${item.quantity} ${item.unit || ""}`);
                            });
                            if (vi.length < pi.length) changes.push(`Removed ${pi.length - vi.length} item(s)`);
                            if (v.currency !== prev.currency) changes.push(`Currency: ${prev.currency} → ${v.currency}`);
                            if (v.delivery_terms !== prev.delivery_terms) changes.push(`Terms: ${prev.delivery_terms} → ${v.delivery_terms}`);
                          }
                          return (
                            <div key={`qh-${v.id}`} className="text-[10px] py-1.5 border-b border-gray-100 last:border-0">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openVersionInDraft(qr, v); }}
                                  className={`font-semibold hover:underline ${sent ? "text-green-700" : v.status === "rejected" ? "text-red-700" : "text-amber-700"}`}
                                >
                                  Quote V{idx + 1} · {v.quotation_number}
                                </button>
                                <div className="text-gray-500 flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${sent ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                    {sent ? "Sent" : "Draft"}
                                  </span>
                                  {v.created_by_name && <span>by {v.created_by_name}</span>}
                                  {v.created_at && <span>{format(new Date(v.created_at), "dd/MM/yy HH:mm")}</span>}
                                  {v.sent_at && <span className="text-green-600">Sent {format(new Date(v.sent_at), "dd/MM/yy HH:mm")}</span>}
                                </div>
                              </div>
                              {/* Items summary */}
                              {v.items && v.items.length > 0 && (
                                <div className="mt-1 ml-2 text-gray-500">
                                  {v.items.map((item, i) => (
                                    <span key={i} className="inline-block mr-2">
                                      {item.product_name}{item.quantity ? ` · ${item.quantity} ${item.unit || ""}` : ""}{item.unit_price ? ` · ${v.currency || "$"}${Number(item.unit_price).toLocaleString()}` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Changes from previous version */}
                              {changes.length > 0 && (
                                <div className="mt-1 ml-2 flex flex-wrap gap-1">
                                  {changes.map((c, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px]">{c}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {sentPI.map((v, piIdx) => {
                          const sent = true;
                          return (
                            <div key={`pih-${v.id}`} className="text-[10px] py-1.5 border-b border-gray-100 last:border-0">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={(e) => { e.stopPropagation(); sent ? _viewPiPdf(v.id) : router.push(`/proforma-invoices?open=${v.id}`); }}
                                  className={`font-semibold hover:underline ${sent ? "text-green-700" : "text-amber-700"}`}
                                >
                                  PI V{piIdx + 1} · {v.invoice_number}
                                </button>
                                <div className="text-gray-500 flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${sent ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                    {sent ? "Sent" : "Draft"}
                                  </span>
                                  {v.created_by_name && <span>by {v.created_by_name}</span>}
                                  {v.created_at && <span>{format(new Date(v.created_at), "dd/MM/yy HH:mm")}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-end">
                {qr.linked_quotation_status === "sent" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReviseQuote(qr); }}
                    className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded font-medium hover:bg-purple-700"
                    title="Client asked for changes — create a new version"
                  >
                    Revise (V{((qr.linked_quotation_versions || []).filter(v => v.status === "sent" || v.status === "approved" || v.status === "accepted").length || 1) + 1})
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEnterRates(qr); }}
                    className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded font-medium hover:bg-teal-700"
                    title="Open AI Draft to enter rates and send"
                  >
                    Enter Rates
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title="Quote Request Review" size="lg">
        {selectedQR && (
          <div className="space-y-4">
            {/* Source Message */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ChannelBadge channel={selectedQR.source_channel} />
                <ConfidenceBadge value={selectedQR.ai_confidence} />
              </div>
              {selectedQR.source_subject && <p className="font-medium text-sm mb-1">{selectedQR.source_subject}</p>}
              <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{stripHtml(selectedQR.source_body)}</p>
            </div>

            {/* Sender Info */}
            <div className="grid grid-cols-3 gap-3">
              <div><span className="text-xs text-gray-500 block">Sender</span><span className="text-sm font-medium">{selectedQR.sender_name || "—"}</span></div>
              <div><span className="text-xs text-gray-500 block">Email</span><span className="text-sm">{selectedQR.sender_email || "—"}</span></div>
              <div><span className="text-xs text-gray-500 block">Phone</span><span className="text-sm">{selectedQR.sender_phone || "—"}</span></div>
            </div>

            {/* Client Match */}
            <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
              <div className="flex-1">
                <span className="text-xs text-gray-500 block">Matched Client</span>
                <span className="text-sm font-medium">{selectedQR.client_name || "No client matched"}</span>
              </div>
              {selectedQR.client_auto_created && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">Auto-created</span>
              )}
            </div>

            {/* Extracted Fields */}
            <div>
              <h4 className="text-sm font-semibold mb-2">AI Extracted Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Product</span><span className="text-sm font-medium">{selectedQR.extracted_product || "—"}</span></div>
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Quantity</span><span className="text-sm font-medium">{selectedQR.extracted_quantity ? `${selectedQR.extracted_quantity} ${selectedQR.extracted_unit}` : "—"}</span></div>
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Destination</span><span className="text-sm font-medium">{selectedQR.extracted_destination_country || "—"}</span></div>
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Port</span><span className="text-sm font-medium">{selectedQR.extracted_destination_port || "—"}</span></div>
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Delivery Terms</span><span className="text-sm font-medium">{selectedQR.extracted_delivery_terms || "—"}</span></div>
                <div className="p-2 bg-white border rounded"><span className="text-xs text-gray-500 block">Payment Terms</span><span className="text-sm font-medium">{selectedQR.extracted_payment_terms || "—"}</span></div>
                {selectedQR.extracted_packaging && <div className="p-2 bg-white border rounded col-span-2"><span className="text-xs text-gray-500 block">Packaging</span><span className="text-sm">{selectedQR.extracted_packaging}</span></div>}
                {selectedQR.extracted_notes && <div className="p-2 bg-white border rounded col-span-2"><span className="text-xs text-gray-500 block">Notes</span><span className="text-sm">{selectedQR.extracted_notes}</span></div>}
              </div>
            </div>

            {/* Linked Quotation */}
            {selectedQR.linked_quotation_number && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">{selectedQR.linked_quotation_status === "sent" ? "Sent" : "Draft"} Quotation: {selectedQR.linked_quotation_number}</span>
                {selectedQR.linked_quotation_status === "sent" ? (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg">Mail Sent</span>
                    <button onClick={() => handleReviseQuote(selectedQR)} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700">
                      Revise (V{(selectedQR.linked_quotation_version || 1) + 1})
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleEnterRates(selectedQR)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">Open & Enter Rates</button>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                {selectedQR.status === "new" && (
                  <button onClick={() => { handleStatusChange(selectedQR, "reviewed"); setShowReview(false); }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Mark Reviewed</button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedQR.linked_quotation_status === "sent" ? (
                  <>
                    <span className="px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">Mail Sent</span>
                    <button onClick={() => handleReviseQuote(selectedQR)} className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">
                      Revise (V{(selectedQR.linked_quotation_version || 1) + 1})
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleEnterRates(selectedQR)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">Open AI Draft & Enter Rates</button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Quotation Editor Modal — for entering rates */}
      {qtLoading && showQtModal && (
        <Modal open={true} onClose={() => setShowQtModal(false)} title="Loading Quotation..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}
      <QuotationEditorModal
        open={showQtModal && !qtLoading}
        onClose={() => { setShowQtModal(false); loadRequests(); }}
        qt={qt} qtForm={qtForm} setQtForm={setQtForm}
        qtItems={qtItems} setQtItems={setQtItems}
        onSave={handleSaveQt} onPreview={handlePreviewQt}
        onSend={handleAttachQt} sending={qtSending} sendLabel="Attach to Email"
      />
      <PdfViewer url={pdfView?.url} title={pdfView?.title} onClose={() => { if (pdfView?.url) URL.revokeObjectURL(pdfView.url); setPdfView(null); }} />

      {/* Create Quote Modal */}
      <Modal open={showCreateQuote} onClose={() => setShowCreateQuote(false)} title="Create Quote" size="sm">
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <input
              value={createClientSearch || (createClient ? clients.find(c => c.id === createClient)?.company_name || "" : "")}
              onChange={(e) => { setCreateClientSearch(e.target.value); if (!e.target.value) setCreateClient(""); setShowCreateClientDD(true); }}
              onFocus={() => setShowCreateClientDD(true)}
              onBlur={() => setTimeout(() => setShowCreateClientDD(false), 200)}
              placeholder="Search client..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
            {showCreateClientDD && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {clients.filter(c => !createClientSearch || c.company_name?.toLowerCase().includes(createClientSearch.toLowerCase())).map(c => (
                  <div key={c.id} onMouseDown={() => { setCreateClient(c.id); setCreateClientSearch(""); setShowCreateClientDD(false); }}
                    className={`px-3 py-2 text-sm cursor-pointer transition-colors ${c.id === createClient ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                    {c.company_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              disabled={!createClient || creatingQuote}
              onClick={async () => {
                setCreatingQuote(true);
                try {
                  const res = await api.post("/quotations/quotations/create-blank/", { client_id: createClient });
                  toast.success(`Quotation ${res.data.quotation_number} created`);
                  setShowCreateQuote(false);
                  loadRequests();
                  _openQuotationEditor(res.data.id);
                } catch (err) { toast.error(getErrorMessage(err, "Failed to create quote")); }
                finally { setCreatingQuote(false); }
              }}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {creatingQuote ? "Creating..." : "Create & Edit"}
            </button>
            <button onClick={() => setShowCreateQuote(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
