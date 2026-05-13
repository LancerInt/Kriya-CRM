"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

/**
 * COA Editor with Excel-like dynamic rows.
 * Both Product Details and Test Results sections support:
 *  - Add row (at bottom, above, or below any row)
 *  - Delete row
 *  - All cells editable
 *
 * Report number format: KB/YYMM/SEQ (e.g. KB/2604/001)
 * Auto-generated on open, editable, sequence consumed only on generate/send.
 */
export default function COAEditorModal({ open, onClose, onGenerate, productName, clientName, initialData, onStateChange, docsMode, generating }) {
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  const defaultForm = { report_no: "", date: new Date().toISOString().split("T")[0], checked_by: "Technical Manager" };
  const defaultDetailRows = [
    { label: "Product Name", value: productName || "" },
    { label: "Sample Description", value: "" },
    { label: "Manufacturing Date", value: "" },
    { label: "Expiration Date", value: "" },
    { label: "Date of Receipt of Sample", value: "" },
    { label: "Date of Start of Analysis", value: "" },
    { label: "Date of Completion of Analysis", value: "" },
  ];
  // The first 5 are constant. Per-product component rows are appended
  // below them from the selected Company Product's quality_spec — each one
  // is validated against its acceptable_max.
  const STANDARD_TEST_ROWS = [
    { label: "Appearance", value: "" },
    { label: "Odour", value: "" },
    { label: "pH", value: "" },
    { label: "Specific Gravity", value: "" },
    { label: "Solubility", value: "" },
  ];

  const [form, setForm] = useState(defaultForm);
  const [detailRows, setDetailRows] = useState(defaultDetailRows);
  const [testRows, setTestRows] = useState(STANDARD_TEST_ROWS);
  // The product's quality spec (components + acceptable_max), fetched
  // from /products/ once productName is known.
  const [productSpec, setProductSpec] = useState(null);

  // Restore saved editor state when modal opens
  useEffect(() => {
    if (open && initialData) {
      if (initialData.form) setForm(initialData.form);
      if (initialData.detailRows) setDetailRows(initialData.detailRows);
      if (initialData.testRows) setTestRows(initialData.testRows);
    } else if (open) {
      // Reset to defaults when no saved state
      setForm(defaultForm);
      setDetailRows(defaultDetailRows);
      setTestRows(STANDARD_TEST_ROWS);
    }
  }, [open]);

  // Auto-populate the next report number when modal opens (only if no saved report_no)
  useEffect(() => {
    if (open && !initialData?.form?.report_no) {
      api.get("/quality/coa-next-report-number/")
        .then((r) => {
          setForm(prev => ({ ...prev, report_no: r.data.report_number || prev.report_no }));
        })
        .catch(() => {});
    }
  }, [open]);

  // Notify parent of state changes for draft persistence
  useEffect(() => {
    if (open && onStateChange) {
      onStateChange({ form, detailRows, testRows });
    }
  }, [form, detailRows, testRows, open]);

  useEffect(() => {
    if (open && productName && !initialData) {
      setDetailRows(prev => {
        const rows = [...prev];
        if (rows[0] && !rows[0].value) rows[0] = { ...rows[0], value: productName };
        return rows;
      });
    }
  }, [open, productName]);

  // Look up the selected Company Product to pull its quality_spec.
  // The spec drives the per-component validation rows at the bottom of the
  // Test Result table (one row per component, each with an acceptable_max).
  useEffect(() => {
    if (!open || !productName?.trim()) { setProductSpec(null); return; }
    let cancelled = false;
    api.get("/products/", { params: { page_size: 5000 } })
      .then((r) => {
        if (cancelled) return;
        const all = r.data.results || r.data || [];
        // Match by exact name (case-insensitive). If product was concentration-
        // suffixed like "Neem Oil 0.3%", strip the suffix for the lookup.
        const wanted = productName.trim().toLowerCase();
        const match = all.find((p) => (p.name || "").toLowerCase() === wanted)
                   || all.find((p) => wanted.startsWith((p.name || "").toLowerCase()));
        setProductSpec(match?.quality_spec?.components?.length ? match.quality_spec : null);
      })
      .catch(() => setProductSpec(null));
    return () => { cancelled = true; };
  }, [open, productName]);

  // When a fresh spec arrives (and the user hasn't already edited the test
  // table beyond the standard 5 rows), append the component rows.
  useEffect(() => {
    if (!open || !productSpec) return;
    setTestRows((prev) => {
      // Strip any old component rows so swapping products doesn't pile them up.
      const baseRows = prev.filter((r) => !r._isComponent);
      const componentRows = productSpec.components.map((c) => ({
        label: c.name + (c.unit ? ` (${c.unit})` : ""),
        value: "",
        _isComponent: true,
        _standard: c.standard,
        _acceptableMax: c.acceptable_max,
        _unit: c.unit || "",
      }));
      // Only inject if not already present (avoid double-injection on re-renders).
      const alreadyInjected = componentRows.every((cr) =>
        baseRows.some((br) => br.label === cr.label && br._isComponent)
      );
      if (alreadyInjected) return prev;
      return [...baseRows, ...componentRows];
    });
  }, [open, productSpec]);

  // Validation helper — extracts a number from the entered value and checks
  // against the row's acceptable_max.
  //
  // Rule (from the user): value ≤ acceptable_max is ACCEPTED (= boundary
  // included). Anything strictly greater than the max is REJECTED, even
  // by 0.001. We add a tiny EPSILON tolerance so floating-point noise
  // (e.g. 1.25 stored as 1.249999999) can't reject an equal-to value.
  const EPSILON = 1e-6;
  const validateComponentValue = (row, value) => {
    const m = String(value || "").trim().match(/[-+]?\d*\.?\d+/);
    if (!m) return { state: "empty" };
    const num = parseFloat(m[0]);
    if (Number.isNaN(num)) return { state: "empty" };
    const max = parseFloat(row._acceptableMax);
    if (Number.isNaN(max)) return { state: "ok" };
    // Strictly greater than max (with epsilon tolerance) → invalid.
    if (num - max > EPSILON) {
      return {
        state: "invalid",
        message: `${num}${row._unit} exceeds the acceptable max of ${max}${row._unit}. Standard: ${row._standard}${row._unit}.`,
      };
    }
    return { state: "ok" };
  };

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Row helpers
  const updateRow = (setter, idx, field, value) => {
    setter(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addRowAt = (setter, idx) => {
    setter(prev => [...prev.slice(0, idx + 1), { label: "", value: "" }, ...prev.slice(idx + 1)]);
  };
  const addRowTop = (setter) => {
    setter(prev => [{ label: "", value: "" }, ...prev]);
  };
  const removeRow = (setter, idx) => {
    setter(prev => prev.filter((_, i) => i !== idx));
  };

  const [logoSrc, setLogoSrc] = useState("/logo.png");
  const [showLogo, setShowLogo] = useState(true);
  const [signSrc, setSignSrc] = useState("/sign.png");
  const [showSign, setShowSign] = useState(true);
  const [sealSrc, setSealSrc] = useState("/seal.png");
  const [showSeal, setShowSeal] = useState(true);

  const handleImageReplace = (setter, showSetter) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) { setter(URL.createObjectURL(file)); showSetter(true); }
    };
    input.click();
  };

  if (!open) return null;

  const fs = { fontSize: "11pt", fontFamily: "'Times New Roman', Georgia, serif" };
  const lc = "bg-gray-50 px-3 py-1.5 font-medium text-gray-700 border border-gray-300 align-top";
  const vc = "px-3 py-1.5 text-gray-900 border border-gray-300 align-top";
  const ic = "w-full bg-transparent outline-none focus:bg-yellow-50";
  const thc = "bg-gray-100 px-3 py-1.5 font-semibold text-gray-800 border border-gray-300 text-center";
  const btnAdd = "text-[10px] text-green-600 hover:text-green-800 font-bold cursor-pointer select-none";
  const btnDel = "text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer select-none";

  // Build FormData with all COA fields + optional custom image files
  const buildFormData = async (extraFields = {}) => {
    const productName = detailRows[0]?.value || "";
    const payload = { ...form, detail_rows: detailRows, test_rows: testRows, product_name: productName, ...extraFields };

    if (!showLogo) payload.hide_logo = true;
    if (!showSign) payload.hide_sign = true;
    if (!showSeal) payload.hide_seal = true;

    // Check if any custom images need to be sent as files
    const customFiles = [];
    if (showLogo && logoSrc && logoSrc !== "/logo.png") customFiles.push(["logo_file", logoSrc, "custom_logo.png"]);
    if (showSign && signSrc && signSrc !== "/sign.png") customFiles.push(["sign_file", signSrc, "custom_sign.png"]);
    if (showSeal && sealSrc && sealSrc !== "/seal.png") customFiles.push(["seal_file", sealSrc, "custom_seal.png"]);

    if (customFiles.length > 0) {
      try {
        const fd = new FormData();
        for (const [key, src, filename] of customFiles) {
          const blob = await fetch(src).then(r => r.blob());
          fd.append(key, blob, filename);
        }
        fd.append("payload", JSON.stringify(payload));
        return fd;
      } catch { /* fall through to JSON */ }
    }
    return payload;
  };

  const handleGenerate = async () => {
    const productName = detailRows[0]?.value || "";
    if (!productName.trim()) { alert("Please enter the Product Name"); return; }
    // Block generation when any component is above its acceptable max.
    const offending = testRows.find((r) => r._isComponent && validateComponentValue(r, r.value).state === "invalid");
    if (offending) {
      toast.error(`${offending.label} is above the acceptable range. Max: ${offending._acceptableMax}${offending._unit}.`, { duration: 6000 });
      return;
    }
    // Consume the report number sequence (only now it becomes "used")
    try {
      const res = await api.post("/quality/coa-consume-report-number/", { report_no: form.report_no });
      if (res.data.report_number) {
        setForm(prev => ({ ...prev, report_no: res.data.report_number }));
      }
    } catch { /* proceed even if consume fails */ }
    // Build payload with logo info
    const data = await buildFormData();
    onGenerate?.(data);
  };

  const renderTable = (rows, setter, headerLeft, headerRight) => (
    <table className="w-full border-collapse" style={fs}>
      <thead>
        <tr>
          <th className={thc} style={{ width: "42%", ...fs }}>{headerLeft}</th>
          <th className={thc} style={{ width: "53%", ...fs }}>{headerRight}</th>
          <th style={{ width: "5%" }} className="border border-gray-300 bg-gray-50">
            <span onClick={() => addRowTop(setter)} className={btnAdd} title="Add row at top">+</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          // Validate per-product component rows against acceptable_max.
          const v = row._isComponent ? validateComponentValue(row, row.value) : { state: "ok" };
          const isInvalid = v.state === "invalid";
          return (
          <tr key={i}>
            <td className={lc} style={fs}>
              <input
                value={row.label}
                onChange={(e) => updateRow(setter, i, "label", e.target.value)}
                className={ic}
                style={fs}
                placeholder="Field name"
                readOnly={row._isComponent}
                title={row._isComponent ? "From product spec — not editable" : ""}
              />
              {row._isComponent && (
                <div className="text-[9px] text-gray-500 mt-0.5">
                  Standard: <span className="font-semibold">{row._standard}{row._unit}</span> · Max: <span className="font-semibold">{row._acceptableMax}{row._unit}</span>
                </div>
              )}
            </td>
            <td className={`${vc} ${isInvalid ? "bg-rose-50" : ""}`} style={fs}>
              <textarea
                value={row.value}
                onChange={(e) => {
                  const newVal = e.target.value;
                  updateRow(setter, i, "value", newVal);
                  // Surface a toast on transition into invalid state so the user
                  // sees the rule even if they miss the inline red border.
                  if (row._isComponent) {
                    const prev = validateComponentValue(row, row.value);
                    const next = validateComponentValue(row, newVal);
                    if (next.state === "invalid" && prev.state !== "invalid") {
                      toast.error(next.message, { duration: 5000 });
                    }
                  }
                }}
                className={`${ic} resize-none overflow-hidden ${isInvalid ? "text-rose-700 font-semibold" : ""}`}
                style={fs}
                rows={1}
                onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                placeholder={row._isComponent ? `Enter measured value (max ${row._acceptableMax}${row._unit})` : "Value"}
              />
              {isInvalid && (
                <div className="text-[10px] text-rose-700 mt-1 flex items-start gap-1">
                  <svg className="w-3 h-3 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  <span>Above acceptable range — enter ≤ {row._acceptableMax}{row._unit}</span>
                </div>
              )}
            </td>
            <td className="border border-gray-300 text-center align-middle" style={{ width: 30 }}>
              <div className="flex flex-col items-center gap-0.5">
                <span onClick={() => addRowAt(setter, i)} className={btnAdd} title="Add row below">+</span>
                {rows.length > 1 && !row._isComponent && <span onClick={() => removeRow(setter, i)} className={btnDel} title="Remove row">×</span>}
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <Modal open={open} onClose={onClose} title="Certificate of Analysis (COA)" size="lg">
      <div className="max-h-[75vh] overflow-y-auto">
        <div className="bg-white max-w-[700px] mx-auto p-8 shadow-sm border border-gray-200 rounded-lg" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

          {/* Header — Logo (replaceable / removable / addable) */}
          <div className="mb-4" style={{ height: "64px" }}>
            {showLogo ? (
              <div className="relative group inline-block h-16">
                <img src={logoSrc} alt="Kriya" className="h-16 w-auto" />
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  <button type="button" onClick={() => handleImageReplace(setLogoSrc, setShowLogo)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace logo">↺</button>
                  <button type="button" onClick={() => setShowLogo(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove logo">×</button>
                </div>
              </div>
            ) : (
              <label
                className="h-16 w-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setLogoSrc(URL.createObjectURL(f)); setShowLogo(true); } }}
              >
                <span className="text-lg text-gray-400">+</span>
                <span className="text-[9px] text-gray-400">Add Logo</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setLogoSrc(URL.createObjectURL(f)); setShowLogo(true); } }} />
              </label>
            )}
          </div>

          <h1 className="text-center font-bold underline mb-6" style={{ fontSize: "12pt" }}>CERTIFICATE OF ANALYSIS</h1>

          {/* Report No + Date */}
          <table className="w-full border-collapse mb-0" style={fs}>
            <tbody>
              <tr>
                <td className="px-3 py-1.5 border border-gray-300 font-bold" style={{ ...fs, width: "42%" }}>
                  REPORT NO: <input value={form.report_no} onChange={(e) => set("report_no", e.target.value)} className="bg-transparent outline-none focus:bg-yellow-50 ml-1" style={fs} placeholder="e.g. KB/2604/001" />
                </td>
                <td className="px-3 py-1.5 border border-gray-300 font-bold text-right" style={{ ...fs, width: "58%" }}>
                  DATE: <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="bg-transparent outline-none focus:bg-yellow-50" style={fs} />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Product Details — dynamic rows */}
          {renderTable(detailRows, setDetailRows, "", "")}

          <div className="my-3" />

          {/* Test Results — dynamic rows */}
          <table className="w-full border-collapse" style={fs}>
            <tbody>
              <tr>
                <td colSpan={3} className="text-center font-bold py-1.5 border border-gray-300 bg-gray-50" style={fs}>TEST RESULT</td>
              </tr>
            </tbody>
          </table>
          {renderTable(testRows, setTestRows, "TESTING PARAMETERS", "RESULTS")}
          {/* Quality-spec source banner — makes it obvious WHICH product's
              spec is being applied to the validation rows. If the user
              expected a different product, they need to change the Company
              Product on the order line item. */}
          {productSpec && (
            <div className="mt-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-[11px] text-amber-900 print:hidden">
              <div className="font-semibold mb-1">
                Quality spec source: <span className="text-amber-700">{productName}</span>
              </div>
              <div className="text-amber-800">
                Component rows below the standard tests are validated against
                <strong> {productName}</strong>'s spec. To use a different product's
                tolerances, change the Company Product on the order line item.
              </div>
              <ul className="mt-1 list-disc list-inside text-amber-800">
                {productSpec.components.map((c, ci) => (
                  <li key={ci}>
                    <span className="font-medium">{c.name}</span>: standard {c.standard}{c.unit} · acceptable max {c.acceptable_max}{c.unit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!productSpec && productName && (
            <div className="mt-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-[11px] text-gray-700 print:hidden">
              No quality spec found for <strong>{productName}</strong> in the product catalog —
              component validation is skipped. Add a spec via the Products page or pick a different Company Product on the line item.
            </div>
          )}

          {/* Signature */}
          <div className="mt-8 pt-4">
            <p className="font-medium text-gray-700 mb-8" style={fs}>Checked by</p>
            <div className="flex items-end gap-4">
              {/* Signature image */}
              <div className="text-center">
                <div style={{ height: "40px" }} className="mb-1">
                  {showSign ? (
                    <div className="relative group inline-block h-10">
                      <img src={signSrc} alt="Signature" className="h-10 w-auto" />
                      <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                        <button type="button" onClick={() => handleImageReplace(setSignSrc, setShowSign)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace">↺</button>
                        <button type="button" onClick={() => setShowSign(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove">×</button>
                      </div>
                    </div>
                  ) : (
                    <label className="h-10 w-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setSignSrc(URL.createObjectURL(f)); setShowSign(true); } }}>
                      <span className="text-sm text-gray-400">+</span>
                      <span className="text-[8px] text-gray-400">Sign</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setSignSrc(URL.createObjectURL(f)); setShowSign(true); } }} />
                    </label>
                  )}
                </div>
                <div className="border-t border-gray-400 pt-1">
                  <input value={form.checked_by} onChange={(e) => set("checked_by", e.target.value)} className="font-medium text-gray-700 bg-transparent outline-none text-center w-40 focus:bg-yellow-50" style={fs} />
                </div>
              </div>
              {/* Seal image */}
              <div style={{ height: "64px" }}>
                {showSeal ? (
                  <div className="relative group inline-block h-16">
                    <img src={sealSrc} alt="Company Seal" className="h-16 w-auto" />
                    <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                      <button type="button" onClick={() => handleImageReplace(setSealSrc, setShowSeal)} className="w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-blue-600" title="Replace">↺</button>
                      <button type="button" onClick={() => setShowSeal(false)} className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600" title="Remove">×</button>
                    </div>
                  </div>
                ) : (
                  <label className="h-16 w-16 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) { setSealSrc(URL.createObjectURL(f)); setShowSeal(true); } }}>
                    <span className="text-sm text-gray-400">+</span>
                    <span className="text-[8px] text-gray-400">Seal</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setSealSrc(URL.createObjectURL(f)); setShowSeal(true); } }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {docsMode ? (
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
          <button onClick={() => toast.success("Saved")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Save</button>
          <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {generating ? "Generating..." : "Save & Generate PDF"}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const productName = detailRows[0]?.value || "";
                if (!productName.trim()) { alert("Please enter the Product Name"); return; }
                try {
                  const data = await buildFormData();
                  const isFormData = data instanceof FormData;
                  const res = await api.post("/communications/generate-coa-pdf/", data, {
                    responseType: "blob",
                    ...(isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {}),
                  });
                  setPdfPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
                } catch { toast.error("Failed to generate preview"); }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Preview PDF
            </button>
            <button onClick={handleGenerate} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Generate & Attach to Email
            </button>
          </div>
        </div>
      )}

      {/* PDF Preview */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-800">📄 COA Preview — {detailRows[0]?.value || "Product"}</p>
              <div className="flex items-center gap-2">
                <a href={pdfPreviewUrl} download={`COA_${(detailRows[0]?.value || "Product").replace(/\s/g, "_")}.pdf`} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">Download</a>
                <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 min-h-[500px]">
              <iframe src={pdfPreviewUrl} className="w-full h-[80vh] border-0" />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
