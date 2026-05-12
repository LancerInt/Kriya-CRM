"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const THINKING_MSGS = ["Analyzing data...", "Generating insights...", "Building summary...", "Almost ready..."];

// Visual theme picker — matches a section's title to an icon, accent color,
// and card background so the AI summary scans like a designed dashboard
// instead of plain markdown.
function _sectionTheme(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("overview") || t.includes("summary")) {
    return { icon: "📊", iconBg: "bg-indigo-100 text-indigo-700", border: "border-indigo-100", header: "text-indigo-900", bullet: "bg-indigo-400" };
  }
  if (t.includes("pending") || t.includes("awaiting") || t.includes("reply") || t.includes("replies")) {
    return { icon: "⏳", iconBg: "bg-amber-100 text-amber-700", border: "border-amber-100", header: "text-amber-900", bullet: "bg-amber-400" };
  }
  if (t.includes("attention") || t.includes("urgent") || t.includes("risk") || t.includes("delayed") || t.includes("overdue") || t.includes("stuck") || t.includes("blocker")) {
    return { icon: "⚠️", iconBg: "bg-rose-100 text-rose-700", border: "border-rose-100", header: "text-rose-900", bullet: "bg-rose-400" };
  }
  if (t.includes("client")) {
    return { icon: "🏢", iconBg: "bg-violet-100 text-violet-700", border: "border-violet-100", header: "text-violet-900", bullet: "bg-violet-400" };
  }
  if (t.includes("revenue") || t.includes("payment") || t.includes("receivable") || t.includes("finance") || t.includes("invoice")) {
    return { icon: "💰", iconBg: "bg-emerald-100 text-emerald-700", border: "border-emerald-100", header: "text-emerald-900", bullet: "bg-emerald-400" };
  }
  if (t.includes("notable") || t.includes("highlight")) {
    return { icon: "✨", iconBg: "bg-sky-100 text-sky-700", border: "border-sky-100", header: "text-sky-900", bullet: "bg-sky-400" };
  }
  if (t.includes("transit") || t.includes("motion") || t.includes("dispatch") || t.includes("upcoming") || t.includes("shipment")) {
    return { icon: "🚚", iconBg: "bg-blue-100 text-blue-700", border: "border-blue-100", header: "text-blue-900", bullet: "bg-blue-400" };
  }
  if (t.includes("workload") || t.includes("team") || t.includes("owner")) {
    return { icon: "👥", iconBg: "bg-fuchsia-100 text-fuchsia-700", border: "border-fuchsia-100", header: "text-fuchsia-900", bullet: "bg-fuchsia-400" };
  }
  if (t.includes("firc")) {
    return { icon: "🧾", iconBg: "bg-teal-100 text-teal-700", border: "border-teal-100", header: "text-teal-900", bullet: "bg-teal-400" };
  }
  // Default neutral
  return { icon: "📌", iconBg: "bg-gray-100 text-gray-600", border: "border-gray-200", header: "text-gray-900", bullet: "bg-gray-400" };
}

