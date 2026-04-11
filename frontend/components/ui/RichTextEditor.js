"use client";
import dynamic from "next/dynamic";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/axios";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

/**
 * Gmail-style rich text editor with:
 * - Browser-native spellcheck (red squiggly underlines)
 * - AI-powered grammar/spelling check via "Check Grammar" button
 *   that highlights errors inline and shows suggestions on click
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = "200px" }) {
  const quillRef = useRef(null);
  const [checking, setChecking] = useState(false);
  const [corrections, setCorrections] = useState([]); // [{original, corrected, reason, index}]
  const [activeFix, setActiveFix] = useState(null); // index into corrections

  const modules = useMemo(() => ({
    toolbar: [
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ color: [] }, { background: [] }],
      ["link"],
      ["clean"],
    ],
  }), []);

  const formats = [
    "bold", "italic", "underline", "strike",
    "list", "color", "background", "link",
  ];

  // Enable browser spellcheck on the editor's contenteditable div
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = document.querySelector(".rich-editor-wrapper .ql-editor");
      if (el) {
        el.setAttribute("spellcheck", "true");
        el.setAttribute("lang", "en");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Strip HTML to plain text for the AI
  const stripHtml = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  };

  // AI grammar check
  const handleGrammarCheck = useCallback(async () => {
    const text = stripHtml(value);
    if (!text || text.length < 5) return;
    setChecking(true);
    setCorrections([]);
    setActiveFix(null);
    try {
      const res = await api.post("/communications/grammar-check/", { text });
      const fixes = res.data?.corrections || [];
      setCorrections(fixes);
      if (fixes.length === 0) {
        // No errors — briefly show a green checkmark
        setCorrections([{ original: "", corrected: "", reason: "No errors found! Your text looks great.", index: -1 }]);
        setTimeout(() => setCorrections([]), 3000);
      }
    } catch {
      // Silently fail — browser spellcheck still works
    } finally {
      setChecking(false);
    }
  }, [value]);

  // Apply a single correction
  const applySingleFix = (fix) => {
    if (!fix.original || !value) return;
    // Replace in the HTML, being careful with HTML tags
    const escaped = fix.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const newVal = value.replace(regex, fix.corrected);
    onChange(newVal);
    setCorrections((prev) => prev.filter((c) => c !== fix));
    setActiveFix(null);
  };

  // Apply all corrections at once
  const applyAll = () => {
    let newVal = value;
    for (const fix of corrections) {
      if (!fix.original) continue;
      const escaped = fix.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      newVal = newVal.replace(new RegExp(escaped, "gi"), fix.corrected);
    }
    onChange(newVal);
    setCorrections([]);
    setActiveFix(null);
  };

  const hasRealErrors = corrections.length > 0 && corrections[0].index !== -1;

  return (
    <div className="rich-editor-wrapper">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={(val) => { onChange(val); if (corrections.length > 0 && corrections[0].index !== -1) setCorrections([]); }}
        modules={modules}
        formats={formats}
        placeholder={placeholder || "Compose your email..."}
      />

      {/* Grammar check bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-t-0 border-gray-300 rounded-b-lg">
        <button
          onClick={handleGrammarCheck}
          disabled={checking}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-white border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-50"
          title="AI-powered spell check and grammar review"
        >
          {checking ? (
            <><span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" /> Checking...</>
          ) : (
            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Check Grammar</>
          )}
        </button>
        {corrections.length > 0 && corrections[0].index === -1 && (
          <span className="text-[11px] text-green-600 font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            {corrections[0].reason}
          </span>
        )}
        {hasRealErrors && (
          <>
            <span className="text-[11px] text-red-600 font-medium">{corrections.length} issue{corrections.length > 1 ? "s" : ""} found</span>
            <button onClick={applyAll} className="text-[11px] px-2 py-0.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700">Fix All</button>
          </>
        )}
      </div>

      {/* Corrections panel — shows inline below the editor */}
      {hasRealErrors && (
        <div className="border border-t-0 border-gray-300 rounded-b-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
          {corrections.map((fix, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 px-3 py-2 text-xs border-b border-gray-100 last:border-0 hover:bg-yellow-50/50 cursor-pointer transition-colors ${activeFix === i ? "bg-yellow-50" : ""}`}
              onClick={() => setActiveFix(activeFix === i ? null : i)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="line-through text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">{fix.original}</span>
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  <span className="text-green-700 font-medium bg-green-50 px-1.5 py-0.5 rounded">{fix.corrected}</span>
                </div>
                {fix.reason && <p className="text-gray-500 mt-0.5">{fix.reason}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); applySingleFix(fix); }}
                className="shrink-0 px-2 py-1 bg-green-600 text-white rounded font-medium hover:bg-green-700"
              >
                Fix
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        .rich-editor-wrapper .ql-container {
          min-height: ${minHeight};
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
        }
        .rich-editor-wrapper .ql-toolbar {
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          background: #f9fafb;
          border-color: #d1d5db;
        }
        .rich-editor-wrapper .ql-container {
          border-color: #d1d5db;
        }
        .rich-editor-wrapper .ql-editor {
          min-height: ${minHeight};
          line-height: 1.6;
        }
        .rich-editor-wrapper .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: normal;
        }
        .rich-editor-wrapper .ql-toolbar button:hover,
        .rich-editor-wrapper .ql-toolbar button.ql-active {
          color: #4f46e5;
        }
        .rich-editor-wrapper .ql-toolbar .ql-stroke {
          stroke: #6b7280;
        }
        .rich-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .rich-editor-wrapper .ql-toolbar button.ql-active .ql-stroke {
          stroke: #4f46e5;
        }
      `}</style>
    </div>
  );
}
