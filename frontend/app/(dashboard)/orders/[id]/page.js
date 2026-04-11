"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import PIEditorModal from "@/components/finance/PIEditorModal";
import CIEditorModal from "@/components/finance/CIEditorModal";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import LIEditorModal from "@/components/finance/LIEditorModal";

function fmtDate(d) { if (!d) return "\u2014"; try { return format(new Date(d), "MMM d, yyyy"); } catch { return "\u2014"; } }
function fmtDateTime(d) { if (!d) return ""; try { return format(new Date(d), "MMM d h:mm a"); } catch { return ""; } }

function StatusStepper({ timeline }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 overflow-x-auto">
      <h3 className="font-semibold mb-4">Order Progress</h3>
      <div className="flex gap-0 min-w-max">
        {timeline.map((step, i) => (
          <div key={step.status} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                step.state === "completed" ? "bg-green-500 border-green-500 text-white" :
                step.state === "current" ? "bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100" :
                "bg-white border-gray-300 text-gray-400"
              }`}>
                {step.state === "completed" ? "\u2713" : i + 1}
              </div>
              <p className={`text-[10px] mt-1 text-center w-20 leading-tight ${
                step.state === "current" ? "text-indigo-700 font-semibold" :
                step.state === "completed" ? "text-green-700" : "text-gray-400"
              }`}>{step.label}</p>
              {step.timestamp && <p className="text-[8px] text-gray-400">{fmtDate(step.timestamp)}</p>}
            </div>
            {i < timeline.length - 1 && (
              <div className={`w-8 h-0.5 -mt-5 ${step.state === "completed" ? "bg-green-500" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const currentUser = useSelector((state) => state.auth.user);
  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "manager";
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [showPifModal, setShowPifModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [poFile, setPoFile] = useState(null);
  const [poNumber, setPoNumber] = useState("");
  const [pifFile, setPifFile] = useState(null);
  const [pifNumber, setPifNumber] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docType, setDocType] = useState("other");
  const [docName, setDocName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [orderDocs, setOrderDocs] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPiModal, setShowPiModal] = useState(false);
  const [pi, setPi] = useState(null);
  const [piForm, setPiForm] = useState({});
  const [piLoading, setPiLoading] = useState(false);
  const [piSending, setPiSending] = useState(false);
  const [piItems, setPiItems] = useState([]);
  const [showCiModal, setShowCiModal] = useState(false);
  const [ci, setCi] = useState(null);
  const [ciForm, setCiForm] = useState({});
  const [ciLoading, setCiLoading] = useState(false);
  const [ciSending, setCiSending] = useState(false);
  const [ciItems, setCiItems] = useState([]);
  const [showLiModal, setShowLiModal] = useState(false);
  const [li, setLi] = useState(null);
  const [liForm, setLiForm] = useState({});
  const [liItems, setLiItems] = useState([]);
  const [liLoading, setLiLoading] = useState(false);
  const [liSending, setLiSending] = useState(false);
  const [showQtModal, setShowQtModal] = useState(false);
  const [qt, setQt] = useState(null);
  const [qtForm, setQtForm] = useState({});
  const [qtLoading, setQtLoading] = useState(false);
  const [qtSending, setQtSending] = useState(false);
  const [qtItems, setQtItems] = useState([]);

  const loadOrder = () => {
    Promise.all([
      api.get(`/orders/${id}/`),
      api.get(`/orders/${id}/timeline/`),
      api.get(`/orders/${id}/status-history/`),
      api.get(`/orders/${id}/events/`),
    ]).then(([o, t, h, e]) => {
      setOrder(o.data); setTimeline(t.data); setHistory(h.data); setEvents(e.data);
      // Load order documents with file URLs
      if (o.data.id) {
        api.get(`/orders/${o.data.id}/documents/`).then(r => setOrderDocs(r.data || [])).catch(() => {});
      }
    }).catch(() => toast.error("Failed to load order"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadOrder(); }, [id]);

  const handleTransition = async (newStatus) => {
    setTransitioning(true);
    try {
      await api.post(`/orders/${id}/transition/`, { status: newStatus, remarks });
      toast.success(`Moved to ${newStatus.replace(/_/g, " ")}`);
      setRemarks("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Transition failed")); }
    finally { setTransitioning(false); }
  };

  const handleRevert = async () => {
    if (!confirm(`Revert order to "${order.revert_to?.label}"? This will undo the current stage.`)) return;
    setTransitioning(true);
    try {
      await api.post(`/orders/${id}/revert/`, { remarks });
      toast.success(`Reverted to ${order.revert_to?.label}`);
      setRemarks("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Revert failed")); }
    finally { setTransitioning(false); }
  };

  const handleUploadPo = async (e) => {
    e.preventDefault();
    if (!poFile) return;
    const fd = new FormData();
    fd.append("po_document", poFile);
    fd.append("po_number", poNumber);
    try {
      await api.post(`/orders/${id}/upload-po/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("PO uploaded");
      setShowPoModal(false); setPoFile(null); setPoNumber("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Upload failed")); }
  };

  const handleUploadPif = async (e) => {
    e.preventDefault();
    if (!pifFile) return;
    const fd = new FormData();
    fd.append("file", pifFile);
    fd.append("doc_type", "pif");
    fd.append("name", pifNumber ? `PIF-${pifNumber}` : pifFile.name);
    try {
      await api.post(`/orders/${id}/upload-document/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("PIF uploaded");
      setShowPifModal(false); setPifFile(null); setPifNumber("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Upload failed")); }
  };

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!docFile) return;
    const fd = new FormData();
    fd.append("file", docFile);
    fd.append("doc_type", docType);
    fd.append("name", docName || docFile.name);
    try {
      await api.post(`/orders/${id}/upload-document/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      setShowDocModal(false); setDocFile(null); setDocType("other"); setDocName("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Upload failed")); }
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/orders/${id}/download-pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url;
      a.setAttribute("download", `${order.order_number}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error("Failed to download"); }
  };

  // ── PI Handlers ──
  const handleGeneratePI = async () => {
    setPiLoading(true);
    setShowPiModal(true);
    try {
      // Check if PI already exists for this order
      const existing = await api.get(`/finance/pi/`, { params: { order: id } });
      const piList = existing.data.results || existing.data;
      if (piList.length > 0) {
        setPi(piList[0]);
        setPiForm(piList[0]);
        setPiItems(piList[0].items || []);
      } else {
        const res = await api.post(`/finance/pi/create-from-order/`, { order_id: id });
        setPi(res.data);
        setPiForm(res.data);
        setPiItems(res.data.items || []);
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to generate PI")); setShowPiModal(false); }
    finally { setPiLoading(false); }
  };

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

  const handlePreviewPI = async () => {
    if (!pi) return;
    await handleSavePI();
    try {
      const res = await api.get(`/finance/pi/${pi.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = `PI ${pi.invoice_number} - ${pi.client_company_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendPI = async () => {
    if (!pi) return;
    setPiSending(true);
    try {
      await handleSavePI();
      const res = await api.post(`/finance/pi/${pi.id}/send-email/`);
      toast.success(`PI sent to ${res.data.sent_to}`);
      setShowPiModal(false);
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send PI")); }
    finally { setPiSending(false); }
  };

  // ── LI Handlers ──
  const handleGenerateLI = async () => {
    setLiLoading(true);
    setShowLiModal(true);
    try {
      const existing = await api.get(`/finance/li/`, { params: { order: id } });
      const liList = existing.data.results || existing.data;
      if (liList.length > 0) {
        setLi(liList[0]); setLiForm({ ...liList[0], ...liList[0].display_overrides }); setLiItems(liList[0].items || []);
      } else {
        const res = await api.post(`/finance/li/create-from-order/`, { order_id: id });
        setLi(res.data); setLiForm({ ...res.data, ...res.data.display_overrides }); setLiItems(res.data.items || []);
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to generate LI")); setShowLiModal(false); }
    finally { setLiLoading(false); }
  };

  const handleSaveLI = async () => {
    if (!li) return;
    try {
      const display_overrides = {};
      Object.entries(liForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/finance/li/${li.id}/save-with-items/`, { ...liForm, display_overrides, items: liItems });
      setLi(res.data); setLiForm({ ...res.data, ...res.data.display_overrides }); setLiItems(res.data.items || []);
      toast.success("LI saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handlePreviewLI = async () => {
    if (!li) return;
    await handleSaveLI();
    try {
      const res = await api.get(`/finance/li/${li.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = `LI ${li.invoice_number} - ${li.client_company_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendLI = async () => {
    if (!li) return;
    await handleSaveLI();
    setLiSending(true);
    try {
      const res = await api.post(`/finance/li/${li.id}/send-email/`);
      toast.success(`LI sent to ${res.data.sent_to}`);
      setShowLiModal(false);
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send LI")); }
    finally { setLiSending(false); }
  };

  // ── CI Handlers ──
  const handleGenerateCI = async () => {
    setCiLoading(true);
    setShowCiModal(true);
    try {
      const existing = await api.get(`/finance/ci/`, { params: { order: id } });
      const ciList = existing.data.results || existing.data;
      if (ciList.length > 0) {
        setCi(ciList[0]);
        setCiForm(ciList[0]);
        setCiItems(ciList[0].items || []);
      } else {
        const res = await api.post(`/finance/ci/create-from-order/`, { order_id: id });
        setCi(res.data);
        setCiForm(res.data);
        setCiItems(res.data.items || []);
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to generate CI")); setShowCiModal(false); }
    finally { setCiLoading(false); }
  };

  const handleSaveCI = async () => {
    if (!ci) return;
    try {
      const display_overrides = {};
      Object.entries(ciForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/finance/ci/${ci.id}/save-with-items/`, { ...ciForm, display_overrides, items: ciItems });
      setCi(res.data);
      setCiItems(res.data.items || []);
      toast.success("CI saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handlePreviewCI = async () => {
    if (!ci) return;
    await handleSaveCI();
    try {
      const res = await api.get(`/finance/ci/${ci.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = `CI ${ci.invoice_number} - ${ci.client_company_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendCI = async () => {
    if (!ci) return;
    setCiSending(true);
    try {
      await handleSaveCI();
      const res = await api.post(`/finance/ci/${ci.id}/send-email/`);
      toast.success(`CI sent to ${res.data.sent_to}`);
      setShowCiModal(false);
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send CI")); }
    finally { setCiSending(false); }
  };

  // ── Quotation Handlers ──
  const handleGenerateQt = async () => {
    setQtLoading(true);
    setShowQtModal(true);
    try {
      // Check if quotation already linked to this order
      if (order?.quotation) {
        const res = await api.get(`/quotations/quotations/${order.quotation}/`);
        setQt(res.data);
        setQtForm(res.data);
        setQtItems(res.data.items || []);
      } else {
        const res = await api.post(`/quotations/quotations/create-from-order/`, { order_id: id });
        setQt(res.data);
        setQtForm(res.data);
        setQtItems(res.data.items || []);
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to generate Quotation")); setShowQtModal(false); }
    finally { setQtLoading(false); }
  };

  const handleSaveQt = async () => {
    if (!qt) return;
    try {
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
    await handleSaveQt();
    try {
      const res = await api.get(`/quotations/quotations/${qt.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = `Quotation ${qt.quotation_number} - ${order?.client_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendQt = async () => {
    if (!qt) return;
    setQtSending(true);
    try {
      await handleSaveQt();
      const res = await api.post(`/quotations/quotations/${qt.id}/send-to-client/`, { send_via: "email" });
      toast.success("Quotation sent!");
      setShowQtModal(false);
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send Quotation")); }
    finally { setQtSending(false); }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!order) return <p className="text-center text-gray-500 py-8">Order not found</p>;

  return (
    <div>
      <PageHeader
        title={`Order ${order.order_number}`}
        subtitle={`${order.client_name} \u00b7 ${order.currency} ${Number(order.total).toLocaleString()}`}
        action={
          <div className="flex gap-2">
            <button onClick={handleGenerateQt} className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">Generate Quotation</button>
            <button onClick={handleGeneratePI} className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">Generate PI</button>
            <button onClick={handleGenerateCI} className="px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">Generate CI</button>
            <button onClick={handleGenerateLI} className="px-3 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700">Generate LI</button>
            <button onClick={handleDownloadPDF} className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">PDF</button>
            <button onClick={() => setShowDocModal(true)} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Upload Doc</button>
            <button onClick={() => router.back()} className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Back</button>
          </div>
        }
      />

      <StatusStepper timeline={timeline} />

      {/* Action Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Current:</h3>
            <StatusBadge status={order.status} />
          </div>
          <div className="flex items-center gap-2">
            {(order.status === "confirmed" || order.status === "po_received") && !order.po_document && (
              <button onClick={() => setShowPoModal(true)} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium hover:bg-amber-200 flex items-center gap-1">
                📎 Upload PO
              </button>
            )}
            {order.po_document && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✅ PO</span>
            )}
            {["po_received", "pif_sent"].includes(order.status) && !orderDocs.some(d => d.doc_type === "pif") && (
              <button onClick={() => setShowPifModal(true)} className="px-3 py-1.5 text-xs bg-purple-100 text-purple-800 rounded-lg font-medium hover:bg-purple-200 flex items-center gap-1">
                📎 Upload PIF
              </button>
            )}
            {orderDocs.some(d => d.doc_type === "pif") && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✅ PIF</span>
            )}
          </div>
        </div>

        {order.allowed_transitions?.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              {order.allowed_transitions.filter((t) => t.status !== "cancelled").map((t) => {
                // Block PO Received if no PO document uploaded
                const needsPO = t.status === "po_received" && !order.po_document;
                const needsPIF = (t.status === "pif_sent" && !orderDocs.some(d => d.doc_type === "pif")) ||
                  (t.status === "docs_preparing" && order.status === "pif_sent" && !orderDocs.some(d => d.doc_type === "pif"));
                const blocked = needsPO || needsPIF;
                return (
                  <div key={t.status} className="flex items-center gap-1">
                    <button onClick={() => {
                      if (needsPO) { toast.error("Upload PO first"); setShowPoModal(true); return; }
                      if (needsPIF) { toast.error("Upload PIF document first"); setShowPifModal(true); return; }
                      handleTransition(t.status);
                    }} disabled={transitioning}
                      className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${blocked ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                      {transitioning ? "..." : `\u2192 ${t.label}`}
                    </button>
                    {needsPO && (
                      <button onClick={() => setShowPoModal(true)} className="px-3 py-2 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium hover:bg-amber-200 flex items-center gap-1">
                        📎 Upload PO
                      </button>
                    )}
                    {needsPIF && (
                      <button onClick={() => setShowPifModal(true)} className="px-3 py-2 text-xs bg-purple-100 text-purple-800 rounded-lg font-medium hover:bg-purple-200 flex items-center gap-1">
                        📎 Upload PIF
                      </button>
                    )}
                  </div>
                );
              })}
              {order.can_revert && order.revert_to && (
                <button onClick={handleRevert} disabled={transitioning}
                  className="px-4 py-2 text-amber-700 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-50 disabled:opacity-50">
                  ← Revert to {order.revert_to.label}
                </button>
              )}
              {order.allowed_transitions.some((t) => t.status === "cancelled") && (
                <button onClick={() => { if (confirm("Cancel this order?")) handleTransition("cancelled"); }}
                  className="px-4 py-2 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50">Cancel Order</button>
              )}
            </div>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}
        {(!order.allowed_transitions || order.allowed_transitions.length === 0) && order.can_revert && order.revert_to && (
          <div className="mt-2">
            <button onClick={handleRevert} disabled={transitioning}
              className="px-4 py-2 text-amber-700 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-50 disabled:opacity-50">
              ← Revert to {order.revert_to.label}
            </button>
          </div>
        )}
        {order.status === "arrived" && <p className="text-green-700 font-medium text-sm mt-2">Order delivered successfully.</p>}
        {order.status === "cancelled" && <p className="text-red-700 font-medium text-sm mt-2">This order has been cancelled.</p>}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {[{ key: "details", label: "Details" }, { key: "history", label: "Status History" }, { key: "documents", label: "Documents" }].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === tab.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Order Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500 block text-xs">Order #</span>{order.order_number}</div>
              <div><span className="text-gray-500 block text-xs">Client</span>{order.client_name}</div>
              <div><span className="text-gray-500 block text-xs">Delivery Terms</span>{order.delivery_terms}</div>
              <div><span className="text-gray-500 block text-xs">Payment Terms</span>{order.payment_terms || "\u2014"}</div>
              <div><span className="text-gray-500 block text-xs">Freight</span>{order.freight_terms || "\u2014"}</div>
              <div><span className="text-gray-500 block text-xs">Created</span>{fmtDate(order.created_at)}</div>
              {order.po_number && <div><span className="text-gray-500 block text-xs">PO Number</span>{order.po_number}</div>}
            </div>
          </div>
          {order.items?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold mb-4">Line Items</h3>
              <table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2 text-gray-500">#</th><th className="text-left py-2 text-gray-500">Product</th><th className="text-right py-2 text-gray-500">Qty</th><th className="text-right py-2 text-gray-500">Total</th></tr></thead>
              <tbody>{order.items.map((item, i) => (<tr key={item.id} className="border-b border-gray-100"><td className="py-2">{i+1}</td><td className="py-2">{item.product_name}</td><td className="py-2 text-right">{Number(item.quantity).toLocaleString()} {item.unit}</td><td className="py-2 text-right font-medium">{Number(item.total_price).toLocaleString()}</td></tr>))}</tbody></table>
              <div className="text-right mt-2 pt-2 border-t font-bold">{order.currency} {Number(order.total).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Status History</h3>
            <span className="text-xs text-gray-400">{history.length} change{history.length !== 1 ? "s" : ""}</span>
          </div>
          {history.length === 0 ? <p className="text-gray-400 text-sm">No changes yet</p> : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
              <div className="space-y-0">
                {history.map((h, i) => {
                  const isRevert = h.remarks?.toLowerCase().includes("revert");
                  const isDocDelete = h.from_status === "document_deleted";
                  const isDocRestore = h.from_status === "document_restored";
                  const timeDiff = i > 0 ? (() => {
                    const prev = new Date(history[i-1].created_at);
                    const curr = new Date(h.created_at);
                    const diff = Math.abs(curr - prev);
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
                    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
                  })() : null;
                  return (
                    <div key={h.id} className="relative pl-10 pb-6">
                      {/* Dot */}
                      <div className={`absolute left-2.5 top-1 w-3.5 h-3.5 rounded-full border-2 border-white z-10 ${
                        isDocDelete ? "bg-red-400" : isDocRestore ? "bg-blue-400" : isRevert ? "bg-amber-400" : i === history.length - 1 ? "bg-indigo-600" : "bg-green-500"
                      }`} />
                      {/* Content */}
                      <div className={`p-3 rounded-lg ${isDocDelete ? "bg-red-50 border border-red-200" : isDocRestore ? "bg-blue-50 border border-blue-200" : isRevert ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {isDocDelete ? (
                            <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Document Deleted</span>
                          ) : isDocRestore ? (
                            <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Document Restored</span>
                          ) : (
                            <>
                              <StatusBadge status={h.from_status} />
                              <span className="text-gray-400">&rarr;</span>
                              <StatusBadge status={h.to_status} />
                            </>
                          )}
                          {isRevert && <span className="text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full font-medium">Reverted</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            {h.changed_by_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {fmtDateTime(h.created_at)}
                          </span>
                          {timeDiff && <span className="text-gray-400">({timeDiff} after previous)</span>}
                        </div>
                        {h.remarks && (
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-600 bg-white rounded px-2 py-1 border border-gray-100 flex-1">
                              💬 {h.remarks.replace(/\s*\[doc_id:\w+[-\w]*\]/, '')}
                            </p>
                            {isDocDelete && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  // Try doc_id from remarks tag first, fallback to searching by name
                                  const match = h.remarks?.match(/\[doc_id:([\w-]+)\]/);
                                  let docId = match ? match[1] : null;
                                  if (!docId) {
                                    // Fallback: extract doc name from remarks and search
                                    const nameMatch = h.remarks?.match(/Deleted document:\s*"([^"]+)"/);
                                    if (nameMatch) {
                                      try {
                                        // Try to find the soft-deleted doc by name via restore with name
                                        const res = await api.post(`/orders/${id}/restore-document/`, { doc_name: nameMatch[1] });
                                        toast.success("Document restored");
                                        loadOrder();
                                        return;
                                      } catch { toast.error("Failed to restore"); return; }
                                    }
                                    toast.error("Cannot identify document to restore");
                                    return;
                                  }
                                  try {
                                    await api.post(`/orders/${id}/restore-document/`, { doc_id: docId });
                                    toast.success("Document restored");
                                    loadOrder();
                                  } catch { toast.error("Failed to restore — document may already be restored"); }
                                }}
                                className="ml-2 shrink-0 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Documents ({orderDocs.length})</h3>
            <button onClick={() => setShowDocModal(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg">+ Upload</button>
          </div>
          {orderDocs.length === 0 ? <p className="text-gray-400 text-sm">No documents uploaded</p> : (
            <div className="space-y-2">{orderDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                onClick={async () => {
                  if (!doc.file) return;
                  const url = doc.file.startsWith("http") ? doc.file : `http://localhost:8000${doc.file}`;
                  try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const ext = (doc.name || doc.file).split(".").pop()?.toLowerCase();
                    if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) {
                      setPreviewDoc(doc); setPreviewUrl(blobUrl);
                    } else if (ext === "pdf") {
                      setPreviewDoc(doc); setPreviewUrl(blobUrl);
                    } else {
                      const a = document.createElement("a"); a.href = blobUrl; a.download = doc.name || "document"; a.click();
                    }
                  } catch { toast.error("Failed to open document"); }
                }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{{"pdf":"📄","doc":"📝","docx":"📝","xls":"📊","xlsx":"📊","jpg":"🖼️","jpeg":"🖼️","png":"🖼️","pi":"📋","po":"📦"}[(doc.name || doc.file || "").split(".").pop()?.toLowerCase()] || {"pi":"📋","po":"📦","commercial_invoice":"📑","packing_list":"📦","bl":"🚢","coa":"🧪","insurance":"🛡️"}[doc.doc_type] || "📎"}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                    <p className="text-xs text-gray-500">{doc.doc_type} · {fmtDateTime(doc.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-600 font-medium">View</span>
                  <button onClick={async (e) => { e.stopPropagation(); if (!confirm("Delete this document?")) return; try { await api.post(`/orders/${id}/delete-document/`, { doc_id: doc.id }); toast.success("Deleted"); loadOrder(); } catch { toast.error("Failed to delete"); } }} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* Document Preview */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" onClick={() => { setPreviewDoc(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-800">{previewDoc.name}</p>
              <div className="flex items-center gap-2">
                <a href={previewUrl} download={previewDoc.name} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">Download</a>
                <button onClick={() => { setPreviewDoc(null); URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 min-h-[400px]">
              {(previewDoc.name || "").match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
                ? <img src={previewUrl} alt={previewDoc.name} className="max-w-full max-h-[78vh] object-contain" />
                : <iframe src={previewUrl} className="w-full h-[78vh] border-0" />
              }
            </div>
          </div>
        </div>
      )}

      {/* PO Modal */}
      <Modal open={showPoModal} onClose={() => setShowPoModal(false)} title="Upload PO / Signed PI">
        <form onSubmit={handleUploadPo} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label><input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document *</label>
            <label
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${poFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setPoFile(e.dataTransfer.files[0]); }}
            >
              {poFile ? (
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{poFile.name}</p>
                    <p className="text-xs text-gray-400">{(poFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={(e) => { e.preventDefault(); setPoFile(null); }} className="ml-2 text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <p className="text-sm text-gray-500">Drag & drop or <span className="text-indigo-600 font-medium">browse</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Images</p>
                </div>
              )}
              <input type="file" onChange={(e) => setPoFile(e.target.files[0])} className="hidden" />
            </label>
          </div>
          <div className="flex gap-3"><button type="submit" disabled={!poFile} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">Upload</button><button type="button" onClick={() => setShowPoModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button></div>
        </form>
      </Modal>

      {/* PIF Modal */}
      <Modal open={showPifModal} onClose={() => setShowPifModal(false)} title="Upload PIF">
        <form onSubmit={handleUploadPif} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">PIF Number</label><input value={pifNumber} onChange={(e) => setPifNumber(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document *</label>
            <label
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${pifFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setPifFile(e.dataTransfer.files[0]); }}>
              {pifFile ? (
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div><p className="text-sm font-medium text-gray-800">{pifFile.name}</p><p className="text-xs text-gray-400">{(pifFile.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" onClick={(e) => { e.preventDefault(); setPifFile(null); }} className="ml-2 text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <p className="text-sm text-gray-500">Drag & drop or <span className="text-indigo-600 font-medium">browse</span></p>
                </div>
              )}
              <input type="file" onChange={(e) => setPifFile(e.target.files[0])} className="hidden" />
            </label>
          </div>
          <div className="flex gap-3"><button type="submit" disabled={!pifFile} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">Upload</button><button type="button" onClick={() => setShowPifModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button></div>
        </form>
      </Modal>

      {/* Doc Modal */}
      <Modal open={showDocModal} onClose={() => setShowDocModal(false)} title="Upload Document">
        <form onSubmit={handleUploadDoc} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"><option value="pi">Proforma Invoice</option><option value="po">Purchase Order</option><option value="commercial_invoice">Commercial Invoice</option><option value="packing_list">Packing List</option><option value="bl">Bill of Lading</option><option value="coa">COA</option><option value="insurance">Insurance</option><option value="other">Other</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input value={docName} onChange={(e) => setDocName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <label
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${docFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setDocFile(e.dataTransfer.files[0]); }}
            >
              {docFile ? (
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{docFile.name}</p>
                    <p className="text-xs text-gray-400">{(docFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={(e) => { e.preventDefault(); setDocFile(null); }} className="ml-2 text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                </div>
              ) : (
                <div className="text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <p className="text-sm text-gray-500">Drag & drop or <span className="text-indigo-600 font-medium">browse</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Excel, Images</p>
                </div>
              )}
              <input type="file" onChange={(e) => setDocFile(e.target.files[0])} className="hidden" />
            </label>
          </div>
          <div className="flex gap-3"><button type="submit" disabled={!docFile} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">Upload</button><button type="button" onClick={() => setShowDocModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button></div>
        </form>
      </Modal>

      {/* PI Editor — exact template replica */}
      {piLoading && showPiModal && (
        <Modal open={true} onClose={() => setShowPiModal(false)} title="Loading PI..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
        </Modal>
      )}
      <PIEditorModal
        open={showPiModal && !piLoading}
        onClose={() => setShowPiModal(false)}
        pi={pi} piForm={piForm} setPiForm={setPiForm}
        piItems={piItems} setPiItems={setPiItems}
        onSave={handleSavePI} onPreview={handlePreviewPI}
        onSend={handleSendPI} sending={piSending}
      />

      {/* CI Editor — Commercial Invoice template */}
      {ciLoading && showCiModal && (
        <Modal open={true} onClose={() => setShowCiModal(false)} title="Loading CI..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" /></div>
        </Modal>
      )}
      <CIEditorModal
        open={showCiModal && !ciLoading}
        onClose={() => setShowCiModal(false)}
        ci={ci} ciForm={ciForm} setCiForm={setCiForm}
        ciItems={ciItems} setCiItems={setCiItems}
        onSave={handleSaveCI} onPreview={handlePreviewCI}
        onSend={handleSendCI} sending={ciSending}
      />

      {/* LI Editor Modal */}
      <LIEditorModal
        open={showLiModal && !liLoading}
        onClose={() => setShowLiModal(false)}
        li={li} liForm={liForm} setLiForm={setLiForm}
        liItems={liItems} setLiItems={setLiItems}
        onSave={handleSaveLI} onPreview={handlePreviewLI}
        onSend={handleSendLI} sending={liSending}
      />
      {liLoading && showLiModal && (
        <Modal open={true} onClose={() => setShowLiModal(false)} title="Loading LI..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" /></div>
        </Modal>
      )}

      {/* Quotation Editor */}
      {qtLoading && showQtModal && (
        <Modal open={true} onClose={() => setShowQtModal(false)} title="Loading Quotation..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}
      <QuotationEditorModal
        open={showQtModal && !qtLoading}
        onClose={() => setShowQtModal(false)}
        qt={qt} qtForm={qtForm} setQtForm={setQtForm}
        qtItems={qtItems} setQtItems={setQtItems}
        onSave={handleSaveQt} onPreview={handlePreviewQt}
        onSend={handleSendQt} sending={qtSending}
      />

    </div>
  );
}
