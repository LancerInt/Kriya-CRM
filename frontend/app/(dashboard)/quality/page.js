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

export default function QualityPage() {
  const [activeTab, setActiveTab] = useState("inspections");
  const [inspections, setInspections] = useState([]);
  const [coas, setCoas] = useState([]);
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [loadingCoas, setLoadingCoas] = useState(true);
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

  useEffect(() => {
    loadInspections();
    loadCoas();
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
    { key: "shipment_number", label: "Shipment", render: (row) => <span className="font-medium">{row.shipment_number || row.shipment_display || "\u2014"}</span> },
    { key: "inspection_type", label: "Type", render: (row) => <StatusBadge status={row.inspection_type} /> },
    { key: "inspector_name", label: "Inspector", render: (row) => row.inspector_name || "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "inspection_date", label: "Date", render: (row) => row.inspection_date ? format(new Date(row.inspection_date), "MMM d, yyyy") : "\u2014" },
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
        subtitle="Manage inspections and COA documents"
        action={
          <button
            onClick={() => activeTab === "inspections" ? setShowInspectionModal(true) : setShowCoaModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            {activeTab === "inspections" ? "+ New Inspection" : "+ Upload COA"}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab("inspections")} className={tabClass("inspections")}>Inspections</button>
        <button onClick={() => setActiveTab("coa")} className={tabClass("coa")}>COA Documents</button>
      </div>

      {/* Inspections Tab */}
      {activeTab === "inspections" && (
        <DataTable
          columns={inspectionColumns}
          data={inspections}
          loading={loadingInspections}
          emptyTitle="No inspections yet"
          emptyDescription="Create your first quality inspection"
        />
      )}

      {/* COA Tab */}
      {activeTab === "coa" && (
        <DataTable
          columns={coaColumns}
          data={coas}
          loading={loadingCoas}
          emptyTitle="No COA documents yet"
          emptyDescription="Upload your first Certificate of Analysis"
        />
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
