"use client";
import { useEffect, useState } from "react";

const BACKEND = "http://localhost:8000";

export function mediaUrl(file) {
  if (!file) return "";
  return file.startsWith("http") ? file : BACKEND + file;
}

export function classifyMedia(file) {
  const f = (file || "").toLowerCase();
  // Unambiguous audio first — voice recordings are common in inspection
  // notes and several formats (m4a, opus, amr) won't even render as video.
  if (/\.(mp3|wav|m4a|aac|flac|opus|weba|amr|3gp|3gpp)$/.test(f)) return "audio";
  // Image
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/.test(f)) return "image";
  // Unambiguous video
  if (/\.(mp4|mov|m4v|avi|mkv|wmv|flv)$/.test(f)) return "video";
  if (/\.pdf$/.test(f)) return "pdf";
  // Ambiguous container formats (.webm, .ogg, .ogv) — guess by filename hints,
  // defaulting to audio because voice notes are far more common than video
  // clips uploaded into an inspection record.
  if (/\.(webm|ogg|ogv)$/.test(f)) {
    if (/(audio|voice|record|whatsapp|note)/.test(f)) return "audio";
    if (/video/.test(f)) return "video";
    return "audio";
  }
  return "file";
}

function MediaIcon({ kind }) {
  if (kind === "audio") return <span>🎵</span>;
  if (kind === "video") return <span>🎬</span>;
  if (kind === "pdf") return <span>📄</span>;
  return <span>📎</span>;
}

function InspectionCard({ inspection, onOpenViewer }) {
  const passed = inspection.status === "passed";
  const failed = inspection.status === "failed";
  const tone = passed
    ? { card: "border-emerald-100", stripe: "bg-emerald-500", chip: "bg-emerald-600 text-white", icon: "✓" }
    : failed
      ? { card: "border-rose-100", stripe: "bg-rose-500", chip: "bg-rose-600 text-white", icon: "✗" }
      : { card: "border-gray-200", stripe: "bg-gray-400", chip: "bg-gray-500 text-white", icon: "•" };
  const media = inspection.media || [];
  return (
    <div className={`relative bg-white rounded-2xl border ${tone.card} p-4 pl-5 shadow-sm hover:shadow-md transition-all`}>
      {/* Left status stripe */}
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.stripe}`} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 tracking-tight">
              {inspection.order_number || inspection.shipment_number || "—"}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${tone.chip}`}>
              {tone.icon} {passed ? "Passed" : failed ? "Failed" : (inspection.status || "Pending")}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <span className="font-medium text-gray-700 truncate">{inspection.client_name || "—"}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          {(inspection.inspection_type || "") && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">
              {(inspection.inspection_type || "").replace(/_/g, " ")}
            </span>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            {inspection.created_at ? new Date(inspection.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""}
          </p>
        </div>
      </div>

      {media.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-xs text-gray-400 italic">
          No media attached.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {media.map((m, idx) => {
            const kind = classifyMedia(m.file);
            const url = mediaUrl(m.file);
            return (
              <button
                key={m.id}
                onClick={() => onOpenViewer(inspection, idx)}
                className="group relative aspect-square rounded-lg overflow-hidden bg-gray-50 border border-gray-200 hover:border-indigo-400 hover:shadow-sm transition-all"
                title={`Open ${kind}`}
              >
                {kind === "image" ? (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                    <span className="text-2xl"><MediaIcon kind={kind} /></span>
                    <span className="text-[9px] text-gray-500 uppercase mt-1 tracking-wide font-semibold">{kind}</span>
                  </div>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition" />
                {/* Tiny kind label on image tiles */}
                {kind !== "image" && (
                  <span className="absolute top-1 right-1 text-[9px] font-semibold bg-white/90 text-gray-700 rounded px-1 py-0.5 shadow-sm">
                    {kind.toUpperCase()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
        <span className="text-[11px] text-gray-500">
          {media.length} {media.length === 1 ? "file" : "files"}
        </span>
        {media.length > 0 && (
          <button
            onClick={() => onOpenViewer(inspection, 0)}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Open viewer →
          </button>
        )}
      </div>
    </div>
  );
}

export default function InspectionGrid({ inspections, onOpenViewer }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {inspections.map((insp) => (
        <InspectionCard key={insp.id} inspection={insp} onOpenViewer={onOpenViewer} />
      ))}
    </div>
  );
}

export function MediaLightbox({ inspection, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const media = inspection?.media || [];
  useEffect(() => { setIdx(startIndex); }, [startIndex, inspection]);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(media.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [media.length, onClose]);

  if (!media.length) return null;
  const cur = media[idx];
  const url = mediaUrl(cur?.file);
  const kind = classifyMedia(cur?.file);
  const filename = (cur?.file || "").split("/").pop();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="text-white">
          <div className="text-sm font-semibold">{inspection.order_number || inspection.shipment_number || ""}</div>
          <div className="text-xs text-gray-300">
            {inspection.status === "passed" ? "Inspection Passed" : inspection.status === "failed" ? "Inspection Failed" : "Inspection"}
            {" · "}
            {idx + 1} of {media.length}
            {filename ? ` · ${filename}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} download className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded">Download</a>
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded">Close</button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 relative">
        {idx > 0 && (
          <button onClick={() => setIdx(idx - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center">‹</button>
        )}
        {idx < media.length - 1 && (
          <button onClick={() => setIdx(idx + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center">›</button>
        )}
        {kind === "image" && (
          <img src={url} alt="" className="max-w-[92vw] max-h-[80vh] object-contain rounded shadow-2xl" />
        )}
        {kind === "video" && (
          <video src={url} controls autoPlay className="max-w-[92vw] max-h-[80vh] rounded shadow-2xl" />
        )}
        {kind === "audio" && (
          <div className="bg-white rounded-xl p-6 w-[420px] max-w-[92vw] flex flex-col items-center gap-3">
            <div className="text-5xl">🎵</div>
            <div className="text-sm text-gray-700 truncate w-full text-center">{filename}</div>
            <audio src={url} controls autoPlay className="w-full" />
          </div>
        )}
        {kind === "pdf" && (
          <iframe src={url} className="w-[92vw] h-[80vh] bg-white rounded shadow-2xl" title={filename} />
        )}
        {kind === "file" && (
          <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-3">
            <div className="text-6xl">📎</div>
            <div className="text-sm text-gray-700">{filename}</div>
            <a href={url} download className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Download to view</a>
          </div>
        )}
      </div>
      {media.length > 1 && (
        <div className="border-t border-white/10 bg-black/40 p-3 overflow-x-auto">
          <div className="flex gap-2 justify-center">
            {media.map((m, i) => {
              const k = classifyMedia(m.file);
              const u = mediaUrl(m.file);
              const active = i === idx;
              return (
                <button
                  key={m.id}
                  onClick={() => setIdx(i)}
                  className={`shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition ${active ? "border-indigo-400" : "border-white/20 hover:border-white/40"}`}
                  title={`Open ${k}`}
                >
                  {k === "image" ? (
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white text-lg">
                      <MediaIcon kind={k} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
