"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const THINKING_MSGS = ["Analyzing data...", "Generating insights...", "Building summary...", "Almost ready..."];

function MarkdownBlock({ text }) {
  const lines = (text || "").split("\n");
  return (
    <div className="prose prose-sm max-w-none text-sm">
      {lines.map((line, i) => {
        line = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        line = line.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-xs">$1</code>');
        if (line.startsWith("### ")) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(4) }} />;
        if (line.startsWith("## ")) return <h3 key={i} className="font-semibold text-base mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(3) }} />;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
        const numMatch = line.match(/^(\d+)\.\s(.*)/);
        if (numMatch) return <li key={i} className="ml-4 list-decimal" dangerouslySetInnerHTML={{ __html: numMatch[2] }} />;
        if (!line.trim()) return <br key={i} />;
        return <p key={i} dangerouslySetInnerHTML={{ __html: line }} />;
      })}
    </div>
  );
}

export default function AISummaryButton({ prompt, title = "AI Summary", size = "sm", variant = "icon" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);

  const handleClick = async () => {
    setOpen(true);
    setLoading(true);
    setSummary("");
    setMsgIdx(0);

    const interval = setInterval(() => setMsgIdx((p) => (p + 1) % THINKING_MSGS.length), 1500);

    try {
      const res = await api.post("/agents/quick-chat/", { message: prompt });
      setSummary(res.data.content);
    } catch (err) {
      setSummary(err.response?.data?.error || "Failed to generate summary. Make sure AI is configured in Settings.");
    } finally {
      setLoading(false);
      clearInterval(interval);
    }
  };

  if (variant === "button") {
    return (
      <>
        <button onClick={handleClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          AI Summary
        </button>
        <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">
          {loading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="relative w-5 h-5"><div className="absolute inset-0 rounded-full border-2 border-purple-200" /><div className="absolute inset-0 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" /></div>
              <span className="text-sm text-gray-500 animate-pulse">{THINKING_MSGS[msgIdx]}</span>
            </div>
          ) : (
            <div>
              <MarkdownBlock text={summary} />
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                <button onClick={() => { navigator.clipboard.writeText(summary); toast.success("Copied!"); }} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Copy</button>
                <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Close</button>
              </div>
            </div>
          )}
        </Modal>
      </>
    );
  }

  // Icon variant (default)
  return (
    <>
      <button onClick={handleClick} className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors" title="AI Summary">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="lg">
        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="relative w-5 h-5"><div className="absolute inset-0 rounded-full border-2 border-purple-200" /><div className="absolute inset-0 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" /></div>
            <span className="text-sm text-gray-500 animate-pulse">{THINKING_MSGS[msgIdx]}</span>
          </div>
        ) : (
          <div>
            <MarkdownBlock text={summary} />
            <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
              <button onClick={() => { navigator.clipboard.writeText(summary); toast.success("Copied!"); }} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Copy</button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
