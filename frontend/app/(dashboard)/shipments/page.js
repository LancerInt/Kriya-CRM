"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

// Status → tone tokens. Mirrors Sales Orders so the visual language is shared.
const SHIPMENT_TONE = {
  pending:    { bar: "bg-slate-400",   text: "text-slate-700",   chip: "bg-slate-50 border-slate-200" },
  packed:     { bar: "bg-amber-400",   text: "text-amber-700",   chip: "bg-amber-50 border-amber-200" },
  dispatched: { bar: "bg-indigo-500",  text: "text-indigo-700",  chip: "bg-indigo-50 border-indigo-200" },
  in_transit: { bar: "bg-blue-500",    text: "text-blue-700",    chip: "bg-blue-50 border-blue-200" },
  delivered:  { bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 border-emerald-200" },
};

export default function ShipmentsPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  // Filters — keep them in one piece of state so "Clear" is a single reset.
  const [filters, setFilters] = useState({ country: "", status: "", progress: "", year: "" });
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
    api.get("/shipments/", { params: { page_size: 5000 } })
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

  // Order status -> overall progress %. FIRC (11th step) overrides to 100%.
  const ORDER_STATUS_PROGRESS = {
    pif_sent: 9,
    factory_ready: 18,
    docs_preparing: 27,
    inspection: 36,
    inspection_passed: 50,
    container_booked: 60,
    docs_approved: 70,
    dispatched: 75,
    in_transit: 80,
    arrived: 90,
    delivered: 90,
  };
  const computeProgress = (row) => {
    if (row.order_firc_received_at) return 100;
    return ORDER_STATUS_PROGRESS[row.order_status] ?? 0;
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  // Stat buckets — quick at-a-glance counts.
  const stats = useMemo(() => {
    const buckets = { total: shipments.length, in_transit: 0, delivered: 0, attention: 0 };
    shipments.forEach((s) => {
      if (s.status === "in_transit") buckets.in_transit += 1;
      if (s.status === "delivered") buckets.delivered += 1;
      // Past ETA + not delivered = attention
      if (s.estimated_arrival && s.status !== "delivered") {
        if (new Date(s.estimated_arrival) < new Date()) buckets.attention += 1;
      }
    });
    return buckets;
  }, [shipments]);

  // ── Filtering ─────────────────────────────────────────────────────
  // Build dropdown options from the actual shipment list so we never
  // show a value the user can't pick.
  const countryOptions = Array.from(new Set(shipments.map((s) => (s.country || "").trim()).filter(Boolean))).sort();
  const statusOptions = Array.from(new Set(shipments.map((s) => (s.status || "").trim()).filter(Boolean))).sort();
  const yearOptions = Array.from(new Set(
    shipments
      .map((s) => (s.dispatch_date ? new Date(s.dispatch_date).getFullYear() : null))
      .filter(Boolean)
  )).sort((a, b) => b - a);

  const inProgressBucket = (pct) => {
    if (pct >= 100) return "complete";
    if (pct >= 75) return "high";
    if (pct >= 36) return "mid";
    return "low";
  };

  const filtered = shipments.filter((s) => {
    if (filters.country && (s.country || "") !== filters.country) return false;
    if (filters.status && (s.status || "") !== filters.status) return false;
    if (filters.progress && inProgressBucket(computeProgress(s)) !== filters.progress) return false;
    if (filters.year) {
      if (!s.dispatch_date) return false;
      if (new Date(s.dispatch_date).getFullYear() !== Number(filters.year)) return false;
    }
    return true;
  });

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ country: "", status: "", progress: "", year: "" });

  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  return (
    <div>
      <PageHeader
        title="Shipments"
        subtitle={filtersActive ? `${filtered.length} of ${shipments.length} shipments` : `${shipments.length} shipments`}
        action={
          <div className="flex gap-2">
            <AISummaryButton variant="gradient" title="Shipments Summary" prompt={`Write a tight Shipments summary using the pre-loaded shipment data. Structure with these sections (## headings):\n\n## Overview\nOne line: total shipments by status (pending, dispatched, in transit, delivered).\n\n## In Transit\nUp to 5 currently in transit: shipment# · client · POL → POD · ETA.\n\n## Delayed / Needs Attention\nUp to 5 shipments past their ETA, missing documents (BL/COO), or stuck without movement: shipment# · client · issue.\n\n## Upcoming Dispatches\nUp to 4 with a near-term dispatch date.\n\n### Next Steps\n2-3 concrete actions.\n\nKeep under 300 words. Don't list every shipment.`} />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
              + New Shipment
            </button>
          </div>
        }
      />

      {/* Stat tiles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📦</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">shipments on file</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🚢</span><span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">In Transit</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.in_transit}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">at sea right now</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">✅</span><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Delivered</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.delivered}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">completed</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⚠️</span><span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Past ETA</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.attention}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">need a follow-up</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-1">Filters</span>
        <select value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} className={filterInput}>
          <option value="">All countries</option>
          {countryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={filterInput}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => (<option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
        </select>
        <select value={filters.progress} onChange={(e) => setFilters({ ...filters, progress: e.target.value })} className={filterInput}>
          <option value="">Any progress</option>
          <option value="low">0–35% · Early</option>
          <option value="mid">36–74% · Mid</option>
          <option value="high">75–99% · Late</option>
          <option value="complete">100% · Complete</option>
        </select>
        <select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} className={filterInput} aria-label="Filter by dispatch year">
          <option value="">All years</option>
          {yearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Shipment cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No shipments match" : "No shipments yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Create your first shipment to get started."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = SHIPMENT_TONE[row.status] || SHIPMENT_TONE.pending;
            const pct = computeProgress(row);
            const orderId = row.order_id || row.order;
            return (
              <div
                key={row.id}
                onClick={() => router.push(`/shipments/${row.id}`)}
                className={`group relative bg-white border ${tone.chip} rounded-xl px-4 py-3 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all`}
              >
                {/* Left status stripe */}
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-center gap-4 pl-2 flex-wrap md:flex-nowrap">
                  {/* Order # + client */}
                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 tracking-tight">{row.order_number || "—"}</span>
                      {row.bl_number && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{row.bl_number}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      <span className="font-medium text-gray-700">{row.client_name || "—"}</span>
                      {row.country && (<><span className="mx-1.5 text-gray-300">·</span>{row.country}</>)}
                    </p>
                  </div>

                  {/* POL → POD */}
                  <div className="hidden md:flex items-center gap-2 text-xs w-56 shrink-0">
                    <div className="text-right flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">From</p>
                      <p className="text-gray-800 font-medium truncate">{row.port_of_loading || "—"}</p>
                    </div>
                    <span className="text-gray-300">→</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">To</p>
                      <p className="text-gray-800 font-medium truncate">{row.port_of_discharge || "—"}</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="hidden sm:block w-32 text-center shrink-0">
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Progress bar — clicking jumps to the linked Sales Order */}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (orderId) router.push(`/orders/${orderId}`); }}
                    title={orderId ? "Open Sales Order" : "No linked order"}
                    className="hidden md:flex items-center gap-2 w-44 shrink-0"
                  >
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${tone.text}`}>{pct}%</span>
                  </button>

                  {/* Dispatch date */}
                  <div className="text-right shrink-0 min-w-[88px]">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Dispatch</p>
                    <p className="text-xs font-semibold text-gray-700">
                      {row.dispatch_date ? format(new Date(row.dispatch_date), "MMM d, yyyy") : "—"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow disabled:opacity-50 transition-all">
              {submitting ? "Creating..." : "Create Shipment"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
