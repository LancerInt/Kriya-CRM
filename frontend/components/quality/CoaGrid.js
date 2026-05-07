"use client";
import { mediaUrl, classifyMedia } from "./InspectionGrid";

function ScopeBadge({ coaType }) {
  if (coaType === "client") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-600 text-white">Client</span>;
  }
  if (coaType === "logistic") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-600 text-white">Logistic</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-600 text-white">Shared</span>;
}

function CoaCard({ coa, onOpen }) {
  const url = mediaUrl(coa.file);
  const kind = classifyMedia(coa.file);
  const filename = (coa.name || coa.file || "").split("/").pop();
  const date = coa.created_at ? new Date(coa.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

  return (
    <button
      onClick={() => onOpen(coa)}
      className="text-left rounded-xl border border-gray-200 bg-white hover:border-indigo-400 hover:shadow-md transition overflow-hidden flex flex-col"
    >
      {/* Preview area */}
      <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center border-b border-gray-100">
        {kind === "image" ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : kind === "pdf" ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <span className="text-5xl">📄</span>
            <span className="text-xs uppercase tracking-wide">PDF</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <span className="text-5xl">📎</span>
            <span className="text-xs uppercase tracking-wide">{kind}</span>
          </div>
        )}
      </div>
      {/* Footer */}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm text-gray-900 truncate">
            {coa.order_number || coa.shipment_number || "—"}
          </span>
          <ScopeBadge coaType={coa.coa_type} />
        </div>
        <div className="text-xs text-gray-600 truncate">{coa.client_name || "—"}</div>
        <div className="text-[11px] text-gray-400 truncate" title={filename}>{filename}</div>
        {date && <div className="text-[11px] text-gray-400">{date}</div>}
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
