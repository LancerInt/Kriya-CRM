"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import Link from "next/link";
import ComposeEmailModal from "@/components/communications/ComposeEmailModal";
import SendWhatsAppModal from "@/components/communications/SendWhatsAppModal";
import AISummaryButton from "@/components/ai/AISummaryButton";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "communications", label: "Communications" },
  { key: "tasks", label: "Tasks" },
  { key: "quotations", label: "Quotations" },
  { key: "orders", label: "Orders" },
  { key: "shipments", label: "Shipments" },
  { key: "samples", label: "Samples" },
  { key: "finance", label: "Finance" },
  { key: "meetings", label: "Meetings" },
  { key: "documents", label: "Documents" },
];

function fmtDate(d) {
  if (!d) return "\u2014";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "\u2014"; }
}
function fmtDateTime(d) {
  if (!d) return "\u2014";
  try { return format(new Date(d), "MMM d, yyyy h:mm a"); } catch { return "\u2014"; }
}

// ── Last Conversation Summary ──
function LastConversation({ clientId }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/communications/", { params: { client: clientId, comm_type: "email" } })
      .then((r) => setEmails((r.data.results || r.data).slice(0, 3)))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return null;
  if (emails.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold mb-3">Last Conversation</h3>
      <div className="space-y-3">
        {emails.map((em) => (
          <div key={em.id} className="flex gap-3">
            <div className={`w-1.5 shrink-0 rounded-full ${em.direction === "inbound" ? "bg-blue-400" : "bg-green-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-xs font-medium ${em.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>
                  {em.direction === "inbound" ? "Received" : "Sent"}
                </span>
                <span className="text-xs text-gray-400">{em.external_email}</span>
                <span className="text-xs text-gray-400 ml-auto">{fmtDate(em.created_at)}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{em.subject || "(No subject)"}</p>
              <p className="text-xs text-gray-500 line-clamp-2">{(em.body || "").replace(/<[^>]*>/g, "").slice(0, 150)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ client, timeline, stats, onClientUpdate }) {
  const [allUsers, setAllUsers] = useState([]);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    api.get("/auth/users/").then((r) => setAllUsers(r.data.results || r.data)).catch(() => {});
  }, []);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", whatsapp: "", designation: "", is_primary: false });
  const [submittingContact, setSubmittingContact] = useState(false);

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ name: "", email: "", phone: "", whatsapp: "", designation: "", is_primary: false });
    setShowContactModal(true);
  };

  const openEditContact = (c) => {
    setEditingContact(c.id);
    setContactForm({ name: c.name, email: c.email || "", phone: c.phone || "", whatsapp: c.whatsapp || "", designation: c.designation || "", is_primary: c.is_primary });
    setShowContactModal(true);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setSubmittingContact(true);
    try {
      if (editingContact) {
        await api.patch(`/clients/contacts/${editingContact}/`, contactForm);
        toast.success("Contact updated");
      } else {
        await api.post(`/clients/${client.id}/add-contact/`, contactForm);
        toast.success("Contact added");
      }
      setShowContactModal(false);
      onClientUpdate();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save contact")); }
    finally { setSubmittingContact(false); }
  };

  const handleDeleteContact = async (contactId) => {
    if (!confirm("Delete this contact?")) return;
    try {
      await api.delete(`/clients/contacts/${contactId}/`);
      toast.success("Contact deleted");
      onClientUpdate();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete contact")); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Communications", value: stats.communications, color: "text-blue-600 bg-blue-50" },
              { label: "Quotations", value: stats.quotations, color: "text-indigo-600 bg-indigo-50" },
              { label: "Orders", value: stats.orders, color: "text-green-600 bg-green-50" },
              { label: "Tasks", value: stats.tasks, color: "text-yellow-600 bg-yellow-50" },
              { label: "Invoices", value: stats.invoices, color: "text-purple-600 bg-purple-50" },
              { label: "Samples", value: stats.samples, color: "text-cyan-600 bg-cyan-50" },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg p-3 ${s.color}`}>
                <p className="text-2xl font-bold">{s.value || 0}</p>
                <p className="text-xs font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Client Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Client Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={client.status} /></div>
            <div><span className="text-gray-500">Country:</span> <span className="ml-1">{client.country || "\u2014"}</span></div>
            <div><span className="text-gray-500">City:</span> <span className="ml-1">{client.city || "\u2014"}</span></div>
            <div><span className="text-gray-500">Business Type:</span> <span className="ml-1">{client.business_type || "\u2014"}</span></div>
            <div><span className="text-gray-500">Currency:</span> <span className="ml-1">{client.preferred_currency}</span></div>
            <div><span className="text-gray-500">Main Executive:</span> <span className="ml-1">{client.primary_executive_name || client.executive_name || "\u2014"}</span></div>
            <div>
              <span className="text-gray-500">Shadow Executive:</span>
              <select
                value={client.shadow_executive || ""}
                onChange={async (e) => {
                  const newId = e.target.value || null;
                  const newUser = allUsers.find((u) => u.id === newId);
                  const oldUser = allUsers.find((u) => u.id === client.shadow_executive);
                  const newName = newUser ? `${newUser.first_name} ${newUser.last_name}` : "";
                  const oldName = oldUser ? `${oldUser.first_name} ${oldUser.last_name}` : "";

                  let confirmed = false;
                  if (!client.shadow_executive && newId) {
                    // First time assigning
                    confirmed = confirm(`Assign ${newName} as shadow executive?\n\nThis will share ${client.company_name}'s details (communications, orders, tasks, etc.) with ${newName}.`);
                  } else if (client.shadow_executive && newId && client.shadow_executive !== newId) {
                    // Transferring from one to another
                    confirmed = confirm(`Transfer shadow executive from ${oldName} to ${newName}?\n\n• ${oldName} will LOSE access to ${client.company_name}'s data\n• ${newName} will GAIN access to ${client.company_name}'s data\n• All shadow client details will be moved`);
                  } else if (client.shadow_executive && !newId) {
                    // Removing shadow executive
                    confirmed = confirm(`Remove ${oldName} as shadow executive?\n\n${oldName} will lose access to ${client.company_name}'s data.`);
                  } else {
                    confirmed = true;
                  }

                  if (!confirmed) {
                    e.target.value = client.shadow_executive || "";
                    return;
                  }

                  try {
                    await api.patch(`/clients/${client.id}/`, { shadow_executive: newId });
                    if (!client.shadow_executive && newId) {
                      toast.success(`${newName} assigned as shadow executive`);
                    } else if (client.shadow_executive && newId) {
                      toast.success(`Shadow executive transferred from ${oldName} to ${newName}`);
                    } else {
                      toast.success(`Shadow executive removed`);
                    }
                    onClientUpdate();
                  } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
                }}
                className="ml-1 text-sm border-b border-gray-300 bg-transparent outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">Not assigned</option>
                {allUsers.filter((u) => u.id !== client.primary_executive).map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> <span className="ml-1">{client.address || "\u2014"}</span></div>
            {client.website && (
              <div className="sm:col-span-2"><span className="text-gray-500">Website:</span> <a href={client.website} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">{client.website}</a></div>
            )}
          </div>
        </div>

        {/* Last Conversation */}
        <LastConversation clientId={client.id} />

        {/* Contacts — full CRUD */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Contacts</h3>
            <button onClick={openAddContact} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">+ Add Contact</button>
          </div>
          {client.contacts && client.contacts.length > 0 ? (
            <div className="space-y-2">
              {client.contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name} {c.is_primary && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">(Primary)</span>}</p>
                    <p className="text-xs text-gray-500">{c.designation}{c.designation && c.email ? " \u00b7 " : ""}{c.email}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {c.phone && <span>Phone: {c.phone}</span>}
                      {c.whatsapp && <span>WA: {c.whatsapp}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3 shrink-0">
                    <button onClick={() => openEditContact(c)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                    <button onClick={() => handleDeleteContact(c.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No contacts added. Add contacts with their email addresses to enable auto-matching of emails.</p>
          )}
        </div>

        {/* Contact Modal */}
        <Modal open={showContactModal} onClose={() => setShowContactModal(false)} title={editingContact ? "Edit Contact" : "Add Contact"}>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <input value={contactForm.designation} onChange={(e) => setContactForm({ ...contactForm, designation: e.target.value })} placeholder="e.g. Purchase Manager" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="contact@company.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Email is used to auto-match incoming/outgoing emails to this client</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+91 9876543210" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                <input value={contactForm.whatsapp} onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })} placeholder="+91 9876543210" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={contactForm.is_primary} onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })} className="rounded" />
              <span className="text-sm text-gray-700">Primary contact</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submittingContact} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submittingContact ? "Saving..." : editingContact ? "Update" : "Add Contact"}</button>
              <button type="button" onClick={() => setShowContactModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </Modal>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">Activity Timeline</h3>
        {timeline.length > 0 ? (
          <div className="space-y-4">
            {timeline.slice(0, 20).map((item, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">{item.description || item.subject || item.comm_type}</p>
                  <p className="text-xs text-gray-400">{fmtDate(item.created_at || item.date)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No activity yet</p>
        )}
      </div>
    </div>
  );
}

// ── Generic data tab with lazy loading ──
function useTabData(clientId, endpoint, activeTab, tabKey) {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.get(endpoint, { params: { client: clientId } })
      .then((r) => {
        setData(r.data.results || r.data);
        setLoaded(true);
      })
      .catch(() => toast.error(`Failed to load ${tabKey}`))
      .finally(() => setLoading(false));
  }, [clientId, endpoint, tabKey]);

  useEffect(() => {
    if (activeTab === tabKey && !loaded) {
      reload();
    }
  }, [activeTab, tabKey, loaded, reload]);

  return { data, loading, reload };
}

// ── Communications Tab ──
function CommunicationsTab({ clientId, activeTab, client }) {
  const { data, loading, reload } = useTabData(clientId, "/communications/", activeTab, "communications");
  const [showModal, setShowModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedComm, setSelectedComm] = useState(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draft, setDraft] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [draftForm, setDraftForm] = useState({ subject: "", body: "", cc: "" });
  const [sendingDraft, setSendingDraft] = useState(false);
  const [adminManagerEmails, setAdminManagerEmails] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [form, setForm] = useState({ comm_type: "email", direction: "outbound", subject: "", body: "" });
  const [submitting, setSubmitting] = useState(false);

  // Extract primary contact info for pre-filling
  const primaryContact = client?.contacts?.find((c) => c.is_primary) || client?.contacts?.[0];
  const contactEmail = primaryContact?.email || "";
  const contactPhone = primaryContact?.phone || "";

  // Fetch admin/manager emails for auto CC
  useEffect(() => {
    api.get("/auth/users/").then(r => {
      const users = r.data.results || r.data;
      const emails = users.filter(u => u.email && (u.role === 'admin' || u.role === 'manager')).map(u => u.email).join(", ");
      setAdminManagerEmails(emails);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/communications/", { ...form, client: clientId });
      toast.success("Communication logged");
      setShowModal(false);
      setForm({ comm_type: "email", direction: "outbound", subject: "", body: "" });
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to log communication")); }
    finally { setSubmitting(false); }
  };

  const openDraft = async (draftId) => {
    try {
      const res = await api.get(`/communications/drafts/${draftId}/`);
      setDraft(res.data);
      setDraftForm({ subject: res.data.subject, body: res.data.body, cc: res.data.cc || adminManagerEmails });
      setDraftAttachments([]);
      setShowDraftModal(true);
    } catch { toast.error("Failed to load draft"); }
  };

  const handleSendDraft = async () => {
    setSendingDraft(true);
    try {
      // Save draft updates first
      await api.patch(`/communications/drafts/${draft.id}/`, draftForm);

      if (draftAttachments.length > 0) {
        // Send via send-email endpoint with attachments
        const fd = new FormData();
        fd.append("to", draft.to_email);
        fd.append("subject", draftForm.subject);
        fd.append("body", draftForm.body.replace(/\n/g, '<br>'));
        if (draftForm.cc) fd.append("cc", draftForm.cc);
        // Find email account
        const accounts = await api.get("/communications/email-accounts/");
        const account = accounts.data.results?.[0] || accounts.data[0];
        if (account) fd.append("email_account", account.id);
        if (draft.client) fd.append("client", draft.client);
        draftAttachments.forEach(file => fd.append("attachments", file));
        await api.post("/communications/send-email/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        // Mark draft as sent
        await api.post(`/communications/drafts/${draft.id}/send/`);
      } else {
        await api.post(`/communications/drafts/${draft.id}/send/`);
      }

      toast.success("Email sent!");
      setShowDraftModal(false);
      setDraftAttachments([]);
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setSendingDraft(false); }
  };

  const handleDiscardDraft = async () => {
    if (!confirm("Discard this draft?")) return;
    try {
      await api.post(`/communications/drafts/${draft.id}/discard/`);
      toast.success("Draft discarded");
      setShowDraftModal(false);
      reload();
    } catch { toast.error("Failed to discard"); }
  };

  const handleVoiceToText = () => {
    // Stop if already listening
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice recognition not supported. Use Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    // Clear AI-generated body when voice starts
    setDraftForm(prev => ({ ...prev, body: '' }));

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      if (transcript.trim()) {
        setDraftForm(prev => ({ ...prev, body: prev.body + (prev.body ? '\n' : '') + transcript.trim() }));
      }
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      recognitionRef.current = null;
      if (e.error === 'not-allowed') {
        toast.error("Microphone access denied. Allow microphone in browser settings.");
      } else if (e.error === 'no-speech') {
        toast.error("No speech detected. Try again.");
      } else {
        toast.error(`Voice error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
      toast.success("Listening... Speak now");
    } catch (e) {
      toast.error("Failed to start voice recognition");
      setIsListening(false);
    }
  };

  const columns = [
    { key: "comm_type", label: "Type", render: (row) => <StatusBadge status={row.comm_type} /> },
    { key: "direction", label: "Direction", render: (row) => {
      if (row.direction === "inbound" && row.draft_status === "draft") {
        return <span className="text-xs font-medium px-2 py-0.5 rounded text-purple-700 bg-purple-50">Draft</span>;
      }
      if (row.direction === "inbound" && row.draft_status === "sent") {
        return <span className="text-xs font-medium px-2 py-0.5 rounded text-green-700 bg-green-50">Replied</span>;
      }
      return (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.direction === "inbound" ? "text-blue-700 bg-blue-50" : "text-green-700 bg-green-50"}`}>
          {row.direction === "inbound" ? "Received" : "Sent"}
        </span>
      );
    }},
    { key: "subject", label: "Subject", render: (row) => <span className="font-medium">{row.subject || "\u2014"}</span> },
    { key: "external", label: "From/To", render: (row) => <span className="text-sm text-gray-500">{row.external_email || row.external_phone || "\u2014"}</span> },
    { key: "attachments", label: "", render: (row) => row.attachments && row.attachments.length > 0 && (
      <span className="text-xs text-gray-400" title={`${row.attachments.length} attachment(s)`}>
        <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
        {row.attachments.length}
      </span>
    )},
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
    { key: "actions", label: "", render: (row) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {/* AI Draft badge for inbound emails */}
        {row.direction === "inbound" && row.draft_id && row.draft_status === "draft" && (
          <button onClick={() => openDraft(row.draft_id)} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            AI Draft
          </button>
        )}
        {row.direction === "inbound" && row.draft_id && row.draft_status === "sent" && (
          <span className="text-[10px] text-green-600 font-medium">Replied</span>
        )}
        <button onClick={() => setSelectedComm(row)} className="px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
          Snapshot
        </button>
      </div>
    )},
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* Filters */}
        <div className="flex items-center gap-2">
          {["all", "email", "whatsapp", "call", "note"].map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 text-xs font-medium rounded-full ${filterType === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search subject, email..." className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 w-44" />
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Send Email</button>
          <button onClick={() => setShowWhatsAppModal(true)} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Send WhatsApp</button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Log Communication</button>
        </div>
      </div>
      <DataTable columns={columns} data={data.filter(row => {
        if (filterType !== "all" && row.comm_type !== filterType) return false;
        if (filterSearch) {
          const q = filterSearch.toLowerCase();
          return (row.subject || "").toLowerCase().includes(q) || (row.external_email || "").toLowerCase().includes(q) || (row.external_phone || "").includes(q) || (row.body || "").toLowerCase().includes(q);
        }
        return true;
      })} loading={loading} emptyTitle="No communications" emptyDescription="Log your first communication with this client" />
      <ComposeEmailModal open={showEmailModal} onClose={() => setShowEmailModal(false)} clientId={clientId} contactEmail={contactEmail} onSent={reload} />
      <SendWhatsAppModal open={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} clientId={clientId} contactPhone={contactPhone} onSent={reload} />

      {/* Communication Detail Modal */}
      <Modal open={!!selectedComm} onClose={() => setSelectedComm(null)} title={selectedComm?.subject || "Communication"} size="lg">
        {selectedComm && (
          <div className="space-y-4">
            {/* Header info */}
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
                <span className="font-medium">{fmtDateTime(selectedComm.created_at)}</span>
              </div>
              {selectedComm.external_email && (
                <div>
                  <span className="text-gray-500 block text-xs">{selectedComm.direction === "inbound" ? "From" : "To"}</span>
                  <span className="font-medium">{selectedComm.external_email}</span>
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
              {selectedComm.external_phone && (
                <div>
                  <span className="text-gray-500 block text-xs">{selectedComm.direction === "inbound" ? "From" : "To"}</span>
                  <span className="font-medium">{selectedComm.external_phone}</span>
                </div>
              )}
              {selectedComm.user_name && (
                <div>
                  <span className="text-gray-500 block text-xs">User</span>
                  <span className="font-medium">{selectedComm.user_name}</span>
                </div>
              )}
            </div>

            {/* Body */}
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

            {/* Attachments */}
            {selectedComm.attachments && selectedComm.attachments.length > 0 && (
              <div>
                <span className="text-gray-500 block text-xs mb-2">Attachments ({selectedComm.attachments.length})</span>
                <div className="space-y-1">
                  {selectedComm.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.file}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="text-sm text-indigo-600 font-medium truncate">{att.filename}</span>
                      {att.file_size > 0 && <span className="text-xs text-gray-400 shrink-0">({(att.file_size / 1024).toFixed(1)} KB)</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedComm(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Log Communication">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* AI Draft Modal */}
      <Modal open={showDraftModal} onClose={() => setShowDraftModal(false)} title="AI Draft Reply" size="lg">
        {draft && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              {draft.generated_by_ai && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-full">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  AI Generated
                </span>
              )}
              <span className="text-xs text-gray-500">To: {draft.to_email}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input value={draftForm.subject} onChange={(e) => setDraftForm({ ...draftForm, subject: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
              <input
                type="text"
                value={draftForm.cc}
                onChange={(e) => setDraftForm({ ...draftForm, cc: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${
                  draftForm.cc && !draftForm.cc.split(",").every((e) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))
                    ? "border-red-300 bg-red-50" : "border-gray-300"
                }`}
              />
              {draftForm.cc && draftForm.cc.includes(",") && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {draftForm.cc.split(",").filter((e) => e.trim()).map((email, i) => {
                    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
                    return (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {email.trim()}
                      </span>
                    );
                  })}
                </div>
              )}
              {draftForm.cc && !draftForm.cc.split(",").every((e) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) && (
                <p className="text-xs text-red-500 mt-1">Invalid email(s). Separate multiple with commas.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea value={draftForm.body} onChange={(e) => setDraftForm({ ...draftForm, body: e.target.value })} rows={10} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm" />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                  📎 Add Files
                  <input type="file" multiple onChange={(e) => setDraftAttachments(prev => [...prev, ...Array.from(e.target.files)])} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
                </label>
                <span className="text-xs text-gray-400">{draftAttachments.length > 0 ? `${draftAttachments.length} file(s)` : "No files attached"}</span>
              </div>
              {draftAttachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {draftAttachments.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">📄</span>
                        <span className="font-medium">{file.name}</span>
                        <span className="text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button onClick={() => setDraftAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <div className="flex gap-2">
                <button onClick={handleVoiceToText} className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 ${isListening ? 'text-red-700 bg-red-50 hover:bg-red-100 animate-pulse' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'}`}>
                  {isListening ? '⏹ Stop Recording' : '🎤 Voice to Text'}
                </button>
                <button onClick={handleDiscardDraft} className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium">
                  Discard
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowDraftModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleSendDraft} disabled={sendingDraft} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {sendingDraft ? "Sending..." : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Tasks Tab ──
function TasksTab({ clientId, activeTab, client }) {
  const currentUser = useSelector((state) => state.auth.user);
  const isExecutive = currentUser?.role === "executive";
  const { data, loading, reload } = useTabData(clientId, "/tasks/", activeTab, "tasks");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", owner: "" });
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeTab === "tasks" && users.length === 0) {
      api.get("/auth/users/").then((r) => setUsers(r.data.results || r.data)).catch(() => {});
    }
  }, [activeTab]);

  // For executives: auto-assign to shadow executive of this client
  useEffect(() => {
    if (isExecutive && client?.shadow_executive && !form.owner) {
      setForm((f) => ({ ...f, owner: client.shadow_executive }));
    }
  }, [isExecutive, client?.shadow_executive]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, client: clientId };
      if (!payload.owner) delete payload.owner;
      await api.post("/tasks/", payload);
      toast.success("Task created");
      setShowModal(false);
      setForm({ title: "", description: "", priority: "medium", due_date: "", owner: "" });
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create task")); }
    finally { setSubmitting(false); }
  };

  const handleComplete = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/complete/`);
      toast.success("Task completed");
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to complete task")); }
  };

  const columns = [
    { key: "title", label: "Task", render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "owner_name", label: "Assigned To", render: (row) => <span className="text-sm">{row.owner_name || "\u2014"}</span> },
    { key: "priority", label: "Priority", render: (row) => <StatusBadge status={row.priority} /> },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "due_date", label: "Due Date", render: (row) => fmtDate(row.due_date) },
    { key: "actions", label: "", render: (row) => row.status !== "completed" && (
      <button onClick={(e) => { e.stopPropagation(); handleComplete(row.id); }} className="text-xs text-green-600 hover:text-green-700 font-medium">Complete</button>
    )},
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ New Task</button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No tasks" emptyDescription="Create a task for this client" />
      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Task">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign To *</label>
            {isExecutive ? (
              <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select assignee</option>
                {/* Shadow executive */}
                {client?.shadow_executive && users.filter((u) => u.id === client.shadow_executive).map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} (Shadow Executive)</option>
                ))}
                {/* Managers */}
                {users.filter((u) => u.role === "manager").map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} (Manager)</option>
                ))}
                {/* Self */}
                {users.filter((u) => u.id === currentUser?.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} (Self)</option>
                ))}
              </select>
            ) : (
              <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select team member</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Creating..." : "Create Task"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Quotations Tab ──
function QuotationsTab({ clientId, activeTab }) {
  const { data: inquiries, loading: loadingInq } = useTabData(clientId, "/quotations/inquiries/", activeTab, "quotations");
  const { data: quotations, loading: loadingQt, reload } = useTabData(clientId, "/quotations/quotations/", activeTab, "quotations");
  const [subTab, setSubTab] = useState("inquiries");

  const inquiryColumns = [
    { key: "product_name", label: "Product", render: (row) => row.product_name || "General" },
    { key: "source", label: "Source", render: (row) => <StatusBadge status={row.source} /> },
    { key: "stage", label: "Stage", render: (row) => <StatusBadge status={row.stage} /> },
    { key: "expected_value", label: "Value", render: (row) => row.expected_value ? `$${Number(row.expected_value).toLocaleString()}` : "\u2014" },
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
  ];

  const quotationColumns = [
    { key: "quotation_number", label: "Number", render: (row) => <span className="font-medium">{row.quotation_number}</span> },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
  ];

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubTab("inquiries")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "inquiries" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Inquiries ({inquiries.length})</button>
        <button onClick={() => setSubTab("quotations")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "quotations" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Quotations ({quotations.length})</button>
      </div>
      {subTab === "inquiries" ? (
        <DataTable columns={inquiryColumns} data={inquiries} loading={loadingInq} emptyTitle="No inquiries" emptyDescription="No inquiries from this client" />
      ) : (
        <DataTable columns={quotationColumns} data={quotations} loading={loadingQt} emptyTitle="No quotations" emptyDescription="No quotations for this client" />
      )}
    </>
  );
}

// ── Orders Tab ──
function OrdersTab({ clientId, activeTab }) {
  const { data, loading } = useTabData(clientId, "/orders/", activeTab, "orders");
  const columns = [
    { key: "order_number", label: "Order #", render: (row) => <span className="font-medium">{row.order_number}</span> },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "delivery_terms", label: "Terms" },
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
  ];
  return <DataTable columns={columns} data={data} loading={loading} emptyTitle="No orders" emptyDescription="No orders for this client yet" />;
}

// ── Shipments Tab ──
function ShipmentsTab({ clientId, activeTab }) {
  const { data, loading } = useTabData(clientId, "/shipments/", activeTab, "shipments");
  const columns = [
    { key: "shipment_number", label: "Shipment #", render: (row) => <span className="font-medium">{row.shipment_number}</span> },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "container_number", label: "Container", render: (row) => row.container_number || "\u2014" },
    { key: "port_of_loading", label: "Loading Port", render: (row) => row.port_of_loading || "\u2014" },
    { key: "port_of_discharge", label: "Discharge Port", render: (row) => row.port_of_discharge || "\u2014" },
    { key: "dispatch_date", label: "Dispatch", render: (row) => fmtDate(row.dispatch_date) },
    { key: "estimated_arrival", label: "ETA", render: (row) => fmtDate(row.estimated_arrival) },
  ];
  return <DataTable columns={columns} data={data} loading={loading} emptyTitle="No shipments" emptyDescription="No shipments for this client yet" />;
}

// ── Samples Tab ──
function SamplesTab({ clientId, activeTab }) {
  const { data, loading, reload } = useTabData(clientId, "/samples/", activeTab, "samples");
  const [showFeedback, setShowFeedback] = useState(null);
  const [fbForm, setFbForm] = useState({ rating: "5", comments: "", issues: "", bulk_order_interest: false });

  const handleFeedback = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/samples/${showFeedback}/add_feedback/`, fbForm);
      toast.success("Feedback submitted");
      setShowFeedback(null);
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to submit feedback")); }
  };

  const columns = [
    { key: "product_name", label: "Product", render: (row) => row.product_name || "\u2014" },
    { key: "quantity", label: "Qty" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "tracking_number", label: "Tracking #", render: (row) => row.tracking_number || "\u2014" },
    { key: "dispatch_date", label: "Dispatched", render: (row) => fmtDate(row.dispatch_date) },
    { key: "actions", label: "", render: (row) => ["delivered", "feedback_pending"].includes(row.status) && (
      <button onClick={(e) => { e.stopPropagation(); setShowFeedback(row.id); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Add Feedback</button>
    )},
  ];

  return (
    <>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No samples" emptyDescription="No sample requests for this client" />
      <Modal open={!!showFeedback} onClose={() => setShowFeedback(null)} title="Sample Feedback">
        <form onSubmit={handleFeedback} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
            <select value={fbForm.rating} onChange={(e) => setFbForm({ ...fbForm, rating: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              {[5,4,3,2,1].map((r) => <option key={r} value={r}>{r} Star{r > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
            <textarea value={fbForm.comments} onChange={(e) => setFbForm({ ...fbForm, comments: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issues</label>
            <textarea value={fbForm.issues} onChange={(e) => setFbForm({ ...fbForm, issues: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fbForm.bulk_order_interest} onChange={(e) => setFbForm({ ...fbForm, bulk_order_interest: e.target.checked })} className="rounded" />
            <span className="text-sm text-gray-700">Interested in bulk order</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Submit</button>
            <button type="button" onClick={() => setShowFeedback(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Finance Tab ──
function FinanceTab({ clientId, activeTab }) {
  const { data: invoices, loading: loadingInv } = useTabData(clientId, "/finance/invoices/", activeTab, "finance");
  const { data: payments, loading: loadingPay } = useTabData(clientId, "/finance/payments/", activeTab, "finance");
  const [subTab, setSubTab] = useState("invoices");

  const invoiceColumns = [
    { key: "invoice_number", label: "Invoice #", render: (row) => <span className="font-medium">{row.invoice_number}</span> },
    { key: "invoice_type", label: "Type", render: (row) => <StatusBadge status={row.invoice_type} /> },
    { key: "total", label: "Total", render: (row) => `$${Number(row.total).toLocaleString()}` },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "due_date", label: "Due Date", render: (row) => fmtDate(row.due_date) },
  ];

  const paymentColumns = [
    { key: "amount", label: "Amount", render: (row) => `$${Number(row.amount).toLocaleString()}` },
    { key: "currency", label: "Currency" },
    { key: "mode", label: "Mode", render: (row) => <StatusBadge status={row.mode} /> },
    { key: "payment_date", label: "Date", render: (row) => fmtDate(row.payment_date) },
    { key: "reference", label: "Reference", render: (row) => row.reference || "\u2014" },
  ];

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubTab("invoices")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "invoices" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Invoices ({invoices.length})</button>
        <button onClick={() => setSubTab("payments")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "payments" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Payments ({payments.length})</button>
      </div>
      {subTab === "invoices" ? (
        <DataTable columns={invoiceColumns} data={invoices} loading={loadingInv} emptyTitle="No invoices" emptyDescription="No invoices for this client" />
      ) : (
        <DataTable columns={paymentColumns} data={payments} loading={loadingPay} emptyTitle="No payments" emptyDescription="No payments from this client" />
      )}
    </>
  );
}

// ── Meetings Tab ──
function MeetingsTab({ clientId, activeTab }) {
  const { data, loading, reload } = useTabData(clientId, "/meetings/", activeTab, "meetings");
  const [showModal, setShowModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [form, setForm] = useState({ scheduled_at: "", agenda: "", call_notes: "", duration_minutes: "", status: "scheduled", platform: "google_meet", meeting_link: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, client: clientId };
      if (!payload.duration_minutes) delete payload.duration_minutes;
      await api.post("/meetings/", payload);
      toast.success("Meeting created");
      setShowModal(false);
      setForm({ scheduled_at: "", agenda: "", call_notes: "", duration_minutes: "", status: "scheduled", platform: "google_meet", meeting_link: "" });
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create meeting")); }
    finally { setSubmitting(false); }
  };

  const handleUpdateMeeting = async (meetingId, updates) => {
    try {
      await api.patch(`/meetings/${meetingId}/`, updates);
      toast.success("Meeting updated");
      reload();
      setSelectedMeeting((prev) => ({ ...prev, ...updates }));
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update meeting")); }
  };

  const platformLabels = { google_meet: "Google Meet", zoom: "Zoom", teams: "MS Teams", whatsapp: "WhatsApp", phone: "Phone", in_person: "In Person", other: "Other" };

  const columns = [
    { key: "platform", label: "Platform", render: (row) => <StatusBadge status={row.platform} /> },
    { key: "agenda", label: "Agenda", render: (row) => <span className="font-medium">{row.agenda || "\u2014"}</span> },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "scheduled_at", label: "Scheduled", render: (row) => fmtDateTime(row.scheduled_at) },
    { key: "duration_minutes", label: "Duration", render: (row) => row.duration_minutes ? `${row.duration_minutes} min` : "\u2014" },
    { key: "meeting_link", label: "", render: (row) => row.meeting_link && (
      <a href={row.meeting_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Join</a>
    )},
    { key: "actions", label: "", render: (row) => (
      <button onClick={(e) => { e.stopPropagation(); setSelectedMeeting(row); }} className="px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">Details</button>
    )},
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Schedule Meeting</button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No meetings" emptyDescription="No meetings with this client" />

      {/* Create Meeting Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Schedule Meeting" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="whatsapp">WhatsApp Video</option>
                <option value="phone">Phone Call</option>
                <option value="in_person">In Person</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled At *</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
            <input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} placeholder="https://meet.google.com/abc-defg-hij" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agenda</label>
            <input value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.call_notes} onChange={(e) => setForm({ ...form, call_notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Saving..." : "Schedule"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Meeting Detail Modal */}
      <Modal open={!!selectedMeeting} onClose={() => setSelectedMeeting(null)} title={selectedMeeting?.agenda || "Meeting Details"} size="lg">
        {selectedMeeting && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500 block text-xs">Platform</span><StatusBadge status={selectedMeeting.platform} /></div>
              <div><span className="text-gray-500 block text-xs">Status</span><StatusBadge status={selectedMeeting.status} /></div>
              <div><span className="text-gray-500 block text-xs">Scheduled</span><span className="font-medium">{fmtDateTime(selectedMeeting.scheduled_at)}</span></div>
              {selectedMeeting.duration_minutes && <div><span className="text-gray-500 block text-xs">Duration</span><span className="font-medium">{selectedMeeting.duration_minutes} min</span></div>}
              {selectedMeeting.user_name && <div><span className="text-gray-500 block text-xs">Host</span><span className="font-medium">{selectedMeeting.user_name}</span></div>}
            </div>

            {selectedMeeting.meeting_link && (
              <div>
                <span className="text-gray-500 block text-xs mb-1">Meeting Link</span>
                <a href={selectedMeeting.meeting_link} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline break-all">{selectedMeeting.meeting_link}</a>
              </div>
            )}

            {selectedMeeting.call_notes && (
              <div>
                <span className="text-gray-500 block text-xs mb-1">Notes</span>
                <p className="text-sm bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{selectedMeeting.call_notes}</p>
              </div>
            )}

            {/* Post-meeting sections - editable */}
            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h4 className="font-semibold text-sm">Post-Meeting</h4>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Summary / Key Decisions</label>
                <textarea defaultValue={selectedMeeting.summary || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.summary || "")) handleUpdateMeeting(selectedMeeting.id, { summary: e.target.value }); }} rows={3} placeholder="Add meeting summary..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Follow-up Actions</label>
                <textarea defaultValue={selectedMeeting.follow_up_actions || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.follow_up_actions || "")) handleUpdateMeeting(selectedMeeting.id, { follow_up_actions: e.target.value }); }} rows={3} placeholder="Action items from this meeting..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Recording URL</label>
                <input type="url" defaultValue={selectedMeeting.recording_url || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.recording_url || "")) handleUpdateMeeting(selectedMeeting.id, { recording_url: e.target.value }); }} placeholder="Paste recording link..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Transcription</label>
                <textarea defaultValue={selectedMeeting.transcription || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.transcription || "")) handleUpdateMeeting(selectedMeeting.id, { transcription: e.target.value }); }} rows={4} placeholder="Paste meeting transcription..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedMeeting(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Documents Tab ──
function DocumentsTab({ clientId, activeTab }) {
  const { data, loading, reload } = useTabData(clientId, "/documents/", activeTab, "documents");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", category: "commercial", version: "1" });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error("Please select a file"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("client", clientId);
      fd.append("name", form.name);
      fd.append("category", form.category);
      fd.append("version", form.version);
      fd.append("file", file);
      await api.post("/documents/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      setShowModal(false);
      setForm({ name: "", category: "commercial", version: "1" });
      setFile(null);
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to upload")); }
    finally { setSubmitting(false); }
  };

  const columns = [
    { key: "name", label: "Name", render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "category", label: "Category", render: (row) => <StatusBadge status={row.category} /> },
    { key: "version", label: "Version" },
    { key: "created_at", label: "Uploaded", render: (row) => fmtDate(row.created_at) },
    { key: "file", label: "", render: (row) => row.file && (
      <a href={row.file} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Download</a>
    )},
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Upload Document</button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No documents" emptyDescription="No documents for this client" />
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Upload Document">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Uploading..." : "Upload"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Main Page ──
export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadClient = useCallback(() => {
    Promise.all([
      api.get(`/clients/${id}/`),
      api.get(`/clients/${id}/timeline/`).catch(() => ({ data: [] })),
      api.get(`/clients/${id}/stats/`).catch(() => ({ data: null })),
    ])
      .then(([clientRes, timelineRes, statsRes]) => {
        setClient(clientRes.data);
        setTimeline(timelineRes.data);
        setStats(statsRes.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadClient(); }, [loadClient]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!client) return <p className="text-center text-gray-500 py-8">Client not found</p>;

  return (
    <div>
      <PageHeader
        title={client.company_name}
        subtitle={`${client.country || "\u2014"} \u00b7 ${client.business_type || "\u2014"}`}
        action={
          <div className="flex items-center gap-2">
            <AISummaryButton
              variant="button"
              title={`${client.company_name} — AI Summary`}
              prompt={`Give me a comprehensive summary of client "${client.company_name}" (ID: ${id}). Include: their contact details, recent communications, order history, pending tasks, shipment status, and any action items. Use get_client_summary, get_recent_communications, get_tasks, get_orders, and get_shipments tools with client_id="${id}".`}
            />
            <Link href={`/clients/${id}/edit`} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              Edit Client
            </Link>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab client={client} timeline={timeline} stats={stats} onClientUpdate={loadClient} />}
      {activeTab === "communications" && <CommunicationsTab clientId={id} activeTab={activeTab} client={client} />}
      {activeTab === "tasks" && <TasksTab clientId={id} activeTab={activeTab} client={client} />}
      {activeTab === "quotations" && <QuotationsTab clientId={id} activeTab={activeTab} />}
      {activeTab === "orders" && <OrdersTab clientId={id} activeTab={activeTab} />}
      {activeTab === "shipments" && <ShipmentsTab clientId={id} activeTab={activeTab} />}
      {activeTab === "samples" && <SamplesTab clientId={id} activeTab={activeTab} />}
      {activeTab === "finance" && <FinanceTab clientId={id} activeTab={activeTab} />}
      {activeTab === "meetings" && <MeetingsTab clientId={id} activeTab={activeTab} />}
      {activeTab === "documents" && <DocumentsTab clientId={id} activeTab={activeTab} />}
    </div>
  );
}
