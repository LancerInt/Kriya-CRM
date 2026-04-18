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
    client: "", product_name: "", delivery_terms: "FOB",
    freight_terms: "", payment_terms: "",
  });

  useEffect(() => {
    dispatch(fetchOrders());
  }, []);

  const openCreate = () => {
    setForm({ client: "", product_name: "", delivery_terms: "FOB", freight_terms: "", payment_terms: "" });
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
        delivery_terms: form.delivery_terms,
        freight_terms: form.freight_terms,
        payment_terms: form.payment_terms,
      });
      // Create order item if product specified
      if (form.product_name) {
        await api.post(`/orders/${res.data.id}/add-item/`, {
          product_name: form.product_name,
        });
      }
      toast.success(`Order ${res.data.order_number} created`);
      setShowCreateModal(false);
      dispatch(fetchOrders());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create order")); }
    finally { setSubmitting(false); }
  };

  const columns = [
    { key: "order_number", label: "Order #", render: (row) => <span className="font-medium">{row.order_number || `ORD-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Account" },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy"); } catch { return "\u2014"; } } },
  ];

  const ic = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle={`${list.length} orders`} action={
        <div className="flex gap-2">
          <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Create Order</button>
          <AISummaryButton variant="button" title="Orders Summary" prompt="Summarize all current orders. Use get_orders tool. Show: orders by status, total value, clients with active orders, and any that need attention." />
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
    </div>
  );
}
