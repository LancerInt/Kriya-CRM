"use client";
import { useEffect, useRef, useState } from "react";
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
import { PIFListModal } from "@/components/finance/PIFEditorModal";
import LineItemsCard from "@/components/orders/LineItemsCard";
import PackingListEditorModal from "@/components/finance/PackingListEditorModal";
import COAEditorModal from "@/components/finance/COAEditorModal";
import MSDSEditorModal from "@/components/finance/MSDSEditorModal";
import ComplianceDocEditorModal from "@/components/finance/ComplianceDocEditorModal";
import { confirmDialog } from "@/lib/confirm";

function fmtDate(d) { if (!d) return "—"; try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; } }
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
  const canSeeExecutive = currentUser?.role === "admin" || currentUser?.role === "manager";
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [orderFeedbackForm, setOrderFeedbackForm] = useState({ comments: "", issues: "", bulk_order_interest: false });
  const [editHeaderOpen, setEditHeaderOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState({ currency: "USD" });
  const [headerSaving, setHeaderSaving] = useState(false);
  const [orderNotes, setOrderNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [noteAttachments, setNoteAttachments] = useState([]); // [{ file, kind, previewUrl }]
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordStart, setRecordStart] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const [noteExistingDocs, setNoteExistingDocs] = useState([]); // library Document refs [{id, name, filename, file}]
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [isDraggingNote, setIsDraggingNote] = useState(false);
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
  const [showPifListModal, setShowPifListModal] = useState(false);
  const [pifReady, setPifReady] = useState(false);
  const [pifCounts, setPifCounts] = useState({ done: 0, total: 0 });
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [uploadChecklistFor, setUploadChecklistFor] = useState(null); // { doc_type, label }
  const [checklistUploadFile, setChecklistUploadFile] = useState(null);
  const [blNumberInput, setBlNumberInput] = useState("");
  const [packingListType, setPackingListType] = useState(null); // "client" | "logistic" | null
  const [coaEditorFor, setCoaEditorFor] = useState(null); // { orderItemId, productName, scope } | null
  const [msdsEditorFor, setMsdsEditorFor] = useState(null); // { orderItemId, productName, scope } | null
  // Scope chooser — opens before the COA/MSDS editor. Asks the user whether
  // the same doc is for both Client+Logistic or separate per audience.
  const [scopeAskFor, setScopeAskFor] = useState(null); // { kind: 'coa'|'msds', orderItemId, productName, side: 'client'|'logistic' }
  const [complianceDocType, setComplianceDocType] = useState(null); // examination_report|dbk_declaration|export_declaration|factory_stuffing
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showStuffingPhotoModal, setShowStuffingPhotoModal] = useState(false);
  const [inspectionUploadFor, setInspectionUploadFor] = useState(null); // null | 'passed' | 'failed'
  const [showCroPromptModal, setShowCroPromptModal] = useState(false);
  const [showCroAdvanceModal, setShowCroAdvanceModal] = useState(null); // { target_status }
  const [dispatchStep, setDispatchStep] = useState(null); // null | 'insurance'
  const [insuranceFile, setInsuranceFile] = useState(null);
  const [insuranceUploading, setInsuranceUploading] = useState(false);
  const [estDeliveryTime, setEstDeliveryTime] = useState("");
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [transitDeliveryOpen, setTransitDeliveryOpen] = useState(false);
  const [transitSubmitting, setTransitSubmitting] = useState(false);
  const [transitBlNumber, setTransitBlNumber] = useState("");
  const [showContainerBookedModal, setShowContainerBookedModal] = useState(false);
  const [shipmentGrammarChecking, setShipmentGrammarChecking] = useState(false);
  const [shipmentGrammarFixes, setShipmentGrammarFixes] = useState([]); // [{ key, original, corrected, reason }]
  const [shipmentForm, setShipmentForm] = useState({
    forwarder: "", cha: "", shipping_line: "",
    port_of_loading: "", port_of_discharge: "",
  });
  const [containerBookedSubmitting, setContainerBookedSubmitting] = useState(false);
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
      // Refresh PIF readiness whenever the order loads (gate for factory_ready button)
      api.get(`/finance/pif/status-for-order/`, { params: { order_id: id } })
        .then((r) => {
          setPifReady(!!r.data.all_ready);
          const done = (r.data.items || []).filter((it) => it.has_pdf).length;
          setPifCounts({ done, total: r.data.count || 0 });
        })
        .catch(() => { setPifReady(false); setPifCounts({ done: 0, total: 0 }); });
    }).catch(() => toast.error("Failed to load order"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadOrder(); }, [id]);

  const openHeaderEditor = () => {
    if (!order) return;
    setHeaderForm({
      total: order.total != null ? String(order.total) : "",
      payment_terms: order.payment_terms || "",
    });
    setEditHeaderOpen(true);
  };

  const saveHeaderEdits = async () => {
    if (!order) return;
    setHeaderSaving(true);
    try {
      const patch = {};
      const nextTotal = headerForm.total === "" || headerForm.total == null ? null : Number(headerForm.total);
      if (nextTotal != null && Number.isFinite(nextTotal) && nextTotal !== Number(order.total)) {
        patch.total = nextTotal;
      }
      const nextTerms = (headerForm.payment_terms || "").trim();
      if (nextTerms !== (order.payment_terms || "")) {
        patch.payment_terms = nextTerms;
      }
      if (Object.keys(patch).length > 0) {
        await api.patch(`/orders/${id}/`, patch);
      }
      toast.success("Order updated");
      setEditHeaderOpen(false);
      loadOrder();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update order"));
    } finally {
      setHeaderSaving(false);
    }
  };

  // Prompt to upload CRO whenever the user opens an order that's at Container
  // Booked and has no CRO yet. Shown once per browser session per order id.
  useEffect(() => {
    if (!order) return;
    if (order.status !== "container_booked") return;
    const hasCro = orderDocs.some((d) => d.doc_type === "cro");
    if (hasCro) return;
    try {
      const key = `cro-prompt-shown:${id}`;
      if (typeof window !== "undefined" && !window.sessionStorage.getItem(key)) {
        setShowCroPromptModal(true);
        window.sessionStorage.setItem(key, "1");
      }
    } catch {}
  }, [order?.status, orderDocs, id]);

  // ── Product Readiness checklist helpers ──
  const DEFAULT_CHECKLIST = [
    { label: "Product", checked: false, required: true },
    { label: "Containers", checked: false, required: true },
    { label: "Corton Box", checked: false, required: false },
    { label: "Leaflets", checked: false, required: false },
    { label: "Batch No. Stickers", checked: false, required: false },
  ];
  const checklist = (order?.readiness_checklist && order.readiness_checklist.length > 0)
    ? order.readiness_checklist
    : DEFAULT_CHECKLIST;
  const checklistAllDone = checklist.length > 0 && checklist.every((it) => it.checked);
  const checklistRequiredDone = checklist.filter((it) => it.required).every((it) => it.checked);

  const saveChecklist = async (next) => {
    setSavingChecklist(true);
    // Optimistic update
    setOrder((prev) => prev ? { ...prev, readiness_checklist: next } : prev);
    try {
      await api.patch(`/orders/${id}/`, { readiness_checklist: next });
    } catch {
      toast.error("Failed to save checklist");
      loadOrder();
    } finally {
      setSavingChecklist(false);
    }
  };
  const toggleChecklistItem = (idx) => {
    const next = checklist.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it);
    saveChecklist(next);
  };
  const addChecklistItem = () => {
    const label = newChecklistItem.trim();
    if (!label) return;
    if (checklist.some((it) => (it.label || "").toLowerCase() === label.toLowerCase())) {
      toast.error("Item already in the list");
      return;
    }
    const next = [...checklist, { label, checked: false, required: false }];
    setNewChecklistItem("");
    saveChecklist(next);
  };
  const removeChecklistItem = (idx) => {
    if (checklist[idx]?.required) return;
    const next = checklist.filter((_, i) => i !== idx);
    saveChecklist(next);
  };

  // ── Docs-Preparing document checklist ──
  // COA and MSDS expand into one row per OrderItem (so a 2-product order
  // requires 2 COAs and 2 MSDSes). All other doc types are single rows.
  const orderItems = order?.items || [];
  // ``groups`` controls which heading the row renders under: 'client',
  // 'logistic', or both. COA + MSDS appear in both groups (per spec).
  // When the order toggle is on, every product needs TWO COA + TWO MSDS
  // (one tagged for Client, one for Logistic). Otherwise a single shared
  // doc per product satisfies both audiences.
  const splitCoaMsds = !!order?.separate_coa_msds_per_group;
  const DOCS_APPROVAL_CHECKLIST = [
    { doc_type: "client_invoice", label: "Client Invoice", action: "generate-ci", groups: ["client"] },
    { doc_type: "client_packing_list", label: "Client Packing List", action: "generate-cpl", groups: ["client"] },
    { doc_type: "logistic_invoice", label: "Logistic Invoice", action: "generate-li", groups: ["logistic"] },
    { doc_type: "logistic_packing_list", label: "Logistic Packing List", action: "generate-lpl", groups: ["logistic"] },
    ...((orderItems.length > 0)
      ? orderItems.flatMap((it) => splitCoaMsds
          ? [
              { doc_type: "coa", label: `COA — ${it.product_name || `Item #${it.id}`} (Client)`, action: "generate-coa", optional: true, order_item_id: it.id, product_name: it.product_name, scope: "client", groups: ["client"] },
              { doc_type: "coa", label: `COA — ${it.product_name || `Item #${it.id}`} (Logistic)`, action: "generate-coa", optional: true, order_item_id: it.id, product_name: it.product_name, scope: "logistic", groups: ["logistic"] },
            ]
          : [{ doc_type: "coa", label: `COA — ${it.product_name || `Item #${it.id}`}`, action: "generate-coa", optional: true, order_item_id: it.id, product_name: it.product_name, groups: ["client", "logistic"] }]
        )
      : [{ doc_type: "coa", label: "COA", action: "generate-coa", optional: true, groups: ["client", "logistic"] }]),
    ...((orderItems.length > 0)
      ? orderItems.flatMap((it) => splitCoaMsds
          ? [
              { doc_type: "msds", label: `MSDS — ${it.product_name || `Item #${it.id}`} (Client)`, action: "generate-msds", optional: true, order_item_id: it.id, product_name: it.product_name, scope: "client", groups: ["client"] },
              { doc_type: "msds", label: `MSDS — ${it.product_name || `Item #${it.id}`} (Logistic)`, action: "generate-msds", optional: true, order_item_id: it.id, product_name: it.product_name, scope: "logistic", groups: ["logistic"] },
            ]
          : [{ doc_type: "msds", label: `MSDS — ${it.product_name || `Item #${it.id}`}`, action: "generate-msds", optional: true, order_item_id: it.id, product_name: it.product_name, groups: ["client", "logistic"] }]
        )
      : [{ doc_type: "msds", label: "MSDS", action: "generate-msds", optional: true, groups: ["client", "logistic"] }]),
    // Helper used by the per-side renderer to resolve scope-aware presence.
    { doc_type: "dbk_declaration", label: "DBK Declaration", action: "generate-dbk", optional: true, groups: ["logistic"] },
    { doc_type: "examination_report", label: "Examination Report", action: "generate-exam", optional: true, groups: ["logistic"] },
    { doc_type: "export_declaration", label: "Export Declaration Form", action: "generate-exportdecl", optional: true, groups: ["logistic"] },
    { doc_type: "factory_stuffing", label: "Factory Stuffing", action: "generate-factorystuffing", optional: true, groups: ["logistic"] },
    { doc_type: "non_dg_declaration", label: "Non-DG Declaration", action: "generate-nondg", optional: true, groups: ["logistic"] },
  ];
  // Scope helpers — COA / MSDS may be split into Client-only and
  // Logistic-only documents (or shared "both"). Filename suffixes mark
  // the audience: "_Client", "_Logistic", or no suffix (= both).
  const docMatchesScope = (doc, scope) => {
    const n = doc.name || "";
    if (scope === "client") return /_Client\.[^.]+$/i.test(n) || (!/_Client\.|_Logistic\./i.test(n));
    if (scope === "logistic") return /_Logistic\.[^.]+$/i.test(n) || (!/_Client\.|_Logistic\./i.test(n));
    return true;
  };
  const hasDoc = (docType, scope = null) => orderDocs.some((d) => d.doc_type === docType && (!scope || docMatchesScope(d, scope)));
  const hasDocForItem = (docType, itemId, scope = null) => {
    if (!itemId) return hasDoc(docType, scope);
    return orderDocs.some((d) => d.doc_type === docType
      && (d.order_item === itemId || d.order_item === null)
      && (!scope || docMatchesScope(d, scope)));
  };
  const isRowPresent = (row) => (row.order_item_id ? hasDocForItem(row.doc_type, row.order_item_id, row.scope) : hasDoc(row.doc_type, row.scope));
  const requiredChecklistRows = DOCS_APPROVAL_CHECKLIST.filter((r) => !r.optional);
  const docsApprovalReady = requiredChecklistRows.every(isRowPresent);
  const docsMissingCount = requiredChecklistRows.filter((r) => !isRowPresent(r)).length;

  // Per-item COA/MSDS missing — each OrderItem must have its own doc.
  // When the split toggle is on, both Client- AND Logistic-tagged copies
  // are required per product (so 2 COA + 2 MSDS per row).
  const perItemDispatchMissing = (() => {
    if (!orderItems.length) return [];
    const out = [];
    for (const it of orderItems) {
      const labelBase = it.product_name || `Item #${it.id}`;
      if (splitCoaMsds) {
        if (!hasDocForItem("coa", it.id, "client")) out.push({ doc_type: "coa", order_item_id: it.id, scope: "client", label: `COA — ${labelBase} (Client)` });
        if (!hasDocForItem("coa", it.id, "logistic")) out.push({ doc_type: "coa", order_item_id: it.id, scope: "logistic", label: `COA — ${labelBase} (Logistic)` });
        if (!hasDocForItem("msds", it.id, "client")) out.push({ doc_type: "msds", order_item_id: it.id, scope: "client", label: `MSDS — ${labelBase} (Client)` });
        if (!hasDocForItem("msds", it.id, "logistic")) out.push({ doc_type: "msds", order_item_id: it.id, scope: "logistic", label: `MSDS — ${labelBase} (Logistic)` });
      } else {
        if (!hasDocForItem("coa", it.id)) out.push({ doc_type: "coa", order_item_id: it.id, label: `COA — ${labelBase}` });
        if (!hasDocForItem("msds", it.id)) out.push({ doc_type: "msds", order_item_id: it.id, label: `MSDS — ${labelBase}` });
      }
    }
    return out;
  })();

  const openEditorForDocType = (docType, opts = {}) => {
    switch (docType) {
      case "client_invoice": handleGenerateCI(); return;
      case "logistic_invoice": handleGenerateLI(); return;
      case "client_packing_list": setPackingListType("client"); return;
      case "logistic_packing_list": setPackingListType("logistic"); return;
      case "coa": setCoaEditorFor({ orderItemId: opts.order_item_id || null, productName: opts.product_name || "" }); return;
      case "msds": setMsdsEditorFor({ orderItemId: opts.order_item_id || null, productName: opts.product_name || "" }); return;
      case "dbk_declaration":
      case "examination_report":
      case "export_declaration":
      case "factory_stuffing":
      case "non_dg_declaration": setComplianceDocType(docType); return;
      case "pif": setShowPifListModal(true); return;
      default: toast.error("This document type is not editable from here.");
    }
  };

  const submitContainerBooked = async () => {
    setContainerBookedSubmitting(true);
    try {
      const payload = { ...shipmentForm };
      // Strip empty fields
      Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });
      await api.post(`/orders/${id}/container-booked/`, payload);
      toast.success("Container Booked — shipment updated");
      setShowContainerBookedModal(false);
      setShipmentForm({
        forwarder: "", cha: "", shipping_line: "",
        port_of_loading: "", port_of_discharge: "",
      });
      setShipmentGrammarFixes([]);
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to advance")); }
    finally { setContainerBookedSubmitting(false); }
  };

  const checkShipmentGrammar = async () => {
    const fields = ["forwarder", "cha", "shipping_line", "port_of_loading", "port_of_discharge"];
    const text = fields.map((k) => `${k}: ${shipmentForm[k] || ""}`).filter((l) => l.split(": ")[1].trim()).join("\n");
    if (!text || text.trim().length < 3) { toast("Fill in some fields first.", { icon: "ℹ️" }); return; }
    setShipmentGrammarChecking(true);
    setShipmentGrammarFixes([]);
    try {
      const res = await api.post("/communications/grammar-check/", { text });
      const fixes = res.data?.corrections || [];
      if (fixes.length === 0) {
        toast.success("No errors found — looks good!");
      } else {
        const tagged = fixes.map((f) => {
          const matchKey = fields.find((k) => (shipmentForm[k] || "").toLowerCase().includes((f.original || "").toLowerCase()));
          return { ...f, key: matchKey || null };
        });
        setShipmentGrammarFixes(tagged);
      }
    } catch { toast.error("Grammar check failed"); }
    finally { setShipmentGrammarChecking(false); }
  };

  const applyShipmentFix = (fix) => {
    if (!fix.original || !fix.key) {
      setShipmentGrammarFixes((prev) => prev.filter((c) => c !== fix));
      return;
    }
    const escaped = fix.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    setShipmentForm((prev) => ({ ...prev, [fix.key]: (prev[fix.key] || "").replace(re, fix.corrected) }));
    setShipmentGrammarFixes((prev) => prev.filter((c) => c !== fix));
  };

  const applyAllShipmentFixes = () => {
    let next = { ...shipmentForm };
    for (const fix of shipmentGrammarFixes) {
      if (!fix.original || !fix.key) continue;
      const escaped = fix.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "gi");
      next[fix.key] = (next[fix.key] || "").replace(re, fix.corrected);
    }
    setShipmentForm(next);
    setShipmentGrammarFixes([]);
  };

  const triggerDispatchEmailDraft = async () => {
    setDispatchSubmitting(true);
    try {
      const res = await api.post(`/orders/${id}/dispatch-mail-draft/`, {});
      toast.success("Email draft ready — order will move to Dispatched once you send it");
      setDispatchStep(null);
      const commId = res.data.communication_id;
      const draftId = res.data.draft_id;
      if (commId) {
        const qs = draftId ? `?draft=${draftId}` : "";
        router.push(`/communications/${commId}${qs}`);
      } else {
        toast("No source email thread found — open the draft from Communications.", { icon: "ℹ️" });
        loadOrder();
      }
    } catch (err) { toast.error(getErrorMessage(err, "Dispatch failed")); }
    finally { setDispatchSubmitting(false); }
  };

  const submitInsuranceUpload = async (e) => {
    e?.preventDefault?.();
    if (!insuranceFile) return;
    setInsuranceUploading(true);
    const fd = new FormData();
    fd.append("file", insuranceFile);
    fd.append("doc_type", "insurance");
    fd.append("name", `Insurance - ${insuranceFile.name}`);
    try {
      await api.post(`/orders/${id}/upload-document/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Insurance uploaded");
      setInsuranceFile(null);
      await loadOrder();
      // Jump straight to building the dispatch email draft — no delivery prompt here.
      await triggerDispatchEmailDraft();
    } catch (err) { toast.error(getErrorMessage(err, "Upload failed")); }
    finally { setInsuranceUploading(false); }
  };

  const submitTransitDelivery = async () => {
    if (!transitBlNumber.trim()) { toast.error("BL Number is required"); return; }
    if (!estDeliveryTime.trim()) { toast.error("Estimated delivery time is required"); return; }
    setTransitSubmitting(true);
    try {
      // Save BL number as a Note (best-effort; doesn't block the draft if it fails)
      try {
        await api.post(`/orders/${id}/events/`, {
          event_type: "note",
          description: `BL Number: ${transitBlNumber.trim()}`,
        });
      } catch {}
      const res = await api.post(`/orders/${id}/transit-mail-draft/`, {
        estimated_delivery_time: estDeliveryTime.trim(),
        bl_number: transitBlNumber.trim(),
      });
      toast.success("Email draft ready — order will move to In Transit once you send it");
      setTransitDeliveryOpen(false);
      setEstDeliveryTime("");
      setTransitBlNumber("");
      const commId = res.data.communication_id;
      const draftId = res.data.draft_id;
      if (commId) {
        const qs = draftId ? `?draft=${draftId}` : "";
        router.push(`/communications/${commId}${qs}`);
      } else { toast("No source thread — open the draft from Communications.", { icon: "ℹ️" }); loadOrder(); }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to prepare transit email")); }
    finally { setTransitSubmitting(false); }
  };

  const viewOrderDoc = async (docType, itemId = null) => {
    const doc = itemId
      ? orderDocs.find((d) => d.doc_type === docType && (d.order_item === itemId || d.order_item === null))
      : orderDocs.find((d) => d.doc_type === docType);
    if (!doc || !doc.file) { toast.error("No file to preview yet"); return; }
    try {
      const url = doc.file.startsWith("http") ? doc.file : `http://localhost:8000${doc.file}`;
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch { toast.error("Failed to open document"); }
  };

  const handleChecklistUpload = async (e) => {
    e.preventDefault();
    if (!checklistUploadFile || !uploadChecklistFor) return;
    const isBl = uploadChecklistFor.doc_type === "bl";
    if (isBl && !blNumberInput.trim()) {
      toast.error("Enter the BL Number first");
      return;
    }
    const fd = new FormData();
    fd.append("file", checklistUploadFile);
    fd.append("doc_type", uploadChecklistFor.doc_type);
    let namedFile = isBl
      ? `${uploadChecklistFor.label} ${blNumberInput.trim()} - ${checklistUploadFile.name}`
      : `${uploadChecklistFor.label} - ${checklistUploadFile.name}`;
    // Per-scope suffix so docMatchesScope finds the file under the right
    // audience tab (Client vs Logistic). Inserted before the extension.
    const scope = uploadChecklistFor.scope;
    if (scope === "client" || scope === "logistic") {
      const suffix = scope === "client" ? "_Client" : "_Logistic";
      const dot = namedFile.lastIndexOf(".");
      namedFile = dot > 0 ? `${namedFile.slice(0, dot)}${suffix}${namedFile.slice(dot)}` : `${namedFile}${suffix}`;
    }
    fd.append("name", namedFile);
    if (uploadChecklistFor.order_item_id) {
      fd.append("order_item_id", uploadChecklistFor.order_item_id);
    }
    if (isBl) fd.append("bl_number", blNumberInput.trim());
    try {
      await api.post(`/orders/${id}/upload-document/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      // Save BL number as a Note for future reference (Shipment is synced server-side)
      if (isBl) {
        try {
          await api.post(`/orders/${id}/events/`, {
            event_type: "note",
            description: `BL Number: ${blNumberInput.trim()}`,
          });
        } catch {}
      }
      toast.success(`${uploadChecklistFor.label} uploaded`);
      setUploadChecklistFor(null); setChecklistUploadFile(null); setBlNumberInput("");
      loadOrder();
    } catch (err) { toast.error(getErrorMessage(err, "Upload failed")); }
  };

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
    if (!(await confirmDialog(`Revert order to "${order.revert_to?.label}"? This will undo the current stage.`))) return;
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

  const addNoteAttachment = (file, kind) => {
    setNoteAttachments((prev) => [...prev, { file, kind, previewUrl: URL.createObjectURL(file) }]);
  };

  const pickNoteFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      files.forEach((f) => {
        const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "voice" : "file";
        addNoteAttachment(f, kind);
      });
    };
    input.click();
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraStream(stream);
      setShowCamera(true);
    } catch {
      toast.error("Camera access denied");
    }
  };

  const closeCamera = () => {
    if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setShowCamera(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      addNoteAttachment(file, "photo");
      closeCamera();
    }, "image/jpeg", 0.9);
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const ext = (mr.mimeType || "audio/webm").split("/")[1].split(";")[0];
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type });
        addNoteAttachment(file, "voice");
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecorder(mr);
      setRecording(true);
      setRecordStart(Date.now());
      setRecordElapsed(0);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopVoiceRecording = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
    setRecorder(null);
  };

  const removeNoteAttachment = (idx) => {
    setNoteAttachments((prev) => {
      const removed = prev[idx];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearNoteAttachments = () => {
    noteAttachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setNoteAttachments([]);
    setNoteExistingDocs([]);
  };

  const addExistingDoc = (doc) => {
    setNoteExistingDocs((prev) => prev.some((d) => d.id === doc.id) ? prev : [...prev, doc]);
  };

  const removeExistingDoc = (docId) => {
    setNoteExistingDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const openLibraryPicker = async () => {
    setShowDocPicker(true);
    if (libraryDocs.length > 0) return;
    setLibraryLoading(true);
    try {
      const res = await api.get("/documents/");
      setLibraryDocs(res.data.results || res.data || []);
    } catch { toast.error("Failed to load documents"); }
    finally { setLibraryLoading(false); }
  };

  const handleNoteDrop = (e) => {
    e.preventDefault();
    setIsDraggingNote(false);
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach((f) => {
      const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "voice" : "file";
      addNoteAttachment(f, kind);
    });
  };

  const handleNotePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    let added = false;
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) {
          const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "voice" : "file";
          const named = f.name && f.name !== "image.png"
            ? f
            : new File([f], `pasted-${Date.now()}.${(f.type.split("/")[1] || "bin")}`, { type: f.type });
          addNoteAttachment(named, kind);
          added = true;
        }
      }
    }
    if (added) e.preventDefault();
  };

  const submitNote = async (category = null) => {
    if (!newNote.trim() && noteAttachments.length === 0 && noteExistingDocs.length === 0) return;
    try {
      const desc = newNote.trim();
      const taggedDesc = category ? `[${category}]${desc ? ` ${desc}` : ""}` : desc;
      if (noteAttachments.length > 0 || noteExistingDocs.length > 0) {
        const fd = new FormData();
        fd.append("event_type", "note");
        fd.append("description", taggedDesc);
        if (category) fd.append("name_prefix", `[${category}] `);
        noteAttachments.forEach((a) => {
          fd.append("attachments", a.file);
          fd.append("attachment_kinds", a.kind);
        });
        noteExistingDocs.forEach((d) => fd.append("library_documents", d.id));
        await api.post(`/orders/${id}/events/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await api.post(`/orders/${id}/events/`, { event_type: "note", description: taggedDesc });
      }
      setNewNote("");
      clearNoteAttachments();
      loadOrder();
      toast.success("Note added");
    } catch { toast.error("Failed to add note"); }
  };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecordElapsed(Math.floor((Date.now() - recordStart) / 1000)), 500);
    return () => clearInterval(t);
  }, [recording, recordStart]);

  useEffect(() => {
    if (showCamera && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [showCamera, cameraStream]);

  useEffect(() => () => {
    if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
  }, []);

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
        const ciData = ciList[0];
        // Always re-populate Notify fields from fresh client data
        if (order?.client) {
          try {
            const clientRes = await api.get(`/clients/${order.client}/`);
            const cl = clientRes.data;
            const primaryContact = cl.contacts?.find(c => c.is_primary) || cl.contacts?.[0];
            if (primaryContact) ciData.notify_company_name = primaryContact.name;
            if (cl.address) ciData.notify_address = cl.address;
            ciData.client_city_state_country = [cl.city, cl.state].filter(Boolean).join(', ');
            if (cl.tax_number) ciData.client_tax_number = cl.tax_number;
            if (cl.postal_code) ciData.client_pincode = cl.postal_code;
            if (primaryContact?.phone) ciData.notify_phone = primaryContact.phone;
            if (cl.company_name) ciData.client_company_name = cl.company_name;
          } catch {}
        }
        setCi(ciData);
        setCiForm(ciData);
        setCiItems(ciData.items || []);
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
        subtitle={
          <span className="inline-flex items-center gap-2">
            <span>
              {order.client_name}
              {order.can_view_total ? ` · ${order.currency} ${Number(order.total || 0).toLocaleString()}` : ""}
              {canSeeExecutive && order.client_primary_executive_name ? ` · Executive: ${order.client_primary_executive_name}` : ""}
            </span>
            {isAdminOrManager && (
              <button
                type="button"
                onClick={openHeaderEditor}
                title="Edit client / currency / executive"
                className="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </span>
        }
        action={
          <div className="flex gap-2">
            {order.status === "pif_sent" && (
              <button onClick={() => setShowPifListModal(true)} className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">Generate PIF</button>
            )}
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
            {orderDocs.some(d => d.doc_type === "pif") && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">✅ PIF</span>
            )}
          </div>
        </div>

        {["factory_ready", "docs_preparing", "inspection", "inspection_passed"].includes(order.status) && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-medium text-sm text-gray-800">Product Readiness Checklist</h4>
                <p className="text-xs text-gray-500">Required items (Product, Containers) unlock Documents Preparing. All items must be ticked before Container Booked.</p>
              </div>
              {savingChecklist && <span className="text-xs text-gray-400">Saving...</span>}
            </div>
            <div className="space-y-1.5">
              {checklist.map((it, idx) => (
                <label key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={!!it.checked} onChange={() => toggleChecklistItem(idx)} className="w-4 h-4 accent-indigo-600" />
                  <span className={`text-sm flex-1 ${it.checked ? "text-emerald-700 font-medium" : "text-gray-800"}`}>{it.label}</span>
                  {it.required ? (
                    <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Required</span>
                  ) : (
                    <button type="button" onClick={(e) => { e.preventDefault(); removeChecklistItem(idx); }} className="text-xs text-red-500 hover:text-red-700">✕</button>
                  )}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="New checklist item..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button type="button" onClick={addChecklistItem} disabled={!newChecklistItem.trim()} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">+ Items</button>
            </div>
          </div>
        )}

        {["docs_preparing", "inspection", "inspection_passed", "container_booked", "docs_approved", "dispatched", "in_transit"].includes(order.status) && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div>
                <h4 className="font-medium text-sm text-gray-800">Documents Checklist</h4>
                <p className="text-xs text-gray-500">{order.status === "docs_preparing"
                  ? `Generate the ${requiredChecklistRows.length} required invoices/packing lists (CI, CPL, LI, LPL) to enable Under Inspection (${requiredChecklistRows.length - docsMissingCount}/${requiredChecklistRows.length} done). The other rows are optional.`
                  : `Keep editing through In Transit if anything needs to be updated (${requiredChecklistRows.length - docsMissingCount}/${requiredChecklistRows.length} required done). The remaining rows are optional.`}
                </p>
              </div>
              {/* Toggle: separate COA/MSDS for Client vs Logistic.
                  When ON, every product needs 2 COA + 2 MSDS (one tagged
                  Client, one tagged Logistic). */}
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shrink-0">
                <span className="text-xs font-medium text-gray-700">Separate COA/MSDS for Client &amp; Logistic</span>
                <button
                  type="button"
                  onClick={async () => {
                    const next = !splitCoaMsds;
                    if (next) {
                      const ok = await confirmDialog({
                        title: "Use separate COA/MSDS per audience?",
                        message: `Every product will then need TWO COA and TWO MSDS — one tagged "Client" and one tagged "Logistic". Existing shared docs stay where they are; new ones must specify their audience.`,
                        confirmText: "Yes, separate",
                        cancelText: "No",
                      });
                      if (!ok) return;
                    }
                    try {
                      await api.post(`/orders/${id}/set-coa-msds-split/`, { separate: next });
                      toast.success(next ? "Switched to separate COA/MSDS per audience" : "Switched to shared COA/MSDS");
                      loadOrder();
                    } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
                  }}
                  role="switch"
                  aria-checked={splitCoaMsds}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${splitCoaMsds ? "bg-emerald-500" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-4 w-4 m-0.5 rounded-full bg-white shadow transition-transform ${splitCoaMsds ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className={`text-xs font-semibold ${splitCoaMsds ? "text-emerald-700" : "text-gray-500"}`}>
                  {splitCoaMsds ? "Yes" : "No"}
                </span>
              </div>
            </div>
            {["container_booked", "docs_approved", "dispatched", "in_transit"].includes(order.status) && (() => {
              const croPresent = hasDoc("cro");
              return (
                <div className={`flex items-center justify-between p-3 border rounded-lg mb-3 ${croPresent ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${croPresent ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>{croPresent ? "✓" : "○"}</span>
                    <span className={`text-sm font-medium ${croPresent ? "text-emerald-800" : "text-amber-900"}`}>CRO (Container Release Order)</span>
                    <span className="text-[9px] font-semibold text-gray-600 bg-white border border-gray-200 rounded px-1.5 py-0.5">Upload only</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {croPresent && (
                      <button onClick={() => viewOrderDoc("cro")} title="View PDF" className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">👁 View</button>
                    )}
                    <button onClick={() => { setUploadChecklistFor({ doc_type: "cro", label: "CRO" }); setChecklistUploadFile(null); }} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
                      {croPresent ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
              );
            })()}

            {["dispatched", "in_transit"].includes(order.status) && (() => {
              const TRANSIT_ROWS = [
                { doc_type: "bl", label: "BL (Bill of Lading)" },
                { doc_type: "shipping_bill", label: "Shipping Bill" },
                { doc_type: "schedule_list", label: "Schedule List" },
                { doc_type: "coo", label: "COO (Certificate of Origin)" },
              ];
              return (
                <div className="mb-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50/40">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-900">Transit Documents</h4>
                      <p className="text-[11px] text-indigo-700">All four are required to move to In Transit.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {TRANSIT_ROWS.map((row) => {
                      const present = hasDoc(row.doc_type);
                      return (
                        <div key={row.doc_type} className={`flex items-center justify-between p-2.5 border rounded-lg ${present ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${present ? "bg-emerald-500 text-white" : "bg-gray-300 text-white"}`}>{present ? "✓" : "○"}</span>
                            <span className={`text-sm ${present ? "text-emerald-800 font-medium" : "text-gray-800"}`}>{row.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {present && (
                              <button onClick={() => viewOrderDoc(row.doc_type)} title="View PDF" className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">👁 View</button>
                            )}
                            <button onClick={() => { setUploadChecklistFor({ doc_type: row.doc_type, label: row.label }); setChecklistUploadFile(null); }} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
                              {present ? "Replace" : "Upload"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Insurance is rendered inside the Logistic group below. */}

            {(() => {
              // Per-section tone — Client stays emerald, Logistic uses amber.
              const TONE = {
                emerald: { bgPresent: "bg-emerald-50", borderPresent: "border-emerald-200", dotPresent: "bg-emerald-500", textPresent: "text-emerald-800" },
                amber: { bgPresent: "bg-amber-50", borderPresent: "border-amber-200", dotPresent: "bg-amber-500", textPresent: "text-amber-800" },
              };
              const renderRow = (row, rIdx, tone = "emerald", side = null) => {
                // For COA/MSDS, presence depends on the side ("client" / "logistic")
                // because the user can generate separate docs per audience.
                const isScopedDoc = side && (row.doc_type === "coa" || row.doc_type === "msds");
                const scopedRow = isScopedDoc ? { ...row, scope: side } : row;
                const present = isRowPresent(scopedRow);
                const t = TONE[tone];
                const rowKey = `${row.doc_type}-${row.order_item_id || rIdx}-${tone}`;
                return (
                  <div key={rowKey} className={`flex items-center justify-between p-2.5 border rounded-lg ${present ? `${t.bgPresent} ${t.borderPresent}` : "bg-white border-gray-200"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${present ? `${t.dotPresent} text-white` : "bg-gray-300 text-white"}`}>{present ? "✓" : "○"}</span>
                      <span className={`text-sm ${present ? `${t.textPresent} font-medium` : "text-gray-800"}`}>{row.label}</span>
                      {row.optional && <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Optional</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {present && (
                        <button onClick={() => viewOrderDoc(row.doc_type, row.order_item_id || null)} title="View PDF" className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">👁 View</button>
                      )}
                      {/* Attach existing PDF — works for any generate-* row.
                          Pre-fills doc_type, label, order_item_id, scope so
                          the upload binds to the correct slot in the checklist. */}
                      {row.action && row.action.startsWith("generate-") && (
                        <button
                          onClick={() => {
                            setUploadChecklistFor({
                              doc_type: row.doc_type,
                              label: row.label,
                              order_item_id: row.order_item_id || null,
                              scope: row.scope || (splitCoaMsds && (row.doc_type === "coa" || row.doc_type === "msds") ? side : null),
                            });
                            setChecklistUploadFile(null);
                          }}
                          title="Attach an existing PDF instead of generating one"
                          className="px-2.5 py-1 text-xs border border-indigo-200 text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100"
                        >📎 Attach</button>
                      )}
                      {row.action === "generate-ci" && (
                        <button onClick={handleGenerateCI} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-li" && (
                        <button onClick={handleGenerateLI} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-cpl" && (
                        <button onClick={() => setPackingListType("client")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-lpl" && (
                        <button onClick={() => setPackingListType("logistic")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-coa" && (
                        <button
                          onClick={() => {
                            // When the order is in split mode, the row already
                            // declares its scope — go straight to the editor.
                            // Otherwise: editing an existing scoped doc keeps
                            // its scope; generating a new shared doc asks.
                            const lockedScope = row.scope || (splitCoaMsds ? side : null);
                            if (lockedScope) {
                              setCoaEditorFor({ orderItemId: row.order_item_id || null, productName: row.product_name || "", scope: lockedScope });
                            } else if (present) {
                              setCoaEditorFor({ orderItemId: row.order_item_id || null, productName: row.product_name || "", scope: side || "both" });
                            } else {
                              setScopeAskFor({ kind: "coa", orderItemId: row.order_item_id || null, productName: row.product_name || "", side });
                            }
                          }}
                          className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-msds" && (
                        <button
                          onClick={() => {
                            const lockedScope = row.scope || (splitCoaMsds ? side : null);
                            if (lockedScope) {
                              setMsdsEditorFor({ orderItemId: row.order_item_id || null, productName: row.product_name || "", scope: lockedScope });
                            } else if (present) {
                              setMsdsEditorFor({ orderItemId: row.order_item_id || null, productName: row.product_name || "", scope: side || "both" });
                            } else {
                              setScopeAskFor({ kind: "msds", orderItemId: row.order_item_id || null, productName: row.product_name || "", side });
                            }
                          }}
                          className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-dbk" && (
                        <button onClick={() => setComplianceDocType("dbk_declaration")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-exam" && (
                        <button onClick={() => setComplianceDocType("examination_report")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-exportdecl" && (
                        <button onClick={() => setComplianceDocType("export_declaration")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-factorystuffing" && (
                        <button onClick={() => setComplianceDocType("factory_stuffing")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "generate-nondg" && (
                        <button onClick={() => setComplianceDocType("non_dg_declaration")} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Edit" : "Generate"}</button>
                      )}
                      {row.action === "upload" && (
                        <button onClick={() => { setUploadChecklistFor(row); setChecklistUploadFile(null); }} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">{present ? "Replace" : "Upload"}</button>
                      )}
                    </div>
                  </div>
                );
              };

              const clientRows = DOCS_APPROVAL_CHECKLIST.filter((r) => r.groups?.includes("client"));
              const logisticRows = DOCS_APPROVAL_CHECKLIST.filter((r) => r.groups?.includes("logistic"));

              // Inspection photos (passed + failed) — file count for the
              // Client section "Pictures" pseudo-row. Click jumps to the
              // Documents tab so the user can browse / preview them.
              const inspectionPhotos = orderDocs.filter((d) => {
                const n = (d.name || "").toLowerCase();
                if (!n.startsWith("[inspection passed]") && !n.startsWith("[inspection failed]")) return false;
                return /\.(jpg|jpeg|png|webp|gif)$/i.test(d.name || "");
              });
              const passedCount = inspectionPhotos.filter((d) => (d.name || "").startsWith("[Inspection Passed]")).length;
              const failedCount = inspectionPhotos.filter((d) => (d.name || "").startsWith("[Inspection Failed]")).length;
              const hasInspectionPics = inspectionPhotos.length > 0;

              const insurancePresentInline = hasDoc("insurance");
              const showInsuranceInLogistic = ["docs_approved", "dispatched", "in_transit"].includes(order.status);

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Client */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Client</h5>
                      <span className="flex-1 h-px bg-emerald-200" />
                    </div>
                    {clientRows.map((r, i) => renderRow(r, i, "emerald", "client"))}
                    {/* Inspection pictures pseudo-row */}
                    <div
                      className={`flex items-center justify-between p-2.5 border rounded-lg cursor-pointer ${hasInspectionPics ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}
                      onClick={() => setActiveTab("documents")}
                      title="Open Documents tab"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${hasInspectionPics ? "bg-emerald-500 text-white" : "bg-gray-300 text-white"}`}>{hasInspectionPics ? "✓" : "○"}</span>
                        <span className={`text-sm ${hasInspectionPics ? "text-emerald-800 font-medium" : "text-gray-800"}`}>Inspection Pictures</span>
                        <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Optional</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        {passedCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Passed: {passedCount}</span>}
                        {failedCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">Failed: {failedCount}</span>}
                        {!hasInspectionPics && <span className="text-gray-400">No photos yet</span>}
                      </div>
                    </div>
                  </div>

                  {/* Logistic */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Logistic</h5>
                      <span className="flex-1 h-px bg-indigo-200" />
                    </div>
                    {/* Insurance — required for Dispatch, only shown once
                        the order is past Documents Approved. */}
                    {showInsuranceInLogistic && (
                      <div className={`flex items-center justify-between p-2.5 border rounded-lg ${insurancePresentInline ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${insurancePresentInline ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>{insurancePresentInline ? "✓" : "○"}</span>
                          <span className={`text-sm font-medium ${insurancePresentInline ? "text-emerald-800" : "text-amber-900"}`}>Insurance</span>
                          <span className="text-[9px] font-semibold text-gray-600 bg-white border border-gray-200 rounded px-1.5 py-0.5">Upload only</span>
                          <span className="text-[9px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">Required for Dispatch</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {insurancePresentInline && (
                            <button onClick={() => viewOrderDoc("insurance")} title="View PDF" className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">👁 View</button>
                          )}
                          <button onClick={() => { setUploadChecklistFor({ doc_type: "insurance", label: "Insurance" }); setChecklistUploadFile(null); }} className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
                            {insurancePresentInline ? "Replace" : "Upload"}
                          </button>
                        </div>
                      </div>
                    )}
                    {logisticRows.map((r, i) => renderRow(r, i, "amber", "logistic"))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {order.allowed_transitions?.length > 0 && (
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              {order.allowed_transitions.filter((t) => t.status !== "cancelled").map((t) => {
                // Block PO Received if no PO document uploaded
                const needsPO = t.status === "po_received" && !order.po_document;
                const needsPIFGen = t.status === "factory_ready" && order.status === "pif_sent" && !pifReady;
                const needsRequired = t.status === "docs_preparing" && order.status === "factory_ready" && !checklistRequiredDone;
                const needsAllDocs = (t.status === "inspection" && order.status === "docs_preparing" && !docsApprovalReady)
                  || (t.status === "docs_approved" && ["container_booked", "packed"].includes(order.status) && !docsApprovalReady);
                // CRO is mandatory before leaving Container Booked.
                const needsCRO = t.status === "docs_approved" && order.status === "container_booked" && !orderDocs.some(d => d.doc_type === "cro");
                const TRANSIT_DT = ["bl", "shipping_bill", "schedule_list", "coo"];
                const transitMissing = TRANSIT_DT.filter(dt => !orderDocs.some(d => d.doc_type === dt));
                const needsTransitDocs = t.status === "in_transit" && order.status === "dispatched" && transitMissing.length > 0;
                const DISPATCH_SIMPLE = [
                  "client_invoice", "client_packing_list", "logistic_invoice", "logistic_packing_list",
                  "dbk_declaration", "examination_report", "export_declaration", "factory_stuffing",
                  "insurance",
                ];
                const DISPATCH_LABELS = {
                  client_invoice: "Client Invoice", client_packing_list: "Client Packing List",
                  logistic_invoice: "Logistic Invoice", logistic_packing_list: "Logistic Packing List",
                  coa: "COA", msds: "MSDS",
                  dbk_declaration: "DBK Declaration", examination_report: "Examination Report",
                  export_declaration: "Export Declaration Form", factory_stuffing: "Factory Stuffing",
                  insurance: "Insurance",
                };
                const dispatchMissingSimple = DISPATCH_SIMPLE.filter(dt => !orderDocs.some(d => d.doc_type === dt));
                const dispatchMissingLabels = [
                  ...dispatchMissingSimple.map(dt => DISPATCH_LABELS[dt]),
                  ...perItemDispatchMissing.map(m => m.label),
                ];
                const dispatchTotal = DISPATCH_SIMPLE.length + (orderItems.length * 2);
                const dispatchDone = dispatchTotal - dispatchMissingLabels.length;
                const needsDispatchDocs = t.status === "dispatched" && order.status === "docs_approved" && dispatchMissingLabels.length > 0;
                const inspectionAtMs = order.inspection_at ? new Date(order.inspection_at).getTime() : 0;
                const hasStuffingPhoto = inspectionAtMs > 0 && orderDocs.some((d) => {
                  const name = (d.name || "").toLowerCase();
                  const isImg = /\.(jpg|jpeg|png|webp|gif)$/.test(name);
                  const created = d.created_at ? new Date(d.created_at).getTime() : 0;
                  return isImg && created >= inspectionAtMs;
                });
                const needsStuffingPhoto = t.status === "container_booked" && order.status === "inspection_passed" && !hasStuffingPhoto;
                const needsChecklist = (t.status === "container_booked" && order.status === "inspection_passed" && !checklistAllDone) || needsRequired || needsAllDocs || needsTransitDocs || needsStuffingPhoto || needsDispatchDocs;
                // Before-Dispatch payment checkpoints — every payment row
                // toggled to "Before Dispatch" must be ticked before the
                // Dispatch button becomes clickable.
                const ps = order.payment_schedule || {};
                const advanceCheckpointMissing = ps.has_advance && order.advance_is_before_dispatch && !ps.advance_received;
                const balanceCheckpointMissing = ps.has_balance && order.balance_is_before_dispatch && !ps.balance_received;
                const needsBeforeDispatchPayments = t.status === "dispatched" && (advanceCheckpointMissing || balanceCheckpointMissing);
                const beforeDispatchPaymentHint = needsBeforeDispatchPayments
                  ? `Tick the Before Dispatch payment(s): ${[
                      advanceCheckpointMissing ? `Advance ${ps.advance_pct}%` : null,
                      balanceCheckpointMissing ? `Balance ${ps.balance_pct}%` : null,
                    ].filter(Boolean).join(", ")}.`
                  : undefined;
                const blocked = needsPO || needsPIFGen || needsChecklist || needsCRO || needsBeforeDispatchPayments;
                const pifHint = needsPIFGen ? `Generate PIFs for every product first (${pifCounts.done}/${pifCounts.total} done)` : undefined;
                const checklistHint = needsRequired
                  ? "Tick the required items (Product and Containers) before advancing to Documents Preparing."
                  : needsAllDocs
                    ? `Attach all ${requiredChecklistRows.length} required documents (${requiredChecklistRows.length - docsMissingCount}/${requiredChecklistRows.length} done) before advancing.`
                    : needsDispatchDocs
                      ? `Every document must be uploaded before Dispatch — missing: ${dispatchMissingLabels.join(", ")} (${dispatchDone}/${dispatchTotal} done). The dispatch email goes out with these attached.`
                    : needsTransitDocs
                      ? `Upload the transit documents first — missing: ${transitMissing.map(dt => ({bl:"BL",shipping_bill:"Shipping Bill",schedule_list:"Schedule List",coo:"COO"})[dt]).join(", ")} (${4 - transitMissing.length}/4 done).`
                      : needsStuffingPhoto
                        ? "Upload at least one factory stuffing photo before advancing to Container Booked."
                        : needsChecklist
                          ? "Tick every readiness checklist item before advancing to Container Booked."
                          : undefined;
                return (
                  <div key={t.status} className="flex items-center gap-1">
                    <button onClick={() => {
                      if (needsPO) { toast.error("Upload PO first"); setShowPoModal(true); return; }
                      if (needsPIFGen) { toast.error(pifHint); setShowPifListModal(true); return; }
                      if (needsChecklist) { toast.error(checklistHint); return; }
                      if (order.status === "inspection" && t.status === "inspection_passed") {
                        setShowInspectionModal(true);
                        return;
                      }
                      if (order.status === "inspection_passed" && t.status === "container_booked") {
                        setShowContainerBookedModal(true);
                        return;
                      }
                      if (needsCRO) {
                        toast.error("Upload the CRO (Container Release Order) before advancing.");
                        setShowCroAdvanceModal({ target_status: t.status });
                        return;
                      }
                      if (needsBeforeDispatchPayments) {
                        toast.error(beforeDispatchPaymentHint);
                        return;
                      }
                      if (order.status === "docs_approved" && t.status === "dispatched") {
                        const REQ_SIMPLE = [
                          "client_invoice", "client_packing_list", "logistic_invoice", "logistic_packing_list",
                          "dbk_declaration", "examination_report", "export_declaration", "factory_stuffing",
                          "insurance",
                        ];
                        const LBL = {
                          client_invoice: "Client Invoice", client_packing_list: "Client Packing List",
                          logistic_invoice: "Logistic Invoice", logistic_packing_list: "Logistic Packing List",
                          coa: "COA", msds: "MSDS",
                          dbk_declaration: "DBK Declaration", examination_report: "Examination Report",
                          export_declaration: "Export Declaration Form", factory_stuffing: "Factory Stuffing",
                          insurance: "Insurance",
                        };
                        const missingSimple = REQ_SIMPLE.filter(dt => !orderDocs.some(d => d.doc_type === dt));
                        const allMissingLabels = [
                          ...missingSimple.map(dt => LBL[dt]),
                          ...perItemDispatchMissing.map(m => m.label),
                        ];
                        if (allMissingLabels.length > 0) {
                          toast.error(`Missing: ${allMissingLabels.join(", ")}`);
                          // Insurance has its own popup; otherwise route to first missing doc
                          if (missingSimple[0] === "insurance" && allMissingLabels.length === 1) {
                            setDispatchStep("insurance");
                          } else if (missingSimple.length > 0) {
                            setUploadChecklistFor({ doc_type: missingSimple[0], label: LBL[missingSimple[0]] });
                            setChecklistUploadFile(null);
                          } else if (perItemDispatchMissing.length > 0) {
                            // All simple docs present — open editor for first missing per-item doc.
                            const first = perItemDispatchMissing[0];
                            const item = orderItems.find((it) => it.id === first.order_item_id);
                            const productName = item?.product_name || "";
                            if (first.doc_type === "coa") setCoaEditorFor({ orderItemId: first.order_item_id, productName });
                            else if (first.doc_type === "msds") setMsdsEditorFor({ orderItemId: first.order_item_id, productName });
                          }
                          return;
                        }
                        triggerDispatchEmailDraft();
                        return;
                      }
                      if (order.status === "dispatched" && t.status === "in_transit") {
                        const TRANSIT_DT = ["bl", "shipping_bill", "schedule_list", "coo"];
                        const TRANSIT_LABELS = { bl: "BL", shipping_bill: "Shipping Bill", schedule_list: "Schedule List", coo: "COO" };
                        const missing = TRANSIT_DT.filter(dt => !orderDocs.some(d => d.doc_type === dt));
                        if (missing.length > 0) {
                          toast.error(`Missing: ${missing.map(m => TRANSIT_LABELS[m]).join(", ")}`);
                          setUploadChecklistFor({ doc_type: missing[0], label: TRANSIT_LABELS[missing[0]] });
                          setChecklistUploadFile(null);
                          return;
                        }
                        // Ask for BL number + estimated delivery first, then build the draft.
                        setEstDeliveryTime("");
                        // Pre-fill BL number from a previously-saved note if any
                        const blNote = (events || []).find((e) => {
                          if (e.event_type !== "note") return false;
                          const txt = (e.description || "").trim();
                          return /^BL\s*Number\s*[:\-]/i.test(txt);
                        });
                        if (blNote) {
                          const m = (blNote.description || "").match(/^BL\s*Number\s*[:\-]\s*(.+)$/i);
                          setTransitBlNumber(m ? m[1].trim() : "");
                        } else {
                          setTransitBlNumber("");
                        }
                        setTransitDeliveryOpen(true);
                        return;
                      }
                      handleTransition(t.status);
                    }} disabled={transitioning || blocked}
                      title={pifHint || checklistHint || beforeDispatchPaymentHint}
                      className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${blocked ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                      {transitioning ? "..." : `\u2192 ${t.label}`}
                    </button>
                    {needsPO && (
                      <button onClick={() => setShowPoModal(true)} className="px-3 py-2 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium hover:bg-amber-200 flex items-center gap-1">
                        📎 Upload PO
                      </button>
                    )}
                    {needsPIFGen && (
                      <button onClick={() => setShowPifListModal(true)} className="px-3 py-2 text-xs bg-purple-100 text-purple-800 rounded-lg font-medium hover:bg-purple-200 flex items-center gap-1">
                        📄 Generate PIF ({pifCounts.done}/{pifCounts.total})
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
                <button onClick={async () => { if ((await confirmDialog("Cancel this order?"))) handleTransition("cancelled"); }}
                  className="px-4 py-2 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50">Cancel Order</button>
              )}
              {order.status === "arrived" && !order._feedback && (
                <button onClick={() => setShowFeedbackModal(true)}
                  className="px-4 py-2 bg-fuchsia-600 text-white text-sm rounded-lg font-medium hover:bg-fuchsia-700">+ Add Feedback</button>
              )}
            </div>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        )}
        {order.status === "arrived" && !order._feedback && (
          <div className="mt-3">
            <button onClick={() => setShowFeedbackModal(true)}
              className="px-4 py-2 bg-fuchsia-600 text-white text-sm rounded-lg font-medium hover:bg-fuchsia-700">
              → Add Feedback
            </button>
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

      {/* Payment Tracking — each payment row carries a Before/After
          Dispatch dropdown. Rows assigned to "Before Dispatch" act as
          checkpoints that gate the Dispatched transition. */}
      {(() => {
        const ps = order.payment_schedule || {};
        const hasTerms = !!(order.payment_terms || "").trim();
        const days = ps.days_until_balance_due;
        const balanceDueLabel = ps.balance_due_date
          ? new Date(ps.balance_due_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : null;
        const balanceUrgent = days !== null && days !== undefined && days <= 10 && !ps.balance_received;
        const balanceOverdue = days !== null && days !== undefined && days < 0 && !ps.balance_received;

        const advBefore = !!order.advance_is_before_dispatch;
        const balBefore = !!order.balance_is_before_dispatch;

        const onTogglePhase = async (which, isBefore, currentValue) => {
          if (isBefore === currentValue) return; // no-op
          const labelMap = { advance: `Advance (${ps.advance_pct}%)`, balance: `Balance (${ps.balance_pct || 100}%)` };
          const targetLabel = isBefore ? "Before Dispatch" : "After Dispatch";
          const ok = await confirmDialog({
            title: `Move ${labelMap[which]} to ${targetLabel}?`,
            message: isBefore
              ? `This makes ${labelMap[which]} a checkpoint that gates the Dispatch button. Dispatch will be blocked until this row is ticked.`
              : `${labelMap[which]} will no longer block dispatch. It moves to the After-Dispatch list with a due date computed from the order's payment terms, and the 10-day reminder will fire when it's nearly due.`,
            confirmText: "Yes, switch",
            cancelText: "Cancel",
          });
          if (!ok) return;
          try {
            await api.post(`/orders/${id}/set-payment-phase/`, { which, is_before_dispatch: isBefore });
            toast.success(`${labelMap[which]} moved to ${targetLabel}`);
            loadOrder();
          } catch (err) { toast.error(getErrorMessage(err, "Failed to update phase")); }
        };

        // Pill-style segmented toggle replaces the native <select>. Clicking
        // the inactive side prompts a confirm before flipping the row.
        const PhasePill = ({ which, isBefore }) => (
          <div className="inline-flex rounded-full border border-gray-300 bg-white overflow-hidden text-[11px] font-medium select-none shrink-0">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onTogglePhase(which, true, isBefore); }}
              className={`px-2.5 py-1 transition-colors ${isBefore ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              Before Dispatch
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onTogglePhase(which, false, isBefore); }}
              className={`px-2.5 py-1 transition-colors border-l border-gray-300 ${!isBefore ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              After Dispatch
            </button>
          </div>
        );

        const advDays = ps.days_until_advance_due;
        const advanceDueLabel = ps.advance_due_date
          ? new Date(ps.advance_due_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : null;
        const advanceUrgent = advDays !== null && advDays !== undefined && advDays <= 10 && !ps.advance_received;
        const advanceOverdue = advDays !== null && advDays !== undefined && advDays < 0 && !ps.advance_received;

        const renderAdvanceRow = () => {
          if (!ps.has_advance) return null;
          const bg = ps.advance_received
            ? "bg-emerald-50 border-emerald-300"
            : advBefore
              ? "bg-amber-50 border-amber-300"
              : advanceOverdue
                ? "bg-red-50 border-red-300"
                : advanceUrgent
                  ? "bg-amber-50 border-amber-300"
                  : "bg-gray-50 border-gray-200";
          return (
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${bg}`}>
              <input
                type="checkbox"
                checked={!!ps.advance_received}
                onChange={async (e) => {
                  const wantToMark = e.target.checked;
                  const ok = await confirmDialog({
                    title: wantToMark ? "Confirm advance received" : "Unmark advance?",
                    message: wantToMark
                      ? `Has the ${ps.advance_pct}% advance payment been confirmed by the bank?\n\nClick Yes to mark received. Click No to keep waiting.`
                      : "Unmark the advance as received?",
                    confirmText: wantToMark ? "Yes" : "Yes, unmark",
                    cancelText: wantToMark ? "No" : "Cancel",
                  });
                  if (!ok) return;
                  try {
                    await api.post(`/orders/${id}/mark-advance-payment/`, { received: wantToMark });
                    toast.success(wantToMark ? "Advance marked received" : "Advance unmarked");
                    loadOrder();
                  } catch (err) { toast.error(getErrorMessage(err, "Failed to update advance")); }
                }}
                className="mt-0.5 w-4 h-4 accent-emerald-600"
              />
              <span className="text-sm flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">Advance — {ps.advance_pct}%</span>
                  <PhasePill which="advance" isBefore={advBefore} />
                </div>
                <span className="text-gray-600 block mt-0.5">
                  {ps.advance_received ? (
                    <>Received on {fmtDateTime(order.advance_payment_received_at)}.{advBefore ? " Dispatch unlocked." : ""}</>
                  ) : advBefore ? (
                    <>Checkpoint — dispatch is blocked until this is ticked.</>
                  ) : !order.dispatched_at ? (
                    <>Due date will be set automatically once the order is dispatched.</>
                  ) : advanceDueLabel ? (
                    <>
                      Due <span className="font-semibold">{advanceDueLabel}</span>
                      {advDays !== null && advDays !== undefined && (
                        advanceOverdue
                          ? <span className="ml-2 text-red-700 font-semibold">· {Math.abs(advDays)} day(s) overdue</span>
                          : advDays <= 10
                            ? <span className="ml-2 text-amber-700 font-semibold">· {advDays} day(s) remaining</span>
                            : <span className="ml-2 text-gray-500">· {advDays} day(s) remaining</span>
                      )}
                    </>
                  ) : (
                    <>Tick once received. Does not gate dispatch.</>
                  )}
                </span>
              </span>
            </label>
          );
        };

        const renderBalanceRow = () => {
          if (!ps.has_balance) return null;
          return (
            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${ps.balance_received ? "bg-emerald-50 border-emerald-300" : balanceOverdue ? "bg-red-50 border-red-300" : balanceUrgent ? "bg-amber-50 border-amber-300" : "bg-gray-50 border-gray-200"}`}>
              <input
                type="checkbox"
                checked={!!ps.balance_received}
                onChange={async (e) => {
                  const wantToMark = e.target.checked;
                  const ok = await confirmDialog({
                    title: wantToMark ? "Confirm balance received" : "Unmark balance?",
                    message: wantToMark
                      ? `Has the ${ps.balance_pct}% balance (${ps.balance_kind || "balance"}${ps.balance_days ? ` ${ps.balance_days} days` : ""}) been received?\n\nClick Yes to clear the pending reminder.`
                      : "Unmark the balance as received? The reminder will rearm.",
                    confirmText: wantToMark ? "Yes" : "Yes, unmark",
                    cancelText: wantToMark ? "No" : "Cancel",
                  });
                  if (!ok) return;
                  try {
                    await api.post(`/orders/${id}/mark-balance-payment/`, { received: wantToMark });
                    toast.success(wantToMark ? "Balance marked received" : "Balance unmarked");
                    loadOrder();
                  } catch (err) { toast.error(getErrorMessage(err, "Failed to update balance")); }
                }}
                className="mt-0.5 w-4 h-4 accent-emerald-600"
              />
              <span className="text-sm flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">
                    Balance — {ps.balance_pct || 100}%
                    {ps.balance_kind ? ` · ${ps.balance_kind}` : ""}
                    {ps.balance_days ? ` ${ps.balance_days} days` : ""}
                  </span>
                  <PhasePill which="balance" isBefore={balBefore} />
                </div>
                <span className="text-gray-600 block mt-0.5">
                  {ps.balance_received ? (
                    <>Received on {fmtDateTime(order.balance_payment_received_at)}.</>
                  ) : balBefore ? (
                    <>Checkpoint — dispatch is blocked until this is ticked.</>
                  ) : !order.dispatched_at ? (
                    <>Due date will be set automatically once the order is dispatched.</>
                  ) : balanceDueLabel ? (
                    <>
                      Due <span className="font-semibold">{balanceDueLabel}</span>
                      {days !== null && days !== undefined && (
                        balanceOverdue
                          ? <span className="ml-2 text-red-700 font-semibold">· {Math.abs(days)} day(s) overdue</span>
                          : days <= 10
                            ? <span className="ml-2 text-amber-700 font-semibold">· {days} day(s) remaining</span>
                            : <span className="ml-2 text-gray-500">· {days} day(s) remaining</span>
                      )}
                      {order.balance_reminder_sent_at && (
                        <span className="ml-2 text-xs text-blue-600">· reminder sent</span>
                      )}
                    </>
                  ) : (
                    <>Pending — confirm once received.</>
                  )}
                </span>
              </span>
            </label>
          );
        };

        const beforeRows = [];
        const afterRows = [];
        if (ps.has_advance) (advBefore ? beforeRows : afterRows).push(renderAdvanceRow());
        if (ps.has_balance) (balBefore ? beforeRows : afterRows).push(renderBalanceRow());

        return (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">Payment Tracking</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Terms: <span className="font-medium text-gray-700">{ps.raw || order.payment_terms || "— not set —"}</span>
                </p>
              </div>
              <button
                onClick={openHeaderEditor}
                className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
                title="Edit payment terms"
              >
                ✎ Edit Terms
              </button>
            </div>

            {!hasTerms && (
              <div className="text-sm text-gray-500 italic bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
                No payment terms set yet. Click <span className="font-medium">Edit Terms</span> and enter something like
                <span className="font-medium text-gray-700"> &ldquo;50% advance D/A 60 days&rdquo;</span> to enable advance/balance tracking and the dispatch gate.
              </div>
            )}

            {hasTerms && (
              <>
                <div className="mt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-2">Before Dispatch (checkpoints)</p>
                  {beforeRows.length > 0 ? (
                    <div className="space-y-2">{beforeRows.map((r, i) => <div key={`b-${i}`}>{r}</div>)}</div>
                  ) : (
                    <p className="text-xs text-gray-500 italic px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                      No payments marked as Before Dispatch — dispatch is not blocked on this side.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-2">After Dispatch</p>
                  {afterRows.length > 0 ? (
                    <div className="space-y-2">{afterRows.map((r, i) => <div key={`a-${i}`}>{r}</div>)}</div>
                  ) : (
                    <p className="text-xs text-gray-500 italic px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                      No payments scheduled for after dispatch.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* FIRC — Foreign Inward Remittance Certificate. 11th and final step.
          Anchored just below the order timeline and pinned open from the
          moment the shipment Arrives, so the executive can see and tick
          it without scrolling past the tabs. Checkbox + in-app
          confirmation popup mirrors the Sample FIRC flow: Yes completes
          the order; No keeps it on its current step. */}
      {(order.status === "arrived" || order.status === "delivered" || order._feedback || order.firc_received_at) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold mb-3">FIRC — Foreign Inward Remittance Certificate</h3>
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${order.firc_received_at ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}>
            <input
              type="checkbox"
              checked={!!order.firc_received_at}
              onChange={async (e) => {
                const wantToMark = e.target.checked;
                if (wantToMark) {
                  const ok = await confirmDialog({
                    title: "Confirm FIRC received",
                    message: "Has the bank confirmed the Foreign Inward Remittance Certificate?\n\nClick Yes to mark FIRC received and complete the order. Click No to keep the order on its current step.",
                    confirmText: "Yes",
                    cancelText: "No",
                  });
                  if (!ok) return;
                } else {
                  const ok = await confirmDialog({
                    title: "Unmark FIRC?",
                    message: "Unmark FIRC as received? Shipment progress will drop back to 90%.",
                    confirmText: "Yes, unmark",
                    cancelText: "Cancel",
                  });
                  if (!ok) return;
                }
                try {
                  await api.post(`/orders/${id}/mark-firc/`, { received: wantToMark });
                  toast.success(wantToMark ? "FIRC marked received — order is now 100% complete" : "FIRC unmarked");
                  loadOrder();
                } catch (err) { toast.error(getErrorMessage(err, "Failed to update FIRC")); }
              }}
              className="mt-0.5 w-4 h-4 accent-emerald-600"
            />
            <span className="text-sm">
              <span className="font-semibold block">FIRC received</span>
              <span className="text-gray-600">
                {order.firc_received_at
                  ? `Received on ${fmtDateTime(order.firc_received_at)}. Shipment progress: 100%.`
                  : "Tick once the foreign payment has been confirmed by the bank. This is the final step of the order."}
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {[{ key: "details", label: "Details" }, { key: "history", label: "Status History" }, { key: "documents", label: "Documents" }, { key: "notes", label: "Notes" }].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === tab.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "details" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Order Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
              <div><span className="text-gray-500 block text-xs">Order #</span>{order.order_number}</div>
              <div><span className="text-gray-500 block text-xs">Client</span>{order.client_name}</div>
              <div><span className="text-gray-500 block text-xs">Delivery Terms</span>{order.delivery_terms}</div>
              <div><span className="text-gray-500 block text-xs">Payment Terms</span>{order.payment_terms || "—"}</div>
              <div><span className="text-gray-500 block text-xs">Freight</span>{order.freight_terms || "—"}</div>
              <div><span className="text-gray-500 block text-xs">Created</span>{fmtDate(order.created_at)}</div>
              {order.po_number && <div><span className="text-gray-500 block text-xs">PO Number</span>{order.po_number}</div>}
            </div>
          </div>
          <LineItemsCard order={order} reload={loadOrder} />
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

      {activeTab === "documents" && (() => {
        const LOGISTICS_TYPES = ["coa", "msds", "dbk_declaration", "examination_report", "export_declaration", "factory_stuffing", "non_dg_declaration"];
        const sortNewestFirst = (arr) => arr.slice().sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        // Two separate inspection folders — every upload accumulates inside
        // its own folder (newest on top).
        const inspectionPassedDocs = sortNewestFirst(
          orderDocs.filter((d) => (d.name || "").startsWith("[Inspection Passed]"))
        );
        const inspectionFailedDocs = sortNewestFirst(
          orderDocs.filter((d) => (d.name || "").startsWith("[Inspection Failed]"))
        );
        const logisticsDocs = orderDocs.filter((d) => {
          const n = d.name || "";
          if (n.startsWith("[Inspection Passed]") || n.startsWith("[Inspection Failed]")) return false;
          return LOGISTICS_TYPES.includes(d.doc_type);
        });
        const otherDocs = orderDocs.filter((d) => {
          const n = d.name || "";
          if (n.startsWith("[Inspection Passed]") || n.startsWith("[Inspection Failed]")) return false;
          return !LOGISTICS_TYPES.includes(d.doc_type);
        });
        const stripPrefix = (name) => (name || "").replace(/^\[Inspection (Passed|Failed)\]\s*/, "");
        const inspectionTag = () => null;
        const renderDocRow = (doc) => (
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
                <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                  {stripPrefix(doc.name)}
                  {inspectionTag(doc.name) && (
                    <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 ${inspectionTag(doc.name).classes}`}>
                      {inspectionTag(doc.name).label}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{doc.doc_type} · {fmtDateTime(doc.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-600 font-medium">View</span>
              {["client_invoice","logistic_invoice","client_packing_list","logistic_packing_list","coa","msds","dbk_declaration","examination_report","export_declaration","factory_stuffing","non_dg_declaration","pif"].includes(doc.doc_type) && (
                <button onClick={(e) => { e.stopPropagation(); openEditorForDocType(doc.doc_type); }} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
              )}
              <button onClick={async (e) => { e.stopPropagation(); if (!(await confirmDialog("Delete this document?"))) return; try { await api.post(`/orders/${id}/delete-document/`, { doc_id: doc.id }); toast.success("Deleted"); loadOrder(); } catch { toast.error("Failed to delete"); } }} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
            </div>
          </div>
        );
        const renderFolder = (label, docs, accent) => (
          <details open className={`border ${accent.border} rounded-lg ${accent.bg}`}>
            <summary className={`px-3 py-2 cursor-pointer flex items-center justify-between ${accent.headerText} font-medium text-sm`}>
              <span className="flex items-center gap-2">📁 {label} <span className={`text-[11px] ${accent.badge} px-1.5 py-0.5 rounded`}>{docs.length}</span></span>
            </summary>
            <div className="p-3 pt-0 space-y-2">
              {docs.length === 0 ? <p className="text-xs text-gray-500">No documents in this folder yet.</p> : docs.map(renderDocRow)}
            </div>
          </details>
        );
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Documents ({orderDocs.length})</h3>
              <button onClick={() => setShowDocModal(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg">+ Upload</button>
            </div>
            {orderDocs.length === 0 ? <p className="text-gray-400 text-sm">No documents uploaded</p> : (
              <div className="space-y-3">
                {(inspectionPassedDocs.length > 0 || order.inspection_passed_at) && renderFolder(
                  "Inspection Passed",
                  inspectionPassedDocs,
                  { border: "border-emerald-200", bg: "bg-emerald-50/30", headerText: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
                )}
                {inspectionFailedDocs.length > 0 && renderFolder(
                  "Inspection Failed",
                  inspectionFailedDocs,
                  { border: "border-rose-200", bg: "bg-rose-50/30", headerText: "text-rose-800", badge: "bg-rose-100 text-rose-700" },
                )}
                {logisticsDocs.length > 0 && renderFolder(
                  "Logistics",
                  logisticsDocs,
                  { border: "border-indigo-200", bg: "bg-indigo-50/30", headerText: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700" },
                )}
                <div className="space-y-2">{otherDocs.map(renderDocRow)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "notes" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4">Notes</h3>
          <div
            className={`mb-4 p-3 rounded-lg border-2 border-dashed transition-colors ${isDraggingNote ? "border-indigo-400 bg-indigo-50" : "border-transparent"}`}
            onDragOver={(e) => { e.preventDefault(); if (!isDraggingNote) setIsDraggingNote(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDraggingNote(false); }}
            onDrop={handleNoteDrop}
          >
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onPaste={handleNotePaste}
                placeholder="Add a note... (drag & drop or paste files here)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNote(); } }}
              />
              <button onClick={submitNote} disabled={!newNote.trim() && noteAttachments.length === 0 && noteExistingDocs.length === 0} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40">Add</button>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button type="button" onClick={pickNoteFile} title="Attach file(s) from device" className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📎 <span className="text-xs">File</span></button>
              <button type="button" onClick={openCamera} title="Take photo with camera" className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📷 <span className="text-xs">Photo</span></button>
              {!recording ? (
                <button type="button" onClick={startVoiceRecording} title="Record voice" className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">🎤 <span className="text-xs">Voice</span></button>
              ) : (
                <button type="button" onClick={stopVoiceRecording} className="px-2.5 py-1.5 text-sm border border-red-400 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 flex items-center gap-1 animate-pulse">⏹ <span className="text-xs">Stop ({recordElapsed}s)</span></button>
              )}
              <button type="button" onClick={openLibraryPicker} title="Pick from Documents library" className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📂 <span className="text-xs">From Docs</span></button>
              <span className="text-xs text-gray-400 ml-1 hidden sm:inline">or drag & drop / paste files</span>
            </div>
            {(noteAttachments.length > 0 || noteExistingDocs.length > 0) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {noteAttachments.map((att, idx) => (
                  <div key={`new-${idx}`} className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                    {att.kind === "photo" || att.kind === "image" || att.file.type.startsWith("image/") ? (
                      <img src={att.previewUrl} alt="preview" className="w-8 h-8 object-cover rounded" />
                    ) : att.kind === "voice" || att.file.type.startsWith("audio/") ? (
                      <span className="text-base">🎵</span>
                    ) : (
                      <span className="text-base">📄</span>
                    )}
                    <span className="text-xs text-indigo-800 max-w-[160px] truncate">{att.file.name}</span>
                    <button type="button" onClick={() => removeNoteAttachment(idx)} className="text-xs text-red-600 hover:text-red-800">✕</button>
                  </div>
                ))}
                {noteExistingDocs.map((d) => (
                  <div key={`existing-${d.id}`} className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="text-base">📂</span>
                    <span className="text-xs text-emerald-800 max-w-[160px] truncate">{d.name}</span>
                    <button type="button" onClick={() => removeExistingDoc(d.id)} className="text-xs text-red-600 hover:text-red-800">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {events.filter(e => e.event_type === "note").length === 0 && (
              <p className="text-sm text-gray-400">No notes yet.</p>
            )}
            {events.filter(e => e.event_type === "note").reverse().map((note) => {
              const md = note.metadata || {};
              const rawList = Array.isArray(md.attachments) && md.attachments.length > 0
                ? md.attachments
                : (md.attachment_url ? [{ url: md.attachment_url, name: md.attachment_name, kind: md.attachment_kind }] : []);
              const atts = rawList.map((a) => {
                const url = a.url ? (a.url.startsWith("http") ? a.url : `http://localhost:8000${a.url}`) : null;
                const name = a.name || "";
                const ext = (name.split(".").pop() || "").toLowerCase();
                const isImage = a.kind === "photo" || a.kind === "image" || ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
                const isAudio = a.kind === "voice" || ["mp3","wav","ogg","webm","m4a"].includes(ext);
                return { url, name, isImage, isAudio };
              });
              return (
                <div key={note.id} className="p-3 bg-gray-50 rounded-lg">
                  {editingNoteId === note.id ? (
                    <div className="flex gap-2">
                      <input value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none" onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("saveNoteBtn")?.click(); if (e.key === "Escape") setEditingNoteId(null); }} />
                      <button id="saveNoteBtn" onClick={async () => {
                        try { await api.patch(`/orders/${id}/events/${note.id}/`, { description: editingNoteText }); setEditingNoteId(null); loadOrder(); toast.success("Note updated"); } catch { toast.error("Failed to update"); }
                      }} className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">Save</button>
                      <button onClick={() => setEditingNoteId(null)} className="px-2 py-1 border border-gray-300 text-xs rounded hover:bg-gray-50">Cancel</button>
                    </div>
                  ) : (
                    note.description && <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.description}</p>
                  )}
                  {atts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {atts.map((a, i) => a.url && (
                        a.isImage ? (
                          <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-48 rounded border border-gray-200" /></a>
                        ) : a.isAudio ? (
                          <audio key={i} controls src={a.url} className="max-w-full" />
                        ) : (
                          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-indigo-700 hover:bg-indigo-50">📎 <span className="truncate max-w-[240px]">{a.name}</span></a>
                        )
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span className="font-medium text-gray-600">{note.triggered_by_name || "System"}</span>
                    <span>·</span>
                    <span>{note.created_at ? format(new Date(note.created_at), "MMM d, yyyy h:mm a") : ""}</span>
                    {editingNoteId !== note.id && atts.length === 0 && (
                      <button onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.description); }} className="text-indigo-500 hover:text-indigo-700 ml-1">Edit</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Client Feedback — only shown once the order reaches the Feedback stage (arrived/delivered) or already has feedback */}
      {(order.status === "arrived" || order.status === "delivered" || order._feedback) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Client Feedback</h3>
            {!order._feedback && (
              <button onClick={() => setShowFeedbackModal(true)} className="px-3 py-1.5 text-xs font-medium rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
                + Add Feedback
              </button>
            )}
          </div>
          {order._feedback ? (
            <div className="space-y-3 text-sm">
              {order._feedback.comments && <div><span className="text-gray-500">Comments:</span> <span className="ml-1">{order._feedback.comments}</span></div>}
              {order._feedback.issues && <div><span className="text-gray-500">Issues:</span> <span className="ml-1">{order._feedback.issues}</span></div>}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No feedback recorded yet.</p>
          )}
        </div>
      )}


      <Modal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="Add Client Feedback" size="sm">
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(`/orders/${id}/add-feedback/`, orderFeedbackForm);
            toast.success("Feedback recorded");
            setShowFeedbackModal(false);
            setOrderFeedbackForm({ comments: "", issues: "", bulk_order_interest: false });
            loadOrder();
          } catch (err) { toast.error(getErrorMessage(err, "Failed to submit feedback")); }
        }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Comments</label>
            <textarea value={orderFeedbackForm.comments} onChange={(e) => setOrderFeedbackForm({ ...orderFeedbackForm, comments: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issues</label>
            <textarea value={orderFeedbackForm.issues} onChange={(e) => setOrderFeedbackForm({ ...orderFeedbackForm, issues: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowFeedbackModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Submit Feedback</button>
          </div>
        </form>
      </Modal>

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

      {/* Doc Picker Modal (pick from Documents library) */}
      {showDocPicker && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDocPicker(false)}>
          <div className="bg-white rounded-xl overflow-hidden max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Select from Documents library</h3>
                <p className="text-xs text-gray-500">Link existing files from the Documents section</p>
              </div>
              <button onClick={() => setShowDocPicker(false)} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="px-3 pt-3">
              <input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search documents..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {libraryLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
              ) : (() => {
                const q = librarySearch.trim().toLowerCase();
                const filtered = !q ? libraryDocs : libraryDocs.filter((d) => (d.name || "").toLowerCase().includes(q) || (d.filename || "").toLowerCase().includes(q) || (d.folder_name || "").toLowerCase().includes(q));
                if (filtered.length === 0) {
                  return <p className="text-sm text-gray-400 text-center py-8">{q ? "No matches." : "No documents in the library yet."}</p>;
                }
                return filtered.map((doc) => {
                  const picked = noteExistingDocs.some((d) => d.id === doc.id);
                  const ext = ((doc.filename || doc.name || "").split(".").pop() || "").toLowerCase();
                  const icon = ["jpg","jpeg","png","gif","webp","svg"].includes(ext) ? "🖼️"
                    : ext === "pdf" ? "📄"
                    : ["xls","xlsx","csv"].includes(ext) ? "📊"
                    : ["doc","docx"].includes(ext) ? "📝"
                    : ["mp3","wav","ogg","webm","m4a"].includes(ext) ? "🎵"
                    : "📎";
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => { if (picked) removeExistingDoc(doc.id); else addExistingDoc(doc); }}
                      className={`w-full text-left flex items-center justify-between p-3 rounded-lg border transition-colors ${picked ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl">{icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {doc.folder_name ? `📁 ${doc.folder_name} · ` : ""}
                            {doc.filename}
                            {doc.created_at ? ` · ${fmtDateTime(doc.created_at)}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium whitespace-nowrap ml-2 ${picked ? "text-emerald-700" : "text-indigo-600"}`}>{picked ? "✓ Selected" : "Select"}</span>
                    </button>
                  );
                });
              })()}
            </div>
            <div className="p-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">{noteExistingDocs.length} selected</span>
              <button onClick={() => setShowDocPicker(false)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={closeCamera}>
          <div className="bg-white rounded-xl overflow-hidden max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold">Take a photo</h3>
              <button onClick={closeCamera} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-contain" />
            </div>
            <div className="p-3 flex justify-center gap-3">
              <button onClick={capturePhoto} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">📷 Capture</button>
              <button onClick={closeCamera} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

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

      {/* PIF List + Editor */}
      <PIFListModal
        open={showPifListModal}
        orderId={id}
        onClose={() => { setShowPifListModal(false); loadOrder(); }}
      />

      <PackingListEditorModal
        open={!!packingListType}
        orderId={id}
        listType={packingListType}
        onClose={() => { setPackingListType(null); loadOrder(); }}
        onGenerated={loadOrder}
      />

      <COAEditorModal
        key={`coa-${coaEditorFor?.orderItemId || 'none'}-${coaEditorFor?.scope || 'both'}`}
        open={!!coaEditorFor}
        onClose={() => setCoaEditorFor(null)}
        productName={coaEditorFor?.productName || ""}
        clientName={order?.client_name || ""}
        docsMode
        onGenerate={async (formData) => {
          try {
            const itemId = coaEditorFor?.orderItemId || null;
            const scope = coaEditorFor?.scope || "both";
            const isFormData = formData instanceof FormData;
            if (isFormData) {
              const existing = JSON.parse(formData.get("payload"));
              existing.order_id = id;
              existing.scope = scope;
              if (itemId) existing.order_item_id = itemId;
              formData.set("payload", JSON.stringify(existing));
              await api.post("/communications/generate-coa-pdf/", formData, { headers: { "Content-Type": "multipart/form-data" } });
            } else {
              await api.post("/communications/generate-coa-pdf/", { ...formData, order_id: id, scope, ...(itemId ? { order_item_id: itemId } : {}) });
            }
            toast.success(`COA generated (${scope === "both" ? "for both Client and Logistic" : `${scope} only`})`);
            setCoaEditorFor(null);
            loadOrder();
          } catch { toast.error("Failed to generate COA"); }
        }}
      />

      <MSDSEditorModal
        key={`msds-${msdsEditorFor?.orderItemId || 'none'}-${msdsEditorFor?.scope || 'both'}`}
        open={!!msdsEditorFor}
        onClose={() => setMsdsEditorFor(null)}
        productName={msdsEditorFor?.productName || ""}
        docsMode
        onGenerate={async (formData) => {
          try {
            const itemId = msdsEditorFor?.orderItemId || null;
            const scope = msdsEditorFor?.scope || "both";
            await api.post("/communications/generate-msds-pdf/", { ...formData, order_id: id, scope, ...(itemId ? { order_item_id: itemId } : {}) });
            toast.success(`MSDS generated (${scope === "both" ? "for both Client and Logistic" : `${scope} only`})`);
            setMsdsEditorFor(null);
            loadOrder();
          } catch { toast.error("Failed to generate MSDS"); }
        }}
      />

      {/* Scope chooser — asks whether COA/MSDS should cover both audiences
          or only one before opening the editor. */}
      <Modal
        open={!!scopeAskFor}
        onClose={() => setScopeAskFor(null)}
        title={scopeAskFor ? `Generate ${scopeAskFor.kind?.toUpperCase()} for…` : "Generate"}
        size="md"
      >
        {scopeAskFor && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Will the same {scopeAskFor.kind?.toUpperCase()} be used for both Client and Logistic, or do you need separate copies?
            </p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: "both", label: "Same for both Client and Logistic", desc: "One document satisfies both rows." },
                { value: "client", label: "Different — Client only", desc: "Generate a separate Client copy now. Logistic stays missing until you generate that one." },
                { value: "logistic", label: "Different — Logistic only", desc: "Generate a separate Logistic copy now. Client stays missing until you generate that one." },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const target = { orderItemId: scopeAskFor.orderItemId, productName: scopeAskFor.productName, scope: opt.value };
                    if (scopeAskFor.kind === "coa") setCoaEditorFor(target);
                    else setMsdsEditorFor(target);
                    setScopeAskFor(null);
                  }}
                  className="text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
                >
                  <div className="text-sm font-semibold text-gray-800">{opt.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button onClick={() => setScopeAskFor(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <ComplianceDocEditorModal
        open={!!complianceDocType}
        orderId={id}
        docType={complianceDocType}
        onClose={() => { setComplianceDocType(null); loadOrder(); }}
        onGenerated={loadOrder}
      />

      {/* CRO arrival prompt — shown on landing at Container Booked */}
      {showCroPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCroPromptModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Upload Container Release Order</h3>
              <p className="text-sm text-gray-500 mt-1">This order just entered Container Booked. Please upload the CRO document when ready. You'll be reminded every 2 hours until it's attached.</p>
            </div>
            <div className="p-5 flex flex-col gap-2">
              <button
                onClick={() => { setShowCroPromptModal(false); setUploadChecklistFor({ doc_type: "cro", label: "CRO" }); setChecklistUploadFile(null); }}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
              >
                Upload CRO now
              </button>
              <button
                onClick={() => setShowCroPromptModal(false)}
                className="w-full px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRO required popup — shown when trying to leave Container Booked without a CRO.
          The "Continue without CRO" escape hatch is intentionally removed:
          CRO must be uploaded before advancing. The Celery reminder pings every 2 hours. */}
      {showCroAdvanceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCroAdvanceModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">CRO required</h3>
              <p className="text-sm text-gray-500 mt-1">The Container Release Order (CRO) must be uploaded before this order can advance. You'll be reminded every 2 hours until it's attached.</p>
            </div>
            <div className="p-5 flex flex-col gap-2">
              <button
                onClick={() => { setShowCroAdvanceModal(null); setUploadChecklistFor({ doc_type: "cro", label: "CRO" }); setChecklistUploadFile(null); }}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700"
              >
                Upload CRO now
              </button>
              <button
                onClick={() => setShowCroAdvanceModal(null)}
                className="w-full px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Container Booked — capture shipment shipping details */}
      {showContainerBookedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-4">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Container Booked — Shipment Details</h3>
              <p className="text-sm text-gray-500 mt-1">Capture the shipping details for this order. These will be saved to the linked shipment and the shipment status will move to <strong>Container Booked</strong>.</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {[
                ["forwarder", "Freight Forwarder", "text"],
                ["cha", "CHA (Customs House Agent)", "text"],
                ["shipping_line", "Liner", "text"],
                ["port_of_loading", "Port of Loading", "text"],
                ["port_of_discharge", "Port of Discharge", "text"],
              ].map(([key, label, type]) => (
                <div key={key} className={key === "shipping_line" ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
                  <input
                    type={type}
                    value={shipmentForm[key] || ""}
                    onChange={(e) => setShipmentForm({ ...shipmentForm, [key]: e.target.value })}
                    spellCheck="true"
                    lang="en"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-300 rounded-lg">
                <button
                  onClick={checkShipmentGrammar}
                  disabled={shipmentGrammarChecking}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-white border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-50"
                  title="AI-powered spell check and grammar review"
                >
                  {shipmentGrammarChecking ? (
                    <><span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" /> Checking...</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Check Grammar</>
                  )}
                </button>
                {shipmentGrammarFixes.length > 0 && (
                  <>
                    <span className="text-[11px] text-red-600 font-medium">{shipmentGrammarFixes.length} issue{shipmentGrammarFixes.length > 1 ? "s" : ""} found</span>
                    <button onClick={applyAllShipmentFixes} className="text-[11px] px-2 py-0.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700">Fix All</button>
                  </>
                )}
                <span className="text-[11px] text-gray-400 ml-auto">Browser spellcheck is also active — right-click a red-underlined word for suggestions.</span>
              </div>
              {shipmentGrammarFixes.length > 0 && (
                <div className="mt-2 border border-gray-300 rounded-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
                  {shipmentGrammarFixes.map((fix, i) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 text-xs border-b border-gray-100 last:border-0 hover:bg-yellow-50/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="line-through text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">{fix.original}</span>
                          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                          <span className="text-green-700 font-medium bg-green-50 px-1.5 py-0.5 rounded">{fix.corrected}</span>
                          {fix.key && <span className="text-[10px] text-gray-500 italic">({fix.key.replace(/_/g, " ")})</span>}
                        </div>
                        {fix.reason && <p className="text-gray-500 mt-0.5">{fix.reason}</p>}
                      </div>
                      <button onClick={() => applyShipmentFix(fix)} className="shrink-0 px-2 py-1 bg-green-600 text-white rounded font-medium hover:bg-green-700">Fix</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button onClick={() => setShowContainerBookedModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={submitContainerBooked} disabled={containerBookedSubmitting} className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
                {containerBookedSubmitting ? "Saving..." : "Save & Mark Container Booked"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch step 1 — Insurance upload (mandatory) */}
      {dispatchStep === "insurance" && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Upload Insurance</h3>
              <p className="text-sm text-gray-500 mt-1">Insurance is mandatory to proceed with Dispatch.</p>
            </div>
            <form onSubmit={submitInsuranceUpload} className="p-5 space-y-4">
              <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${insuranceFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}>
                <input type="file" onChange={(e) => setInsuranceFile(e.target.files[0])} className="hidden" />
                {insuranceFile ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-800">{insuranceFile.name}</p>
                    <p className="text-xs text-gray-400">{(insuranceFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Click to select Insurance file</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, image, etc.</p>
                  </div>
                )}
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={!insuranceFile || insuranceUploading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">
                  {insuranceUploading ? "Uploading..." : "Upload & Continue"}
                </button>
                <button type="button" onClick={() => { setDispatchStep(null); setInsuranceFile(null); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In Transit — BL Number + Estimated delivery prompt */}
      {transitDeliveryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">In Transit — Confirm Details</h3>
              <p className="text-sm text-gray-500 mt-1">Both fields are saved to Notes for future reference and added to the In-Transit email.</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">BL Number <span className="text-red-500">*</span></label>
                <input
                  value={transitBlNumber}
                  onChange={(e) => setTransitBlNumber(e.target.value)}
                  placeholder="e.g. MEDUMR123456789"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                />
                {transitBlNumber.trim() && <p className="text-[11px] text-gray-500 mt-1">Will be saved to Notes as <span className="font-medium">"BL Number: {transitBlNumber.trim()}"</span>.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Delivery <span className="text-red-500">*</span></label>
                <input
                  value={estDeliveryTime}
                  onChange={(e) => setEstDeliveryTime(e.target.value)}
                  placeholder="e.g. 25–30 days from dispatch / 15 May 2026 / Arriving Mombasa Port by 03 May"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={submitTransitDelivery} disabled={!transitBlNumber.trim() || !estDeliveryTime.trim() || transitSubmitting} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">
                  {transitSubmitting ? "Preparing..." : "Save & Open Email Draft"}
                </button>
                <button onClick={() => { setTransitDeliveryOpen(false); setEstDeliveryTime(""); setTransitBlNumber(""); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Factory Stuffing photo upload — opens after Inspection Passed/Failed */}
      {showStuffingPhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full my-4">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Upload {inspectionUploadFor === "failed" ? "Inspection Failed Evidence" : "Factory Stuffing Photos"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {inspectionUploadFor === "failed"
                  ? "Attach photos, files, or voice notes documenting the inspection failure. Everything uploaded here will be filed under the Inspection Failed folder in the Documents tab."
                  : "Upload at least one photo to enable Container Booked. You can drop files, paste, snap a photo, record voice, or pick from the Documents library — same options as Notes. The popup stays open until you click Close. Items will be filed under the Inspection Passed folder in the Documents tab."}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div
                className={`p-3 rounded-lg border-2 border-dashed transition-colors ${isDraggingNote ? "border-indigo-400 bg-indigo-50" : "border-gray-300"}`}
                onDragOver={(e) => { e.preventDefault(); if (!isDraggingNote) setIsDraggingNote(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingNote(false); }}
                onDrop={handleNoteDrop}
              >
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onPaste={handleNotePaste}
                  placeholder="Optional caption (drag & drop or paste files here)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button type="button" onClick={pickNoteFile} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📎 <span className="text-xs">File</span></button>
                  <button type="button" onClick={openCamera} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📷 <span className="text-xs">Photo</span></button>
                  {!recording ? (
                    <button type="button" onClick={startVoiceRecording} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">🎤 <span className="text-xs">Voice</span></button>
                  ) : (
                    <button type="button" onClick={stopVoiceRecording} className="px-2.5 py-1.5 text-sm border border-red-400 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 flex items-center gap-1 animate-pulse">⏹ <span className="text-xs">Stop ({recordElapsed}s)</span></button>
                  )}
                  <button type="button" onClick={openLibraryPicker} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">📂 <span className="text-xs">From Docs</span></button>
                </div>
                {(noteAttachments.length > 0 || noteExistingDocs.length > 0) && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {noteAttachments.map((att, idx) => (
                      <div key={`new-${idx}`} className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                        {att.kind === "photo" || att.kind === "image" || att.file.type.startsWith("image/") ? (
                          <img src={att.previewUrl} alt="preview" className="w-8 h-8 object-cover rounded" />
                        ) : att.kind === "voice" || att.file.type.startsWith("audio/") ? (
                          <span className="text-base">🎵</span>
                        ) : (
                          <span className="text-base">📄</span>
                        )}
                        <span className="text-xs text-indigo-800 max-w-[160px] truncate">{att.file.name}</span>
                        <button type="button" onClick={() => removeNoteAttachment(idx)} className="text-xs text-red-600 hover:text-red-800">✕</button>
                      </div>
                    ))}
                    {noteExistingDocs.map((d) => (
                      <div key={`existing-${d.id}`} className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <span className="text-base">📂</span>
                        <span className="text-xs text-emerald-800 max-w-[160px] truncate">{d.name}</span>
                        <button type="button" onClick={() => removeExistingDoc(d.id)} className="text-xs text-red-600 hover:text-red-800">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={async () => { await submitNote(inspectionUploadFor === "failed" ? "Inspection Failed" : inspectionUploadFor === "passed" ? "Inspection Passed" : null); }} disabled={!newNote.trim() && noteAttachments.length === 0 && noteExistingDocs.length === 0} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">Add to Notes</button>
                <button onClick={() => { setShowStuffingPhotoModal(false); setInspectionUploadFor(null); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspection result popup — shown when leaving Under Inspection */}
      {showInspectionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowInspectionModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Inspection Result</h3>
              <p className="text-sm text-gray-500 mt-1">Select the outcome of the inspection.</p>
            </div>
            <div className="p-5 flex flex-col gap-2">
              <button
                onClick={async () => {
                  setShowInspectionModal(false);
                  await handleTransition("inspection_passed");
                  setInspectionUploadFor("passed");
                  setShowStuffingPhotoModal(true);
                }}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700"
              >
                ✓ Inspection Passed
              </button>
              <button
                onClick={() => {
                  setShowInspectionModal(false);
                  toast("Inspection failed — order stays at Under Inspection.", { icon: "⚠️" });
                  setInspectionUploadFor("failed");
                  setShowStuffingPhotoModal(true);
                }}
                className="w-full px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700"
              >
                ✕ Inspection Failed
              </button>
              <button
                onClick={() => setShowInspectionModal(false)}
                className="w-full px-4 py-2 mt-1 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Docs Checklist Upload Modal */}
      <Modal open={!!uploadChecklistFor} onClose={() => { setUploadChecklistFor(null); setChecklistUploadFile(null); setBlNumberInput(""); }} title={uploadChecklistFor ? `Upload ${uploadChecklistFor.label}` : "Upload"} size="sm">
        <form onSubmit={handleChecklistUpload} className="space-y-4">
          {uploadChecklistFor?.doc_type === "bl" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">BL Number <span className="text-red-500">*</span></label>
              <input
                value={blNumberInput}
                onChange={(e) => setBlNumberInput(e.target.value)}
                placeholder="e.g. MEDUMR123456789"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                autoFocus
              />
              <p className="text-[11px] text-gray-500 mt-1">Saved to Notes and synced to the linked Shipment.</p>
            </div>
          )}
          <label
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer?.files?.[0];
              if (f) setChecklistUploadFile(f);
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items || [];
              for (const it of items) {
                if (it.kind === "file") {
                  const f = it.getAsFile();
                  if (f) {
                    setChecklistUploadFile(f);
                    e.preventDefault();
                    return;
                  }
                }
              }
            }}
            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${checklistUploadFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}
          >
            <input type="file" onChange={(e) => setChecklistUploadFile(e.target.files[0])} className="hidden" />
            {checklistUploadFile ? (
              <div className="text-center">
                <p className="text-sm font-medium text-gray-800">{checklistUploadFile.name}</p>
                <p className="text-xs text-gray-400">{(checklistUploadFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-gray-500">Click to select, drag &amp; drop, or paste a file</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, Images</p>
              </div>
            )}
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={!checklistUploadFile || (uploadChecklistFor?.doc_type === "bl" && !blNumberInput.trim())} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40">Upload</button>
            <button type="button" onClick={() => { setUploadChecklistFor(null); setChecklistUploadFile(null); setBlNumberInput(""); }} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

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
        onSave={handleSaveCI}
        generating={ciSending}
        onGeneratePdf={async () => {
          if (!ci?.id) return;
          try {
            const res = await api.get(`/finance/ci/${ci.id}/generate-pdf/`, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            window.open(URL.createObjectURL(blob), "_blank");
            toast.success("Client Invoice generated & saved to Documents");
            setShowCiModal(false);
            loadOrder();
          } catch { toast.error("Failed to generate CI"); }
        }}
      />

      {/* LI Editor Modal */}
      <LIEditorModal
        open={showLiModal && !liLoading}
        onClose={() => setShowLiModal(false)}
        li={li} liForm={liForm} setLiForm={setLiForm}
        liItems={liItems} setLiItems={setLiItems}
        onSave={handleSaveLI}
        generating={liSending}
        onGeneratePdf={async () => {
          if (!li?.id) return;
          try {
            const res = await api.get(`/finance/li/${li.id}/generate-pdf/`, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            window.open(URL.createObjectURL(blob), "_blank");
            toast.success("Logistic Invoice generated & saved to Documents");
            setShowLiModal(false);
            loadOrder();
          } catch { toast.error("Failed to generate LI"); }
        }}
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

      {/* Edit order header — total amount + payment terms */}
      <Modal open={editHeaderOpen} onClose={() => !headerSaving && setEditHeaderOpen(false)} title="Edit Order Details" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Total Amount ({order?.currency || "USD"})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={headerForm.total ?? ""}
              onChange={(e) => setHeaderForm((f) => ({ ...f, total: e.target.value }))}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">Overrides the auto-computed total. Adding or editing line items will recompute it.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms</label>
            <input
              type="text"
              value={headerForm.payment_terms ?? ""}
              onChange={(e) => setHeaderForm((f) => ({ ...f, payment_terms: e.target.value }))}
              placeholder='e.g. "50% advance D/A 60 days" · "100% advance" · "D/P at sight"'
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">Drives the Payment Tracking card. Advance % blocks dispatch; balance days set the due date and 10-day reminder.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              disabled={headerSaving}
              onClick={() => setEditHeaderOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >Cancel</button>
            <button
              type="button"
              disabled={headerSaving}
              onClick={saveHeaderEdits}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >{headerSaving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
