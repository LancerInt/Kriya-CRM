"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";
import SearchableSelect from "@/components/ui/SearchableSelect";

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested" },
  { value: "prepared", label: "Prepared" },
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
  const [form, setForm] = useState({
    client: "",
    product: "",
    product_name: "",
    quantity: "",
    dispatch_date: "",
    status: "requested",
    courier_details: "",
    tracking_number: "",
    notes: "",
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
      const res = await api.get("/samples/");
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
    dispatch_date: "", status: "requested", courier_details: "",
    tracking_number: "", notes: "",
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
      await api.post("/samples/", form);
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
      courier_details: sample.courier_details || "",
      tracking_number: sample.tracking_number || "",
      notes: sample.notes || "",
    });
    setShowModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingSample) return;
    try {
      await api.patch(`/samples/${editingSample.id}/`, form);
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

  const columns = [
    { key: "product_name", label: "Product", render: (row) => <span className="font-medium">{row.product_name || "\u2014"}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "quantity", label: "Quantity", render: (row) => row.quantity || "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "dispatch_date", label: "Date", render: (row) => row.dispatch_date ? format(new Date(row.dispatch_date), "MMM d, yyyy") : "\u2014" },
    { key: "tracking_number", label: "Tracking #", render: (row) => row.tracking_number || "\u2014" },
    { key: "feedback", label: "Feedback", render: (row) => row.feedback ? (
      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{row.feedback.comments ? row.feedback.comments.slice(0, 30) + (row.feedback.comments.length > 30 ? "..." : "") : `Rating: ${row.feedback.rating}/5`}</span>
    ) : <span className="text-gray-400">{"\u2014"}</span> },
    { key: "actions", label: "", render: (row) => (
      <div className="flex gap-1 items-center">
        {(row.status === "delivered" || row.status === "feedback_pending") && !row.feedback && (
          <button onClick={(e) => { e.stopPropagation(); openFeedback(row); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 px-2 py-1 rounded">
            Add Feedback
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(row); }}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded"
        >
          Edit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setDeletingSample(row); }}
          className="text-xs text-red-600 hover:text-red-700 font-medium bg-red-50 px-2 py-1 rounded"
        >
          Delete
        </button>
      </div>
    )},
  ];

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  return (
    <div>
      <PageHeader
        title="Samples"
        subtitle={`${samples.length} samples`}
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Sample
          </button>
        }
      />
      <DataTable
        columns={columns}
        data={samples}
        loading={loading}
        emptyTitle="No samples yet"
        emptyDescription="Create your first sample request"
        onRowClick={(row) => router.push(`/samples/${row.id}`)}
      />

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingSample(null); resetForm(); }}
        title={editingSample ? "Edit Sample" : "New Sample"}
        size="lg"
      >
        <form onSubmit={editingSample ? handleUpdate : handleCreate} className="space-y-4">
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
            <SearchableSelect
              label="Status"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v || "requested" })}
              options={STATUS_OPTIONS}
              placeholder="Select Status"
              searchable={false}
            />
          </div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
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
