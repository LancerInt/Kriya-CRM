"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

// Unicode subscript / superscript character maps
const SUP_MAP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ' };
const SUB_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
const toUnicode = (text, map) => text.split('').map(c => map[c.toLowerCase()] || c).join('');

/**
 * Editable Quotation — Kriya Biosys Quotation template.
 * All fields are editable. Clearing a field keeps it empty (no snap-back).
 */
export default function QuotationEditorModal({ open, onClose, qt, qtForm, setQtForm, qtItems, setQtItems, onSave, onSend, onPreview, sending, sendLabel }) {
  const initialized = useRef(null);
  const tableRef = useRef(null);
  const editorRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [clientPriceList, setClientPriceList] = useState([]);
  const [scriptMode, setScriptMode] = useState(null); // null | 'sub' | 'sup'

  // ── Subscript / Superscript toolbar handler ──
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

  // Intercept keystrokes to convert characters in real-time when scriptMode is active
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

  // Auto-resize all textareas in the items table whenever items change
  // (e.g. after save-with-items returns and replaces qtItems). Without this,
  // textareas reset to rows=1 but the content may have newlines, so the
  // extra lines overflow hidden.
  useEffect(() => {
    if (!tableRef.current) return;
    const textareas = tableRef.current.querySelectorAll("textarea");
    textareas.forEach((ta) => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    });
  }, [qtItems, open]);
  const [logoSrc, setLogoSrc] = useState("/logo.png");
  const [sealSrc, setSealSrc] = useState("/seal.png");
  const [signSrc, setSignSrc] = useState("/sign.png");
  const [showLogo, setShowLogo] = useState(true);
  const [showSeal, setShowSeal] = useState(true);
  const [showSign, setShowSign] = useState(true);

  const handleImageReplace = (setter) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) setter(URL.createObjectURL(file));
    };
    input.click();
  };

  // Fetch products for price auto-populate
  useEffect(() => {
    if (open && products.length === 0) {
      api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
    }
    // Fetch this client's price list — used to auto-fill price for the specific client
    if (open && qt?.client) {
      api.get(`/clients/price-list/?client=${qt.client}`)
        .then((r) => setClientPriceList(r.data.results || r.data || []))
        .catch(() => setClientPriceList([]));
    }
    // Restore image state from display_overrides or reset to defaults
    if (open && qtForm) {
      const ov = qtForm.display_overrides || qtForm || {};
      setShowLogo(ov._hide_logo !== true);
      setShowSeal(ov._hide_seal !== true);
      setShowSign(ov._hide_sign !== true);
      setLogoSrc(ov._custom_logo || "/logo.png");
      setSealSrc(ov._custom_seal || "/seal.png");
      setSignSrc(ov._custom_sign || "/sign.png");
    }
  }, [open]);

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

    // Consignee — always populate from fresh client data
    d._consignee_line1 = qt.client_primary_contact ? `Attend : ${qt.client_primary_contact}` : '';
    d._consignee_line2 = qt.client_address || '';
    d._consignee_line3 = [qt.client_city, qt.client_state, qt.client_postal_code].filter(Boolean).join(', ');
    d._consignee_line4 = qt.client_country || '';
    const phone = qt.client_phone || qt.client_contact_phone || '';
    d._consignee_phone = phone ? `Phone: ${phone}` : '';

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
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    if (qty && price) return qty * price;
    if (price && !qty) return price; // show price as amount when no quantity
    if (item.total_price && parseFloat(item.total_price) > 0) return parseFloat(item.total_price);
    return null;
  };

  const validAmounts = qtItems.map(calcAmount).filter(v => v !== null);
  const total = validAmounts.length > 0 ? validAmounts.reduce((s, v) => s + v, 0) : null;

  // Look up a price for a product name. Priority:
  //   1) This client's price list (ClientPriceList) — client-specific pricing
  //   2) Products tab base_price — global fallback
  const _findProductPrice = (productName) => {
    if (!productName) return null;
    const nameLower = productName.toLowerCase();
    // 1) client-specific price list
    const cp = clientPriceList.find((p) => (p.product_name || "").toLowerCase() === nameLower);
    if (cp) return { price: cp.unit_price, unit: cp.unit, currency: cp.currency };
    // 2) global product master
    if (products.length === 0) return null;
    const match = products.find((p) => {
      const full = `${p.name}${p.concentration ? ` (${p.concentration})` : ""}`.toLowerCase();
      return full === nameLower || p.name.toLowerCase() === nameLower;
    });
    return match ? { price: match.base_price, unit: match.unit } : null;
  };

  const updateItem = (i, field, value) => {
    const items = [...qtItems];
    items[i] = { ...items[i], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = parseFloat(field === "quantity" ? value : items[i].quantity) || 0;
      const price = parseFloat(field === "unit_price" ? value : items[i].unit_price) || 0;
      items[i].total_price = qty * price;
    }
    // Auto-populate price from client price list / product master when product_name changes
    // Only fills empty fields — never overwrites a manual entry
    if (field === "product_name") {
      const match = _findProductPrice(value);
      if (match && !parseFloat(items[i].unit_price)) {
        items[i].unit_price = match.price;
        items[i].unit = match.unit || items[i].unit;
        const qty = parseFloat(items[i].quantity) || 0;
        items[i].total_price = qty * parseFloat(match.price);
      }
      // Auto-fill the client's name for this product from the client price list
      if (!items[i].client_product_name) {
        const cp = clientPriceList.find((p) => (p.product_name || "").toLowerCase() === value.toLowerCase());
        if (cp && cp.client_product_name) items[i].client_product_name = cp.client_product_name;
      }
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
      <div ref={editorRef} className="bg-white" style={{ fontFamily: bkFont, fontSize: "14px", lineHeight: "1.4" }}>

        <style>{`@font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Bold.ttf') format('truetype'); font-weight: bold; } @font-face { font-family: 'Montserrat'; src: url('/fonts/Montserrat-Regular.ttf') format('truetype'); font-weight: normal; }`}</style>

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
          <div>
            {showLogo ? (
              <div className="relative group inline-block">
                <img src={logoSrc} alt="Kriya" style={{ height: "50px", width: "auto" }} />
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  <button type="button" onClick={() => handleImageReplace(setLogoSrc)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace">↺</button>
                  <button type="button" onClick={() => setShowLogo(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove">×</button>
                </div>
              </div>
            ) : (
              <label className="w-16 h-14 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setLogoSrc(URL.createObjectURL(f)); setShowLogo(true); } }}>
                <span className="text-lg text-gray-400">+</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { setLogoSrc(URL.createObjectURL(f)); setShowLogo(true); } }} />
              </label>
            )}
            {qt.version > 1 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">Version {qt.version}</span>
                {qt.parent_number && <span className="text-xs text-gray-400">Revised from {qt.parent_number}</span>}
              </div>
            )}
          </div>
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
        <table ref={tableRef} className="w-full border-collapse border border-gray-400 text-sm mb-1">
          <thead>
            <tr style={{ backgroundColor: "#558b2f" }}>
              <th className="border border-gray-400 p-1 text-left text-white text-sm">Product Name</th>
              <th className="border border-gray-400 p-1 text-left text-white text-sm">Product Details</th>
              <th className="border border-gray-400 p-1 text-right text-white text-sm w-20">Quantity</th>
              <th className="border border-gray-400 p-1 text-center text-white text-sm w-16">UOM</th>
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
                  <td className="border border-gray-400 p-0">
                    <textarea
                      value={item.product_name}
                      onChange={(e) => updateItem(i, "product_name", e.target.value)}
                      className={ic + " resize-none overflow-hidden"}
                      placeholder="-"
                      rows={1}
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    />
                  </td>
                  <td className="border border-gray-400 p-0">
                    <textarea
                      value={item.client_product_name != null ? item.client_product_name : ""}
                      onChange={(e) => updateItem(i, "client_product_name", e.target.value)}
                      className={ic + " resize-none overflow-hidden"}
                      placeholder="-"
                      rows={1}
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    />
                  </td>
                  <td className="border border-gray-400 p-0">
                    <textarea
                      value={parseFloat(item.quantity) ? item.quantity : ""}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      placeholder="-"
                      className={icr + " w-20 resize-none overflow-hidden"}
                      rows={1}
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    />
                  </td>
                  <td className="border border-gray-400 p-0">
                    <textarea
                      value={item.unit || ""}
                      onChange={(e) => updateItem(i, "unit", e.target.value)}
                      className={ic + " text-center w-16 resize-none overflow-hidden"}
                      placeholder="KG"
                      rows={1}
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    />
                  </td>
                  <td className="border border-gray-400 p-0">
                    <textarea
                      value={parseFloat(item.unit_price) ? item.unit_price : ""}
                      onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                      placeholder="-"
                      className={icr + " w-24 resize-none overflow-hidden"}
                      rows={1}
                      onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                    />
                  </td>
                  <td className="border border-gray-400 p-0 text-right px-1 font-medium bg-gray-50">{amt !== null ? amt.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "-"}</td>
                  <td className="border border-gray-400 p-0 text-center"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">&times;</button></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="7" className="border border-gray-400 p-1">
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
              <td className="text-right font-bold p-1 w-28" style={{ color: "#558b2f" }}>{total !== null ? `$ ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>
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
            <div className="flex items-end gap-2">
              {showSeal ? (
                <div className="relative group inline-block">
                  <img src={sealSrc} alt="Seal" style={{ height: "55px" }} />
                  <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                    <button type="button" onClick={() => handleImageReplace(setSealSrc)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace">↺</button>
                    <button type="button" onClick={() => setShowSeal(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove">×</button>
                  </div>
                </div>
              ) : (
                <label className="w-14 h-10 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setSealSrc(URL.createObjectURL(f)); setShowSeal(true); } }}>
                  <span className="text-lg text-gray-400">+</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { setSealSrc(URL.createObjectURL(f)); setShowSeal(true); } }} />
                </label>
              )}
              {showSign ? (
                <div className="relative group inline-block">
                  <img src={signSrc} alt="Signature" style={{ height: "35px" }} />
                  <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                    <button type="button" onClick={() => handleImageReplace(setSignSrc)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace">↺</button>
                    <button type="button" onClick={() => setShowSign(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove">×</button>
                  </div>
                </div>
              ) : (
                <label className="w-14 h-10 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setSignSrc(URL.createObjectURL(f)); setShowSign(true); } }}>
                  <span className="text-lg text-gray-400">+</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { setSignSrc(URL.createObjectURL(f)); setShowSign(true); } }} />
                </label>
              )}
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
            <button onClick={() => {
              // Persist image visibility/custom sources into display_overrides before saving
              setQtForm(prev => ({
                ...prev,
                _hide_logo: !showLogo, _hide_seal: !showSeal, _hide_sign: !showSign,
                _custom_logo: logoSrc !== "/logo.png" ? logoSrc : undefined,
                _custom_seal: sealSrc !== "/seal.png" ? sealSrc : undefined,
                _custom_sign: signSrc !== "/sign.png" ? signSrc : undefined,
              }));
              setTimeout(() => onSave(), 50);
            }} className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">Save Draft</button>
            <button onClick={onPreview} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Preview PDF</button>
            <button onClick={onSend} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {sending ? "Working..." : (sendLabel || "Send Quotation")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
