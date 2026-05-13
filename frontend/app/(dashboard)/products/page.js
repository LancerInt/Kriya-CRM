"use client";
import { useEffect, useMemo, useState, useRef } from "react";
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
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { confirmDialog } from "@/lib/confirm";

const emptyForm = { name: "", hsn_code: "", category: "", active_ingredient: "", concentration: "", description: "", base_price: "", currency: "USD", unit: "MT", client_brand_names: "" };

// Category → soft tone token. Maps loose category strings to a card accent
// so the products list scans by family at a glance.
const CATEGORY_TONE = {
  "soil conditioner":  { bar: "bg-amber-400",   chip: "bg-amber-50 border-amber-100",   icon: "🌱", iconBg: "bg-amber-100 text-amber-700"   },
  "fertilizer":        { bar: "bg-emerald-400", chip: "bg-emerald-50 border-emerald-100",icon: "🌾", iconBg: "bg-emerald-100 text-emerald-700"},
  "bio stimulant":     { bar: "bg-teal-400",    chip: "bg-teal-50 border-teal-100",     icon: "🧬", iconBg: "bg-teal-100 text-teal-700"     },
  "insect control":    { bar: "bg-rose-400",    chip: "bg-rose-50 border-rose-100",     icon: "🐛", iconBg: "bg-rose-100 text-rose-700"     },
  "plant growth":      { bar: "bg-lime-400",    chip: "bg-lime-50 border-lime-100",     icon: "🌿", iconBg: "bg-lime-100 text-lime-700"     },
};
function categoryTone(cat) {
  if (!cat) return { bar: "bg-gray-300", chip: "bg-gray-50 border-gray-200", icon: "📦", iconBg: "bg-gray-100 text-gray-600" };
  return CATEGORY_TONE[cat.toLowerCase()] || { bar: "bg-indigo-400", chip: "bg-indigo-50 border-indigo-100", icon: "📦", iconBg: "bg-indigo-100 text-indigo-700" };
}

// Render the brand-alias chip cloud with show-more toggle so a product with
// 12 client-side names doesn't blow out the row. Collapses to 5 + "+N more".
function AliasChips({ aliases }) {
  const [expanded, setExpanded] = useState(false);
  if (!aliases.length) return null;
  const VISIBLE = 5;
  const showAll = expanded || aliases.length <= VISIBLE;
  const visible = showAll ? aliases : aliases.slice(0, VISIBLE);
  const hiddenCount = aliases.length - VISIBLE;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visible.map((name, i) => (
        <span key={i} className="px-2 py-0.5 text-[11px] font-medium text-orange-700 bg-orange-50 border border-orange-100 rounded-full">{name}</span>
      ))}
      {!showAll && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="px-2 py-0.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full hover:bg-indigo-100"
        >
          +{hiddenCount} more
        </button>
      )}
      {showAll && aliases.length > VISIBLE && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="px-2 py-0.5 text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100"
        >
          Show less
        </button>
      )}
    </div>
  );
}

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
    api.get("/products/", { params: { page_size: 5000 } })
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
    if (!(await confirmDialog("Delete this product?"))) return;
    try {
      await api.delete(`/products/${id}/`);
      toast.success("Product deleted");
      loadProducts();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  // Filters
  const [filters, setFilters] = useState({ search: "", category: "" });
  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  // Derive options + stats from data
  const categoryOptions = useMemo(() =>
    Array.from(new Set(products.map((p) => (p.category || "").trim()).filter(Boolean))).sort(),
    [products]);

  const stats = useMemo(() => {
    const buckets = { total: products.length, categories: 0, with_brand_aliases: 0, needs_review: 0 };
    buckets.categories = categoryOptions.length;
    products.forEach((p) => {
      if ((p.client_brand_names || "").trim()) buckets.with_brand_aliases += 1;
      if (!p.name?.trim() || !p.category?.trim()) buckets.needs_review += 1;
    });
    return buckets;
  }, [products, categoryOptions]);

  const filtered = useMemo(() => products.filter((p) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${p.name || ""} ${p.concentration || ""} ${p.category || ""} ${p.active_ingredient || ""} ${p.client_brand_names || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.category && (p.category || "") !== filters.category) return false;
    return true;
  }), [products, filters]);

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ search: "", category: "" });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={filtersActive ? `${filtered.length} of ${products.length} products` : `${products.length} products`}
        action={canEdit ?
          <button onClick={openCreate} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
            + Add Product
          </button> : null
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📦</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">products in catalog</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🌱</span><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Categories</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.categories}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">distinct families</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🏷️</span><span className="text-[11px] font-semibold uppercase tracking-wider text-orange-700">Brand Aliases</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.with_brand_aliases}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">with client-side names</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⚠️</span><span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Needs Review</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.needs_review}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">missing name or category</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-1">Filters</span>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name, ingredient, brand alias..." className={`${filterInput} w-full pl-8`} />
        </div>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className={filterInput}>
          <option value="">All categories</option>
          {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            Clear
          </button>
        )}
      </div>

      {/* Product cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No products match" : "No products yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Add your first product to get started."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = categoryTone(row.category);
            const aliases = (row.client_brand_names || "").split(",").map((n) => n.trim()).filter(Boolean);
            const needsReview = !row.name?.trim() || !row.category?.trim();
            return (
              <div
                key={row.id}
                className={`group relative bg-white border ${tone.chip} rounded-xl p-4 transition-all hover:shadow-md hover:-translate-y-px`}
              >
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-start gap-4 pl-2 flex-wrap md:flex-nowrap">
                  <div className={`w-11 h-11 rounded-xl ${tone.iconBg} flex items-center justify-center text-lg shrink-0`}>
                    {tone.icon}
                  </div>

                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      {row.name?.trim() ? (
                        <span className="font-bold text-gray-900 tracking-tight">{row.name}</span>
                      ) : (
                        <span className="italic text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium border border-amber-200">Needs review — set product name</span>
                      )}
                      {row.concentration && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">{row.concentration}</span>
                      )}
                      {needsReview && row.name?.trim() && (
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">Review</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                      {row.category && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">{row.category}</span>
                      )}
                      {row.hsn_code && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200">HSN {row.hsn_code}</span>
                      )}
                      {row.active_ingredient && (
                        <span className="truncate">· {row.active_ingredient}</span>
                      )}
                    </div>
                    <AliasChips aliases={aliases} />
                  </div>

                  <div className="text-right shrink-0 min-w-[120px]">
                    {row.base_price ? (
                      <>
                        <p className="text-sm font-bold text-gray-900 tabular-nums">
                          {row.currency || "USD"} {Number(row.base_price).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-gray-400">per {row.unit || "MT"}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">No price set</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(row)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleDelete(row.id, e)}
                        title="Delete product"
                        className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors opacity-60 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Product" : "Add Product"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Enter product name" className={inputClass + " text-base font-medium"} />
          </div>

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

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Product description (optional)" className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Brand Names</label>
            <input value={form.client_brand_names} onChange={(e) => setForm({ ...form, client_brand_names: e.target.value })} placeholder="aza, azarate, azadin, neem guard" className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">Comma-separated alternate names clients use for this product</p>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg font-semibold shadow-sm hover:shadow disabled:opacity-50 transition-all">
              {submitting ? "Saving..." : editing ? "Update Product" : "Add Product"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
