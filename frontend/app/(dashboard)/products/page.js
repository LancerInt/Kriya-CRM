"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";

const emptyForm = { name: "", hsn_code: "", category: "", active_ingredient: "", concentration: "", description: "", base_price: "", currency: "USD", unit: "MT", client_brand_names: "" };

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const user = useSelector((state) => state.auth.user);
  const canEdit = user?.role === "admin" || user?.role === "manager";

  const loadProducts = () => {
    setLoading(true);
    api.get("/products/")
      .then((r) => setProducts(r.data.results || r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (product) => {
    setEditing(product.id);
    setForm({
      name: product.name || "", hsn_code: product.hsn_code || "",
      category: product.category || "", active_ingredient: product.active_ingredient || "",
      concentration: product.concentration || "", description: product.description || "",
      base_price: product.base_price || "", currency: product.currency || "USD",
      unit: product.unit || "MT", client_brand_names: product.client_brand_names || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/products/${editing}/`, form);
        toast.success("Product updated");
      } else {
        await api.post("/products/", form);
        toast.success("Product created");
      }
      setShowModal(false);
      loadProducts();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save product")); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this product?")) return;
    try {
      await api.delete(`/products/${id}/`);
      toast.success("Product deleted");
      loadProducts();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const columns = [
    { key: "name", label: "Product", render: (row) => (
      <div className="flex items-center gap-2">
        {row.name ? (
          <span className="font-medium text-gray-900">{row.name}</span>
        ) : (
          <span className="italic text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium">Needs review — set product name</span>
        )}
      </div>
    )},
    { key: "concentration", label: "Concentration", render: (row) => row.concentration || "\u2014" },
    { key: "hsn_code", label: "HSN Code", render: (row) => row.hsn_code || "\u2014" },
    { key: "category", label: "Category" },
    { key: "base_price", label: "Base Price", render: (row) => row.base_price ? `$${Number(row.base_price).toLocaleString()}` : "\u2014" },
    { key: "unit", label: "Unit", render: (row) => row.unit || "MT" },
    { key: "client_brand_names", label: "Client Brand Names", render: (row) => row.client_brand_names ? (
      <div className="flex flex-wrap gap-1 max-w-xs">
        {row.client_brand_names.split(",").map((name, i) => (
          <span key={i} className="px-2 py-0.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-full">{name.trim()}</span>
        ))}
      </div>
    ) : <span className="text-gray-400">{"\u2014"}</span> },
    ...(canEdit ? [{ key: "actions", label: "", render: (row) => (
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => openEdit(row)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
        <button onClick={(e) => handleDelete(row.id, e)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
      </div>
    )}] : []),
  ];

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} products`}
        action={canEdit ?
          <button onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Add Product
          </button> : null
        }
      />
      <DataTable columns={columns} data={products} loading={loading} emptyTitle="No products" emptyDescription="Add your first product" />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Product" : "Add Product"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
              <input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} placeholder="e.g. 31010000" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Soil Conditioner" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Active Ingredient</label>
              <input value={form.active_ingredient} onChange={(e) => setForm({ ...form, active_ingredient: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Concentration</label>
              <input value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })} placeholder="e.g. 90%" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
              <input type="number" step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="INR">INR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass}>
                <option value="MT">MT (Metric Ton)</option>
                <option value="KG">KG</option>
                <option value="GAL">Gallons</option>
                <option value="L">Liters</option>
                <option value="PCS">Pieces</option>
                <option value="BAGS">Bags</option>
                <option value="DRUMS">Drums</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Brand Names</label>
            <input value={form.client_brand_names} onChange={(e) => setForm({ ...form, client_brand_names: e.target.value })} placeholder="e.g. aza, azarate, azadin, neem guard" className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">Comma-separated alternate names clients use for this product</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Saving..." : editing ? "Update Product" : "Add Product"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
