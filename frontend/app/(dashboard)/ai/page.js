"use client";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import { confirmDialog } from "@/lib/confirm";

// ---------------------------------------------------------------------------
// Thinking indicator — cycles through short messages
// ---------------------------------------------------------------------------
const THINKING_MESSAGES = [
  "Checking your CRM...",
  "Pulling the data...",
  "Almost ready...",
  "One moment...",
];

function ThinkingIndicator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % THINKING_MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex justify-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md mt-1">
        <span className="text-xs text-white font-bold">✦</span>
      </div>
      <div className="bg-white border border-slate-200/70 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <span className="text-sm text-slate-500 font-medium">{THINKING_MESSAGES[idx]}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer — clean, readable output
// ---------------------------------------------------------------------------
function MarkdownContent({ content }) {
  const lines = content.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const withInline = (text) =>
      text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, '<code class="bg-gray-100 text-gray-700 px-1 py-0.5 rounded text-xs font-mono">$1</code>');

    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1.5 first:mt-0" dangerouslySetInnerHTML={{ __html: withInline(line.slice(3)) }} />);
    } else if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-gray-700 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: withInline(line.slice(4)) }} />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Collect consecutive list items
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1 my-1.5 ml-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: withInline(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1 my-1.5 ml-1 list-none">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: withInline(item) }} />
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} className="my-3 border-gray-200" />);
    } else {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: withInline(line) }} />);
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ---------------------------------------------------------------------------
// Suggested question cards by role
// ---------------------------------------------------------------------------
const TILE_TONES = [
  { bg: "from-indigo-50 to-indigo-100/60", iconBg: "from-indigo-500 to-indigo-600", text: "text-indigo-700", ring: "hover:ring-indigo-300" },
  { bg: "from-violet-50 to-violet-100/60", iconBg: "from-violet-500 to-violet-600", text: "text-violet-700", ring: "hover:ring-violet-300" },
  { bg: "from-emerald-50 to-emerald-100/60", iconBg: "from-emerald-500 to-emerald-600", text: "text-emerald-700", ring: "hover:ring-emerald-300" },
  { bg: "from-amber-50 to-amber-100/60", iconBg: "from-amber-500 to-amber-600", text: "text-amber-700", ring: "hover:ring-amber-300" },
  { bg: "from-rose-50 to-rose-100/60", iconBg: "from-rose-500 to-rose-600", text: "text-rose-700", ring: "hover:ring-rose-300" },
  { bg: "from-blue-50 to-blue-100/60", iconBg: "from-blue-500 to-blue-600", text: "text-blue-700", ring: "hover:ring-blue-300" },
];

const EXEC_QUESTIONS = [
  { icon: "📋", label: "My overdue tasks", q: "What are my overdue tasks?" },
  { icon: "📊", label: "My pipeline", q: "Show me my pipeline summary" },
  { icon: "📦", label: "Active orders", q: "List my active orders" },
  { icon: "🚢", label: "Shipments in transit", q: "Show my shipments in transit" },
  { icon: "💬", label: "Recent communications", q: "Summarize my recent client communications" },
  { icon: "💰", label: "Overdue invoices", q: "Which of my invoices are overdue?" },
];

const ADMIN_QUESTIONS = [
  { icon: "👥", label: "Team overview", q: "Show me all executive details and workload" },
  { icon: "📊", label: "Pipeline summary", q: "Give me the full pipeline summary" },
  { icon: "⚠️", label: "Overdue tasks", q: "What are the overdue tasks across all executives?" },
  { icon: "💰", label: "Overdue invoices", q: "Which invoices are overdue?" },
  { icon: "📦", label: "Active orders", q: "Show me all active orders" },
  { icon: "📈", label: "Team performance", q: "Show team performance overview" },
];

