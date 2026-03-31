"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
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

const CLASSIFICATION_COLORS = {
  promotion: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "%" },
  update: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "i" },
  social: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", icon: "@" },
  spam: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: "!" },
  unknown: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", icon: "?" },
};

const CLASSIFICATION_LABELS = {
  promotion: "Promotions",
  update: "Updates",
  social: "Social",
  spam: "Spam",
  unknown: "Unknown",
};

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
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedComm, setSelectedComm] = useState(null);
  const [newClientName, setNewClientName] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterExec, setFilterExec] = useState("");
  const [executives, setExecutives] = useState([]);
  const [unmatchedCategory, setUnmatchedCategory] = useState("all");

  const loadData = useCallback(() => {
    dispatch(fetchCommunications());
  }, [dispatch]);

  useEffect(() => {
    loadData();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
    api.get("/auth/users/").then((r) => setExecutives((r.data.results || r.data).filter(u => u.role === "executive"))).catch(() => {});
  }, []);

  const filteredList = useMemo(() => {
    let filtered = list;
    if (filterTab === "unmatched") {
      filtered = filtered.filter((item) => !item.is_client_mail);
      if (unmatchedCategory !== "all") {
        filtered = filtered.filter((item) => item.classification === unmatchedCategory);
      }
    } else {
      // Show only client emails in the main view
      filtered = filtered.filter((item) => item.is_client_mail !== false);
      if (filterTab !== "all") filtered = filtered.filter((item) => item.comm_type === filterTab);
    }
    if (filterClient) filtered = filtered.filter((item) => item.client === filterClient);
    if (filterExec) filtered = filtered.filter((item) => item.assigned_executive === filterExec);
    return filtered;
  }, [list, filterTab, filterClient, filterExec, unmatchedCategory]);

  const unmatchedEmails = useMemo(() => list.filter((item) => !item.is_client_mail), [list]);
  const unmatchedCount = unmatchedEmails.length;
  const classificationCounts = useMemo(() => {
    const counts = { promotion: 0, update: 0, social: 0, spam: 0, unknown: 0 };
    unmatchedEmails.forEach((item) => {
      if (counts[item.classification] !== undefined) counts[item.classification]++;
      else counts.unknown++;
    });
    return counts;
  }, [unmatchedEmails]);

  const handleAssignClient = async () => {
    if (!assignClient || !assignModal) return;
    try {
      await api.post(`/communications/${assignModal}/mark-as-client/`, { client: assignClient });
      toast.success("Marked as client mail");
      setAssignModal(null);
      setAssignClient("");
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to assign client")); }
  };

  const handleReclassify = async (commId) => {
    try {
      const res = await api.post(`/communications/${commId}/reclassify/`);
      toast.success(`Reclassified as: ${res.data.classification}`);
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to reclassify")); }
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

  const handleSent = () => { loadData(); };

  const classificationBadge = (classification) => {
    const c = CLASSIFICATION_COLORS[classification] || CLASSIFICATION_COLORS.unknown;
    const label = CLASSIFICATION_LABELS[classification] || classification;
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.text}`}>
        {label}
      </span>
    );
  };

  // Columns for main (client) view
  const clientColumns = [
    { key: "comm_type", label: "Type", render: (row) => <StatusBadge status={row.comm_type} /> },
    { key: "direction", label: "Direction", render: (row) => <span className={`text-xs font-medium ${row.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>{row.direction}</span> },
    { key: "subject", label: "Subject", render: (row) => <span className="font-medium">{row.subject || "\u2014"}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name ? (
      <span>{row.client_name}</span>
    ) : (
      <button onClick={(e) => { e.stopPropagation(); setAssignModal(row.id); setAssignClient(""); }} className="text-xs text-orange-600 hover:text-orange-700 font-medium bg-orange-50 px-2 py-1 rounded">
        Accept Client
      </button>
    )},
    { key: "external_contact", label: "External Party", render: (row) => <span className="text-sm text-gray-600">{row.external_email || row.external_phone || "\u2014"}</span> },
    { key: "assigned_executive", label: "Assigned Executive", render: (row) => row.assigned_executive ? (
      <span className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg">{row.assigned_executive}</span>
    ) : <span className="text-sm text-gray-400">{"\u2014"}</span> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy HH:mm"); } catch { return "\u2014"; } } },
    { key: "actions", label: "", render: (row) => (
      <button onClick={(e) => { e.stopPropagation(); setSelectedComm(row); }} className="px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">Snapshot</button>
    )},
  ];

  // Columns for unmatched view
  const unmatchedColumns = [
    { key: "classification", label: "Category", render: (row) => classificationBadge(row.classification) },
    { key: "direction", label: "Direction", render: (row) => <span className={`text-xs font-medium ${row.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>{row.direction}</span> },
    { key: "subject", label: "Subject", render: (row) => <span className="font-medium">{row.subject || "\u2014"}</span> },
    { key: "external_contact", label: "From", render: (row) => <span className="text-sm text-gray-600">{row.external_email || row.external_phone || "\u2014"}</span> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy HH:mm"); } catch { return "\u2014"; } } },
    { key: "actions", label: "Actions", render: (row) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); setAssignModal(row.id); setAssignClient(""); }} className="px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100">
          Move to Client
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleReclassify(row.id); }} className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
          Reclassify
        </button>
        <button onClick={(e) => { e.stopPropagation(); setSelectedComm(row); }} className="px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
          View
        </button>
      </div>
    )},
  ];

  const isUnmatched = filterTab === "unmatched";

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

      {/* Filter Tabs + Dropdowns */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setFilterTab(tab.key); if (tab.key !== "unmatched") setUnmatchedCategory("all"); }}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg ${
                filterTab === tab.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}{tab.key === "unmatched" && unmatchedCount > 0 ? ` (${unmatchedCount})` : ""}
            </button>
          ))}
        </div>
        {!isUnmatched && (
          <div className="flex gap-2">
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
            <select value={filterExec} onChange={(e) => setFilterExec(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Executives</option>
              {executives.map((u) => <option key={u.id} value={u.full_name}>{u.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Unmatched category sub-tabs */}
      {isUnmatched && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setUnmatchedCategory("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
              unmatchedCategory === "all" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            All ({unmatchedCount})
          </button>
          {Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => {
            const c = CLASSIFICATION_COLORS[key];
            const count = classificationCounts[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setUnmatchedCategory(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  unmatchedCategory === key
                    ? `${c.bg} ${c.text} ${c.border} ring-2 ring-offset-1 ring-current`
                    : `bg-white ${c.text} ${c.border} hover:${c.bg}`
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      <DataTable
        columns={isUnmatched ? unmatchedColumns : clientColumns}
        data={filteredList}
        loading={loading}
        emptyTitle={isUnmatched ? "No unmatched emails" : "No communications"}
        emptyDescription={isUnmatched ? "All emails are matched to clients" : "Log your first communication"}
      />

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

      {/* Accept Client / Move to Client Modal */}
      <Modal open={!!assignModal} onClose={() => { setAssignModal(null); setShowAddClient(false); setNewClientName(""); }} title="Move to Client">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Assign this email to a client. It will be moved from Unmatched to the Communications timeline.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select value={assignClient} onChange={(e) => { setAssignClient(e.target.value); setShowAddClient(false); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select Client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div className="text-center text-xs text-gray-400">or</div>
          {!showAddClient ? (
            <button onClick={() => { setShowAddClient(true); setAssignClient(""); }} className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-indigo-300">+ Add New Client</button>
          ) : (
            <div className="p-3 border border-indigo-200 rounded-lg bg-indigo-50/30 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Company Name *</label>
              <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Enter company name" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {showAddClient ? (
              <button onClick={async () => {
                if (!newClientName.trim()) { toast.error("Enter company name"); return; }
                try {
                  const res = await api.post("/clients/", { company_name: newClientName.trim(), status: "prospect" });
                  await api.post(`/communications/${assignModal}/mark-as-client/`, { client: res.data.id });
                  toast.success(`Client "${newClientName}" created and marked as client mail`);
                  setAssignModal(null); setShowAddClient(false); setNewClientName("");
                  setClients(prev => [...prev, res.data]);
                  loadData();
                } catch (err) { toast.error(getErrorMessage(err, "Failed")); }
              }} disabled={!newClientName.trim()} className="px-6 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">Add & Assign</button>
            ) : (
              <button onClick={handleAssignClient} disabled={!assignClient} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">Move to Client</button>
            )}
            <button onClick={() => { setAssignModal(null); setShowAddClient(false); setNewClientName(""); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Snapshot Modal */}
      <Modal open={!!selectedComm} onClose={() => setSelectedComm(null)} title={selectedComm?.subject || "Communication"} size="lg">
        {selectedComm && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-500 block text-xs">Type</span>
                <StatusBadge status={selectedComm.comm_type} />
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Direction</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${selectedComm.direction === "inbound" ? "text-blue-700 bg-blue-50" : "text-green-700 bg-green-50"}`}>
                  {selectedComm.direction === "inbound" ? "Received" : "Sent"}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs">Date</span>
                <span className="font-medium">{(() => { try { return format(new Date(selectedComm.created_at), "MMM d, yyyy HH:mm"); } catch { return "\u2014"; } })()}</span>
              </div>
              {selectedComm.client_name && (
                <div>
                  <span className="text-gray-500 block text-xs">Client</span>
                  <span className="font-medium">{selectedComm.client_name}</span>
                </div>
              )}
              {selectedComm.external_email && (
                <div>
                  <span className="text-gray-500 block text-xs">{selectedComm.direction === "inbound" ? "From" : "To"}</span>
                  <span className="font-medium">{selectedComm.external_email}</span>
                </div>
              )}
              {selectedComm.external_phone && (
                <div>
                  <span className="text-gray-500 block text-xs">{selectedComm.direction === "inbound" ? "From" : "To"}</span>
                  <span className="font-medium">{selectedComm.external_phone}</span>
                </div>
              )}
              {!selectedComm.is_client_mail && (
                <div>
                  <span className="text-gray-500 block text-xs">Classification</span>
                  {classificationBadge(selectedComm.classification)}
                </div>
              )}
              {selectedComm.email_cc && (
                <div className="sm:col-span-2">
                  <span className="text-gray-500 block text-xs">CC</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {selectedComm.email_cc.split(",").map((cc, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{cc.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedComm.assigned_executive && (
                <div>
                  <span className="text-gray-500 block text-xs">Assigned Executive</span>
                  <span className="font-medium">{selectedComm.assigned_executive}</span>
                </div>
              )}
            </div>

            <div>
              <span className="text-gray-500 block text-xs mb-2">Content</span>
              <div className="bg-gray-50 rounded-lg p-4 text-sm max-h-80 overflow-y-auto">
                {selectedComm.comm_type === "email" && selectedComm.body?.includes("<") ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedComm.body }} />
                ) : (
                  <p className="whitespace-pre-wrap">{selectedComm.body || "No content"}</p>
                )}
              </div>
            </div>

            {selectedComm.attachments && selectedComm.attachments.length > 0 && (
              <div>
                <span className="text-gray-500 block text-xs mb-2">Attachments ({selectedComm.attachments.length})</span>
                <div className="space-y-1">
                  {selectedComm.attachments.map((att) => (
                    <a key={att.id} href={att.file} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm">
                      <span>{att.filename}</span>
                      <span className="text-xs text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {selectedComm.ai_summary && (
              <div>
                <span className="text-gray-500 block text-xs mb-1">AI Summary</span>
                <p className="text-sm bg-indigo-50 p-3 rounded-lg">{selectedComm.ai_summary}</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <div className="flex gap-2">
                {!selectedComm.is_client_mail && (
                  <>
                    <button onClick={() => { setSelectedComm(null); setAssignModal(selectedComm.id); setAssignClient(""); }} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">Move to Client</button>
                    <button onClick={() => { handleReclassify(selectedComm.id); setSelectedComm(null); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">Reclassify</button>
                  </>
                )}
              </div>
              <button onClick={() => setSelectedComm(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
