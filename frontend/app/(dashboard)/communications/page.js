"use client";
import { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCommunications, createCommunication } from "@/store/slices/communicationSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import ComposeEmailModal from "@/components/communications/ComposeEmailModal";
import SendWhatsAppModal from "@/components/communications/SendWhatsAppModal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";
import AISummaryButton from "@/components/ai/AISummaryButton";
import { getErrorMessage } from "@/lib/errorHandler";

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "email", label: "Emails" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "call", label: "Calls" },
  { key: "note", label: "Notes" },
  { key: "unmatched", label: "Unmatched" },
];

export default function CommunicationsPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.communications);
  const [showModal, setShowModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client: "", comm_type: "email", direction: "inbound", subject: "", content: "" });
  const [filterTab, setFilterTab] = useState("all");
  const [assignModal, setAssignModal] = useState(null);
  const [assignClient, setAssignClient] = useState("");

  useEffect(() => {
    dispatch(fetchCommunications());
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const filteredList = useMemo(() => {
    if (filterTab === "all") return list;
    if (filterTab === "unmatched") return list.filter((item) => !item.client);
    return list.filter((item) => item.comm_type === filterTab);
  }, [list, filterTab]);

  const unmatchedCount = useMemo(() => list.filter((item) => !item.client).length, [list]);

  const handleAssignClient = async () => {
    if (!assignClient || !assignModal) return;
    try {
      await api.patch(`/communications/${assignModal}/`, { client: assignClient });
      toast.success("Client assigned");
      setAssignModal(null);
      setAssignClient("");
      dispatch(fetchCommunications());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to assign client")); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createCommunication(form)).unwrap();
      toast.success("Communication logged");
      setShowModal(false);
      setForm({ client: "", comm_type: "email", direction: "inbound", subject: "", content: "" });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to log communication")); }
  };

  const handleSent = () => {
    dispatch(fetchCommunications());
  };

  const columns = [
    { key: "comm_type", label: "Type", render: (row) => <StatusBadge status={row.comm_type} /> },
    { key: "direction", label: "Direction", render: (row) => <span className={`text-xs font-medium ${row.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>{row.direction}</span> },
    { key: "subject", label: "Subject", render: (row) => <span className="font-medium">{row.subject || "\u2014"}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name ? (
      <span>{row.client_name}</span>
    ) : (
      <button onClick={(e) => { e.stopPropagation(); setAssignModal(row.id); setAssignClient(""); }} className="text-xs text-orange-600 hover:text-orange-700 font-medium bg-orange-50 px-2 py-1 rounded">
        Assign Client
      </button>
    )},
    { key: "external_contact", label: "External Party", render: (row) => <span className="text-sm text-gray-600">{row.external_email || row.external_phone || "\u2014"}</span> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy HH:mm"); } catch { return "\u2014"; } } },
  ];

  return (
    <div>
      <PageHeader
        title="Communications"
        action={
          <div className="flex gap-2">
            <AISummaryButton variant="button" title="Communications Summary" prompt="Summarize all recent client communications. Use get_recent_communications tool to fetch the latest emails, WhatsApp messages, calls and notes. Group by client, highlight important items, pending replies, and suggested follow-ups." />
            <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Compose Email
            </button>
            <button onClick={() => setShowWhatsAppModal(true)} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              Send WhatsApp
            </button>
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              + Log Communication
            </button>
          </div>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg ${
              filterTab === tab.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {tab.label}{tab.key === "unmatched" && unmatchedCount > 0 ? ` (${unmatchedCount})` : ""}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filteredList} loading={loading} emptyTitle="No communications" emptyDescription="Log your first communication" />

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

      <ComposeEmailModal open={showEmailModal} onClose={() => setShowEmailModal(false)} onSent={handleSent} />
      <SendWhatsAppModal open={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} onSent={handleSent} />

      {/* Assign Client Modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Assign to Client">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This communication was not auto-matched to any client. Select a client to assign it to:</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select value={assignClient} onChange={(e) => setAssignClient(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select Client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleAssignClient} disabled={!assignClient} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">Assign</button>
            <button onClick={() => setAssignModal(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
