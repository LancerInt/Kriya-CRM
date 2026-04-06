"use client";
import { useState, useRef, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";

/**
 * Editable Proforma Invoice — Kriya Biosys PI template.
 * Matches the new design with Freight, Insurance, Discount, Grand Total.
 * ALL existing calculation logic is PRESERVED — only UI structure is updated.
 */
export default function PIEditorModal({ open, onClose, pi, piForm, setPiForm, piItems, setPiItems, onSave, onSend, onPreview, sending, sendLabel }) {
  const piInit = useRef(null);
  const [products, setProducts] = useState([]);

  // Fetch products for price auto-populate
  useEffect(() => {
    if (open && products.length === 0) {
      api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
    }
  }, [open]);

  // Restore saved display_overrides into piForm on load
  useEffect(() => {
    if (!open || !pi || piInit.current === pi.id) return;
    piInit.current = pi.id;
    if (pi.display_overrides && typeof pi.display_overrides === 'object') {
      const updates = {};
      Object.entries(pi.display_overrides).forEach(([k, v]) => {
        if (piForm[k] === undefined || piForm[k] === null) updates[k] = v;
      });
      if (Object.keys(updates).length > 0) {
        setPiForm(prev => ({ ...prev, ...updates }));
      }
    }
  }, [open, pi]);

  if (!open || !pi) return null;

  const ic = "border-0 outline-none bg-transparent text-xs w-full focus:bg-yellow-50 hover:bg-yellow-50/50 px-1";
  const icr = ic + " text-right";

  // ── EXISTING CALCULATION LOGIC — UNTOUCHED ──
  const total = piItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);

  const _findProductPrice = (productName) => {
    if (!productName || products.length === 0) return null;
    const nameLower = productName.toLowerCase();
    // Match by product name, brand names, or full name with concentration
    for (const p of products) {
      const full = `${p.name}${p.concentration ? ` (${p.concentration})` : ""}`.toLowerCase();
      if (full === nameLower || p.name.toLowerCase() === nameLower) return { price: p.base_price, unit: p.unit };
      // Check client brand names
      if (p.client_brand_names) {
        const brands = p.client_brand_names.split(",").map(b => b.trim().toLowerCase());
        if (brands.some(b => b === nameLower || nameLower.includes(b))) return { price: p.base_price, unit: p.unit };
      }
    }
    return null;
  };

  const updateItem = (i, field, value) => {
    const items = [...piItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].total_price = qty * price;
    }
    // Auto-populate price when product_name or description_of_goods changes (only if price is empty)
    if (field === "product_name" || field === "description_of_goods") {
      const match = _findProductPrice(value);
      if (match && !parseFloat(items[i].unit_price)) {
        items[i].unit_price = match.price;
        items[i].unit = match.unit || items[i].unit;
        const qty = parseFloat(items[i].quantity) || 0;
        items[i].total_price = qty * parseFloat(match.price);
      }
    }
    setPiItems(items);
  };

  const addItem = () => setPiItems([...piItems, { id: `new-${Date.now()}`, product_name: "", client_product_name: "", packages_description: "", description_of_goods: "", quantity: "", unit: "Ltrs", unit_price: "", total_price: 0 }]);
  const removeItem = (i) => setPiItems(piItems.filter((_, idx) => idx !== i));

  // ── Additional totals (UI placeholders bound to piForm) ──
  const freight = parseFloat(piForm._freight) || 0;
  const insurance = parseFloat(piForm._insurance) || 0;
  const subTotal = total + freight + insurance;
  const discount = parseFloat(piForm._discount) || 0;
  const grandTotal = subTotal - discount;

  // Auto-generate amount in words
  const numberToWords = (num, currency = "USD") => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
      if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      return String(n);
    };
    return `${currency} ${convert(Math.floor(num))} Only`;
  };
  const autoAmountWords = grandTotal > 0 ? numberToWords(grandTotal, piForm.currency || "USD") : "";

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div className="bg-white" style={{ fontFamily: "'Bookman Old Style', Georgia, serif", fontSize: "11px", lineHeight: "1.4" }}>

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: "#558b2f", minWidth: "190px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "18px", fontWeight: "600" }}>PROFORMA INVOICE</span>
          </div>
        </div>

        {/* ── EXPORTER / CONSIGNEE / PI NUMBER ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%] bg-gray-100">Exporter</td>
              <td className="border border-gray-400 p-1 font-bold w-[40%] bg-gray-100">Consignee</td>
              <td className="border border-gray-400 p-1 font-bold w-[25%] bg-gray-200">PRO. Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_company_name || ""} onChange={(e) => setPiForm({ ...piForm, client_company_name: e.target.value })} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1"><input value={piForm.invoice_number || ""} onChange={(e) => setPiForm({ ...piForm, invoice_number: e.target.value })} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_tax_number || ""} onChange={(e) => setPiForm({ ...piForm, client_tax_number: e.target.value })} placeholder="TaxID / CNPJ / GSTIN" className={ic} /></td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_address || ""} onChange={(e) => setPiForm({ ...piForm, client_address: e.target.value })} placeholder="Address" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_pincode || ""} onChange={(e) => setPiForm({ ...piForm, client_pincode: e.target.value })} placeholder="City, Pincode" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold bg-gray-200">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Contact : +91 6385848466</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_city_state_country || ""} onChange={(e) => setPiForm({ ...piForm, client_city_state_country: e.target.value })} placeholder="City, State, Country" className={ic} /></td>
              <td className="border border-gray-400 p-1"><input type="date" value={piForm.invoice_date || ""} onChange={(e) => setPiForm({ ...piForm, invoice_date: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Email : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_phone || ""} onChange={(e) => setPiForm({ ...piForm, client_phone: e.target.value })} placeholder="Phone" className={ic} /></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400 p-1" colSpan="2"></td>
            </tr>
          </tbody>
        </table>

        {/* ── SHIPMENT DETAILS ── */}
        <div className="font-bold text-white text-[10px] px-2 py-1 mb-1" style={{ backgroundColor: "#558b2f" }}>
          SHIPMENT DETAILS
        </div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-3">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><span className="px-1">Country of Origin</span></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={piForm.country_of_origin || ""} onChange={(e) => setPiForm({ ...piForm, country_of_origin: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><span className="px-1">Country of Final Destination</span></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={piForm.country_of_final_destination || ""} onChange={(e) => setPiForm({ ...piForm, country_of_final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Loading</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.port_of_loading || ""} onChange={(e) => setPiForm({ ...piForm, port_of_loading: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Discharge</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.port_of_discharge || ""} onChange={(e) => setPiForm({ ...piForm, port_of_discharge: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Vessel / Flight No</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.vessel_flight_no || ""} onChange={(e) => setPiForm({ ...piForm, vessel_flight_no: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Final Destination</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.final_destination || ""} onChange={(e) => setPiForm({ ...piForm, final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Terms of Trade</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.terms_of_trade || ""} onChange={(e) => setPiForm({ ...piForm, terms_of_trade: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Incoterms</span></td>
              <td className="border border-gray-400 p-0"><input value={piForm.terms_of_delivery || ""} onChange={(e) => setPiForm({ ...piForm, terms_of_delivery: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Buyer Reference</span></td>
              <td className="border border-gray-400 p-0" colSpan="3"><input value={piForm.buyer_reference || ""} onChange={(e) => setPiForm({ ...piForm, buyer_reference: e.target.value })} className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── PACKING DETAILS ── */}
        <div className="text-right text-lg font-light mb-1" style={{ color: "#999" }}>PACKING DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <thead>
            <tr style={{ backgroundColor: "#558b2f" }}>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">Product Details</th>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">Description of Goods</th>
              <th className="border border-gray-400 p-1 text-left text-white text-[9px]">No. & Kind of Packages</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Quantity</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Price/Kg</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]">Amount</th>
              <th className="border border-gray-400 p-1 w-5"></th>
            </tr>
          </thead>
          <tbody>
            {piItems.map((item, i) => (
              <tr key={item.id || i}>
                <td className="border border-gray-400 p-0"><input value={item.product_name} onChange={(e) => updateItem(i, "product_name", e.target.value)} className={ic} placeholder="Client's product name" /></td>
                <td className="border border-gray-400 p-0"><input value={item.description_of_goods} onChange={(e) => updateItem(i, "description_of_goods", e.target.value)} className={ic} placeholder="Company product name" /></td>
                <td className="border border-gray-400 p-0"><input value={item.packages_description} onChange={(e) => updateItem(i, "packages_description", e.target.value)} className={ic} /></td>
                <td className="border border-gray-400 p-0"><input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={icr} /></td>
                <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className={icr} /></td>
                <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)) ? `$${((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}` : "$0.00"}</td>
                <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
              </tr>
            ))}
            <tr>
              <td colSpan="7" className="border border-gray-400 p-1">
                <button onClick={addItem} className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── TOTALS (Freight, Insurance, Sub Total, Discount, Grand Total) ── */}
        <div className="flex justify-end mb-2">
          <table className="border-collapse text-[10px]" style={{ width: "280px" }}>
            <tbody>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">Freight</td>
                <td className="text-right p-1 border border-gray-300 w-28">
                  <input type="number" step="0.01" value={piForm._freight || ""} onChange={(e) => setPiForm({ ...piForm, _freight: e.target.value })} placeholder="0.00" className={icr + " w-24"} />
                </td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">Insurance</td>
                <td className="text-right p-1 border border-gray-300">
                  <input type="number" step="0.01" value={piForm._insurance || ""} onChange={(e) => setPiForm({ ...piForm, _insurance: e.target.value })} placeholder="0.00" className={icr + " w-24"} />
                </td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">Sub Total</td>
                <td className="text-right font-bold p-1 border border-gray-300">${subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              </tr>
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">
                  Discount
                  <input value={piForm._discount_label || ""} onChange={(e) => setPiForm({ ...piForm, _discount_label: e.target.value })} placeholder="(550 Kgs)" className="border-0 outline-none bg-transparent text-[9px] text-gray-500 ml-1 w-16 focus:bg-yellow-50" />
                </td>
                <td className="text-right p-1 border border-gray-300">
                  <input type="number" step="0.01" value={piForm._discount || ""} onChange={(e) => setPiForm({ ...piForm, _discount: e.target.value })} placeholder="0.00" className={icr + " w-24"} />
                </td>
              </tr>
              <tr style={{ backgroundColor: "#f0fdf4" }}>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: "#558b2f" }}>Grand Total</td>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: "#558b2f" }}>${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Amount in Words ── */}
        <div className="text-center p-2 border border-gray-400 mb-3 text-[10px]" style={{ backgroundColor: "#dce9d0" }}>
          <span className="font-bold">Amount In Words : </span>
          <input
            value={piForm.amount_in_words || autoAmountWords}
            onChange={(e) => setPiForm({ ...piForm, amount_in_words: e.target.value })}
            placeholder="zero Dollars Only"
            className="border-0 outline-none bg-transparent text-[10px] font-bold text-center w-64 focus:bg-yellow-50"
          />
        </div>

        {/* ── BANK DETAILS + SEAL/SIGN ── */}
        <div className="flex items-start gap-6 mb-3 text-[10px]">
          <div className="flex-1">
            <b>Bank Details</b>
            <textarea value={piForm.bank_details || ""} onChange={(e) => setPiForm({ ...piForm, bank_details: e.target.value })} rows={6} className="w-full mt-1 px-1 py-1 text-[10px] border border-gray-300 rounded outline-none font-mono" />
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
          <p className="font-bold mb-1">Expecting Your Business !</p>
          <div className="py-1 px-2 text-white text-[8px] mb-1" style={{ backgroundColor: "#558b2f" }}>
            If you have any questions please contact info@kriya.ltd
          </div>
          <p className="italic" style={{ color: "#558b2f" }}>" Go Organic ! Save Planet ! "</p>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
          <div className="flex gap-2">
            <button onClick={onSave} className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">Save Draft</button>
            <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Preview PDF</button>
            <button onClick={onSend} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {sending ? "Sending..." : (sendLabel || "Send PI")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
