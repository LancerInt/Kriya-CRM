"use client";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

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
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <span className="text-sm text-gray-500">{THINKING_MESSAGES[idx]}</span>
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
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
        <span className="text-2xl">✦</span>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Hey {firstName} 👋</h2>
      <p className="text-gray-500 text-sm mb-8 text-center max-w-sm">
        {isExec
          ? "I can help you stay on top of your accounts, tasks, orders, and more."
          : "I have full access to your CRM. Ask me about the team, pipeline, clients, or anything else."}
      </p>

      {/* Suggested questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full max-w-2xl">
        {questions.map(({ icon, label, q }, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-left hover:border-indigo-300 hover:bg-indigo-50 transition-all group shadow-sm"
          >
            <span className="text-lg shrink-0">{icon}</span>
            <span className="text-sm text-gray-700 font-medium group-hover:text-indigo-700 transition-colors">{label}</span>
          </button>
        ))}
      </div>
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
    if (!confirm("Delete this message?")) return;
    try {
      await api.delete(`/agents/messages/${msgId}/`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      toast.error("Failed to delete message");
    }
  };

  const handleDeleteConv = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.delete(`/agents/conversations/${id}/`);
      if (activeConv?.id === id) { setActiveConv(null); setMessages([]); }
      loadConversations();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                activeConv?.id === conv.id
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-3.5 h-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="truncate">{conv.title}</span>
              </div>
              <button
                onClick={(e) => handleDeleteConv(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all shrink-0 ml-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {!loadingConvs && conversations.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">No conversations yet</p>
          )}
        </div>

        {/* User info at bottom */}
        {user && (
          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                {user.full_name?.[0] || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {messages.length === 0 && !sending && (
            <WelcomeScreen user={user} onSelect={handleSuggestion} />
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`group flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {/* AI avatar */}
              {msg.role !== "user" && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <span className="text-xs text-white font-bold">K</span>
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[75%]">
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
                }`}>
                  {msg.role === "user" ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
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
                  <span className="text-xs text-gray-400">
                    {msg.created_at ? format(new Date(msg.created_at), "h:mm a") : ""}
                  </span>
                  {msg.tool_calls?.length > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {msg.tool_calls.length} tool{msg.tool_calls.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Copy"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  {msg.role === "user" && (
                    <button
                      onClick={() => { setInput(msg.content); inputRef.current?.focus(); }}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      title="Edit & resend"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  {msg.role === "user" && !msg.id?.startsWith?.("temp-") && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Delete message"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* User avatar */}
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-1 font-bold text-xs">
                  {user?.full_name?.[0] || "U"}
                </div>
              )}
            </div>
          ))}

          {sending && messages[messages.length - 1]?.role !== "assistant" && <ThinkingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <form onSubmit={handleSend} className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask Kriya AI anything about your CRM…"
              disabled={sending}
              rows={1}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50 resize-none text-sm leading-relaxed bg-gray-50 focus:bg-white transition-colors"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-40 shrink-0 transition-colors flex items-center gap-2"
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
              <span className="text-sm">{sending ? "Thinking" : "Send"}</span>
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-2">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
