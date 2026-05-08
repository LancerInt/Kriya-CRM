"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Modern searchable dropdown replacement for native <select>.
 *
 * Props:
 *  - value: current selected value
 *  - onChange: (value) => void
 *  - options: [{ value, label, icon?, subtitle?, color? }]
 *  - placeholder: placeholder text
 *  - label: field label (optional)
 *  - required: boolean
 *  - disabled: boolean
 *  - searchable: boolean (default true if > 6 options)
 *  - className: additional wrapper class
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  label,
  required,
  disabled,
  searchable,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isSearchable = searchable !== undefined ? searchable : options.length > 6;

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open && isSearchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, isSearchable]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIdx];
      if (item) item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  const handleSelect = useCallback((val) => {
    onChange(val);
    setOpen(false);
    setSearch("");
    setHighlightIdx(-1);
  }, [onChange]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIdx >= 0 && filtered[highlightIdx]) {
      e.preventDefault();
      handleSelect(filtered[highlightIdx].value);
    }
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {label && (
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          {label}{required && <span className="text-rose-500"> *</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm rounded-xl transition-all duration-150 ring-1
          ${open ? "ring-indigo-400 ring-2 bg-white shadow-sm" : "ring-slate-200 hover:ring-slate-300"}
          ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : open ? "bg-white" : "bg-slate-50 hover:bg-white cursor-pointer"}
        `}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.color && (
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm ${selected.color}`} />
          )}
          {selected?.icon && <span className="text-base flex-shrink-0">{selected.icon}</span>}
          <span className={selected ? "text-slate-800 font-semibold" : "text-slate-400 font-medium"}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <svg className={`w-4 h-4 transition-all duration-200 flex-shrink-0 ${open ? "rotate-180 text-indigo-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-2xl shadow-xl ring-1 ring-slate-200/40 overflow-hidden"
          style={{ animation: "ss-fade 0.12s ease-out" }}
        >
          <style>{`@keyframes ss-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Search */}
          {isSearchable && (
            <div className="p-2 border-b border-slate-100 bg-gradient-to-br from-slate-50/40 to-white">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1.5 px-1" role="listbox">
            {/* Empty option */}
            {placeholder && (
              <div
                onClick={() => handleSelect("")}
                className={`px-3 py-2 mx-0.5 rounded-lg text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                  !value
                    ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 font-bold ring-1 ring-indigo-200/60"
                    : "text-slate-400 hover:bg-slate-50 font-medium"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-2 ring-white" />
                <span className="flex-1">{placeholder}</span>
                {!value && (
                  <span className="ml-auto w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  </span>
                )}
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-sm text-slate-400 text-center font-medium">
                <p className="text-2xl mb-1">🔍</p>
                No results found
              </div>
            ) : (
              filtered.map((option, idx) => {
                const isSelected = String(option.value) === String(value);
                const isHighlighted = idx === highlightIdx;
                return (
                  <div
                    key={`${option.value}-${idx}`}
                    onClick={() => handleSelect(option.value)}
                    className={`px-3 py-2 mx-0.5 rounded-lg text-sm cursor-pointer flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 font-bold ring-1 ring-indigo-200/60"
                        : isHighlighted
                        ? "bg-slate-100 font-semibold text-slate-800"
                        : "hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {option.color && (
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm ${option.color}`} />
                    )}
                    {option.icon && <span className="text-base flex-shrink-0">{option.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.subtitle && (
                        <span className={`block text-[11px] font-medium truncate ${isSelected ? "text-indigo-500" : "text-slate-400"}`}>{option.subtitle}</span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="ml-auto w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm shrink-0">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
