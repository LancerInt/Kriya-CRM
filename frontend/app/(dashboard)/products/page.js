"use client";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";

function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left bg-white hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-colors">
        <span className={selected ? "text-gray-900" : "text-gray-400"}>{selected ? selected.label : placeholder || "Select..."}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {options.map(o => (
            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${o.value === value ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
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
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Product Name — full width, prominent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Enter product name" className={inputClass + " text-base font-medium"} />
          </div>

          {/* Key Details Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">HSN Code</label>
              <input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} placeholder="31010000" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Soil Conditioner" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Active Ingredient</label>
              <input value={form.active_ingredient} onChange={(e) => setForm({ ...form, active_ingredient: e.target.value })} placeholder="Azadirachtin" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Concentration</label>
              <input value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })} placeholder="90%" className={inputClass} />
            </div>
          </div>

          {/* Pricing Row */}
          <div className="bg-gray-50 rounded-lg p-4 -mx-1">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Pricing</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Base Price</label>
                <input type="number" step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} placeholder="0.00" className={inputClass + " bg-white"} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                <CustomSelect value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={[
                  { value: "USD", label: "USD - US Dollar" },
                  { value: "EUR", label: "EUR - Euro" },
                  { value: "INR", label: "INR - Indian Rupee" },
                  { value: "GBP", label: "GBP - British Pound" },
                ]} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                <CustomSelect value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={[
                  { value: "MT", label: "MT - Metric Ton" },
                  { value: "KG", label: "KG - Kilogram" },
                  { value: "L", label: "L - Liters" },
                  { value: "GAL", label: "GAL - Gallons" },
                  { value: "PCS", label: "PCS - Pieces" },
                  { value: "BAGS", label: "BAGS - Bags" },
                  { value: "DRUMS", label: "DRUMS - Drums" },
                ]} />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Product description (optional)" className={inputClass} />
          </div>

          {/* Client Brand Names */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Brand Names</label>
            <input value={form.client_brand_names} onChange={(e) => setForm({ ...form, client_brand_names: e.target.value })} placeholder="aza, azarate, azadin, neem guard" className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">Comma-separated alternate names clients use for this product</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {submitting ? "Saving..." : editing ? "Update Product" : "Add Product"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