function MarkdownBlock({ text }) {
  if (!text) return null;

  // Parse into sections: split by ## headings; ### becomes a Next-Steps-style
  // sub block — we promote it to its own section so the rendering stays uniform.
  const sections = [];
  let currentSection = null;

  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(3).trim(), level: 2, lines: [] };
    } else if (line.startsWith("### ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(4).trim(), level: 3, lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      if (!sections._intro) sections._intro = [];
      sections._intro.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  const renderInline = (s) => s
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/`(.*?)`/g, '<code class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[11px] font-medium">$1</code>');

  const renderLine = (line, i, theme) => {
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <li key={i} className="flex items-start gap-2.5 py-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${theme.bullet} mt-2 flex-shrink-0`} />
          <span className="text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
        </li>
      );
    }
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return (
        <li key={i} className="flex items-start gap-3 py-1">
          <span className={`w-6 h-6 rounded-full ${theme.iconBg} text-xs font-bold flex items-center justify-center flex-shrink-0`}>{numMatch[1]}</span>
          <span className="text-gray-700 leading-relaxed pt-0.5" dangerouslySetInnerHTML={{ __html: renderInline(numMatch[2]) }} />
        </li>
      );
    }
    if (!line.trim()) return null;
    return <p key={i} className="text-gray-700 leading-relaxed py-0.5" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
  };

  // If no sections found, render as simple text
  if (sections.length === 0) {
    const theme = _sectionTheme("");
    return <div className="text-sm space-y-1">{lines.map((l, i) => renderLine(l, i, theme)).filter(Boolean)}</div>;
  }

  return (
    <div className="space-y-3">
      {/* Intro lines before first section */}
      {sections._intro && sections._intro.length > 0 && (
        <div className="text-sm text-gray-600 px-1">
          {sections._intro.map((l, i) => renderLine(l, i, _sectionTheme(""))).filter(Boolean)}
        </div>
      )}

      {sections.map((section, si) => {
        const theme = _sectionTheme(section.title);
        const isNextSteps = section.level === 3 || /next\s*step|recommendation|action/i.test(section.title);
        return (
          <div
            key={si}
            className={`rounded-xl border ${theme.border} bg-white shadow-sm overflow-hidden ${
              isNextSteps ? "ring-1 ring-indigo-200 bg-gradient-to-br from-indigo-50/60 to-violet-50/40" : ""
            }`}
          >
            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
              <span className={`w-7 h-7 rounded-lg ${theme.iconBg} flex items-center justify-center text-sm`}>
                {isNextSteps ? "💡" : theme.icon}
              </span>
              <h3 className={`font-semibold text-[13px] tracking-tight ${theme.header}`}>{section.title}</h3>
            </div>
            <div className="px-4 pb-4 text-[13px] space-y-0.5">
              {section.lines.filter((l) => l.trim()).length > 0 ? (
                section.lines.map((l, i) => renderLine(l, i, theme)).filter(Boolean)
              ) : (
                <p className="text-gray-400 italic text-xs">No items.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AISummaryButton({ prompt, title = "AI Summary", size = "sm", variant = "icon", clientContext = "", clientId = "" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [messages, setMessages] = useState([]); // { role: 'user'|'ai', text }
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const handleClick = async () => {
    setOpen(true);
    setLoading(true);
    setSummary("");
    setMessages([]);
    setMsgIdx(0);

    const interval = setInterval(() => setMsgIdx((p) => (p + 1) % THINKING_MSGS.length), 1500);

    try {
      const res = await api.post("/agents/quick-chat/", { message: prompt, client_id: clientId || "" }, { timeout: 120000 });
      setSummary(res.data.content);
    } catch (err) {
      setSummary(err.response?.data?.error || (err.code === "ECONNABORTED" ? "Request timed out. AI is taking too long. Please try again." : "Connection error. Check your AI settings or try again."));
    } finally {
      setLoading(false);
      clearInterval(interval);
    }
  };

  const handleAsk = async (e) => {
    e?.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setQuestion("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setAsking(true);
    try {
      const context = clientContext ? `Context: This question is about the client. ${clientContext}\n\nPrevious summary:\n${summary}\n\n` : `Previous summary:\n${summary}\n\n`;
      const res = await api.post("/agents/quick-chat/", { message: q, client_id: clientId || "" }, { timeout: 120000 });
      setMessages(prev => [...prev, { role: "ai", text: res.data.content }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Failed to get answer. Please try again." }]);
    } finally { setAsking(false); }
  };

  const modalContent = loading ? (
    <div className="py-12 flex flex-col items-center justify-center gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-purple-100" />
        <div className="absolute inset-0 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-lg">✨</div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-800">{THINKING_MSGS[msgIdx]}</p>
        <p className="text-xs text-gray-400 mt-1">Reading the latest data and writing a summary…</p>
      </div>
    </div>
  ) : (
    <div className="-mx-1">
      <div className="max-h-[60vh] overflow-y-auto pr-2 pl-1 -mr-2">
        <MarkdownBlock text={summary} />

        {/* Follow-up conversation */}
        {messages.length > 0 && (
          <div className="mt-5 pt-4 border-t border-dashed border-gray-200 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-tr-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
                }`}>
                  {msg.role === "ai" ? <MarkdownBlock text={msg.text} /> : msg.text}
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-3.5 py-2 text-sm text-gray-500 flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  Thinking…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask question input */}
      <form onSubmit={handleAsk} className="mt-4 flex gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">💬</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a follow-up question…"
            disabled={asking}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none disabled:opacity-50 transition-colors"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          />
        </div>
        <button type="submit" disabled={asking || !question.trim()} className="px-4 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow-md disabled:opacity-40 disabled:shadow-none transition-all">
          Ask
        </button>
      </form>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Generated from live CRM data
        </span>
        <div className="flex gap-2">
          <button onClick={() => { navigator.clipboard.writeText(summary); toast.success("Copied!"); }} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">📋 Copy</button>
          <button onClick={() => setOpen(false)} className="px-4 py-1.5 text-xs font-medium text-white bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg shadow-sm hover:shadow transition-all">Close</button>
        </div>
      </div>
    </div>
  );

  if (variant === "button") {
    return (
      <>
        <button onClick={handleClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          AI Summary
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">{modalContent}</Modal>
      </>
    );
  }

  // "gradient" variant — designed for list/index pages with white or light
  // backgrounds. A polished indigo→violet→fuchsia gradient pill with a
  // sparkle icon, soft shadow, and a subtle scale-up on hover.
  if (variant === "gradient") {
    return (
      <>
        <button
          onClick={handleClick}
          className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-700 hover:via-violet-700 hover:to-fuchsia-700 text-white text-sm font-bold shadow-md hover:shadow-xl ring-1 ring-white/20 transition-all hover:scale-[1.02]"
        >
          {/* Soft glow on hover */}
          <span className="absolute -inset-1 rounded-xl bg-gradient-to-r from-indigo-400/40 via-violet-400/40 to-fuchsia-400/40 blur-md opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
          <span className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 backdrop-blur ring-1 ring-white/40">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </span>
          <span className="tracking-tight">AI Summary</span>
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">{modalContent}</Modal>
      </>
    );
  }

  // "hero" variant — designed to sit on a coloured gradient banner. A
  // glassy white pill with a sparkle icon, subtle border + shadow, and a
  // soft glow on hover. Reads cleanly on purple/indigo/violet backdrops.
  if (variant === "hero") {
    return (
      <>
        <button
          onClick={handleClick}
          className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-indigo-700 hover:text-violet-700 text-sm font-bold shadow-lg ring-1 ring-white/40 backdrop-blur transition-all hover:shadow-xl hover:scale-[1.02]"
        >
          {/* Soft outer glow */}
          <span className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-fuchsia-300/40 via-violet-300/40 to-indigo-300/40 blur opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
          {/* Sparkle icon */}
          <span className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-sm">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </span>
          <span className="tracking-tight">AI Summary</span>
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">{modalContent}</Modal>
      </>
    );
  }

  return (
    <>
      <button onClick={handleClick} className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors" title="AI Summary">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">{modalContent}</Modal>
    </>
  );
}
