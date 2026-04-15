"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

/**
 * Certificate of Analysis (COA) Editor — editable document that looks like
 * a printable COA. Left side labels are static, right side values are editable.
 * Generates a styled HTML that can be converted to PDF and attached to email.
 */
export default function COAEditorModal({ open, onClose, onGenerate, productName, clientName }) {
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [form, setForm] = useState({
    report_no: "",
    date: new Date().toISOString().split("T")[0],
    product_name: productName || "",
    sample_description: "",
    manufacturing_date: "",
    expiration_date: "",
    receipt_date: "",
    start_date: "",
    completion_date: "",
    // Test results
    appearance: "",
    odour: "",
    ph: "",
    specific_gravity: "",
    solubility: "",
    active_content: "",
    active_label: "Active Content",
    // Signature
    checked_by: "Technical Manager",
  });

  useEffect(() => {
    if (open && productName) {
      setForm(prev => ({ ...prev, product_name: prev.product_name || productName }));
    }
  }, [open, productName]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  if (!open) return null;

  const labelClass = "bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 w-[45%]";
  const inputClass = "px-3 py-2 text-sm text-gray-900 border border-gray-300 w-[55%] outline-none focus:bg-yellow-50";
  const thClass = "bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 border border-gray-300 text-center";

  const handleGenerate = () => {
    if (!form.product_name.trim()) {
      alert("Please enter the Product Name");
      return;
    }
    onGenerate?.(form);
  };

  return (
    <Modal open={open} onClose={onClose} title="Certificate of Analysis (COA)" size="lg">
      <div className="max-h-[75vh] overflow-y-auto">
        {/* Document */}
        <div className="bg-white max-w-[700px] mx-auto p-8 shadow-sm border border-gray-200 rounded-lg" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <img src="/logo.png" alt="Kriya" className="h-14" onError={(e) => { e.target.style.display = 'none'; }} />
            <div className="text-right text-xs text-gray-500">
              <p className="italic">Delightfully Organic!</p>
            </div>
          </div>

          <h1 className="text-center text-lg font-bold underline mb-6 tracking-wide">CERTIFICATE OF ANALYSIS</h1>

          {/* Report No + Date */}
          <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className={labelClass}>REPORT NO:</td>
                <td className={inputClass}>
                  <input value={form.report_no} onChange={(e) => set("report_no", e.target.value)} placeholder="e.g. NSRL/2511/28" className="w-full bg-transparent outline-none" />
                </td>
                <td className={labelClass}>DATE:</td>
                <td className={inputClass}>
                  <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="w-full bg-transparent outline-none" />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Section 1: Product Details */}
          <table className="w-full border-collapse mb-4">
            <tbody>
              {[
                { label: "Product Name", key: "product_name", placeholder: "e.g. MargoShine" },
                { label: "Sample Description", key: "sample_description", placeholder: "e.g. Neem Oil 70% EC" },
                { label: "Manufacturing Date", key: "manufacturing_date", placeholder: "e.g. November 2025", type: "text" },
                { label: "Expiration Date", key: "expiration_date", placeholder: "e.g. December 2027", type: "text" },
                { label: "Date of Receipt of Sample", key: "receipt_date", placeholder: "e.g. 03.11.2025" },
                { label: "Date of Start of Analysis", key: "start_date", placeholder: "e.g. 04.11.2025" },
                { label: "Date of Completion of Analysis", key: "completion_date", placeholder: "e.g. 04.11.2025" },
              ].map(({ label, key, placeholder, type }) => (
                <tr key={key}>
                  <td className={labelClass}>{label}</td>
                  <td className={inputClass}>
                    <input
                      type={type || "text"}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full bg-transparent outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Section 2: Test Results */}
          <table className="w-full border-collapse mb-6">
            <thead>
              <tr>
                <td colSpan={2} className="text-center font-bold text-sm py-2 border border-gray-300 bg-gray-50">TEST RESULT</td>
              </tr>
              <tr>
                <th className={thClass} style={{ width: "50%" }}>TESTING PARAMETERS</th>
                <th className={thClass} style={{ width: "50%" }}>RESULTS</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Appearance", key: "appearance", placeholder: "e.g. Clear Brown Colour Liquid" },
                { label: "Odour", key: "odour", placeholder: "e.g. Characteristic Odor" },
                { label: "pH", key: "ph", placeholder: "e.g. 6.24" },
                { label: "Specific Gravity", key: "specific_gravity", placeholder: "e.g. 0.92" },
                { label: "Solubility", key: "solubility", placeholder: "e.g. Soluble in Water" },
              ].map(({ label, key, placeholder }) => (
                <tr key={key}>
                  <td className={labelClass}>{label}</td>
                  <td className={inputClass}>
                    <input value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className="w-full bg-transparent outline-none" />
                  </td>
                </tr>
              ))}
              {/* Active content row — label is also editable */}
              <tr>
                <td className={labelClass}>
                  <input value={form.active_label} onChange={(e) => set("active_label", e.target.value)} className="w-full bg-transparent outline-none font-medium" placeholder="e.g. Neem Oil" />
                </td>
                <td className={inputClass}>
                  <input value={form.active_content} onChange={(e) => set("active_content", e.target.value)} placeholder="e.g. 70.14%" className="w-full bg-transparent outline-none" />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Signature Section */}
          <div className="flex items-end justify-between mt-8 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-8">Checked by</p>
              <div className="flex items-end gap-4">
                <div className="text-center">
                  <img src="/sign.png" alt="Signature" className="h-10 mb-1" onError={(e) => { e.target.style.display = 'none'; }} />
                  <div className="border-t border-gray-400 pt-1">
                    <input value={form.checked_by} onChange={(e) => set("checked_by", e.target.value)} className="text-sm font-medium text-gray-700 bg-transparent outline-none text-center w-40" />
                  </div>
                </div>
                <img src="/seal.png" alt="Company Seal" className="h-16" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
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
              if (!form.product_name.trim()) { alert("Please enter the Product Name"); return; }
              try {
                const res = await api.post("/communications/generate-coa-pdf/", form, { responseType: "blob" });
                const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
                setPdfPreviewUrl(url);
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

      {/* PDF Preview — full-screen overlay matching the Documents page viewer */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">📄</span>
                <p className="text-sm font-semibold text-gray-800">COA Preview — {form.product_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={pdfPreviewUrl} download={`COA_${form.product_name.replace(/\s/g, "_")}.pdf`} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
                  Download
                </a>
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
