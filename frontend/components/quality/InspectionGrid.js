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
  const headerCls = passed
    ? "bg-emerald-50 border-emerald-200"
    : failed
      ? "bg-red-50 border-red-200"
      : "bg-gray-50 border-gray-200";
  const pillCls = passed
    ? "bg-emerald-600 text-white"
    : failed
      ? "bg-red-600 text-white"
      : "bg-gray-500 text-white";
  const media = inspection.media || [];
  return (
    <div className={`rounded-xl border ${headerCls} p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">
              {inspection.order_number || inspection.shipment_number || "—"}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${pillCls}`}>
              {passed ? "✓ Passed" : failed ? "✗ Failed" : (inspection.status || "Pending")}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 truncate">{inspection.client_name || "—"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-gray-500 capitalize">{(inspection.inspection_type || "").replace(/_/g, " ") || "—"}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {inspection.created_at ? new Date(inspection.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : ""}
          </p>
        </div>
      </div>
      {media.length === 0 ? (
        <p className="text-xs italic text-gray-400">No media attached.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {media.map((m, idx) => {
            const kind = classifyMedia(m.file);
            const url = mediaUrl(m.file);
            return (
              <button
                key={m.id}
                onClick={() => onOpenViewer(inspection, idx)}
                className="group relative aspect-square rounded-lg overflow-hidden bg-white border border-gray-200 hover:border-indigo-400 transition"
                title={`Open ${kind}`}
              >
                {kind === "image" ? (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-2xl bg-gray-50">
                    <MediaIcon kind={kind} />
                    <span className="text-[10px] text-gray-500 uppercase mt-1">{kind}</span>
                  </div>
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-gray-500 mt-1">
        {media.length} {media.length === 1 ? "file" : "files"}
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
