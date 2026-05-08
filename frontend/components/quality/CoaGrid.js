"use client";
import { mediaUrl, classifyMedia } from "./InspectionGrid";

function ScopeBadge({ coaType }) {
  const TONES = {
    client:   { bg: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Client" },
    logistic: { bg: "bg-amber-100 text-amber-700 border-amber-200",       label: "Logistic" },
  };
  const t = TONES[coaType] || { bg: "bg-blue-100 text-blue-700 border-blue-200", label: "Shared" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${t.bg}`}>
      {t.label}
    </span>
  );
}

function CoaCard({ coa, onOpen }) {
  const url = mediaUrl(coa.file);
  const kind = classifyMedia(coa.file);
  const filename = (coa.name || coa.file || "").split("/").pop();
  const date = coa.created_at ? new Date(coa.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  // Preview-area tone by file kind for non-image fallbacks.
  const PREVIEW_TONE = {
    pdf:   { bg: "from-rose-50 to-pink-50",   text: "text-rose-600",  icon: "📄", label: "PDF" },
    audio: { bg: "from-violet-50 to-fuchsia-50", text: "text-violet-600", icon: "🎵", label: "Audio" },
    video: { bg: "from-blue-50 to-cyan-50",   text: "text-blue-600",  icon: "🎬", label: "Video" },
    file:  { bg: "from-gray-50 to-slate-100", text: "text-gray-600",  icon: "📎", label: kind.toUpperCase() },
  };
  const pt = PREVIEW_TONE[kind] || PREVIEW_TONE.file;

  return (
    <button
      onClick={() => onOpen(coa)}
      className="group text-left rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col shadow-sm"
    >
      {/* Preview area */}
      <div className={`aspect-[4/3] flex items-center justify-center border-b border-gray-100 relative overflow-hidden ${kind === "image" ? "bg-gray-50" : `bg-gradient-to-br ${pt.bg}`}`}>
        {kind === "image" ? (
          <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className={`flex flex-col items-center gap-2 ${pt.text}`}>
            <span className="text-5xl">{pt.icon}</span>
            <span className="text-[10px] uppercase tracking-widest font-bold">{pt.label}</span>
          </div>
        )}
        {/* Scope chip pinned to top-right of preview */}
        <div className="absolute top-2.5 right-2.5">
          <ScopeBadge coaType={coa.coa_type} />
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm text-gray-900 truncate tracking-tight">
            {coa.order_number || coa.shipment_number || "—"}
          </span>
          {date && <span className="text-[10px] text-gray-400 shrink-0">{date}</span>}
        </div>
        <div className="text-xs font-medium text-gray-700 truncate">{coa.client_name || "—"}</div>
        <div className="text-[11px] text-gray-400 truncate flex items-center gap-1" title={filename}>
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{filename}</span>
        </div>
      </div>
    </button>
  );
}

export default function CoaGrid({ coas, onOpen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {coas.map((coa) => (
        <CoaCard key={coa.id} coa={coa} onOpen={onOpen} />
      ))}
    </div>
  );
}
