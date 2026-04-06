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

  const loadThread = () => {
    api.get(`/communications/${id}/thread/`)
      .then((res) => {
        setComm(res.data.communication);
        setThread(res.data.thread || []);
      })
      .catch((err) => { toast.error(getErrorMessage(err, "Failed to load")); router.push("/communications"); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadThread();
    api.get("/communications/email-accounts/").then(r => setEmailAccounts(r.data.results || r.data)).catch(() => {});
  }, [id]);

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
    const lastInbound = [...thread].reverse().find(m => m.direction === "inbound");
    if (!lastInbound) { toast.error("No inbound message"); return; }
    const toEmail = lastInbound.external_email || "";
    setSavingDraft(true);
    try {
      if (replyDraftId) {
        // Update existing draft
        const fd = new FormData();
        fd.append("subject", replySubject);
        fd.append("body", replyBody);
        fd.append("cc", replyCc);
        attachments.forEach(f => fd.append("attachments", f));
        const res = await api.post(`/communications/drafts/${replyDraftId}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        setSavedAttachments(res.data.attachments || []);
        setAttachments([]);
        setLastSavedAt(res.data.last_saved_at);
        toast.success("Draft saved");
      } else {
        // Create new draft
        const payload = { communication: lastInbound.id, client: comm.client || null, subject: replySubject, body: replyBody, to_email: toEmail, cc: replyCc };
        const res = await api.post("/communications/drafts/", payload);
        setReplyDraftId(res.data.id);
        // Now save attachments if any
        if (attachments.length > 0) {
          const fd = new FormData();
          fd.append("subject", replySubject);
          fd.append("body", replyBody);
          fd.append("cc", replyCc);
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
    if (!confirm("Discard this reply?")) return;
    if (replyDraftId) {
      try { await api.post(`/communications/drafts/${replyDraftId}/discard/`); } catch {}
    }
    setReplyBody(""); setReplyCc(""); setReplySubject(""); setAttachments([]); setSavedAttachments([]);
    setReplyDraftId(null); setLastSavedAt(null); setShowReply(false);
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

  const isCurrentMsg = (msg) => msg.id === comm.id;

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
          <div key={msg.id} className={`bg-white rounded-xl border overflow-hidden ${isCurrentMsg(msg) ? "border-indigo-300 ring-1 ring-indigo-100" : "border-gray-200"}`}>
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
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {(() => { try { return format(new Date(msg.created_at), "MMM d, yyyy h:mm a"); } catch { return "—"; } })()}
                  </p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${msg.direction === "inbound" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100"}`}>
                    {msg.direction === "inbound" ? "Received" : "Sent"}
                  </span>
                </div>
              </div>
            </div>

            {/* Message body */}
            <div className="px-5 py-4">
              {msg.comm_type === "email" && msg.body?.includes("<") ? (
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: msg.body }} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body || "No content"}</p>
              )}
            </div>

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-500 mb-2">Attachments ({msg.attachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att) => (
                    <a key={att.id} href={att.file} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      <span className="text-xs font-medium text-gray-700">{att.filename}</span>
                      <span className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                    </a>
                  ))}
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

      {/* Reply Section — only show if last message in thread is inbound (awaiting reply) */}
      {comm.comm_type === "email" && thread.length > 0 && thread[thread.length - 1].direction === "inbound" && (
        <div className="mt-6">
          {!showReply ? (
            <button onClick={() => {
              const lastInbound = [...thread].reverse().find(m => m.direction === "inbound") || comm;
              const subj = comm.subject || "";
              setReplySubject(subj.startsWith("Re:") ? subj : `Re: ${subj}`);
              // Build CC from client contacts + admin/manager
              if (comm.client) {
                api.get(`/clients/${comm.client}/`).then(r => {
                  const contacts = r.data.contacts || [];
                  const toEmail = lastInbound.external_email || "";
                  const otherEmails = contacts.map(c => c.email).filter(e => e && e.toLowerCase() !== toEmail.toLowerCase());
                  api.get("/auth/users/").then(ur => {
                    const admMgr = (ur.data.results || ur.data).filter(u => u.email && (u.role === "admin" || u.role === "manager")).map(u => u.email);
                    const allCc = [...otherEmails];
                    admMgr.forEach(e => { if (!allCc.includes(e) && e.toLowerCase() !== toEmail.toLowerCase()) allCc.push(e); });
                    setReplyCc(allCc.join(", "));
                  }).catch(() => {});
                }).catch(() => {});
              }
              if (emailAccounts.length > 0 && !selectedAccount) setSelectedAccount(emailAccounts[0].id);
              setShowReply(true);
            }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              Reply to this conversation
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Reply</span>
                <button onClick={() => setShowReply(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
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
                    <input value={replyCc} onChange={(e) => setReplyCc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                  <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                  <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={8} placeholder="Write your reply..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
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
                      <div key={att.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-green-500">📄</span>
                          <span className="font-medium">{att.filename}</span>
                          <span className="text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                          <span className="text-green-600 text-[10px]">Saved</span>
                        </div>
                        <button onClick={() => handleRemoveSavedAtt(att.id)} className="text-red-400 hover:text-red-600">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* New unsaved attachments */}
                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">📄</span>
                          <span className="font-medium">{f.name}</span>
                          <span className="text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
                          <span className="text-amber-600 text-[10px]">Unsaved</span>
                        </div>
                        <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Last saved indicator */}
              {lastSavedAt && (
                <div className="px-5"><p className="text-[10px] text-gray-400">Last saved: {new Date(lastSavedAt).toLocaleString()}</p></div>
              )}

              {/* Smart Generate Buttons — generate doc + attach PDF to reply */}
              {(() => {
                const allText = thread.map(m => `${m.subject || ""} ${m.body || ""}`).join(" ").toLowerCase();
                const wantsQuote = /quotation|quote|pricing|price list|rate card|rates/i.test(allText);
                const wantsPI = /proforma invoice|proforma|performa|PI\b|send PI|need PI/i.test(allText);
                if ((!wantsQuote && !wantsPI) || !comm.client) return null;

                const generateAndAttach = async (type) => {
                  try {
                    let docId, pdfUrl, filename;
                    if (type === "quote") {
                      const res = await api.post("/quotations/quotations/create-blank/", { client_id: comm.client });
                      docId = res.data.id;
                      filename = `Quotation_${res.data.quotation_number.replace(/\//g, "-")}.pdf`;
                      pdfUrl = `/quotations/quotations/${docId}/generate-pdf/`;
                      toast.success(`Quotation ${res.data.quotation_number} created`);
                    } else {
                      const res = await api.post("/finance/pi/create-standalone/", { client_id: comm.client });
                      docId = res.data.id;
                      filename = `PI_${res.data.invoice_number.replace(/\//g, "-")}.pdf`;
                      pdfUrl = `/finance/pi/${docId}/generate-pdf/`;
                      toast.success(`PI ${res.data.invoice_number} created`);
                    }
                    const pdfRes = await api.get(pdfUrl, { responseType: "blob" });
                    const file = new File([pdfRes.data], filename, { type: "application/pdf" });
                    setAttachments(prev => [...prev, file]);
                    toast.success(`${filename} attached to reply`);
                  } catch { toast.error(`Failed to generate ${type === "quote" ? "quotation" : "PI"}`); }
                };

                return (
                  <div className="px-5 py-2 flex gap-2">
                    {wantsQuote && (
                      <button onClick={() => generateAndAttach("quote")} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-teal-700 bg-teal-50 hover:bg-teal-100">
                        📋 Generate &amp; Attach Quotation
                      </button>
                    )}
                    {wantsPI && (
                      <button onClick={() => generateAndAttach("pi")} className="px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1 text-orange-700 bg-orange-50 hover:bg-orange-100">
                        📄 Generate &amp; Attach PI
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
                  const toEmail = ([...thread].reverse().find(m => m.direction === "inbound") || comm).external_email;
                  if (!toEmail) { toast.error("No recipient email"); return; }
                  if (!replyBody.trim()) { toast.error("Write a reply first"); return; }
                  if (!selectedAccount) { toast.error("Select an email account"); return; }

                  const fd = new FormData();
                  fd.append("email_account", selectedAccount);
                  fd.append("to", toEmail);
                  fd.append("subject", replySubject);
                  fd.append("body", replyBody);
                  if (replyCc) fd.append("cc", replyCc);
                  if (comm.client) fd.append("client", comm.client);
                  attachments.forEach(f => fd.append("attachments", f));

                  setShowReply(false);
                  sendWithUndo(
                    () => api.post("/communications/send-email/", fd, { headers: { "Content-Type": "multipart/form-data" } }),
                    {
                      preview: { to: toEmail, cc: replyCc, subject: replySubject, body: replyBody },
                      onSent: () => { setReplyBody(""); setAttachments([]); loadThread(); toast.success("Reply sent!"); },
                      onError: (err) => toast.error(getErrorMessage(err, "Failed to send")),
                    }
                  );
                }} disabled={sending} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  Send Reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
