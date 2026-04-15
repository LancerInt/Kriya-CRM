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
 */
export default function COAEditorModal({ open, onClose, onGenerate, productName, clientName }) {
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [form, setForm] = useState({
    report_no: "",
    date: new Date().toISOString().split("T")[0],
    checked_by: "Technical Manager",
  });

  // Dynamic rows for Product Details section
  const [detailRows, setDetailRows] = useState([
    { label: "Product Name", value: productName || "" },
    { label: "Sample Description", value: "" },
    { label: "Manufacturing Date", value: "" },
    { label: "Expiration Date", value: "" },
    { label: "Date of Receipt of Sample", value: "" },
    { label: "Date of Start of Analysis", value: "" },
    { label: "Date of Completion of Analysis", value: "" },
  ]);

  // Dynamic rows for Test Results section
  const [testRows, setTestRows] = useState([
    { label: "Appearance", value: "" },
    { label: "Odour", value: "" },
    { label: "pH", value: "" },
    { label: "Specific Gravity", value: "" },
    { label: "Solubility", value: "" },
    { label: "Neem Oil", value: "" },
  ]);

  useEffect(() => {
    if (open && productName) {
      setDetailRows(prev => {
        const rows = [...prev];
        if (rows[0] && !rows[0].value) rows[0] = { ...rows[0], value: productName };
        return rows;
      });
    }
  }, [open, productName]);

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

  if (!open) return null;

  const fs = { fontSize: "11pt", fontFamily: "'Times New Roman', Georgia, serif" };
  const lc = "bg-gray-50 px-3 py-1.5 font-medium text-gray-700 border border-gray-300 align-top";
  const vc = "px-3 py-1.5 text-gray-900 border border-gray-300 align-top";
  const ic = "w-full bg-transparent outline-none focus:bg-yellow-50";
  const thc = "bg-gray-100 px-3 py-1.5 font-semibold text-gray-800 border border-gray-300 text-center";
  const btnAdd = "text-[10px] text-green-600 hover:text-green-800 font-bold cursor-pointer select-none";
  const btnDel = "text-[10px] text-red-400 hover:text-red-600 font-bold cursor-pointer select-none";

  const handleGenerate = () => {
    const productName = detailRows[0]?.value || "";
    if (!productName.trim()) { alert("Please enter the Product Name"); return; }
    // Flatten into form data for backend
    onGenerate?.({
      ...form,
      detail_rows: detailRows,
      test_rows: testRows,
      product_name: productName,
    });
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
        {rows.map((row, i) => (
          <tr key={i}>
            <td className={lc} style={fs}>
              <input value={row.label} onChange={(e) => updateRow(setter, i, "label", e.target.value)} className={ic} style={fs} placeholder="Field name" />
            </td>
            <td className={vc} style={fs}>
              <textarea
                value={row.value}
                onChange={(e) => updateRow(setter, i, "value", e.target.value)}
                className={`${ic} resize-none overflow-hidden`}
                style={fs}
                rows={1}
                onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                placeholder="Value"
              />
            </td>
            <td className="border border-gray-300 text-center align-middle" style={{ width: 30 }}>
              <div className="flex flex-col items-center gap-0.5">
                <span onClick={() => addRowAt(setter, i)} className={btnAdd} title="Add row below">+</span>
                {rows.length > 1 && <span onClick={() => removeRow(setter, i)} className={btnDel} title="Remove row">×</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Modal open={open} onClose={onClose} title="Certificate of Analysis (COA)" size="lg">
      <div className="max-h-[75vh] overflow-y-auto">
        <div className="bg-white max-w-[700px] mx-auto p-8 shadow-sm border border-gray-200 rounded-lg" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

          {/* Header */}
          <div className="mb-4">
            <img src="/logo.png" alt="Kriya" className="h-16" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>

          <h1 className="text-center font-bold underline mb-6" style={{ fontSize: "12pt" }}>CERTIFICATE OF ANALYSIS</h1>

          {/* Report No + Date */}
          <table className="w-full border-collapse mb-0" style={fs}>
            <tbody>
              <tr>
                <td className="px-3 py-1.5 border border-gray-300 font-bold" style={{ ...fs, width: "42%" }}>
                  REPORT NO: <input value={form.report_no} onChange={(e) => set("report_no", e.target.value)} className="bg-transparent outline-none focus:bg-yellow-50 ml-1" style={fs} placeholder="e.g. NSRL/2511/28" />
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

          {/* Signature */}
          <div className="mt-8 pt-4">
            <p className="font-medium text-gray-700 mb-8" style={fs}>Checked by</p>
            <div className="flex items-end gap-4">
              <div className="text-center">
                <img src="/sign.png" alt="Signature" className="h-10 mb-1" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="border-t border-gray-400 pt-1">
                  <input value={form.checked_by} onChange={(e) => set("checked_by", e.target.value)} className="font-medium text-gray-700 bg-transparent outline-none text-center w-40 focus:bg-yellow-50" style={fs} />
                </div>
              </div>
              <img src="/seal.png" alt="Company Seal" className="h-16" onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const productName = detailRows[0]?.value || "";
              if (!productName.trim()) { alert("Please enter the Product Name"); return; }
              try {
                const res = await api.post("/communications/generate-coa-pdf/", {
                  ...form, detail_rows: detailRows, test_rows: testRows, product_name: productName,
                }, { responseType: "blob" });
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
