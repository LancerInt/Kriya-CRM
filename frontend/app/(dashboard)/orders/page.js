"use client";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchOrders } from "@/store/slices/orderSlice";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";

// Order status -> overall progress %. Mirrors the Shipments page so progress
// visualization stays consistent across the app. FIRC overrides to 100%.
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

const STATUS_TONE = {
  pif_sent:          { bar: "bg-violet-400",   text: "text-violet-700",   chip: "bg-violet-50 border-violet-200" },
  factory_ready:     { bar: "bg-purple-400",   text: "text-purple-700",   chip: "bg-purple-50 border-purple-200" },
  docs_preparing:    { bar: "bg-amber-400",    text: "text-amber-700",    chip: "bg-amber-50 border-amber-200" },
  inspection:        { bar: "bg-amber-500",    text: "text-amber-800",    chip: "bg-amber-50 border-amber-200" },
  inspection_passed: { bar: "bg-yellow-500",   text: "text-yellow-700",   chip: "bg-yellow-50 border-yellow-200" },
  container_booked:  { bar: "bg-orange-400",   text: "text-orange-700",   chip: "bg-orange-50 border-orange-200" },
  docs_approved:     { bar: "bg-sky-400",      text: "text-sky-700",      chip: "bg-sky-50 border-sky-200" },
  dispatched:        { bar: "bg-indigo-500",   text: "text-indigo-700",   chip: "bg-indigo-50 border-indigo-200" },
  in_transit:        { bar: "bg-blue-500",     text: "text-blue-700",     chip: "bg-blue-50 border-blue-200" },
  arrived:           { bar: "bg-cyan-500",     text: "text-cyan-700",     chip: "bg-cyan-50 border-cyan-200" },
  delivered:         { bar: "bg-emerald-500",  text: "text-emerald-700",  chip: "bg-emerald-50 border-emerald-200" },
  cancelled:         { bar: "bg-rose-400",     text: "text-rose-700",     chip: "bg-rose-50 border-rose-200" },
};

const computeProgress = (row) => row.firc_received_at ? 100 : (ORDER_STATUS_PROGRESS[row.status] ?? 0);
const fmtDate = (d) => { try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; } };

