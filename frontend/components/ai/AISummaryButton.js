"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const THINKING_MSGS = ["Analyzing data...", "Generating insights...", "Building summary...", "Almost ready..."];

function MarkdownBlock({ text }) {
  if (!text) return null;

  // Parse into sections: split by ## headings
  const sections = [];
  let currentSection = null;

  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.slice(3).trim(), subsections: [], lines: [] };
    } else if (line.startsWith("### ") && currentSection) {
      currentSection.subsections.push({ title: line.slice(4).trim(), lines: [] });
    } else if (currentSection) {
      const target = currentSection.subsections.length > 0
        ? currentSection.subsections[currentSection.subsections.length - 1].lines
        : currentSection.lines;
      target.push(line);
    } else {
      // Lines before any ## heading
      if (!sections._intro) sections._intro = [];
      sections._intro = sections._intro || [];
      sections._intro.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  const renderLine = (line, i) => {
    let html = line;
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-medium">$1</code>');
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <li key={i} className="ml-1 flex items-start gap-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" /><span dangerouslySetInnerHTML={{ __html: html.slice(2) }} /></li>;
    }
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return <li key={i} className="ml-1 flex items-start gap-2 py-0.5"><span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{numMatch[1]}</span><span dangerouslySetInnerHTML={{ __html: numMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900">$1</strong>') }} /></li>;
    }
    if (!line.trim()) return null;
    return <p key={i} className="text-gray-700 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const renderLines = (lines) => lines.map((l, i) => renderLine(l, i)).filter(Boolean);

  // If no sections found, render as simple text
  if (sections.length === 0) {
    return <div className="text-sm space-y-1">{renderLines(lines)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Intro lines before first section */}
      {sections._intro && sections._intro.length > 0 && (
        <div className="text-sm text-gray-600">{renderLines(sections._intro)}</div>
      )}

      {sections.map((section, si) => {
        const isActions = section.title.toLowerCase().includes("action") || section.title.toLowerCase().includes("recommendation");
        return (
          <div key={si} className={`rounded-lg border p-4 ${isActions ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
            <h3 className={`font-semibold text-sm mb-3 flex items-center gap-2 ${isActions ? "text-indigo-800" : "text-gray-800"}`}>
              {isActions && <span className="text-base">💡</span>}
              {section.title}
            </h3>

            {/* Direct lines under section */}
            {section.lines.filter(l => l.trim()).length > 0 && (
              <div className="text-sm space-y-0.5 mb-2">{renderLines(section.lines)}</div>
            )}

            {/* Subsections */}
            {section.subsections.map((sub, ssi) => (
              <div key={ssi} className={`${ssi > 0 ? "mt-3 pt-3 border-t border-gray-100" : ""}`}>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{sub.title}</h4>
                <div className="text-sm space-y-0.5">{renderLines(sub.lines)}</div>
              </div>
            ))}
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
    <div className="flex items-center gap-3 py-8 justify-center">
      <div className="relative w-5 h-5"><div className="absolute inset-0 rounded-full border-2 border-purple-200" /><div className="absolute inset-0 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" /></div>
      <span className="text-sm text-gray-500 animate-pulse">{THINKING_MSGS[msgIdx]}</span>
    </div>
  ) : (
    <div>
      <div className="max-h-[50vh] overflow-y-auto">
        <MarkdownBlock text={summary} />

        {/* Follow-up conversation */}
        {messages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}>
                  {msg.role === "ai" ? <MarkdownBlock text={msg.text} /> : msg.text}
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ask question input */}
      <form onSubmit={handleAsk} className="mt-4 pt-3 border-t border-gray-200 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a follow-up question about this client..."
          disabled={asking}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
        />
        <button type="submit" disabled={asking || !question.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40">
          Ask
        </button>
      </form>

      <div className="flex gap-2 mt-3">
        <button onClick={() => { navigator.clipboard.writeText(summary); toast.success("Copied!"); }} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Copy</button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Close</button>
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

  return (
    <>
      <button onClick={handleClick} className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors" title="AI Summary">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">{modalContent}</Modal>
    </>
  );
}
