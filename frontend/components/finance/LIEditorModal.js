"use client";
import Modal from "@/components/ui/Modal";

export default function LIEditorModal({ open, onClose, li, liForm, setLiForm, liItems, setLiItems, onSave, onSend, onPreview, sending }) {
  if (!open || !li) return null;

  const ic = "border-0 outline-none bg-transparent text-xs w-full focus:bg-yellow-50 hover:bg-yellow-50/50 px-1";
  const icr = ic + " text-right";

  // Calculations
  const totalUsd = liItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);
  const rate = parseFloat(liForm.exchange_rate) || 0;
  const freight = parseFloat(liForm.freight) || 0;
  const insurance = parseFloat(liForm.insurance) || 0;
  const discount = parseFloat(liForm.discount) || 0;
  const discountInr = discount * rate;
  const subUsd = totalUsd;
  const subInr = subUsd * rate;
  const igstRate = parseFloat(liForm.igst_rate) || 0;
  const igstAmount = (subInr + (freight * rate) + (insurance * rate)) * igstRate / 100;
  const grandTotalInr = subInr + (freight * rate) + (insurance * rate) + igstAmount - discountInr;

  const updateItem = (i, field, value) => {
    const items = [...liItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].amount_usd = qty * price;
      items[i].amount_inr = (qty * price) * rate;
    }
    setLiItems(items);
  };

  const addItem = () => setLiItems([...liItems, {
    id: `new-${Date.now()}`, product_name: "", packages_description: "",
    description_of_goods: "", quantity: "", unit: "Kg", unit_price: "", amount_usd: 0, amount_inr: 0,
  }]);
  const removeItem = (i) => setLiItems(liItems.filter((_, idx) => idx !== i));

  const handleSaveWithTotals = () => {
    setLiForm(prev => ({
      ...prev,
      total_fob_usd: totalUsd,
      subtotal_usd: subUsd,
      subtotal_inr: subInr,
      igst_amount: igstAmount,
      grand_total_inr: grandTotalInr,
    }));
    setTimeout(() => onSave(), 50);
  };

  const G = "#4F7F2A";

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      <div className="bg-white" style={{ fontFamily: "'Bookman Old Style', Georgia, serif" }}>
        {/* HEADER: Logo + INVOICE box */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px" }} onError={(e) => { e.target.style.display = "none"; }} />
          <div className="text-right">
            <div className="px-8 py-3 text-white text-xl font-bold" style={{ background: G, fontFamily: "Montserrat, sans-serif" }}>
              INVOICE
            </div>
          </div>
        </div>

        {/* EXPORTER + NOTIFY + INVOICE NO/DATE */}
        <table className="w-full border-collapse border border-gray-400 text-xs mb-2">
          <tbody>
            <tr className="bg-gray-200">
              <td className="border border-gray-400 px-2 py-1 font-bold w-2/5">Exporter</td>
              <td className="border border-gray-400 px-2 py-1 font-bold w-2/5">Notify</td>
              <td className="border border-gray-400 px-2 py-1 font-bold text-center w-1/5">Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 px-2 py-1">
                <input value={liForm.notify_company_name || liForm.client_company_name || ""} onChange={e => setLiForm({ ...liForm, notify_company_name: e.target.value })} className={ic} />
              </td>
              <td className="border border-gray-400 px-2 py-1 text-center">{li.invoice_number}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 px-2 py-0.5">
                <input value={liForm.notify_address || liForm.client_address || ""} onChange={e => setLiForm({ ...liForm, notify_address: e.target.value })} className={ic} />
              </td>
              <td className="border border-gray-400 px-2 py-0.5 text-center font-bold bg-gray-200">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 px-2 py-0.5">
                <input value={liForm.client_city_state_country || ""} onChange={e => setLiForm({ ...liForm, client_city_state_country: e.target.value })} className={ic} />
              </td>
              <td className="border border-gray-400 px-2 py-0.5 text-center">
                <input type="date" value={liForm.invoice_date || ""} onChange={e => setLiForm({ ...liForm, invoice_date: e.target.value })} className={ic + " text-center"} />
              </td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 px-2 py-0.5">
                <input value={liForm.client_tax_number || ""} onChange={e => setLiForm({ ...liForm, client_tax_number: e.target.value })} placeholder="Tax ID" className={ic} />
              </td>
              <td className="border border-gray-400" rowSpan={3}></td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">Contact : +91 6385848466</td>
              <td className="border border-gray-400 px-2 py-0.5">
                <input value={liForm.notify_phone || liForm.client_phone || ""} onChange={e => setLiForm({ ...liForm, notify_phone: e.target.value })} placeholder="Phone" className={ic} />
              </td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">Email : info@kriya.ltd</td>
              <td className="border border-gray-400 px-2 py-0.5"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400" colSpan={2}></td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-0.5">IEC : AAHCK9695F</td>
              <td className="border border-gray-400" colSpan={2}></td>
            </tr>
          </tbody>
        </table>

        {/* CONSIGNEE */}
        <table className="border-collapse border border-gray-400 text-xs mb-2" style={{ width: "60%" }}>
          <tbody>
            <tr className="bg-gray-200">
              <td className="border border-gray-400 px-2 py-1 font-bold">Consignee</td>
            </tr>
            <tr>
              <td className="border border-gray-400 px-2 py-1">
                <input value={liForm._consignee_text || `To the Order ${liForm.country_of_final_destination || ""}`} onChange={e => setLiForm({ ...liForm, _consignee_text: e.target.value })} className={ic} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* SHIPMENT DETAILS + BANK DETAILS */}
        <div className="flex gap-0 mb-2">
          {/* Green sidebar */}
          <div className="flex items-center justify-center text-white text-xs font-bold px-1" style={{ background: G, writingMode: "vertical-rl", transform: "rotate(180deg)", minWidth: "22px", fontFamily: "Montserrat, sans-serif" }}>
            SHIPMENT DETAILS
          </div>
          <table className="flex-1 border-collapse border border-gray-400 text-xs">
            <tbody>
              {[
                ["Country of Origin", "country_of_origin", "Bank Details", null],
                ["Port of Loading", "port_of_loading", "Bank Name", "Bank name"],
                ["Vessel / Flight No", "vessel_flight_no", "Branch name", "Branch name"],
                ["Port of Discharge", "port_of_discharge", "Beneficiary", "Beneficiary"],
                ["Country of Final Dest.", "country_of_final_destination", "IFSC Code", "IFSC Code"],
                ["Incoterms", "terms_of_delivery", "Swift Code", "Swift Code"],
                ["Terms of Trade", "payment_terms", "A/C No.", "A/C No"],
                ["Buyer Reference", "buyer_reference", "A/C Type", "A/C Type"],
                ["Exchange Rate per USD", "exchange_rate", null, null],
              ].map(([sLabel, sField, bLabel, bKey], i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1 font-bold text-blue-900 w-1/4">{sLabel}</td>
                  <td className="border border-gray-300 px-2 py-1 w-1/4">
                    <input value={liForm[sField] || ""} onChange={e => setLiForm({ ...liForm, [sField]: e.target.value })} className={ic} />
                  </td>
                  {bLabel ? (
                    <>
                      <td className="border border-gray-300 px-2 py-1 font-bold text-blue-900 w-1/4">{bLabel}</td>
                      <td className="border border-gray-300 px-2 py-1 w-1/4">
                        {bKey ? `: ${(liForm.bank_details || "").split("\n").find(l => l.toLowerCase().includes(bKey.toLowerCase()))?.split(":").slice(1).join(":").trim() || ""}` : ""}
                      </td>
                    </>
                  ) : (
                    <td className="border border-gray-300" colSpan={2}></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PACKING DETAILS */}
        <div className="text-right text-gray-400 text-lg mb-1" style={{ fontFamily: "Arial, sans-serif" }}>PACKING DETAILS</div>
        <table className="w-full border-collapse border border-gray-400 text-xs mb-2">
          <thead>
            <tr style={{ background: G }}>
              {["Product Name", "No. & Kind of Packages", "Product Details", "Quantity", "Price/Kg", "Amount in USD", "Amount in INR"].map((h, i) => (
                <th key={i} className="border border-gray-400 px-2 py-1.5 text-white text-left" style={{ fontFamily: "'Bookman Old Style', Georgia, serif" }}>{h}</th>
              ))}
              <th className="border border-gray-400 px-1 py-1 text-white w-6"></th>
            </tr>
          </thead>
          <tbody>
            {liItems.map((item, i) => {
              const qty = parseFloat(item.quantity) || 0;
              const price = parseFloat(item.unit_price) || 0;
              const usd = qty * price;
              const inr = usd * rate;
              return (
                <tr key={item.id || i}>
                  <td className="border border-gray-300 px-1 py-0.5"><input value={item.product_name} onChange={e => updateItem(i, "product_name", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-300 px-1 py-0.5"><input value={item.packages_description} onChange={e => updateItem(i, "packages_description", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-300 px-1 py-0.5"><input value={item.description_of_goods} onChange={e => updateItem(i, "description_of_goods", e.target.value)} className={ic} /></td>
                  <td className="border border-gray-300 px-1 py-0.5 text-center">
                    <input value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} className={ic + " text-center"} style={{ width: "40px" }} />
                    <input value={item.unit} onChange={e => updateItem(i, "unit", e.target.value)} className={ic + " text-center"} style={{ width: "30px" }} />
                  </td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right"><input value={item.unit_price} onChange={e => updateItem(i, "unit_price", e.target.value)} className={icr} style={{ width: "60px" }} /></td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right font-semibold">${usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-right">{rate ? `Rs.${inr.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>
                  <td className="border border-gray-300 px-1 py-0.5 text-center">
                    <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 text-sm">&times;</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={addItem} className="text-xs text-green-700 hover:text-green-900 font-medium mb-2">+ Add Item</button>

        {/* TOTALS */}
        <div className="flex justify-end mb-2">
          <table className="text-xs border-collapse" style={{ width: "50%" }}>
            <tbody>
              <tr>
                <td className="px-2 py-1 text-right font-bold">Discount</td>
                <td className="px-2 py-1 text-right">
                  <input value={liForm.discount || ""} onChange={e => setLiForm({ ...liForm, discount: e.target.value })} className={icr} placeholder="0" style={{ width: "80px" }} />
                </td>
                <td className="px-2 py-1 text-right">Rs.{discountInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-right font-bold">Sub Total</td>
                <td className="px-2 py-1 text-right">${subUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-1 text-right">{rate ? `Rs.${subInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-right font-bold">
                  GST <input value={liForm.igst_rate || ""} onChange={e => setLiForm({ ...liForm, igst_rate: e.target.value })} className={icr} placeholder="%" style={{ width: "30px" }} />%
                </td>
                <td className="px-2 py-1"></td>
                <td className="px-2 py-1 text-right">{rate ? `Rs.${igstAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>
              </tr>
              <tr className="border-t-2" style={{ borderColor: G }}>
                <td className="px-2 py-1 text-right font-bold" style={{ color: G }}>Grand Total</td>
                <td className="px-2 py-1"></td>
                <td className="px-2 py-1 text-right font-bold" style={{ color: G }}>{rate ? `Rs.${grandTotalInr.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ADDITIONAL DETAILS */}
        <div className="text-xs mb-2">
          <p className="font-bold underline mb-1">Additional Details</p>
          <p><b>FOB</b> - ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} &nbsp; <b>Shipping &amp; Forwarding</b> - !</p>
        </div>

        {/* AMOUNT IN WORDS */}
        <div className="text-xs font-bold text-center py-2 mb-2 rounded" style={{ background: "#dce9d0" }}>
          Amount In Words : <input value={liForm.amount_in_words || ""} onChange={e => setLiForm({ ...liForm, amount_in_words: e.target.value })} className="bg-transparent border-0 outline-none text-center w-3/4" placeholder="Enter amount in words" />
        </div>

        {/* DECLARATION + SIGNATURE */}
        <div className="flex justify-between text-xs mb-2">
          <div className="w-1/2">
            <p className="font-bold">Declaration :</p>
            <p className="text-gray-700">We Declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct</p>
            <p className="font-bold mt-1">E. & O.E</p>
          </div>
          <div className="w-1/3 text-center">
            <p className="font-bold mb-1">For Kriya Biosys Private Limited</p>
            <div className="flex justify-center gap-1 my-2">
              <img src="/seal.png" alt="" className="h-12" onError={e => e.target.style.display = "none"} />
              <img src="/sign.png" alt="" className="h-8" onError={e => e.target.style.display = "none"} />
            </div>
            <p>Authorised Signature</p>
          </div>
        </div>

        {/* FOOTER */}
        <p className="text-center text-xs font-bold text-gray-600 border-t border-gray-300 pt-2">" Go Organic ! Save Planet ! "</p>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mt-4 pt-3 border-t border-gray-200">
          <button onClick={handleSaveWithTotals} className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700">Save</button>
          <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Preview PDF</button>
          <button onClick={onSend} disabled={sending} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">{sending ? "Sending..." : "Send Email"}</button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}
