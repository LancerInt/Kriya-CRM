"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchOrders } from "@/store/slices/orderSlice";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";

export default function OrdersPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading } = useSelector((state) => state.orders);
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

  useEffect(() => {
    dispatch(fetchOrders());
  }, []);

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
    // Fetch next order number
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
        client: form.client,
        order_type: "direct",
        currency: form.currency || "USD",
        delivery_terms: form.delivery_terms,
        freight_terms: form.freight_terms,
        payment_terms: form.payment_terms,
      });
      // Create order item if product specified
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

  const user = useSelector((state) => state.auth?.user);
  const canDeleteOrder = user?.role === "admin" || user?.role === "manager";
  const [deleteTarget, setDeleteTarget] = useState(null); // order row pending delete
  const [deleting, setDeleting] = useState(false);

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

  const columns = [
    { key: "order_number", label: "Order #", render: (row) => <span className="font-medium">{row.order_number || `ORD-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Account" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy"); } catch { return "—"; } } },
    ...(canDeleteOrder ? [{
      key: "actions", label: "", render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
          title="Delete order"
          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      ),
    }] : []),
  ];

  const ic = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle={`${list.length} orders`} action={
        <div className="flex gap-2">
          <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Create Order</button>
          <AISummaryButton variant="button" title="Orders Summary" prompt={`Write a tight Orders summary using the pre-loaded order data. Structure with these sections (## headings):\n\n## Overview\nOne line: total active orders, total value (by currency), and counts in each major stage (docs preparing, dispatched, in transit, arrived).\n\n## In Motion\nUp to 5 orders dispatched / in transit / arrived: order# · client · status · value.\n\n## Needs Attention\nUp to 5 orders stuck or risk-flagged (e.g. waiting on documents, payment overdue, no movement in days): order# · client · why.\n\n## Top Clients\nUp to 4 clients by active-order value.\n\n### Next Steps\n2-3 concrete actions.\n\nKeep under 300 words. Don't enumerate every order.`} />
        </div>
      } />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No orders yet" emptyDescription="Orders are created from approved quotations or manually" onRowClick={(row) => router.push(`/orders/${row.id}`)} />

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Sales Order" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Order # + Created Date */}
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

          {/* Product — searchable dropdown with add new */}
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

          {/* Quantity / Unit / Unit Price — populates Order.total */}
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

          {/* Client — searchable dropdown */}
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

          {/* Delivery Terms + Payment Terms + Freight */}
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
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Order"}
            </button>
            <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
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
                  The order will be removed from the list. Linked shipments and documents are kept.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={confirmDeleteOrder}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
              >{deleting ? "Deleting..." : "Yes, Delete"}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
