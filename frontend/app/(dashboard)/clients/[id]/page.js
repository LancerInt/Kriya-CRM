"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { sendWithUndo } from "@/lib/undoSend";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import PIEditorModal from "@/components/finance/PIEditorModal";
import ModernSelect from "@/components/ui/ModernSelect";
import EmailChips from "@/components/ui/EmailChips";
import RichTextEditor from "@/components/ui/RichTextEditor";
import DocLibraryPickerShared from "@/components/ui/DocLibraryPicker";
import COAEditorModal from "@/components/finance/COAEditorModal";

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
  { key: "price_list", label: "Price List" },
  { key: "purchase_history", label: "Purchase History" },
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
  const currentUser = useSelector((state) => state.auth.user);
  const canAssign = currentUser?.role === "admin" || currentUser?.role === "manager";
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
        await api.post(`/clients/contacts/`, { ...contactForm, client: client.id });
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
          <h3 className="font-semibold mb-4">Account Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={client.status} /></div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Tier:</span>
              {client.tier === "tier_1" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  VIP
                </span>
              ) : client.tier === "tier_2" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Priority
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Standard</span>
              )}
            </div>
            <div><span className="text-gray-500">Country:</span> <span className="ml-1">{client.country || "\u2014"}</span></div>
            <div><span className="text-gray-500">City:</span> <span className="ml-1">{client.city || "\u2014"}</span></div>
            <div><span className="text-gray-500">Business Type:</span> <span className="ml-1">{client.business_type || "\u2014"}</span></div>
            <div><span className="text-gray-500">Currency:</span> <span className="ml-1">{client.preferred_currency}</span></div>
            <div>
              <span className="text-gray-500">Account Owner:</span>
              {canAssign ? (
                <select
                  value={client.primary_executive || ""}
                  onChange={async (e) => {
                    const newId = e.target.value || null;
                    const newUser = allUsers.find((u) => u.id === newId);
                    const oldName = client.primary_executive_name || client.executive_name || "";
                    const newName = newUser ? `${newUser.first_name} ${newUser.last_name}` : "";

                    let confirmed = false;
                    if (!client.primary_executive && newId) {
                      confirmed = confirm(`Assign ${newName} as account owner for ${client.company_name}?`);
                    } else if (client.primary_executive && newId && client.primary_executive !== newId) {
                      confirmed = confirm(`Transfer account owner from ${oldName} to ${newName}?\n\n• ${oldName} will LOSE primary access to ${client.company_name}\n• ${newName} will GAIN primary access to ${client.company_name}`);
                    } else if (client.primary_executive && !newId) {
                      confirmed = confirm(`Remove ${oldName} as account owner?\n\n${oldName} will lose primary access to ${client.company_name}.`);
                    } else {
                      confirmed = true;
                    }

                    if (!confirmed) {
                      e.target.value = client.primary_executive || "";
                      return;
                    }

                    try {
                      await api.patch(`/clients/${client.id}/`, { primary_executive: newId });
                      if (!client.primary_executive && newId) {
                        toast.success(`${newName} assigned as account owner`);
                      } else if (client.primary_executive && newId) {
                        toast.success(`Account owner transferred to ${newName}`);
                      } else {
                        toast.success(`Account owner removed`);
                      }
                      onClientUpdate();
                    } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
                  }}
                  className="ml-1 text-sm border-b border-gray-300 bg-transparent outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Not assigned</option>
                  {allUsers.filter((u) => u.id !== client.shadow_executive).map((u) => (
                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                  ))}
                </select>
              ) : (
                <span className="ml-1">{client.primary_executive_name || client.executive_name || "\u2014"}</span>
              )}
            </div>
            <div>
              <span className="text-gray-500">Secondary Owner:</span>
              {canAssign ? (
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
                      confirmed = confirm(`Assign ${newName} as secondary owner?\n\nThis will share ${client.company_name}'s details (communications, orders, tasks, etc.) with ${newName}.`);
                    } else if (client.shadow_executive && newId && client.shadow_executive !== newId) {
                      confirmed = confirm(`Transfer secondary owner from ${oldName} to ${newName}?\n\n• ${oldName} will LOSE access to ${client.company_name}'s data\n• ${newName} will GAIN access to ${client.company_name}'s data\n• All shadow client details will be moved`);
                    } else if (client.shadow_executive && !newId) {
                      confirmed = confirm(`Remove ${oldName} as secondary owner?\n\n${oldName} will lose access to ${client.company_name}'s data.`);
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
                        toast.success(`${newName} assigned as secondary owner`);
                      } else if (client.shadow_executive && newId) {
                        toast.success(`Secondary owner transferred from ${oldName} to ${newName}`);
                      } else {
                        toast.success(`Secondary owner removed`);
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
              ) : (
                <span className="ml-1">{client.shadow_executive_name || "\u2014"}</span>
              )}
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

