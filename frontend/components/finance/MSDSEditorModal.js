"use client";
import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

/**
 * Material Safety Data Sheet (MSDS/SDS) Editor — 16-section format matching
 * the Kriya Biosys standard MSDS template. All values are editable, labels
 * are static. Generates a professional PDF for email attachment.
 */
export default function MSDSEditorModal({ open, onClose, onGenerate, productName }) {
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [form, setForm] = useState({
    // Section 1
    product_name: productName || "",
    common_name: "",
    // Section 2
    comp_1_name: "Active Ingredient", comp_1_pct: "",
    comp_2_name: "Inert carrier & Stabilizer", comp_2_pct: "",
    // Section 3
    emergency_overview: "",
    signal_word: "Caution",
    potential_health_effects: "None",
    routes_of_entry: "Eyes, skin, oral, inhalation.",
    human_effects: "May cause irritation of eyes, skin or respiratory tract",
    acute_eye: "Cause mild eye irritation",
    chronic_eye: "Chronic exposure not likely from normal use",
    acute_skin: "Slightly irritating. May cause irritation",
    chronic_ingestion: "Chronic exposure not likely from normal use",
    medical_conditions: "Not known",
    // Section 4
    first_aid_eyes: "Immediately rinse eyes with lots of water. Hold eyelids apart to rinse the entire surface of the eyes and lids.",
    first_aid_skin: "Wash with plenty of soap and water, including hair and under fingernails. Remove contaminated clothing.",
    first_aid_inhalation: "Move the victim from the contaminated area to fresh air. Apply artificial respiration if necessary.",
    first_aid_ingestion: "If the victim is fully conscious, immediately give large quantities of water to drink and get medical help.",
    // Section 5
    extinguishing_media: "Dry chemical foam or carbon-di-oxide",
    explosion_hazards: "None known",
    fire_procedures: "Wear full protective clothing and self-contained breathing apparatus.",
    // Section 6
    spill_procedures: "Wear chemical safety glasses, rubber gloves, rubber boots. Sweep up, keep dust to a minimum.",
    // Section 7
    storage_temp: "Room temperature.",
    shelf_life: "Stable",
    special_sensitivity: "None known",
    handling_precautions: "Store in a well-ventilated secure area out of the reach of children and domestic animals.",
    // Section 8
    oral_protection: "Prevent eating, drinking, tobacco usage in areas where there is potential for exposure.",
    eye_protection: "To avoid eye contact, wear safety goggles.",
    skin_protection: "To avoid skin contact, wear rubber gloves, rubber boots, long-sleeved shirt.",
    respiratory: "Use adequate ventilation and wear a NIOSH-approved pesticide respirator with a dust filter.",
    // Section 9
    physical_form: "Powder",
    colour: "Pale White",
    flash_point: "> 67°C - No Fire Hazard",
    corrosion: "Nil",
    miscibility: "Miscible in water",
    // Section 10
    stability: "Stable",
    hazardous_polymerization: "Will not occur",
    incompatibilities: "Not compatible with highly alkaline substances",
    decomposition: "Easily biodegradable",
    // Section 11
    oral_toxicity: "LD50 (Rat) > 5000 mg/kg",
    inhalation_toxicity: "No mortality observed",
    dermal_toxicity: "> 2000 mg/kg",
    eye_irritation: "Mild irritant",
    skin_irritation: "Slight",
    skin_sensitization: "Non-Sensitive",
    // Section 12
    ecological_info: "Totally biodegradable in nature\nDo not apply on water bodies",
    // Section 13
    waste_disposal: "Do not reuse product containers. Dispose according to local, state, federal, health and environmental regulations.",
    pesticidal_disposal: "Wastes resulting from the use of this product may be disposed of on-site or at an approved waste disposal facility.",
    // Section 14
    shipping_name: "",
    flammability: "Non-Inflammable",
    transport_class: "This product is not classified as dangerous for carriage.",
    // Section 15
    osha: "N/A", tsca: "N/A", cercla: "N/A", rcra: "N/A",
    // Section 16
    other_info: "This product is for agricultural use only.",
    disclaimer: "To the best of our knowledge, the information contained herein is accurate. However, neither Kriya Biosys (P) Ltd nor any of its subsidiaries assume any liability whatsoever for the accuracy or completeness of the information contained herein.",
  });

  useEffect(() => {
    if (open && productName) {
      setForm(prev => ({
        ...prev,
        product_name: prev.product_name || productName,
        shipping_name: prev.shipping_name || productName,
      }));
    }
  }, [open, productName]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  if (!open) return null;

  // Render helpers — plain functions (NOT components) to avoid remount on re-render
  const renderSH = (num, title) => (
    <tr key={`sh-${num}`}><td colSpan={2} className="bg-gray-100 px-3 py-2 border border-gray-300">
      <span className="text-xs font-bold text-gray-800">{num}. {title.toUpperCase()}</span>
    </td></tr>
  );

  const renderRow = (label, k) => (
    <tr key={k}>
      <td className="px-3 py-1.5 text-[11px] font-medium text-gray-700 border border-gray-300 w-[40%] align-top bg-white">{label}</td>
      <td className="px-3 py-1.5 border border-gray-300 w-[60%] align-top">
        <textarea
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
          rows={1}
          className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none overflow-hidden"
          onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
        />
      </td>
    </tr>
  );

  return (
    <Modal open={open} onClose={onClose} title="Safety Data Sheet (MSDS)" size="lg">
      <div className="max-h-[75vh] overflow-y-auto">
        <div className="bg-white max-w-[700px] mx-auto p-6 shadow-sm border border-gray-200 rounded-lg" style={{ fontFamily: "Arial, sans-serif" }}>

          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <img src="/logo.png" alt="Kriya" className="h-12 mb-1" onError={(e) => { e.target.style.display = 'none'; }} />
              <p className="text-[9px] text-gray-500 leading-tight">M/s. KRIYA BIOSYS (P) LTD,<br/>D.no: 233, Aarthi Nagar,<br/>Mohan Nagar, Narasothipatti,<br/>Salem - 636004, Tamilnadu</p>
            </div>
            <div className="text-right text-[9px] text-gray-500 leading-tight">
              <p>Mail: info@kriya.ltd</p>
              <p>Tel: +91 6385848466</p>
            </div>
          </div>

          <h1 className="text-center text-sm font-bold mb-1">SAFETY DATA SHEET</h1>
          <p className="text-center text-sm font-bold mb-4">
            <input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className="text-center bg-transparent outline-none font-bold w-full focus:bg-yellow-50" placeholder="Product Name" />
          </p>

          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {/* Section 1 */}
              {renderSH("1", "Product Name")}
              {renderRow("Product Name", "product_name")}
              {renderRow("Common Name", "common_name")}

              {/* Section 2 */}
              {renderSH("2", "Composition / Information of Ingredients")}
              <tr>
                <td className="px-3 py-1.5 font-medium text-gray-700 border border-gray-300 bg-gray-50">Chemical Components</td>
                <td className="px-3 py-1.5 font-medium text-gray-700 border border-gray-300 bg-gray-50">Percentage Range</td>
              </tr>
              <tr>
                <td className="px-3 py-1 border border-gray-300"><textarea value={form.comp_1_name} onChange={(e) => set("comp_1_name", e.target.value)} rows={1} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none overflow-hidden" onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} /></td>
                <td className="px-3 py-1 border border-gray-300"><textarea value={form.comp_1_pct} onChange={(e) => set("comp_1_pct", e.target.value)} rows={1} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none overflow-hidden" placeholder="e.g. 2%" onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} /></td>
              </tr>
              <tr>
                <td className="px-3 py-1 border border-gray-300"><textarea value={form.comp_2_name} onChange={(e) => set("comp_2_name", e.target.value)} rows={1} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none overflow-hidden" onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} /></td>
                <td className="px-3 py-1 border border-gray-300"><textarea value={form.comp_2_pct} onChange={(e) => set("comp_2_pct", e.target.value)} rows={1} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none overflow-hidden" placeholder="e.g. 98%" onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }} /></td>
              </tr>

              {/* Section 3 */}
              {renderSH("3", "Hazardous Identification")}
              {renderRow("Emergency Overview", "emergency_overview")}
              {renderRow("Signal Word", "signal_word")}
              {renderRow("Potential Health Effects", "potential_health_effects")}
              {renderRow("Route(s) Of Entry", "routes_of_entry")}
              {renderRow("Human Effects & Symptoms", "human_effects")}
              {renderRow("Acute Eye Contact", "acute_eye")}
              {renderRow("Chronic Eye Contact", "chronic_eye")}
              {renderRow("Acute Skin Contact", "acute_skin")}
              {renderRow("Chronic Ingestion", "chronic_ingestion")}
              {renderRow("Medical Conditions Aggravated", "medical_conditions")}

              {/* Section 4 */}
              {renderSH("4", "First Aid Measures")}
              {renderRow("First Aid For Eyes", "first_aid_eyes")}
              {renderRow("First Aid For Skin", "first_aid_skin")}
              {renderRow("First Aid For Inhalation", "first_aid_inhalation")}
              {renderRow("First Aid For Ingestion", "first_aid_ingestion")}

              {/* Section 5 */}
              {renderSH("5", "Fire Fighting Measures")}
              {renderRow("Extinguishing Media", "extinguishing_media")}
              {renderRow("Unusual Fire & Explosion Hazards", "explosion_hazards")}
              {renderRow("Special Fire Fighting Procedures", "fire_procedures")}

              {/* Section 6 */}
              {renderSH("6", "Accidental Release Measures")}
              {renderRow("Spill Or Leak Procedures", "spill_procedures")}

              {/* Section 7 */}
              {renderSH("7", "Handling and Storage")}
              {renderRow("Storage Temperature", "storage_temp")}
              {renderRow("Shelf Life", "shelf_life")}
              {renderRow("Special Sensitivity", "special_sensitivity")}
              {renderRow("Handling & Storage Precautions", "handling_precautions")}

              {/* Section 8 */}
              {renderSH("8", "Exposure Controls / Personal Protection")}
              {renderRow("Oral Protection", "oral_protection")}
              {renderRow("Eye Protection", "eye_protection")}
              {renderRow("Skin Protection", "skin_protection")}
              {renderRow("Respiratory / Ventilation", "respiratory")}

              {/* Section 9 */}
              {renderSH("9", "Physical and Chemical Properties")}
              {renderRow("Physical Form", "physical_form")}
              {renderRow("Colour", "colour")}
              {renderRow("Flash Point", "flash_point")}
              {renderRow("Corrosion", "corrosion")}
              {renderRow("Miscibility", "miscibility")}

              {/* Section 10 */}
              {renderSH("10", "Stability and Reactivity")}
              {renderRow("Stability", "stability")}
              {renderRow("Hazardous Polymerization", "hazardous_polymerization")}
              {renderRow("Incompatibilities", "incompatibilities")}
              {renderRow("Decomposition", "decomposition")}

              {/* Section 11 */}
              {renderSH("11", "Toxicological Information")}
              {renderRow("Acute Oral Toxicity", "oral_toxicity")}
              {renderRow("Acute Inhalation Toxicity", "inhalation_toxicity")}
              {renderRow("Acute Dermal Toxicity", "dermal_toxicity")}
              {renderRow("Eye Contact", "eye_irritation")}
              {renderRow("Skin Irritation", "skin_irritation")}
              {renderRow("Skin Sensitization", "skin_sensitization")}

              {/* Section 12 */}
              {renderSH("12", "Ecological Information")}
              <tr><td colSpan={2} className="px-3 py-1.5 border border-gray-300">
                <textarea value={form.ecological_info} onChange={(e) => set("ecological_info", e.target.value)} rows={2} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none" />
              </td></tr>

              {/* Section 13 */}
              {renderSH("13", "Disposal Considerations")}
              {renderRow("Waste Disposal Method", "waste_disposal")}
              {renderRow("Pesticidal Disposal", "pesticidal_disposal")}

              {/* Section 14 */}
              {renderSH("14", "Transport Information")}
              {renderRow("Shipping Name", "shipping_name")}
              {renderRow("Flammability", "flammability")}
              {renderRow("ADR/RID/IMDG/IATA/DOT", "transport_class")}

              {/* Section 15 */}
              {renderSH("15", "Regulatory Information")}
              {renderRow("OSHA Status", "osha")}
              {renderRow("TSCA Status", "tsca")}
              {renderRow("CERCLA Reportable Qty", "cercla")}
              {renderRow("RCRA Status", "rcra")}

              {/* Section 16 */}
              {renderSH("16", "Other Information")}
              <tr><td colSpan={2} className="px-3 py-1.5 border border-gray-300">
                <textarea value={form.other_info} onChange={(e) => set("other_info", e.target.value)} rows={1} className="w-full bg-transparent outline-none text-[11px] focus:bg-yellow-50 resize-none mb-1" />
                <textarea value={form.disclaimer} onChange={(e) => set("disclaimer", e.target.value)} rows={3} className="w-full bg-transparent outline-none text-[10px] text-gray-500 italic focus:bg-yellow-50 resize-none" />
              </td></tr>
            </tbody>
          </table>
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
                const res = await api.post("/communications/generate-msds-pdf/", form, { responseType: "blob" });
                setPdfPreviewUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
              } catch { toast.error("Failed to generate preview"); }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            Preview PDF
          </button>
          <button onClick={() => { if (!form.product_name.trim()) { alert("Please enter Product Name"); return; } onGenerate?.(form); }}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Generate & Attach to Email
          </button>
        </div>
      </div>

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-800">📄 MSDS Preview — {form.product_name}</p>
              <div className="flex items-center gap-2">
                <a href={pdfPreviewUrl} download={`MSDS_${form.product_name.replace(/\s/g, "_")}.pdf`} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">Download</a>
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
