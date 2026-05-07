"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { _setPromptListener, _clearPromptListener, _resolvePrompt } from "@/lib/prompt";

// Single mount point for in-app text-prompt dialogs (rename, etc.).
// Driven by `promptDialog()` from @/lib/prompt.
export default function PromptDialog() {
  const [opts, setOpts] = useState(null);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    _setPromptListener((o) => {
      setOpts(o);
      setValue(o?.defaultValue ?? "");
    });
    return () => _clearPromptListener();
  }, []);

  useEffect(() => {
    if (opts && inputRef.current) {
      // Defer focus so the input exists in the DOM.
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [opts]);

  const finish = (str) => {
    _resolvePrompt(str);
    setOpts(null);
    setValue("");
  };

  if (!opts) return null;

  const {
    title = "Enter value",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    placeholder = "",
  } = opts;

  return (
    <Modal open={true} onClose={() => finish(null)} title={title} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish((value ?? "").toString());
        }}
        className="space-y-4"
      >
        {message && <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => finish(null)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
          >
            {confirmText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
