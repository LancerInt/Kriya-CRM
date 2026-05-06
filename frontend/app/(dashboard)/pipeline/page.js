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
import SearchableSelect from "@/components/ui/SearchableSelect";
import { confirmDialog } from "@/lib/confirm";

const stages = [
  { key: "inquiry", label: "New Lead", color: "bg-purple-500" },
  { key: "discussion", label: "Qualification", color: "bg-blue-500" },
  { key: "sample", label: "Sample", color: "bg-cyan-500" },
  { key: "quotation", label: "Proposal", color: "bg-yellow-500" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-500" },
  { key: "order_confirmed", label: "Closed Won", color: "bg-green-500" },
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
      toast.success("Lead advanced");
    } catch (err) {
      toast.error(err?.detail || "Cannot advance");
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog("Delete this lead?"))) return;
    try {
      const { default: api } = await import("@/lib/axios");
      await api.delete(`/quotations/inquiries/${id}/`);
      toast.success("Lead deleted");
      dispatch(fetchInquiries());
    } catch { toast.error("Failed to delete"); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createInquiry(form)).unwrap();
      toast.success("Lead created");
      setShowModal(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create lead")); }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div>
      <PageHeader
        title="Lead Pipeline"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Lead
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
                  <div key={item.id} className="group bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.client_name || "Unknown Account"}</p>
                        <p className="text-xs text-gray-500 mt-1">{item.product_name || "\u2014"}</p>
                      </div>
                      <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Source: {item.source}</p>
                    {item.requirements && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.requirements}</p>}
                    <div className="flex items-center gap-2 mt-3">
                      {item.stage !== "order_confirmed" && item.stage !== "lost" && (
                        <button onClick={() => handleAdvance(item.id)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                          Advance &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    No leads
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Lead">
        <form onSubmit={handleCreate} className="space-y-4">
          <SearchableSelect
            label="Account"
            required
            value={form.client}
            onChange={(v) => setForm({ ...form, client: v })}
            options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="Select account"
          />
          <SearchableSelect
            label="Product"
            value={form.product}
            onChange={(v) => setForm({ ...form, product: v })}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Select product"
          />
          <SearchableSelect
            label="Source"
            value={form.source}
            onChange={(v) => setForm({ ...form, source: v || "email" })}
            options={[
              { value: "email", label: "Email" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "call", label: "Call" },
              { value: "website", label: "Website" },
              { value: "referral", label: "Referral" },
              { value: "exhibition", label: "Exhibition" },
            ]}
            placeholder="Select source"
            searchable={false}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Lead</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
