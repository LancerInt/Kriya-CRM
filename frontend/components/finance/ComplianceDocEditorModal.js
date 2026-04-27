"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const DOC_LABELS = {
  examination_report: "Examination Report",
  dbk_declaration: "DBK Declaration",
  export_declaration: "Export Declaration Form",
  factory_stuffing: "Factory Stuffing Annexure",
  non_dg_declaration: "Non-DG Declaration Letter",
};

function Text({ label, value, onChange, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded" />
    </div>
  );
}
function Area({ label, value, onChange, rows = 2 }) {
  return (
    <div className="col-span-2">
      <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
      <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded resize-y" />
    </div>
  );
}
function Sel({ label, value, onChange, options, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1 text-sm border border-gray-300 rounded">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ExaminationReportForm({ f, setF }) {
  const setRow = (idx, key, v) => {
    const next = [...(f.containers || [])];
    next[idx] = { ...next[idx], [key]: v };
    setF({ containers: next });
  };
  const addRow = () => setF({ containers: [...(f.containers || []), { container_no: "", eseal_no: "" }] });
  const removeRow = (idx) => setF({ containers: (f.containers || []).filter((_, i) => i !== idx) });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Text label="Quantity (e.g. 40000 Liters)" value={f.quantity} onChange={(v) => setF({ quantity: v })} />
      <Text label="Product Description" value={f.product_description} onChange={(v) => setF({ product_description: v })} />
      <Text label="Container Count (e.g. 40)" value={f.container_count} onChange={(v) => setF({ container_count: v })} />
      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-600 mb-0.5">Containers & Eseals</label>
        {(f.containers || []).map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 mb-1">
            <input value={r.container_no || ""} onChange={(e) => setRow(i, "container_no", e.target.value)} placeholder="Container No" className="px-2 py-1 text-sm border border-gray-300 rounded" />
            <input value={r.eseal_no || ""} onChange={(e) => setRow(i, "eseal_no", e.target.value)} placeholder="Eseal No" className="px-2 py-1 text-sm border border-gray-300 rounded" />
            <button onClick={() => removeRow(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
          </div>
        ))}
        <button onClick={addRow} className="px-2 py-1 text-xs border border-dashed rounded hover:bg-gray-50">+ Add Row</button>
      </div>
    </div>
  );
}

