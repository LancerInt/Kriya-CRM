"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const CONTAINER_LEFT_FIELDS = [
  ["type", "Type"],
  ["bottle_colour", "Bottle Colour"],
  ["cap_colour", "Cap Colour"],
  ["cap_type", "Cap Type"],
  ["measuring_cups", "Measuring Cups"],
];
const CONTAINER_RIGHT_FIELDS = [
  ["colour", "Colour"],
  ["box_thickness", "Box Thickness"],
  ["carton_box_label", "Carton Box Label/Design"],
  ["batch_sticker", "Batch Sticker"],
  ["batch_no", "Batch No."],
];
const QTY_LEFT_FIELDS = [
  ["total_quantity", "Total Quantity"],
  ["bottles_caps", "No. of Bottles/Caps"],
  ["liters_per_box", "No. of Liters per Box"],
  ["carton_boxes", "No. of Carton Box"],
];
const ACC_RIGHT_FIELDS = [
  ["label_quantity", "Label/Quantity"],
  ["label_type", "Label Type"],
  ["label_size", "Label Size"],
  ["leaflet_quantity", "Leaflet/Quantity"],
  ["sleeves_quantity", "Sleeves/Quantity"],
  ["partitions", "Partitions"],
  ["pads", "Pads"],
  ["box_thickness", "Box Thickness"],
];

function KVRow({ label, value, onChange, readOnly }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 border-b border-gray-100">
      <span className="text-[11px] text-gray-700 leading-6">{label}</span>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="text-[11px] bg-transparent outline-none border-b border-transparent focus:border-indigo-400"
      />
    </div>
  );
}

function SectionHeading({ left, right }) {
  return (
    <div className="grid grid-cols-2 gap-6 mt-4">
      <div className="text-[12px] font-semibold text-[#1f4e79] border-b border-[#1f4e79] pb-1">{left}</div>
      <div className="text-[12px] font-semibold text-[#1f4e79] border-b border-[#1f4e79] pb-1">{right || ""}</div>
    </div>
  );
}

