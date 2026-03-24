"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";

export default function SendWhatsAppModal({ open, onClose, clientId, contactPhone, onSent }) {
  const [form, setForm] = useState({ to: contactPhone || "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, to: contactPhone || f.to }));
    }
  }, [open, contactPhone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { to: form.to, message: form.message };
      if (clientId) payload.client = clientId;
      await api.post("/communications/send-whatsapp/", payload);
      toast.success("WhatsApp message sent successfully");
      setForm({ to: "", message: "" });
      onClose();
      if (onSent) onSent();
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to send WhatsApp message";
      if (msg.includes("No active WhatsApp configuration")) {
        toast.error("No WhatsApp config found. Go to Settings > WhatsApp Config to set up.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Send WhatsApp Message" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To (Phone Number) *</label>
          <input
            type="tel"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            required
            placeholder="+919876543210 (with country code)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">Include country code (e.g. +91 for India, +1 for US)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            required
            rows={6}
            placeholder="Type your message..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={submitting} className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
            {submitting ? "Sending..." : "Send WhatsApp"}
          </button>
          <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