function DBKForm({ f, setF }) {
  const mvSet = (idx, key, v) => {
    const next = [...(f.market_value_rows || [])];
    next[idx] = { ...next[idx], [key]: v };
    setF({ market_value_rows: next });
  };
  const mvAdd = () => setF({ market_value_rows: [...(f.market_value_rows || []), { item_no: "", value: "" }] });
  const mvRemove = (idx) => setF({ market_value_rows: (f.market_value_rows || []).filter((_, i) => i !== idx) });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Text label="Shipping Bill No." value={f.shipping_bill_no} onChange={(v) => setF({ shipping_bill_no: v })} />
      <Text label="Shipping Bill Date" value={f.shipping_bill_date} onChange={(v) => setF({ shipping_bill_date: v })} />
      <Text label="Invoice No." value={f.invoice_no} onChange={(v) => setF({ invoice_no: v })} />
      <Text label="Invoice Date" value={f.invoice_date} onChange={(v) => setF({ invoice_date: v })} />
      <Text label="Exporter Name" value={f.exporter_name} onChange={(v) => setF({ exporter_name: v })} />
      <Area label="Exporter Address" value={f.exporter_address} onChange={(v) => setF({ exporter_address: v })} />
      <Text label="Bank Name" value={f.bank_name} onChange={(v) => setF({ bank_name: v })} />
      <Text label="Payment Realization Period" value={f.payment_period} onChange={(v) => setF({ payment_period: v })} />
      <Text label="Terms of Payment" value={f.terms_of_payment} onChange={(v) => setF({ terms_of_payment: v })} />
      <Text label="Terms of Delivery" value={f.terms_of_delivery} onChange={(v) => setF({ terms_of_delivery: v })} />
      <Sel label="Nature of Transaction" value={f.nature_of_transaction} onChange={(v) => setF({ nature_of_transaction: v })} options={["Sale", "Sale on consignment Basis", "Gift", "Sample", "Other"]} />
      <Sel label="Method of Valuation" value={f.method_of_valuation} onChange={(v) => setF({ method_of_valuation: v })} options={["Rule 3", "Rule 4", "Rule 5", "Rule 6"]} />
      <Sel label="Seller/Buyer Related" value={f.seller_buyer_related} onChange={(v) => setF({ seller_buyer_related: v })} options={["Yes", "No"]} />
      <Sel label="Relationship Influenced Price" value={f.relationship_influenced_price} onChange={(v) => setF({ relationship_influenced_price: v })} options={["Yes", "No"]} />
      <Area label="Previous Exports" value={f.previous_exports} onChange={(v) => setF({ previous_exports: v })} />
      <Text label="Place" value={f.place} onChange={(v) => setF({ place: v })} />
      <Text label="Declaration Date" value={f.declaration_date} onChange={(v) => setF({ declaration_date: v })} />

      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-600 mb-0.5">Market Value Table (Appendix III Point 10)</label>
        {(f.market_value_rows || []).map((r, i) => (
          <div key={i} className="grid grid-cols-[60px_1fr_1fr_40px] gap-2 mb-1">
            <div className="px-2 py-1 text-sm text-gray-500">#{i + 1}</div>
            <input value={r.item_no || ""} onChange={(e) => mvSet(i, "item_no", e.target.value)} placeholder="Item No. in Invoice" className="px-2 py-1 text-sm border border-gray-300 rounded" />
            <input value={r.value || ""} onChange={(e) => mvSet(i, "value", e.target.value)} placeholder="Market Value" className="px-2 py-1 text-sm border border-gray-300 rounded" />
            <button onClick={() => mvRemove(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
          </div>
        ))}
        <button onClick={mvAdd} className="px-2 py-1 text-xs border border-dashed rounded hover:bg-gray-50">+ Add Row</button>
      </div>
    </div>
  );
}

function ExportDeclForm({ f, setF }) {
  const enc = f.enclosed_documents || {};
  const setEnc = (k, v) => setF({ enclosed_documents: { ...enc, [k]: v } });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Text label="Shipping Bill No." value={f.shipping_bill_no} onChange={(v) => setF({ shipping_bill_no: v })} />
      <Text label="Shipping Bill Date" value={f.shipping_bill_date} onChange={(v) => setF({ shipping_bill_date: v })} />
      <Text label="Invoice No." value={f.invoice_no} onChange={(v) => setF({ invoice_no: v })} />
      <Text label="Invoice Date" value={f.invoice_date} onChange={(v) => setF({ invoice_date: v })} />
      <Area label="Description of Goods" value={f.product_description} onChange={(v) => setF({ product_description: v })} />
      <Text label="Supporting Manufacturer" value={f.supporting_manufacturer} onChange={(v) => setF({ supporting_manufacturer: v })} />
      <Text label="Manufacturer Address" value={f.manufacturer_address} onChange={(v) => setF({ manufacturer_address: v })} />
      <Text label="Exporter Name" value={f.exporter_name} onChange={(v) => setF({ exporter_name: v })} />
      <Area label="Exporter Address" value={f.exporter_address} onChange={(v) => setF({ exporter_address: v })} />
      <Text label="Terms of Payment" value={f.terms_of_payment} onChange={(v) => setF({ terms_of_payment: v })} />
      <Text label="Terms of Delivery" value={f.terms_of_delivery} onChange={(v) => setF({ terms_of_delivery: v })} />
      <Sel label="Nature of Transaction" value={f.nature_of_transaction} onChange={(v) => setF({ nature_of_transaction: v })} options={["Sale", "Sale on consignment Basis", "Gift", "Sample", "Other"]} />
      <Sel label="Method of Valuation" value={f.method_of_valuation} onChange={(v) => setF({ method_of_valuation: v })} options={["Rule 3", "Rule 4", "Rule 5", "Rule 6"]} />
      <Sel label="Seller/Buyer Related" value={f.seller_buyer_related} onChange={(v) => setF({ seller_buyer_related: v })} options={["Yes", "No"]} />
      <Sel label="Relationship Influenced Price" value={f.relationship_influenced_price} onChange={(v) => setF({ relationship_influenced_price: v })} options={["Yes", "No"]} />
      <Area label="Previous Exports" value={f.previous_exports} onChange={(v) => setF({ previous_exports: v })} />
      <Area label="Other Relevant Information" value={f.other_information} onChange={(v) => setF({ other_information: v })} />
      <Text label="Customs Broker Name" value={f.customs_broker_name} onChange={(v) => setF({ customs_broker_name: v })} />
      <Text label="Broker Designation" value={f.broker_designation} onChange={(v) => setF({ broker_designation: v })} />
      <Text label="Exporter Designation" value={f.exporter_designation} onChange={(v) => setF({ exporter_designation: v })} />
      <Text label="Identity Card Number" value={f.identity_card_number} onChange={(v) => setF({ identity_card_number: v })} />
      <Text label="Place" value={f.place} onChange={(v) => setF({ place: v })} />
      <Text label="Declaration Date" value={f.declaration_date} onChange={(v) => setF({ declaration_date: v })} />

      <div className="col-span-2 border rounded p-2 bg-gray-50">
        <p className="text-xs font-medium text-gray-700 mb-1">Enclosed Documents</p>
        <label className="flex items-center gap-2 text-xs mb-1"><input type="checkbox" checked={!!enc.duty_exemption} onChange={(e) => setEnc("duty_exemption", e.target.checked)} /> Duty Exemption Entitlement Certificate / Advance Authorisation</label>
        <label className="flex items-center gap-2 text-xs mb-1"><input type="checkbox" checked={!!enc.invoice_packing} onChange={(e) => setEnc("invoice_packing", e.target.checked)} /> Invoice / Invoice cum packing list</label>
        <label className="flex items-center gap-2 text-xs mb-1"><input type="checkbox" checked={!!enc.quota_inspection} onChange={(e) => setEnc("quota_inspection", e.target.checked)} /> Quota / Inspection certificates</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!enc.others} onChange={(e) => setEnc("others", e.target.checked)} /> Others:</label>
        <input value={enc.others_specify || ""} onChange={(e) => setEnc("others_specify", e.target.value)} placeholder="Specify..." className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded" />
      </div>
    </div>
  );
}

