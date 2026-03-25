"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";

export default function ComposeEmailModal({ open, onClose, clientId, contactEmail, onSent }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ email_account: "", to: contactEmail || "", cc: "", subject: "", body: "" });
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      api.get("/communications/email-accounts/")
        .then((r) => setAccounts(r.data.results || r.data))
        .catch(() => toast.error("Failed to load email accounts"));
      setForm((f) => ({ ...f, to: contactEmail || f.to }));
    }
  }, [open, contactEmail]);

  const handleAddFiles = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const handleRemoveFile = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("email_account", form.email_account);
      fd.append("to", form.to);
      fd.append("subject", form.subject);
      fd.append("body", form.body);
      if (form.cc) fd.append("cc", form.cc);
      if (clientId) fd.append("client", clientId);
      attachments.forEach((file) => fd.append("attachments", file));

      await api.post("/communications/send-email/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Email sent successfully");
      setForm({ email_account: "", to: "", cc: "", subject: "", body: "" });
      setAttachments([]);
      onClose();
      if (onSent) onSent();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send email")); } finally {
      setSubmitting(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <Modal open={open} onClose={onClose} title="Compose Email" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From *</label>
          <select
            value={form.email_account}
            onChange={(e) => setForm({ ...form, email_account: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">Select email account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name ? `${a.display_name} <${a.email}>` : a.email}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
            <input
              type="email"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              required
              placeholder="recipient@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
            <input
              type="text"
              value={form.cc}
              onChange={(e) => setForm({ ...form, cc: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${
                form.cc && !form.cc.split(",").every((e) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))
                  ? "border-red-300 bg-red-50" : "border-gray-300"
              }`}
            />
            {form.cc && !form.cc.split(",").every((e) => !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) && (
              <p className="text-xs text-red-500 mt-1">Invalid email(s). Separate multiple with commas.</p>
            )}
            {form.cc && form.cc.includes(",") && (
              <div className="flex flex-wrap gap-1 mt-1">
                {form.cc.split(",").filter((e) => e.trim()).map((email, i) => {
                  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
                  return (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {email.trim()}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Body *</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            Attach Files
            <input type="file" multiple onChange={handleAddFiles} className="hidden" />
          </label>
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">({formatSize(file.size)})</span>
                  </div>
                  <button type="button" onClick={() => handleRemoveFile(i)} className="text-red-500 hover:text-red-700 text-xs font-medium ml-2 shrink-0">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? "Sending..." : "Send Email"}
          </button>
          <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