function WelcomeScreen({ user, onSelect }) {
  const isExec = user?.role === "executive";
  const questions = isExec ? EXEC_QUESTIONS : ADMIN_QUESTIONS;
  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      {/* Avatar + greeting */}
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-3xl blur-2xl opacity-40" />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-2xl ring-4 ring-white">
          <span className="text-4xl">✦</span>
        </div>
      </div>
      <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">
        Hey <span className="bg-gradient-to-br from-indigo-600 to-violet-600 bg-clip-text text-transparent">{firstName}</span> <span className="inline-block animate-wave">👋</span>
      </h2>
      <p className="text-slate-500 text-sm mb-8 text-center max-w-md leading-relaxed">
        {isExec
          ? "I can help you stay on top of your accounts, tasks, orders, and more."
          : "I have full access to your CRM. Ask me about the team, pipeline, clients, or anything else."}
      </p>

      {/* Suggested questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
        {questions.map(({ icon, label, q }, i) => {
          const tone = TILE_TONES[i % TILE_TONES.length];
          return (
            <button
              key={i}
              onClick={() => onSelect(q)}
              className={`group relative overflow-hidden flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200/70 rounded-2xl text-left hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 ${tone.ring} transition-all shadow-sm`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${tone.bg} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className={`relative shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${tone.iconBg} flex items-center justify-center shadow-sm text-base`}>
                <span className="filter drop-shadow-sm">{icon}</span>
              </div>
              <span className={`relative text-sm font-semibold text-slate-700 group-hover:${tone.text} transition-colors`}>{label}</span>
              <svg className={`relative ml-auto w-4 h-4 text-slate-300 group-hover:${tone.text} group-hover:translate-x-0.5 transition-all`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          );
        })}
      </div>

      <p className="mt-8 text-[11px] text-slate-400 flex items-center gap-1.5">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        Powered by your CRM data — Kriya AI sees what you see.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AIPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { user } = useSelector((state) => state.auth);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const loadConversations = () => {
    setLoadingConvs(true);
    api.get("/agents/conversations/")
      .then((r) => setConversations(r.data.results || r.data))
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  };

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadConversation = async (id) => {
    try {
      const r = await api.get(`/agents/conversations/${id}/`);
      setActiveConv(r.data);
      setMessages(r.data.messages || []);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load conversation"));
    }
  };

  const handleNewChat = async () => {
    try {
      const r = await api.post("/agents/conversations/", { title: "New Chat" });
      setActiveConv(r.data);
      setMessages([]);
      loadConversations();
      inputRef.current?.focus();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create chat"));
    }
  };

  const sendMessage = async (convId, message) => {
    const tempId = "temp-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: message, created_at: new Date().toISOString() },
    ]);
    setSending(true);

    try {
      const r = await api.post(`/agents/conversations/${convId}/chat/`, { message });
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        r.data.user_message || { ...prev.find((m) => m.id === tempId), id: "u-" + Date.now() },
        r.data.message,
      ]);
      loadConversations();
    } catch (err) {
      toast.error(err.response?.data?.error || "AI request failed");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e, overrideMsg) => {
    e?.preventDefault();
    const msg = (overrideMsg || input).trim();
    if (!msg || sending) return;
    setInput("");

    if (!activeConv) {
      try {
        const r = await api.post("/agents/conversations/", { title: "New Chat" });
        setActiveConv(r.data);
        loadConversations();
        await sendMessage(r.data.id, msg);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to start chat"));
      }
    } else {
      await sendMessage(activeConv.id, msg);
    }
  };

  const handleSuggestion = (q) => {
    setInput(q);
    handleSend(null, q);
  };

  const handleDeleteMessage = async (msgId) => {
    if (!(await confirmDialog("Delete this message?"))) return;
    try {
      await api.delete(`/agents/messages/${msgId}/`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      toast.error("Failed to delete message");
    }
  };

  const handleDeleteConv = async (id, e) => {
    e.stopPropagation();
    if (!(await confirmDialog("Delete this conversation?"))) return;
    try {
      await api.delete(`/agents/conversations/${id}/`);
      if (activeConv?.id === id) { setActiveConv(null); setMessages([]); }
      loadConversations();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      {/* Sidebar */}
      <div className="w-72 bg-white/80 backdrop-blur border-r border-slate-200/70 flex flex-col shrink-0 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
        <div className="px-4 py-4 border-b border-slate-200/70 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-violet-300/20 rounded-full blur-xl" />
          <div className="relative flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
              <span className="text-lg">✦</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-sm tracking-tight">Kriya AI</h3>
              <p className="text-[10px] text-indigo-100">Your CRM copilot</p>
            </div>
          </div>
          <button
            onClick={handleNewChat}
            className="relative w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-indigo-700 text-sm font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="px-4 pt-4 pb-1.5 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em]">Recent</span>
          <span className="px-1.5 py-px rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{conversations.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {conversations.map((conv) => {
            const isActive = activeConv?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 font-semibold shadow-sm ring-1 ring-indigo-200/60"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-gradient-to-b from-indigo-500 to-violet-500" />}
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${isActive ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm" : "bg-slate-100 text-slate-400"}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteConv(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all shrink-0 ml-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })}
          {!loadingConvs && conversations.length === 0 && (
            <div className="mx-2 my-3 px-3 py-5 rounded-xl bg-slate-50/70 border border-dashed border-slate-200 text-center">
              <p className="text-2xl mb-1">💭</p>
              <p className="text-[11px] text-slate-500 font-medium">No conversations yet</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Start a new chat above</p>
            </div>
          )}
        </div>

        {/* User info at bottom */}
        {user && (
          <div className="p-3 border-t border-slate-200/70 bg-gradient-to-br from-slate-50/80 to-white">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold ring-2 ring-white shadow">
                  {user.full_name?.[0] || "?"}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{user.full_name}</p>
                <p className="text-[10px] text-slate-500 capitalize font-medium">{user.role}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 bg-gradient-to-b from-slate-50/40 to-white">
          {messages.length === 0 && !sending && (
            <WelcomeScreen user={user} onSelect={handleSuggestion} />
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`group flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {/* AI avatar */}
              {msg.role !== "user" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-md ring-2 ring-white">
                  <span className="text-xs text-white font-bold">✦</span>
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[75%]">
                <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-tr-sm"
                    : "bg-white border border-slate-200/70 text-slate-800 rounded-tl-sm"
                }`}>
                  {msg.role === "user" ? (
                    <p className="text-sm leading-relaxed" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{msg.content}</p>
                  ) : msg.content ? (
                    <div>
                      <MarkdownContent content={msg.content} />
                      {msg.streaming && (
                        <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : (
                    <ThinkingIndicator />
                  )}
                </div>

                {/* Metadata row */}
                <div className={`flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {msg.created_at ? format(new Date(msg.created_at), "h:mm a") : ""}
                  </span>
                  {msg.tool_calls?.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full font-semibold">
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
                      {msg.tool_calls.length} tool{msg.tool_calls.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                    title="Copy"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  {msg.role === "user" && (
                    <button
                      onClick={() => { setInput(msg.content); inputRef.current?.focus(); }}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="Edit & resend"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  {msg.role === "user" && !msg.id?.startsWith?.("temp-") && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md"
                      title="Delete message"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* User avatar */}
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center shrink-0 mt-1 font-bold text-xs ring-2 ring-white shadow-sm">
                  {user?.full_name?.[0] || "U"}
                </div>
              )}
            </div>
          ))}

          {sending && messages[messages.length - 1]?.role !== "assistant" && <ThinkingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-slate-200/70 px-4 py-3.5 bg-white/95 backdrop-blur">
          <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
            <div className="flex gap-2 items-end p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask Kriya AI anything about your CRM…"
                disabled={sending}
                rows={1}
                className="flex-1 px-3 py-2 outline-none disabled:opacity-50 resize-none text-sm leading-relaxed bg-transparent placeholder:text-slate-400"
                style={{ minHeight: "40px", maxHeight: "120px" }}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-xl font-semibold hover:shadow-md disabled:opacity-40 disabled:hover:shadow-none shrink-0 transition-all flex items-center gap-1.5 shadow-sm"
              >
                {sending ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
                <span className="text-xs">{sending ? "Thinking" : "Send"}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-semibold text-slate-600">Enter</kbd> to send
              <span className="text-slate-300">·</span>
              <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-semibold text-slate-600">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-semibold text-slate-600">Enter</kbd> for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