function FactoryStuffingForm({ f, setF }) {
  const setCt = (idx, key, v) => {
    const next = [...(f.container_rows || [])];
    next[idx] = { ...next[idx], [key]: v };
    setF({ container_rows: next });
  };
  const ctAdd = () => setF({ container_rows: [...(f.container_rows || []), { container_no: "", seal_no: "", truck_no: "", size: "40 Ft HC", package_count: "" }] });
  const ctRemove = (idx) => setF({ container_rows: (f.container_rows || []).filter((_, i) => i !== idx) });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Text label="Shipping Bill No." value={f.shipping_bill_no} onChange={(v) => setF({ shipping_bill_no: v })} />
      <Text label="Shipping Bill Date" value={f.shipping_bill_date} onChange={(v) => setF({ shipping_bill_date: v })} />
      <Text label="Exporter Name" value={f.exporter_name} onChange={(v) => setF({ exporter_name: v })} />
      <Text label="IEC No." value={f.iec_no} onChange={(v) => setF({ iec_no: v })} />
      <Text label="GSTIN" value={f.gstin} onChange={(v) => setF({ gstin: v })} />
      <Text label="Branch Code" value={f.branch_code} onChange={(v) => setF({ branch_code: v })} />
      <Text label="BIN" value={f.bin_number} onChange={(v) => setF({ bin_number: v })} />
      <Area label="Factory Address" value={f.factory_address} onChange={(v) => setF({ factory_address: v })} />
      <Text label="Date of Examination" value={f.examination_date} onChange={(v) => setF({ examination_date: v })} />
      <Text label="Stuffing Start Time" value={f.stuffing_start_time} onChange={(v) => setF({ stuffing_start_time: v })} />
      <Text label="Stuffing Completion Time" value={f.stuffing_end_time} onChange={(v) => setF({ stuffing_end_time: v })} />
      <Text label="Time Taken For Stuffing" value={f.stuffing_duration} onChange={(v) => setF({ stuffing_duration: v })} />
      <Area label="Cargo Description with Quantity" value={f.cargo_description} onChange={(v) => setF({ cargo_description: v })} />
      <Text label="Destination Country" value={f.destination_country} onChange={(v) => setF({ destination_country: v })} />
      <Text label="Signatory Name & Designation" value={f.signatory_name} onChange={(v) => setF({ signatory_name: v })} />
      <Text label="Invoice No." value={f.invoice_no} onChange={(v) => setF({ invoice_no: v })} />
      <Text label="Invoice Date" value={f.invoice_date} onChange={(v) => setF({ invoice_date: v })} />
      <Text label="Total No. of Packages" value={f.total_packages} onChange={(v) => setF({ total_packages: v })} />
      <Text label="Consignee Name" value={f.consignee_name} onChange={(v) => setF({ consignee_name: v })} />
      <Area label="Consignee Address" value={f.consignee_address} onChange={(v) => setF({ consignee_address: v })} />
      <Sel label="Description Matches Invoice" value={f.description_match} onChange={(v) => setF({ description_match: v })} options={["YES", "NO"]} />
      <Text label="Seal Colour" value={f.seal_colour} onChange={(v) => setF({ seal_colour: v })} />

      <div className="col-span-2">
        <label className="block text-xs font-medium text-gray-600 mb-0.5">Container Rows</label>
        {(f.container_rows || []).map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_80px_1fr_40px] gap-2 mb-1">
            <input value={r.container_no || ""} onChange={(e) => setCt(i, "container_no", e.target.value)} placeholder="Container No" className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <input value={r.seal_no || ""} onChange={(e) => setCt(i, "seal_no", e.target.value)} placeholder="Seal No" className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <input value={r.truck_no || ""} onChange={(e) => setCt(i, "truck_no", e.target.value)} placeholder="Truck No" className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <input value={r.size || ""} onChange={(e) => setCt(i, "size", e.target.value)} placeholder="Size" className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <input value={r.package_count || ""} onChange={(e) => setCt(i, "package_count", e.target.value)} placeholder="No. Packages" className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <button onClick={() => ctRemove(i)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
          </div>
        ))}
        <button onClick={ctAdd} className="px-2 py-1 text-xs border border-dashed rounded hover:bg-gray-50">+ Add Container</button>
      </div>

      <div className="col-span-2 border-t pt-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Gate Pass</p>
        <div className="grid grid-cols-2 gap-3">
          <Text label="Commodity" value={f.gate_commodity} onChange={(v) => setF({ gate_commodity: v })} />
          <Text label="Container No (gate)" value={f.gate_container_no} onChange={(v) => setF({ gate_container_no: v })} />
          <Text label="Truck No (gate)" value={f.gate_truck_no} onChange={(v) => setF({ gate_truck_no: v })} />
          <Text label="Seal No (gate)" value={f.gate_seal_no} onChange={(v) => setF({ gate_seal_no: v })} />
          <Text label="Liner Seal" value={f.liner_seal} onChange={(v) => setF({ liner_seal: v })} />
          <Text label="Gate Time" value={f.gate_time} onChange={(v) => setF({ gate_time: v })} />
          <Text label="Gate Date" value={f.gate_date} onChange={(v) => setF({ gate_date: v })} />
        </div>
      </div>
    </div>
  );
}