export function PIFEditorModal({ open, onClose, orderItem, orderId, onGenerated }) {
  const [pif, setPif] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  // All sibling PIFs for the parent order — one per product line. Lets the
  // user jump between products without leaving the editor.
  const [siblings, setSiblings] = useState([]);
  const [activeItem, setActiveItem] = useState(orderItem || null);
  const loadedFor = useRef(null);
  // Fetch-from-existing popup state. The button under the header opens it;
  // selecting a candidate asks for confirmation, then clones the PIF
  // payload into the current order_item.
  const [fetchOpen, setFetchOpen] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchMatches, setFetchMatches] = useState([]);
  const [confirmCandidate, setConfirmCandidate] = useState(null);
  const [cloning, setCloning] = useState(false);

  // Reset the "active item" whenever the modal is opened with a different
  // entry point so the parent's chosen product still shows first.
  useEffect(() => {
    if (open && orderItem) setActiveItem(orderItem);
  }, [open, orderItem]);

  useEffect(() => {
    if (!open || !activeItem) return;
    if (loadedFor.current === activeItem.order_item_id) return;
    loadedFor.current = activeItem.order_item_id;
    setLoading(true);
    api.post("/finance/pif/create-from-order-item/", { order_item_id: activeItem.order_item_id })
      .then((res) => setPif(res.data))
      .catch(() => {
        toast.error("Failed to load PIF");
        loadedFor.current = null;
      })
      .finally(() => setLoading(false));
  }, [open, activeItem]);

  // Pull every sibling PIF row for this order so the strip can list them.
  useEffect(() => {
    if (!open || !orderId) return;
    api.get("/finance/pif/status-for-order/", { params: { order_id: orderId } })
      .then((r) => setSiblings(r.data?.items || []))
      .catch(() => setSiblings([]));
  }, [open, orderId, pif?.id]);

  const switchTo = (item) => {
    if (!item || item.order_item_id === activeItem?.order_item_id) return;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }
    loadedFor.current = null;
    setPif(null);
    setActiveItem(item);
  };

  useEffect(() => {
    if (!open) {
      loadedFor.current = null;
      setPif(null);
    }
  }, [open]);

  const patch = (partial) => setPif((p) => ({ ...p, ...partial }));

  const updateContainerLeft = (key, value) => {
    setPif((p) => ({ ...p, container_left: { ...(p.container_left || {}), [key]: value } }));
  };
  const updateContainerRight = (key, value) => {
    setPif((p) => ({ ...p, container_right: { ...(p.container_right || {}), [key]: value } }));
  };
  const updateSectionLabel = (idx, value) => {
    setPif((p) => {
      const next = [...(p.packing_sections || [])];
      next[idx] = { ...next[idx], label: value };
      return { ...p, packing_sections: next };
    });
  };
  const updateSectionField = (idx, side, key, value) => {
    setPif((p) => {
      const next = [...(p.packing_sections || [])];
      const sec = { ...next[idx] };
      sec[side] = { ...(sec[side] || {}), [key]: value };
      next[idx] = sec;
      return { ...p, packing_sections: next };
    });
  };
  const addSection = () => {
    setPif((p) => ({
      ...p,
      packing_sections: [...(p.packing_sections || []), { label: "New Packing", quantity_left: {}, accessories_right: {} }],
    }));
  };
  const removeSection = (idx) => {
    setPif((p) => ({
      ...p,
      packing_sections: (p.packing_sections || []).filter((_, i) => i !== idx),
    }));
  };

  const save = async () => {
    if (!pif) return null;
    setSaving(true);
    try {
      const res = await api.patch(`/finance/pif/${pif.id}/`, {
        pif_number: pif.pif_number,
        po_no: pif.po_no,
        pif_date: pif.pif_date,
        product_name: pif.product_name,
        product_description: pif.product_description,
        packing_description: pif.packing_description,
        quantity: pif.quantity,
        notes: pif.notes,
        container_left: pif.container_left,
        container_right: pif.container_right,
        packing_sections: pif.packing_sections,
        footer_note: pif.footer_note,
      });
      setPif(res.data);
      toast.success("Saved");
      return res.data;
    } catch { toast.error("Failed to save"); return null; }
    finally { setSaving(false); }
  };

  // Preview saves the current edits and renders the PDF inline (within
  // this modal) so the user can review without leaving the editor.
  const preview = async () => {
    if (!pif) return;
    const saved = await save();
    if (!saved) return;
    setPreviewing(true);
    try {
      const res = await api.get(`/finance/pif/${pif.id}/generate-pdf/`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      // Revoke any previous URL to avoid leaks across re-previews.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch { toast.error("Failed to render preview"); }
    finally { setPreviewing(false); }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  // Free the blob URL when the modal closes entirely.
  useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }, [open]);

  const generatePdf = async () => {
    if (!pif) return;
    const saved = await save();
    if (!saved) return;
    setGenerating(true);
    try {
      const res = await api.get(`/finance/pif/${pif.id}/generate-pdf/`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("PDF generated & saved to Documents");
      onGenerated?.();
    } catch { toast.error("Failed to generate PDF"); }
    finally { setGenerating(false); }
  };

  const openFetchPopup = async () => {
    if (!activeItem?.order_item_id) { toast.error("No product context yet"); return; }
    setFetchOpen(true);
    setFetchLoading(true);
    setFetchMatches([]);
    try {
      const r = await api.get("/finance/pif/find-matching/", {
        params: { order_item_id: activeItem.order_item_id },
      });
      setFetchMatches(r.data?.matches || []);
    } catch { toast.error("Failed to find existing PIFs"); }
    finally { setFetchLoading(false); }
  };

  const confirmFetch = async () => {
    if (!confirmCandidate || !activeItem?.order_item_id) return;
    setCloning(true);
    try {
      const r = await api.post(`/finance/pif/${confirmCandidate.pif_id}/clone-into-order-item/`, {
        target_order_item_id: activeItem.order_item_id,
      });
      setPif(r.data);
      loadedFor.current = activeItem.order_item_id;
      toast.success(`PIF data copied from ${confirmCandidate.pif_number}`);
      setConfirmCandidate(null);
      setFetchOpen(false);
    } catch { toast.error("Failed to fetch PIF"); }
    finally { setCloning(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full my-4">
        <div className="sticky top-0 bg-white z-10 px-5 py-3 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="font-semibold">Packing Instructions Form</h2>
            <p className="text-xs text-gray-500">
              {pif?.pif_number || "Loading..."}{activeItem?.product_name ? ` · ${activeItem.product_name}` : ""}
              {siblings.length > 1 && (() => {
                const idx = siblings.findIndex((s) => s.order_item_id === activeItem?.order_item_id);
                return idx >= 0 ? <span className="ml-1">· PIF {idx + 1} of {siblings.length}</span> : null;
              })()}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openFetchPopup}
              disabled={!activeItem}
              title="Fetch an existing PIF for the same client & product from another order"
              className="px-3 py-1.5 text-sm border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-40 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Fetch existing
            </button>
            <button onClick={save} disabled={saving || !pif} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">{saving ? "Saving..." : "Save"}</button>
            <button onClick={preview} disabled={previewing || !pif} className="px-3 py-1.5 text-sm border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-40">{previewing ? "Rendering..." : "👁 Preview"}</button>
            <button onClick={generatePdf} disabled={generating || !pif} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">{generating ? "Generating..." : "Save & Generate PDF"}</button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
          </div>
        </div>

        {/* Sibling-PIF tabs — one tab per product line on the parent
            order. Status pip shows whether each PIF is generated already. */}
        {siblings.length > 1 && (
          <div className="sticky top-[57px] bg-white z-10 px-5 py-2 border-b border-gray-200 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 mr-1">Products in this order:</span>
            {siblings.map((s) => {
              const active = s.order_item_id === activeItem?.order_item_id;
              const state = s.has_pdf ? "ready" : s.pif_id ? "draft" : "missing";
              const pip = state === "ready" ? "bg-emerald-500" : state === "draft" ? "bg-amber-400" : "bg-gray-300";
              return (
                <button
                  key={s.order_item_id}
                  onClick={() => switchTo(s)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition ${active
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"}`}
                  title={state === "ready" ? "PDF generated" : state === "draft" ? "Saved draft — needs PDF" : "Not started"}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${pip}`} />
                  <span className="truncate max-w-[180px]">{s.product_name || `Item ${s.order_item_id}`}</span>
                  {s.pif_number && <span className={`text-[10px] ${active ? "text-indigo-100" : "text-gray-400"}`}>· {s.pif_number}</span>}
                </button>
              );
            })}
          </div>
        )}

        {loading || !pif ? (
          <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
        ) : (
          <div className="p-8 bg-white" style={{ minHeight: "70vh" }}>
            {/* Document-style canvas */}
            <div className="mx-auto" style={{ maxWidth: "780px" }}>
              {/* Header */}
              <div className="grid grid-cols-[1fr_2fr_1fr] items-start gap-4 pb-3 border-b border-gray-300">
                <div>
                  <div className="font-bold text-[#4e8a2d] text-lg leading-tight">Kriya</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold">Packing Instructions Form</div>
                </div>
                <div className="text-[11px] space-y-1">
                  <div className="flex gap-1"><span className="font-semibold w-20 shrink-0">PO No</span>:
                    <input value={pif.po_no || ""} onChange={(e) => patch({ po_no: e.target.value })} className="flex-1 bg-transparent outline-none border-b border-transparent focus:border-indigo-400" />
                  </div>
                  <div className="flex gap-1"><span className="font-semibold w-20 shrink-0">PI Form No</span>:
                    <input value={pif.pif_number || ""} onChange={(e) => patch({ pif_number: e.target.value })} className="flex-1 bg-transparent outline-none border-b border-transparent focus:border-indigo-400" />
                  </div>
                  <div className="flex gap-1"><span className="font-semibold w-20 shrink-0">Date</span>:
                    <input type="date" value={pif.pif_date || ""} onChange={(e) => patch({ pif_date: e.target.value })} className="flex-1 bg-transparent outline-none border-b border-transparent focus:border-indigo-400" />
                  </div>
                </div>
              </div>

              {/* Product Details / Notes */}
              <SectionHeading left="Product Details" right="Notes" />
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div>
                  <KVRow label="Product Name" value={pif.product_name} onChange={(v) => patch({ product_name: v })} />
                  <KVRow label="Product Description" value={pif.product_description} onChange={(v) => patch({ product_description: v })} />
                  <KVRow label="Packing Description" value={pif.packing_description} onChange={(v) => patch({ packing_description: v })} />
                  <KVRow label="Quantity" value={pif.quantity} onChange={(v) => patch({ quantity: v })} />
                </div>
                <div>
                  <textarea
                    value={pif.notes || ""}
                    onChange={(e) => patch({ notes: e.target.value })}
                    className="w-full h-32 text-[11px] border border-gray-300 rounded p-2 outline-none focus:border-indigo-400 resize-none"
                    placeholder="Notes, batch info, mfg/exp dates, etc."
                  />
                </div>
              </div>

              {/* Container / Carton Box */}
              <SectionHeading left="Container" right="Carton Box" />
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div>
                  {CONTAINER_LEFT_FIELDS.map(([k, label]) => (
                    <KVRow key={k} label={label} value={pif.container_left?.[k]} onChange={(v) => updateContainerLeft(k, v)} />
                  ))}
                </div>
                <div>
                  {CONTAINER_RIGHT_FIELDS.map(([k, label]) => (
                    <KVRow key={k} label={label} value={pif.container_right?.[k]} onChange={(v) => updateContainerRight(k, v)} />
                  ))}
                </div>
              </div>

              {/* Packing Sections */}
              {(pif.packing_sections || []).map((sec, idx) => (
                <div key={idx}>
                  <div className="grid grid-cols-2 gap-6 mt-4 items-center">
                    <div className="flex items-center gap-2 border-b border-[#1f4e79] pb-1">
                      <span className="text-[12px] font-semibold text-[#1f4e79] shrink-0">Quantity –</span>
                      <input value={sec.label || ""} onChange={(e) => updateSectionLabel(idx, e.target.value)} className="text-[12px] font-semibold text-[#1f4e79] bg-transparent outline-none flex-1 border-b border-transparent focus:border-indigo-400" />
                      <span className="text-[12px] font-semibold text-[#1f4e79] shrink-0">Packing</span>
                    </div>
                    <div className="flex items-center gap-2 border-b border-[#1f4e79] pb-1">
                      <span className="text-[12px] font-semibold text-[#1f4e79]">Container Accessories – {sec.label || ""}</span>
                      <button onClick={() => removeSection(idx)} title="Remove section" className="ml-auto text-xs text-red-500 hover:text-red-700">✕</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 mt-2">
                    <div>
                      {QTY_LEFT_FIELDS.map(([k, label]) => (
                        <KVRow key={k} label={label} value={sec.quantity_left?.[k]} onChange={(v) => updateSectionField(idx, "quantity_left", k, v)} />
                      ))}
                    </div>
                    <div>
                      {ACC_RIGHT_FIELDS.map(([k, label]) => (
                        <KVRow key={k} label={label} value={sec.accessories_right?.[k]} onChange={(v) => updateSectionField(idx, "accessories_right", k, v)} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-4">
                <button onClick={addSection} className="px-3 py-1.5 text-xs border border-dashed border-gray-400 rounded-lg hover:bg-gray-50 text-gray-600">+ Add Packing Section</button>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-300">
                <textarea
                  value={pif.footer_note || ""}
                  onChange={(e) => patch({ footer_note: e.target.value })}
                  className="w-full text-[10px] text-gray-600 bg-transparent outline-none resize-none border border-transparent focus:border-indigo-300 rounded p-1"
                  rows={2}
                />
                <div className="grid grid-cols-3 gap-4 mt-12 text-[11px] text-gray-500">
                  <div className="text-center border-t border-gray-400 pt-1">Seal &amp; Signature</div>
                  <div className="text-center border-t border-gray-400 pt-1">Seal &amp; Signature</div>
                  <div className="text-center border-t border-gray-400 pt-1">Seal &amp; Signature</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline PDF preview — overlays the editor without leaving the page. */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-white">
              <div className="text-sm font-semibold">PIF Preview</div>
              <div className="text-xs text-gray-300">{pif?.pif_number || ""}{activeItem?.product_name ? ` · ${activeItem.product_name}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href={previewUrl} download={`${pif?.pif_number || "PIF"}.pdf`} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded">⬇ Download</a>
              <button onClick={generatePdf} disabled={generating} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50">{generating ? "Saving…" : "Save & Open"}</button>
              <button onClick={closePreview} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded">✕ Close Preview</button>
            </div>
          </div>
          <iframe src={previewUrl} title="PIF Preview" className="flex-1 bg-white" />
        </div>
      )}

      {/* Fetch-from-existing popup */}
      {fetchOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !cloning && setFetchOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-gradient-to-br from-emerald-600 to-emerald-700">
              <h3 className="font-bold text-white text-base">Fetch existing PIF</h3>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                Same client, same product — pick a previous order to copy from
              </p>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {fetchLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Searching…</div>
              ) : fetchMatches.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No existing PIF found for this client &amp; product on any other order.
                </div>
              ) : (
                <div className="space-y-2">
                  {fetchMatches.map((m) => (
                    <button
                      key={m.pif_id}
                      onClick={() => setConfirmCandidate(m)}
                      disabled={cloning}
                      className="w-full text-left p-3 border border-gray-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-800 truncate">{m.order_number || "—"}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {m.pif_number}{m.pif_date ? ` · ${m.pif_date}` : ""}{m.product_name ? ` · ${m.product_name}` : ""}
                          </p>
                        </div>
                        {m.has_pdf && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">PDF ready</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setFetchOpen(false)} disabled={cloning} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm-copy dialog */}
      {confirmCandidate && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => !cloning && setConfirmCandidate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="font-bold text-slate-800 text-base">Copy PIF from {confirmCandidate.order_number}?</h3>
              <p className="text-xs text-gray-600 mt-2">
                This will replace the current PIF's product/packing details
                with the data from <span className="font-semibold">{confirmCandidate.pif_number}</span>.
                Every field stays editable afterwards — and the PDF won't be
                regenerated until you click Save &amp; Generate.
              </p>
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2">
              <button onClick={() => setConfirmCandidate(null)} disabled={cloning} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
              <button onClick={confirmFetch} disabled={cloning} className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                {cloning ? "Copying…" : "Yes, copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PIFListModal({ open, onClose, orderId, onAllReady }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // orderItem row
  const [attaching, setAttaching] = useState(false);

  const load = () => {
    if (!orderId) return;
    setLoading(true);
    api.get("/finance/pif/status-for-order/", { params: { order_id: orderId } })
      .then((r) => setStatus(r.data))
      .catch(() => toast.error("Failed to load PIF status"))
      .finally(() => setLoading(false));
  };

  const attachAllToEmail = async () => {
    setAttaching(true);
    try {
      const res = await api.post("/finance/pif/attach-all-to-email/", { order_id: orderId });
      const commId = res.data.communication_id;
      const draftId = res.data.draft_id;
      toast.success(`Attached ${res.data.pif_count} PIF(s) — opening draft`);
      if (commId) {
        const qs = draftId ? `?draft=${draftId}` : "";
        window.location.href = `/communications/${commId}${qs}`;
      } else {
        toast("No source thread — open Communications to find the draft.", { icon: "ℹ️" });
      }
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to attach PIFs";
      toast.error(msg);
    } finally { setAttaching(false); }
  };

  useEffect(() => { if (open) load(); }, [open, orderId]);

  useEffect(() => { if (status?.all_ready) onAllReady?.(); }, [status?.all_ready]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Packing Instructions Forms</h3>
              <p className="text-xs text-gray-500">One PIF is required per product line. Advance to Product Readiness once all are generated.</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
            ) : (status?.items || []).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">This order has no line items.</p>
            ) : (
              (status?.items || []).map((it) => {
                const state = it.has_pdf ? "ready" : it.pif_id ? "draft" : "missing";
                const stateLabel = { ready: "✓ Generated", draft: "● Draft", missing: "○ Missing" }[state];
                const stateColor = { ready: "text-emerald-700 bg-emerald-50 border-emerald-200",
                  draft: "text-amber-700 bg-amber-50 border-amber-200",
                  missing: "text-gray-700 bg-gray-50 border-gray-200" }[state];
                return (
                  <div key={it.order_item_id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{it.product_name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {it.client_product_name ? `${it.client_product_name} · ` : ""}
                        {it.quantity} {it.unit}
                        {it.pif_number ? ` · ${it.pif_number}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${stateColor}`}>{stateLabel}</span>
                      <button onClick={() => setEditing(it)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        {state === "missing" ? "Create" : state === "draft" ? "Edit & Generate" : "Edit"}
                      </button>
                      {/* Attach option — upload a pre-existing PIF PDF directly.
                          Creates the PIF row if missing, otherwise replaces it. */}
                      {state !== "ready" && (
                        <button
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "application/pdf,image/*";
                            input.onchange = async () => {
                              const f = input.files?.[0];
                              if (!f) return;
                              const fd = new FormData();
                              fd.append("file", f);
                              try {
                                if (it.pif_id) {
                                  await api.post(`/finance/pif/${it.pif_id}/replace-pdf/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                                } else {
                                  fd.append("order_item_id", it.order_item_id);
                                  await api.post(`/finance/pif/upload-for-order-item/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                                }
                                toast.success("PIF attached");
                                load();
                              } catch { toast.error("Failed to attach PIF"); }
                            };
                            input.click();
                          }}
                          className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                        >
                          Attach
                        </button>
                      )}
                      {state === "ready" && it.pif_id && (
                        <button
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "application/pdf,image/*";
                            input.onchange = async () => {
                              const f = input.files?.[0];
                              if (!f) return;
                              const fd = new FormData();
                              fd.append("file", f);
                              try {
                                await api.post(`/finance/pif/${it.pif_id}/replace-pdf/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                                toast.success("PIF replaced");
                                load();
                              } catch { toast.error("Failed to replace PIF"); }
                            };
                            input.click();
                          }}
                          className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                        >
                          Replace
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-gray-500">{status ? `${(status.items || []).filter(i => i.has_pdf).length} of ${status.count} generated` : ""}</span>
            <div className="flex items-center gap-2">
              {status?.all_ready && (
                <span className="text-xs font-medium text-emerald-700">All PIFs ready — you can advance the order.</span>
              )}
              <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Done</button>
            </div>
          </div>
        </div>
      </div>

      <PIFEditorModal
        open={!!editing}
        orderItem={editing}
        orderId={orderId}
        onClose={() => setEditing(null)}
        onGenerated={load}
      />
    </>
  );
}
