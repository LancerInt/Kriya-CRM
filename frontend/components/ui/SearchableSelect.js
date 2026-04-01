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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}{required && " *"}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm border rounded-lg transition-all duration-150
          ${open ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-300 hover:border-gray-400"}
          ${disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "bg-white cursor-pointer"}
        `}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.color && (
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${selected.color}`} />
          )}
          {selected?.icon && <span className="text-base flex-shrink-0">{selected.icon}</span>}
          <span className={selected ? "text-gray-900" : "text-gray-400"}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search */}
          {isSearchable && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
              </div>
            </div>
          )}

          {/* Options list */}
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1" role="listbox">
            {/* Empty option */}
            {placeholder && (
              <div
                onClick={() => handleSelect("")}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                  !value ? "bg-indigo-50 text-indigo-700" : "text-gray-400 hover:bg-gray-50"
                }`}
              >
                {placeholder}
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">No results found</div>
            ) : (
              filtered.map((option, idx) => {
                const isSelected = String(option.value) === String(value);
                const isHighlighted = idx === highlightIdx;
                return (
                  <div
                    key={`${option.value}-${idx}`}
                    onClick={() => handleSelect(option.value)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : isHighlighted
                        ? "bg-gray-100"
                        : "hover:bg-gray-50"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {option.color && (
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${option.color}`} />
                    )}
                    {option.icon && <span className="text-base flex-shrink-0">{option.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.subtitle && (
                        <span className="block text-xs text-gray-400 truncate">{option.subtitle}</span>
                      )}
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
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
