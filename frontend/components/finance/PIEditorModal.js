"use client";
import { useState, useRef } from "react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";

/**
 * Editable Proforma Invoice — exact replica of the Kriya Biosys PI template.
 * Every field in the PDF is an editable input.
 */
export default function PIEditorModal({ open, onClose, pi, piForm, setPiForm, piItems, setPiItems, onSave, onSend, onPreview, sending }) {
  if (!open || !pi) return null;

  const ic = "border-0 outline-none bg-transparent text-xs w-full focus:bg-yellow-50 px-1";
  const icr = ic + " text-right";

  const total = piItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);

  const updateItem = (i, field, value) => {
    const items = [...piItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].total_price = qty * price;
    }
    setPiItems(items);
  };

  const addItem = () => setPiItems([...piItems, { id: `new-${Date.now()}`, product_name: "", packages_description: "", description_of_goods: "", quantity: "", unit: "Ltrs", unit_price: "", total_price: 0 }]);
  const removeItem = (i) => setPiItems(piItems.filter((_, idx) => idx !== i));

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div className="bg-white" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", lineHeight: "1.4" }}>

        {/* ── HEADER — matching template ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: "#4a7c2e", minWidth: "170px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "20px", fontWeight: "600" }}>PROFORMA<br/>INVOICE</span>
          </div>
        </div>

        {/* ── EXPORTER / CONSIGNEE / PI NUMBER ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%]">Exporter</td>
              <td className="border border-gray-400 p-1 font-bold w-[40%]">Consignee</td>
              <td className="border border-gray-400 p-1 font-bold w-[25%]">PRO. Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_company_name || ""} onChange={(e) => setPiForm({ ...piForm, client_company_name: e.target.value })} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1"><input value={piForm.invoice_number || ""} onChange={(e) => setPiForm({ ...piForm, invoice_number: e.target.value })} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_tax_number || ""} onChange={(e) => setPiForm({ ...piForm, client_tax_number: e.target.value })} placeholder="Client tax number (CNPJ/GSTIN)" className={ic} /></td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_address || ""} onChange={(e) => setPiForm({ ...piForm, client_address: e.target.value })} placeholder="Client address" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_pincode || ""} onChange={(e) => setPiForm({ ...piForm, client_pincode: e.target.value })} placeholder="Client pincode" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_city_state_country || ""} onChange={(e) => setPiForm({ ...piForm, client_city_state_country: e.target.value })} placeholder="City, State, Country" className={ic} /></td>
              <td className="border border-gray-400 p-1"><input type="date" value={piForm.invoice_date || ""} onChange={(e) => setPiForm({ ...piForm, invoice_date: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">EMAIL : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1"><input value={piForm.client_phone || ""} onChange={(e) => setPiForm({ ...piForm, client_phone: e.target.value })} placeholder="Client phone" className={ic} /></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">IEC : AAHCK9695F</td>
              <td className="border border-gray-400 p-1" colSpan="2"></td>
            </tr>
          </tbody>
        </table>

        {/* ── SHIPMENT DETAILS ── */}
        <div className="font-bold text-white text-[10px] px-2 py-1 mb-1" style={{ backgroundColor: "#4a7c2e", writingMode: "horizontal-tb" }}>
          SHIPMENT DETAILS
        </div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-3">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[20%]">Country of Origin</td>
              <td className="border border-gray-400 p-1 w-[30%]"><input value={piForm.country_of_origin || ""} onChange={(e) => setPiForm({ ...piForm, country_of_origin: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold w-[20%]">Country of Final Destination</td>
              <td className="border border-gray-400 p-1 w-[30%]"><input value={piForm.country_of_final_destination || ""} onChange={(e) => setPiForm({ ...piForm, country_of_final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">Port of Loading</td>
              <td className="border border-gray-400 p-1"><input value={piForm.port_of_loading || ""} onChange={(e) => setPiForm({ ...piForm, port_of_loading: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold">Port of Discharge</td>
              <td className="border border-gray-400 p-1"><input value={piForm.port_of_discharge || ""} onChange={(e) => setPiForm({ ...piForm, port_of_discharge: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">Vessel / Flight No</td>
              <td className="border border-gray-400 p-1"><input value={piForm.vessel_flight_no || ""} onChange={(e) => setPiForm({ ...piForm, vessel_flight_no: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold">Final Destination</td>
              <td className="border border-gray-400 p-1"><input value={piForm.final_destination || ""} onChange={(e) => setPiForm({ ...piForm, final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">Terms of Trade</td>
              <td className="border border-gray-400 p-1"><input value={piForm.terms_of_trade || ""} onChange={(e) => setPiForm({ ...piForm, terms_of_trade: e.target.value })} placeholder="D/A 30 Days" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold">Terms of Delivery</td>
              <td className="border border-gray-400 p-1"><input value={piForm.terms_of_delivery || ""} onChange={(e) => setPiForm({ ...piForm, terms_of_delivery: e.target.value })} placeholder="FOB - Chennai Port" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">Buyer Reference</td>
              <td className="border border-gray-400 p-1" colSpan="3"><input value={piForm.buyer_reference || ""} onChange={(e) => setPiForm({ ...piForm, buyer_reference: e.target.value })} placeholder="PO No: TBI-000000" className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── PACKING DETAILS ── */}
        <div className="text-right text-lg font-light mb-1" style={{ color: "#999" }}>PACKING DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 p-1 text-left font-bold">Product Details</th>
              <th className="border border-gray-400 p-1 text-left font-bold">No. & Kind of Packages</th>
              <th className="border border-gray-400 p-1 text-left font-bold">Description of Goods</th>
              <th className="border border-gray-400 p-1 text-right font-bold">Quantity</th>
              <th className="border border-gray-400 p-1 text-right font-bold">Price/Ltr</th>
              <th className="border border-gray-400 p-1 text-right font-bold">Amount</th>
              <th className="border border-gray-400 p-1 w-5"></th>
            </tr>
          </thead>
          <tbody>
            {piItems.map((item, i) => (
              <tr key={item.id || i}>
                <td className="border border-gray-400 p-0"><input value={item.product_name} onChange={(e) => updateItem(i, "product_name", e.target.value)} className={ic} /></td>
                <td className="border border-gray-400 p-0"><input value={item.packages_description} onChange={(e) => updateItem(i, "packages_description", e.target.value)} className={ic} /></td>
                <td className="border border-gray-400 p-0"><input value={item.description_of_goods} onChange={(e) => updateItem(i, "description_of_goods", e.target.value)} className={ic} /></td>
                <td className="border border-gray-400 p-0"><input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={icr} /></td>
                <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className={icr} /></td>
                <td className="border border-gray-400 p-0"><input type="number" value={((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)) || ""} readOnly className={icr + " font-medium bg-gray-50"} /></td>
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

        {/* Total */}
        <table className="w-full border-collapse text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="text-right font-bold p-1">Total</td>
              <td className="text-right font-bold p-1 w-28 border border-gray-400">{total.toLocaleString()}</td>
            </tr>
            <tr>
              <td colSpan="2" className="text-center p-1 border border-gray-400">
                <span className="font-bold">Amount Chargeable : </span>
                <input
                  value={piForm.amount_in_words || ""}
                  onChange={(e) => setPiForm({ ...piForm, amount_in_words: e.target.value })}
                  placeholder={`${piForm.currency || "USD"} ${total.toLocaleString()}`}
                  className="border-0 outline-none bg-transparent text-[10px] font-bold text-center w-64 focus:bg-yellow-50"
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── BANK DETAILS left | SEAL + SIGN right (matching template) ── */}
        <div className="flex items-start gap-6 mb-3 text-[10px]">
          <div className="flex-1">
            <b>Bank Details</b>
            <textarea value={piForm.bank_details || ""} onChange={(e) => setPiForm({ ...piForm, bank_details: e.target.value })} rows={4} className="w-full mt-1 px-1 py-1 text-[10px] border border-gray-300 rounded outline-none font-mono" />
          </div>
          <div className="text-center flex flex-col items-center" style={{ minWidth: "180px" }}>
            <p className="font-bold text-[10px] mb-1">For Kriya Biosys Private Limited</p>
            <div className="flex items-end gap-1">
              <img src="/seal.png" alt="Seal" style={{ height: "55px" }} />
              <img src="/sign.png" alt="Signature" style={{ height: "35px" }} />
            </div>
            <p className="text-[9px] mt-1">Authorized Signatory</p>
          </div>
        </div>

        {/* ── DECLARATION ── */}
        <div className="text-center text-[9px] border-t border-gray-300 pt-2">
          <p><b>Declaration :</b> We declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct <b>E. & O.E</b></p>
          <p className="mt-1 italic" style={{ color: "#4a7c2e" }}>" Go Organic ! Save Planet ! "</p>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
          <div className="flex gap-2">
            <button onClick={onSave} className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">Save Draft</button>
            <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Preview PDF</button>
            <button onClick={onSend} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {sending ? "Sending..." : "Send PI"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
