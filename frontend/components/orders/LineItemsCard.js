"use client";
import { useState } from "react";
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
                <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 hover:bg-indigo-50/40 rounded-xl border border-gray-100 transition-colors">
                  <span className="w-7 h-7 rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-600 flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">{item.product_name}</p>
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
            <table className="w-full text-sm" style={{ minWidth: order.can_view_total ? 720 : 520 }}>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left py-2 px-3 w-10">#</th>
                  <th className="text-left py-2 px-3 min-w-[260px]">Product *</th>
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
                      <td className="py-2 px-3">
                        <input
                          value={row.product_name}
                          onChange={(e) => updateRow(i, "product_name", e.target.value)}
                          placeholder="e.g. Neem Oil 0.3%"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
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
                  <tr><td colSpan={order.can_view_total ? 7 : 5} className="py-4 px-2 text-center text-sm text-gray-400 italic">No line items — click Add Product.</td></tr>
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
    </div>
  );
}
