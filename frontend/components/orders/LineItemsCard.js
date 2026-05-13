"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { confirmDialog } from "@/lib/confirm";

/**
 * Editable Line Items card on the Sales Order detail page.
 * Edits flow back to the Order via /add-item /update-item /delete-item
 * actions. After every change we call reload() so the per-product
 * COA/MSDS/PIF rows in the Documents Checklist re-derive automatically.
 */
export default function LineItemsCard({ order, reload }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  // Product catalog — fetched once when the user opens edit mode so the
  // dropdown is instant after that.
  const [catalog, setCatalog] = useState([]);
  // Which row's product picker is open. null = all closed.
  const [pickerOpenIdx, setPickerOpenIdx] = useState(null);
  // Per-row search filter for the picker.
  const [pickerQuery, setPickerQuery] = useState("");
  // Screen-space coordinates for the floating dropdown (portal-rendered).
  const [pickerRect, setPickerRect] = useState(null);
  // Refs to each row's combobox container so we can measure its position
  // and anchor the portal dropdown precisely beneath it.
  const triggerRefs = useRef({});

  useEffect(() => {
    if (!editing || catalog.length) return;
    api.get("/products/", { params: { page_size: 5000 } })
      .then((r) => setCatalog(r.data.results || r.data || []))
      .catch(() => {/* non-fatal — user can still type names */});
  }, [editing, catalog.length]);

  // Close the picker when clicking outside any picker UI.
  useEffect(() => {
    if (pickerOpenIdx === null) return;
    const handler = (e) => {
      if (!e.target.closest?.("[data-product-picker]") && !e.target.closest?.("[data-product-picker-portal]")) {
        setPickerOpenIdx(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpenIdx]);

  // Track the trigger's bounding rect so the portal dropdown floats right
  // under the input, regardless of any clipping ancestor (overflow-x-auto).
  useEffect(() => {
    if (pickerOpenIdx === null) { setPickerRect(null); return; }
    const update = () => {
      const el = triggerRefs.current[pickerOpenIdx];
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPickerRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [pickerOpenIdx]);

  // Apply a catalog product to a draft row — autofills name + unit + price.
  const pickProduct = (i, product) => {
    setDraft((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, product_name: product.name };
      if (!r.unit || r.unit === "KG") next.unit = product.unit || r.unit;
      if ((!r.unit_price || Number(r.unit_price) === 0) && product.base_price) {
        next.unit_price = product.base_price;
      }
      return next;
    }));
    setPickerOpenIdx(null);
    setPickerQuery("");
  };

  const startEdit = () => {
    setDraft((order.items || []).map((it) => ({
      ...it,
      product_name: it.product_name || "",
      client_product_name: it.client_product_name || "",
      quantity: it.quantity ?? 1,
      unit: it.unit || "KG",
      unit_price: it.unit_price ?? 0,
    })));
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft([]);
    setEditing(false);
  };

  const updateRow = (idx, field, value) => {
    setDraft((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addBlankRow = () => {
    setDraft((prev) => [...prev, {
      id: null, product_name: "", client_product_name: "",
      quantity: 1, unit: "KG", unit_price: 0,
    }]);
  };

  const removeRow = async (idx) => {
    const row = draft[idx];
    if (row.id) {
      const ok = await confirmDialog({
        title: "Remove this line item?",
        message: `"${row.product_name || "(unnamed)"}" will be removed from the order. Documents linked to this product (COA, MSDS, PIF) may need to be regenerated.`,
        confirmText: "Yes, remove",
        cancelText: "Cancel",
      });
      if (!ok) return;
      try {
        await api.post(`/orders/${order.id}/delete-item/`, { item_id: row.id });
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to remove item"));
        return;
      }
    }
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    // Validate: every row must have a product name.
    if (draft.some((r) => !(r.product_name || "").trim())) {
      toast.error("Every line needs a product name.");
      return;
    }
    setSaving(true);
    try {
      // Walk the draft and call the right endpoint for each row.
      // We do them sequentially so toast errors map to the right row.
      for (const row of draft) {
        const payload = {
          product_name: (row.product_name || "").trim(),
          client_product_name: (row.client_product_name || "").trim(),
          quantity: Number(row.quantity) || 0,
          unit: row.unit || "KG",
          unit_price: Number(row.unit_price) || 0,
        };
        if (row.id) {
          await api.post(`/orders/${order.id}/update-item/`, { item_id: row.id, ...payload });
        } else {
          await api.post(`/orders/${order.id}/add-item/`, payload);
        }
      }
      toast.success("Line items saved");
      setEditing(false);
      setDraft([]);
      reload?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save items"));
    } finally {
      setSaving(false);
    }
  };

  const items = order.items || [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-base">📦</span>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-700">Line Items</h3>
          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5">
            {items.length}
          </span>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-lg"
            title="Edit line items — adding or removing products auto-updates the per-product COA / MSDS / PIF rows in the Documents Checklist."
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}
      </div>

      {/* ── Read-only view ───────────────────────────────────────── */}
      {!editing && (
        <>
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <div className="text-2xl mb-2">📋</div>
              <p className="text-sm">No line items yet. Click <span className="font-medium text-indigo-600">Edit</span> to add the first product.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 sm:gap-4 p-3 bg-gray-50 hover:bg-indigo-50/40 rounded-xl border border-gray-100 transition-colors">
                  <span className="w-7 h-7 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-600 flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Client Product Name</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.product_name || <span className="italic text-amber-600">— not set —</span>}</p>
                    {item.client_product_name && (
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        <span className="font-semibold uppercase tracking-wide text-gray-400">Company Product:</span> {item.client_product_name}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-full px-2.5 py-0.5 tabular-nums shrink-0">
                    {Number(item.quantity).toLocaleString()} {item.unit}
                  </span>
                  {order.can_view_total && (
                    <span className="text-sm font-bold text-gray-900 tabular-nums w-24 text-right shrink-0">
                      {Number(item.total_price).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {order.can_view_total && items.length > 0 && (
            <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">
                {order.currency} {Number(order.total || 0).toLocaleString()}
              </span>
            </div>
          )}
        </>
      )}

      {/* ── Edit mode ─────────────────────────────────────────────── */}
      {editing && (
        <>
          <div className="rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: order.can_view_total ? 920 : 720 }}>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left py-2 px-3 w-10">#</th>
                  <th className="text-left py-2 px-3 min-w-[260px]">Client Product Name <span className="text-rose-500">*</span></th>
                  <th className="text-left py-2 px-3 min-w-[180px]">Company Product</th>
                  <th className="text-left py-2 px-3 w-28">Qty</th>
                  <th className="text-left py-2 px-3 w-24">Unit</th>
                  {order.can_view_total && <th className="text-right py-2 px-3 w-32">Unit Price</th>}
                  {order.can_view_total && <th className="text-right py-2 px-3 w-32">Total</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {draft.map((row, i) => {
                  const total = (Number(row.quantity) || 0) * (Number(row.unit_price) || 0);
                  return (
                    <tr key={row.id || `new-${i}`} className="border-t border-gray-100">
                      <td className="py-2 px-3 text-gray-500">{i + 1}</td>
                      {/* FIRST CELL = Client Product Name column = FREE TEXT
                          (what the client calls the product on their PO). */}
                      <td className="py-2 px-3">
                        <input
                          value={row.client_product_name}
                          onChange={(e) => updateRow(i, "client_product_name", e.target.value)}
                          placeholder="What client calls it on their PO"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </td>
                      {/* SECOND CELL = Company Product column = CATALOG DROPDOWN
                          (the official product from our catalog — drives
                          COA / MSDS / PIF and the rest of document generation).
                          Dropdown is rendered to document.body via a portal so
                          it floats above the table without being clipped. */}
                      <td className="py-2 px-3">
                        <div
                          ref={(el) => { triggerRefs.current[i] = el; }}
                          data-product-picker
                        >
                          <div className="flex items-stretch border border-gray-300 rounded focus-within:ring-2 focus-within:ring-indigo-500 bg-white">
                            <input
                              value={row.product_name}
                              onChange={(e) => {
                                const typed = e.target.value;
                                setDraft((prev) => prev.map((r, idx) => idx === i ? { ...r, product_name: typed } : r));
                                setPickerQuery(typed);
                                setPickerOpenIdx(i);
                              }}
                              onFocus={() => { setPickerOpenIdx(i); setPickerQuery(row.product_name || ""); }}
                              placeholder="Pick from catalog…"
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-transparent outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => { setPickerOpenIdx(pickerOpenIdx === i ? null : i); setPickerQuery(""); }}
                              title="Open product catalog"
                              className="px-2 border-l border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <svg className={`w-4 h-4 transition-transform ${pickerOpenIdx === i ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.quantity}
                          onChange={(e) => updateRow(i, "quantity", e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={row.unit}
                          onChange={(e) => updateRow(i, "unit", e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {["KG", "MT", "LTR", "ML", "GM", "TON", "PCS", "BAG", "DRUM"].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      {order.can_view_total && (
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.unit_price}
                            onChange={(e) => updateRow(i, "unit_price", e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </td>
                      )}
                      {order.can_view_total && (
                        <td className="py-2 px-2 text-right text-gray-700 font-medium">
                          {total ? Number(total).toLocaleString() : "—"}
                        </td>
                      )}
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => removeRow(i)}
                          title="Remove this line"
                          className="text-red-600 hover:text-red-700 text-sm font-bold"
                        >×</button>
                      </td>
                    </tr>
                  );
                })}
                {draft.length === 0 && (
                  <tr><td colSpan={order.can_view_total ? 8 : 6} className="py-4 px-2 text-center text-sm text-gray-400 italic">No line items — click Add Product.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={addBlankRow}
              className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg"
            >+ Add Product</button>
            <div className="flex gap-2">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mt-2 italic">
            Adding or removing products automatically updates the per-product COA, MSDS, and PIF rows in the Documents Checklist on the next save.
          </p>
        </>
      )}

      {/* Portal-rendered catalog dropdown — floats above the table, anchored
          to the active trigger's screen position. Lives on document.body so
          no ancestor's overflow can clip it. */}
      {editing && pickerOpenIdx !== null && pickerRect && typeof document !== "undefined" && createPortal(
        <div
          data-product-picker-portal
          style={{
            position: "fixed",
            top: pickerRect.top,
            left: pickerRect.left,
            width: pickerRect.width,
            zIndex: 9999,
          }}
          className="max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-2xl"
        >
          {(() => {
            const q = (pickerQuery || "").toLowerCase().trim();
            const filtered = catalog.filter((p) =>
              !q || (p.name || "").toLowerCase().includes(q) ||
              (p.category || "").toLowerCase().includes(q) ||
              (p.client_brand_names || "").toLowerCase().includes(q)
            );
            if (filtered.length === 0) {
              return <div className="px-3 py-3 text-xs text-gray-500 italic">
                No catalog matches. Press <span className="font-semibold">Save</span> to keep the typed value as a custom product name.
              </div>;
            }
            return filtered.slice(0, 100).map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pickProduct(pickerOpenIdx, p); }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                  {p.concentration && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 shrink-0">{p.concentration}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                  {p.category && <span className="uppercase tracking-wide font-semibold text-gray-600">{p.category}</span>}
                  {p.base_price ? (
                    <span className="tabular-nums">{p.currency || "USD"} {Number(p.base_price).toLocaleString()}/{p.unit || "MT"}</span>
                  ) : null}
                </div>
              </button>
            ));
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
