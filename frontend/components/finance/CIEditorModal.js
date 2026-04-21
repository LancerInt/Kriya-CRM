"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";

const SUP_MAP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ' };
const SUB_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
const toUnicode = (text, map) => text.split('').map(c => map[c.toLowerCase()] || c).join('');

/**
 * Editable Commercial Invoice — Kriya Biosys CI template.
 * New design: Exporter/Notify + Consignee block + Shipment with Bank Details +
 * Packing table (USD+INR) + Discount/SubTotal/GST/Grand Total + Additional Details.
 * ALL existing calculation logic is PRESERVED.
 */
export default function CIEditorModal({ open, onClose, ci, ciForm, setCiForm, ciItems, setCiItems, onSave, onSend, onPreview, sending }) {
  const editorRef = useRef(null);
  const [scriptMode, setScriptMode] = useState(null);

  const handleScriptClick = useCallback((mode) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') && editorRef.current?.contains(active)) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start !== end) {
        const map = mode === 'sub' ? SUB_MAP : SUP_MAP;
        const converted = toUnicode(active.value.substring(start, end), map);
        const newValue = active.value.substring(0, start) + converted + active.value.substring(end);
        const setter = active.tagName === 'TEXTAREA'
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
          : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(active, newValue);
        active.dispatchEvent(new Event("input", { bubbles: true }));
        requestAnimationFrame(() => { active.focus(); active.selectionStart = start; active.selectionEnd = start + converted.length; });
        return;
      }
    }
    setScriptMode((prev) => prev === mode ? null : mode);
  }, []);

  useEffect(() => {
    if (!scriptMode || !editorRef.current) return;
    const map = scriptMode === 'sub' ? SUB_MAP : SUP_MAP;
    const handler = (e) => {
      const el = e.target;
      if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
      if (el.type === 'number' || el.type === 'date') return;
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const mapped = map[e.key.toLowerCase()];
      if (mapped) {
        e.preventDefault();
        const start = el.selectionStart;
        const newValue = el.value.substring(0, start) + mapped + el.value.substring(el.selectionEnd);
        const setter = el.tagName === 'TEXTAREA'
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
          : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, newValue);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + mapped.length; });
      }
    };
    const container = editorRef.current;
    container.addEventListener("keydown", handler, true);
    return () => container.removeEventListener("keydown", handler, true);
  }, [scriptMode]);

  if (!open || !ci) return null;

  const ic = "border-0 outline-none bg-transparent text-xs w-full focus:bg-yellow-50 hover:bg-yellow-50/50 px-1";
  const icr = ic + " text-right";

  // ── ALL EXISTING CALCULATIONS — UNTOUCHED ──
  const totalUsd = ciItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);
  const rate = parseFloat(ciForm.exchange_rate) || 0;
  const freight = parseFloat(ciForm.freight) || 0;
  const insurance = parseFloat(ciForm.insurance) || 0;
  const totalFobInr = totalUsd * rate;
  const freightInr = freight * rate;
  const insuranceInr = insurance * rate;
  const totalInvUsd = totalUsd + freight + insurance;
  const totalInvInr = totalFobInr + freightInr + insuranceInr;
  const igstRate = parseFloat(ciForm.igst_rate) || 0;
  const igstAmount = totalInvInr * igstRate / 100;
  const grandTotalInr = totalInvInr + igstAmount;

  // ── NEW: Discount + Sub Total for INR side ──
  const discountInr = parseFloat(ciForm._ci_discount) || 0;
  const subTotalInr = totalInvInr;
  const finalGrandTotalInr = grandTotalInr - discountInr;

  const updateItem = (i, field, value) => {
    const items = [...ciItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].total_price = qty * price;
    }
    setCiItems(items);
  };

  const addItem = () => setCiItems([...ciItems, {
    id: `new-${Date.now()}`, product_name: "", hsn_code: "",
    packages_description: "", description_of_goods: "",
    quantity: "", unit: "KG", unit_price: "", total_price: 0
  }]);
  const removeItem = (i) => setCiItems(ciItems.filter((_, idx) => idx !== i));

  const handleSaveWithTotals = () => {
    setCiForm(prev => ({
      ...prev,
      total_fob_usd: totalUsd,
      total_fob_inr: totalFobInr,
      freight_inr: freightInr,
      insurance_inr: insuranceInr,
      total_invoice_usd: totalInvUsd,
      total_invoice_inr: totalInvInr,
      igst_amount: igstAmount,
      grand_total_inr: grandTotalInr,
    }));
    setTimeout(() => onSave(), 50);
  };

  const G = "#558b2f";

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div ref={editorRef} className="bg-white" style={{ fontFamily: "'Bookman Old Style', Georgia, serif", fontSize: "11px", lineHeight: "1.4" }}>

        {/* ── SUBSCRIPT / SUPERSCRIPT TOOLBAR ── */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
          <span className="text-xs text-gray-500 mr-1">Format:</span>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleScriptClick('sup'); }}
            className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${scriptMode === 'sup' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50 hover:border-indigo-300'}`}
            title="Superscript — select text & click, or toggle to type in superscript"
          >
            X<sup className="text-[8px]">2</sup>
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleScriptClick('sub'); }}
            className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${scriptMode === 'sub' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50 hover:border-indigo-300'}`}
            title="Subscript — select text & click, or toggle to type in subscript"
          >
            X<sub className="text-[8px]">2</sub>
          </button>
          {scriptMode && (
            <span className="text-[10px] text-indigo-600 font-medium ml-1 animate-pulse">
              {scriptMode === 'sup' ? 'Superscript' : 'Subscript'} mode ON — click again to turn off
            </span>
          )}
        </div>

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: G, minWidth: "190px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "20px", fontWeight: "normal", fontFamily: "'Montserrat', sans-serif" }}>INVOICE</span>
          </div>
        </div>

        {/* ── EXPORTER / NOTIFY / INVOICE # ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%] bg-gray-100">Exporter</td>
              <td className="border border-gray-400 p-1 font-bold w-[40%] bg-gray-100">Notify</td>
              <td className="border border-gray-400 p-1 font-bold w-[25%] bg-gray-200">Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.notify_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, notify_company_name: e.target.value })} className={ic + " font-bold"} placeholder="Notify party name" /></td>
              <td className="border border-gray-400 p-1"><input value={ciForm.invoice_number || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_number: e.target.value })} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.notify_address || ""} onChange={(e) => setCiForm({ ...ciForm, notify_address: e.target.value })} placeholder="Address" className={ic} /></td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, client_city_state_country: e.target.value })} placeholder="City, State" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, client_pincode: e.target.value })} placeholder="Pincode, Country" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold bg-gray-200">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Contact : +91 6385848466</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_tax_number || ""} onChange={(e) => setCiForm({ ...ciForm, client_tax_number: e.target.value })} placeholder="TaxID" className={ic} /></td>
              <td className="border border-gray-400 p-1"><input type="date" value={ciForm.invoice_date || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_date: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Email : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.notify_phone || ""} onChange={(e) => setCiForm({ ...ciForm, notify_phone: e.target.value })} placeholder="Phone" className={ic} /></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400 p-1" colSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">IEC : AAHCK9695F</td>
              <td className="border border-gray-400 p-1" colSpan="2"></td>
            </tr>
          </tbody>
        </table>

        {/* ── CONSIGNEE ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold bg-gray-100">Consignee</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, client_company_name: e.target.value })} placeholder="To the Order" className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── SHIPMENT DETAILS + BANK DETAILS (side by side) ── */}
        <div className="flex gap-2 mb-2">
          {/* Shipment Details (left) */}
          <div className="flex-1">
            <div className="font-bold text-white text-[10px] px-2 py-1 mb-1" style={{ backgroundColor: G }}>SHIPMENT DETAILS</div>
            <table className="w-full border-collapse border border-gray-400 text-[10px]">
              <tbody>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold w-[40%]"><span className="px-1">Country of Origin</span></td>
                  <td className="border border-gray-400 p-0 w-[60%]"><input value={ciForm.country_of_origin || ""} onChange={(e) => setCiForm({ ...ciForm, country_of_origin: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Loading</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.port_of_loading || ""} onChange={(e) => setCiForm({ ...ciForm, port_of_loading: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Vessel / Flight No</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.vessel_flight_no || ""} onChange={(e) => setCiForm({ ...ciForm, vessel_flight_no: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Discharge</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.port_of_discharge || ""} onChange={(e) => setCiForm({ ...ciForm, port_of_discharge: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Country of Final Dest.</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.country_of_final_destination || ""} onChange={(e) => setCiForm({ ...ciForm, country_of_final_destination: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Incoterms</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.terms_of_delivery || ""} onChange={(e) => setCiForm({ ...ciForm, terms_of_delivery: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Terms of Trade</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.payment_terms || ""} onChange={(e) => setCiForm({ ...ciForm, payment_terms: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Buyer Reference</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.buyer_order_no || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_order_no: e.target.value })} className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Exchange Rate per USD</span></td>
                  <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={ciForm.exchange_rate || ""} onChange={(e) => setCiForm({ ...ciForm, exchange_rate: e.target.value })} placeholder="₹0.00" className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Batch No.</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.batch_no || ""} onChange={(e) => setCiForm({ ...ciForm, batch_no: e.target.value })} placeholder="e.g. B-2026-001" className={ic} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bank Details (right) */}
          <div style={{ width: "45%" }}>
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-[10px]">Bank Details</span>
              {[
                { label: "ICICI INR", name: "ICICI Bank Ltd", branch: "Salem Main Branch", beneficiary: "KRIYA BIOSYS PRIVATE LIMITED", ifsc: "ICIC0006119", swift: "ICICINBBCTS", ac: "611905057914", type: "CA Account" },
                { label: "ICICI USD", name: "ICICI Bank Ltd", branch: "Salem Main Branch", beneficiary: "KRIYA BIOSYS PRIVATE LIMITED", ifsc: "ICIC0006119", swift: "ICICINBBCTS", ac: "611906000027", type: "CA Account" },
                { label: "DBS INR", name: "DBS Bank India Limited", branch: "Salem - India", beneficiary: "Kriya Biosys Private Limited", ifsc: "DBSS0IN0832", swift: "DBSSINBB", ac: "832210073820", type: "CA Account" },
                { label: "DBS USD", name: "DBS Bank India Limited", branch: "Salem - India", beneficiary: "Kriya Biosys Private Limited", ifsc: "DBSS0IN0811", swift: "DBSSINBB", ac: "832250073848", type: "CA Account" },
              ].map(b => (
                <button key={b.label} type="button" onClick={() => setCiForm(prev => ({ ...prev, _bank_name: b.name, _bank_branch: b.branch, _bank_beneficiary: b.beneficiary, _bank_ifsc: b.ifsc, _bank_swift: b.swift, _bank_ac: b.ac, _bank_ac_type: b.type }))}
                  className="px-1.5 py-0.5 text-[8px] font-medium rounded border border-gray-300 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                  {b.label}
                </button>
              ))}
            </div>
            <table className="w-full border-collapse border border-gray-400 text-[10px]">
              <tbody>
                <tr><td className="border border-gray-400 p-0 font-bold w-[40%]"><span className="px-1">Bank Name</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_name || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_name: e.target.value })} placeholder="ICICI Bank Ltd" className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">Branch Name</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_branch || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_branch: e.target.value })} placeholder="Salem Main Branch" className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">Beneficiary</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_beneficiary || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_beneficiary: e.target.value })} placeholder="Kriya Biosys Pvt Ltd" className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">IFSC Code</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_ifsc || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_ifsc: e.target.value })} placeholder="ICIC0006119" className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">Swift Code</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_swift || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_swift: e.target.value })} placeholder="ICICINBB" className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">A/C No.</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_ac || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_ac: e.target.value })} className={ic} /></td></tr>
                <tr><td className="border border-gray-400 p-0 font-bold"><span className="px-1">A/C Type</span></td><td className="border border-gray-400 p-0"><input value={ciForm._bank_ac_type || ""} onChange={(e) => setCiForm({ ...ciForm, _bank_ac_type: e.target.value })} placeholder="CA Account" className={ic} /></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── PACKING DETAILS ── */}
        <div className="text-right text-lg font-light mb-1" style={{ color: "#999" }}>PACKING DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <thead>
            <tr style={{ backgroundColor: G }}>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">Product Name</th>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">No. & Kind of Packages</th>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">Product Details</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Quantity</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Price/Kg</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Amount in USD</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Amount in INR</th>
              <th className="border border-gray-400 p-1 w-5"></th>
            </tr>
          </thead>
          <tbody>
            {ciItems.map((item, i) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              const lineInr = lineTotal * rate;
              return (
                <tr key={item.id || i}>
                  <td className="border border-gray-400 p-0"><input value={item.product_name} onChange={(e) => updateItem(i, "product_name", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-400 p-0"><input value={item.packages_description} onChange={(e) => updateItem(i, "packages_description", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-400 p-0"><input value={item.description_of_goods} onChange={(e) => updateItem(i, "description_of_goods", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={icr + " w-16"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className={icr + " w-20"} /></td>
                  <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{lineTotal ? `$${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "$0.00"}</td>
                  <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{rate ? `Rs.${lineInr.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "Rs.0.00"}</td>
                  <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="8" className="border border-gray-400 p-1">
                <button onClick={addItem} className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FINANCIAL BREAKDOWN (right-aligned) ── */}
        <div className="flex justify-end mb-2">
          <table className="border-collapse text-[10px]" style={{ width: "320px" }}>
            <tbody>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300"></td>
                <td className="text-right font-bold p-1 border border-gray-300">USD</td>
                <td className="text-right font-bold p-1 border border-gray-300">INR</td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">Discount</td>
                <td className="text-right p-1 border border-gray-300"><input type="number" step="0.01" value={ciForm._ci_discount_usd || ""} onChange={(e) => setCiForm({ ...ciForm, _ci_discount_usd: e.target.value })} placeholder="0.00" className={icr + " w-20"} /></td>
                <td className="text-right p-1 border border-gray-300"><input type="number" step="0.01" value={ciForm._ci_discount || ""} onChange={(e) => setCiForm({ ...ciForm, _ci_discount: e.target.value })} placeholder="0.00" className={icr + " w-20"} /></td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">Sub Total</td>
                <td className="text-right p-1 border border-gray-300">${totalInvUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td className="text-right p-1 border border-gray-300">{rate ? `Rs.${subTotalInr.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "-"}</td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">GST <input type="number" step="0.01" value={ciForm.igst_rate || ""} onChange={(e) => setCiForm({ ...ciForm, igst_rate: e.target.value })} className="border border-gray-200 rounded px-1 py-0 text-xs w-10 outline-none" />%</td>
                <td className="text-right p-1 border border-gray-300"></td>
                <td className="text-right p-1 border border-gray-300">{rate ? `Rs.${igstAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "-"}</td>
              </tr>
              <tr style={{ backgroundColor: "#f0fdf4" }}>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: G }}>Grand Total</td>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: G }}></td>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: G }}>{rate ? `Rs.${finalGrandTotalInr.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── ADDITIONAL DETAILS ── */}
        <div className="mb-2 text-[10px]">
          <p className="font-bold underline mb-1">Additional Details</p>
          <p><b>FOB :</b> <input value={ciForm._ci_fob || ""} onChange={(e) => setCiForm({ ...ciForm, _ci_fob: e.target.value })} placeholder="$0" className="border-0 outline-none bg-transparent text-xs w-20 focus:bg-yellow-50" /></p>
          <p><b>Shipping & Forwarding :</b> <input value={ciForm._ci_shipping || ""} onChange={(e) => setCiForm({ ...ciForm, _ci_shipping: e.target.value })} placeholder="$0" className="border-0 outline-none bg-transparent text-xs w-20 focus:bg-yellow-50" /></p>
          <p><b>Insurance :</b> <input value={ciForm.insurance || ""} onChange={(e) => setCiForm({ ...ciForm, insurance: e.target.value })} placeholder="$0" className="border-0 outline-none bg-transparent text-xs w-20 focus:bg-yellow-50" /></p>
        </div>

        {/* ── Amount in Words ── */}
        <div className="text-center p-2 border border-gray-400 mb-3 text-[10px]" style={{ backgroundColor: "#dce9d0" }}>
          <span className="font-bold">Amount In Words : </span>
          <input
            value={ciForm.amount_in_words || ""}
            onChange={(e) => setCiForm({ ...ciForm, amount_in_words: e.target.value })}
            placeholder="Rupees zero Only"
            className="border-0 outline-none bg-transparent text-[10px] font-bold text-center w-72 focus:bg-yellow-50"
          />
        </div>

        {/* ── DECLARATION + SEAL/SIGN ── */}
        <div className="flex items-start gap-6 mb-3 text-[9px]">
          <div className="flex-1">
            <p><b>Declaration :</b></p>
            <p>We Declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct</p>
            <p className="font-bold mt-1">E. & O.E</p>
          </div>
          <div className="text-center flex flex-col items-center" style={{ minWidth: "180px" }}>
            <p className="font-bold text-[10px] mb-1">For Kriya Biosys Private Limited</p>
            <div className="flex items-end gap-1">
              <img src="/seal.png" alt="Seal" style={{ height: "55px" }} />
              <img src="/sign.png" alt="Signature" style={{ height: "35px" }} />
            </div>
            <p className="text-[9px] mt-1">Authorised Signature</p>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="text-center text-[9px] border-t border-gray-300 pt-2">
          <p className="italic" style={{ color: G }}>" Go Organic ! Save Planet ! "</p>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
          <div className="flex gap-2">
            <button onClick={handleSaveWithTotals} className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">Save Draft</button>
            <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Preview PDF</button>
            <button onClick={onSend} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {sending ? "Sending..." : "Send CI"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
