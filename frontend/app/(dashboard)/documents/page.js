"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { HiOutlineArrowDownTray } from "react-icons/hi2";

const initialForm = { name: "", category: "commercial", client: "", order: "", shipment: "", file: null, version: "1.0", notes: "" };

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  // Dropdown options
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [shipments, setShipments] = useState([]);

  useEffect(() => {
    loadDocuments();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
    api.get("/orders/").then((r) => setOrders(r.data.results || r.data)).catch(() => {});
    api.get("/shipments/").then((r) => setShipments(r.data.results || r.data)).catch(() => {});
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.get("/documents/");
      setDocuments(res.data.results || res.data);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("category", form.category);
      if (form.client) formData.append("client", form.client);
      if (form.order) formData.append("order", form.order);
      if (form.shipment) formData.append("shipment", form.shipment);
      if (form.file) formData.append("file", form.file);
      formData.append("version", form.version);
      if (form.notes) formData.append("notes", form.notes);

      await api.post("/documents/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      setShowModal(false);
      setForm(initialForm);
      loadDocuments();
    } catch {
      toast.error("Failed to upload document");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: "name", label: "Name", render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "category", label: "Category", render: (row) => <StatusBadge status={row.category} /> },
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "version", label: "Version", render: (row) => row.version || "1.0" },
    { key: "created_at", label: "Uploaded", render: (row) => row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "\u2014" },
    { key: "download", label: "", render: (row) => row.file ? (
      <a href={row.file} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
        <HiOutlineArrowDownTray className="w-4 h-4" />
        Download
      </a>
    ) : null },
  ];

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Manage trade documents"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Upload Document
          </button>
        }
      />
      <DataTable columns={columns} data={documents} loading={loading} emptyTitle="No documents yet" emptyDescription="Upload your first document to get started" />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Upload Document" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="commercial">Commercial</option>
                <option value="quality">Quality</option>
                <option value="regulatory">Regulatory</option>
                <option value="financial">Financial</option>
                <option value="sample">Sample</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
              <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <select value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">None</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number || `ORD-${o.id?.slice(0, 8)}`}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shipment</label>
              <select value={form.shipment} onChange={(e) => setForm({ ...form, shipment: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">None</option>
                {shipments.map((s) => <option key={s.id} value={s.id}>{s.shipment_number || s.name || `SHP-${s.id?.slice(0, 8)}`}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files[0] || null })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Uploading..." : "Upload Document"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
