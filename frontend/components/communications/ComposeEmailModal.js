"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { sendWithUndo } from "@/lib/undoSend";
import EmailChips from "@/components/ui/EmailChips";
import RichTextEditor from "@/components/ui/RichTextEditor";

export default function ComposeEmailModal({ open, onClose, clientId, contactEmail, ccEmails, linkSampleId, onSent }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ email_account: "", to: contactEmail || "", cc: ccEmails || "", subject: "", body: "" });
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (open) {
      api.get("/communications/email-accounts/")
        .then((r) => setAccounts(r.data.results || r.data))
        .catch(() => toast.error("Failed to load email accounts"));
      setForm((f) => ({ ...f, to: contactEmail || f.to, cc: ccEmails || f.cc }));
    }
  }, [open, contactEmail, ccEmails]);

  // Reply-Mail flow on a manually-created sample → prefill subject + body
  // from the sample's product/quantity so the executive doesn't start blank.
  useEffect(() => {
    if (!open || !linkSampleId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/samples/${linkSampleId}/`);
        if (cancelled) return;
        const s = r.data || {};
        const items = Array.isArray(s.items) && s.items.length
          ? s.items.filter((it) => (it.product_name || "").trim())
          : (s.product_name ? [{ product_name: s.product_name, quantity: s.quantity || "" }] : []);
        const names = items.map((it) => (it.product_name || "").trim()).filter(Boolean);
        const productLine = names.length === 0
          ? ""
          : names.length === 1
            ? names[0]
            : `${names[0]} (+${names.length - 1} more)`;
        const subject = productLine
          ? `Request for sample ${productLine}`
          : "Request for sample";
        const itemList = items
          .map((it) => `<li>${it.product_name || ""}${it.quantity ? ` — ${it.quantity}` : ""}</li>`)
          .join("");
        const body = `<p>Dear Sir/Madam,</p>
<p>Thank you for your interest in our products. We are pleased to confirm your sample request${productLine ? ` for the following:` : "."}</p>
${itemList ? `<ul>${itemList}</ul>` : ""}
<p>We will share the dispatch details shortly. Please let us know if you have any specific requirements.</p>
<p>Best regards,</p>`;
        setForm((f) => ({
          ...f,
          subject: f.subject && f.subject.trim() ? f.subject : subject,
          body: f.body && f.body.trim() && f.body !== "<p></p>" ? f.body : body,
        }));
      } catch {
        // non-fatal — user can type from scratch
      }
    })();
    return () => { cancelled = true; };
  }, [open, linkSampleId]);

  const handleAddFiles = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveFile = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Build FormData now (before closing the modal) so file references stay valid
    const fd = new FormData();
    fd.append("email_account", form.email_account);
    fd.append("to", form.to);
    fd.append("subject", form.subject);
    fd.append("body", form.body);
    if (form.cc) fd.append("cc", form.cc);
    if (clientId) fd.append("client", clientId);
    attachments.forEach((file) => fd.append("attachments", file));

    // Close the modal immediately — email will be sent after 10s unless undone
    onClose();

    sendWithUndo(
      async () => {
        const r = await api.post("/communications/send-email/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        // Manually-created sample → link the just-created Communication as
        // the sample's source thread. Backend stamps replied_at and (for
        // paid samples at "requested") advances status to "replied".
        if (linkSampleId && r?.data?.id) {
          try {
            await api.patch(`/samples/${linkSampleId}/`, { source_communication: r.data.id });
          } catch (e) {
            // non-fatal — the email already went out
          }
        }
        return r;
      },
      {
        preview: { to: form.to, cc: form.cc, subject: form.subject, body: form.body },
        onSent: () => {
          setForm({ email_account: "", to: "", cc: "", subject: "", body: "" });
          setAttachments([]);
          if (onSent) onSent();
        },
        onError: (err) => toast.error(getErrorMessage(err, "Failed to send email")),
      }
    );
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5";
  const inputCls = "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white outline-none transition-all";

  return (
    <Modal open={open} onClose={onClose} title="Compose Email" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>From <span className="text-rose-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </span>
            <select
              value={form.email_account}
              onChange={(e) => setForm({ ...form, email_account: e.target.value })}
              required
              className={`${inputCls} pl-10 appearance-none bg-no-repeat bg-[right_0.75rem_center]`}
              style={{ backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")" }}
            >
              <option value="">Select email account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>To <span className="text-rose-500">*</span></label>
            <EmailChips
              value={form.to}
              onChange={(val) => setForm({ ...form, to: val })}
              placeholder="recipient@example.com"
            />
          </div>
          <div>
            <label className={labelCls}>CC</label>
            <EmailChips
              value={form.cc}
              onChange={(val) => setForm({ ...form, cc: val })}
              placeholder="Add CC recipients..."
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Subject <span className="text-rose-500">*</span></label>
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="What's this email about?"
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Body <span className="text-rose-500">*</span></label>
          <div className="rounded-xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-400 transition-all overflow-hidden">
            <RichTextEditor
              value={form.body}
              onChange={(val) => setForm({ ...form, body: val })}
              placeholder="Compose your email..."
              minHeight="150px"
            />
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className={labelCls}>Attachments</label>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-700 cursor-pointer transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            Attach Files
            <input type="file" multiple onChange={handleAddFiles} className="hidden" />
          </label>
          {attachments.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {attachments.map((file, i) => (
                <div key={i} className="group flex items-center justify-between bg-gradient-to-r from-indigo-50/60 to-violet-50/40 border border-indigo-200/60 rounded-xl px-3 py-2 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] font-semibold text-slate-500">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleRemoveFile(i)} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 ml-2 shrink-0 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-3 border-t border-slate-100">
          <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm hover:shadow-md transition-all shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            Send Email
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
