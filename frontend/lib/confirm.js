// In-app confirmation dialog (replaces window.confirm).
//
// Usage:
//   import { confirmDialog } from "@/lib/confirm";
//   if (await confirmDialog("Delete this?")) { ... }
//   if (await confirmDialog({ title: "Warning", message: "...", danger: true })) ...
//
// A single <ConfirmDialog /> component (mounted in AppShell) subscribes
// to this module and renders the prompt. Calls before mount fall back
// to window.confirm so nothing breaks during early page loads.

let listener = null;
let pending = null;

export function _setConfirmListener(fn) {
  listener = fn;
}

export function _clearConfirmListener() {
  listener = null;
  if (pending) {
    pending.resolve(false);
    pending = null;
  }
}

export function _resolveConfirm(value) {
  if (pending) {
    pending.resolve(!!value);
    pending = null;
  }
}

export function confirmDialog(messageOrOpts) {
  return new Promise((resolve) => {
    const opts = typeof messageOrOpts === "string"
      ? { message: messageOrOpts }
      : (messageOrOpts || {});
    if (!listener) {
      // Fallback during SSR / before mount — don't block UX, just confirm.
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        resolve(window.confirm(opts.message || "Are you sure?"));
      } else {
        resolve(true);
      }
      return;
    }
    pending = { resolve };
    listener(opts);
  });
}
