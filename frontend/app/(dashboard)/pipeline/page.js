"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchInquiries, createInquiry, advanceInquiry } from "@/store/slices/pipelineSlice";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";

const stages = [
  { key: "inquiry", label: "Inquiry", color: "bg-purple-500" },
  { key: "discussion", label: "Discussion", color: "bg-blue-500" },
  { key: "sample", label: "Sample", color: "bg-cyan-500" },
  { key: "quotation", label: "Quotation", color: "bg-yellow-500" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { key: "order_confirmed", label: "Order Confirmed", color: "bg-green-500" },
];

export default function PipelinePage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.pipeline);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client: "", product: "", source: "email", notes: "" });
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    dispatch(fetchInquiries());
    import("@/lib/axios").then(({ default: api }) => {
      api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
      api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
    });
  }, []);

  const handleAdvance = async (id) => {
    try {
      await dispatch(advanceInquiry(id)).unwrap();
      toast.success("Inquiry advanced");
    } catch (err) {
      toast.error(err?.detail || "Cannot advance");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createInquiry(form)).unwrap();
      toast.success("Inquiry created");
      setShowModal(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create inquiry")); }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div>
      <PageHeader
        title="Sales Pipeline"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Inquiry
          </button>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = list.filter((i) => i.stage === stage.key);
          return (
            <div key={stage.key} className="min-w-[280px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <h3 className="text-sm font-semibold text-gray-700">{stage.label}</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <p className="text-sm font-medium text-gray-900">{item.client_name || "Unknown Client"}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.product_name || "\u2014"}</p>
                    <p className="text-xs text-gray-400 mt-1">Source: {item.source}</p>
                    {item.stage !== "order_confirmed" && item.stage !== "lost" && (
                      <button
                        onClick={() => handleAdvance(item.id)}
                        className="mt-3 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Advance &rarr;
                      </button>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No inquiries
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Inquiry">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="call">Call</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="exhibition">Exhibition</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Inquiry</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
