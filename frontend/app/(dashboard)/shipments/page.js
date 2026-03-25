"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

export default function ShipmentsPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    order: "",
    client: "",
    status: "pending",
    container_number: "",
    bl_number: "",
    forwarder: "",
    port_of_loading: "",
    port_of_discharge: "",
    delivery_terms: "FOB",
    dispatch_date: "",
    transit_days: "",
    estimated_arrival: "",
    notes: "",
  });

  const loadShipments = () => {
    setLoading(true);
    api.get("/shipments/")
      .then((r) => setShipments(r.data.results || r.data))
      .catch(() => toast.error("Failed to load shipments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadShipments();
    api.get("/orders/").then((r) => setOrders(r.data.results || r.data)).catch(() => {});
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleOrderChange = (orderId) => {
    const order = orders.find((o) => String(o.id) === String(orderId));
    setForm({
      ...form,
      order: orderId,
      client: order?.client || order?.client_id || "",
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.transit_days) delete payload.transit_days;
      if (!payload.dispatch_date) delete payload.dispatch_date;
      if (!payload.estimated_arrival) delete payload.estimated_arrival;
      if (!payload.actual_arrival) delete payload.actual_arrival;
      await api.post("/shipments/", payload);
      toast.success("Shipment created");
      setShowModal(false);
      setForm({
        order: "",
        client: "",
        status: "pending",
        container_number: "",
        bl_number: "",
        forwarder: "",
        port_of_loading: "",
        port_of_discharge: "",
        delivery_terms: "FOB",
        dispatch_date: "",
        transit_days: "",
        estimated_arrival: "",
        notes: "",
      });
      loadShipments();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create shipment")); } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: "shipment_number", label: "Shipment #", render: (row) => <span className="font-medium text-gray-900">{row.shipment_number}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "order_number", label: "Order #", render: (row) => row.order_number || "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "port_of_loading", label: "Port of Loading", render: (row) => row.port_of_loading || "\u2014" },
    { key: "dispatch_date", label: "Dispatch Date", render: (row) => row.dispatch_date ? format(new Date(row.dispatch_date), "MMM d, yyyy") : "\u2014" },
  ];

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  return (
    <div>
      <PageHeader
        title="Shipments"
        subtitle={`${shipments.length} shipments`}
        action={
          <div className="flex gap-2">
            <AISummaryButton variant="button" title="Shipments Summary" prompt="Summarize all current shipments. Use get_shipments tool. Show: shipments by status, any in transit with ETAs, delayed shipments, and upcoming dispatches." />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              + New Shipment
            </button>
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={shipments}
        loading={loading}
        emptyTitle="No shipments yet"
        emptyDescription="Create your first shipment to get started"
        onRowClick={(row) => router.push(`/shipments/${row.id}`)}
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Shipment" size="xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order *</label>
              <select value={form.order} onChange={(e) => handleOrderChange(e.target.value)} required className={inputClass}>
                <option value="">Select Order</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number || `ORD-${o.id?.slice(0, 8)}`}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required className={inputClass}>
                <option value="">Select Client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="pending">Pending</option>
                <option value="packed">Packed</option>
                <option value="dispatched">Dispatched</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container Number</label>
              <input value={form.container_number} onChange={(e) => setForm({ ...form, container_number: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">BL Number</label>
              <input value={form.bl_number} onChange={(e) => setForm({ ...form, bl_number: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forwarder</label>
              <input value={form.forwarder} onChange={(e) => setForm({ ...form, forwarder: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
              <input value={form.port_of_loading} onChange={(e) => setForm({ ...form, port_of_loading: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
              <input value={form.port_of_discharge} onChange={(e) => setForm({ ...form, port_of_discharge: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
              <select value={form.delivery_terms} onChange={(e) => setForm({ ...form, delivery_terms: e.target.value })} className={inputClass}>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="CFR">CFR</option>
                <option value="EXW">EXW</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date</label>
              <input type="date" value={form.dispatch_date} onChange={(e) => setForm({ ...form, dispatch_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transit Days</label>
              <input type="number" value={form.transit_days} onChange={(e) => setForm({ ...form, transit_days: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Est. Arrival</label>
              <input type="date" value={form.estimated_arrival} onChange={(e) => setForm({ ...form, estimated_arrival: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Shipment"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
