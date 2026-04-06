"use client";
import { useState, useRef, useEffect } from "react";
import api from "@/lib/axios";

/**
 * Gmail-style email chips input with autocomplete.
 * Suggests from contacts, users, and previously used emails.
 */
export default function EmailChips({ value, onChange, placeholder }) {
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [allEmails, setAllEmails] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);

  const emails = (value || "").split(",").map(e => e.trim()).filter(Boolean);

  const colors = [
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-green-100 text-green-800 border-green-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-amber-100 text-amber-800 border-amber-200",
    "bg-pink-100 text-pink-800 border-pink-200",
    "bg-cyan-100 text-cyan-800 border-cyan-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200",
  ];

  // Load all known emails on mount (users + contacts + previously typed)
  useEffect(() => {
    const fetchEmails = async () => {
      const known = new Map();
      // Load previously typed emails from localStorage
      try {
        const saved = JSON.parse(localStorage.getItem("crm_cc_emails") || "[]");
        saved.forEach(em => { if (em.email) known.set(em.email.toLowerCase(), { email: em.email, name: em.name || em.email.split("@")[0], type: "recent" }); });
      } catch {}
      try {
        const users = await api.get("/auth/users/");
        (users.data.results || users.data).forEach(u => { if (u.email) known.set(u.email.toLowerCase(), { email: u.email, name: u.full_name || u.username, type: "user" }); });
      } catch {}
      try {
        const contacts = await api.get("/clients/contacts/");
        (contacts.data.results || contacts.data).forEach(c => { if (c.email) known.set(c.email.toLowerCase(), { email: c.email, name: c.name, type: "contact" }); });
      } catch {}
      setAllEmails([...known.values()]);
    };
    fetchEmails();
  }, []);

  // Save new emails to localStorage for future suggestions
  const saveToRecent = (email) => {
    try {
      const saved = JSON.parse(localStorage.getItem("crm_cc_emails") || "[]");
      if (!saved.some(e => e.email.toLowerCase() === email.toLowerCase())) {
        saved.push({ email, name: email.split("@")[0] });
        localStorage.setItem("crm_cc_emails", JSON.stringify(saved.slice(-100))); // keep last 100
        // Also add to current suggestions pool
        setAllEmails(prev => {
          if (prev.some(e => e.email.toLowerCase() === email.toLowerCase())) return prev;
          return [...prev, { email, name: email.split("@")[0], type: "recent" }];
        });
      }
    } catch {}
  };

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputVal.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = inputVal.toLowerCase();
    const currentEmails = (value || "").split(",").map(e => e.trim()).filter(Boolean);
    const filtered = allEmails.filter(e =>
      (e.email.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) &&
      !currentEmails.includes(e.email)
    ).slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setSelectedIdx(-1);
  }, [inputVal, allEmails, value]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const addEmail = (email) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (emails.includes(trimmed)) return;
    const updated = [...emails, trimmed].join(", ");
    onChange(updated);
    setInputVal("");
    setShowSuggestions(false);
    if (isValid(trimmed)) saveToRecent(trimmed);
  };

  const removeEmail = (idx) => {
    const updated = emails.filter((_, i) => i !== idx).join(", ");
    onChange(updated);
  };

  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); addEmail(suggestions[selectedIdx].email); return; }
    }
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (inputVal.trim()) addEmail(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const pasted = text.split(/[,;\n\s]+/).filter(Boolean);
    const newEmails = [...emails, ...pasted.filter(em => !emails.includes(em.trim()))];
    onChange(newEmails.join(", "));
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-gray-300 rounded-lg min-h-[38px] cursor-text focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent bg-white"
        onClick={() => inputRef.current?.focus()}
      >
        {emails.map((email, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isValid(email) ? colors[i % colors.length] : "bg-red-100 text-red-800 border-red-200"
            }`}
          >
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(i); }}
              className="ml-0.5 hover:text-red-600 text-current opacity-60 hover:opacity-100"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => { if (inputVal.trim() && suggestions.length > 0) setShowSuggestions(true); }}
          onBlur={() => { setTimeout(() => { if (inputVal.trim() && !showSuggestions) addEmail(inputVal); }, 200); }}
          placeholder={emails.length === 0 ? (placeholder || "Add email...") : ""}
          className="flex-1 min-w-[120px] border-0 outline-none text-sm bg-transparent py-0.5"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addEmail(s.email); }}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-indigo-50 ${
                i === selectedIdx ? "bg-indigo-50" : ""
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                s.type === "user" ? "bg-indigo-500" : s.type === "contact" ? "bg-green-500" : "bg-gray-400"
              }`}>
                {(s.name || s.email)[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <p className="text-xs text-gray-400 truncate">{s.email}</p>
              </div>
              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                s.type === "user" ? "bg-indigo-50 text-indigo-600" : s.type === "contact" ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-500"
              }`}>
                {s.type === "user" ? "Team" : s.type === "contact" ? "Contact" : "Recent"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
