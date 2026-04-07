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

  // Quotation editor state
  const [showQtModal, setShowQtModal] = useState(false);
  const [qt, setQt] = useState(null);
  const [qtForm, setQtForm] = useState({});
  const [qtLoading, setQtLoading] = useState(false);
  const [qtSending, setQtSending] = useState(false);
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

  // "Enter Rates" — navigate to the client's Communications tab and auto-open
  // the AI Draft Reply modal for the source email. The Generate Quotation
  // button inside that modal lets the user open the editor with values
  // pre-filled from the email.
  const handleEnterRates = (qr) => {
    if (!qr.client) {
      toast.error("This inquiry has no client linked yet");
      return;
    }
    router.push(`/clients/${qr.client}?openDraftFor=${qr.source_communication}`);
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
      const title = `Quotation ${qt.quotation_number} - ${qt.client_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendQt = async () => {
    if (!qt) return;
    const noRate = qtItems.some(item => !parseFloat(item.unit_price));
    if (noRate) {
      toast.error("Please enter rate for all products before sending");
      return;
    }
    setQtSending(true);
    try {
      await handleSaveQt();
      await api.post(`/quotations/quotations/${qt.id}/send-to-client/`, { send_via: "email" });
      toast.success("Quotation sent!");
      setShowQtModal(false);
      loadRequests();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setQtSending(false); }
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
      <PageHeader title="Inquiries" subtitle={`${requests.filter(r => r.status === "new").length} new inquiries`} />

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
                    <ConfidenceBadge value={qr.ai_confidence} />
                    <StatusBadge status={qr.status} />
                    {qr.client_auto_created && <span className="text-xs text-orange-600 font-medium">New Client</span>}
                  </div>
                  <h3 className="font-semibold text-sm">{qr.extracted_product || "Product not detected"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {qr.sender_name || qr.sender_email || qr.sender_phone || "Unknown sender"}
                    {qr.client_name ? ` · ${qr.client_name}` : ""}
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
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                {qr.linked_quotation_number ? (
                  <>
                    <span className="text-xs text-green-600 font-medium">{qr.linked_quotation_status === "sent" ? "Sent" : "Draft"}: {qr.linked_quotation_number}</span>
                    {qr.linked_quotation_status === "sent" ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">Mail Sent</span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); handleEnterRates(qr); }} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded font-medium hover:bg-teal-700">Enter Rates</button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-400">No quotation linked</span>
                    <button onClick={(e) => { e.stopPropagation(); handleEnterRates(qr); }} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded font-medium hover:bg-teal-700">Enter Rates</button>
                  </>
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
                  <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg">Mail Sent</span>
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
                  <span className="px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">Mail Sent</span>
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
        onSend={handleSendQt} sending={qtSending}
      />
    </div>
  );
}
