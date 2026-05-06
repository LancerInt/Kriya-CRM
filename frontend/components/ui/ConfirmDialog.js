"use client";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { _setConfirmListener, _clearConfirmListener, _resolveConfirm } from "@/lib/confirm";

// Single mount point for in-app confirmation prompts. Driven by
// `confirmDialog()` from @/lib/confirm — every call site that used to
// invoke window.confirm now resolves through this component.
export default function ConfirmDialog() {
  const [opts, setOpts] = useState(null);

  useEffect(() => {
    _setConfirmListener((o) => setOpts(o));
    return () => _clearConfirmListener();
  }, []);

  const finish = (value) => {
    _resolveConfirm(value);
    setOpts(null);
  };

  if (!opts) return null;

  const {
    title = "Please confirm",
    message = "Are you sure?",
    confirmText = "OK",
    cancelText = "Cancel",
    danger = false,
  } = opts;

  return (
    <Modal open={true} onClose={() => finish(false)} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => finish(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => finish(true)}
            className={`px-4 py-2 text-white text-sm font-medium rounded-lg ${danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