export default function OrdersPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading } = useSelector((state) => state.orders);
  const user = useSelector((state) => state.auth?.user);
  const canDeleteOrder = user?.role === "admin" || user?.role === "manager";

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [nextOrderNum, setNextOrderNum] = useState("");
  const [form, setForm] = useState({
    client: "", product_name: "", quantity: "", unit: "KG", unit_price: "",
    currency: "USD", delivery_terms: "FOB", freight_terms: "", payment_terms: "",
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [filters, setFilters] = useState({ search: "", status: "", year: "" });

  useEffect(() => { dispatch(fetchOrders()); }, []);

  const openCreate = () => {
    setForm({ client: "", product_name: "", quantity: "", unit: "KG", unit_price: "", currency: "USD", delivery_terms: "FOB", freight_terms: "", payment_terms: "" });
    setProductSearch(""); setClientSearch(""); setShowProductDropdown(false); setShowClientDropdown(false);
    if (clients.length === 0) {
      api.get("/clients/").then(r => {
        const all = r.data.results || r.data;
        setClients(all.filter(c => !c.company_name?.includes("(Auto-created)")));
      }).catch(() => {});
    }
    if (products.length === 0) {
      api.get("/products/").then(r => setProducts(r.data.results || r.data)).catch(() => {});
    }
    const count = list.length + 1;
    setNextOrderNum(`ORD-${String(count).padStart(5, "0")}`);
    setShowCreateModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.client) { toast.error("Select a client"); return; }
    setSubmitting(true);
    try {
      const res = await api.post("/orders/", {
        client: form.client, order_type: "direct", currency: form.currency || "USD",
        delivery_terms: form.delivery_terms, freight_terms: form.freight_terms,
        payment_terms: form.payment_terms,
      });
      if (form.product_name) {
        await api.post(`/orders/${res.data.id}/add-item/`, {
          product_name: form.product_name,
          quantity: form.quantity ? Number(form.quantity) : 1,
          unit: form.unit || "KG",
          unit_price: form.unit_price ? Number(form.unit_price) : 0,
        });
      }
      toast.success(`Order ${res.data.order_number} created`);
      setShowCreateModal(false);
      dispatch(fetchOrders());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create order")); }
    finally { setSubmitting(false); }
  };

  const confirmDeleteOrder = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/orders/${deleteTarget.id}/`);
      toast.success("Order deleted");
      setDeleteTarget(null);
      dispatch(fetchOrders());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete order")); }
    finally { setDeleting(false); }
  };

  // Derived buckets for the stat strip
  const stats = useMemo(() => {
    const buckets = { total: list.length, in_motion: 0, docs: 0, completed: 0 };
    list.forEach((o) => {
      if (["dispatched", "in_transit", "arrived"].includes(o.status)) buckets.in_motion += 1;
      if (["pif_sent", "factory_ready", "docs_preparing", "inspection", "inspection_passed", "container_booked", "docs_approved"].includes(o.status)) buckets.docs += 1;
      if (o.status === "delivered") buckets.completed += 1;
    });
    return buckets;
  }, [list]);

  // Filter options derived from the live data
  const statusOptions = Array.from(new Set(list.map((o) => o.status).filter(Boolean))).sort();
  const yearOptions = Array.from(new Set(
    list.map((o) => (o.created_at ? new Date(o.created_at).getFullYear() : null)).filter(Boolean)
  )).sort((a, b) => b - a);

  const filtered = useMemo(() => list.filter((o) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${o.order_number || ""} ${o.client_name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.status && o.status !== filters.status) return false;
    if (filters.year) {
      if (!o.created_at) return false;
      if (new Date(o.created_at).getFullYear() !== Number(filters.year)) return false;
    }
    return true;
  }), [list, filters]);

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ search: "", status: "", year: "" });

  const ic = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle={filtersActive ? `${filtered.length} of ${list.length} orders` : `${list.length} orders`}
        action={
          <div className="flex gap-2">
            <button onClick={openCreate} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
              + Create Order
            </button>
            <AISummaryButton variant="gradient" title="Orders Summary" prompt={`Write a tight Orders summary using the pre-loaded order data. Structure with these sections (## headings):\n\n## Overview\nOne line: total active orders, total value (by currency), and counts in each major stage (docs preparing, dispatched, in transit, arrived).\n\n## In Motion\nUp to 5 orders dispatched / in transit / arrived: order# · client · status · value.\n\n## Needs Attention\nUp to 5 orders stuck or risk-flagged (e.g. waiting on documents, payment overdue, no movement in days): order# · client · why.\n\n## Top Clients\nUp to 4 clients by active-order value.\n\n### Next Steps\n2-3 concrete actions.\n\nKeep under 300 words. Don't enumerate every order.`} />
          </div>
        }
      />

      {/* Stat strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📦</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">orders on file</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📝</span><span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">In Production</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.docs}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">PIF → Docs Approved</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🚚</span><span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">In Motion</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.in_motion}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">Dispatched · In Transit · Arrived</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-1">Filters</span>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Order # or client…" className={`${filterInput} w-full pl-8`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={filterInput}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
        <select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} className={filterInput}>
          <option value="">All years</option>
          {yearOptions.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Order cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No orders match" : "No orders yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Orders are created from approved quotations or manually."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = STATUS_TONE[row.status] || STATUS_TONE.pif_sent;
            const pct = computeProgress(row);
            return (
              <div
                key={row.id}
                onClick={() => router.push(`/orders/${row.id}`)}
                className={`group relative bg-white border ${tone.chip} rounded-xl px-4 py-3 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all`}
              >
                {/* Left status stripe */}
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-start sm:items-center gap-3 sm:gap-4 pl-2">
                  {/* Order # + client + (mobile) inline status + progress */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-gray-900 tracking-tight">{row.order_number || `ORD-${row.id?.slice(0, 8)}`}</span>
                        {row.firc_received_at && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">FIRC ✓</span>
                        )}
                      </div>
                      {/* Mobile-only: status badge next to ORD# */}
                      <div className="sm:hidden shrink-0">
                        <StatusBadge status={row.status} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      <span className="font-medium text-gray-700">{row.client_name || "—"}</span>
                      <span className="mx-1.5 text-gray-300">·</span>
                      {fmtDate(row.created_at)}
                    </p>
                    {/* Mobile-only: slim progress bar below client/date */}
                    <div className="sm:hidden flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold tabular-nums ${tone.text}`}>{pct}%</span>
                    </div>
                  </div>

                  {/* Status — desktop position */}
                  <div className="hidden sm:block w-32 text-center">
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Progress bar — desktop position */}
                  <div className="hidden md:flex items-center gap-2 w-56">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${tone.text}`}>{pct}%</span>
                  </div>

                  {/* Delete */}
                  {canDeleteOrder && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
                      title="Delete order"
                      className="p-2 rounded-lg text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Sales Order" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-600">{nextOrderNum}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">{format(new Date(), "dd/MM/yyyy")}</div>
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <input
              value={productSearch || form.product_name}
              onChange={(e) => { setProductSearch(e.target.value); setForm({ ...form, product_name: e.target.value }); setShowProductDropdown(true); }}
              onFocus={() => setShowProductDropdown(true)}
              onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
              placeholder="Search or type new product..."
              className={ic}
            />
            {showProductDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {products
                  .filter(p => {
                    const label = p.name + (p.concentration ? ` (${p.concentration})` : "");
                    return !productSearch || label.toLowerCase().includes(productSearch.toLowerCase());
                  })
                  .map(p => {
                    const label = p.name + (p.concentration ? ` (${p.concentration})` : "");
                    return (
                      <div key={p.id} onMouseDown={() => { setForm({ ...form, product_name: label }); setProductSearch(""); setShowProductDropdown(false); }}
                        className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-xs text-gray-400">{p.category || ""}</span>
                      </div>
                    );
                  })}
                {productSearch && !products.some(p => (p.name + (p.concentration ? ` (${p.concentration})` : "")).toLowerCase() === productSearch.toLowerCase()) && (
                  <div onMouseDown={() => { setForm({ ...form, product_name: productSearch }); setShowProductDropdown(false); }}
                    className="px-3 py-2 text-sm hover:bg-green-50 cursor-pointer text-green-700 border-t border-gray-100">
                    + Add "{productSearch}" as new product
                  </div>
                )}
                {products.filter(p => !productSearch || (p.name + (p.concentration ? ` (${p.concentration})` : "")).toLowerCase().includes(productSearch.toLowerCase())).length === 0 && !productSearch && (
                  <div className="px-3 py-2 text-sm text-gray-400">No products found</div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={ic}>
                <option value="KG">KG</option>
                <option value="MT">MT</option>
                <option value="LTR">LTR</option>
                <option value="Ltrs">Ltrs</option>
                <option value="PCS">PCS</option>
                <option value="GM">GM</option>
                <option value="ML">ML</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
              <input type="number" step="0.01" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="0.00" className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={ic}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="INR">INR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <input
              value={clientSearch || (form.client ? clients.find(c => c.id === form.client)?.company_name || "" : "")}
              onChange={(e) => { setClientSearch(e.target.value); if (!e.target.value) setForm({ ...form, client: "" }); setShowClientDropdown(true); }}
              onFocus={() => setShowClientDropdown(true)}
              onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
              placeholder="Search client..."
              className={ic}
            />
            {showClientDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {clients
                  .filter(c => !clientSearch || c.company_name?.toLowerCase().includes(clientSearch.toLowerCase()))
                  .map(c => (
                    <div key={c.id} onMouseDown={() => { setForm({ ...form, client: c.id }); setClientSearch(""); setShowClientDropdown(false); }}
                      className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-center justify-between">
                      <span>{c.company_name}</span>
                      {c.country && <span className="text-xs text-gray-400">{c.country}</span>}
                    </div>
                  ))}
                {clients.filter(c => !clientSearch || c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">No clients found</div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
              <select value={form.delivery_terms} onChange={(e) => setForm({ ...form, delivery_terms: e.target.value })} className={ic}>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="CFR">CFR</option>
                <option value="EXW">EXW</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
              <input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. 100% Advance" className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Freight</label>
              <select value={form.freight_terms} onChange={(e) => setForm({ ...form, freight_terms: e.target.value })} className={ic}>
                <option value="">Select</option>
                <option value="sea_fcl">Sea - FCL</option>
                <option value="sea_lcl">Sea - LCL</option>
                <option value="air">Air Freight</option>
                <option value="courier">Courier</option>
                <option value="ex_works">Ex Works</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg font-medium shadow-sm hover:shadow disabled:opacity-50">
              {submitting ? "Creating..." : "Create Order"}
            </button>
            <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} title="Delete Sales Order" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-800">
                  Are you sure you want to delete <span className="font-semibold">{deleteTarget.order_number || "this order"}</span>?
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  The order will be removed from the list. Remaining orders will be re-numbered automatically so the sequence stays contiguous.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={confirmDeleteOrder} disabled={deleting} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
