"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import useResponsiveZoom from "@/lib/useResponsiveZoom";

const SUP_MAP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ' };
const SUB_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
const toUnicode = (text, map) => text.split('').map(c => map[c.toLowerCase()] || c).join('');

/**
 * Editable Commercial Invoice — Kriya Biosys CI template.
 * New design: Exporter/Notify + Consignee block + Shipment with Bank Details +
 * Packing table (USD+INR) + Discount/SubTotal/GST/Grand Total + Additional Details.
 * ALL existing calculation logic is PRESERVED.
 */
export default function CIEditorModal({ open, onClose, ci, ciForm, setCiForm, ciItems, setCiItems, onSave, onGeneratePdf, generating, template = "normal", setTemplate }) {
  const tpl = template || "normal";
  const setTpl = setTemplate || (() => {});
  const showNotify = tpl === "notify" || tpl === "buyer";
  const showBuyer = tpl === "buyer";
  const editorRef = useRef(null);
  const ciTableRef = useRef(null);
  // Mobile: zoom the desktop A4 layout to fit the viewport.
  const zoomStyle = useResponsiveZoom();
  const [scriptMode, setScriptMode] = useState(null);

  // Auto-resize all textareas when items change (after save/preview re-render)
  useEffect(() => {
    if (!ciTableRef.current) return;
    const textareas = ciTableRef.current.querySelectorAll("textarea");
    textareas.forEach((ta) => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    });
  }, [ciItems, open]);

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

  // Sync auto-generated amount in words to ciForm so it gets saved
  useEffect(() => {
    if (!open || !ci) return;
    const totalUsd_ = ciItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0);
    const rate_ = parseFloat(ciForm.exchange_rate) || 0;
    const freight_ = parseFloat(ciForm.freight) || 0;
    const insurance_ = parseFloat(ciForm.insurance) || 0;
    const totalInvInr_ = (totalUsd_ + freight_ + insurance_) * rate_;
    const igstRate_ = parseFloat(ciForm.igst_rate) || 0;
    const igstAmount_ = totalInvInr_ * igstRate_ / 100;
    const discMode_ = ciForm._ci_discount_mode || 'usd';
    const discInput_ = parseFloat(ciForm._ci_discount_usd) || 0;
    const discUsd_ = discMode_ === 'percent' ? (totalUsd_ * discInput_ / 100) : discInput_;
    const discInr_ = discUsd_ * rate_;
    const grandUsd_ = totalUsd_ + freight_ + insurance_ - discUsd_;
    if (grandUsd_ > 0) {
      const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const cv = (n) => { if(n<20)return ones[n]; if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:''); if(n<1000)return ones[Math.floor(n/100)]+' Hundred'+(n%100?' and '+cv(n%100):''); if(n<100000)return cv(Math.floor(n/1000))+' Thousand'+(n%1000?' '+cv(n%1000):''); if(n<10000000)return cv(Math.floor(n/100000))+' Lakh'+(n%100000?' '+cv(n%100000):''); return cv(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+cv(n%10000000):''); };
      const words = `USD ${cv(Math.round(grandUsd_))} Dollars Only`;
      if (words !== ciForm.amount_in_words) {
        setCiForm(prev => ({ ...prev, amount_in_words: words }));
      }
    }
  }, [open, ci, ciItems, ciForm.exchange_rate, ciForm.freight, ciForm.insurance, ciForm.igst_rate, ciForm._ci_discount_usd, ciForm._ci_discount_mode]);

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

  // ── Discount (supports % or flat USD) + Sub Total for INR side ──
  const discountMode = ciForm._ci_discount_mode || 'usd'; // 'usd' or 'percent'
  const discountInput = parseFloat(ciForm._ci_discount_usd) || 0;
  const discountUsd = discountMode === 'percent' ? (totalUsd * discountInput / 100) : discountInput;
  const discountInr = discountUsd * rate;
  const subTotalInr = totalInvInr;
  const finalGrandTotalInr = grandTotalInr - discountInr;

  // Auto-generate amount in words for INR
  const _numToWords = (num) => {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const convert = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
      if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' and ' + convert(n%100) : '');
      if (n < 100000) return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + convert(n%1000) : '');
      if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + convert(n%100000) : '');
      return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + convert(n%10000000) : '');
    };
    return convert(Math.floor(num));
  };
  const grandTotalUsd = totalUsd - discountUsd;
  const autoAmountWords = grandTotalUsd > 0 ? `USD ${_numToWords(Math.round(grandTotalUsd))} Dollars Only` : '';

  // (amount sync moved before early return)

  // Tab inside a cell textarea inserts a real tab character
  const handleCellKeyDown = (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue = ta.value.substring(0, start) + "\t" + ta.value.substring(end);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, newValue);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
    }
  };

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
    return new Promise((resolve) => {
      setTimeout(async () => {
        try { await onSave?.(); } catch {}
        resolve();
      }, 50);
    });
  };

  const G = "#558b2f";

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      {/* Mobile: CSS `zoom` scales the desktop A4 layout to fit the viewport. */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
      <div ref={editorRef} className="bg-white" style={{ fontFamily: "'Bookman Old Style', Georgia, serif", fontSize: "11px", lineHeight: "1.4", ...zoomStyle }}>

        {/* ── SUBSCRIPT / SUPERSCRIPT TOOLBAR ── */}
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-gray-200">
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
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">Template:</span>
            {[
              { k: "normal", l: "Normal" },
              { k: "notify", l: "With Notify" },
              { k: "buyer", l: "With Buyer" },
            ].map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setTpl(opt.k)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${tpl === opt.k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:bg-indigo-50 hover:border-indigo-300"}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between mb-3">
          <img src="/logo.png" alt="Kriya" style={{ height: "50px", width: "auto" }} />
          <div className="flex items-center justify-center px-6 py-4" style={{ backgroundColor: G, minWidth: "190px" }}>
            <span className="text-white text-center leading-tight" style={{ fontSize: "20px", fontWeight: "normal", fontFamily: "'Montserrat', sans-serif" }}>INVOICE</span>
          </div>
        </div>

        {/* ── EXPORTER + (CONSIGNEE | NOTIFY | BUYER) + INVOICE # ──
            normal: Exporter | Consignee (multi-line) | Invoice#
            notify: Exporter | Notify  (multi-line) | Invoice#   → Consignee below (multi-field)
            buyer:  Exporter | Buyer   (multi-line) | Invoice#   → Notify | Consignee below */}
        <table className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-1 font-bold w-[35%] bg-gray-100">Exporter</td>
              <td className="border border-gray-400 p-1 font-bold w-[40%] bg-gray-100">
                {showBuyer ? "Buyer" : showNotify ? "Notify" : "Consignee"}
              </td>
              <td className="border border-gray-400 p-1 font-bold w-[25%] bg-gray-200">Invoice Number</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1 font-bold">KRIYA BIOSYS PRIVATE LIMITED</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_company_name: e.target.value })} className={ic + " font-bold"} placeholder="Buyer company name" />
                ) : showNotify ? (
                  <input value={ciForm.notify_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, notify_company_name: e.target.value })} className={ic + " font-bold"} placeholder="Notify party name" />
                ) : (
                  <input value={ciForm.client_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, client_company_name: e.target.value })} className={ic + " font-bold"} placeholder="Consignee company name" />
                )}
              </td>
              <td className="border border-gray-400 p-1"><input value={ciForm.invoice_number || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_number: e.target.value })} className={ic + " font-bold"} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">D.no : 233, Aarthi Nagar,</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_address || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_address: e.target.value })} placeholder="Buyer address" className={ic} />
                ) : showNotify ? (
                  <input value={ciForm.notify_address || ""} onChange={(e) => setCiForm({ ...ciForm, notify_address: e.target.value })} placeholder="Address" className={ic} />
                ) : (
                  <input value={ciForm.client_address || ""} onChange={(e) => setCiForm({ ...ciForm, client_address: e.target.value })} placeholder="Address line 1" className={ic} />
                )}
              </td>
              <td className="border border-gray-400 p-1" rowSpan="2"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Mohan Nagar, Narasothipatti,</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_city_state_country: e.target.value })} placeholder="City, State" className={ic} />
                ) : showNotify ? (
                  <input value={ciForm.notify_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, notify_city_state_country: e.target.value })} placeholder="City, State" className={ic} />
                ) : (
                  <input value={ciForm.client_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, client_city_state_country: e.target.value })} placeholder="City, State" className={ic} />
                )}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Salem - 636004, Tamilnadu</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_pincode: e.target.value })} placeholder="Pincode, Country" className={ic} />
                ) : showNotify ? (
                  <input value={ciForm.notify_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, notify_pincode: e.target.value })} placeholder="Pincode, Country" className={ic} />
                ) : (
                  <input value={ciForm.client_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, client_pincode: e.target.value })} placeholder="Pincode, Country" className={ic} />
                )}
              </td>
              <td className="border border-gray-400 p-1 font-bold bg-gray-200">Date</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Contact : +91 6385848466</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_reference || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_reference: e.target.value })} placeholder="REF: S26-10052 / PO 00135" className={ic} />
                ) : showNotify ? (
                  <input value={ciForm.notify_tax_number || ""} onChange={(e) => setCiForm({ ...ciForm, notify_tax_number: e.target.value })} placeholder="PIN / VAT / Tax No." className={ic} />
                ) : (
                  <input value={ciForm.client_phone || ""} onChange={(e) => setCiForm({ ...ciForm, client_phone: e.target.value })} placeholder="Phone" className={ic} />
                )}
              </td>
              <td className="border border-gray-400 p-1"><input type="date" value={ciForm.invoice_date || ""} onChange={(e) => setCiForm({ ...ciForm, invoice_date: e.target.value })} className={ic} /></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">Email : info@kriya.ltd</td>
              <td className="border border-gray-400 p-1">
                {showBuyer ? (
                  <input value={ciForm.buyer_phone || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_phone: e.target.value })} placeholder="Buyer phone" className={ic} />
                ) : showNotify ? (
                  <input value={ciForm.notify_email || ""} onChange={(e) => setCiForm({ ...ciForm, notify_email: e.target.value })} placeholder="Email" className={ic} />
                ) : (
                  <input value={ciForm.client_tax_number || ""} onChange={(e) => setCiForm({ ...ciForm, client_tax_number: e.target.value })} placeholder="PIN / VAT / Tax No." className={ic} />
                )}
              </td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">GSTIN : 33AAHCK9695F1Z3</td>
              <td className="border border-gray-400 p-1">
                {showNotify && !showBuyer && (
                  <input value={ciForm.notify_phone || ""} onChange={(e) => setCiForm({ ...ciForm, notify_phone: e.target.value })} placeholder="Phone" className={ic} />
                )}
                {!showBuyer && !showNotify && (
                  <input value={ciForm.client_email || ""} onChange={(e) => setCiForm({ ...ciForm, client_email: e.target.value })} placeholder="Email" className={ic} />
                )}
              </td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-1">IEC : AAHCK9695F</td>
              <td className="border border-gray-400 p-1"></td>
              <td className="border border-gray-400 p-1"></td>
            </tr>
          </tbody>
        </table>

        {/* ── CONSIGNEE / NOTIFY-row ──
            normal: Consignee already lives in the top table — skip.
            notify: Consignee block below with multiple editable fields.
            buyer:  split row — Notify (left) | Consignee (right). */}
        {showBuyer ? (() => {
          // X-to-remove for optional rows. Persisted in display_overrides so
          // the PDF can honour the same hides.
          const ov = ciForm.display_overrides || {};
          const isHidden = (k) => !!ov[`_hide_${k}`];
          const setHidden = (k, val, alsoClearKey = null) => {
            const next = { ...(ciForm.display_overrides || {}), [`_hide_${k}`]: val };
            const updates = { display_overrides: next };
            if (val && alsoClearKey) updates[alsoClearKey] = "";
            setCiForm({ ...ciForm, ...updates });
          };
          const RowInput = ({ valueKey, placeholder, bold, optional, hideKey }) => {
            if (optional && isHidden(hideKey)) return null;
            return (
              <div className="flex items-center gap-1 mb-1">
                <input
                  value={ciForm[valueKey] || ""}
                  onChange={(e) => setCiForm({ ...ciForm, [valueKey]: e.target.value })}
                  placeholder={placeholder}
                  className={ic + (bold ? " font-bold" : "")}
                />
                {optional && (
                  <button
                    type="button"
                    onClick={() => setHidden(hideKey, true, valueKey)}
                    title="Remove this field"
                    className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            );
          };
          // Helper to re-show a previously hidden row (chip)
          const HiddenChip = ({ hideKey, label }) => {
            if (!isHidden(hideKey)) return null;
            return (
              <button
                type="button"
                onClick={() => setHidden(hideKey, false)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 mb-1 mr-1"
              >
                + {label}
              </button>
            );
          };
          return (
            <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
              <tbody>
                <tr>
                  <td className="border border-gray-400 p-1 font-bold bg-gray-100 w-1/2">Notify</td>
                  <td className="border border-gray-400 p-1 font-bold bg-gray-100 w-1/2">Consignee</td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-1 align-top">
                    <RowInput valueKey="notify_company_name" placeholder="Company name" bold />
                    <RowInput valueKey="notify_address" placeholder="Company address" />
                    <RowInput valueKey="notify_city_state_country" placeholder="City, State, Country" />
                    <RowInput valueKey="notify_pincode" placeholder="CEP" optional hideKey="notify_cep" />
                    <RowInput valueKey="notify_tax_number" placeholder="Tax / CNPJ" />
                    <RowInput valueKey="notify_phone" placeholder="Phone" />
                    <RowInput valueKey="notify_mobile" placeholder="Mobile" optional hideKey="notify_mobile" />
                    <RowInput valueKey="notify_email" placeholder="Email" />
                    <div className="flex flex-wrap mt-1">
                      <HiddenChip hideKey="notify_cep" label="CEP" />
                      <HiddenChip hideKey="notify_mobile" label="Mobile" />
                    </div>
                  </td>
                  <td className="border border-gray-400 p-1 align-top">
                    <RowInput valueKey="client_company_name" placeholder="Company name" bold />
                    <RowInput valueKey="client_address" placeholder="Company address" />
                    <RowInput valueKey="client_city_state_country" placeholder="City, State, Country" />
                    <RowInput valueKey="client_pincode" placeholder="CEP" optional hideKey="client_cep" />
                    <RowInput valueKey="client_tax_number" placeholder="CNPJ / Tax" />
                    <div className="flex flex-wrap mt-1">
                      <HiddenChip hideKey="client_cep" label="CEP" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          );
        })() : showNotify ? (
          <table className="w-full border-collapse border border-gray-400 text-[10px] mb-2">
            <tbody>
              <tr>
                <td className="border border-gray-400 p-1 font-bold bg-gray-100">Consignee</td>
              </tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_company_name || ""} onChange={(e) => setCiForm({ ...ciForm, client_company_name: e.target.value })} placeholder="Consignee company name" className={ic + " font-bold"} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_address || ""} onChange={(e) => setCiForm({ ...ciForm, client_address: e.target.value })} placeholder="Address line 1" className={ic} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_city_state_country || ""} onChange={(e) => setCiForm({ ...ciForm, client_city_state_country: e.target.value })} placeholder="City, State" className={ic} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_pincode || ""} onChange={(e) => setCiForm({ ...ciForm, client_pincode: e.target.value })} placeholder="Pincode, Country" className={ic} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_tax_number || ""} onChange={(e) => setCiForm({ ...ciForm, client_tax_number: e.target.value })} placeholder="PIN / VAT / Tax No." className={ic} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_email || ""} onChange={(e) => setCiForm({ ...ciForm, client_email: e.target.value })} placeholder="Email" className={ic} /></td></tr>
              <tr><td className="border border-gray-400 p-1"><input value={ciForm.client_phone || ""} onChange={(e) => setCiForm({ ...ciForm, client_phone: e.target.value })} placeholder="Phone" className={ic} /></td></tr>
            </tbody>
          </table>
        ) : null}

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
                  <td className="border border-gray-400 p-0"><input value={ciForm.terms_of_trade ?? ciForm.payment_terms ?? ""} onChange={(e) => setCiForm({ ...ciForm, terms_of_trade: e.target.value, payment_terms: e.target.value })} placeholder='e.g. "50% advance D/A 60 days"' className={ic} /></td>
                </tr>
                <tr>
                  <td className="border border-gray-400 p-0 font-bold"><span className="px-1">Buyer Reference</span></td>
                  <td className="border border-gray-400 p-0"><input value={ciForm.buyer_order_no || ""} onChange={(e) => setCiForm({ ...ciForm, buyer_order_no: e.target.value })} className={ic} /></td>
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
                { label: "ICICI INR", name: "ICICI Bank Ltd", branch: "Salem Main Branch", beneficiary: "Kriya Biosys Private Limited", ifsc: "ICIC0006119", swift: "ICICINBBCTS", ac: "611905057914", type: "CA Account" },
                { label: "ICICI USD", name: "ICICI Bank Ltd", branch: "Salem Main Branch", beneficiary: "Kriya Biosys Private Limited", ifsc: "ICIC0006119", swift: "ICICINBBCTS", ac: "611906000027", type: "CA Account" },
                { label: "DBS INR", name: "DBS Bank India Limited", branch: "Salem - India", beneficiary: "Kriya Biosys Private Limited", ifsc: "DBSS0IN0832", swift: "DBSSINBB", ac: "832210073820", type: "CA Account" },
                { label: "DBS USD", name: "DBS Bank India Limited", branch: "Salem - India", beneficiary: "Kriya Biosys Private Limited", ifsc: "DBSS0IN0832", swift: "DBSSINBB", ac: "832250073848", type: "CA Account" },
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
        <table ref={ciTableRef} className="w-full border-collapse border border-gray-400 text-[10px] mb-1">
          <thead>
            <tr style={{ backgroundColor: G }}>
              <th className="border border-gray-400 p-1 text-center text-white text-[9px]" style={{ width: "12%" }}>Product Details</th>
              <th className="border border-gray-400 p-1 text-center text-white text-[9px]" style={{ width: "25%" }}>No. & Kind of Packages</th>
              <th className="border border-gray-400 p-1 text-center text-white text-[9px]" style={{ width: "22%" }}>Description of Goods</th>
              <th className="border border-gray-400 p-1 text-center text-white text-[9px]" style={{ width: "10%" }}>Quantity</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]" style={{ width: "13%" }}>Price/Ltr</th>
              <th className="border border-gray-400 p-1 text-right text-white text-[9px]" style={{ width: "17%" }}>Amount</th>
              <th className="border border-gray-400 p-1 w-5"></th>
            </tr>
          </thead>
          <tbody>
            {ciItems.map((item, i) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              return (
                <tr key={item.id || i}>
                  <td className="border border-gray-400 p-0 align-top"><textarea rows={1} value={item.product_name} onChange={(e) => updateItem(i, "product_name", e.target.value)} onKeyDown={handleCellKeyDown} className={ic + " resize-none overflow-hidden whitespace-pre-wrap break-words py-1 font-sans font-bold"} onInput={(e) => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }} /></td>
                  <td className="border border-gray-400 p-0 align-top"><textarea rows={1} value={item.packages_description} onChange={(e) => updateItem(i, "packages_description", e.target.value)} onKeyDown={handleCellKeyDown} className={ic + " resize-none overflow-hidden whitespace-pre-wrap break-words py-1 font-sans"} onInput={(e) => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }} /></td>
                  <td className="border border-gray-400 p-0 align-top"><textarea rows={1} value={item.description_of_goods} onChange={(e) => updateItem(i, "description_of_goods", e.target.value)} onKeyDown={handleCellKeyDown} className={ic + " resize-none overflow-hidden whitespace-pre-wrap break-words py-1 font-sans"} onInput={(e) => { e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={icr} /></td>
                  <td className="border border-gray-400 p-0"><input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className={icr} /></td>
                  <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{lineTotal ? `$ ${lineTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}` : "$ 0.00"}</td>
                  <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="7" className="border border-gray-400 p-1">
                <button onClick={addItem} className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium">+ Add Item</button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FINANCIAL BREAKDOWN (right-aligned) ── */}
        <div className="flex justify-end mb-2">
          <table className="border-collapse text-[10px]" style={{ width: "250px" }}>
            <tbody>
              {discountUsd > 0 && (
              <tr>
                <td className="text-right font-bold p-1 border border-gray-300">
                  Discount
                  <div className="inline-flex ml-1 gap-0.5">
                    <button type="button" onClick={() => setCiForm({ ...ciForm, _ci_discount_mode: 'usd' })} className={`px-1 py-0 text-[8px] rounded ${discountMode === 'usd' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>USD</button>
                    <button type="button" onClick={() => setCiForm({ ...ciForm, _ci_discount_mode: 'percent' })} className={`px-1 py-0 text-[8px] rounded ${discountMode === 'percent' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>%</button>
                  </div>
                </td>
                <td className="text-right p-1 border border-gray-300">
                  <input type="number" step="0.01" value={ciForm._ci_discount_usd || ""} onChange={(e) => setCiForm({ ...ciForm, _ci_discount_usd: e.target.value })} placeholder={discountMode === 'percent' ? '0 %' : '0.00'} className={icr + " w-24"} />
                  {discountMode === 'percent' && discountUsd > 0 && <div className="text-[8px] text-gray-400">$ {discountUsd.toFixed(2)}</div>}
                </td>
              </tr>
              )}
              <tr style={{ backgroundColor: "#f0fdf4" }}>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: G }}>Grand Total</td>
                <td className="text-right font-bold p-1 border border-gray-300" style={{ color: G }}>$ {(totalUsd - discountUsd).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Amount in Words ── */}
        <div className="p-2 border border-gray-400 mb-3 text-[10px]" style={{ backgroundColor: "#dce9d0" }}>
          <input
            value={`Amount In Words : ${autoAmountWords || ciForm.amount_in_words || ""}`}
            onChange={(e) => { const v = e.target.value.replace(/^Amount In Words\s*:\s*/i, ''); setCiForm({ ...ciForm, amount_in_words: v }); }}
            placeholder="Amount In Words : Rupees zero Only"
            className="border-0 outline-none bg-transparent text-[10px] font-bold w-full text-center focus:bg-yellow-50"
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
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
          <button onClick={handleSaveWithTotals} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Save</button>
          <button
            onClick={async () => {
              await handleSaveWithTotals();
              await onGeneratePdf?.(tpl);
            }}
            disabled={generating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? "Generating..." : `Save & Generate PDF (${tpl === "normal" ? "Normal" : tpl === "notify" ? "With Notify" : "With Buyer"})`}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
        </div>
      </div>
      </div>
    </Modal>
  );
}
