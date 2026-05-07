// In-app text-input prompt dialog (replaces window.prompt).
//
// Usage:
//   import { promptDialog } from "@/lib/prompt";
//   const next = await promptDialog({
//     title: "Rename file",
//     message: "Enter the new filename",
//     defaultValue: "old.pdf",
//     confirmText: "Rename",
//   });
//   if (next == null) return;  // user cancelled
//
// A single <PromptDialog /> component (mounted in AppShell) subscribes
// to this module. Calls before mount fall back to window.prompt so we
// never block during early SSR / hydration.

let listener = null;
let pending = null;

export function _setPromptListener(fn) {
  listener = fn;
}

export function _clearPromptListener() {
  listener = null;
  if (pending) {
    pending.resolve(null);
    pending = null;
  }
}

export function _resolvePrompt(value) {
  if (pending) {
    pending.resolve(value); // null on cancel, string on confirm
    pending = null;
  }
}

export function promptDialog(messageOrOpts) {
  return new Promise((resolve) => {
    const opts = typeof messageOrOpts === "string"
      ? { message: messageOrOpts }
      : (messageOrOpts || {});
    if (!listener) {
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        resolve(window.prompt(opts.message || opts.title || "", opts.defaultValue ?? ""));
      } else {
        resolve(null);
      }
      return;
    }
    pending = { resolve };
    listener(opts);
  });
}
