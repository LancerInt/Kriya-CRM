"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";

/**
 * Editable Commercial Invoice — Kriya Biosys CI template.
 * Includes: Exporter / Consignee / Notify Party / Shipment Details /
 * Packing Table / Dual Currency Totals / IGST / Grand Total / Bank Details.
 */
export default function CIEditorModal({ open, onClose, ci, ciForm, setCiForm, ciItems, setCiItems, onSave, onSend, onPreview, sending }) {
  if (!open || !ci) return null;

  const ic = "border-0 outline-none bg-transparent text-xs w-full focus:bg-yellow-50 hover:bg-yellow-50/50 px-1";
  const icr = ic + " text-right";

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

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div className="bg-white" style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", lineHeight: "1.4" }}>

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: "#4a7c2e", minWidth: "190px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "20px", fontWeight: "600" }}>INVOICE</span>
          </div>
        </div>

        {/* ── EXPORTER / CONSIGNEE / INVOICE # ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%]">Exporter</td>
              <td className="border border-gray-400 p-1 font-bold w-[40%]">Consignee</td>
              <td className="border border-gray-400 p-1 font-bold w-[25%]">Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, client_company_name: e.target.value })} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1"><input value={ciForm.invoice_number || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_number: e.target.value })} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_tax_number || ""} onChange={(e) => setCiForm({ ...ciForm, client_tax_number: e.target.value })} placeholder="Client tax number" className={ic} /></td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_address || ""} onChange={(e) => setCiForm({ ...ciForm, client_address: e.target.value })} placeholder="Client address" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, client_pincode: e.target.value })} placeholder="Pincode" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, client_city_state_country: e.target.value })} placeholder="City, State, Country" className={ic} /></td>
              <td className="border border-gray-400 p-1"><input type="date" value={ciForm.invoice_date || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_date: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">EMAIL : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1"><input value={ciForm.client_phone || ""} onChange={(e) => setCiForm({ ...ciForm, client_phone: e.target.value })} placeholder="Client phone" className={ic} /></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">IEC : AAHCK9695F</td>
              <td className="border border-gray-400 p-1" colSpan="2"></td>
            </tr>
          </tbody>
        </table>

        {/* ── NOTIFY PARTY ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold bg-gray-100" colSpan="2">Notify Party</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 w-1/2"><input value={ciForm.notify_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, notify_company_name: e.target.value })} placeholder="Company name" className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1 w-1/2"><input value={ciForm.notify_phone || ""} onChange={(e) => setCiForm({ ...ciForm, notify_phone: e.target.value })} placeholder="Phone" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1" colSpan="2"><input value={ciForm.notify_address || ""} onChange={(e) => setCiForm({ ...ciForm, notify_address: e.target.value })} placeholder="Address" className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── BUYER ORDER + EXPORTER REF ── */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 w-1/3"><span className="font-bold">Buyer Order No:</span> <input value={ciForm.buyer_order_no || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_order_no: e.target.value })} className={ic + " inline w-24"} /></td>
              <td className="border border-gray-400 p-1 w-1/3"><span className="font-bold">Date:</span> <input type="date" value={ciForm.buyer_order_date || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_order_date: e.target.value })} className={ic + " inline w-32"} /></td>
              <td className="border border-gray-400 p-1 w-1/3"><span className="font-bold">Exporter Ref:</span> <input value={ciForm.exporter_ref || ""} onChange={(e) => setCiForm({ ...ciForm, exporter_ref: e.target.value })} className={ic + " inline w-28"} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── SHIPMENT DETAILS ── */}
        <div className="font-bold text-white text-[10px] px-2 py-1 mb-1" style={{ backgroundColor: "#4a7c2e" }}>
          SHIPMENT / LOADING DETAILS
        </div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-3">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><span className="px-1">Country of Origin</span></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={ciForm.country_of_origin || ""} onChange={(e) => setCiForm({ ...ciForm, country_of_origin: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><span className="px-1">Country of Final Dest.</span></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={ciForm.country_of_final_destination || ""} onChange={(e) => setCiForm({ ...ciForm, country_of_final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Loading</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.port_of_loading || ""} onChange={(e) => setCiForm({ ...ciForm, port_of_loading: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Port of Discharge</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.port_of_discharge || ""} onChange={(e) => setCiForm({ ...ciForm, port_of_discharge: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Vessel / Flight No</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.vessel_flight_no || ""} onChange={(e) => setCiForm({ ...ciForm, vessel_flight_no: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Final Destination</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.final_destination || ""} onChange={(e) => setCiForm({ ...ciForm, final_destination: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Pre-Carriage By</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.pre_carriage_by || ""} onChange={(e) => setCiForm({ ...ciForm, pre_carriage_by: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Place of Receipt</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.place_of_receipt || ""} onChange={(e) => setCiForm({ ...ciForm, place_of_receipt: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Terms of Delivery</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.terms_of_delivery || ""} onChange={(e) => setCiForm({ ...ciForm, terms_of_delivery: e.target.value })} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Payment Terms</span></td>
              <td className="border border-gray-400 p-0"><input value={ciForm.payment_terms || ""} onChange={(e) => setCiForm({ ...ciForm, payment_terms: e.target.value })} className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── PACKING / GOODS TABLE ── */}
        <div className="text-right text-lg font-light mb-1" style={{ color: "#999" }}>DESCRIPTION OF GOODS</div>
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 p-1 text-left text-[9px]">Product Details</th>
              <th className="border border-gray-400 p-1 text-left text-[9px]">No. & Kind of Packages</th>
              <th className="border border-gray-400 p-1 text-left text-[9px]">Description of Goods</th>
              <th className="border border-gray-400 p-1 text-center text-[9px]">HSN</th>
              <th className="border border-gray-400 p-1 text-right text-[9px]">Qty</th>
              <th className="border border-gray-400 p-1 text-right text-[9px]">Rate</th>
              <th className="border border-gray-400 p-1 text-right text-[9px]">Amount ({ciForm.currency || "USD"})</th>
              <th className="border border-gray-400 p-1 text-right text-[9px]">Amount (INR)</th>
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
                  <td className="border border-gray-400 p-0"><input value={item.hsn_code || ""} onChange={(e) => updateItem(i, "hsn_code", e.target.value)} className={ic + " text-center w-16"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={icr + " w-16"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className={icr + " w-20"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={lineTotal || ""} readOnly className={icr + " font-medium bg-gray-50 w-20"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={lineInr ? lineInr.toFixed(2) : ""} readOnly className={icr + " font-medium bg-gray-50 w-20"} /></td>
                  <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="9" className="border border-gray-400 p-1">
                <button onClick={addItem} className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── TOTALS (Dual Currency) ── */}
        <div className="flex justify-end mb-1">
          <div className="w-80">
            <div className="flex items-center gap-1 mb-1 text-[10px]">
              <span className="font-bold w-28">Exchange Rate:</span>
              <span className="text-gray-500">1 {ciForm.currency || "USD"} =</span>
              <input type="number" step="0.0001" value={ciForm.exchange_rate || ""} onChange={(e) => setCiForm({ ...ciForm, exchange_rate: e.target.value })} className="border border-gray-300 rounded px-1 py-0.5 text-xs w-20 outline-none" />
              <span className="text-gray-500">INR</span>
            </div>
            <table className="w-full border-collapse border border-gray-300 text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1 text-left"></th>
                  <th className="border border-gray-300 p-1 text-right">{ciForm.currency || "USD"}</th>
                  <th className="border border-gray-300 p-1 text-right">INR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-1 font-bold">Total FOB</td>
                  <td className="border border-gray-300 p-1 text-right">{totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-1 text-right">{rate ? totalFobInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-1">Freight <input type="number" step="0.01" value={ciForm.freight || ""} onChange={(e) => setCiForm({ ...ciForm, freight: e.target.value })} className="border border-gray-200 rounded px-1 py-0 text-xs w-20 ml-1 outline-none" /></td>
                  <td className="border border-gray-300 p-1 text-right">{freight.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-1 text-right">{rate ? freightInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-1">Insurance <input type="number" step="0.01" value={ciForm.insurance || ""} onChange={(e) => setCiForm({ ...ciForm, insurance: e.target.value })} className="border border-gray-200 rounded px-1 py-0 text-xs w-20 ml-1 outline-none" /></td>
                  <td className="border border-gray-300 p-1 text-right">{insurance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-1 text-right">{rate ? insuranceInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
                <tr className="font-bold" style={{ color: "#4a7c2e" }}>
                  <td className="border border-gray-300 p-1">Total Invoice</td>
                  <td className="border border-gray-300 p-1 text-right">{totalInvUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-1 text-right">{rate ? totalInvInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
              </tbody>
            </table>

            {/* IGST */}
            <table className="w-full border-collapse border border-gray-300 text-[10px] mt-1">
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-1">IGST @ <input type="number" step="0.01" value={ciForm.igst_rate || ""} onChange={(e) => setCiForm({ ...ciForm, igst_rate: e.target.value })} className="border border-gray-200 rounded px-1 py-0 text-xs w-12 outline-none" /> %</td>
                  <td className="border border-gray-300 p-1 text-right w-24">{rate ? igstAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
                <tr className="font-bold text-[11px]" style={{ color: "#4a7c2e" }}>
                  <td className="border border-gray-300 p-1">Grand Total (INR)</td>
                  <td className="border border-gray-300 p-1 text-right">{rate ? grandTotalInr.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amount Chargeable */}
        <div className="text-center p-1 border border-gray-400 mb-3 text-[10px]" style={{ backgroundColor: "#dce9d0" }}>
          <span className="font-bold">Amount Chargeable : </span>
          <input
            value={ciForm.amount_in_words || ""}
            onChange={(e) => setCiForm({ ...ciForm, amount_in_words: e.target.value })}
            placeholder={`${ciForm.currency || "USD"} ${totalInvUsd.toLocaleString()}`}
            className="border-0 outline-none bg-transparent text-[10px] font-bold text-center w-72 focus:bg-yellow-50"
          />
        </div>

        {/* ── BANK DETAILS + SEAL/SIGN ── */}
        <div className="flex items-start gap-6 mb-3 text-[10px]">
          <div className="flex-1">
            <b>Bank Details</b>
            <textarea value={ciForm.bank_details || ""} onChange={(e) => setCiForm({ ...ciForm, bank_details: e.target.value })} rows={4} className="w-full mt-1 px-1 py-1 text-[10px] border border-gray-300 rounded outline-none font-mono" />
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
