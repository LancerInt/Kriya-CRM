"use client";
import { useEffect, useRef } from "react";
import Modal from "@/components/ui/Modal";

/**
 * Editable Quotation — Kriya Biosys Quotation template.
 * All fields are editable. Clearing a field keeps it empty (no snap-back).
 */
export default function QuotationEditorModal({ open, onClose, qt, qtForm, setQtForm, qtItems, setQtItems, onSave, onSend, onPreview, sending }) {
  const initialized = useRef(null);

  // Set all default values into state on first open — so they exist as real strings
  useEffect(() => {
    if (!open || !qt || initialized.current === qt.id) return;
    initialized.current = qt.id;

    const d = {};

    // Restore saved display_overrides (custom labels, consignee, footer) from backend
    if (qt.display_overrides && typeof qt.display_overrides === 'object') {
      Object.entries(qt.display_overrides).forEach(([k, v]) => {
        if (qtForm[k] === undefined || qtForm[k] === null) d[k] = v;
      });
    }

    // Consignee from client (only if not already in display_overrides)
    if (qt.client_address && d._consignee_line1 === undefined && qtForm._consignee_line1 === undefined) d._consignee_line1 = qt.client_address;
    if ((qt.client_city || qt.client_state || qt.client_postal_code) && qtForm._consignee_line2 === undefined) {
      d._consignee_line2 = [qt.client_postal_code, qt.client_city, qt.client_state].filter(Boolean).join(', ');
    }
    if (qt.client_country && qtForm._consignee_line3 === undefined) d._consignee_line3 = qt.client_country;
    if (qt.client_phone && qtForm._consignee_phone === undefined) d._consignee_phone = "Phone: " + qt.client_phone;

    // All editable label/text defaults
    const defs = {
      _lbl_exporter: "Exporter", _lbl_consignee: "Consignee",
      _lbl_quote_number: "Quote Number", _lbl_date: "Date",
      _sl1: "Country of Origin", _sl2: "Country of Final Dest.",
      _sl3: "Port of Loading", _sl4: "Port of Discharge",
      _sl5: "Vessel / Flight No", _sl6: "Final Destination",
      _sl7: "Terms of Trade", _sl8: "Terms of Delivery",
      _terms_text: "The Quotation is not a contract or a bill it is our best at the total price for the service and goods described above. The Customer will be billed after indicating acceptance of this quote.",
      _delivery_note: "15 Days from P.O",
      _footer1: "Expecting Your Business !",
      _footer2: "If you have any questions please contact info@kriya.ltd",
      _footer3: "\" Go Organic ! Save Planet ! \"",
    };
    Object.entries(defs).forEach(([k, v]) => {
      if (qtForm[k] === undefined || qtForm[k] === null) d[k] = v;
    });

    if (Object.keys(d).length > 0) setQtForm(prev => ({ ...prev, ...d }));
  }, [open, qt]);

  if (!open || !qt) return null;

  const bkFont = "'Bookman Old Style', 'URW Bookman', 'Bookman', Georgia, serif";
  const ic = "border-0 outline-none bg-transparent w-full focus:bg-yellow-50 hover:bg-yellow-50/50 px-1";
  const icr = ic + " text-right";

  // CRITICAL: Use ?? "" (not ||) so empty string "" stays empty and does NOT revert to default
  const g = (key) => (qtForm[key] !== undefined && qtForm[key] !== null) ? qtForm[key] : "";
  const set = (key, val) => setQtForm({ ...qtForm, [key]: val });

  const calcAmount = (item) => {
    const qty = parseFloat(item.quantity);
    const price = parseFloat(item.unit_price);
    if (!qty || !price) return null;
    return qty * price;
  };

  const validAmounts = qtItems.map(calcAmount).filter(v => v !== null);
  const total = validAmounts.length > 0 ? validAmounts.reduce((s, v) => s + v, 0) : null;

  const updateItem = (i, field, value) => {
    const items = [...qtItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].total_price = qty * price;
    }
    setQtItems(items);
  };

  const addItem = () => setQtItems([...qtItems, {
    id: `new-${Date.now()}`, product_name: "", client_product_name: "", description: "",
    quantity: "", unit: "KG", unit_price: "", total_price: 0
  }]);
  const removeItem = (i) => setQtItems(qtItems.filter((_, idx) => idx !== i));

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div className="bg-white" style={{ fontFamily: bkFont, fontSize: "14px", lineHeight: "1.4" }}>

        <style>{`@font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Bold.ttf') format('truetype'); font-weight: bold; } @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Regular.ttf') format('truetype'); font-weight: normal; }`}</style>

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: "#558b2f", minWidth: "170px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "30px", fontWeight: "normal", fontFamily: "'Montserrat', sans-serif" }}>QUOTATION</span>
          </div>
        </div>

        {/* ── EXPORTER / CONSIGNEE / QUOTE # ── */}
        <table className="w-full border-collapse border border-gray-400 text-sm mb-2">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%] bg-gray-100"><input value={g("_lbl_exporter")} onChange={(e) => set("_lbl_exporter", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1 font-bold w-[40%] bg-gray-100"><input value={g("_lbl_consignee")} onChange={(e) => set("_lbl_consignee", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1 font-bold w-[25%] bg-gray-200"><input value={g("_lbl_quote_number")} onChange={(e) => set("_lbl_quote_number", e.target.value)} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1"><input value={g("client_name")} onChange={(e) => set("client_name", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-1"><input value={g("quotation_number")} onChange={(e) => set("quotation_number", e.target.value)} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Aarthi Nagar, Mohan Nagar,</td>
              <td className="border border-gray-400 p-1"><input value={g("_consignee_line1")} onChange={(e) => set("_consignee_line1", e.target.value)} placeholder="Attend : Contact Name" className={ic} /></td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Narasothipatti, Tamilnadu</td>
              <td className="border border-gray-400 p-1"><input value={g("_consignee_line2")} onChange={(e) => set("_consignee_line2", e.target.value)} placeholder="Address" className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004</td>
              <td className="border border-gray-400 p-1"><input value={g("_consignee_line3")} onChange={(e) => set("_consignee_line3", e.target.value)} placeholder="City, State, Pincode" className={ic} /></td>
              <td className="border border-gray-400 p-1 font-bold bg-gray-200"><input value={g("_lbl_date")} onChange={(e) => set("_lbl_date", e.target.value)} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Contact : +91 6385848466</td>
              <td className="border border-gray-400 p-1"><input value={g("_consignee_line4")} onChange={(e) => set("_consignee_line4", e.target.value)} placeholder="Country" className={ic} /></td>
              <td className="border border-gray-400 p-1"><input type="date" value={g("_quote_date") || (qt.created_at ? qt.created_at.slice(0,10) : "")} onChange={(e) => set("_quote_date", e.target.value)} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Email : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1"><input value={g("_consignee_phone")} onChange={(e) => set("_consignee_phone", e.target.value)} placeholder="Phone" className={ic} /></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
          </tbody>
        </table>

        {/* ── SHIPMENT DETAILS ── */}
        <div className="font-bold text-white text-sm px-2 py-1 mb-1" style={{ backgroundColor: "#558b2f" }}>SHIPMENT DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-sm mb-3">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><input value={g("_sl1")} onChange={(e) => set("_sl1", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={g("country_of_origin")} onChange={(e) => set("country_of_origin", e.target.value)} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold w-[20%]"><input value={g("_sl2")} onChange={(e) => set("_sl2", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0 w-[30%]"><input value={g("country_of_final_destination")} onChange={(e) => set("country_of_final_destination", e.target.value)} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl3")} onChange={(e) => set("_sl3", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("port_of_loading")} onChange={(e) => set("port_of_loading", e.target.value)} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl4")} onChange={(e) => set("_sl4", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("port_of_discharge")} onChange={(e) => set("port_of_discharge", e.target.value)} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl5")} onChange={(e) => set("_sl5", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("vessel_flight_no")} onChange={(e) => set("vessel_flight_no", e.target.value)} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl6")} onChange={(e) => set("_sl6", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("final_destination")} onChange={(e) => set("final_destination", e.target.value)} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl7")} onChange={(e) => set("_sl7", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("payment_terms_detail")} onChange={(e) => set("payment_terms_detail", e.target.value)} className={ic} /></td>
              <td className="border border-gray-400 p-0 font-bold"><input value={g("_sl8")} onChange={(e) => set("_sl8", e.target.value)} className={ic + " font-bold"} /></td>
              <td className="border border-gray-400 p-0"><input value={g("delivery_terms")} onChange={(e) => set("delivery_terms", e.target.value)} className={ic} /></td>
            </tr>
          </tbody>
        </table>

        {/* ── PACKING DETAILS TABLE ── */}
        <div className="text-right text-lg font-light mb-1" style={{ color: "#999" }}>PACKING DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-sm mb-1">
          <thead>
            <tr style={{ backgroundColor: "#558b2f" }}>
              <th className="border border-gray-400 p-1 text-left text-white text-sm">Product Name</th>
              <th className="border border-gray-400 p-1 text-left text-white text-sm">Product Details</th>
              <th className="border border-gray-400 p-1 text-right text-white text-sm w-20">Quantity</th>
              <th className="border border-gray-400 p-1 text-right text-white text-sm w-24">Price</th>
              <th className="border border-gray-400 p-1 text-right text-white text-sm w-28">Amount</th>
              <th className="border border-gray-400 p-1 w-5"></th>
            </tr>
          </thead>
          <tbody>
            {qtItems.map((item, i) => {
              const amt = calcAmount(item);
              return (
                <tr key={item.id || i}>
                  <td className="border border-gray-400 p-0"><input value={item.product_name} onChange={(e) => updateItem(i, "product_name", e.target.value)} className={ic} placeholder="Company product name" /></td>
                  <td className="border border-gray-400 p-0"><input value={item.client_product_name != null ? item.client_product_name : ""} onChange={(e) => updateItem(i, "client_product_name", e.target.value)} className={ic} placeholder="Client's name for this product" /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={parseFloat(item.quantity) ? item.quantity : ""} onChange={(e) => updateItem(i, "quantity", e.target.value)} placeholder="-.--" className={icr + " w-20"} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={parseFloat(item.unit_price) ? item.unit_price : ""} onChange={(e) => updateItem(i, "unit_price", e.target.value)} placeholder="-.--" className={icr + " w-24"} /></td>
                  <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{amt !== null ? amt.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-.--"}</td>
                  <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="6" className="border border-gray-400 p-1">
                <button onClick={addItem} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Total */}
        <table className="w-full border-collapse text-sm mb-3">
          <tbody>
            <tr>
              <td className="text-right font-bold p-1" style={{ color: "#558b2f" }}>Total</td>
              <td className="text-right font-bold p-1 w-28" style={{ color: "#558b2f" }}>{total !== null ? `$ ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-.--"}</td>
            </tr>
          </tbody>
        </table>

        {/* ── TERMS + SEAL/SIGN ── */}
        <div className="flex items-start gap-6 mb-3 text-sm">
          <div className="flex-1">
            <textarea value={g("_terms_text")} onChange={(e) => set("_terms_text", e.target.value)} className="w-full border border-gray-200 rounded outline-none bg-transparent text-sm italic text-gray-600 mb-2 px-1 py-1 focus:bg-yellow-50 resize-none" rows={3} />
            <p className="text-sm mb-1">This Quote is Valid for <input type="number" value={qtForm.validity_days != null ? qtForm.validity_days : 30} onChange={(e) => set("validity_days", e.target.value)} className="border border-gray-200 rounded w-12 text-center outline-none px-1 focus:bg-yellow-50" /> Days</p>
            <p className="text-sm"><span className="font-bold">Suit Start Date :</span> <input value={g("_delivery_note")} onChange={(e) => set("_delivery_note", e.target.value)} className="border-0 outline-none bg-transparent focus:bg-yellow-50 w-40" /></p>
          </div>
          <div className="text-center flex flex-col items-center" style={{ minWidth: "180px" }}>
            <p className="font-bold text-sm mb-1">For Kriya Biosys Private Limited</p>
            <div className="flex items-end gap-1">
              <img src="/seal.png" alt="Seal" style={{ height: "55px" }} />
              <img src="/sign.png" alt="Signature" style={{ height: "35px" }} />
            </div>
            <p className="text-sm mt-1">Authorised Signature</p>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="text-center text-sm border-t border-gray-300 pt-2">
          <input value={g("_footer1")} onChange={(e) => set("_footer1", e.target.value)} className="font-bold mb-1 text-center w-full border-0 outline-none bg-transparent focus:bg-yellow-50" />
          <div className="py-1 px-2 text-white text-sm mb-1" style={{ backgroundColor: "#558b2f" }}>
            <input value={g("_footer2")} onChange={(e) => set("_footer2", e.target.value)} className="text-center w-full border-0 outline-none bg-transparent text-white focus:bg-green-800" />
          </div>
          <input value={g("_footer3")} onChange={(e) => set("_footer3", e.target.value)} className="italic text-center w-full border-0 outline-none bg-transparent focus:bg-yellow-50" style={{ color: "#558b2f" }} />
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
          <div className="flex gap-2">
            <button onClick={onSave} className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">Save Draft</button>
            <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Preview PDF</button>
            <button onClick={onSend} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {sending ? "Sending..." : "Send Quotation"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