function NonDGForm({ f, setF }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Text label="Date" value={f.date} onChange={(v) => setF({ date: v })} />
      <Text label="Company Name" value={f.company_name} onChange={(v) => setF({ company_name: v })} />
      <Text label="Product Name" value={f.product_name} onChange={(v) => setF({ product_name: v })} />
      <Text label="Product Description (e.g. Neem Oil based EC)" value={f.product_description} onChange={(v) => setF({ product_description: v })} />
      <Area label="Declaration Text (override — leave empty for default wording)" rows={4} value={f.declaration_text} onChange={(v) => setF({ declaration_text: v })} />
      <Text label="Signatory Label" value={f.signatory_label} onChange={(v) => setF({ signatory_label: v })} />
    </div>
  );
}

const FORMS = {
  examination_report: ExaminationReportForm,
  dbk_declaration: DBKForm,
  export_declaration: ExportDeclForm,
  factory_stuffing: FactoryStuffingForm,
  non_dg_declaration: NonDGForm,
};

export default function ComplianceDocEditorModal({ open, onClose, orderId, docType, onGenerated }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const loadedKey = useRef(null);

  useEffect(() => {
    if (!open || !orderId || !docType) return;
    const key = `${orderId}:${docType}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setLoading(true);
    api.post("/finance/compliance/create-from-order/", { order_id: orderId, doc_type: docType })
      .then((res) => setDoc(res.data))
      .catch(() => {
        toast.error(`Failed to load ${DOC_LABELS[docType]}`);
        loadedKey.current = null;
      })
      .finally(() => setLoading(false));
  }, [open, orderId, docType]);

  useEffect(() => { if (!open) { loadedKey.current = null; setDoc(null); } }, [open]);

  const setF = (partial) => {
    setDoc((d) => d ? { ...d, fields: { ...(d.fields || {}), ...partial } } : d);
  };

  const save = async () => {
    if (!doc) return null;
    setSaving(true);
    try {
      const res = await api.patch(`/finance/compliance/${doc.id}/`, { fields: doc.fields });
      setDoc(res.data);
      toast.success("Saved");
      return res.data;
    } catch { toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  };

  const generate = async () => {
    if (!doc) return;
    const saved = await save();
    if (!saved) return;
    setGenerating(true);
    try {
      const res = await api.get(`/finance/compliance/${doc.id}/generate-pdf/`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Generated & saved to Documents");
      onGenerated?.();
    } catch { toast.error("Failed to generate"); }
    finally { setGenerating(false); }
  };

  if (!open) return null;

  const Form = FORMS[docType];
  const fields = doc?.fields || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-4">
        <div className="sticky top-0 bg-white z-10 px-5 py-3 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="font-semibold">{DOC_LABELS[docType]}</h2>
            <p className="text-xs text-gray-500">Fill the editable placeholders — legal text is preserved verbatim in the PDF.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !doc} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">{saving ? "Saving..." : "Save"}</button>
            <button onClick={generate} disabled={generating || !doc} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{generating ? "Generating..." : "Save & Generate PDF"}</button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
          </div>
        </div>

        {loading || !doc ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
        ) : Form ? (
          <div className="p-5"><Form f={fields} setF={setF} /></div>
        ) : (
          <p className="p-8 text-center text-gray-500">Unknown doc type.</p>
        )}
      </div>
    </div>
  );
}
