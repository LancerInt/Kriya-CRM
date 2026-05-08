"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * Modern dropdown select — renders dropdown via portal so it's never clipped.
 */
export default function ModernSelect({ value, onChange, options = [], placeholder = "Select...", size = "sm" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownH = options.length * 40 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < dropdownH && rect.top > dropdownH;
    setPos({
      top: dropUp ? rect.top - dropdownH + window.scrollY : rect.bottom + 4 + window.scrollY,
      left: rect.left + window.scrollX,
      dropUp,
    });
  }, [options.length]);

  useEffect(() => {
    if (open) {
      updatePos();
      const handler = (e) => { if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", handler);
      window.addEventListener("scroll", updatePos, true);
      return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("scroll", updatePos, true); };
    }
  }, [open, updatePos]);

  const selected = options.find(o => o.value === value);
  const textSize = size === "xs" ? "text-xs" : size === "sm" ? "text-sm" : "text-base";
  const padCls = size === "xs" ? "px-2.5 py-1" : "px-3 py-1.5";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 ${padCls} rounded-xl bg-white ring-1 transition-all ${textSize} font-bold ${open ? "ring-indigo-400 shadow-sm" : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50"}`}
        style={{ color: selected?.color || "#475569" }}
      >
        {selected?.dot && (
          <span
            className="w-2 h-2 rounded-full ring-2 ring-white shadow-sm"
            style={{ background: selected.color || "#94a3b8", boxShadow: `0 0 0 2px ${selected.color}20` }}
          />
        )}
        {selected?.icon && <span>{selected.icon}</span>}
        <span className="tracking-tight">{selected?.label || placeholder}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180 text-indigo-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[9999] w-52 bg-white border border-slate-200 rounded-2xl shadow-xl ring-1 ring-slate-200/40 overflow-hidden"
          style={{
            top: pos.top, left: pos.left, position: "absolute",
            animation: "ms-fade 0.12s ease-out",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <style>{`@keyframes ms-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div className="py-1.5 max-h-72 overflow-y-auto">
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 mx-1 rounded-lg flex items-center gap-2.5 transition-all ${textSize} ${
                    isSelected
                      ? "bg-gradient-to-r from-indigo-50 to-violet-50 font-bold ring-1 ring-indigo-200/60"
                      : "hover:bg-slate-50 font-medium"
                  }`}
                  style={{ width: "calc(100% - 0.5rem)" }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                    style={{ background: opt.color || "#94a3b8" }}
                  />
                  <span style={{ color: isSelected ? "#4f46e5" : (opt.color || "#475569") }} className="flex-1 truncate">
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span className="ml-auto w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
