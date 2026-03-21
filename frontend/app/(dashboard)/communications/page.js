"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCommunications, createCommunication } from "@/store/slices/communicationSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";

export default function CommunicationsPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.communications);
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client: "", comm_type: "email", direction: "inbound", subject: "", content: "" });

  useEffect(() => {
    dispatch(fetchCommunications());
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createCommunication(form)).unwrap();
      toast.success("Communication logged");
      setShowModal(false);
      setForm({ client: "", comm_type: "email", direction: "inbound", subject: "", content: "" });
    } catch {
      toast.error("Failed to log communication");
    }
  };

  const columns = [
    { key: "comm_type", label: "Type", render: (row) => <StatusBadge status={row.comm_type} /> },
    { key: "direction", label: "Direction", render: (row) => <span className={`text-xs font-medium ${row.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>{row.direction}</span> },
    { key: "subject", label: "Subject", render: (row) => <span className="font-medium">{row.subject || "\u2014"}</span> },
    { key: "client_name", label: "Client" },
    { key: "created_at", label: "Date", render: (row) => format(new Date(row.created_at), "MMM d, yyyy HH:mm") },
  ];

  return (
    <div>
      <PageHeader
        title="Communications"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Log Communication
          </button>
        }
      />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No communications" emptyDescription="Log your first communication" />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Log Communication" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.comm_type} onChange={(e) => setForm({ ...form, comm_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Log Communication</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
