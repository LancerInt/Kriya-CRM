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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${textSize} font-medium`}
        style={{ color: selected?.color || "#374151" }}
      >
        {selected?.dot && <span className="w-2 h-2 rounded-full" style={{ background: selected.color || "#9ca3af" }} />}
        {selected?.icon && <span>{selected.icon}</span>}
        <span>{selected?.label || placeholder}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[9999] w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1"
          style={{ top: pos.top, left: pos.left, position: "absolute" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors ${textSize} ${value === opt.value ? "bg-indigo-50 font-semibold" : ""}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: opt.color || "#9ca3af" }} />
              <span style={{ color: opt.color || "#374151" }}>{opt.label}</span>
              {value === opt.value && <svg className="w-3.5 h-3.5 ml-auto text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
