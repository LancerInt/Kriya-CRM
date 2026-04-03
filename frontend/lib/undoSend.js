"use client";
import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Full-screen preview overlay rendered via portal so it sits above everything.
 */
function MessagePreviewOverlay({ preview, onClose }) {
  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Message Preview</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta fields */}
        <div className="px-6 py-3 border-b border-gray-100 space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-400 w-12 shrink-0 pt-0.5">To</span>
            <span className="text-gray-800 font-medium break-all">{preview.to}</span>
          </div>
          {preview.cc && (
            <div className="flex gap-2">
              <span className="text-gray-400 w-12 shrink-0 pt-0.5">Cc</span>
              <span className="text-gray-800 break-all">{preview.cc}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-400 w-12 shrink-0 pt-0.5">Subject</span>
            <span className="text-gray-800 font-semibold">{preview.subject}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Render HTML body safely via dangerouslySetInnerHTML since it's our own content */}
          <div
            className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={
              preview.body && /<[a-z][\s\S]*>/i.test(preview.body)
                ? { __html: preview.body }
                : undefined
            }
          >
            {!(preview.body && /<[a-z][\s\S]*>/i.test(preview.body)) ? preview.body : undefined}
          </div>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400 text-center">
            This email will be sent automatically when the countdown ends, unless you click Undo.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Internal countdown toast rendered inside react-hot-toast.
 * Manages its own seconds state + optional message preview.
 */
function UndoToastContent({ onUndo, preview }) {
  const [seconds, setSeconds] = useState(10);
  const [showPreview, setShowPreview] = useState(false);
  const radius = 11;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = circumference * (1 - seconds / 10);

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl border border-white/10">
        {/* check icon */}
        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>

        <span className="text-sm font-medium">Email sent</span>

        {/* circular countdown ring */}
        <div className="relative flex-shrink-0 w-7 h-7 flex items-center justify-center">
          <svg className="w-7 h-7 -rotate-90 absolute" viewBox="0 0 26 26">
            <circle cx="13" cy="13" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <circle
              cx="13" cy="13" r={radius}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="text-xs font-bold relative z-10">{seconds}</span>
        </div>

        {/* divider */}
        <span className="text-white/20">|</span>

        {preview && (
          <button
            onClick={() => setShowPreview(true)}
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            View message
          </button>
        )}

        <button
          onClick={onUndo}
          className="text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors"
        >
          Undo
        </button>
      </div>

      {showPreview && preview && (
        <MessagePreviewOverlay preview={preview} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

/**
 * Toast shown after undo — with "View message" still available.
 */
function CancelledToastContent({ preview }) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl border border-white/10">
        <span className="text-base">↩</span>
        <span className="text-sm font-medium">Email cancelled</span>
        {preview && (
          <>
            <span className="text-white/20">|</span>
            <button onClick={() => setShowPreview(true)} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
              View message
            </button>
          </>
        )}
      </div>
      {showPreview && preview && (
        <MessagePreviewOverlay preview={preview} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

/**
 * Closes the compose flow immediately, shows a 10-second undo toast,
 * then calls sendFn() if not cancelled.
 *
 * @param {() => Promise<void>} sendFn  – async function that actually sends the email
 * @param {object}              opts
 * @param {{ to, cc, subject, body }} opts.preview  – email data shown in "View message"
 * @param {() => void}          opts.onSent    – called after successful send
 * @param {() => void}          opts.onUndone  – called if user clicked Undo
 * @param {(err: any) => void}  opts.onError   – called on send failure
 */
export function sendWithUndo(sendFn, { preview, onSent, onUndone, onError } = {}) {
  let cancelled = false;
  let toastId;

  const undo = () => {
    cancelled = true;
    toast.dismiss(toastId);
    toast.custom(
      () => <CancelledToastContent preview={preview} />,
      { duration: 5000, position: "bottom-center" }
    );
    if (onUndone) onUndone();
  };

  toastId = toast.custom(
    () => <UndoToastContent onUndo={undo} preview={preview} />,
    { duration: 10500, position: "bottom-center" }
  );

  setTimeout(async () => {
    if (cancelled) return;
    toast.dismiss(toastId);
    try {
      await sendFn();
      if (onSent) onSent();
    } catch (err) {
      if (onError) onError(err);
      else toast.error("Failed to send email");
    }
  }, 10000);
}
