"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";
import { HiOutlineBeaker } from "react-icons/hi2";

export default function SamplesPage() {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
  const [form, setForm] = useState({
    client: "",
    product_name: "",
    quantity: "",
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
    } catch {
      toast.error("Failed to load samples");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSamples();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/samples/", form);
      toast.success("Sample created");
      setShowModal(false);
      setForm({ client: "", product_name: "", quantity: "", courier_details: "", tracking_number: "", notes: "" });
      fetchSamples();
    } catch {
      toast.error("Failed to create sample");
    }
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
    } catch {
      toast.error("Failed to submit feedback");
    }
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
    { key: "tracking_number", label: "Tracking #", render: (row) => row.tracking_number || "\u2014" },
    { key: "dispatch_date", label: "Dispatch Date", render: (row) => row.dispatch_date ? format(new Date(row.dispatch_date), "MMM d, yyyy") : "\u2014" },
    { key: "actions", label: "", render: (row) => (row.status === "delivered" || row.status === "feedback_pending") && (
      <button onClick={(e) => { e.stopPropagation(); openFeedback(row); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
        Add Feedback
      </button>
    )},
  ];

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
      <DataTable columns={columns} data={samples} loading={loading} emptyTitle="No samples yet" emptyDescription="Create your first sample request" />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Sample" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
              <input value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Courier Details</label>
            <input value={form.courier_details} onChange={(e) => setForm({ ...form, courier_details: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Sample</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={showFeedbackModal} onClose={() => { setShowFeedbackModal(false); setSelectedSample(null); }} title="Add Feedback">
        <form onSubmit={handleFeedback} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating *</label>
            <select value={feedbackForm.rating} onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Below Average</option>
              <option value="1">1 - Poor</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
            <textarea value={feedbackForm.comments} onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issues</label>
            <textarea value={feedbackForm.issues} onChange={(e) => setFeedbackForm({ ...feedbackForm, issues: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
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
