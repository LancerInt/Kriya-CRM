"use client";
import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
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
import SearchableSelect from "@/components/ui/SearchableSelect";
import { confirmDialog } from "@/lib/confirm";

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
  { key: "unread_email", label: "Unread Emails", color: "text-blue-600" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "unread_whatsapp", label: "Unread WhatsApp", color: "text-green-600" },
  { key: "call", label: "Calls" },
  { key: "note", label: "Notes" },
  { key: "starred", label: "Starred", color: "text-yellow-600" },
  { key: "drafts", label: "Drafts" },
  { key: "unmatched", label: "Unmatched" },
];

// Wrapper required for static export: useSearchParams() must sit inside a
// Suspense boundary or Next refuses to prerender the page.
export default function CommunicationsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <CommunicationsPageContent />
    </Suspense>
  );
}

function CommunicationsPageContent() {
  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { list, loading } = useSelector((state) => state.communications);
  const [showModal, setShowModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client: "", comm_type: "email", direction: "inbound", subject: "", content: "" });
  const [filterTab, setFilterTab] = useState(searchParams?.get("tab") || "all");
  const [assignModal, setAssignModal] = useState(null);
  const [assignClient, setAssignClient] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedComm, setSelectedComm] = useState(null);
  const [newClientName, setNewClientName] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterExec, setFilterExec] = useState("");
  const [executives, setExecutives] = useState([]);
  const [unmatchedCategory, setUnmatchedCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [archivePrompt, setArchivePrompt] = useState(null); // { commId, senderEmail }
  const [followUpTick, setFollowUpTick] = useState(0); // forces age re-eval
  // Conversation keys the user has explicitly dismissed (no follow-up needed).
  // Persisted in localStorage so it survives reloads, keyed by client+contact.
  // The dismissal is tied to the latest message id at the time of dismissal —
  // a brand-new message in that conversation will re-arm the follow-up badge.
  const [dismissedFollowUps, setDismissedFollowUps] = useState({});
  // Confirmation popup for dismissing a follow-up. Holds the row that was
  // clicked so we can finalize the dismissal on Proceed.
  const [followUpDismissPrompt, setFollowUpDismissPrompt] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kriya_dismissed_followups");
      if (raw) setDismissedFollowUps(JSON.parse(raw));
    } catch {}
  }, []);

  const dismissFollowUp = (convKey, latestMsgId) => {
    setDismissedFollowUps((prev) => {
      const next = { ...prev, [convKey]: latestMsgId };
      try { localStorage.setItem("kriya_dismissed_followups", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Pull the full history in one shot — the user wants to scroll back
  // years of mail after running historical backfills. Capped at the
  // StandardPagination max (5000) so this still has a reasonable upper
  // bound; if the user genuinely has more than that we should switch
  // this to virtualized infinite scroll.
  const loadData = useCallback(() => {
    dispatch(fetchCommunications({ page_size: 5000 }));
  }, [dispatch]);

  useEffect(() => {
    loadData();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
    api.get("/auth/users/").then((r) => setExecutives((r.data.results || r.data).filter(u => u.role === "executive"))).catch(() => {});
  }, []);

  // When the header sync button finishes, reload the activities list so any
  // newly synced inbound emails appear without a manual page refresh.
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener("kriya:emails-synced", handler);
    return () => window.removeEventListener("kriya:emails-synced", handler);
  }, [loadData]);

  // Re-evaluate follow-up ages periodically so badges update without a reload.
  // 5 minutes is plenty given the 5-day threshold — a freshly-overdue thread
  // will appear within 5 minutes of crossing the boundary.
  useEffect(() => {
    const t = setInterval(() => setFollowUpTick((n) => n + 1), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const filteredList = useMemo(() => {
    let filtered = list;
    if (filterTab === "unread_email") {
      filtered = filtered.filter((item) => !item.is_read && item.comm_type === "email" && item.is_client_mail);
    } else if (filterTab === "unread_whatsapp") {
      filtered = filtered.filter((item) => !item.is_read && item.comm_type === "whatsapp" && item.is_client_mail);
    } else if (filterTab === "starred") {
      filtered = filtered.filter((item) => item.is_starred);
    } else if (filterTab === "drafts") {
      filtered = filtered.filter((item) => item.draft_id && item.draft_status === "draft");
    } else if (filterTab === "unmatched") {
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
    if (filterExec) filtered = filtered.filter((item) => item.assigned_executive_id === filterExec);

    // ── Follow-up detection (Gmail-style) ──
    // For each conversation (grouped by client + external contact), find the
    // latest message. If it's older than the threshold AND no newer reply has
    // arrived, tag it as needing follow-up:
    //   - latest is INBOUND  → we owe the client a reply  → kind=reply
    //   - latest is OUTBOUND → client hasn't responded    → kind=followup
    // Tagged rows bubble to the top, sorted by most-overdue first.
    // Tier-aware follow-up thresholds — VIP clients get flagged much faster
    const TIER_THRESHOLDS = {
      tier_1: 1 * 24 * 60 * 60 * 1000,  // Tier 1 (VIP): 1 day
      tier_2: 2 * 24 * 60 * 60 * 1000,  // Tier 2 (Priority): 2 days
      tier_3: 5 * 24 * 60 * 60 * 1000,  // Tier 3 (Standard): 5 days
    };
    if (filterTab !== "drafts" && filterTab !== "unmatched") {
      // Group by conversation key
      const groups = new Map();
      filtered.forEach((item) => {
        if (item.comm_type !== "email" && item.comm_type !== "whatsapp") return;
        const key = (item.client || "no-client") + "::" + (item.external_email || item.external_phone || "");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      // For each group, mark only the latest message
      const followUpById = new Map();
      const now = Date.now();
      groups.forEach((items, convKey) => {
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const latest = items[0];
        if (!latest?.created_at) return;
        // If the user explicitly dismissed this conversation AND no newer
        // message has arrived since, skip it. A brand-new message in the same
        // conversation will have a different latest.id, so the dismissal is
        // automatically invalidated and the badge re-arms.
        if (dismissedFollowUps[convKey] && dismissedFollowUps[convKey] === latest.id) {
          return;
        }
        const ageMs = now - new Date(latest.created_at).getTime();
        const clientTier = latest.client_tier || "tier_3";
        const threshold = TIER_THRESHOLDS[clientTier] || TIER_THRESHOLDS.tier_3;
        if (ageMs >= threshold) {
          // Pick the largest unit that fits, so the badge reads naturally
          const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(ageMs / (1000 * 60 * 60));
          const minutes = Math.floor(ageMs / (1000 * 60));
          let amount, unit;
          if (days >= 1) { amount = days; unit = days === 1 ? "day" : "days"; }
          else if (hours >= 1) { amount = hours; unit = hours === 1 ? "hour" : "hours"; }
          else { amount = minutes; unit = minutes === 1 ? "minute" : "minutes"; }
          followUpById.set(latest.id, {
            amount, unit, ageMs, convKey,
            kind: latest.direction === "inbound" ? "reply" : "followup",
          });
        }
      });
      // Attach the tag to a copy of each row so we don't mutate Redux state
      filtered = filtered.map((item) => {
        const fu = followUpById.get(item.id);
        return fu ? { ...item, _followUp: fu } : item;
      });
      // Sort: needs-follow-up first (most overdue at top), then by date desc
      filtered = [...filtered].sort((a, b) => {
        const aFU = a._followUp ? 1 : 0;
        const bFU = b._followUp ? 1 : 0;
        if (aFU !== bFU) return bFU - aFU;
        if (aFU && bFU) return b._followUp.ageMs - a._followUp.ageMs;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }
    return filtered;
  }, [list, filterTab, filterClient, filterExec, unmatchedCategory, followUpTick, dismissedFollowUps]);

  const unreadCount = useMemo(() => list.filter((item) => !item.is_read && item.is_client_mail).length, [list]);
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

  const handleMarkRead = async (comm) => {
    if (comm.is_read) return;
    try {
      await api.post(`/communications/${comm.id}/mark-read/`);
      loadData();
    } catch {}
  };

  const handleToggleRead = async (comm) => {
    try {
      if (comm.is_read) {
        await api.post(`/communications/${comm.id}/mark-unread/`);
      } else {
        await api.post(`/communications/${comm.id}/mark-read/`);
      }
      loadData();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post("/communications/mark-all-read/");
      toast.success("All marked as read");
      loadData();
    } catch {}
  };

  const handleArchiveEmail = (commId, senderEmail) => {
    setArchivePrompt({ commId, senderEmail });
  };

  const confirmArchive = async (archiveSender) => {
    if (!archivePrompt) return;
    try {
      await api.post(`/communications/${archivePrompt.commId}/archive/`, { archive_sender: archiveSender });
      if (archiveSender) {
        toast.success(`Archived! All future emails from ${archivePrompt.senderEmail} will be auto-archived.`);
      } else {
        toast.success("Moved to Archive");
      }
      setArchivePrompt(null);
      loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to archive"));
      setArchivePrompt(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((item) => item.id)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!(await confirmDialog(`Archive ${selectedIds.size} selected message${selectedIds.size > 1 ? "s" : ""}?`))) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/communications/${id}/`)));
      toast.success(`${selectedIds.size} message${selectedIds.size > 1 ? "s" : ""} archived`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to archive")); }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.post(`/communications/${id}/mark-read/`)));
      toast.success(`${selectedIds.size} marked as read`);
      setSelectedIds(new Set());
      loadData();
    } catch {}
  };

  const handleBulkMarkUnread = async () => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.post(`/communications/${id}/mark-unread/`)));
      toast.success(`${selectedIds.size} marked as unread`);
      setSelectedIds(new Set());
      loadData();
    } catch {}
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
    { key: "_select", label: "", render: (row) => (
      <input type="checkbox" checked={selectedIds.has(row.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(row.id); }} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
    )},
    { key: "is_read", label: "", render: (row) => (
      !row.is_read && row.direction === "inbound" ? (
        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block" title="Unread" />
      ) : null
    )},
    { key: "is_starred", label: "", render: (row) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          api.post(`/communications/${row.id}/toggle-star/`).then((r) => {
            dispatch(fetchCommunications());
          }).catch(() => {});
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
    { key: "direction", label: "Direction", render: (row) => <span className={`text-xs font-medium ${row.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>{row.direction}</span> },
    { key: "subject", label: "Subject", render: (row) => (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={row.is_read ? "text-gray-600" : "font-semibold text-gray-900"}>{row.subject || "\u2014"}</span>
        {row._followUp && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
              row._followUp.kind === "reply"
                ? "bg-red-100 text-red-700 border-red-300 animate-pulse"
                : "bg-amber-100 text-amber-700 border-amber-300"
            }`}
          >
            {row._followUp.kind === "reply"
              ? `Not responded for ${row._followUp.amount} ${row._followUp.unit} — Reply?`
              : `No reply for ${row._followUp.amount} ${row._followUp.unit} — Follow up?`}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFollowUpDismissPrompt(row);
              }}
              title="No follow-up needed"
              className={`ml-0.5 -mr-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/60 ${
                row._followUp.kind === "reply" ? "text-red-700" : "text-amber-700"
              }`}
            >
              ×
            </button>
          </span>
        )}
      </div>
    )},
    { key: "client_name", label: "Account", render: (row) => row.client_name ? (
      <div className="flex items-center gap-1.5">
        {row.client_tier === "tier_1" && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        {row.client_tier === "tier_2" && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" />}
        <span className={`${row.is_read ? "" : "font-medium"} ${row.client_tier === "tier_1" ? "text-red-700" : ""}`}>{row.client_name}</span>
        {row.client_tier === "tier_1" && <span className="text-[8px] font-bold px-1 py-px rounded bg-red-500 text-white leading-none">VIP</span>}
      </div>
    ) : (
      <button onClick={(e) => { e.stopPropagation(); setAssignModal(row.id); setAssignClient(""); }} className="text-xs text-orange-600 hover:text-orange-700 font-medium bg-orange-50 px-2 py-1 rounded">
        Assign Account
      </button>
    )},
    { key: "external_contact", label: "Contact", render: (row) => <span className={`text-sm ${row.is_read ? "text-gray-500" : "text-gray-700 font-medium"}`}>{row.external_email || row.external_phone || "\u2014"}</span> },
    { key: "assigned_executive", label: "Account Owner", render: (row) => row.assigned_executive ? (
      <span className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg">{row.assigned_executive}</span>
    ) : <span className="text-sm text-gray-400">{"\u2014"}</span> },
    { key: "created_at", label: "Date", render: (row) => { try { return <span className={row.is_read ? "" : "font-medium"}>{format(new Date(row.created_at), "MMM d, yyyy HH:mm")}</span>; } catch { return "\u2014"; } } },
    { key: "actions", label: "", render: (row) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); handleToggleRead(row); }} className={`px-2 py-1 text-xs font-medium rounded-lg ${row.is_read ? "text-gray-500 bg-gray-100 hover:bg-gray-200" : "text-blue-600 bg-blue-50 hover:bg-blue-100"}`}>
          {row.is_read ? "Mark Unread" : "Mark Read"}
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleMarkRead(row); setSelectedComm(row); }} className="px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">View</button>
      </div>
    )},
  ];

  // Columns for unmatched view
  const unmatchedColumns = [
    { key: "_select", label: "", render: (row) => (
      <input type="checkbox" checked={selectedIds.has(row.id)} onChange={(e) => { e.stopPropagation(); toggleSelect(row.id); }} className="h-4 w-4 text-indigo-600 border-gray-300 rounded cursor-pointer" />
    )},
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
        <button onClick={(e) => { e.stopPropagation(); handleArchiveEmail(row.id, row.external_email); }} className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
          Archive
        </button>
      </div>
    )},
  ];

  const isUnmatched = filterTab === "unmatched";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 p-6 shadow-xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-violet-300/20 rounded-full blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Activities</h1>
              <p className="text-indigo-100 text-sm mt-0.5">{filteredList.length} {filteredList.length === 1 ? "item" : "items"} · all client communications in one place</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-white bg-white/15 hover:bg-white/25 backdrop-blur rounded-xl ring-1 ring-white/30 transition-all">
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold">{unreadCount}</span>
                Mark all read
              </button>
            )}
            <AISummaryButton variant="hero" title="Communications Summary" prompt={`Write a tight Communications summary using the pre-loaded data. Structure with these sections (## headings):\n\n## Overview\nOne line: total recent comms by type (emails, WhatsApp, calls, notes).\n\n## Pending Replies\nUp to 5 inbound items still awaiting our reply: client · subject · received date.\n\n## By Client\nUp to 5 clients with the most recent activity, one line each: client name · count · what's notable.\n\n## Notable Items\nUp to 4 important conversations needing executive attention.\n\n### Next Steps\n2-3 concrete follow-up actions.\n\nKeep under 300 words. Skip auto-created system mail (mailer-daemon, LinkedIn notifications, Snowflake, etc.) — never list them.`} />
            <button onClick={() => setShowEmailModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-700 text-sm font-bold rounded-xl ring-1 ring-white/30 hover:shadow-lg hover:scale-[1.02] transition-all shadow-md">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Compose Email
            </button>
            <button onClick={() => setShowWhatsAppModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all shadow-md">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654z"/></svg>
              Send WhatsApp
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-bold rounded-xl ring-1 ring-white/30 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Activity
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { key: "all", label: "All", icon: "M4 6h16M4 12h16M4 18h16" },
              { key: "email", label: "Emails", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
              { key: "whatsapp", label: "WhatsApp", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
              { key: "call", label: "Calls", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
              { key: "note", label: "Notes", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
            ].map((tab) => {
              const isActive = filterTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setFilterTab(tab.key); setSelectedIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    isActive ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} /></svg>
                  {tab.label}
                </button>
              );
            })}
            <span className="w-px h-6 bg-slate-200 mx-1.5" />
            {/* Badge tabs */}
            {[
              { key: "unread_email", label: "Unread", count: list.filter(i => !i.is_read && i.comm_type === "email" && i.is_client_mail).length, gradient: "from-blue-500 to-blue-600", soft: "text-blue-700 bg-blue-50 ring-blue-200" },
              { key: "starred", label: "Starred", count: list.filter(i => i.is_starred).length, gradient: "from-amber-500 to-amber-600", soft: "text-amber-700 bg-amber-50 ring-amber-200" },
              { key: "drafts", label: "Drafts", count: list.filter(i => i.draft_id && i.draft_status === "draft").length, gradient: "from-purple-500 to-purple-600", soft: "text-purple-700 bg-purple-50 ring-purple-200" },
              { key: "unmatched", label: "Unmatched", count: unmatchedCount, gradient: "from-slate-500 to-slate-600", soft: "text-slate-700 bg-slate-100 ring-slate-200" },
            ].map((tab) => {
              const isActive = filterTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setFilterTab(tab.key); setSelectedIds(new Set()); if (tab.key !== "unmatched") setUnmatchedCategory("all"); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    isActive ? `bg-gradient-to-br ${tab.gradient} text-white shadow-sm` : `${tab.soft} ring-1 hover:shadow-sm`
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[10px] font-extrabold min-w-[18px] h-4 flex items-center justify-center px-1 rounded-full ${
                      isActive ? "bg-white/25 text-white" : "bg-white text-current"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!isUnmatched && (
            <div className="flex gap-2 shrink-0">
              <SearchableSelect
                value={filterClient}
                onChange={(v) => setFilterClient(v)}
                options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
                placeholder="All Accounts"
                className="w-40"
              />
              <SearchableSelect
                value={filterExec}
                onChange={(v) => setFilterExec(v)}
                options={executives.map((u) => ({ value: u.id, label: u.full_name }))}
                placeholder="All Owners"
                className="w-40"
              />
            </div>
          )}
        </div>
      </div>

      {/* Unmatched category sub-tabs */}
      {isUnmatched && (
        <div className="flex flex-wrap gap-2 p-1.5 bg-white rounded-2xl border border-slate-200/70 shadow-sm w-fit">
          <button
            onClick={() => setUnmatchedCategory("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              unmatchedCategory === "all" ? "bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            All
            <span className={`text-[10px] font-extrabold min-w-[18px] h-4 flex items-center justify-center px-1 rounded-full ${
              unmatchedCategory === "all" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
            }`}>{unmatchedCount}</span>
          </button>
          {Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => {
            const c = CLASSIFICATION_COLORS[key];
            const count = classificationCounts[key] || 0;
            const isActive = unmatchedCategory === key;
            return (
              <button
                key={key}
                onClick={() => setUnmatchedCategory(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  isActive
                    ? `${c.bg} ${c.text} shadow-sm ring-1 ring-current`
                    : `text-slate-600 hover:bg-slate-50`
                }`}
              >
                {label}
                <span className={`text-[10px] font-extrabold min-w-[18px] h-4 flex items-center justify-center px-1 rounded-full ${
                  isActive ? "bg-white/60 text-current" : "bg-slate-100 text-slate-500"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-indigo-50 via-violet-50/60 to-indigo-50/40 border border-indigo-200/60 rounded-2xl shadow-sm">
          <input type="checkbox" checked={selectedIds.size === filteredList.length && filteredList.length > 0} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-slate-300 rounded cursor-pointer" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-[11px] font-extrabold shadow-sm">{selectedIds.size}</div>
            <span className="text-sm font-bold text-indigo-700">{selectedIds.size === 1 ? "item" : "items"} selected</span>
          </div>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={handleBulkMarkRead} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg ring-1 ring-blue-200/60 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Mark Read
            </button>
            <button onClick={handleBulkMarkUnread} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg ring-1 ring-slate-200 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Mark Unread
            </button>
            <button onClick={handleBulkArchive} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              Archive
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Select All row */}
      {selectedIds.size === 0 && filteredList.length > 0 && (
        <div className="flex items-center gap-2 px-2">
          <input type="checkbox" checked={false} onChange={toggleSelectAll} className="h-4 w-4 text-indigo-600 border-slate-300 rounded cursor-pointer" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Select all</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <DataTable
          columns={isUnmatched ? unmatchedColumns : clientColumns}
          data={filteredList}
          loading={loading}
          emptyTitle={isUnmatched ? "No unmatched emails" : "No activities"}
          emptyDescription={isUnmatched ? "All emails are matched to clients" : "Log your first communication"}
          onRowClick={(row) => router.push(`/communications/${row.id}`)}
          rowClassName={(row) => {
            if (row._followUp) {
              return row._followUp.kind === "reply" ? "bg-red-50/60 hover:bg-red-50" : "bg-amber-50/60 hover:bg-amber-50";
            }
            if (row.client_tier === "tier_1") return "border-l-4 border-l-red-500 bg-red-50/30 hover:bg-red-50/50";
            if (row.client_tier === "tier_2") return "border-l-4 border-l-amber-400 bg-amber-50/20 hover:bg-amber-50/40";
            return "";
          }}
        />
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Log Activity" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SearchableSelect
              label="Account"
              required
              value={form.client}
              onChange={(v) => setForm({ ...form, client: v })}
              options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
              placeholder="Select Account"
            />
            <SearchableSelect
              label="Type"
              value={form.comm_type}
              onChange={(v) => setForm({ ...form, comm_type: v || "email" })}
              options={[
                { value: "email", label: "Email" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "call", label: "Call" },
                { value: "note", label: "Note" },
              ]}
              placeholder="Select Type"
              searchable={false}
            />
            <SearchableSelect
              label="Direction"
              value={form.direction}
              onChange={(v) => setForm({ ...form, direction: v || "inbound" })}
              options={[
                { value: "inbound", label: "Inbound" },
                { value: "outbound", label: "Outbound" },
              ]}
              placeholder="Select Direction"
              searchable={false}
            />
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
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Log Activity</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <ComposeEmailModal open={showEmailModal} onClose={() => setShowEmailModal(false)} onSent={handleSent} />
      <SendWhatsAppModal open={showWhatsAppModal} onClose={() => setShowWhatsAppModal(false)} onSent={handleSent} />

      {/* Assign Account / Move to Client Modal */}
      <Modal open={!!assignModal} onClose={() => { setAssignModal(null); setShowAddClient(false); setNewClientName(""); }} title="Move to Client">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Assign this email to a client. It will be moved from Unmatched to the Communications timeline.</p>
          <SearchableSelect
            label="Account"
            required
            value={assignClient}
            onChange={(v) => { setAssignClient(v); setShowAddClient(false); }}
            options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="Select Account"
          />
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
                  <span className="text-gray-500 block text-xs">Account Owner</span>
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

      {/* Dismiss Follow-up Confirmation */}
      <Modal
        open={!!followUpDismissPrompt}
        onClose={() => setFollowUpDismissPrompt(null)}
        title="Dismiss Follow-up?"
        size="sm"
      >
        {followUpDismissPrompt && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Mark this conversation as <strong>no follow-up needed</strong>?
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-800 truncate">{followUpDismissPrompt.subject || "(No subject)"}</p>
              <p className="text-gray-500 mt-0.5">
                {followUpDismissPrompt.client_name || followUpDismissPrompt.external_email || followUpDismissPrompt.external_phone}
              </p>
            </div>
            <p className="text-xs text-gray-400">
              The reminder badge will be removed from this row. If a new message arrives in this conversation, the badge will reappear automatically.
            </p>
            <div className="flex gap-2 pt-2 justify-end">
              <button
                onClick={() => setFollowUpDismissPrompt(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const row = followUpDismissPrompt;
                  if (row?._followUp?.convKey) {
                    dismissFollowUp(row._followUp.convKey, row.id);
                  }
                  setFollowUpDismissPrompt(null);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                Proceed
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Archive Sender Prompt */}
      <Modal open={!!archivePrompt} onClose={() => setArchivePrompt(null)} title="Archive Email" size="sm">
        {archivePrompt && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Do you also want to auto-archive all future emails from <strong className="text-gray-900">{archivePrompt.senderEmail}</strong>?
            </p>
            <p className="text-xs text-gray-400">
              If you choose "Archive All", all existing and future emails from this sender will be moved to archive. Admin/Manager can unarchive or permanently delete them later.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => confirmArchive(true)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Archive All from Sender
              </button>
              <button
                onClick={() => confirmArchive(false)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
              >
                Archive This Only
              </button>
              <button
                onClick={() => setArchivePrompt(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
