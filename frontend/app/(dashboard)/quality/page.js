"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import InspectionGrid, { MediaLightbox } from "@/components/quality/InspectionGrid";
import CoaGrid from "@/components/quality/CoaGrid";

export default function QualityPage() {
  const [activeTab, setActiveTab] = useState("inspections");
  const [inspections, setInspections] = useState([]);
  const [coas, setCoas] = useState([]);
  const [msdsList, setMsdsList] = useState([]);
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [loadingCoas, setLoadingCoas] = useState(true);
  const [loadingMsds, setLoadingMsds] = useState(true);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showCoaModal, setShowCoaModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [products, setProducts] = useState([]);
  const [inspectionForm, setInspectionForm] = useState({
    shipment: "",
    inspection_date: "",
    inspector_name: "",
    inspection_type: "pre_dispatch",
    status: "pending",
    notes: "",
  });
  const [lightbox, setLightbox] = useState(null); // { inspection, index } | null
  const [coaForm, setCoaForm] = useState({
    shipment: "",
    product: "",
    coa_type: "lab",
    file: null,
    version: "",
    notes: "",
  });

  const loadInspections = () => {
    setLoadingInspections(true);
    api.get("/quality/inspections/")
      .then((r) => setInspections(r.data.results || r.data))
      .catch(() => toast.error("Failed to load inspections"))
      .finally(() => setLoadingInspections(false));
  };

  const loadCoas = () => {
    setLoadingCoas(true);
    api.get("/quality/coa/")
      .then((r) => setCoas(r.data.results || r.data))
      .catch(() => toast.error("Failed to load COA documents"))
      .finally(() => setLoadingCoas(false));
  };

  const loadMsds = () => {
    setLoadingMsds(true);
    api.get("/quality/msds/")
      .then((r) => setMsdsList(r.data.results || r.data))
      .catch(() => toast.error("Failed to load MSDS documents"))
      .finally(() => setLoadingMsds(false));
  };

  useEffect(() => {
    loadInspections();
    loadCoas();
    loadMsds();
    api.get("/shipments/").then((r) => setShipments(r.data.results || r.data)).catch(() => {});
    api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleCreateInspection = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/quality/inspections/", inspectionForm);
      toast.success("Inspection created");
      setShowInspectionModal(false);
      setInspectionForm({ shipment: "", inspection_date: "", inspector_name: "", inspection_type: "pre_dispatch", status: "pending", notes: "" });
      loadInspections();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create inspection")); } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCoa = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("shipment", coaForm.shipment);
      formData.append("product", coaForm.product);
      formData.append("coa_type", coaForm.coa_type);
      if (coaForm.file) formData.append("file", coaForm.file);
      if (coaForm.version) formData.append("version", coaForm.version);
      if (coaForm.notes) formData.append("notes", coaForm.notes);

      await api.post("/quality/coa/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("COA uploaded");
      setShowCoaModal(false);
      setCoaForm({ shipment: "", product: "", coa_type: "lab", file: null, version: "", notes: "" });
      loadCoas();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to upload COA")); } finally {
      setSubmitting(false);
    }
  };

  const inspectionColumns = [
    { key: "order_number", label: "Order #", render: (row) => (
      <span className="font-medium text-blue-700">{row.order_number || row.shipment_number || row.shipment_display || "—"}</span>
    )},
    { key: "client_name", label: "Client", render: (row) => row.client_name || "—" },
    { key: "status", label: "Result", render: (row) => {
      const s = row.status;
      const cls = s === "passed"
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : s === "failed"
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-gray-100 text-gray-700 border-gray-200";
      const label = s === "passed" ? "Passed" : s === "failed" ? "Failed" : (s || "—");
      return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>{s === "passed" ? "✓" : s === "failed" ? "✗" : "•"} {label}</span>;
    }},
    { key: "media_count", label: "Photos", render: (row) => (
      <span className="text-gray-700">{row.media_count != null ? `${row.media_count} photo${row.media_count === 1 ? "" : "s"}` : "—"}</span>
    )},
    { key: "inspection_type", label: "Type", render: (row) => <StatusBadge status={row.inspection_type} /> },
    { key: "inspection_date", label: "Date", render: (row) => row.inspection_date ? format(new Date(row.inspection_date), "MMM d, yyyy") : (row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "—") },
  ];

  const coaColumns = [
    { key: "shipment_number", label: "Shipment", render: (row) => <span className="font-medium">{row.shipment_number || row.shipment_display || "\u2014"}</span> },
    { key: "product_name", label: "Product", render: (row) => row.product_name || row.product_display || "\u2014" },
    { key: "coa_type", label: "Type", render: (row) => <span className="capitalize text-sm">{row.coa_type === "lab" ? "Lab" : "Client"}</span> },
    { key: "version", label: "Version", render: (row) => row.version || "\u2014" },
    { key: "created_at", label: "Date", render: (row) => row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "\u2014" },
    { key: "file", label: "", render: (row) => row.file && (
      <a href={row.file} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Download</a>
    )},
  ];

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none";

  const tabClass = (tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg ${
      activeTab === tab
        ? "bg-indigo-600 text-white"
        : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div>
      <PageHeader
        title="Quality"
        subtitle="Manage inspections, COA, and MSDS documents"
        action={null}
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab("inspections")} className={tabClass("inspections")}>Inspections</button>
        <button onClick={() => setActiveTab("coa")} className={tabClass("coa")}>COA Documents</button>
        <button onClick={() => setActiveTab("msds")} className={tabClass("msds")}>MSDS Documents</button>
      </div>

      {/* Inspections Tab — card grid with inline media previews */}
      {activeTab === "inspections" && (
        loadingInspections ? (
          <div className="flex justify-center items-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-700 font-medium">No inspections yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first quality inspection</p>
          </div>
        ) : (
          <InspectionGrid
            inspections={inspections}
            onOpenViewer={(insp, idx) => setLightbox({ inspection: insp, index: idx })}
          />
        )
      )}

      {/* Lightbox viewer — image / audio / video / file preview */}
      {lightbox && (
        <MediaLightbox
          inspection={lightbox.inspection}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* MSDS Tab — same card grid as COA, normalized to coa_type for the badge */}
      {activeTab === "msds" && (
        loadingMsds ? (
          <div className="flex justify-center items-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : msdsList.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-700 font-medium">No MSDS documents yet</p>
            <p className="text-gray-400 text-sm mt-1">Generated/uploaded MSDS files from sales orders show up here automatically.</p>
          </div>
        ) : (
          <CoaGrid
            coas={msdsList.map((m) => ({ ...m, coa_type: m.msds_type }))}
            onOpen={(m) => setLightbox({
              inspection: {
                order_number: m.order_number || m.shipment_number || "MSDS",
                status: m.coa_type === "client" ? "client" : (m.coa_type === "logistic" ? "logistic" : ""),
                media: [{ id: m.id, file: m.file }],
              },
              index: 0,
            })}
          />
        )
      )}

      {/* COA Tab — card grid, opens PDF/image previews in the same lightbox */}
      {activeTab === "coa" && (
        loadingCoas ? (
          <div className="flex justify-center items-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : coas.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-700 font-medium">No COA documents yet</p>
            <p className="text-gray-400 text-sm mt-1">Generated/uploaded COAs from sales orders show up here automatically.</p>
          </div>
        ) : (
          <CoaGrid coas={coas} onOpen={(coa) => setLightbox({
            inspection: {
              order_number: coa.order_number || coa.shipment_number || "COA",
              status: coa.coa_type === "client" ? "client" : (coa.coa_type === "logistic" ? "logistic" : ""),
              media: [{ id: coa.id, file: coa.file }],
            },
            index: 0,
          })} />
        )
      )}

      {/* Inspection Modal */}
      <Modal open={showInspectionModal} onClose={() => setShowInspectionModal(false)} title="New Inspection" size="lg">
        <form onSubmit={handleCreateInspection} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipment *</label>
              <select value={inspectionForm.shipment} onChange={(e) => setInspectionForm({ ...inspectionForm, shipment: e.target.value })} required className={inputClass}>
                <option value="">Select Shipment</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.shipment_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Date *</label>
              <input type="date" value={inspectionForm.inspection_date} onChange={(e) => setInspectionForm({ ...inspectionForm, inspection_date: e.target.value })} required className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inspector Name *</label>
              <input value={inspectionForm.inspector_name} onChange={(e) => setInspectionForm({ ...inspectionForm, inspector_name: e.target.value })} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={inspectionForm.inspection_type} onChange={(e) => setInspectionForm({ ...inspectionForm, inspection_type: e.target.value })} className={inputClass}>
                <option value="pre_dispatch">Pre-Dispatch</option>
                <option value="container_loading">Container Loading</option>
                <option value="third_party">Third Party</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={inspectionForm.status} onChange={(e) => setInspectionForm({ ...inspectionForm, status: e.target.value })} className={inputClass}>
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="conditional">Conditional</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={inspectionForm.notes} onChange={(e) => setInspectionForm({ ...inspectionForm, notes: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Inspection"}
            </button>
            <button type="button" onClick={() => setShowInspectionModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* COA Upload Modal */}
      <Modal open={showCoaModal} onClose={() => setShowCoaModal(false)} title="Upload COA" size="lg">
        <form onSubmit={handleCreateCoa} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipment *</label>
              <select value={coaForm.shipment} onChange={(e) => setCoaForm({ ...coaForm, shipment: e.target.value })} required className={inputClass}>
                <option value="">Select Shipment</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.shipment_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <select value={coaForm.product} onChange={(e) => setCoaForm({ ...coaForm, product: e.target.value })} required className={inputClass}>
                <option value="">Select Product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">COA Type</label>
              <select value={coaForm.coa_type} onChange={(e) => setCoaForm({ ...coaForm, coa_type: e.target.value })} className={inputClass}>
                <option value="lab">Lab</option>
                <option value="client">Client</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input value={coaForm.version} onChange={(e) => setCoaForm({ ...coaForm, version: e.target.value })} placeholder="e.g. 1.0" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
              <input type="file" onChange={(e) => setCoaForm({ ...coaForm, file: e.target.files[0] || null })} required className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={coaForm.notes} onChange={(e) => setCoaForm({ ...coaForm, notes: e.target.value })} rows={3} className={inputClass} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Uploading..." : "Upload COA"}
            </button>
            <button type="button" onClick={() => setShowCoaModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
