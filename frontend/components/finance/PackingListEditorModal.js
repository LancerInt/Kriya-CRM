"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const SHIPMENT_LEFT_FIELDS_CLIENT = [
  ["country_of_origin", "Country of Origin"],
  ["port_of_loading", "Port of Loading"],
  ["vessel_flight_no", "Vessel / Flight No"],
];
const SHIPMENT_RIGHT_FIELDS_CLIENT = [
  ["country_of_final_destination", "Country of Final Destination"],
  ["port_of_discharge", "Port of Discharge"],
  ["buyer_reference", "Buyer Reference"],
];
const SHIPMENT_LEFT_FIELDS_LOGISTIC = [
  ["country_of_origin", "Country of Origin"],
  ["port_of_loading", "Port of Loading"],
  ["vessel_flight_no", "Vessel / Flight No"],
  ["terms_of_trade", "Terms of Trade"],
  ["buyer_reference", "Buyer Reference"],
];
const SHIPMENT_RIGHT_FIELDS_LOGISTIC = [
  ["country_of_final_destination", "Country of Final Destination"],
  ["port_of_discharge", "Port of Discharge"],
  ["final_destination", "Final Destination"],
  ["terms_of_delivery", "Terms of Delivery"],
];

function KV({ label, value, onChange }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-2 py-1 border-b border-gray-100">
      <span className="text-[11px] text-[#1f4e79] font-medium leading-6">{label}</span>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="text-[11px] bg-transparent outline-none border-b border-transparent focus:border-indigo-400"
      />
    </div>
  );
}

