"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

const THINKING_MESSAGES = [
  "Analyzing your request...",
  "Querying CRM database...",
  "Fetching relevant data...",
  "Processing client records...",
  "Crunching the numbers...",
  "Cross-referencing data...",
  "Building insights...",
  "Preparing your answer...",
  "Almost there...",
  "Generating response...",
];

function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 max-w-xs">
        <div className="flex items-center gap-3">
          <div className="relative w-5 h-5">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-200" />
            <div className="absolute inset-0 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          </div>
          <span className="text-sm text-gray-600 animate-pulse">{THINKING_MESSAGES[msgIndex]}</span>
        </div>
      </div>
    </div>
  );
}

function MarkdownContent({ content }) {
  // Simple markdown rendering for bold, lists, tables
  const lines = content.split("\n");
  return (
    <div className="prose prose-sm max-w-none">
      {lines.map((line, i) => {
        // Bold
        line = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        // Inline code
        line = line.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-xs">$1</code>');
        // Headers
        if (line.startsWith("### ")) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(4) }} />;
        if (line.startsWith("## ")) return <h3 key={i} className="font-semibold text-base mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(3) }} />;
        if (line.startsWith("# ")) return <h2 key={i} className="font-bold text-lg mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
        // Bullet lists
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-sm" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
        // Numbered lists
        const numMatch = line.match(/^(\d+)\.\s(.*)/);
        if (numMatch) return <li key={i} className="ml-4 text-sm list-decimal" dangerouslySetInnerHTML={{ __html: numMatch[2] }} />;
        // Empty line
        if (!line.trim()) return <br key={i} />;
        // Regular text
        return <p key={i} className="text-sm" dangerouslySetInnerHTML={{ __html: line }} />;
      })}
    </div>
  );
}

export default function AIPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef = useRef(null);

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
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load conversation")); }
  };

  const handleNewChat = async () => {
    try {
      const r = await api.post("/agents/conversations/", { title: "New Chat" });
      setActiveConv(r.data);
      setMessages([]);
      loadConversations();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create chat")); }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput("");

    if (!activeConv) {
      // Auto-create conversation
      try {
        const r = await api.post("/agents/conversations/", { title: "New Chat" });
        setActiveConv(r.data);
        loadConversations();
        await sendMessage(r.data.id, userMsg);
      } catch (err) { toast.error(getErrorMessage(err, "Failed to start chat")); }
    } else {
      await sendMessage(activeConv.id, userMsg);
    }
  };

  const sendMessage = async (convId, message) => {
    // Add user message immediately
    const tempUserMsg = { id: "temp-user", role: "user", content: message, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    try {
      const r = await api.post(`/agents/conversations/${convId}/chat/`, { message });
      setMessages((prev) => [...prev.filter((m) => m.id !== "temp-user"), { ...tempUserMsg, id: "user-" + Date.now() }, r.data.message]);
      loadConversations();
    } catch (err) {
      toast.error(err.response?.data?.error || "AI request failed");
      setMessages((prev) => prev.filter((m) => m.id !== "temp-user"));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConv = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.delete(`/agents/conversations/${id}/`);
      if (activeConv?.id === id) { setActiveConv(null); setMessages([]); }
      loadConversations();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const suggestedQuestions = [
    "What are my overdue tasks?",
    "Show me the pipeline summary",
    "Summarize recent client communications",
    "Which invoices are overdue?",
    "List all active orders",
    "Show shipments in transit",
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4">
      {/* Sidebar — conversations */}
      <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200">
          <button onClick={handleNewChat} className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm group ${
                activeConv?.id === conv.id ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <span className="truncate flex-1">{conv.title}</span>
              <button onClick={(e) => handleDeleteConv(conv.id, e)} className="opacity-0 group-hover:opacity-100 text-xs text-red-500 ml-2 shrink-0">x</button>
            </div>
          ))}
          {!loadingConvs && conversations.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Kriya AI</h2>
                <p className="text-gray-500">Ask me anything about your CRM data</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q); }}
                    className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 hover:border-indigo-300 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`group flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="flex flex-col gap-1 max-w-[75%]">
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-800"
                }`}>
                  {msg.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownContent content={msg.content} />
                  )}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-400">{msg.tool_calls.length} tool(s) used: {msg.tool_calls.map((t) => t.tool).join(", ")}</p>
                    </div>
                  )}
                </div>
                {/* Action buttons */}
                <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    title="Copy"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  {msg.role === "user" && (
                    <button
                      onClick={() => { setInput(msg.content); }}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      title="Edit & resend"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {sending && <ThinkingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <form onSubmit={handleSend} className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Kriya AI anything about your CRM..."
              disabled={sending}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 shrink-0"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
