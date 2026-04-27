"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import COAEditorModal from "@/components/finance/COAEditorModal";
import MSDSEditorModal from "@/components/finance/MSDSEditorModal";

function fmtDate(d) {
  if (!d) return "";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return ""; }
}

function StatusStepper({ timeline, onStepClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 overflow-x-auto">
      <h3 className="font-semibold mb-4">Sample Progress</h3>
      <div className="flex gap-0 min-w-max">
        {timeline.map((step, i) => {
          const handler = onStepClick ? () => onStepClick(step) : undefined;
          const clickable = !!handler;
          return (
            <div key={step.key} className="flex items-center">
              <div
                className={`flex flex-col items-center ${clickable ? "cursor-pointer group" : ""}`}
                onClick={handler}
                title={clickable ? `Open ${step.label}` : undefined}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    step.state === "completed"
                      ? "bg-green-500 border-green-500 text-white"
                      : step.state === "current"
                      ? "bg-fuchsia-600 border-fuchsia-600 text-white ring-4 ring-fuchsia-100"
                      : "bg-white border-gray-300 text-gray-400"
                  } ${clickable ? "group-hover:scale-110 transition-transform" : ""}`}
                >
                  {step.state === "completed" ? "\u2713" : i + 1}
                </div>
                <p
                  className={`text-[11px] mt-2 text-center w-24 leading-tight ${
                    step.state === "current"
                      ? "text-fuchsia-700 font-semibold"
                      : step.state === "completed"
                      ? "text-green-700"
                      : "text-gray-400"
                  } ${clickable ? "group-hover:underline" : ""}`}
                >
                  {step.label}
                </p>
                {step.timestamp && (
                  <p className="text-[9px] text-gray-400 mt-0.5">{fmtDate(step.timestamp)}</p>
                )}
              </div>
              {i < timeline.length - 1 && (
                <div
                  className={`w-10 h-0.5 -mt-7 ${
                    step.state === "completed" ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SampleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const currentUser = useSelector((state) => state.auth.user);
  const canRevert = currentUser?.role === "admin" || currentUser?.role === "manager";
  const [sample, setSample] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [courierDetails, setCourierDetails] = useState("");
  const [sampleDocs, setSampleDocs] = useState([]);
  const [showCOAEditor, setShowCOAEditor] = useState(false);
  const [showMSDSEditor, setShowMSDSEditor] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    rating: "5",
    comments: "",
    issues: "",
    bulk_order_interest: false,
  });
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [reverting, setReverting] = useState(false);
  // Local copy of items for inline editing — saved on demand via "Save Items"
  const [itemsLocal, setItemsLocal] = useState([]);
  const [savingItems, setSavingItems] = useState(false);
  // Checkbox state for each product — all must be checked before marking "Prepared"
  const [checkedItems, setCheckedItems] = useState(new Set());
  // Inline edit state for the Shipping Details card
  const [editingShipping, setEditingShipping] = useState(false);
  const [shippingForm, setShippingForm] = useState({
    tracking_number: "",
    courier_details: "",
    notes: "",
  });
  const [savingShipping, setSavingShipping] = useState(false);

  const loadSample = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api.get(`/samples/${id}/`),
        api.get(`/samples/${id}/timeline/`),
      ]);
      setSample(s.data);
      setTimeline(t.data);
      setTrackingNumber(s.data.tracking_number || "");
      setCourierDetails(s.data.courier_details || "");
      setItemsLocal(s.data.items || []);
      setSampleDocs(s.data.documents || []);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load sample"));
      router.push("/samples");
    } finally {
      setLoading(false);
    }
  };

  // Items list editing helpers (multiple products per sample)
  const itemsDirty = JSON.stringify(itemsLocal) !== JSON.stringify(sample?.items || []);
  const addItem = () => setItemsLocal((prev) => [...prev, { product_name: "", client_product_name: "", quantity: "" }]);
  const updateItem = (idx, field, value) => {
    setItemsLocal((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const removeItem = (idx) => {
    setItemsLocal((prev) => prev.filter((_, i) => i !== idx));
  };
  const resetItems = () => setItemsLocal(sample?.items || []);
  const allItemsChecked = itemsLocal.length > 0 && itemsLocal.every((_, i) => checkedItems.has(i));
  const toggleItemCheck = (idx) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const saveItems = async () => {
    setSavingItems(true);
    try {
      await api.patch(`/samples/${id}/`, { items: itemsLocal });
      toast.success("Items saved");
      loadSample();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save items"));
    } finally {
      setSavingItems(false);
    }
  };

  useEffect(() => { loadSample(); }, [id]);

  // Reload sample data when the tab becomes visible again — covers the case
  // where the user navigated to the email composition page, sent the email,
  // and came back. Without this, dispatch_notified_at stays stale and the
  // "Notify Client" button incorrectly persists.
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible") loadSample(); };
    document.addEventListener("visibilitychange", handler);
    // Also reload on popstate (browser back button)
    window.addEventListener("popstate", loadSample);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("popstate", loadSample);
    };
  }, [id]);

  const advance = async (target, extra = {}, onSuccess = null) => {
    setAdvancing(true);
    try {
      await api.post(`/samples/${id}/advance/`, { target, ...extra });
      toast.success(`Marked as ${target.replace("_", " ")}`);
      setShowDispatchModal(false);
      // Allow caller to run additional logic after a successful advance
      // (e.g. immediately navigate to the AI Draft to notify the client).
      if (onSuccess) {
        onSuccess();
      } else {
        loadSample();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to advance"));
    } finally {
      setAdvancing(false);
    }
  };

  const startEditShipping = () => {
    setShippingForm({
      tracking_number: sample.tracking_number || "",
      courier_details: sample.courier_details || "",
      notes: sample.notes || "",
    });
    setEditingShipping(true);
  };

  const saveShipping = async () => {
    setSavingShipping(true);
    try {
      await api.patch(`/samples/${id}/`, shippingForm);
      toast.success("Shipping details updated");
      setEditingShipping(false);
      loadSample();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save"));
    } finally {
      setSavingShipping(false);
    }
  };

  // Open the AI Draft for the source email and pre-fill body with the
  // dispatch notification (tracking + courier). Replies stay in the same
  // thread because they all target the same source_communication.
  const replyWithDispatchInfo = () => {
    if (!sample.source_communication || !sample.client) return;
    const params = new URLSearchParams();
    params.set("openDraftFor", sample.source_communication);
    // Hint the AI Draft modal to insert dispatch context. The body is
    // generated server-side via the existing reply pipeline; we just signal
    // intent so the modal can pre-populate from the sample's tracking info.
    params.set("dispatchSampleId", sample.id);
    router.push(`/clients/${sample.client}?${params.toString()}`);
  };

  const handleRevert = async () => {
    setReverting(true);
    try {
      await api.post(`/samples/${id}/revert/`);
      toast.success("Sample reverted to previous step");
      setShowRevertModal(false);
      loadSample();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to revert"));
    } finally {
      setReverting(false);
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/samples/${id}/add_feedback/`, {
        ...feedbackForm,
        rating: Number(feedbackForm.rating),
      });
      toast.success("Feedback recorded");
      setShowFeedbackModal(false);
      setFeedbackForm({ rating: "5", comments: "", issues: "", bulk_order_interest: false });
      loadSample();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to submit feedback"));
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!sample) return null;

  // Determine which next-step button to show based on current status
  const nextAction = (() => {
    if (sample.feedback) return null;
    switch (sample.status) {
      case "requested":
        return { target: "prepared", label: "→ Mark Prepared", color: "bg-amber-600 hover:bg-amber-700" };
      case "prepared":
        return { target: "dispatched", label: "→ Mark Dispatched", color: "bg-blue-600 hover:bg-blue-700", needsForm: true };
      case "dispatched":
        return { target: "delivered", label: "→ Mark Delivered", color: "bg-green-600 hover:bg-green-700" };
      case "delivered":
        return { target: "feedback", label: "+ Add Feedback", color: "bg-fuchsia-600 hover:bg-fuchsia-700", openFeedback: true };
      case "feedback_pending":
        return { target: "feedback", label: "+ Add Feedback", color: "bg-fuchsia-600 hover:bg-fuchsia-700", openFeedback: true };
      default:
        return null;
    }
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.push("/samples")} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              Sample · {sample.client_product_name || sample.product_name || "(no product)"}
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-9">
            {sample.client_name}
            {sample.quantity ? ` · ${sample.quantity}` : ""}
            {" · "}
            <StatusBadge status={sample.status} />
          </p>
        </div>
        <div className="flex gap-2">
          {/* Reply to Client */}
          {sample.source_communication && (
            <button
              onClick={() => router.push(`/clients/${sample.client}?openDraftFor=${sample.source_communication}`)}
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg ${
                sample.replied_at
                  ? "bg-indigo-500 hover:bg-indigo-600"
                  : "bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-200"
              }`}
              title="Open the AI Draft for this email"
            >
              {sample.replied_at ? "↻ Reply Again" : "💬 Reply to Client"}
            </button>
          )}
          {/* Notify Client about dispatch — shows when dispatched but email not sent */}
          {sample.status === "dispatched" && !sample.dispatch_notified_at && sample.source_communication && (
            <button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("openDraftFor", sample.source_communication);
                params.set("dispatchSampleId", sample.id);
                router.push(`/clients/${sample.client}?${params.toString()}`);
              }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 ring-2 ring-green-200 animate-pulse"
              title="Client has NOT been notified about this dispatch — click to send notification email"
            >
              📧 Notify Client of Dispatch
            </button>
          )}
          {/* Revert — walks one step backwards through the workflow.
              Restricted to admin/manager only. Executives don't see this
              button at all; the backend also enforces the same rule and
              notifies admin/manager if an executive somehow triggers it. */}
          {canRevert && sample.status !== "requested" && (
            <button
              onClick={() => setShowRevertModal(true)}
              className="px-4 py-2 text-amber-700 bg-amber-50 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-100"
              title="Revert to previous step"
            >
              ↶ Revert
            </button>
          )}
          {nextAction && (
            <button
              onClick={() => {
                // Guard: all products must be checked before marking Prepared
                if (nextAction.target === "prepared" && !allItemsChecked) {
                  toast.error("Please check all products in the Requested Products list before marking as Prepared");
                  return;
                }
                if (nextAction.openFeedback) setShowFeedbackModal(true);
                else if (nextAction.needsForm) setShowDispatchModal(true);
                else advance(nextAction.target);
              }}
              disabled={advancing}
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 ${nextAction.color}`}
            >
              {nextAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Stepper — Mail Received and Reply Mail steps are clickable, jumping
          to the AI Draft modal of the source email so the user can compose
          (or re-compose) the reply through the standard pipeline. */}
      <StatusStepper
        timeline={timeline}
        onStepClick={(step) => {
          if ((step.key === "mail_received" || step.key === "reply_mail") && sample.source_communication && sample.client) {
            router.push(`/clients/${sample.client}?openDraftFor=${sample.source_communication}`);
          } else if (step.key === "feedback") {
            if (!sample.feedback) setShowFeedbackModal(true);
          } else if (step.key === "prepared" && sample.status === "requested") {
            if (!allItemsChecked) {
              toast.error("Please check all products in the Requested Products list before marking as Prepared");
              return;
            }
            advance("prepared");
          } else if (step.key === "dispatched" && sample.status === "prepared") {
            setShowDispatchModal(true);
          } else if (step.key === "delivered" && sample.status === "dispatched") {
            advance("delivered");
          }
        }}
      />

      {/* Items list — multiple products in one sample request */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-800">Requested Products ({itemsLocal.length})</h3>
            {sample.status === "requested" && itemsLocal.length > 0 && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allItemsChecked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {checkedItems.size} of {itemsLocal.length} ready
              </span>
            )}
          </div>
          <button
            onClick={addItem}
            className="text-xs font-medium text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 px-3 py-1.5 rounded"
          >
            + Add Product
          </button>
        </div>
        {itemsLocal.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No products yet. Click "+ Add Product" to add one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b border-gray-200">
                {sample.status === "requested" && <th className="pb-2 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={allItemsChecked}
                    onChange={() => {
                      if (allItemsChecked) setCheckedItems(new Set());
                      else setCheckedItems(new Set(itemsLocal.map((_, i) => i)));
                    }}
                    className="h-4 w-4 text-green-600 border-gray-300 rounded cursor-pointer"
                    title="Select all"
                  />
                </th>}
                <th className="pb-2 pr-3">Product</th>
                <th className="pb-2 pr-3">Client Name</th>
                <th className="pb-2 pr-3">Quantity</th>
                <th className="pb-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {itemsLocal.map((item, i) => (
                <tr key={item.id || i} className={`border-b border-gray-100 last:border-0 ${checkedItems.has(i) ? "bg-green-50/50" : ""}`}>
                  {sample.status === "requested" && (
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={checkedItems.has(i)}
                        onChange={() => toggleItemCheck(i)}
                        className="h-4 w-4 text-green-600 border-gray-300 rounded cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="py-2 pr-3">
                    <input
                      value={item.product_name || ""}
                      onChange={(e) => updateItem(i, "product_name", e.target.value)}
                      placeholder="Product name"
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={item.client_product_name || ""}
                      onChange={(e) => updateItem(i, "client_product_name", e.target.value)}
                      placeholder="As client wrote it"
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      placeholder="e.g. 5 KG"
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => removeItem(i)}
                      className="text-red-500 hover:text-red-700 text-lg leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {itemsDirty && (
          <div className="mt-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-800">You have unsaved changes to the items list.</span>
            <div className="flex gap-2">
              <button
                onClick={resetItems}
                className="px-3 py-1 text-xs border border-gray-300 rounded font-medium hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={saveItems}
                disabled={savingItems}
                className="px-3 py-1 text-xs bg-fuchsia-600 text-white rounded font-medium hover:bg-fuchsia-700 disabled:opacity-50"
              >
                {savingItems ? "Saving..." : "Save Items"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4 text-gray-800">Sample Information</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Client</dt>
              <dd className="text-gray-700 text-right">{sample.client_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-700 text-right">{fmtDate(sample.created_at)}</dd>
            </div>
            {sample.replied_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Replied</dt>
                <dd className="text-gray-700 text-right">{fmtDate(sample.replied_at)}</dd>
              </div>
            )}
            {sample.prepared_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Prepared</dt>
                <dd className="text-gray-700 text-right">{fmtDate(sample.prepared_at)}</dd>
              </div>
            )}
            {sample.dispatch_date && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Dispatched</dt>
                <dd className="text-gray-700 text-right">{fmtDate(sample.dispatch_date)}</dd>
              </div>
            )}
            {sample.delivered_at && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Delivered</dt>
                <dd className="text-gray-700 text-right">{fmtDate(sample.delivered_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Shipping Details</h3>
            {/* Edit becomes available once the sample is Prepared (so the
                executive can fill in tracking/courier/notes before marking
                Dispatched). Notify Client is shown only when there's actually
                a dispatch detail to share. */}
            {!editingShipping && ["prepared", "dispatched", "delivered", "feedback_pending", "feedback_received"].includes(sample.status) && (
              <div className="flex gap-2">
                <button
                  onClick={startEditShipping}
                  className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
                >
                  ✎ Edit
                </button>
                {sample.source_communication && (sample.tracking_number || sample.courier_details || sample.dispatch_date) && (
                  <button
                    onClick={replyWithDispatchInfo}
                    className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded"
                    title="Reply to client with dispatch details (same email thread)"
                  >
                    💬 Notify Client
                  </button>
                )}
              </div>
            )}
          </div>

          {editingShipping ? (
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tracking #</label>
                <input
                  value={shippingForm.tracking_number}
                  onChange={(e) => setShippingForm({ ...shippingForm, tracking_number: e.target.value })}
                  placeholder="e.g. AWB-1234567890"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Courier</label>
                <input
                  value={shippingForm.courier_details}
                  onChange={(e) => setShippingForm({ ...shippingForm, courier_details: e.target.value })}
                  placeholder="e.g. DHL Express"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea
                  value={shippingForm.notes}
                  onChange={(e) => setShippingForm({ ...shippingForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setEditingShipping(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveShipping}
                  disabled={savingShipping}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingShipping ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Tracking #</dt>
                  <dd className="font-medium text-gray-900 text-right">{sample.tracking_number || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Courier</dt>
                  <dd className="text-gray-700 text-right">{sample.courier_details || "—"}</dd>
                </div>
              </dl>
              {sample.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Notes</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{sample.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Documents (COA, MSDS) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Documents</h3>
          {(currentUser?.role === "admin" || currentUser?.role === "manager") && (
            <label className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 cursor-pointer">
              Upload
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={async (e) => {
                const f = e.target.files[0];
                if (!f) return;
                const fd = new FormData();
                fd.append("file", f);
                fd.append("name", f.name);
                fd.append("doc_type", "other");
                try {
                  await api.post(`/samples/${id}/documents/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                  toast.success("Document uploaded");
                  loadSample();
                } catch { toast.error("Upload failed"); }
                e.target.value = "";
              }} />
            </label>
          )}
        </div>
        {sampleDocs.length > 0 ? (
          <div className="space-y-2">
            {sampleDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                <a href={doc.file} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline text-indigo-600">
                  <span>{doc.doc_type === "coa" ? "📋" : doc.doc_type === "msds" ? "📄" : "📎"}</span>
                  <span className="font-medium">{doc.name}</span>
                  <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-200 rounded">{doc.doc_type.toUpperCase()}</span>
                </a>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {doc.uploaded_by_name && <span>{doc.uploaded_by_name}</span>}
                  {(currentUser?.role === "admin" || currentUser?.role === "manager") && (
                    <button onClick={async () => {
                      if (!confirm("Delete this document?")) return;
                      try { await api.delete(`/samples/${id}/documents/${doc.id}/`); toast.success("Deleted"); loadSample(); } catch { toast.error("Failed to delete"); }
                    }} className="text-red-400 hover:text-red-600">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No documents yet. Create COA or MSDS to attach.</p>
        )}
      </div>

      {/* Feedback (if recorded) */}
      {sample.feedback && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold mb-4 text-gray-800">Client Feedback</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Rating:</span>
              <span className="font-bold text-fuchsia-700">
                {sample.feedback.rating ? `${sample.feedback.rating}/5` : "—"}
              </span>
            </div>
            {sample.feedback.comments && (
              <div>
                <span className="text-gray-500 block text-xs">Comments</span>
                <p className="text-gray-700">{sample.feedback.comments}</p>
              </div>
            )}
            {sample.feedback.issues && (
              <div>
                <span className="text-gray-500 block text-xs">Issues</span>
                <p className="text-gray-700">{sample.feedback.issues}</p>
              </div>
            )}
            {sample.feedback.bulk_order_interest && (
              <div className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                Interested in bulk order
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revert Confirmation Modal */}
      <Modal
        open={showRevertModal}
        onClose={() => setShowRevertModal(false)}
        title="Revert Sample?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Revert this sample one step backwards in the workflow?
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-medium">Current step: <span className="capitalize">{(sample.status || "").replace("_", " ")}</span></p>
            {sample.status === "dispatched" && (
              <p className="mt-1">Tracking number and courier details will be cleared.</p>
            )}
            {(sample.status === "feedback_pending" || sample.status === "feedback_received") && (
              <p className="mt-1">The recorded feedback will be deleted.</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            This is useful if a step was marked by mistake.
          </p>
          <div className="flex gap-2 pt-2 justify-end">
            <button
              onClick={() => setShowRevertModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleRevert}
              disabled={reverting}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {reverting ? "Reverting..." : "Revert"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Dispatch Modal */}
      <Modal
        open={showDispatchModal}
        onClose={() => setShowDispatchModal(false)}
        title="Mark as Dispatched"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Add tracking details before marking as dispatched.</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tracking Number</label>
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. AWB-1234567890"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Courier Details</label>
            <input
              value={courierDetails}
              onChange={(e) => setCourierDetails(e.target.value)}
              placeholder="e.g. DHL Express"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          {/* Generate COA / MSDS — attached to dispatch email and saved as sample documents */}
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs text-gray-500 mb-2">Generate documents to attach with dispatch email:</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowDispatchModal(false); setShowCOAEditor(true); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1">
                📋 Create COA
              </button>
              <button type="button" onClick={() => { setShowDispatchModal(false); setShowMSDSEditor(true); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 flex items-center gap-1">
                📄 Create MSDS
              </button>
            </div>
            {sampleDocs.length > 0 && (
              <div className="mt-2 space-y-1">
                {sampleDocs.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                    <span>{d.doc_type === "coa" ? "📋" : d.doc_type === "msds" ? "📄" : "📎"}</span>
                    <span>{d.name}</span>
                    <span className="text-green-500">Ready to attach</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <button
              onClick={() => setShowDispatchModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (sample.source_communication && !confirm("You are dispatching WITHOUT notifying the client via email.\n\nAre you sure? You can still notify them later from the sample page.")) return;
                advance("dispatched", { tracking_number: trackingNumber, courier_details: courierDetails });
              }}
              disabled={advancing}
              className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 disabled:opacity-50 whitespace-nowrap"
            >
              Dispatch Only
            </button>
            {sample.source_communication && (
              <button
                onClick={async () => {
                  // Save tracking info first without changing status
                  try {
                    await api.patch(`/samples/${sample.id}/`, {
                      tracking_number: trackingNumber,
                      courier_details: courierDetails,
                    });
                  } catch {}
                  setShowDispatchModal(false);
                  // Navigate to client page with draft + document attachments
                  const params = new URLSearchParams();
                  params.set("openDraftFor", sample.source_communication);
                  params.set("dispatchSampleId", sample.id);
                  if (sampleDocs.length > 0) {
                    params.set("attachDocs", sampleDocs.map(d => d.file).join(","));
                  }
                  router.push(`/clients/${sample.client}?${params.toString()}`);
                }}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 whitespace-nowrap flex items-center gap-1"
                title="Save tracking details and compose dispatch email with COA/MSDS attached. Status changes only when email is sent."
              >
                💬 Dispatch & Notify Client
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* COA Editor */}
      <COAEditorModal
        open={showCOAEditor}
        onClose={() => setShowCOAEditor(false)}
        productName={sample?.product_name || ""}
        clientName={sample?.client_name || ""}
        onGenerate={async (formData) => {
          try {
            const isFormData = formData instanceof FormData;
            const res = await api.post("/communications/generate-coa-pdf/", formData, {
              responseType: "blob",
              ...(isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {}),
            });
            // Save as sample document
            const pName = sample?.product_name || "Product";
            const filename = `COA_${pName.replace(/\s/g, "_")}.pdf`;
            const fd = new FormData();
            fd.append("file", new File([res.data], filename, { type: "application/pdf" }), filename);
            fd.append("name", filename);
            fd.append("doc_type", "coa");
            await api.post(`/samples/${id}/documents/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success("COA generated and saved");
            setShowCOAEditor(false);
            loadSample();
          } catch { toast.error("Failed to generate COA"); }
        }}
      />

      {/* MSDS Editor */}
      <MSDSEditorModal
        open={showMSDSEditor}
        onClose={() => setShowMSDSEditor(false)}
        productName={sample?.product_name || ""}
        onGenerate={async (formData) => {
          try {
            const res = await api.post("/communications/generate-msds-pdf/", formData, { responseType: "blob" });
            const pName = sample?.product_name || "Product";
            const filename = `MSDS_${pName.replace(/\s/g, "_")}.pdf`;
            const fd = new FormData();
            fd.append("file", new File([res.data], filename, { type: "application/pdf" }), filename);
            fd.append("name", filename);
            fd.append("doc_type", "msds");
            await api.post(`/samples/${id}/documents/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            toast.success("MSDS generated and saved");
            setShowMSDSEditor(false);
            loadSample();
          } catch { toast.error("Failed to generate MSDS"); }
        }}
      />

      {/* Feedback Modal */}
      <Modal
        open={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        title="Add Client Feedback"
        size="sm"
      >
        <form onSubmit={submitFeedback} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Comments</label>
            <textarea
              value={feedbackForm.comments}
              onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issues</label>
            <textarea
              value={feedbackForm.issues}
              onChange={(e) => setFeedbackForm({ ...feedbackForm, issues: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bulk_order_interest"
              checked={feedbackForm.bulk_order_interest}
              onChange={(e) => setFeedbackForm({ ...feedbackForm, bulk_order_interest: e.target.checked })}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="bulk_order_interest" className="text-sm text-gray-700">
              Interested in bulk order
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-fuchsia-600 text-white text-sm font-medium rounded-lg hover:bg-fuchsia-700"
            >
              Submit Feedback
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