// ── Refine Dropdown (Polish / Formalize / Elaborate / Shorten) ──
function RefineDropdown({ body, onRefined, contactName }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRefine = async (action) => {
    if (!body?.trim()) { toast.error("Write something first"); return; }
    setLoading(action);
    try {
      const r = await api.post("/communications/refine-email/", { body, action, contact_name: contactName || '' });
      onRefined(r.data.refined);
      toast.success(`Text ${action === "polish" ? "polished" : action === "formalize" ? "formalized" : action === "elaborate" ? "elaborated" : "shortened"}!`);
    } catch { toast.error("Failed to refine"); }
    finally { setLoading(null); setOpen(false); }
  };

  const options = [
    { key: "polish", icon: "✨", label: "Polish", desc: "Fix grammar & improve clarity" },
    { key: "formalize", icon: "👔", label: "Formalize", desc: "Make it more professional" },
    { key: "elaborate", icon: "📝", label: "Elaborate", desc: "Add more detail" },
    { key: "shorten", icon: "✂️", label: "Shorten", desc: "Make it concise" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        Refine
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
          {options.map(({ key, icon, label, desc }) => (
            <button key={key} onClick={() => handleRefine(key)} disabled={!!loading}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
              <span className="text-sm">{icon}</span>
              <div>
                <span className="text-xs font-medium text-gray-800">{label}</span>
                <p className="text-[10px] text-gray-400">{desc}</p>
              </div>
              {loading === key && <svg className="w-3.5 h-3.5 animate-spin ml-auto text-indigo-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Document Suggestion Bar — appears in AI Draft when COA/MSDS/TDS detected ──
function DocSuggestionBar({ detected, clientId, draftId, onAttached }) {
  const [showPicker, setShowPicker] = useState(false);
  const labels = detected.map(d => d.label).join(", ");

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-sm">📋</span>
            <span className="text-xs font-medium text-amber-800">
              Client requested: <strong>{labels}</strong>
            </span>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="text-[11px] font-medium px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
          >
            Attach from Library
          </button>
        </div>
      </div>
      {showPicker && (
        <DocLibraryPickerShared
          draftId={draftId}
          onClose={() => setShowPicker(false)}
          onAttached={onAttached}
        />
      )}
    </>
  );
}

// Remove the old inline DocLibraryPicker — now using the shared component
// imported as DocLibraryPickerShared at the top of the file.


// ── Communications Tab ──
function CommunicationsTab({ clientId, activeTab, client }) {
  const currentUser = useSelector((state) => state.auth.user);
  const { data, loading, reload } = useTabData(clientId, "/communications/", activeTab, "communications");
  const [showModal, setShowModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedComm, setSelectedComm] = useState(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showCOAEditor, setShowCOAEditor] = useState(false);
  const [draft, setDraft] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [draftForm, setDraftForm] = useState({ subject: "", body: "", cc: "" });
  const [attachQt, setAttachQt] = useState(null); // quotation object for attach editor
  const [attachQtForm, setAttachQtForm] = useState({});
  const [attachQtItems, setAttachQtItems] = useState([]);
  const [attachPi, setAttachPi] = useState(null);
  const [attachMode, setAttachMode] = useState(null); // 'quote' | 'pi' | null
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

  // Get all contact emails for this client
  const allContactEmails = (client?.contacts || []).map(c => c.email).filter(Boolean);

  // CC = other client contacts + admin/manager emails
  const composeToEmail = contactEmail;

  // Fetch admin/manager emails for auto CC
  useEffect(() => {
    api.get("/auth/users/").then(r => {
      const users = r.data.results || r.data;
      const emails = users.filter(u => u.email && (u.role === 'admin' || u.role === 'manager')).map(u => u.email).join(", ");
      setAdminManagerEmails(emails);
    }).catch(() => {});
  }, []);

  // Combine other contacts + admin/manager into CC
  const otherContactEmails = allContactEmails.filter(e => e !== composeToEmail);
  const allCcParts = [...otherContactEmails];
  if (adminManagerEmails) {
    adminManagerEmails.split(",").map(e => e.trim()).filter(Boolean).forEach(e => {
      if (!allCcParts.includes(e) && e !== composeToEmail) allCcParts.push(e);
    });
  }
  const composeCcEmails = allCcParts.join(", ");

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

  const [savedAttachments, setSavedAttachments] = useState([]); // from server
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // True when a Sample row already exists for the draft's source communication.
  // We hide the "Create Sample Request" button in that case so the user
  // doesn't accidentally create duplicates (e.g. when they navigated here
  // from /samples/[id] → "Reply to Client").
  const [sampleAlreadyExists, setSampleAlreadyExists] = useState(false);

  // Convert plain text to HTML for rich editor
  const textToHtml = (text) => {
    if (!text) return "";
    if (text.includes("<p>") || text.includes("<br>") || text.includes("<div>")) return text; // already HTML
    return text.split("\n\n").map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  };

  const openDraft = async (draftId) => {
    let res;
    try {
      res = await api.get(`/communications/drafts/${draftId}/`);
    } catch {
      toast.error("Failed to load draft");
      return;
    }
    try {
      setDraft(res.data);

      // Build the audit-CC set: every admin + manager + every other client
      // contact, EXCLUDING the currently logged-in user (no point CCing
      // yourself on a mail you're sending). All steps are wrapped so a
      // failure in CC computation can never block draft rendering.
      const myEmail = (currentUser?.email || "").toLowerCase();
      let auditEmails = [];
      try {
        const ur = await api.get("/auth/users/");
        const users = ur.data.results || ur.data || [];
        auditEmails = users
          .filter(u => u && u.email && (u.role === "admin" || u.role === "manager"))
          .map(u => u.email)
          .filter(e => e.toLowerCase() !== myEmail);
      } catch {}
      try {
        // Other contacts on this client (excluding the To recipient)
        (client?.contacts || []).forEach(c => {
          if (c?.email && c.email !== composeToEmail && c.email.toLowerCase() !== myEmail && !auditEmails.includes(c.email)) {
            auditEmails.push(c.email);
          }
        });
        // Shadow executive for this client
        const shadowEmail = client?.shadow_executive_email;
        if (shadowEmail && shadowEmail.toLowerCase() !== myEmail && !auditEmails.includes(shadowEmail)) {
          auditEmails.push(shadowEmail);
        }
      } catch {}

      const savedCc = (res.data.cc || "")
        .split(",").map(e => e.trim()).filter(Boolean)
        .filter(e => e.toLowerCase() !== myEmail);
      const merged = [...savedCc];
      auditEmails.forEach(e => { if (!merged.includes(e)) merged.push(e); });

      setDraftForm({ subject: res.data.subject, body: textToHtml(res.data.body), cc: merged.join(", ") });
      setDraftAttachments([]);
      setSavedAttachments(res.data.attachments || []);
      setLastSavedAt(res.data.last_saved_at);
      setShowDraftModal(true);
      // Check whether a Sample already exists for this email so the
      // "Create Sample Request" button can be suppressed.
      const commId = res.data.communication;
      if (commId) {
        try {
          const sr = await api.get(`/samples/?source_communication=${commId}`);
          const items = sr.data?.results || sr.data || [];
          setSampleAlreadyExists(items.length > 0);
        } catch { setSampleAlreadyExists(false); }
      } else {
        setSampleAlreadyExists(false);
      }
    } catch (err) {
      // Draft *loaded* successfully — only the post-load logic threw. Log
      // the real error so we don't gaslight the user with "Failed to load
      // draft" for an unrelated bug. Modal still opens.
      console.error("openDraft post-load error:", err);
    }
  };

  // Auto-open AI Draft modal when arriving from /quote-requests or
  // /proforma-invoices. Two query-param flavours are supported:
  //   ?openDraftFor=<communication_id>  → open the draft for that email
  //   ?openPI=<pi_id>                   → resolve PI → its source comm → draft
  // Once opened, strip the query param so a refresh doesn't keep re-opening it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const commId = searchParams.get("openDraftFor");
    const piId = searchParams.get("openPI");
    if (!commId && !piId) return;
    if (showDraftModal) return;
    autoOpenedRef.current = true;

    const openDraftForComm = async (commIdToOpen) => {
      let comm = (data || []).find((c) => String(c.id) === String(commIdToOpen));
      if (!comm) {
        try {
          const r = await api.get(`/communications/${commIdToOpen}/`);
          comm = r.data;
        } catch { return false; }
      }
      if (!comm) return false;
      if (comm.draft_id) {
        await openDraft(comm.draft_id);
        return true;
      }
      // No draft exists yet — create one on the fly
      try {
        const r = await api.post(`/communications/${commIdToOpen}/generate-draft/`);
        if (r.data?.id) {
          await openDraft(r.data.id);
          return true;
        }
      } catch {}
      return false;
    };

    (async () => {
      try {
        let resolvedCommId = commId;

        // PI flow: fetch the PI, fall back to latest inbound for the client
        if (piId && !resolvedCommId) {
          try {
            const r = await api.get(`/finance/pi/${piId}/`);
            resolvedCommId = r.data?.source_communication || null;
          } catch {}
          if (!resolvedCommId) {
            // Find the latest inbound email for this client
            try {
              const r = await api.get("/communications/", {
                params: { client: clientId, comm_type: "email", direction: "inbound" },
              });
              const list = r.data?.results || r.data || [];
              if (list.length > 0) resolvedCommId = list[0].id;
            } catch {}
          }
        }

        if (!resolvedCommId) {
          toast.error("No related email found for this item");
          return;
        }

        const ok = await openDraftForComm(resolvedCommId);
        if (!ok) {
          toast.error("Could not open AI draft for that email");
          return;
        }

        // Optional: pre-fill body with dispatch info from a sample. Triggered
        // from /samples/[id] → "Notify Client" button via ?dispatchSampleId=...
        const dispatchSampleId = searchParams.get("dispatchSampleId");
        if (dispatchSampleId) {
          try {
            const sr = await api.get(`/samples/${dispatchSampleId}/`);
            const s = sr.data || {};
            const items = Array.isArray(s.items) ? s.items.filter(it => it.product_name || it.client_product_name) : [];
            // Build a label that lists ALL requested products if there are
            // multiple, otherwise use the parent product_name field.
            const productLabel = items.length > 1
              ? items.map(it => it.product_name || it.client_product_name).filter(Boolean).join(", ")
              : (s.product_name || s.client_product_name || "the requested sample");
            const tracking = (s.tracking_number || "").trim();
            const courier = (s.courier_details || "").trim();

            // Compute estimated time of arrival — default to 5 working days
            // from dispatch_date (or today). This is a sensible export-courier
            // ballpark; the executive can edit before sending.
            let etaText = "";
            try {
              const start = s.dispatch_date ? new Date(s.dispatch_date) : new Date();
              const eta = new Date(start);
              eta.setDate(eta.getDate() + 5);
              etaText = eta.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
            } catch {}

            const headerLine = items.length > 1
              ? `<p>I'm pleased to inform you that the requested samples have been dispatched.</p>`
              : `<p>I'm pleased to inform you that the <strong>${productLabel}</strong> sample has been dispatched.</p>`;
            const lines = [
              `<p>Dear ${(s.client_name && s.client_name.split(" ")[0]) || "Sir/Madam"},</p>`,
              headerLine,
            ];

            // If multiple items, render a per-product list before the shipment details
            if (items.length > 1) {
              const productBits = items.map(it => {
                const name = it.product_name || it.client_product_name || "—";
                const qty = it.quantity || "—";
                return `<li><strong>${name}</strong> — ${qty}</li>`;
              });
              lines.push(`<p>Products dispatched:</p><ul>${productBits.join("")}</ul>`);
            }

            // Always render every key field — when a value is missing, show
            // a placeholder so the executive sees the line and fills it in
            // before sending. This is especially important for Airway Bill No.
            const detailBits = [];
            if (items.length <= 1) {
              detailBits.push(`<li><strong>Quantity:</strong> ${s.quantity || "—"}</li>`);
            }
            detailBits.push(`<li><strong>Courier:</strong> ${courier || "—"}</li>`);
            detailBits.push(`<li><strong>Airway Bill No:</strong> ${tracking || "—"}</li>`);
            detailBits.push(`<li><strong>Dispatch Date:</strong> ${s.dispatch_date || "—"}</li>`);
            detailBits.push(`<li><strong>Estimated Time of Arrival (ETA):</strong> ${etaText || "—"}</li>`);
            lines.push(`<p>Shipment details:</p><ul>${detailBits.join("")}</ul>`);
            lines.push(
              `<p>Please find the <strong>packaging images</strong> attached for your reference. Kindly verify the packaging upon receipt and let us know if everything is in order.</p>`
            );
            lines.push(`<p>We look forward to your feedback after evaluation.</p>`);
            const dispatchHtml = lines.join("");
            // Replace the body with the dispatch notification
            setDraftForm((prev) => ({
              ...prev,
              subject: prev.subject || `Sample Dispatched: ${productLabel}`,
              body: dispatchHtml,
            }));
          } catch {
            // Best-effort; silent fail keeps the original AI draft body intact
          }
        }
      } catch {
        toast.error("Could not open AI draft");
      } finally {
        router.replace(`/clients/${clientId}`, { scroll: false });
      }
    })();
  }, [data, searchParams, showDraftModal]);

  const handleSaveDraft = async () => {
    if (!draft) return;
    setSavingDraft(true);
    try {
      const fd = new FormData();
      fd.append("subject", draftForm.subject);
      fd.append("body", draftForm.body);
      fd.append("cc", draftForm.cc);
      draftAttachments.forEach(f => fd.append("attachments", f));
      const res = await api.post(`/communications/drafts/${draft.id}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setDraft(res.data);
      setSavedAttachments(res.data.attachments || []);
      setDraftAttachments([]); // clear new files (now saved on server)
      setLastSavedAt(res.data.last_saved_at);
      toast.success("Draft saved");
    } catch { toast.error("Failed to save draft"); }
    finally { setSavingDraft(false); }
  };

  const [regenerating, setRegenerating] = useState(false);
  const handleRegenerateDraft = async () => {
    if (!draft) return;
    if (!confirm("Regenerate this draft? Your current edits will be replaced with a fresh AI reply.")) return;
    setRegenerating(true);
    try {
      const res = await api.post(`/communications/drafts/${draft.id}/regenerate/`);
      setDraft(res.data);
      setDraftForm({
        subject: res.data.subject,
        body: textToHtml(res.data.body),
        cc: res.data.cc || draftForm.cc,
      });
      toast.success("AI draft regenerated");
    } catch { toast.error("Failed to regenerate"); }
    finally { setRegenerating(false); }
  };

  const handleRemoveSavedAttachment = async (attId) => {
    try {
      await api.post(`/communications/drafts/${draft.id}/remove-attachment/`, { attachment_id: attId });
      setSavedAttachments(prev => prev.filter(a => a.id !== attId));
      toast.success("Attachment removed");
    } catch { toast.error("Failed to remove"); }
  };

  const handleSendDraft = async () => {
    setSendingDraft(true);
    try {
      let draftId = draft.id;

      // If the loaded draft was already sent (e.g. user clicked Reply Again
      // or Notify Client on a sample whose original reply has been sent),
      // create a fresh draft for the same communication instead of trying
      // to re-send the old one — the backend rejects sent drafts with
      // "Only drafts can be sent".
      if (draft.status === "sent") {
        const created = await api.post("/communications/drafts/", {
          communication: draft.communication,
          client: draft.client || clientId,
          subject: draftForm.subject,
          body: draftForm.body,
          to_email: draft.to_email,
          cc: draftForm.cc || "",
        });
        draftId = created.data.id;
      } else {
        // Save draft edits first
        await api.patch(`/communications/drafts/${draftId}/`, {
          subject: draftForm.subject,
          body: draftForm.body,
          cc: draftForm.cc,
        });
      }

      // Upload any frontend attachments to the draft before sending
      if (draftAttachments.length > 0) {
        const fd = new FormData();
        fd.append("subject", draftForm.subject);
        fd.append("body", draftForm.body);
        fd.append("cc", draftForm.cc || "");
        draftAttachments.forEach(file => fd.append("attachments", file));
        await api.post(`/communications/drafts/${draftId}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }

      // Close modal immediately
      setShowDraftModal(false);
      setDraftAttachments([]);

      sendWithUndo(
        async () => {
          // Draft send endpoint includes ALL saved attachments (DB + just-uploaded)
          await api.post(`/communications/drafts/${draftId}/send/`);
        },
        {
          preview: { to: draft.to_email, cc: draftForm.cc, subject: draftForm.subject, body: draftForm.body },
          onSent: () => reload(),
          onError: (err) => toast.error(getErrorMessage(err, "Failed to send")),
        }
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send"));
    } finally {
      setSendingDraft(false);
    }
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

    // Store raw transcript chunks
    let rawTranscript = '';

    // Show "recording" state in body
    setDraftForm(prev => ({ ...prev, body: '' }));

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript + ' ';
      }
      if (transcript.trim()) {
        rawTranscript += (rawTranscript ? ' ' : '') + transcript.trim();
        // Show raw transcript while recording
        setDraftForm(prev => ({ ...prev, body: rawTranscript }));
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
      // When recording stops, send raw transcript to AI for summarization
      if (rawTranscript.trim()) {
        setDraftForm(prev => ({ ...prev, body: rawTranscript.trim() + '\n\n⏳ AI is summarizing...' }));
        const context = `Client: ${client?.company_name || ''}, Subject: ${draftForm.subject || ''}`;
        const voiceContactName = draft?.to_email
          ? (client?.contacts?.find(c => c.email === draft.to_email)?.name || client?.contacts?.find(c => c.is_primary)?.name || '')
          : (client?.contacts?.find(c => c.is_primary)?.name || '');
        api.post('/communications/summarize-voice/', { text: rawTranscript.trim(), context, contact_name: voiceContactName })
          .then((res) => {
            setDraftForm(prev => ({ ...prev, body: res.data.summarized }));
            toast.success("AI summarized your voice input");
          })
          .catch(() => {
            // Keep raw transcript if AI fails
            setDraftForm(prev => ({ ...prev, body: rawTranscript.trim() }));
            toast.error("AI summarization failed, keeping raw text");
          });
      }
    };

    try {
      recognition.start();
      setIsListening(true);
      toast.success("Listening... Speak now. Click stop when done.");
    } catch (e) {
      toast.error("Failed to start voice recognition");
      setIsListening(false);
    }
  };

  const columns = [
    { key: "is_starred", label: "", render: (row) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          api.post(`/communications/${row.id}/toggle-star/`).then(() => reload()).catch(() => {});
        }}
        className="p-0.5 hover:scale-125 transition-transform"
        title={row.is_starred ? "Unstar" : "Star"}
      >
        {row.is_starred ? (
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        ) : (
          <svg className="w-4 h-4 text-gray-300 hover:text-yellow-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
        )}
      </button>
    )},
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
    { key: "created_at", label: "Date & Time", render: (row) => fmtDateTime(row.created_at) },
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
          {["all", "email", "whatsapp", "call", "note", "starred", "drafts"].map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 text-xs font-medium rounded-full ${filterType === t ? (t === "drafts" ? "bg-purple-600 text-white" : t === "starred" ? "bg-yellow-500 text-white" : "bg-indigo-600 text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "all" ? "All" : t === "starred" ? `Starred (${(data || []).filter(r => r.is_starred).length})` : t === "drafts" ? `Drafts (${(data || []).filter(r => r.draft_id && r.draft_status === "draft").length})` : t.charAt(0).toUpperCase() + t.slice(1)}
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
        if (filterType === "drafts") return row.draft_id && row.draft_status === "draft";
        if (filterType === "starred") return row.is_starred;
        if (filterType !== "all" && row.comm_type !== filterType) return false;
        if (filterSearch) {
          const q = filterSearch.toLowerCase();
          return (row.subject || "").toLowerCase().includes(q) || (row.external_email || "").toLowerCase().includes(q) || (row.external_phone || "").includes(q) || (row.body || "").toLowerCase().includes(q);
        }
        return true;
      })} loading={loading} emptyTitle="No communications" emptyDescription="Log your first communication with this client" />
      <ComposeEmailModal open={showEmailModal} onClose={() => setShowEmailModal(false)} clientId={clientId} contactEmail={composeToEmail} ccEmails={composeCcEmails} onSent={reload} />
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
              <EmailChips
                value={draftForm.cc}
                onChange={(val) => setDraftForm({ ...draftForm, cc: val })}
                placeholder="Add CC recipients..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <RichTextEditor
                value={draftForm.body}
                onChange={(val) => setDraftForm({ ...draftForm, body: val })}
                placeholder="Compose your reply..."
                minHeight="180px"
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                  📎 Add Files
                  <input type="file" multiple onChange={(e) => setDraftAttachments(prev => [...prev, ...Array.from(e.target.files)])} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
                </label>
                <span className="text-xs text-gray-400">
                  {(savedAttachments.length + draftAttachments.length) > 0 ? `${savedAttachments.length + draftAttachments.length} file(s)` : "No files attached"}
                </span>
              </div>
              {/* Saved attachments (from server) */}
              {savedAttachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {savedAttachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg text-xs hover:bg-green-100 transition-colors">
                      <a
                        href={att.file}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open ${att.filename}`}
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:underline"
                      >
                        <span className="text-green-500">📄</span>
                        <span className="font-medium truncate">{att.filename}</span>
                        <span className="text-gray-400 shrink-0">{(att.file_size / 1024).toFixed(1)} KB</span>
                        <span className="text-green-600 text-[10px] shrink-0">Saved</span>
                      </a>
                      <button onClick={() => handleRemoveSavedAttachment(att.id)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">&times;</button>
                    </div>
                  ))}
                </div>
              )}
              {/* New attachments (not yet saved) */}
              {draftAttachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {draftAttachments.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">📄</span>
                        <span className="font-medium">{file.name}</span>
                        <span className="text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                        <span className="text-amber-600 text-[10px]">Unsaved</span>
                      </div>
                      <button onClick={() => setDraftAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Last saved indicator */}
            {lastSavedAt && (
              <p className="text-[10px] text-gray-400">Last saved: {new Date(lastSavedAt).toLocaleString()}</p>
            )}

            {/* Smart Generate Buttons — open editor, then attach.
                Visibility is CONTEXT-AWARE:
                - If a Quotation_*.pdf is already attached (user arrived from
                  the Quotations page) → only Generate Quotation shows.
                - If a PI_*.pdf is already attached (arrived from PI page) →
                  only Generate PI shows.
                - If BOTH are attached → both buttons show (so the user can
                  refresh either).
                - If NEITHER is attached → fall back to keyword detection
                  on the email body, so a fresh draft from the inbox still
                  surfaces the relevant buttons. */}
            {(() => {
              const draftText = `${draftForm.subject || ""} ${draftForm.body || ""} ${draft?.communication?.subject || ""}`.toLowerCase().replace(/<[^>]+>/g, " ");
              // Look at the saved/uploaded attachment filenames first to
              // detect the "context" — which page the user came from.
              const allAttachmentNames = [
                ...savedAttachments.map(a => (a.filename || "").toLowerCase()),
                ...draftAttachments.map(a => (a.name || "").toLowerCase()),
              ];
              const hasQuoteAttached = allAttachmentNames.some(n => n.startsWith("quotation_"));
              const hasPiAttached = allAttachmentNames.some(n => n.startsWith("pi_"));
              const hasContextAttachment = hasQuoteAttached || hasPiAttached;

              // Keyword detection on the email body — used only when there's
              // no attachment context yet.
              const kwQuote = /\b(quotation|quote|pricing|price list|rate card|rates)\b/i.test(draftText);
              const kwPI = /\b(proforma invoice|proforma|performa|pi)\b|send pi|need pi/i.test(draftText);
              const wantsSample = /\b(sample|samples|trial|swatch|free sample)\b/i.test(draftText);

              // Final visibility: attachment context wins; fall back to keywords.
              const wantsQuote = hasContextAttachment ? hasQuoteAttached : kwQuote;
              const wantsPI = hasContextAttachment ? hasPiAttached : kwPI;

              // COA/MSDS/TDS/Certificate detection
              const DOC_PATTERNS = [
                { key: "coa", label: "COA", pattern: /\b(coa|certificate\s+of\s+analysis)\b/i },
                { key: "msds", label: "MSDS", pattern: /\b(msds|sds|material\s+safety|safety\s+data\s+sheet)\b/i },
                { key: "tds", label: "TDS", pattern: /\b(tds|technical\s+data\s+sheet)\b/i },
                { key: "certificate", label: "Certificate", pattern: /\b(certificate|certification|organic\s+cert|halal\s+cert)\b/i },
              ];
              const detectedDocs = DOC_PATTERNS.filter(d => d.pattern.test(draftText));
              const wantsDocs = detectedDocs.length > 0;

              if (!wantsQuote && !wantsPI && !wantsSample && !wantsDocs) return null;

              const openQuoteEditor = async () => {
                try {
                  // Pass the source communication so the backend can AI-extract
                  // product, quantity, destination, etc. and pre-fill the line item.
                  // `draft.communication` is the PK (UUID string), not a nested object.
                  const commId = draft?.communication || draft?.communication_id || null;
                  const res = await api.post("/quotations/quotations/create-blank/", {
                    client_id: clientId,
                    communication_id: commId,
                  });
                  const qt = res.data;
                  setAttachQt(qt);
                  setAttachQtForm(qt);
                  setAttachQtItems(qt.items || []);
                  setAttachMode("quote");
                  toast.success(`Quotation ${qt.quotation_number} created — edit and attach`);
                } catch { toast.error("Failed to create quotation"); }
              };

              const openSampleRequest = async () => {
                try {
                  const commId = draft?.communication || draft?.communication_id || null;
                  const res = await api.post("/samples/create-from-email/", {
                    client_id: clientId,
                    communication_id: commId,
                  });
                  const sample = res.data;
                  const productLabel = sample.product_name || sample.client_product_name || "(no product)";
                  const qtyLabel = sample.quantity ? ` · ${sample.quantity}` : "";
                  toast.success(`Sample request created for ${productLabel}${qtyLabel}`);
                  setSampleAlreadyExists(true);
                } catch { toast.error("Failed to create sample request"); }
              };

              const openPiEditor = async () => {
                try {
                  // Pass the source communication so the backend can AI-extract
                  // product, quantity, client product name, and price from the email.
                  // `draft.communication` is the PK (UUID string), not a nested object.
                  const commId = draft?.communication || draft?.communication_id || null;
                  const res = await api.post("/finance/pi/create-standalone/", {
                    client_id: clientId,
                    communication_id: commId,
                  });
                  const pi = res.data;
                  setAttachPi(pi);
                  setAttachMode("pi");
                  toast.success(`PI ${pi.invoice_number} created — edit and attach`);
                } catch { toast.error("Failed to create PI"); }
              };

              // (hasQuoteAttached / hasPiAttached already computed above for
              // visibility — they double as the disabled-state for the buttons)
              return (
                <div className="flex gap-2 py-1">
                  {wantsQuote && (
                    <button
                      onClick={openQuoteEditor}
                      disabled={hasQuoteAttached}
                      title={hasQuoteAttached ? "A quotation is already attached" : ""}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-50"
                    >
                      📋 Generate Quotation
                    </button>
                  )}
                  {wantsPI && (
                    <button
                      onClick={openPiEditor}
                      disabled={hasPiAttached}
                      title={hasPiAttached ? "A proforma invoice is already attached" : ""}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-50"
                    >
                      📄 Generate PI
                    </button>
                  )}
                  {wantsSample && !sampleAlreadyExists && (
                    <button
                      onClick={openSampleRequest}
                      title="Create a sample request for this client"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100"
                    >
                      🧪 Create Sample Request
                    </button>
                  )}
                  {wantsDocs && (
                    <>
                      <button
                        onClick={() => setShowDocPicker(true)}
                        title={`Attach from Document Library`}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100"
                      >
                        📋 Attach {detectedDocs.map(d => d.label).join("/")} from Library
                      </button>
                      <label
                        title={`Upload a new file and attach`}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-green-700 bg-green-50 hover:bg-green-100 cursor-pointer"
                      >
                        ⬆ Upload New
                        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !draft?.id) return;
                          try {
                            const fd = new FormData();
                            fd.append("attachments", file);
                            await api.post(`/communications/drafts/${draft.id}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                            toast.success(`${file.name} attached`);
                            const r = await api.get(`/communications/drafts/${draft.id}/`);
                            setSavedAttachments(r.data.attachments || []);
                          } catch { toast.error("Failed to upload"); }
                          e.target.value = "";
                        }} />
                      </label>
                      {detectedDocs.some(d => d.key === "coa") && (
                        <button
                          onClick={() => setShowCOAEditor(true)}
                          title="Create a new Certificate of Analysis"
                          className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-blue-700 bg-blue-50 hover:bg-blue-100"
                        >
                          📝 Create COA
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center justify-between gap-y-2 pt-2 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={handleVoiceToText} className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 whitespace-nowrap ${isListening ? 'text-red-700 bg-red-50 hover:bg-red-100 animate-pulse' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'}`}>
                  {isListening ? '⏹ Stop Recording' : '🎤 Voice to Text'}
                </button>
                <RefineDropdown body={draftForm.body} onRefined={(text) => setDraftForm({ ...draftForm, body: text })} contactName={draft?.to_email ? (client?.contacts?.find(c => c.email === draft.to_email)?.name || client?.contacts?.find(c => c.is_primary)?.name || '') : (client?.contacts?.find(c => c.is_primary)?.name || '')} />
                <button onClick={handleRegenerateDraft} disabled={regenerating} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 whitespace-nowrap text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 disabled:opacity-50" title="Regenerate the AI reply from scratch">
                  {regenerating ? "Regenerating..." : "🔄 Regenerate"}
                </button>
                <button onClick={handleSaveDraft} disabled={savingDraft} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 whitespace-nowrap text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50">
                  {savingDraft ? "Saving..." : "💾 Save as Draft"}
                </button>
                <button onClick={handleDiscardDraft} className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium whitespace-nowrap">
                  Discard
                </button>
              </div>
              <div className="flex gap-2 items-center ml-auto">
                <button onClick={() => setShowDraftModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 whitespace-nowrap">Cancel</button>
                <button onClick={handleSendDraft} disabled={sendingDraft} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
                  {sendingDraft ? "Sending..." : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* COA Editor — create and attach Certificate of Analysis */}
      <COAEditorModal
        open={showCOAEditor}
        onClose={() => setShowCOAEditor(false)}
        productName=""
        clientName={client?.company_name || ""}
        onGenerate={async (formData) => {
          if (!draft?.id) { toast.error("No draft to attach to"); return; }
          try {
            await api.post("/communications/generate-coa-pdf/", { ...formData, draft_id: draft.id });
            toast.success("COA generated and attached");
            setShowCOAEditor(false);
            const r = await api.get(`/communications/drafts/${draft.id}/`);
            setSavedAttachments(r.data.attachments || []);
          } catch { toast.error("Failed to generate COA"); }
        }}
      />

      {/* Document Library Picker — browse CRM documents and attach */}
      {showDocPicker && (
        <DocLibraryPickerShared
          draftId={draft?.id}
          onClose={() => setShowDocPicker(false)}
          onAttached={() => {
            if (draft?.id) {
              api.get(`/communications/drafts/${draft.id}/`).then(r => {
                setSavedAttachments(r.data.attachments || []);
              }).catch(() => {});
            }
          }}
        />
      )}

      {/* Quotation Editor for Attach */}
      <QuotationEditorModal
        open={attachMode === "quote" && !!attachQt}
        onClose={() => { setAttachMode(null); setAttachQt(null); }}
        qt={attachQt} qtForm={attachQtForm} setQtForm={setAttachQtForm}
        qtItems={attachQtItems} setQtItems={setAttachQtItems}
        onSave={async () => {
          if (!attachQt) return;
          try {
            const display_overrides = {};
            Object.entries(attachQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            const res = await api.post(`/quotations/quotations/${attachQt.id}/save-with-items/`, { ...attachQtForm, display_overrides, items: attachQtItems });
            setAttachQt(res.data); setAttachQtForm(res.data); setAttachQtItems(res.data.items || []);
            toast.success("Quotation saved");
          } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
        }}
        onPreview={async () => {
          if (!attachQt) return;
          try {
            const display_overrides = {};
            Object.entries(attachQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/quotations/quotations/${attachQt.id}/save-with-items/`, { ...attachQtForm, display_overrides, items: attachQtItems });
            const res = await api.get(`/quotations/quotations/${attachQt.id}/generate-pdf/`, { responseType: "blob" });
            const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const title = `Quotation ${attachQt.quotation_number}`;
            const w = window.open("", "_blank");
            if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
          } catch { toast.error("Failed to preview"); }
        }}
        onSend={async () => {
          // "Attach" instead of "Send" — save, generate PDF, attach to draft
          if (!attachQt) return;
          try {
            const display_overrides = {};
            Object.entries(attachQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/quotations/quotations/${attachQt.id}/save-with-items/`, { ...attachQtForm, display_overrides, items: attachQtItems });
            const pdfRes = await api.get(`/quotations/quotations/${attachQt.id}/generate-pdf/`, { responseType: "blob" });
            const filename = `Quotation_${attachQt.quotation_number.replace(/\//g, "-")}.pdf`;
            const file = new File([pdfRes.data], filename, { type: "application/pdf" });
            setDraftAttachments(prev => [...prev, file]);
            toast.success(`${filename} attached to draft`);
            setAttachMode(null); setAttachQt(null);
          } catch { toast.error("Failed to attach quotation"); }
        }}
        sending={false}
        sendLabel="Attach to Email"
      />

      {/* PI Editor for Attach */}
      {attachMode === "pi" && attachPi && (
        <PIEditorModal
          open={true}
          onClose={() => { setAttachMode(null); setAttachPi(null); }}
          pi={attachPi} piForm={attachPi} setPiForm={setAttachPi}
          piItems={attachPi.items || []} setPiItems={(items) => setAttachPi(prev => ({ ...prev, items }))}
          onSave={async () => {
            try {
              const res = await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, items: attachPi.items || [] });
              setAttachPi(res.data);
              toast.success("PI saved");
            } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
          }}
          onPreview={async () => {
            try {
              await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, items: attachPi.items || [] });
              const res = await api.get(`/finance/pi/${attachPi.id}/generate-pdf/`, { responseType: "blob" });
              const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
              const title = `PI ${attachPi.invoice_number}`;
              const w = window.open("", "_blank");
              if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
            } catch { toast.error("Failed to preview"); }
          }}
          onSend={async () => {
            try {
              await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, items: attachPi.items || [] });
              const pdfRes = await api.get(`/finance/pi/${attachPi.id}/generate-pdf/`, { responseType: "blob" });
              const filename = `PI_${attachPi.invoice_number.replace(/\//g, "-")}.pdf`;
              const file = new File([pdfRes.data], filename, { type: "application/pdf" });
              setDraftAttachments(prev => [...prev, file]);
              toast.success(`${filename} attached to draft`);
              setAttachMode(null); setAttachPi(null);
            } catch { toast.error("Failed to attach PI"); }
          }}
          sending={false}
          sendLabel="Attach to Email"
        />
      )}
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

  // For executives: auto-assign to secondary owner of this client
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

  const handleUpdateStatus = async (taskId, status, note) => {
    try {
      await api.post(`/tasks/${taskId}/update-status/`, { status, status_note: note || "" });
      toast.success("Status updated");
      reload();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
  };

  const columns = [
    { key: "title", label: "Task", render: (row) => (
      <div>
        <span className="font-medium">{row.title}</span>
        {row.status_note && <p className="text-[10px] text-gray-400 mt-0.5">{row.status_note}</p>}
      </div>
    )},
    { key: "owner_name", label: "Assigned To", render: (row) => <span className="text-sm">{row.owner_name || "\u2014"}</span> },
    { key: "creator_name", label: "Assigned By", render: (row) => <span className="text-sm text-gray-500">{row.creator_name || "\u2014"}</span> },
    { key: "priority", label: "Priority", render: (row) => <StatusBadge status={row.priority} /> },
    { key: "status", label: "Status", render: (row) => (
      <div onClick={e => e.stopPropagation()}>
        <ModernSelect value={row.status} onChange={(v) => handleUpdateStatus(row.id, v)} size="xs" options={[
          { value: "pending", label: "Pending", color: "#d97706", dot: true },
          { value: "in_progress", label: "In Progress", color: "#2563eb", dot: true },
          { value: "completed", label: "Completed", color: "#059669", dot: true },
          { value: "cancelled", label: "Cancelled", color: "#dc2626", dot: true },
        ]} />
      </div>
    )},
    { key: "due_date", label: "Due Date", render: (row) => fmtDate(row.due_date) },
    { key: "actions", label: "", render: (row) => row.status !== "completed" && row.status !== "cancelled" && (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input placeholder="Add note..." onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { handleUpdateStatus(row.id, row.status, e.target.value.trim()); e.target.value = ""; } }}
          className="text-xs px-2 py-1 border border-gray-200 rounded-lg outline-none w-28 focus:ring-1 focus:ring-indigo-400" />
      </div>
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
            {(() => {
              let assignees = [];
              if (currentUser?.role === "admin" || currentUser?.role === "manager") {
                // Admin/Manager: show all users
                assignees = users.map(u => ({ ...u, tag: u.role }));
              } else {
                // Executive: show self + shadow executive of this client
                const self = users.find(u => u.id === currentUser?.id);
                if (self) assignees.push({ ...self, tag: "Self" });
                // Client's shadow executive
                if (client?.shadow_executive) {
                  const shadow = users.find(u => u.id === client.shadow_executive);
                  if (shadow && shadow.id !== currentUser?.id) assignees.push({ ...shadow, tag: "Shadow Executive" });
                }
                // Client's primary executive (if not self)
                if (client?.primary_executive) {
                  const primary = users.find(u => u.id === client.primary_executive);
                  if (primary && primary.id !== currentUser?.id && !assignees.some(a => a.id === primary.id)) assignees.push({ ...primary, tag: "Primary Executive" });
                }
              }
              return (
                <div className="space-y-1">
                  {assignees.map(u => (
                    <label key={u.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${form.owner === u.id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
                      <input type="radio" name="task_owner" value={u.id} checked={form.owner === u.id} onChange={() => setForm({ ...form, owner: u.id })} className="text-indigo-600" />
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(u.full_name || u.first_name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{u.full_name || `${u.first_name} ${u.last_name}`}</p>
                        <p className="text-[10px] text-gray-400">{u.email}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        u.tag === "Self" ? "bg-blue-50 text-blue-600" :
                        u.tag === "admin" ? "bg-red-50 text-red-600" :
                        u.tag === "manager" ? "bg-purple-50 text-purple-600" :
                        u.tag === "Shadow Executive" ? "bg-amber-50 text-amber-600" :
                        "bg-green-50 text-green-600"
                      }`}>{u.tag === "Self" ? "You" : u.tag?.charAt(0).toUpperCase() + u.tag?.slice(1)}</span>
                    </label>
                  ))}
                </div>
              );
            })()}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              📎 Add Files
              <input type="file" multiple onChange={(e) => setForm({ ...form, attachments: [...(form.attachments || []), ...Array.from(e.target.files)] })} className="hidden" />
            </label>
            {form.attachments?.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.attachments.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                    <button type="button" onClick={() => setForm({ ...form, attachments: form.attachments.filter((_, idx) => idx !== i) })} className="text-red-400 hover:text-red-600">&times;</button>
                  </div>
                ))}
              </div>
            )}
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
  const { data: quotations, loading: loadingQt, reload: reloadQt } = useTabData(clientId, "/quotations/quotations/", activeTab, "quotations");
  const [piList, setPiList] = useState([]);
  const [loadingPi, setLoadingPi] = useState(false);
  const [subTab, setSubTab] = useState("inquiries");

  // Open quotation editor
  const [editQt, setEditQt] = useState(null);
  const [editQtForm, setEditQtForm] = useState({});
  const [editQtItems, setEditQtItems] = useState([]);
  const [qtSending, setQtSending] = useState(false);

  // Open PI editor
  const [editPi, setEditPi] = useState(null);
  const [editPiForm, setEditPiForm] = useState({});
  const [editPiItems, setEditPiItems] = useState([]);
  const [piSending, setPiSending] = useState(false);

  // Load PIs
  useEffect(() => {
    if (activeTab === "quotations") {
      setLoadingPi(true);
      api.get("/finance/pi/", { params: { client: clientId } }).then(r => setPiList(r.data.results || r.data)).catch(() => {}).finally(() => setLoadingPi(false));
    }
  }, [activeTab, clientId]);

  const openQuotation = (row) => {
    setEditQt(row); setEditQtForm({ ...row, ...row.display_overrides }); setEditQtItems(row.items || []);
  };
  const openPI = (row) => {
    setEditPi(row); setEditPiForm(row); setEditPiItems(row.items || []);
  };

  const inquiryColumns = [
    { key: "product_name", label: "Product", render: (row) => row.product_name || "General" },
    { key: "source", label: "Source", render: (row) => <StatusBadge status={row.source} /> },
    { key: "stage", label: "Stage", render: (row) => <StatusBadge status={row.stage} /> },
    { key: "expected_value", label: "Value", render: (row) => row.expected_value ? `$${Number(row.expected_value).toLocaleString()}` : "\u2014" },
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
  ];

  const viewPdf = async (type, id, number) => {
    try {
      const url = type === "qt" ? `/quotations/quotations/${id}/generate-pdf/` : `/finance/pi/${id}/generate-pdf/`;
      const res = await api.get(url, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = type === "qt" ? `Quotation ${number}` : `PI ${number}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to load PDF"); }
  };

  const quotationColumns = [
    { key: "quotation_number", label: "Number", render: (row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => row.status === "draft" || row.status === "pending_approval" || row.status === "approved" ? openQuotation(row) : viewPdf("qt", row.id, row.quotation_number)} className="font-medium text-indigo-600 hover:text-indigo-700">{row.quotation_number}</button>
        {row.version > 1 && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">v{row.version}</span>}
      </div>
    )},
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
  ];

  const piColumns = [
    { key: "invoice_number", label: "Number", render: (row) => (
      <button onClick={() => row.status === "draft" ? openPI(row) : viewPdf("pi", row.id, row.invoice_number)} className="font-medium text-indigo-600 hover:text-indigo-700">{row.invoice_number}</button>
    )},
    { key: "total", label: "Value", render: (row) => row.total ? `${row.currency || "USD"} ${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "invoice_date", label: "Date", render: (row) => fmtDate(row.invoice_date) },
  ];

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubTab("inquiries")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "inquiries" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Inquiries ({inquiries.length})</button>
        <button onClick={() => setSubTab("quotations")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "quotations" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Quotations ({quotations.length})</button>
        <button onClick={() => setSubTab("pi")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${subTab === "pi" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Proforma Invoices ({piList.length})</button>
      </div>
      {subTab === "inquiries" && (
        <DataTable columns={inquiryColumns} data={inquiries} loading={loadingInq} emptyTitle="No inquiries" emptyDescription="No inquiries from this client" />
      )}
      {subTab === "quotations" && (
        <DataTable columns={quotationColumns} data={quotations} loading={loadingQt} emptyTitle="No quotations" emptyDescription="No quotations for this client"
          onRowClick={(row) => ["draft", "pending_approval", "approved"].includes(row.status) ? openQuotation(row) : viewPdf("qt", row.id, row.quotation_number)} />
      )}
      {subTab === "pi" && (
        <DataTable columns={piColumns} data={piList} loading={loadingPi} emptyTitle="No proforma invoices" emptyDescription="No PIs for this client"
          onRowClick={(row) => row.status === "draft" ? openPI(row) : viewPdf("pi", row.id, row.invoice_number)} />
      )}

      {/* Quotation Editor */}
      <QuotationEditorModal
        open={!!editQt} onClose={() => { setEditQt(null); reloadQt(); }}
        qt={editQt || {}} qtForm={editQtForm} setQtForm={setEditQtForm}
        qtItems={editQtItems} setQtItems={setEditQtItems}
        onSave={async () => {
          if (!editQt) return;
          try {
            const display_overrides = {};
            Object.entries(editQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            const res = await api.post(`/quotations/quotations/${editQt.id}/save-with-items/`, { ...editQtForm, display_overrides, items: editQtItems });
            setEditQt(res.data); setEditQtForm({ ...res.data, ...res.data.display_overrides }); setEditQtItems(res.data.items || []);
            toast.success("Quotation saved");
          } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
        }}
        onPreview={async () => {
          if (!editQt) return;
          try {
            const display_overrides = {};
            Object.entries(editQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/quotations/quotations/${editQt.id}/save-with-items/`, { ...editQtForm, display_overrides, items: editQtItems });
            const res = await api.get(`/quotations/quotations/${editQt.id}/generate-pdf/`, { responseType: "blob" });
            const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const title = `Quotation ${editQt.quotation_number}`;
            const w = window.open("", "_blank");
            if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
          } catch { toast.error("Failed to preview"); }
        }}
        onSend={async () => {
          if (!editQt) return;
          setQtSending(true);
          try {
            await api.post(`/quotations/quotations/${editQt.id}/send-to-client/`, { send_via: "email" });
            toast.success("Quotation sent!"); setEditQt(null); reloadQt();
          } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
          finally { setQtSending(false); }
        }}
        sending={qtSending}
      />

      {/* PI Editor */}
      <PIEditorModal
        open={!!editPi} onClose={() => { setEditPi(null); api.get("/finance/pi/", { params: { client: clientId } }).then(r => setPiList(r.data.results || r.data)).catch(() => {}); }}
        pi={editPi || {}} piForm={editPiForm} setPiForm={setEditPiForm}
        piItems={editPiItems} setPiItems={setEditPiItems}
        onSave={async () => {
          if (!editPi) return;
          try {
            const res = await api.post(`/finance/pi/${editPi.id}/save-with-items/`, { ...editPiForm, items: editPiItems });
            setEditPi(res.data); setEditPiForm(res.data); setEditPiItems(res.data.items || []);
            toast.success("PI saved");
          } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
        }}
        onPreview={async () => {
          if (!editPi) return;
          try {
            await api.post(`/finance/pi/${editPi.id}/save-with-items/`, { ...editPiForm, items: editPiItems });
            const res = await api.get(`/finance/pi/${editPi.id}/generate-pdf/`, { responseType: "blob" });
            const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const title = `PI ${editPi.invoice_number}`;
            const w = window.open("", "_blank");
            if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
          } catch { toast.error("Failed to preview"); }
        }}
        onSend={async () => {
          if (!editPi) return;
          setPiSending(true);
          try {
            await api.post(`/finance/pi/${editPi.id}/save-with-items/`, { ...editPiForm, items: editPiItems });
            const res = await api.post(`/finance/pi/${editPi.id}/send-email/`);
            toast.success(`PI sent to ${res.data.sent_to}`); setEditPi(null);
            api.get("/finance/pi/", { params: { client: clientId } }).then(r => setPiList(r.data.results || r.data)).catch(() => {});
          } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
          finally { setPiSending(false); }
        }}
        sending={piSending}
      />
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

// ── Price List Tab ──
function PriceListTab({ clientId, activeTab }) {
  const { data, loading, reload } = useTabData(clientId, "/clients/price-list/", activeTab, "price_list");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [products, setProducts] = useState([]);
  const plUser = useSelector((state) => state.auth.user);
  const canEdit = plUser?.role === "admin" || plUser?.role === "manager";
  const [form, setForm] = useState({ product: "", product_name: "", client_product_name: "", unit_price: "", currency: "USD", unit: "KG", moq: "", valid_from: "", valid_until: "", notes: "" });

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleProductSelect = (productId) => {
    const p = products.find(pr => String(pr.id) === String(productId));
    if (p) {
      setForm(f => ({ ...f, product: p.id, product_name: p.name, unit_price: p.base_price || "", currency: p.currency || "USD", unit: p.unit || "KG" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, client: clientId };
      if (!payload.valid_from) payload.valid_from = null;
      if (!payload.valid_until) payload.valid_until = null;
      if (editing) {
        await api.patch(`/clients/price-list/${editing}/`, payload);
        toast.success("Price updated");
      } else {
        await api.post("/clients/price-list/", payload);
        toast.success("Price added");
      }
      setShowModal(false); setEditing(null); reload();
      setForm({ product: "", product_name: "", client_product_name: "", unit_price: "", currency: "USD", unit: "KG", moq: "", valid_from: "", valid_until: "", notes: "" });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handleEdit = (item) => {
    setEditing(item.id);
    setForm({ product: item.product || "", product_name: item.product_name, client_product_name: item.client_product_name || "", unit_price: item.unit_price, currency: item.currency, unit: item.unit, moq: item.moq || "", valid_from: item.valid_from || "", valid_until: item.valid_until || "", notes: item.notes || "" });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this price entry?")) return;
    try { await api.delete(`/clients/price-list/${id}/`); toast.success("Removed"); reload(); }
    catch { toast.error("Failed to delete"); }
  };

  const columns = [
    { key: "product_name", label: "Product Name", render: (row) => <span className="font-medium">{row.product_name}</span> },
    { key: "client_product_name", label: "Client's Name", render: (row) => row.client_product_name || "—" },
    { key: "unit_price", label: "Price", render: (row) => <span className="font-semibold text-green-700">{row.currency} {Number(row.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
    { key: "unit", label: "Unit" },
    { key: "moq", label: "MOQ", render: (row) => row.moq || "—" },
    { key: "product_base_price", label: "Base Price", render: (row) => row.product_base_price ? <span className="text-gray-400">{row.currency} {Number(row.product_base_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> : "—" },
    { key: "valid_until", label: "Valid Until", render: (row) => row.valid_until ? fmtDate(row.valid_until) : "—" },
    ...(canEdit ? [{ key: "actions", label: "", render: (row) => (
      <div className="flex gap-1">
        <button onClick={() => handleEdit(row)} className="px-2 py-1 text-xs text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">Edit</button>
        <button onClick={() => handleDelete(row.id)} className="px-2 py-1 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">Delete</button>
      </div>
    )}] : []),
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{data.length} product{data.length !== 1 ? "s" : ""} in price list</p>
        {canEdit && <button onClick={() => { setEditing(null); setForm({ product: "", product_name: "", client_product_name: "", unit_price: "", currency: "USD", unit: "KG", moq: "", valid_from: "", valid_until: "", notes: "" }); setShowModal(true); }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add Price</button>}
      </div>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No price list" emptyDescription="Add custom product pricing for this client" />
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? "Edit Price" : "Add Price"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <select value={form.product} onChange={(e) => { setForm({ ...form, product: e.target.value }); handleProductSelect(e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select product (or type manually below)</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client's Product Name</label>
              <input value={form.client_product_name} onChange={(e) => setForm({ ...form, client_product_name: e.target.value })} placeholder="Name used by client" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price *</label>
              <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option><option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="KG">KG</option><option value="MT">MT</option><option value="Ltrs">Ltrs</option><option value="Pcs">Pcs</option><option value="Drums">Drums</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MOQ</label>
              <input value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} placeholder="e.g. 500 KG" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
              <input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">{editing ? "Update" : "Add Price"}</button>
            <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Purchase History Tab ──
function PurchaseHistoryTab({ clientId, activeTab }) {
  const { data, loading, reload } = useTabData(clientId, "/clients/purchase-history/", activeTab, "purchase_history");
  const [showModal, setShowModal] = useState(false);
  const phUser = useSelector((state) => state.auth.user);
  const canEdit = phUser?.role === "admin" || phUser?.role === "manager";
  const [editing, setEditing] = useState(null);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ product: "", product_name: "", quantity: "", unit: "KG", unit_price: "", total_price: "", currency: "USD", purchase_date: "", invoice_number: "", status: "completed", notes: "" });

  useEffect(() => {
    api.get("/products/").then(r => setProducts(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleProductSelect = (productId) => {
    const p = products.find(pr => String(pr.id) === String(productId));
    if (p) setForm(f => ({ ...f, product: p.id, product_name: p.name, unit_price: p.base_price || "", unit: p.unit || "KG" }));
  };

  const calcTotal = (qty, price) => {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(price) || 0;
    return (q * p).toFixed(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, client: clientId, total_price: calcTotal(form.quantity, form.unit_price) };
      if (editing) {
        await api.patch(`/clients/purchase-history/${editing}/`, payload);
        toast.success("Purchase updated");
      } else {
        await api.post("/clients/purchase-history/", payload);
        toast.success("Purchase recorded");
      }
      setShowModal(false); setEditing(null); reload();
      setForm({ product: "", product_name: "", quantity: "", unit: "KG", unit_price: "", total_price: "", currency: "USD", purchase_date: "", invoice_number: "", status: "completed", notes: "" });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handleEdit = (item) => {
    setEditing(item.id);
    setForm({ product: item.product || "", product_name: item.product_name, quantity: item.quantity, unit: item.unit, unit_price: item.unit_price, total_price: item.total_price, currency: item.currency, purchase_date: item.purchase_date || "", invoice_number: item.invoice_number || "", status: item.status, notes: item.notes || "" });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this purchase record?")) return;
    try { await api.delete(`/clients/purchase-history/${id}/`); toast.success("Removed"); reload(); }
    catch { toast.error("Failed to delete"); }
  };

  const totalValue = data.reduce((sum, r) => sum + (parseFloat(r.total_price) || 0), 0);

  const columns = [
    { key: "purchase_date", label: "Purchase Date", render: (row) => fmtDate(row.purchase_date) },
    { key: "product_name", label: "Product", render: (row) => <span className="font-medium">{row.product_name}</span> },
    { key: "quantity", label: "Quantity", render: (row) => `${Number(row.quantity).toLocaleString()} ${row.unit}` },
    { key: "unit_price", label: "Unit Price", render: (row) => `${row.currency} ${Number(row.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    { key: "total_price", label: "Total", render: (row) => <span className="font-semibold text-green-700">{row.currency} {Number(row.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
    { key: "invoice_number", label: "Invoice #", render: (row) => row.invoice_number || "—" },
    { key: "order_number", label: "Order #", render: (row) => row.order_number || "—" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    ...(canEdit ? [{ key: "actions", label: "", render: (row) => (
      <div className="flex gap-1">
        <button onClick={() => handleEdit(row)} className="px-2 py-1 text-xs text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">Edit</button>
        <button onClick={() => handleDelete(row.id)} className="px-2 py-1 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">Delete</button>
      </div>
    )}] : []),
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500">{data.length} purchase{data.length !== 1 ? "s" : ""}</p>
          {totalValue > 0 && <p className="text-xs text-gray-400">Total: USD {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}
        </div>
        {canEdit && <button onClick={() => { setEditing(null); setForm({ product: "", product_name: "", quantity: "", unit: "KG", unit_price: "", total_price: "", currency: "USD", purchase_date: "", invoice_number: "", status: "completed", notes: "" }); setShowModal(true); }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add Purchase</button>}
      </div>
      <DataTable columns={columns} data={data} loading={loading} emptyTitle="No purchase history" emptyDescription="Record purchases for this client" />
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? "Edit Purchase" : "Record Purchase"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select value={form.product} onChange={(e) => { setForm({ ...form, product: e.target.value }); handleProductSelect(e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date *</label>
              <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value, total_price: calcTotal(e.target.value, form.unit_price) })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price *</label>
              <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value, total_price: calcTotal(form.quantity, e.target.value) })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
              <input value={form.total_price || calcTotal(form.quantity, form.unit_price)} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option><option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="KG">KG</option><option value="MT">MT</option><option value="Ltrs">Ltrs</option><option value="Pcs">Pcs</option><option value="Drums">Drums</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice #</label>
              <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">{editing ? "Update" : "Record Purchase"}</button>
            <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
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
  const searchParams = useSearchParams();
  const [client, setClient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // If we arrived via ?openDraftFor=<comm_id> (Inquiries "Enter Rates")
  // or ?openPI=<pi_id> (Proforma Invoices "Edit & Send"), start on the
  // Communications tab so CommunicationsTab can auto-open the AI Draft modal.
  const [activeTab, setActiveTab] = useState(
    searchParams.get("openDraftFor") || searchParams.get("openPI") ? "communications" : "overview"
  );

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
              prompt={`Give me a comprehensive summary of this client. Include: contact details, recent communications, order history, pending tasks, shipment status, price list, purchase history, and any action items.`}
              clientId={id}
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
      {activeTab === "price_list" && <PriceListTab clientId={id} activeTab={activeTab} />}
      {activeTab === "purchase_history" && <PurchaseHistoryTab clientId={id} activeTab={activeTab} />}
      {activeTab === "documents" && <DocumentsTab clientId={id} activeTab={activeTab} />}
    </div>
  );
}
