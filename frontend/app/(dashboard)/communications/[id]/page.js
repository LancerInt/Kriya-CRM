"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import { sendWithUndo } from "@/lib/undoSend";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import PIEditorModal from "@/components/finance/PIEditorModal";
import RichTextEditor from "@/components/ui/RichTextEditor";
import EmailChips from "@/components/ui/EmailChips";
import PdfViewer from "@/components/ui/PdfViewer";
import DocLibraryPicker from "@/components/ui/DocLibraryPicker";
import COAEditorModal from "@/components/finance/COAEditorModal";
import MSDSEditorModal from "@/components/finance/MSDSEditorModal";
import { confirmDialog } from "@/lib/confirm";
import { promptDialog } from "@/lib/prompt";

// Refine Dropdown for reply box
function ReplyRefineDropdown({ body, onRefined, contactName }) {
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
      const r = await api.post("/communications/refine-email/", { body, action, contact_name: contactName || "" });
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

export default function CommunicationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [comm, setComm] = useState(null);
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [replyDraftId, setReplyDraftId] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savedAttachments, setSavedAttachments] = useState([]);

  // Quotation/PI editor state — same as the AI Draft modal flow on the client page
  const [attachQt, setAttachQt] = useState(null);
  const [attachQtForm, setAttachQtForm] = useState({});
  const [attachQtItems, setAttachQtItems] = useState([]);
  const [attachPi, setAttachPi] = useState(null);
  const [attachMode, setAttachMode] = useState(null); // 'quote' | 'pi' | null
  const [pdfView, setPdfView] = useState(null);
  const [showDocLibPicker, setShowDocLibPicker] = useState(false);
  const [showCOAEditor, setShowCOAEditor] = useState(false);
  const [showMSDSEditor, setShowMSDSEditor] = useState(false);
  const [editorData, setEditorData] = useState({});

  const loadThread = () => {
    api.get(`/communications/${id}/thread/`)
      .then((res) => {
        setComm(res.data.communication);
        setThread(res.data.thread || []);
      })
      .catch((err) => { toast.error(getErrorMessage(err, "Failed to load")); router.push("/communications"); })
      .finally(() => setLoading(false));
  };

  // Track which specific message in the thread we're replying to
  const [replyTargetId, setReplyTargetId] = useState(null);
  // Refs to each message card for scroll-into-view
  const messageRefs = useRef({});

  // Open the Reply form and auto-load the AI draft (subject/body/cc/attachments).
  // `targetMsg` is the specific message the user wants to reply to. For
  // inbound messages we look up the AI draft. For outbound messages there's
  // no AI draft (we wrote the original) — we still open a fresh reply form
  // so the user can compose a follow-up to themselves' last message.
  const openReply = async (currentComm, currentThread, targetMsg = null) => {
    const target = targetMsg
      || [...currentThread].reverse().find(m => m.direction === "inbound")
      || currentThread[currentThread.length - 1]
      || currentComm;
    setShowReply(true);
    setReplyTargetId(target.id);
    // Reset state in case we're switching between targets
    setSavedAttachments([]);
    setAttachments([]);
    setReplyDraftId(null);

    // For OUTBOUND targets (we're following up on a message we sent ourselves),
    // ask the backend to generate AI follow-up content — a polite nudge that
    // references the original message but uses a different tone than a reply.
    if (target.direction === "outbound") {
      const subj = (target.subject || currentComm.subject || "");
      // Show an immediate placeholder so the UI doesn't look broken while AI generates
      setReplySubject(subj.toLowerCase().startsWith("follow up") || subj.toLowerCase().startsWith("re:") ? subj : `Follow up: ${subj}`);
      setReplyBody("");
      try {
        const r = await api.post(`/communications/${target.id}/generate-followup/`);
        if (r.data?.subject) setReplySubject(r.data.subject);
        if (r.data?.body) setReplyBody(r.data.body);
      } catch {
        toast.error("Could not generate follow-up content");
      }
      // Build CC the same way the inbound path does
      if (currentComm.client) {
        try {
          const r = await api.get(`/clients/${currentComm.client}/`);
          const contacts = r.data.contacts || [];
          const toEmail = target.external_email || "";
          const otherEmails = contacts.map(c => c.email).filter(e => e && e.toLowerCase() !== toEmail.toLowerCase());
          const ur = await api.get("/auth/users/");
          const admMgr = (ur.data.results || ur.data).filter(u => u.email && (u.role === "admin" || u.role === "manager")).map(u => u.email);
          const allCc = [...otherEmails];
          admMgr.forEach(e => { if (!allCc.includes(e) && e.toLowerCase() !== toEmail.toLowerCase()) allCc.push(e); });
          setReplyCc(allCc.join(", "));
        } catch {}
      }
      return;
    }

    // INBOUND target — auto-load AI draft for this specific message. If no
    // draft exists yet, generate one on the fly.
    let draft = null;
    try {
      const drafts = await api.get(`/communications/drafts/`, { params: { communication: target.id } });
      const list = drafts.data?.results || drafts.data || [];
      // 1. URL override: ?draft=<id> wins (used by dispatch/transit deep-links)
      const overrideId = (typeof window !== "undefined")
        ? new URL(window.location.href).searchParams.get("draft")
        : null;
      if (overrideId) {
        draft = list.find(d => String(d.id) === String(overrideId)) || null;
      }
      // 2. Prefer drafts the system stamped (dispatch/transit) over plain replies
      if (!draft) {
        const stamped = list.filter(d => d.status === "draft" && ((d.editor_data?.auto_actions || []).length > 0));
        stamped.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        draft = stamped[0] || null;
      }
      // 3. Otherwise fall back to the most recent open draft
      if (!draft) {
        const open = list.filter(d => d.status === "draft");
        open.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        draft = open[0] || list[0] || null;
      }
      if (!draft) {
        try {
          const r = await api.post(`/communications/${target.id}/generate-draft/`);
          draft = r.data;
        } catch {}
      }
    } catch {}

    if (draft) {
      setReplySubject(draft.subject || (target.subject?.startsWith("Re:") ? target.subject : `Re: ${target.subject || currentComm.subject || ""}`));
      setReplyBody(draft.body || "");
      if (draft.cc) setReplyCc(draft.cc);
      setReplyDraftId(draft.id);
      setSavedAttachments(draft.attachments || []);
      setEditorData(draft.editor_data || {});
      setLastSavedAt(draft.last_saved_at);
    } else {
      const subj = (target.subject || currentComm.subject || "");
      setReplySubject(subj.startsWith("Re:") ? subj : `Re: ${subj}`);
    }

    // Build CC from client contacts + admin/manager (only if draft didn't supply one)
    if (currentComm.client && !draft?.cc) {
      try {
        const r = await api.get(`/clients/${currentComm.client}/`);
        const contacts = r.data.contacts || [];
        const toEmail = target.external_email || "";
        const otherEmails = contacts.map(c => c.email).filter(e => e && e.toLowerCase() !== toEmail.toLowerCase());
        const ur = await api.get("/auth/users/");
        const admMgr = (ur.data.results || ur.data).filter(u => u.email && (u.role === "admin" || u.role === "manager")).map(u => u.email);
        const allCc = [...otherEmails];
        admMgr.forEach(e => { if (!allCc.includes(e) && e.toLowerCase() !== toEmail.toLowerCase()) allCc.push(e); });
        setReplyCc(allCc.join(", "));
      } catch {}
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadThread();
    api.get("/communications/email-accounts/").then(r => setEmailAccounts(r.data.results || r.data)).catch(() => {});
  }, [id]);

  // Clicking a mail row in the list = "I want to reply to this specific mail".
  // After the thread loads:
  //   1) scroll the clicked message into view (using its id from the URL)
  //   2) if it's inbound, auto-open the reply form targeted at that message
  const autoOpenedReplyRef = useRef(null);
  useEffect(() => {
    if (!comm || !thread.length) return;
    if (autoOpenedReplyRef.current === id) return;

    // Scroll the clicked message into view
    const target = thread.find((m) => m.id === comm.id) || comm;
    requestAnimationFrame(() => {
      const el = messageRefs.current[target.id];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (showReply) return;
    if (comm.comm_type !== "email") return;
    // Only auto-open the reply form when we're being asked to respond — i.e.
    // the targeted message is inbound. For outbound targets we just scroll.
    if (target.direction !== "inbound") return;
    autoOpenedReplyRef.current = id;
    if (emailAccounts.length > 0 && !selectedAccount) setSelectedAccount(emailAccounts[0].id);
    openReply(comm, thread, target);
  }, [comm, thread, emailAccounts]);

  // Voice to Text
  const handleVoiceToText = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Speech recognition not supported"); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    let rawTranscript = "";
    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) rawTranscript += e.results[i][0].transcript + " ";
      }
      setReplyBody(prev => prev + rawTranscript);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (rawTranscript.trim()) {
        setReplyBody(rawTranscript.trim() + "\n\n⏳ AI is summarizing...");
        const lastInbound = [...thread].reverse().find(m => m.direction === "inbound") || comm;
        const contactName = lastInbound.contact_name || "";
        const context = `Client: ${comm.client_name || ""}, Subject: ${replySubject || ""}`;
        api.post("/communications/summarize-voice/", { text: rawTranscript.trim(), context, contact_name: contactName })
          .then(r => { setReplyBody(r.data.summarized); toast.success("AI summarized your voice input"); })
          .catch(() => { setReplyBody(rawTranscript.trim()); toast.error("AI summary failed, raw text kept"); });
      }
    };
    recognition.onerror = () => { setIsListening(false); toast.error("Voice recognition error"); };
    recognition.start();
    setIsListening(true);
    toast.success("Listening... speak now");
  };

  // Save as Draft
  const handleSaveReplyDraft = async () => {
    // Same target resolution as the Send button:
    //   1) explicit replyTargetId (user clicked Reply / Follow up)
    //   2) latest inbound message
    //   3) the current communication itself
    const targetMsg =
      (replyTargetId && thread.find(m => m.id === replyTargetId)) ||
      [...thread].reverse().find(m => m.direction === "inbound") ||
      comm;
    const toEmail = targetMsg.external_email || comm.external_email || "";
    if (!toEmail) { toast.error("No recipient email"); return; }
    setSavingDraft(true);
    try {
      if (replyDraftId) {
        // Update existing draft
        const fd = new FormData();
        fd.append("subject", replySubject);
        fd.append("body", replyBody);
        fd.append("cc", replyCc);
        fd.append("editor_data", JSON.stringify(editorData));
        attachments.forEach(f => fd.append("attachments", f));
        const res = await api.post(`/communications/drafts/${replyDraftId}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        setSavedAttachments(res.data.attachments || []);
        setAttachments([]);
        setLastSavedAt(res.data.last_saved_at);
        toast.success("Draft saved");
      } else {
        // Create new draft tied to the message we're responding to
        const payload = { communication: targetMsg.id, client: comm.client || null, subject: replySubject, body: replyBody, to_email: toEmail, cc: replyCc, editor_data: editorData };
        const res = await api.post("/communications/drafts/", payload);
        setReplyDraftId(res.data.id);
        // Now save attachments if any
        if (attachments.length > 0 || Object.keys(editorData).length > 0) {
          const fd = new FormData();
          fd.append("subject", replySubject);
          fd.append("body", replyBody);
          fd.append("cc", replyCc);
          fd.append("editor_data", JSON.stringify(editorData));
          attachments.forEach(f => fd.append("attachments", f));
          const res2 = await api.post(`/communications/drafts/${res.data.id}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          setSavedAttachments(res2.data.attachments || []);
          setAttachments([]);
          setLastSavedAt(res2.data.last_saved_at);
        }
        toast.success("Draft saved");
      }
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save draft")); }
    finally { setSavingDraft(false); }
  };

  const handleDiscardReply = async () => {
    if (!(await confirmDialog("Discard this reply?"))) return;
    if (replyDraftId) {
      try { await api.post(`/communications/drafts/${replyDraftId}/discard/`); } catch {}
    }
    setReplyBody(""); setReplyCc(""); setReplySubject(""); setAttachments([]); setSavedAttachments([]);
    setReplyDraftId(null); setLastSavedAt(null); setShowReply(false); setReplyTargetId(null);
    toast.success("Reply discarded");
  };

  const handleRemoveSavedAtt = async (attId) => {
    if (!replyDraftId) return;
    try {
      await api.post(`/communications/drafts/${replyDraftId}/remove-attachment/`, { attachment_id: attId });
      setSavedAttachments(prev => prev.filter(a => a.id !== attId));
    } catch { toast.error("Failed to remove"); }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!comm) return null;

  // The "current" message is the one the user is actively replying to (if the
  // reply form is open) or the one they navigated in to from the list.
  const isCurrentMsg = (msg) => msg.id === (replyTargetId || comm.id);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/communications")} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{comm.subject || "(No Subject)"}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={comm.comm_type} />
            {comm.client_name && <span className="text-sm text-gray-500">{comm.client_name}</span>}
            {thread.length > 1 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{thread.length} messages in thread</span>}
          </div>
        </div>
      </div>

      {/* Thread */}
      <div className="space-y-4">
        {thread.map((msg, i) => (
          <div
            key={msg.id}
            ref={(el) => { if (el) messageRefs.current[msg.id] = el; }}
            className={`bg-white rounded-xl border overflow-hidden transition-shadow ${isCurrentMsg(msg) ? "border-indigo-400 ring-2 ring-indigo-100 shadow-md" : "border-gray-200"}`}
          >
            {/* Message header */}
            <div className={`px-5 py-3 border-b ${msg.direction === "inbound" ? "bg-blue-50/50 border-blue-100" : "bg-green-50/50 border-green-100"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${msg.direction === "inbound" ? "bg-blue-500" : "bg-green-500"}`}>
                      {msg.direction === "inbound" ? (msg.external_email || "?")[0].toUpperCase() : "K"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {msg.direction === "inbound"
                          ? (msg.contact_name || msg.external_email || msg.external_phone || "Unknown sender")
                          : (msg.user_name || "Kriya CRM")}
                      </p>
                      <p className="text-xs text-gray-500">
                        {msg.direction === "inbound" ? "to me" : `to ${msg.external_email || msg.external_phone || "—"}`}
                        {msg.email_cc && <span className="ml-1">cc: {msg.email_cc}</span>}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="text-xs text-gray-400">
                    {(() => { try { return format(new Date(msg.created_at), "MMM d, yyyy h:mm a"); } catch { return "—"; } })()}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${msg.direction === "inbound" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100"}`}>
                      {msg.direction === "inbound" ? "Received" : "Sent"}
                    </span>
                    {msg.comm_type === "email" && (
                      <button
                        onClick={() => {
                          if (emailAccounts.length > 0 && !selectedAccount) setSelectedAccount(emailAccounts[0].id);
                          openReply(comm, thread, msg);
                          requestAnimationFrame(() => {
                            const el = document.getElementById("reply-form-anchor");
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }}
                        className="text-[10px] font-medium px-2 py-0.5 rounded text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1"
                        title={msg.direction === "inbound" ? "Reply to this message" : "Follow up on this sent message"}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        {msg.direction === "inbound" ? "Reply" : "Follow up"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Message body */}
            <div className="px-5 py-4 overflow-hidden">
              {msg.comm_type === "email" && msg.body?.includes("<") ? (
                <div className="prose prose-sm max-w-none text-gray-700 break-words overflow-wrap-anywhere" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: msg.body }} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{msg.body || "No content"}</p>
              )}
            </div>

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-500 mb-2">Attachments ({msg.attachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att) => {
                    const raw = att.file || "";
                    const href = raw.startsWith("http") ? raw : `http://localhost:8000${raw}`;
                    return (
                      <a key={att.id} href={href} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <span className="text-xs font-medium text-gray-700">{att.filename}</span>
                        <span className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {msg.ai_summary && (
              <div className="px-5 py-3 border-t border-gray-100">
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  <span className="text-xs font-medium text-indigo-600">AI Summary</span>
                </div>
                <p className="text-sm text-gray-600 bg-indigo-50 rounded-lg p-3">{msg.ai_summary}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Thread info */}
      {thread.length > 1 && (
        <div className="mt-4 text-center">
          <span className="text-xs text-gray-400">{thread.length} messages in this conversation</span>
        </div>
      )}

      <div id="reply-form-anchor" />

      {/* Document Suggestions — COA/MSDS/TDS detected in inbound email */}
      {comm.comm_type === "email" && comm.client && (() => {
        const lastInbound = [...thread].reverse().find(m => m.direction === "inbound") || comm;
        const sourceText = `${lastInbound?.subject || ""} ${lastInbound?.body || ""}`.replace(/<[^>]+>/g, " ").toLowerCase();
        const DOC_PATTERNS = [
          { key: "coa", label: "COA", pattern: /\b(coa|certificate\s+of\s+analysis)\b/i },
          { key: "msds", label: "MSDS/SDS", pattern: /\b(msds|sds|material\s+safety\s+data\s+sheet|safety\s+data\s+sheet)\b/i },
          { key: "tds", label: "TDS", pattern: /\b(tds|technical\s+data\s+sheet)\b/i },
          { key: "certificate", label: "Certificate", pattern: /\b(certificate|certification|organic\s+cert|halal\s+cert)\b/i },
        ];
        const detected = DOC_PATTERNS.filter(d => d.pattern.test(sourceText));
        if (detected.length === 0) return null;

        const labels = detected.map(d => d.label).join(", ");

        return (
          <div className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl flex flex-wrap items-center gap-2">
            <span className="text-xs text-amber-700 font-medium">📋 Client requested: <strong>{labels}</strong></span>
            <button
              onClick={async () => {
                // Open reply if not already open, so they can attach
                if (!showReply) {
                  if (emailAccounts.length > 0 && !selectedAccount) setSelectedAccount(emailAccounts[0].id);
                  openReply(comm, thread);
                }
                toast("Open the reply form and attach the requested documents", { icon: "📎" });
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-amber-700 bg-white border border-amber-200 hover:bg-amber-50"
            >
              Reply & Attach Documents
            </button>
          </div>
        );
      })()}

      {/* Quick-Save action bar — visible on any thread that contains quote / PI
          / sample keywords, even before the user clicks Reply. Lets the user
          push the message into the Quotations / PI tab in one click without
          having to enter the reply form first. Same backend endpoints as the
          buttons inside the reply form. */}
      {comm.comm_type === "email" && comm.client && (() => {
        const lastInbound = [...thread].reverse().find(m => m.direction === "inbound") || comm;
        const text = `${lastInbound?.subject || ""} ${lastInbound?.body || ""}`.replace(/<[^>]+>/g, " ").toLowerCase();
        const wantsQuote = /\b(quotation|quote|pricing|price list|rate card|rates)\b/i.test(text);
        const wantsPI = /\b(proforma invoice|proforma|performa|pi)\b|send pi|need pi/i.test(text);
        const wantsSample = /\b(sample|samples|trial|swatch|free sample)\b/i.test(text);
        if (!wantsQuote && !wantsPI && !wantsSample) return null;

        const quickCreateQuote = async () => {
          if (!comm.client) { toast.error("No client linked to this email. Link a client first from Accounts."); return; }
          try {
            const res = await api.post("/quotations/quotations/create-blank/", {
              client_id: comm.client,
              communication_id: lastInbound.id,
            });
            toast.success(`Quotation ${res.data.quotation_number} saved to Quotations tab`);
          } catch (err) { toast.error(getErrorMessage(err, "Failed to create quotation")); }
        };
        const quickCreatePi = async () => {
          if (!comm.client) { toast.error("No client linked to this email. Link a client first from Accounts."); return; }
          try {
            const res = await api.post("/finance/pi/create-standalone/", {
              client_id: comm.client,
              communication_id: lastInbound.id,
            });
            toast.success(`PI ${res.data.invoice_number} saved to Proforma Invoices tab`);
          } catch (err) { toast.error(getErrorMessage(err, "Failed to create PI")); }
        };
        const quickCreateSample = async () => {
          try {
            const res = await api.post("/samples/create-from-email/", {
              client_id: comm.client,
              communication_id: lastInbound.id,
            });
            const productLabel = res.data.product_name || res.data.client_product_name || "(no product)";
            toast.success(`Sample request saved: ${productLabel}`);
          } catch { toast.error("Failed to create sample request"); }
        };

        return (
          <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-wrap items-center gap-2">
            <span className="text-xs text-indigo-700 font-medium mr-1">Detected in this email:</span>
            {wantsQuote && (
              <button onClick={quickCreateQuote} className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-teal-700 bg-white border border-teal-200 hover:bg-teal-50">
                📋 Save to Quotations
              </button>
            )}
            {wantsPI && (
              <button onClick={quickCreatePi} className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-orange-700 bg-white border border-orange-200 hover:bg-orange-50">
                📄 Save to Proforma Invoices
              </button>
            )}
            {wantsSample && (
              <button onClick={quickCreateSample} className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-fuchsia-700 bg-white border border-fuchsia-200 hover:bg-fuchsia-50">
                🧪 Save Sample Request
              </button>
            )}
          </div>
        );
      })()}

      {/* Reply Section — show if last message in thread is inbound (awaiting reply)
          OR if the user explicitly clicked Reply / Follow up on a specific message */}
      {comm.comm_type === "email" && thread.length > 0 && (showReply || thread[thread.length - 1].direction === "inbound") && (
        <div className="mt-6">
          {!showReply ? (
            <button onClick={() => {
              if (emailAccounts.length > 0 && !selectedAccount) setSelectedAccount(emailAccounts[0].id);
              openReply(comm, thread);
            }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              Reply to this conversation
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Reply</span>
                <button onClick={() => { setShowReply(false); setReplyTargetId(null); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>

              <div className="px-5 py-3 space-y-3">
                {/* From */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">Select email account</option>
                    {emailAccounts.map(a => <option key={a.id} value={a.id}>{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</option>)}
                  </select>
                </div>

                {/* To (read-only) */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input value={([...thread].reverse().find(m => m.direction === "inbound") || comm).external_email || ""} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">CC</label>
                    <EmailChips
                      value={replyCc}
                      onChange={(val) => setReplyCc(val)}
                      placeholder="Add CC recipients..."
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                  <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                {/* Body — rich text editor (same as AI Draft modal) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                  <RichTextEditor
                    value={replyBody}
                    onChange={(val) => setReplyBody(val)}
                    placeholder="Write your reply..."
                    minHeight="200px"
                  />
                </div>

                {/* Attachments */}
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer flex items-center gap-1">
                    📎 Add Files
                    <input type="file" ref={fileInputRef} multiple onChange={(e) => setAttachments(prev => [...prev, ...Array.from(e.target.files)])} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
                  </label>
                  <span className="text-xs text-gray-400">{(savedAttachments.length + attachments.length) > 0 ? `${savedAttachments.length + attachments.length} file(s)` : "No files attached"}</span>
                </div>
                {/* Saved attachments */}
                {savedAttachments.length > 0 && (
                  <div className="space-y-1">
                    {savedAttachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg text-xs hover:bg-green-100 transition-colors">
                        <div
                          onClick={async () => {
                            const raw = att.file || "";
                            const url = raw.startsWith("http") ? raw : `http://localhost:8000${raw}`;
                            const isPdf = (att.filename || "").toLowerCase().endsWith(".pdf");
                            try {
                              const res = await fetch(url, { credentials: "include" });
                              const blob = await res.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              if (isPdf) {
                                setPdfView({ url: blobUrl, title: att.filename });
                              } else {
                                window.open(blobUrl, "_blank");
                              }
                            } catch {
                              // fall back to a direct open if the fetch fails
                              window.open(url, "_blank");
                            }
                          }}
                          title={`View ${att.filename}`}
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:underline"
                        >
                          <span className="text-green-500">📄</span>
                          <span className="font-medium truncate">{att.filename}</span>
                          <span className="text-gray-400 shrink-0">{(att.file_size / 1024).toFixed(1)} KB</span>
                          <span className="text-green-600 text-[10px] shrink-0">Saved</span>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const next = await promptDialog({
                              title: "Rename attachment",
                              message: "Edit the filename the recipient will see.",
                              defaultValue: att.filename || "",
                              confirmText: "Rename",
                            });
                            if (next == null) return;
                            const trimmed = String(next).trim();
                            if (!trimmed || trimmed === att.filename) return;
                            try {
                              const res = await api.post(
                                `/communications/drafts/${replyDraftId}/rename-attachment/`,
                                { attachment_id: att.id, filename: trimmed }
                              );
                              const newName = res?.data?.filename || trimmed;
                              setSavedAttachments(prev => prev.map(a => a.id === att.id ? { ...a, filename: newName } : a));
                              toast.success("Renamed");
                            } catch (err) { toast.error(getErrorMessage(err, "Failed to rename")); }
                          }}
                          title="Rename file"
                          className="text-blue-600 hover:text-blue-700 ml-2 shrink-0 text-[11px] font-medium"
                        >Rename</button>
                        <button onClick={() => handleRemoveSavedAtt(att.id)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* New unsaved attachments */}
                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                        <div
                          onClick={() => {
                            const isPdf = (f.name || "").toLowerCase().endsWith(".pdf");
                            if (isPdf) {
                              setPdfView({ url: URL.createObjectURL(f), title: f.name });
                            }
                          }}
                          className={`flex items-center gap-2 ${(f.name || "").toLowerCase().endsWith(".pdf") ? "cursor-pointer hover:underline" : ""}`}
                        >
                          <span className="text-gray-500">📄</span>
                          <span className="font-medium">{f.name}</span>
                          <span className="text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
                          <span className="text-amber-600 text-[10px]">Unsaved</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={async () => {
                              const next = await promptDialog({
                                title: "Rename file",
                                message: "Edit the filename the recipient will see.",
                                defaultValue: f.name || "",
                                confirmText: "Rename",
                              });
                              if (next == null) return;
                              const trimmed = String(next).trim();
                              if (!trimmed || trimmed === f.name) return;
                              const renamed = new File([f], trimmed, { type: f.type, lastModified: f.lastModified });
                              setAttachments(prev => prev.map((file, idx) => idx === i ? renamed : file));
                            }}
                            title="Rename file"
                            className="text-blue-600 hover:text-blue-700 text-[11px] font-medium"
                          >Rename</button>
                          <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Last saved indicator */}
              {lastSavedAt && (
                <div className="px-5"><p className="text-[10px] text-gray-400">Last saved: {new Date(lastSavedAt).toLocaleString()}</p></div>
              )}

              {/* COA/MSDS/TDS detection + Attach from Library (inline reply) */}
              {(() => {
                const targetForDoc = (replyTargetId && thread.find(m => m.id === replyTargetId)) || [...thread].reverse().find(m => m.direction === "inbound") || comm;
                const docText = `${targetForDoc?.subject || ""} ${targetForDoc?.body || ""}`.replace(/<[^>]+>/g, " ").toLowerCase();
                const DOC_PAT = [
                  { key: "coa", label: "COA", pattern: /\b(coa|certificate\s+of\s+analysis)\b/i },
                  { key: "msds", label: "MSDS", pattern: /\b(msds|sds|material\s+safety|safety\s+data\s+sheet)\b/i },
                  { key: "tds", label: "TDS", pattern: /\b(tds|technical\s+data\s+sheet)\b/i },
                  { key: "certificate", label: "Certificate", pattern: /\b(certificate|certification)\b/i },
                ];
                const det = DOC_PAT.filter(d => d.pattern.test(docText));
                if (det.length === 0) return null;
                return (
                  <div className="px-5 py-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowDocLibPicker(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                    >
                      📋 Attach {det.map(d => d.label).join("/")} from Library
                    </button>
                    {det.some(d => d.key === "coa") && (
                      <button onClick={() => setShowCOAEditor(true)} className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-blue-700 bg-blue-50 hover:bg-blue-100">
                        📝 Create COA
                      </button>
                    )}
                    {det.some(d => d.key === "msds") && (
                      <button onClick={() => setShowMSDSEditor(true)} className="px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 text-blue-700 bg-blue-50 hover:bg-blue-100">
                        📝 Create MSDS
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Smart Generate Buttons — open editor (pre-filled from email),
                  let user edit/preview, then attach the final PDF.
                  Same flow as the AI Draft modal on the client page.

                  IMPORTANT: keyword detection is scoped to the SPECIFIC message
                  the user is replying to (not the whole thread), so threads
                  that mixed quotation + PI talk earlier don't permanently show
                  both buttons on every reply. PI keywords also exclude the
                  word "quotation" so a pure-PI email doesn't trigger the
                  Generate Quotation button just because "quote" is a substring
                  of "Quotation" appearing nowhere here.
                */}
              {(() => {
                // Find the message we're replying to: explicit target → latest inbound → current
                const targetForKw =
                  (replyTargetId && thread.find(m => m.id === replyTargetId)) ||
                  [...thread].reverse().find(m => m.direction === "inbound") ||
                  comm;
                const text = `${targetForKw?.subject || ""} ${targetForKw?.body || ""}`.replace(/<[^>]+>/g, " ").toLowerCase();
                // Quotation: must mention quote/quotation/pricing/etc. as a whole word
                const wantsQuote = /\b(quotation|quote|pricing|price list|rate card|rates)\b/i.test(text);
                // PI: explicit proforma / PI mentions
                const wantsPI = /\b(proforma invoice|proforma|performa|pi)\b|send pi|need pi/i.test(text);
                // Sample: client asking for a sample/trial
                const wantsSample = /\b(sample|samples|trial|swatch|free sample)\b/i.test(text);
                if ((!wantsQuote && !wantsPI && !wantsSample) || !comm.client) return null;

                // Disable each button if a matching PDF is already attached
                const allNames = [
                  ...savedAttachments.map(a => (a.filename || "").toLowerCase()),
                  ...attachments.map(a => (a.name || "").toLowerCase()),
                ];
                const hasQuoteAttached = allNames.some(n => n.startsWith("quotation_"));
                const hasPiAttached = allNames.some(n => n.startsWith("pi_"));

                const lastInbound = [...thread].reverse().find(m => m.direction === "inbound") || comm;

                const openQuoteEditor = async () => {
                  if (!comm.client) { toast.error("No client linked to this email. Link a client first from Accounts."); return; }
                  try {
                    const res = await api.post("/quotations/quotations/create-blank/", {
                      client_id: comm.client,
                      communication_id: lastInbound.id,
                    });
                    const qt = res.data;
                    setAttachQt(qt);
                    setAttachQtForm(qt);
                    setAttachQtItems(qt.items || []);
                    setAttachMode("quote");
                    toast.success(`Quotation ${qt.quotation_number} created — edit and attach`);
                  } catch (err) { toast.error(getErrorMessage(err, "Failed to create quotation")); }
                };

                const openPiEditor = async () => {
                  try {
                    const res = await api.post("/finance/pi/create-standalone/", {
                      client_id: comm.client,
                      communication_id: lastInbound.id,
                    });
                    setAttachPi(res.data);
                    setAttachMode("pi");
                    toast.success(`PI ${res.data.invoice_number} created — edit and attach`);
                  } catch { toast.error("Failed to create PI"); }
                };

                const createSampleRequest = async () => {
                  try {
                    const res = await api.post("/samples/create-from-email/", {
                      client_id: comm.client,
                      communication_id: lastInbound.id,
                    });
                    const sample = res.data;
                    const productLabel = sample.product_name || sample.client_product_name || "(no product)";
                    const qtyLabel = sample.quantity ? ` · ${sample.quantity}` : "";
                    toast.success(`Sample request created for ${productLabel}${qtyLabel}`);
                  } catch { toast.error("Failed to create sample request"); }
                };

                return (
                  <div className="px-5 py-2 flex gap-2">
                    {wantsQuote && (
                      <button
                        onClick={openQuoteEditor}
                        disabled={hasQuoteAttached}
                        title={hasQuoteAttached ? "A quotation is already attached" : ""}
                        className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-50"
                      >
                        📋 Generate Quotation
                      </button>
                    )}
                    {wantsPI && (
                      <button
                        onClick={openPiEditor}
                        disabled={hasPiAttached}
                        title={hasPiAttached ? "A proforma invoice is already attached" : ""}
                        className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-50"
                      >
                        📄 Generate PI
                      </button>
                    )}
                    {wantsSample && (
                      <button
                        onClick={createSampleRequest}
                        title="Create a sample request for this client"
                        className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100"
                      >
                        🧪 Create Sample Request
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Actions bar */}
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={handleVoiceToText} className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 ${isListening ? 'text-red-700 bg-red-50 hover:bg-red-100 animate-pulse' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'}`}>
                    {isListening ? '⏹ Stop Recording' : '🎤 Voice to Text'}
                  </button>
                  <button onClick={async () => {
                    if (!comm.client) { toast.error("No client linked"); return; }
                    setGeneratingDraft(true);
                    try {
                      const lastInbound = [...thread].reverse().find(m => m.direction === "inbound");
                      if (!lastInbound) { toast.error("No inbound message to reply to"); return; }
                      const drafts = await api.get(`/communications/drafts/`, { params: { communication: lastInbound.id } });
                      const draftList = drafts.data.results || drafts.data;
                      if (draftList.length > 0) {
                        const d = draftList[0];
                        setReplyBody(d.body);
                        if (d.cc) setReplyCc(d.cc);
                        setReplyDraftId(d.id);
                        setSavedAttachments(d.attachments || []);
                        setLastSavedAt(d.last_saved_at);
                        toast.success("AI draft loaded");
                      } else {
                        toast.error("No AI draft found for this email");
                      }
                    } catch { toast.error("Failed to load AI draft"); }
                    finally { setGeneratingDraft(false); }
                  }} disabled={generatingDraft} className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 ${generatingDraft ? "opacity-50" : ""} text-purple-700 bg-purple-50 hover:bg-purple-100`}>
                    {generatingDraft ? "Loading..." : "✨ AI Draft"}
                  </button>
                  <ReplyRefineDropdown body={replyBody} onRefined={(text) => setReplyBody(text)} contactName={([...thread].reverse().find(m => m.direction === "inbound") || comm).contact_name || ""} />
                  <button onClick={handleSaveReplyDraft} disabled={savingDraft} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50">
                    {savingDraft ? "Saving..." : "💾 Save as Draft"}
                  </button>
                  <button onClick={handleDiscardReply} className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium">
                    Discard
                  </button>
                </div>
                <button onClick={async () => {
                  // Find the message we're replying to. Priority:
                  //   1) the explicit replyTargetId set when the user clicked
                  //      Reply / Follow up on a specific message
                  //   2) the latest inbound message in the thread
                  //   3) the current communication itself (fallback)
                  const targetMsg =
                    (replyTargetId && thread.find(m => m.id === replyTargetId)) ||
                    [...thread].reverse().find(m => m.direction === "inbound") ||
                    comm;
                  // Recipient: for inbound targets we reply to the sender,
                  // for outbound targets (follow-ups) we send to the original
                  // recipient — both live in `external_email`.
                  const toEmail = targetMsg.external_email || comm.external_email;
                  if (!toEmail) { toast.error("No recipient email"); return; }
                  if (!replyBody.trim()) { toast.error("Write a reply first"); return; }

                  // Route through the EmailDraft.send endpoint so the same
                  // post-send hooks fire (markdown→HTML conversion, marking
                  // QuoteRequest/Quotation/ProformaInvoice as sent, etc.).
                  try {
                    let draftId = replyDraftId;
                    if (!draftId) {
                      // Create a draft tied to the message we're responding to
                      const created = await api.post("/communications/drafts/", {
                        communication: targetMsg.id,
                        client: comm.client || null,
                        subject: replySubject,
                        body: replyBody,
                        to_email: toEmail,
                        cc: replyCc,
                      });
                      draftId = created.data.id;
                      setReplyDraftId(draftId);
                    }
                    // Save current state + any new attachments
                    const fd = new FormData();
                    fd.append("subject", replySubject);
                    fd.append("body", replyBody);
                    fd.append("cc", replyCc || "");
                    attachments.forEach(f => fd.append("attachments", f));
                    await api.post(`/communications/drafts/${draftId}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });

                    setShowReply(false);
                    sendWithUndo(
                      () => api.post(`/communications/drafts/${draftId}/send/`),
                      {
                        preview: { to: toEmail, cc: replyCc, subject: replySubject, body: replyBody },
                        onSent: () => {
                          setReplyBody(""); setReplyCc(""); setAttachments([]); setSavedAttachments([]);
                          setReplyDraftId(null); setLastSavedAt(null);
                          loadThread();
                          toast.success("Reply sent!");
                        },
                        onError: (err) => toast.error(getErrorMessage(err, "Failed to send")),
                      }
                    );
                  } catch (err) {
                    toast.error(getErrorMessage(err, "Failed to send"));
                  }
                }} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  Send Reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quotation Editor Modal — same flow as the AI Draft modal on client page */}
      <QuotationEditorModal
        open={attachMode === "quote" && !!attachQt}
        onClose={() => { setAttachMode(null); setAttachQt(null); }}
        qt={attachQt} qtForm={attachQtForm} setQtForm={setAttachQtForm}
        qtItems={attachQtItems} setQtItems={setAttachQtItems}
        sendLabel="Attach to Reply"
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
            setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: `Quotation ${attachQt.quotation_number}` });
          } catch { toast.error("Failed to preview"); }
        }}
        onSend={async () => {
          // "Attach to Reply" — save, generate PDF, push it into reply attachments
          if (!attachQt) return;
          try {
            const display_overrides = {};
            Object.entries(attachQtForm).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/quotations/quotations/${attachQt.id}/save-with-items/`, { ...attachQtForm, display_overrides, items: attachQtItems });
            const pdfRes = await api.get(`/quotations/quotations/${attachQt.id}/generate-pdf/`, { responseType: "blob" });
            const filename = `Quotation_${attachQt.quotation_number.replace(/\//g, "-")}.pdf`;
            const file = new File([pdfRes.data], filename, { type: "application/pdf" });
            setAttachments(prev => [...prev, file]);
            setAttachMode(null); setAttachQt(null);
            toast.success(`${filename} attached to reply`);
          } catch (err) { toast.error(getErrorMessage(err, "Failed to attach")); }
        }}
      />

      {/* PI Editor Modal */}
      <PIEditorModal
        open={attachMode === "pi" && !!attachPi}
        onClose={() => { setAttachMode(null); setAttachPi(null); }}
        pi={attachPi}
        piForm={attachPi || {}}
        setPiForm={(updater) => setAttachPi(typeof updater === "function" ? updater(attachPi) : updater)}
        piItems={attachPi?.items || []}
        setPiItems={(items) => setAttachPi(prev => ({ ...prev, items: typeof items === "function" ? items(prev?.items || []) : items }))}
        sendLabel="Attach to Reply"
        onSave={async () => {
          if (!attachPi) return;
          try {
            const display_overrides = {};
            Object.entries(attachPi).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            const res = await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, display_overrides, items: attachPi.items });
            setAttachPi(res.data);
            toast.success("PI saved");
          } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
        }}
        onPreview={async () => {
          if (!attachPi) return;
          try {
            const display_overrides = {};
            Object.entries(attachPi).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, display_overrides, items: attachPi.items });
            const res = await api.get(`/finance/pi/${attachPi.id}/generate-pdf/`, { responseType: "blob" });
            setPdfView({ url: window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })), title: `PI ${attachPi.invoice_number}` });
          } catch { toast.error("Failed to preview"); }
        }}
        onSend={async () => {
          if (!attachPi) return;
          try {
            const display_overrides = {};
            Object.entries(attachPi).forEach(([k, v]) => { if (k.startsWith("_")) display_overrides[k] = v; });
            await api.post(`/finance/pi/${attachPi.id}/save-with-items/`, { ...attachPi, display_overrides, items: attachPi.items });
            const pdfRes = await api.get(`/finance/pi/${attachPi.id}/generate-pdf/`, { responseType: "blob" });
            const filename = `PI_${attachPi.invoice_number.replace(/\//g, "-")}.pdf`;
            const file = new File([pdfRes.data], filename, { type: "application/pdf" });
            setAttachments(prev => [...prev, file]);
            setAttachMode(null); setAttachPi(null);
            toast.success(`${filename} attached to reply`);
          } catch (err) { toast.error(getErrorMessage(err, "Failed to attach")); }
        }}
      />
      <PdfViewer url={pdfView?.url} title={pdfView?.title} onClose={() => { if (pdfView?.url) URL.revokeObjectURL(pdfView.url); setPdfView(null); }} />
      {showDocLibPicker && (
        <DocLibraryPicker
          onPickFile={(file) => setAttachments(prev => [...prev, file])}
          onClose={() => setShowDocLibPicker(false)}
          onAttached={() => setShowDocLibPicker(false)}
        />
      )}
      <COAEditorModal
        open={showCOAEditor}
        onClose={() => setShowCOAEditor(false)}
        productName=""
        initialData={editorData.coa || null}
        onStateChange={(state) => setEditorData(prev => ({ ...prev, coa: state }))}
        onGenerate={async (formData) => {
          try {
            const isFormData = formData instanceof FormData;
            const res = await api.post("/communications/generate-coa-pdf/", formData, {
              responseType: "blob",
              ...(isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {}),
            });
            // Extract product name for filename
            let pName = "Product";
            if (isFormData) {
              try { pName = JSON.parse(formData.get("payload")).product_name || pName; } catch {}
            } else {
              pName = formData.product_name || pName;
            }
            const filename = `COA_${pName.replace(/\s/g, "_")}.pdf`;
            const file = new File([res.data], filename, { type: "application/pdf" });
            setAttachments(prev => [...prev, file]);
            toast.success(`${filename} created and added to attachments`);
            setShowCOAEditor(false);
          } catch { toast.error("Failed to generate COA"); }
        }}
      />
      <MSDSEditorModal
        open={showMSDSEditor}
        onClose={() => setShowMSDSEditor(false)}
        productName=""
        initialData={editorData.msds || null}
        onStateChange={(state) => setEditorData(prev => ({ ...prev, msds: state }))}
        onGenerate={async (formData) => {
          try {
            const res = await api.post("/communications/generate-msds-pdf/", formData, { responseType: "blob" });
            const filename = `MSDS_${(formData.product_name || "Product").replace(/\s/g, "_")}.pdf`;
            const file = new File([res.data], filename, { type: "application/pdf" });
            setAttachments(prev => [...prev, file]);
            toast.success(`${filename} created and added to attachments`);
            setShowMSDSEditor(false);
          } catch { toast.error("Failed to generate MSDS"); }
        }}
      />
    </div>
  );
}
