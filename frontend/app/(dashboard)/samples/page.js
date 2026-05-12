"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";
import SearchableSelect from "@/components/ui/SearchableSelect";
import AISummaryButton from "@/components/ai/AISummaryButton";

// Sample status -> visual tone. Used by the row stripe + chip on the card.
const SAMPLE_TONE = {
  requested:         { bar: "bg-amber-400",   chip: "bg-amber-50 border-amber-100" },
  replied:           { bar: "bg-blue-500",    chip: "bg-blue-50 border-blue-100" },
  prepared:          { bar: "bg-indigo-500",  chip: "bg-indigo-50 border-indigo-100" },
  payment_received:  { bar: "bg-purple-500",  chip: "bg-purple-50 border-purple-100" },
  dispatched:        { bar: "bg-emerald-500", chip: "bg-emerald-50 border-emerald-100" },
  delivered:         { bar: "bg-teal-500",    chip: "bg-teal-50 border-teal-100" },
  feedback_pending:  { bar: "bg-orange-400",  chip: "bg-orange-50 border-orange-100" },
  feedback_received: { bar: "bg-gray-400",    chip: "bg-gray-50 border-gray-200" },
};
const sampleTone = (s) => SAMPLE_TONE[s] || { bar: "bg-gray-300", chip: "bg-white border-gray-200" };

// Free samples skip "replied" and "payment_received" — paid samples include them.
const FREE_STATUS_OPTIONS = [
  { value: "requested", label: "Mail Received" },
  { value: "prepared", label: "Prepared" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "feedback_pending", label: "Feedback Pending" },
  { value: "feedback_received", label: "Feedback Received" },
];
const PAID_STATUS_OPTIONS = [
  { value: "requested", label: "Mail Received" },
  { value: "replied", label: "Reply Sent" },
  { value: "prepared", label: "Prepared" },
  { value: "payment_received", label: "Payment Received" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "feedback_pending", label: "Feedback Pending" },
  { value: "feedback_received", label: "Feedback Received" },
];

