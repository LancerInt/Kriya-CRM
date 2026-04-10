"use client";
import { useState, useEffect } from "react";

/**
 * In-app PDF viewer modal — replaces window.open("", "_blank") with an
 * embedded iframe overlay, matching the Documents page's file preview UX.
 *
 * Usage:
 *   const [pdfUrl, setPdfUrl] = useState(null);
 *   <PdfViewer url={pdfUrl} title="Quotation" onClose={() => setPdfUrl(null)} />
 */
export default function PdfViewer({ url, title, onClose }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!url) return;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [url, onClose]);

  if (!url) return null;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = (title || "document") + ".pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" onClick={() => onClose?.()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <p className="text-sm font-semibold text-gray-800">{title || "PDF Preview"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
              Download
            </button>
            <button onClick={() => onClose?.()} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* PDF iframe */}
        <div className="flex-1 overflow-auto bg-gray-50 min-h-[500px]">
          <iframe src={url} className="w-full h-[80vh] border-0" />
        </div>
      </div>
    </div>
  );
}