function PartyEditor({ title, value, onChange, fields }) {
  return (
    <div>
      <div className="bg-gray-200 px-3 py-1 text-sm font-semibold">{title}</div>
      <div className="p-2 space-y-1">
        {fields.map(([k, label]) => (
          <div key={k} className="grid grid-cols-[8rem_1fr] gap-2 items-center">
            <span className="text-[11px] text-gray-600">{label}</span>
            <input
              value={value?.[k] || ""}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              className="text-[11px] bg-transparent outline-none border-b border-gray-200 focus:border-indigo-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const PARTY_FIELDS = [
  ["name", "Company Name"],
  ["tax_number", "Tax Number"],
  ["address", "Address"],
  ["city_state_country", "City, State, Country"],
  ["phone", "Phone"],
  ["email", "Email"],
];

export default function PackingListEditorModal({ open, onClose, orderId, listType, onGenerated }) {
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const loadedKey = useRef(null);

  const docLabel = listType === "logistic" ? "Logistic Packing List" : "Client Packing List";

  useEffect(() => {
    if (!open || !orderId || !listType) return;
    const key = `${orderId}:${listType}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setLoading(true);
    api.post("/finance/packing-list/create-from-order/", { order_id: orderId, list_type: listType })
      .then((res) => setPl(res.data))
      .catch(() => {
        toast.error(`Failed to load ${docLabel}`);
        loadedKey.current = null; // allow retry
      })
      .finally(() => setLoading(false));
  }, [open, orderId, listType]);

  useEffect(() => { if (!open) { loadedKey.current = null; setPl(null); } }, [open]);

  const patch = (partial) => setPl((p) => ({ ...p, ...partial }));

  const setShipment = (key, value) => {
    setPl((p) => ({ ...p, shipment_details: { ...(p.shipment_details || {}), [key]: value } }));
  };
  const setWeight = (key, value) => {
    setPl((p) => ({ ...p, weight_summary: { ...(p.weight_summary || {}), [key]: value } }));
  };

  const updateItem = (idx, field, value) => {
    setPl((p) => {
      const next = [...(p.items || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...p, items: next };
    });
  };
  const addItem = () => {
    setPl((p) => ({
      ...p,
      items: [...(p.items || []), { product_name: "", no_kind_packages: "", description_goods: "", ncm_code: "", hsn_code: "", lote: "", quantity: "" }],
    }));
  };
  const removeItem = (idx) => {
    setPl((p) => ({ ...p, items: (p.items || []).filter((_, i) => i !== idx) }));
  };

  const updateLoading = (idx, value) => {
    setPl((p) => {
      const next = [...(p.loading_details || [])];
      next[idx] = value;
      return { ...p, loading_details: next };
    });
  };
  const addLoading = () => setPl((p) => ({ ...p, loading_details: [...(p.loading_details || []), ""] }));
  const removeLoading = (idx) => setPl((p) => ({ ...p, loading_details: (p.loading_details || []).filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!pl) return null;
    setSaving(true);
    try {
      const res = await api.patch(`/finance/packing-list/${pl.id}/`, {
        date: pl.date,
        exporter_details: pl.exporter_details,
        consignee_details: pl.consignee_details,
        consignee_to: pl.consignee_to,
        notify_details: pl.notify_details,
        shipment_details: pl.shipment_details,
        items: pl.items,
        container_details: pl.container_details,
        weight_summary: pl.weight_summary,
        loading_details: pl.loading_details,
        declaration: pl.declaration,
        grand_total: pl.grand_total,
      });
      setPl(res.data);
      toast.success("Saved");
      return res.data;
    } catch { toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  };

  const generate = async () => {
    if (!pl) return;
    const saved = await save();
    if (!saved) return;
    setGenerating(true);
    try {
      const res = await api.get(`/finance/packing-list/${pl.id}/generate-pdf/`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("PDF generated & saved to Documents");
      onGenerated?.();
    } catch { toast.error("Failed to generate"); }
    finally { setGenerating(false); }
  };

  if (!open) return null;

  const isLogistic = listType === "logistic";
  const shipmentLeft = isLogistic ? SHIPMENT_LEFT_FIELDS_LOGISTIC : SHIPMENT_LEFT_FIELDS_CLIENT;
  const shipmentRight = isLogistic ? SHIPMENT_RIGHT_FIELDS_LOGISTIC : SHIPMENT_RIGHT_FIELDS_CLIENT;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full my-4">
        <div className="sticky top-0 bg-white z-10 px-5 py-3 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="font-semibold">{docLabel}</h2>
            <p className="text-xs text-gray-500">{pl?.invoice_number || "Loading..."}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !pl} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">{saving ? "Saving..." : "Save"}</button>
            <button onClick={generate} disabled={generating || !pl} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{generating ? "Generating..." : "Save & Generate PDF"}</button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
          </div>
        </div>

        {loading || !pl ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Header meta */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="font-bold text-[#4e8a2d] text-lg">Kriya</div>
              </div>
              <div className="text-center">
                <div className="inline-block px-5 py-2 bg-[#4e8a2d] text-white font-bold text-sm rounded">PACKING LIST</div>
              </div>
              <div className="text-[11px] space-y-1">
                <div className="bg-gray-200 px-2 py-0.5 font-semibold">Invoice Number</div>
                <div className="px-2">{pl.invoice_number}</div>
                <div className="bg-gray-200 px-2 py-0.5 font-semibold">Date</div>
                <input type="date" value={pl.date || ""} onChange={(e) => patch({ date: e.target.value })} className="px-2 bg-transparent outline-none border-b border-gray-200 focus:border-indigo-400 w-full" />
              </div>
            </div>

            {/* Exporter + Consignee/Notify */}
            <div className="grid grid-cols-2 gap-4">
              <PartyEditor
                title="Exporter"
                value={pl.exporter_details || {}}
                onChange={(v) => patch({ exporter_details: v })}
                fields={[
                  ["name", "Name"],
                  ["gstin", "GSTIN"],
                  ["email", "Email"],
                  ["iec", "IEC"],
                ]}
              />
              {isLogistic ? (
                <PartyEditor title="Notify" value={pl.notify_details || {}} onChange={(v) => patch({ notify_details: v })} fields={PARTY_FIELDS} />
              ) : (
                <PartyEditor title="Consignee" value={pl.consignee_details || {}} onChange={(v) => patch({ consignee_details: v })} fields={PARTY_FIELDS} />
              )}
            </div>

            {/* Consignee (logistic only) */}
            {isLogistic && (
              <div>
                <div className="bg-gray-200 px-3 py-1 text-sm font-semibold">Consignee</div>
                <input
                  value={pl.consignee_to || ""}
                  onChange={(e) => patch({ consignee_to: e.target.value })}
                  placeholder="To the Order - Brazil"
                  className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
            )}

            {/* Shipment Details */}
            <div>
              <div className="bg-[#4e8a2d] text-white inline-block px-3 py-1 text-sm font-semibold rounded">Shipment Details</div>
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div>{shipmentLeft.map(([k, l]) => <KV key={k} label={l} value={pl.shipment_details?.[k]} onChange={(v) => setShipment(k, v)} />)}</div>
                <div>{shipmentRight.map(([k, l]) => <KV key={k} label={l} value={pl.shipment_details?.[k]} onChange={(v) => setShipment(k, v)} />)}</div>
              </div>
            </div>

            {/* Items table */}
            <div>
              <div className="text-right text-gray-400 font-bold mb-1">PACKING DETAILS</div>
              <div className="border rounded overflow-hidden">
                <div className="grid grid-cols-[1.5fr_2.5fr_2.5fr_1.5fr_40px] bg-[#4e8a2d] text-white text-xs font-semibold">
                  <div className="p-2">Product Details</div>
                  <div className="p-2">No. &amp; Kind of Packages</div>
                  <div className="p-2">Description of Goods</div>
                  <div className="p-2">Quantity</div>
                  <div className="p-2"></div>
                </div>
                {(pl.items || []).map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1.5fr_2.5fr_2.5fr_1.5fr_40px] border-t border-gray-200 text-xs">
                    <input value={it.product_name || ""} onChange={(e) => updateItem(idx, "product_name", e.target.value)} className="p-2 outline-none" placeholder="Product name" />
                    <textarea value={it.no_kind_packages || ""} onChange={(e) => updateItem(idx, "no_kind_packages", e.target.value)} className="p-2 outline-none resize-none" rows={3} placeholder="1000 Ltrs IBC Container Packing&#10;1000 Ltrs x 40 Nos = 40000 Ltrs&#10;Total No. of IBC Containers = 40 Nos" />
                    <div className="p-1 flex flex-col gap-0.5">
                      <input value={it.description_goods || ""} onChange={(e) => updateItem(idx, "description_goods", e.target.value)} className="p-1 outline-none" placeholder="Description of goods" />
                      <input value={it.ncm_code || ""} onChange={(e) => updateItem(idx, "ncm_code", e.target.value)} className="p-1 outline-none" placeholder="NCM Code" />
                      <input value={it.hsn_code || ""} onChange={(e) => updateItem(idx, "hsn_code", e.target.value)} className="p-1 outline-none" placeholder="HSN Code" />
                      <input value={it.lote || ""} onChange={(e) => updateItem(idx, "lote", e.target.value)} className="p-1 outline-none" placeholder="LOTE" />
                    </div>
                    <input value={it.quantity || ""} onChange={(e) => updateItem(idx, "quantity", e.target.value)} className="p-2 outline-none" placeholder="40000 Ltr" />
                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <button onClick={addItem} className="px-3 py-1 text-xs border border-dashed rounded hover:bg-gray-50">+ Add Row</button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#4e8a2d]">Grand Total</span>
                  <input value={pl.grand_total || ""} onChange={(e) => patch({ grand_total: e.target.value })} className="px-2 py-1 text-sm border rounded w-32" placeholder="40000 Ltr" />
                </div>
              </div>
            </div>

            {/* Container Details (client only) */}
            {!isLogistic && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Container Details</label>
                <input value={pl.container_details || ""} onChange={(e) => patch({ container_details: e.target.value })} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded" placeholder="DFSU7112053 - 01 to 20 IBC's MSI" />
              </div>
            )}

            {/* Weight Summary */}
            <div className="bg-[#e6efdc] p-4 rounded">
              <h4 className="text-sm font-semibold mb-2">Weight Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                {isLogistic && <KV label="Total No. of IBC Container" value={pl.weight_summary?.ibc_containers} onChange={(v) => setWeight("ibc_containers", v)} />}
                <KV label={isLogistic ? "Total No. of Container" : "Total No. of Packages"} value={isLogistic ? pl.weight_summary?.total_containers : pl.weight_summary?.total_packages} onChange={(v) => setWeight(isLogistic ? "total_containers" : "total_packages", v)} />
                <KV label="Gross Weight per Container" value={pl.weight_summary?.gross_per_container} onChange={(v) => setWeight("gross_per_container", v)} />
                <KV label="Total Gross Weight" value={pl.weight_summary?.total_gross_weight} onChange={(v) => setWeight("total_gross_weight", v)} />
                <KV label="Net Weight per Container" value={pl.weight_summary?.net_per_container} onChange={(v) => setWeight("net_per_container", v)} />
                <KV label="Total Net Weight" value={pl.weight_summary?.total_net_weight} onChange={(v) => setWeight("total_net_weight", v)} />
              </div>
            </div>

            {/* Loading Details (logistic only) */}
            {isLogistic && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Loading Details</h4>
                {(pl.loading_details || []).map((ln, idx) => (
                  <div key={idx} className="flex gap-2 mb-1">
                    <input value={ln} onChange={(e) => updateLoading(idx, e.target.value)} className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded" placeholder="TN 04 BE 0087 - DFSU 7112053 - 01 to 20 IBCs" />
                    <button onClick={() => removeLoading(idx)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                ))}
                <button onClick={addLoading} className="px-3 py-1 text-xs border border-dashed rounded hover:bg-gray-50">+ Add Loading Line</button>
              </div>
            )}

            {/* Declaration */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Declaration</label>
              <textarea value={pl.declaration || ""} onChange={(e) => patch({ declaration: e.target.value })} className="w-full text-xs border border-gray-300 rounded p-2" rows={2} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