export default function SamplesPage() {
  const router = useRouter();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  // Edit / Delete state
  const [editingSample, setEditingSample] = useState(null); // sample row being edited
  const [deletingSample, setDeletingSample] = useState(null); // sample row pending delete confirmation
  // Type-chooser flow: "+ New Sample" opens the chooser first, the actual
  // form modal opens only after the user explicitly picks Free or Paid.
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  // Per-row type assignment modal — opens when user clicks the Free/Paid
  // chip on an unlocked sample row in the list.
  const [typeAssignFor, setTypeAssignFor] = useState(null); // { id, currentType }
  const [typeAssignSaving, setTypeAssignSaving] = useState(false);
  const [form, setForm] = useState({
    client: "",
    product: "",
    product_name: "",
    quantity: "",
    dispatch_date: "",
    status: "requested",
    sample_type: "free",
    courier_details: "",
    tracking_number: "",
    notes: "",
    firc_received: false,
  });
  const [feedbackForm, setFeedbackForm] = useState({
    rating: "5",
    comments: "",
    issues: "",
    bulk_order_interest: false,
  });

  const fetchSamples = async () => {
    setLoading(true);
    try {
      const res = await api.get("/samples/", { params: { page_size: 5000 } });
      setSamples(res.data.results || res.data);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load samples")); } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSamples();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
    api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
  }, []);

  const resetForm = () => setForm({
    client: "", product: "", product_name: "", quantity: "",
    dispatch_date: "", status: "requested", sample_type: "free",
    courier_details: "", tracking_number: "", notes: "", firc_received: false,
  });

  const handleProductChange = (productId) => {
    const p = products.find((pr) => pr.id === productId);
    setForm({
      ...form,
      product: productId,
      product_name: p ? `${p.name}${p.concentration ? ` (${p.concentration})` : ""}` : "",
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const { firc_received, ...payload } = form;
      // FIRC is only meaningful for paid samples on dispatched stage; not on
      // create. Strip it from the create payload.
      await api.post("/samples/", payload);
      toast.success("Sample created");
      setShowModal(false);
      resetForm();
      fetchSamples();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create sample")); }
  };

  const openEdit = (sample) => {
    setEditingSample(sample);
    setForm({
      client: sample.client || "",
      product: sample.product || "",
      product_name: sample.product_name || "",
      quantity: sample.quantity || "",
      dispatch_date: sample.dispatch_date || "",
      status: sample.status || "requested",
      sample_type: sample.sample_type || "free",
      courier_details: sample.courier_details || "",
      tracking_number: sample.tracking_number || "",
      notes: sample.notes || "",
      firc_received: !!sample.firc_received_at,
    });
    setShowModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingSample) return;
    try {
      const { firc_received, ...rest } = form;
      const payload = { ...rest };
      // FIRC only applies to paid samples. Setting it to "now" the first
      // time it's checked; clearing it returns null.
      if (form.sample_type === "paid") {
        payload.firc_received_at = firc_received ? new Date().toISOString() : null;
      } else {
        payload.firc_received_at = null;
      }
      await api.patch(`/samples/${editingSample.id}/`, payload);
      toast.success("Sample updated");
      setShowModal(false);
      setEditingSample(null);
      resetForm();
      fetchSamples();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update sample")); }
  };

  const handleDelete = async () => {
    if (!deletingSample) return;
    try {
      await api.delete(`/samples/${deletingSample.id}/`);
      toast.success("Sample deleted");
      setDeletingSample(null);
      fetchSamples();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete sample")); }
  };

  const handleFeedback = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/samples/${selectedSample.id}/add_feedback/`, {
        ...feedbackForm,
        rating: Number(feedbackForm.rating),
      });
      toast.success("Feedback submitted");
      setShowFeedbackModal(false);
      setSelectedSample(null);
      setFeedbackForm({ rating: "5", comments: "", issues: "", bulk_order_interest: false });
      fetchSamples();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to submit feedback")); }
  };

  const openFeedback = (sample) => {
    setSelectedSample(sample);
    setShowFeedbackModal(true);
  };

  const productNames = (row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    const names = items.map((it) => it.client_product_name || it.product_name).filter(Boolean);
    if (names.length === 0) {
      const fallback = row.client_product_name || row.product_name;
      return fallback ? [fallback] : [];
    }
    return names;
  };

  const itemQuantities = (row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    const qtys = items.map((it) => (it.quantity || "").trim()).filter(Boolean);
    if (qtys.length === 0) return row.quantity ? [row.quantity] : [];
    return qtys;
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  // Filters
  const [filters, setFilters] = useState({ search: "", status: "", type: "" });
  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  const stats = useMemo(() => {
    const buckets = { total: samples.length, awaiting: 0, dispatched: 0, delivered: 0, feedback: 0 };
    samples.forEach((s) => {
      if (["requested", "replied", "prepared", "payment_received"].includes(s.status)) buckets.awaiting += 1;
      if (s.status === "dispatched") buckets.dispatched += 1;
      if (s.status === "delivered" || s.status === "feedback_pending") buckets.delivered += 1;
      if (s.status === "feedback_received") buckets.feedback += 1;
    });
    return buckets;
  }, [samples]);

  const statusOptions = useMemo(() =>
    Array.from(new Set(samples.map((s) => s.status).filter(Boolean))).sort(),
    [samples]);

  const filtered = useMemo(() => samples.filter((s) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${s.sample_number || ""} ${s.client_name || ""} ${productNames(s).join(" ")} ${s.tracking_number || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.status && s.status !== filters.status) return false;
    if (filters.type && (s.sample_type || "") !== filters.type) return false;
    return true;
  }), [samples, filters]);

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ search: "", status: "", type: "" });

  return (
    <div>
      <PageHeader
        title="Samples"
        subtitle={filtersActive ? `${filtered.length} of ${samples.length} samples` : `${samples.length} samples`}
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowTypeChooser(true)} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
              + New Sample
            </button>
            <AISummaryButton variant="gradient" title="Samples Summary" prompt={`Write a tight Samples summary using the pre-loaded sample data. Structure the response with these sections (use ## headings):\n\n## Overview\nOne sentence with total count and a one-line breakdown by status (e.g. "11 delivered, 4 dispatched, 3 payment received, 2 feedback received, 1 requested").\n\n## Needs Attention\nUp to 5 bullets — only samples that need action: awaiting our reply, awaiting client feedback past 7 days, or stuck in the same stage too long. Each bullet: SMP-### · client · product · why it needs attention.\n\n## By Client\nUp to 4 bullets listing clients with the most active samples and how many.\n\n### Next Steps\n2-3 concrete next actions for the executive.\n\nKeep the whole thing under 300 words. Don't enumerate every sample.`} />
          </div>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🧪</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">samples on file</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⏳</span><span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Awaiting</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.awaiting}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">reply / prep / payment</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🚚</span><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Dispatched</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.dispatched}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">in transit</p>
        </div>
        <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📬</span><span className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Delivered</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.delivered}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">awaiting feedback</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⭐</span><span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Feedback In</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.feedback}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">closed loop</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-1">Filters</span>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="SMP-#, client, product, tracking..." className={`${filterInput} w-full pl-8`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={filterInput}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => (<option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
        </select>
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={filterInput}>
          <option value="">All types</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            Clear
          </button>
        )}
      </div>

      {/* Sample cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">🧪</div>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No samples match" : "No samples yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Create your first sample request."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = sampleTone(row.status);
            const names = productNames(row);
            const qtys = itemQuantities(row);
            const isPaid = row.sample_type === "paid";
            const isFree = row.sample_type === "free";
            const locked = !!row.sample_type_locked;
            return (
              <div
                key={row.id}
                onClick={() => router.push(`/samples/${row.id}`)}
                className={`group relative bg-white border ${tone.chip} rounded-xl px-4 py-3 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all`}
              >
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-center gap-4 pl-2 flex-wrap md:flex-nowrap">
                  {/* SMP number + product + client */}
                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 tracking-tight">{row.sample_number || "—"}</span>
                      {/* Type chip */}
                      {locked && (isPaid || isFree) ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${isPaid ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          {isPaid ? "Paid" : "Free"}
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setTypeAssignFor({ id: row.id, currentType: row.sample_type || "" }); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border border-dashed border-indigo-300 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-100"
                        >
                          {isFree || isPaid ? `Confirm ${isPaid ? "Paid" : "Free"}` : "Set Type"}
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1 truncate">
                      {names.length > 0 ? names.join(" · ") : <span className="text-gray-400">No product</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      <span className="font-medium text-gray-700">{row.client_name || "—"}</span>
                      {qtys.length > 0 && <><span className="mx-1.5 text-gray-300">·</span>{qtys.join(", ")}</>}
                      {row.tracking_number && <><span className="mx-1.5 text-gray-300">·</span><span className="font-mono text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{row.tracking_number}</span></>}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="hidden sm:block w-32 text-center shrink-0">
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Dates — Requested + Dispatched */}
                  <div className="hidden md:block text-right shrink-0 min-w-[120px]">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Requested</p>
                    <p className="text-xs font-semibold text-gray-700">
                      {row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "—"}
                    </p>
                    {row.dispatch_date && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Dispatched {format(new Date(row.dispatch_date), "MMM d")}
                      </p>
                    )}
                  </div>

                  {/* Feedback chip */}
                  <div className="hidden lg:block text-right shrink-0 max-w-[180px]">
                    {row.feedback ? (
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-block max-w-full truncate">
                        {row.feedback.comments
                          ? (row.feedback.comments.length > 28 ? row.feedback.comments.slice(0, 28) + "…" : row.feedback.comments)
                          : `★ ${row.feedback.rating}/5`}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">No feedback</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(row.status === "delivered" || row.status === "feedback_pending") && !row.feedback && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openFeedback(row); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md hover:bg-emerald-100"
                      >
                        + Feedback
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingSample(row); }}
                      title="Delete sample"
                      className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingSample(null); resetForm(); }}
        title={editingSample ? "Edit Sample" : "New Sample"}
        size="lg"
      >
        <form onSubmit={editingSample ? handleUpdate : handleCreate} className="space-y-4">
          {/* Type indicator — chosen via the chooser popup or via the Type
              column. Always locked once an explicit choice is made. */}
          <div className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Sample Type (locked)
            </span>
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${form.sample_type === "paid" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"}`}>
              {form.sample_type === "paid" ? "Paid Sample" : "Free Sample"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchableSelect
              label="Account"
              required
              value={form.client}
              onChange={(v) => setForm({ ...form, client: v })}
              options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
              placeholder="Select Account"
            />
            <SearchableSelect
              label="Product"
              required
              value={form.product}
              onChange={(v) => handleProductChange(v)}
              options={products.map((p) => ({ value: p.id, label: `${p.name}${p.concentration ? ` (${p.concentration})` : ""}` }))}
              placeholder="Select Product"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.dispatch_date} onChange={(e) => setForm({ ...form, dispatch_date: e.target.value })} className={inputClass} />
            </div>
            {/* Status / Tracking / Courier / Notes are only relevant once
                the sample is being managed (Edit modal). On New Sample
                they're hidden — the new sample defaults to "Mail Received"
                and the rest get filled in as the user advances stages. */}
            {editingSample && (
              <SearchableSelect
                label="Status"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v || "requested" })}
                options={form.sample_type === "paid" ? PAID_STATUS_OPTIONS : FREE_STATUS_OPTIONS}
                placeholder="Select Status"
                searchable={false}
              />
            )}
          </div>

          {/* FIRC checkbox — only meaningful for Paid samples on Dispatched stage (Edit only) */}
          {editingSample && form.sample_type === "paid" && form.status === "dispatched" && (
            <label className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.firc_received}
                onChange={(e) => setForm({ ...form, firc_received: e.target.checked })}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-indigo-800">FIRC received (Foreign Inward Remittance Certificate)</span>
            </label>
          )}
          {editingSample && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
                <input value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Courier Details</label>
                <input value={form.courier_details} onChange={(e) => setForm({ ...form, courier_details: e.target.value })} className={inputClass} />
              </div>
            </div>
          )}
          {editingSample && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inputClass} />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-5 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all">
              {editingSample ? "Save Changes" : "Create Sample"}
            </button>
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditingSample(null); resetForm(); }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Sample Type chooser — opens first when user clicks "+ New Sample".
          User must explicitly pick Free or Paid before the create form opens. */}
      <Modal
        open={showTypeChooser}
        onClose={() => setShowTypeChooser(false)}
        title="Is this a Free or Paid sample?"
        size="md"
      >
        <p className="text-sm text-gray-500 mb-4">Choose how this sample will be processed. Paid samples include Reply / Payment / FIRC stages; Free samples skip them.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { value: "free", label: "Free Sample", desc: "Mail Received → Prepared → Dispatched → Delivered → Feedback", color: "emerald" },
            { value: "paid", label: "Paid Sample", desc: "Mail Received → Reply → Prepared → Payment Received → Dispatched (FIRC) → Delivered → Feedback", color: "amber" },
          ].map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => {
                resetForm();
                setForm((f) => ({ ...f, sample_type: opt.value }));
                setShowTypeChooser(false);
                setShowModal(true);
              }}
              className={`text-left p-4 rounded-xl border-2 transition-colors hover:shadow-sm ${opt.color === "amber"
                ? "border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50"
                : "border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50"}`}
            >
              <div className={`text-sm font-semibold ${opt.color === "amber" ? "text-amber-800" : "text-emerald-800"}`}>{opt.label}</div>
              <div className="text-[11px] text-gray-600 mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-4 mt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowTypeChooser(false)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >Cancel</button>
        </div>
      </Modal>

      {/* Per-row type assignment — opens when user clicks the type chip
          on an unlocked sample in the list. */}
      <Modal
        open={!!typeAssignFor}
        onClose={() => !typeAssignSaving && setTypeAssignFor(null)}
        title="Select sample type"
        size="md"
      >
        {typeAssignFor && (
          <>
            <p className="text-sm text-gray-600 mb-1">You must select <strong>Paid</strong> or <strong>Free</strong> for this sample.</p>
            <p className="text-xs text-gray-400 mb-4">Once selected, the type is locked and cannot be changed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { value: "free", label: "Free Sample", desc: "Mail Received → Prepared → Dispatched → Delivered → Feedback", color: "emerald" },
                { value: "paid", label: "Paid Sample", desc: "Mail Received → Reply → Prepared → Payment Received → Dispatched (FIRC) → Delivered → Feedback", color: "amber" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  disabled={typeAssignSaving}
                  onClick={async () => {
                    setTypeAssignSaving(true);
                    try {
                      await api.patch(`/samples/${typeAssignFor.id}/`, { sample_type: opt.value });
                      toast.success(`Marked as ${opt.label}`);
                      setTypeAssignFor(null);
                      fetchSamples();
                    } catch (err) {
                      toast.error(getErrorMessage(err, "Failed to set type"));
                    } finally {
                      setTypeAssignSaving(false);
                    }
                  }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors hover:shadow-sm disabled:opacity-50 ${opt.color === "amber"
                    ? "border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50"
                    : "border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50"} ${typeAssignFor.currentType === opt.value ? "ring-2 ring-indigo-300" : ""}`}
                >
                  <div className={`text-sm font-semibold ${opt.color === "amber" ? "text-amber-800" : "text-emerald-800"}`}>{opt.label}</div>
                  <div className="text-[11px] text-gray-600 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-4 mt-3 border-t border-gray-100">
              <button
                type="button"
                disabled={typeAssignSaving}
                onClick={() => setTypeAssignFor(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
            </div>
          </>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deletingSample}
        onClose={() => setDeletingSample(null)}
        title="Delete Sample?"
        size="sm"
      >
        {deletingSample && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete this sample request?
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-800">{deletingSample.product_name || "(no product)"}</p>
              <p className="text-gray-500 mt-0.5">
                {deletingSample.client_name}{deletingSample.quantity ? ` · ${deletingSample.quantity}` : ""}
              </p>
            </div>
            <p className="text-xs text-gray-400">
              This action cannot be undone from this page. The sample row will be removed from the list.
            </p>
            <div className="flex gap-2 pt-2 justify-end">
              <button
                onClick={() => setDeletingSample(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showFeedbackModal} onClose={() => { setShowFeedbackModal(false); setSelectedSample(null); }} title="Add Feedback">
        <form onSubmit={handleFeedback} className="space-y-4">
          <SearchableSelect
            label="Rating"
            required
            value={feedbackForm.rating}
            onChange={(v) => setFeedbackForm({ ...feedbackForm, rating: v })}
            options={[
              { value: "5", label: "5 - Excellent" },
              { value: "4", label: "4 - Good" },
              { value: "3", label: "3 - Average" },
              { value: "2", label: "2 - Below Average" },
              { value: "1", label: "1 - Poor" },
            ]}
            placeholder="Select Rating"
            searchable={false}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
            <textarea value={feedbackForm.comments} onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issues</label>
            <textarea value={feedbackForm.issues} onChange={(e) => setFeedbackForm({ ...feedbackForm, issues: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bulk_order_interest" checked={feedbackForm.bulk_order_interest} onChange={(e) => setFeedbackForm({ ...feedbackForm, bulk_order_interest: e.target.checked })} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
            <label htmlFor="bulk_order_interest" className="text-sm font-medium text-gray-700">Interested in bulk order</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Submit Feedback</button>
            <button type="button" onClick={() => { setShowFeedbackModal(false); setSelectedSample(null); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
