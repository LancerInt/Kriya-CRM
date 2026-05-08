"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import { confirmDialog } from "@/lib/confirm";

function EmailAccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    email: "", display_name: "",
    imap_host: "", imap_port: "993",
    smtp_host: "", smtp_port: "587",
    username: "", password: "",
    use_ssl: true,
  });
  const [submitting, setSubmitting] = useState(false);
  // Backfill chooser state — `null` when closed, otherwise the account being
  // configured for a historical pull.
  const [backfillFor, setBackfillFor] = useState(null);
  const [backfillDays, setBackfillDays] = useState(1825);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);

  const loadAccounts = (silent = false) => {
    if (!silent) setLoading(true);
    api.get("/communications/email-accounts/")
      .then((r) => setAccounts(r.data.results || r.data))
      .catch(() => { if (!silent) toast.error("Failed to load email accounts"); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => { loadAccounts(); }, []);

  // Auto-poll while any account has a running historical sync. Polls every
  // 8s, stops as soon as nothing is running. Cheap because it's a single
  // GET that the user is already on this tab to see.
  useEffect(() => {
    const anyRunning = accounts.some((a) => a.historical_sync_status === "running");
    if (!anyRunning) return;
    const t = setInterval(() => loadAccounts(true), 8000);
    return () => clearInterval(t);
  }, [accounts]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/communications/email-accounts/", {
        ...form,
        imap_port: parseInt(form.imap_port),
        smtp_port: parseInt(form.smtp_port),
      });
      toast.success("Email account added");
      setShowModal(false);
      setForm({ email: "", display_name: "", imap_host: "", imap_port: "993", smtp_host: "", smtp_port: "587", username: "", password: "", use_ssl: true });
      loadAccounts();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add email account")); } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog("Delete this email account?"))) return;
    try {
      await api.delete(`/communications/email-accounts/${id}/`);
      toast.success("Email account deleted");
      loadAccounts();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete email account")); }
  };

  const handleTestConnection = async (id) => {
    try {
      const res = await api.post(`/communications/email-accounts/${id}/test-connection/`);
      toast.success(`IMAP: ${res.data.imap ? "OK" : "Failed"} | SMTP: ${res.data.smtp ? "OK" : "Failed"}`);
    } catch (err) {
      const errors = err.response?.data?.errors || [];
      toast.error(errors.length ? errors.join("\n") : "Connection test failed");
    }
  };

  const handleSyncNow = async (id) => {
    try {
      await api.post(`/communications/email-accounts/${id}/sync-now/`);
      toast.success("Sync started");
      loadAccounts();
    } catch (err) { toast.error(getErrorMessage(err, "Sync failed")); }
  };

  const handleBackfill = async () => {
    if (!backfillFor) return;
    setBackfillSubmitting(true);
    try {
      await api.post(`/communications/email-accounts/${backfillFor.id}/historical-sync/`, {
        days_back: Number(backfillDays),
      });
      toast.success(`Historical sync queued — ${backfillDays} days`);
      setBackfillFor(null);
      loadAccounts();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start historical sync"));
    } finally {
      setBackfillSubmitting(false);
    }
  };

  const renderSyncProgress = (acc) => {
    const s = acc.historical_sync_status;
    if (!s) return null;
    if (s === "running") {
      const days = acc.historical_sync_days_back || 0;
      const imported = acc.historical_sync_imported || 0;
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Backfilling {days}d · {imported.toLocaleString()} imported
        </span>
      );
    }
    if (s === "completed") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5" title={`Imported ${acc.historical_sync_imported || 0} emails`}>
          ✓ Backfill done · {acc.historical_sync_imported || 0}
        </span>
      );
    }
    if (s === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5" title={acc.historical_sync_error || "Failed"}>
          ✕ Backfill failed
        </span>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Email Accounts</h2>
          <p className="text-xs text-slate-500 mt-0.5">{accounts.length} {accounts.length === 1 ? "account" : "accounts"} configured</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Email Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 items-center justify-center mb-4 shadow-inner">
            <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <p className="text-slate-700 font-bold text-lg">No email accounts configured</p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Add an email account to start sending and receiving emails through Kriya.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="group relative bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden">
              <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gradient-to-b from-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800 text-sm truncate">{acc.email}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${acc.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>{acc.is_active ? "Active" : "Inactive"}</span>
                    {renderSyncProgress(acc)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                    {acc.display_name && (<><span className="font-medium">{acc.display_name}</span><span className="text-slate-300">·</span></>)}
                    <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>{acc.imap_host}</span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{acc.last_synced ? format(new Date(acc.last_synced), "MMM d, HH:mm") : "Never synced"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleTestConnection(acc.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg ring-1 ring-indigo-200/60 transition-colors" title="Test IMAP & SMTP connection">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    Test
                  </button>
                  <button onClick={() => handleSyncNow(acc.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg ring-1 ring-blue-200/60 transition-colors" title="Sync now">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Sync
                  </button>
                  <button
                    onClick={async () => {
                      if (acc.historical_sync_status === "running") {
                        const ok = await confirmDialog({
                          title: "Restart backfill?",
                          message: "A backfill is already in progress for this account. Starting a new one will replace it. Continue?",
                          confirmText: "Yes, restart",
                          cancelText: "Cancel",
                        });
                        if (!ok) return;
                      }
                      setBackfillFor(acc);
                      setBackfillDays(1825);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg ring-1 ring-violet-200/60 transition-colors"
                    title="Pull older emails from this account (1y / 5y / 10y)"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Backfill
                  </button>
                  <button onClick={() => handleDelete(acc.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Email Account" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Display Name</label>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>IMAP Host *</label>
              <input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} required placeholder="imap.gmail.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>IMAP Port</label>
              <input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>SMTP Host *</label>
              <input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} required placeholder="smtp.gmail.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>SMTP Port</label>
              <input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Username *</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer">
            <input type="checkbox" checked={form.use_ssl} onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })} className="rounded text-emerald-600 focus:ring-emerald-500" />
            <span className="text-xs font-semibold text-emerald-800">🔒 Use SSL/TLS encryption</span>
          </label>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">
              {submitting ? "Adding..." : "Add Account"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Backfill chooser */}
      <Modal open={!!backfillFor} onClose={() => !backfillSubmitting && setBackfillFor(null)} title="Backfill historical emails" size="md">
        {backfillFor && (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm">
              <p className="font-semibold text-indigo-900">{backfillFor.email}</p>
              <p className="text-xs text-indigo-700 mt-0.5">Pull older emails from this account into the CRM. Runs in the background — you can leave this page.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">How far back?</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "1 year",  days: 365 },
                  { label: "2 years", days: 730 },
                  { label: "5 years", days: 1825 },
                  { label: "10 years", days: 3650 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setBackfillDays(opt.days)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      backfillDays === opt.days
                        ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white border-transparent shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                    }`}
                  >
                    {opt.label}
                    <span className="block text-[10px] font-normal opacity-80 mt-0.5">{opt.days} days</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">Or custom:</span>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  value={backfillDays}
                  onChange={(e) => setBackfillDays(Math.max(30, Math.min(3650, Number(e.target.value) || 30)))}
                  className="w-24 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <span className="text-xs text-gray-500">days (30 – 3650)</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
              <p className="font-semibold mb-1">⚠️ Heads up</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Large pulls can take hours and use significant storage.</li>
                <li>Gmail may throttle very large IMAP requests.</li>
                <li>Existing emails won't be duplicated — dedup runs by Message-ID.</li>
                <li>Once started, you can close this page; progress shows on this row.</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={handleBackfill}
                disabled={backfillSubmitting}
                className="flex-1 px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg font-semibold shadow-sm hover:shadow disabled:opacity-50 transition-all"
              >
                {backfillSubmitting ? "Starting..." : `Start backfill (${backfillDays} days)`}
              </button>
              <button
                type="button"
                disabled={backfillSubmitting}
                onClick={() => setBackfillFor(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function WhatsAppConfigTab() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ phone_number_id: "", business_account_id: "", access_token: "", verify_token: "kriya_crm_webhook_verify" });
  const [submitting, setSubmitting] = useState(false);

  const loadConfigs = () => {
    setLoading(true);
    api.get("/communications/whatsapp-configs/")
      .then((r) => setConfigs(r.data.results || r.data))
      .catch(() => toast.error("Failed to load WhatsApp configs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/communications/whatsapp-configs/", form);
      toast.success("WhatsApp config added");
      setShowModal(false);
      setForm({ phone_number_id: "", business_account_id: "", access_token: "", verify_token: "kriya_crm_webhook_verify" });
      loadConfigs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add WhatsApp config")); } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog("Delete this WhatsApp config?"))) return;
    try {
      await api.delete(`/communications/whatsapp-configs/${id}/`);
      toast.success("WhatsApp config deleted");
      loadConfigs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete WhatsApp config")); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;
  }

  const setupSteps = [
    { title: "Create a Meta Developer Account", body: <span>Go to <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] text-emerald-800">developers.facebook.com</code> and create a developer account</span> },
    { title: "Create a Business App", body: <span>Click "My Apps" → "Create App" → Select "Business" type → Add "WhatsApp" product</span> },
    { title: "Get API Credentials", body: <span>In your app dashboard → WhatsApp → API Setup. You'll find <strong>Phone Number ID</strong>, <strong>WhatsApp Business Account ID</strong>, and a <strong>Temporary Access Token</strong>.</span> },
    { title: "Get a Permanent Access Token", body: <span>Go to <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] text-emerald-800">business.facebook.com</code> → Settings → System Users → Create system user → Generate token with <strong>whatsapp_business_messaging</strong> permission</span> },
    { title: "Configure Webhook", body: <span>In WhatsApp → Configuration → Webhook. Callback URL: <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] text-emerald-800">https://your-domain.com/api/communications/whatsapp-webhook/</code>. Subscribe to <strong>messages</strong>.</span> },
    { title: "Add Config Below", body: <span>Click "+ Add Config" and paste your credentials. You can test with Meta's test phone number first.</span> },
  ];

  return (
    <>
      {/* Setup Guide */}
      {configs.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-green-50/60 to-teal-50/40 border border-emerald-200/70 shadow-sm mb-5">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-emerald-300/20 rounded-full blur-3xl" />
          <div className="relative p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-emerald-900 text-base">WhatsApp Cloud API Setup</h3>
                <p className="text-[11px] text-emerald-700">1,000 free conversations / month — follow the steps below</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {setupSteps.map((step, i) => (
                <div key={i} className="flex gap-3 p-3 bg-white/70 backdrop-blur rounded-xl border border-emerald-200/50">
                  <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">{i + 1}</span>
                  <div className="text-sm">
                    <p className="font-bold text-emerald-900 text-[13px]">{step.title}</p>
                    <p className="text-emerald-800/90 text-[12px] leading-relaxed mt-0.5">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">WhatsApp Configurations</h2>
          <p className="text-xs text-slate-500 mt-0.5">{configs.length} {configs.length === 1 ? "config" : "configs"} active</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Config
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 items-center justify-center mb-3">
            <svg className="w-8 h-8 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654z"/></svg>
          </div>
          <p className="text-slate-700 font-bold">No WhatsApp config yet</p>
          <p className="text-sm text-slate-500 mt-1">Follow the setup guide above, then click "Add Config"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div key={cfg.id} className="group relative bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all overflow-hidden">
              <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gradient-to-b from-emerald-500 to-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800 text-sm truncate">{cfg.phone_number_id}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${cfg.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>{cfg.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Business Account: <span className="font-medium text-slate-700">{cfg.business_account_id}</span></p>
                </div>
                <button onClick={() => handleDelete(cfg.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add WhatsApp Config" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>Get these values from: <strong>Meta Developer Dashboard</strong> → Your App → WhatsApp → API Setup</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number ID *</label>
              <input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} required placeholder="e.g. 106540352456789" className={inputCls} />
              <p className="text-[10px] text-slate-400 mt-1">Found under "From" phone number in API Setup</p>
            </div>
            <div>
              <label className={labelCls}>Business Account ID *</label>
              <input value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value })} required placeholder="e.g. 102938475612345" className={inputCls} />
              <p className="text-[10px] text-slate-400 mt-1">Shown at the top of the API Setup page</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Access Token *</label>
            <input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} required placeholder="Paste your permanent access token" className={inputCls} />
            <p className="text-[10px] text-slate-400 mt-1">Use a permanent token from System Users (Business Settings), not the temporary one</p>
          </div>
          <div>
            <label className={labelCls}>Verify Token *</label>
            <input value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} required className={inputCls} />
            <p className="text-[10px] text-slate-400 mt-1">A custom string you create. Use the same value when configuring the webhook in Meta Dashboard.</p>
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">
              {submitting ? "Adding..." : "Add Config"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function MeetingPlatformsTab() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [platform, setPlatform] = useState("google");
  const [googleForm, setGoogleForm] = useState({ google_client_id: "", google_client_secret: "", google_calendar_id: "primary" });
  const [zoomForm, setZoomForm] = useState({ zoom_account_id: "", zoom_client_id: "", zoom_client_secret: "" });
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(null);

  const loadConfigs = () => {
    setLoading(true);
    api.get("/meetings/platform-configs/")
      .then((r) => setConfigs(r.data.results || r.data))
      .catch(() => toast.error("Failed to load platform configs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadConfigs();
    // Check for Google OAuth callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      toast.success("Google account connected successfully!");
      window.history.replaceState({}, "", "/settings");
      loadConfigs();
    } else if (params.get("google_error")) {
      toast.error(`Google connection failed: ${params.get("google_error")}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { platform, is_active: true };
      if (platform === "google") Object.assign(payload, googleForm);
      else if (platform === "zoom") Object.assign(payload, zoomForm);
      await api.post("/meetings/platform-configs/", payload);
      toast.success("Platform added! " + (platform === "google" ? "Now click 'Connect Google Account' to authorize." : ""));
      setShowModal(false);
      loadConfigs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add config")); }
    finally { setSubmitting(false); }
  };

  const handleConnectGoogle = async (configId) => {
    setConnecting(configId);
    try {
      const res = await api.post(`/meetings/platform-configs/${configId}/google-auth-url/`);
      window.location.href = res.data.auth_url;
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to start Google auth");
      setConnecting(null);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog("Delete this platform config?"))) return;
    try {
      await api.delete(`/meetings/platform-configs/${id}/`);
      toast.success("Config deleted");
      loadConfigs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;

  const platformLabels = { zoom: "Zoom", google: "Google Meet", teams: "Microsoft Teams" };
  const platformTone = {
    google: { iconBg: "from-blue-500 to-indigo-500", icon: <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M21.875 17.917q.625 0 1.083-.458.459-.459.459-1.084V7.625q0-.625-.459-1.083-.458-.459-1.083-.459H17.25v11.834zm-9.708 0V5.917q0-.875.625-1.5t1.5-.625h6.75q.875 0 1.5.625t.625 1.5v12.166q0 .875-.625 1.5t-1.5.625h-6.75q-.875 0-1.5-.625t-.625-1.5z" /></svg> },
    zoom: { iconBg: "from-blue-400 to-blue-600", icon: <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
  };

  const setupSteps = [
    { title: "Create OAuth Credentials", body: <span>Go to <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-[10px] text-blue-800">console.cloud.google.com</code> → APIs &amp; Services → Credentials → "+ Create Credentials" → "OAuth client ID"</span> },
    { title: "Configure OAuth App", body: <span>Type: <strong>Web application</strong>, Name: <strong>Kriya CRM</strong>, Redirect URI: <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-[10px] text-blue-800">http://localhost:8000/api/meetings/google-oauth-callback/</code></span> },
    { title: "Enable Google Calendar API", body: <span>APIs &amp; Services → Library → Search "Google Calendar API" → Enable</span> },
    { title: "Add Config & Connect", body: <span>Copy <strong>Client ID</strong> and <strong>Client Secret</strong> → Click "+ Add Platform" below → Then click "Connect Google Account"</span> },
  ];

  return (
    <>
      {/* Setup Guide */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50/60 to-cyan-50/40 border border-blue-200/70 shadow-sm mb-5">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-blue-300/20 rounded-full blur-3xl" />
        <div className="relative p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h3 className="font-bold text-blue-900 text-base">Google Meet Setup (OAuth 2.0)</h3>
              <p className="text-[11px] text-blue-700">Auto-generate meeting links from Kriya</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {setupSteps.map((step, i) => (
              <div key={i} className="flex gap-3 p-3 bg-white/70 backdrop-blur rounded-xl border border-blue-200/50">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">{i + 1}</span>
                <div className="text-sm">
                  <p className="font-bold text-blue-900 text-[13px]">{step.title}</p>
                  <p className="text-blue-800/90 text-[12px] leading-relaxed mt-0.5">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Meeting Platforms</h2>
          <p className="text-xs text-slate-500 mt-0.5">{configs.length} {configs.length === 1 ? "platform" : "platforms"} configured</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Platform
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 items-center justify-center mb-3">
            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <p className="text-slate-700 font-bold">No meeting platforms configured</p>
          <p className="text-sm text-slate-500 mt-1">Add Google Meet or Zoom to auto-generate meeting links</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => {
            const tone = platformTone[cfg.platform] || platformTone.google;
            return (
              <div key={cfg.id} className="group relative bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:border-blue-200 transition-all overflow-hidden">
                <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gradient-to-b from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex items-center gap-4">
                  <div className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${tone.iconBg} flex items-center justify-center shadow-sm`}>
                    {tone.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800 text-sm">{platformLabels[cfg.platform] || cfg.platform}</h4>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${cfg.is_connected ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>{cfg.is_connected ? "Connected" : "Pending"}</span>
                    </div>
                    {cfg.platform === "google" && cfg.google_user_email && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Connected as: <span className="font-semibold text-emerald-700">{cfg.google_user_email}</span></p>
                    )}
                    {cfg.platform === "google" && !cfg.is_connected && (
                      <p className="text-[11px] text-amber-600 mt-0.5">Not connected — click "Connect Google Account" to authorize</p>
                    )}
                    {cfg.platform === "zoom" && cfg.zoom_account_id && (
                      <p className="text-[11px] text-slate-500 mt-0.5">Account: <span className="font-semibold text-slate-700">{cfg.zoom_account_id}</span></p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cfg.platform === "google" && !cfg.is_connected && (
                      <button onClick={() => handleConnectGoogle(cfg.id)} disabled={connecting === cfg.id} className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow disabled:opacity-50 transition-all">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h7l-3.5 3.5M20 7l-3.5-3.5M11 17H4l3.5-3.5M4 17l3.5 3.5" /></svg>
                        {connecting === cfg.id ? "Redirecting..." : "Connect Google"}
                      </button>
                    )}
                    <button onClick={() => handleDelete(cfg.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Meeting Platform" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className={labelCls}>Platform *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "google", label: "Google Meet", iconBg: "from-blue-500 to-indigo-600" },
                { value: "zoom", label: "Zoom", iconBg: "from-blue-400 to-blue-600" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 transition-all ${
                    platform === p.value
                      ? "border-indigo-500 bg-indigo-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${p.iconBg} flex items-center justify-center shadow-sm`}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </div>
                  <span className={`font-bold text-sm ${platform === p.value ? "text-indigo-700" : "text-slate-700"}`}>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {platform === "google" && (
            <>
              <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Get these from: <strong>Google Cloud Console</strong> → APIs &amp; Services → Credentials → OAuth 2.0 Client ID</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Client ID *</label>
                  <input value={googleForm.google_client_id} onChange={(e) => setGoogleForm({ ...googleForm, google_client_id: e.target.value })} required placeholder="xxxxx.apps.googleusercontent.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Client Secret *</label>
                  <input type="password" value={googleForm.google_client_secret} onChange={(e) => setGoogleForm({ ...googleForm, google_client_secret: e.target.value })} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Calendar ID</label>
                <input value={googleForm.google_calendar_id} onChange={(e) => setGoogleForm({ ...googleForm, google_calendar_id: e.target.value })} placeholder="primary" className={inputCls} />
              </div>
            </>
          )}

          {platform === "zoom" && (
            <>
              <div>
                <label className={labelCls}>Account ID *</label>
                <input value={zoomForm.zoom_account_id} onChange={(e) => setZoomForm({ ...zoomForm, zoom_account_id: e.target.value })} required className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Client ID *</label>
                  <input value={zoomForm.zoom_client_id} onChange={(e) => setZoomForm({ ...zoomForm, zoom_client_id: e.target.value })} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Client Secret *</label>
                  <input type="password" value={zoomForm.zoom_client_secret} onChange={(e) => setZoomForm({ ...zoomForm, zoom_client_secret: e.target.value })} required className={inputCls} />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">
              {submitting ? "Adding..." : "Add Platform"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function AIConfigTab() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ provider: "groq", api_key: "", model_name: "llama-3.3-70b-versatile" });
  const [submitting, setSubmitting] = useState(false);

  const loadConfigs = () => {
    setLoading(true);
    api.get("/agents/configs/")
      .then((r) => setConfigs(r.data.results || r.data))
      .catch(() => toast.error("Failed to load AI configs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/agents/configs/", { ...form, is_active: true });
      toast.success("AI provider configured!");
      setShowModal(false);
      loadConfigs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add config")); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog("Delete this AI config?"))) return;
    try { await api.delete(`/agents/configs/${id}/`); toast.success("Deleted"); loadConfigs(); }
    catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;

  const modelOptions = {
    groq: [{ value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Free)" }, { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Fast (Free)" }, { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Free)" }],
    gemini: [{ value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
    claude: [{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }, { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }],
    openai: [{ value: "gpt-4o", label: "GPT-4o" }, { value: "gpt-4o-mini", label: "GPT-4o Mini" }],
  };

  const providerLabels = { groq: "Groq", gemini: "Google Gemini", claude: "Claude", openai: "OpenAI" };
  const providerTones = {
    groq: "from-orange-500 to-red-500",
    gemini: "from-blue-500 to-purple-500",
    claude: "from-amber-500 to-orange-500",
    openai: "from-emerald-500 to-teal-500",
  };

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-violet-50/60 to-indigo-50/40 border border-purple-200/70 shadow-sm mb-5">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-purple-300/20 rounded-full blur-3xl" />
        <div className="relative p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl blur-md opacity-60" />
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg ring-2 ring-white">
                <span className="text-2xl">✦</span>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-purple-900 text-base tracking-tight">Kriya AI — Agentic OS</h3>
              <p className="text-[12px] text-purple-700">Connect an AI provider to unlock summaries, insights &amp; chat</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative overflow-hidden rounded-xl bg-white border border-emerald-200/70 p-3.5 shadow-sm">
              <span className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-bl-lg">Recommended</span>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold">G</div>
                <p className="font-bold text-emerald-800 text-sm">Groq</p>
              </div>
              <p className="text-emerald-700 text-[11px] font-semibold">FREE · 30 req/min</p>
              <p className="text-emerald-600 text-[10px] mt-1">14,400 requests/day</p>
              <p className="text-slate-500 text-[10px] mt-2">Get key: <code className="font-mono bg-emerald-50 px-1 rounded text-emerald-700">console.groq.com/keys</code></p>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-white border border-purple-200/70 p-3.5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">✦</div>
                <p className="font-bold text-purple-800 text-sm">Google Gemini</p>
              </div>
              <p className="text-purple-700 text-[11px] font-semibold">FREE tier · 15 req/min</p>
              <p className="text-purple-600 text-[10px] mt-1">Best for multimodal</p>
              <p className="text-slate-500 text-[10px] mt-2">Get key: <code className="font-mono bg-purple-50 px-1 rounded text-purple-700">aistudio.google.com</code></p>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-white border border-amber-200/70 p-3.5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">A</div>
                <p className="font-bold text-amber-800 text-sm">Claude / OpenAI</p>
              </div>
              <p className="text-amber-700 text-[11px] font-semibold">PAID · $2.50–3 / M tokens</p>
              <p className="text-amber-600 text-[10px] mt-1">Best quality</p>
              <p className="text-slate-500 text-[10px] mt-2">Requires billing setup</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">AI Providers</h2>
          <p className="text-xs text-slate-500 mt-0.5">{configs.length} {configs.length === 1 ? "provider" : "providers"} configured</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add AI Provider
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/70 shadow-sm">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 via-violet-100 to-purple-100 items-center justify-center mb-3 shadow-inner">
            <span className="text-2xl">✦</span>
          </div>
          <p className="text-slate-700 font-bold">No AI provider configured</p>
          <p className="text-sm text-slate-500 mt-1">Add a provider to enable Kriya AI features</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div key={cfg.id} className="group relative bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:border-purple-200 transition-all overflow-hidden">
              <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gradient-to-b from-indigo-500 via-violet-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-4 flex items-center gap-4">
                <div className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${providerTones[cfg.provider] || "from-slate-400 to-slate-500"} flex items-center justify-center shadow-sm text-white font-bold text-lg`}>
                  {(providerLabels[cfg.provider] || cfg.provider)[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-800 text-sm">{providerLabels[cfg.provider] || cfg.provider}</h4>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${cfg.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>{cfg.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Model: <code className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{cfg.model_name}</code></p>
                </div>
                <button onClick={() => handleDelete(cfg.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg ring-1 ring-rose-200/60 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add AI Provider" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className={labelCls}>Provider *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "groq", label: "Groq · Llama", badge: "FREE", tone: "from-orange-500 to-red-500" },
                { value: "gemini", label: "Google Gemini", badge: "FREE", tone: "from-blue-500 to-purple-500" },
                { value: "claude", label: "Claude (Anthropic)", badge: "PAID", tone: "from-amber-500 to-orange-500" },
                { value: "openai", label: "OpenAI GPT", badge: "PAID", tone: "from-emerald-500 to-teal-500" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm({ ...form, provider: p.value, model_name: modelOptions[p.value]?.[0]?.value || "" })}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all ${
                    form.provider === p.value
                      ? "border-indigo-500 bg-indigo-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${p.tone} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>{p.label[0]}</div>
                  <div className="text-left flex-1 min-w-0">
                    <p className={`font-bold text-xs truncate ${form.provider === p.value ? "text-indigo-700" : "text-slate-700"}`}>{p.label}</p>
                    <span className={`inline-block text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${p.badge === "FREE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{p.badge}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <select value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} className={inputCls}>
              {(modelOptions[form.provider] || []).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>API Key *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              </span>
              <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required placeholder={form.provider === "gemini" ? "Get from aistudio.google.com/apikey" : "Paste your API key"} className={`${inputCls} pl-10`} />
            </div>
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">{submitting ? "Adding..." : "Add Provider"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Reusable input style ──
const inputCls = "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white outline-none transition-all";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5";

function SectionCard({ icon, title, subtitle, tone = "indigo", children }) {
  const tones = {
    indigo: "from-indigo-500 to-violet-500",
    rose: "from-rose-500 to-rose-600",
    emerald: "from-emerald-500 to-emerald-600",
    blue: "from-blue-500 to-indigo-500",
    purple: "from-purple-500 to-violet-500",
    amber: "from-amber-500 to-orange-500",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50/60 to-white">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center shadow-sm`}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Profile & Password Tab ──
function ProfileTab({ user }) {
  const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "", phone: "", whatsapp: "" });
  const [pwForm, setPwForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    api.get("/auth/me/").then((r) => {
      const u = r.data.user || r.data;
      setProfile({ first_name: u.first_name || "", last_name: u.last_name || "", email: u.email || "", phone: u.phone || "", whatsapp: u.whatsapp || "" });
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/auth/update-profile/", profile);
      toast.success("Profile updated");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update profile")); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error("Passwords don't match"); return; }
    if (pwForm.new_password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setChangingPw(true);
    try {
      await api.post("/auth/change-password/", { old_password: pwForm.old_password, new_password: pwForm.new_password });
      toast.success("Password changed successfully");
      setPwForm({ old_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to change password");
    } finally { setChangingPw(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;

  const initials = `${(profile.first_name || "?")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase() || "U";
  const fullName = `${profile.first_name} ${profile.last_name}`.trim() || "Your Name";

  return (
    <div className="max-w-3xl space-y-5">
      {/* Profile Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 border border-slate-200/70 shadow-sm p-5">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-2xl blur-md opacity-60" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-xl font-extrabold ring-4 ring-white shadow-xl">
              {initials}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight truncate">{fullName}</h2>
            <p className="text-sm text-slate-500 truncate">{profile.email || "no email"}</p>
            {user?.role && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-700 ring-1 ring-indigo-200/60 capitalize">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                {user.role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <SectionCard
        icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        title="Edit Profile"
        subtitle="Update your name and contact details"
        tone="indigo"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name</label>
              <input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email Address</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </span>
              <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className={`${inputCls} pl-10`} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </span>
                <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className={`${inputCls} pl-10`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                </span>
                <input value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} className={`${inputCls} pl-10`} />
              </div>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <span className="text-[11px] text-slate-400">Changes apply immediately after saving</span>
          </div>
        </form>
      </SectionCard>

      {/* Change Password */}
      <SectionCard
        icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        title="Change Password"
        subtitle="Use a strong password — at least 6 characters"
        tone="rose"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={labelCls}>Current Password *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </span>
              <input type={showOld ? "text" : "password"} value={pwForm.old_password} onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })} required className={`${inputCls} pl-10 pr-10`} />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors">
                {showOld ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>New Password *</label>
              <div className="relative">
                <input type={showNew ? "text" : "password"} value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required minLength={6} className={`${inputCls} pr-10`} />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors">
                  {showNew ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirm Password *</label>
              <input type="password" value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} required minLength={6} className={inputCls} />
            </div>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <button type="submit" disabled={changingPw} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              {changingPw ? "Changing..." : "Change Password"}
            </button>
            <span className="text-[11px] text-slate-400">You'll stay signed in</span>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

// ── User Management Tab (Admin only) ──
function UserManagementTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", first_name: "", last_name: "", email: "", role: "executive", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    api.get("/auth/users/").then((r) => setUsers(r.data.results || r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/users/", form);
      toast.success("User created");
      setShowModal(false);
      setForm({ username: "", password: "", first_name: "", last_name: "", email: "", role: "executive", phone: "" });
      loadUsers();
    } catch (err) {
      const msg = err.response?.data?.username?.[0] || err.response?.data?.email?.[0] || "Failed to create user";
      toast.error(msg);
    } finally { setSubmitting(false); }
  };

  const handleToggleActive = async (user) => {
    const action = user.is_active ? "deactivate" : "reactivate";
    if (user.is_active && !(await confirmDialog(`Deactivate ${user.first_name} ${user.last_name}?\n\nThey will no longer be able to log in, but all their data (emails, tasks, quotations, etc.) will remain intact.`))) return;
    try {
      await api.post(`/auth/users/${user.id}/${action}/`);
      toast.success(user.is_active ? "User deactivated — login blocked, data preserved" : "User reactivated");
      loadUsers();
    } catch (err) { toast.error(getErrorMessage(err, `Failed to ${action} user`)); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;

  const roleTone = {
    admin: { bg: "from-rose-500 to-rose-600", soft: "bg-rose-50 text-rose-700 ring-rose-200" },
    manager: { bg: "from-blue-500 to-blue-600", soft: "bg-blue-50 text-blue-700 ring-blue-200" },
    executive: { bg: "from-emerald-500 to-emerald-600", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Users</h2>
          <p className="text-xs text-slate-500 mt-0.5">{users.length} total · {users.filter(u => u.is_active).length} active</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-gradient-to-r from-slate-50 to-slate-50/40 border-b border-slate-200/70 text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
          <div>Name</div>
          <div>Username</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((u) => {
            const tone = roleTone[u.role] || roleTone.executive;
            const initials = `${(u.first_name || "?")[0] || ""}${(u.last_name || "")[0] || ""}`.toUpperCase() || "?";
            return (
              <div key={u.id} className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr_1fr] gap-3 md:gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors items-center">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${tone.bg} text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shadow-sm`}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{u.first_name} {u.last_name}</p>
                    <p className="text-[11px] text-slate-400 md:hidden truncate">{u.email}</p>
                  </div>
                </div>
                <div className="hidden md:block">
                  <code className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">{u.username}</code>
                </div>
                <div className="hidden md:block text-[12px] text-slate-500 truncate">{u.email}</div>
                <div className="hidden md:block">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 capitalize ${tone.soft}`}>{u.role}</span>
                </div>
                <div className="hidden md:block">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 ${u.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  {u.role !== "admin" && (
                    <button onClick={() => handleToggleActive(u)} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg ring-1 transition-colors ${u.is_active ? "text-amber-700 bg-amber-50 hover:bg-amber-100 ring-amber-200/60" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-emerald-200/60"}`}>
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New User" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Username *</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}>
                <option value="executive">Executive</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-xl font-bold text-sm hover:shadow-md disabled:opacity-50 transition-all shadow-sm">{submitting ? "Creating..." : "Create User"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ShadowAssignmentsTab() {
  const [executives, setExecutives] = useState([]);
  const [shadows, setShadows] = useState({});
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null); // executive id being assigned

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/auth/users/", { params: { role: "executive" } });
      const execs = (res.data.results || res.data).filter(u => u.role === "executive");
      setExecutives(execs);
      // Load shadow assignments for each executive
      const shadowData = {};
      for (const exec of execs) {
        try {
          const sr = await api.get(`/auth/users/${exec.id}/shadows/`);
          shadowData[exec.id] = sr.data;
        } catch { shadowData[exec.id] = { shadows: [], shadowing: [] }; }
      }
      setShadows(shadowData);
    } catch { toast.error("Failed to load executives"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleAssign = async (executiveId, shadowId) => {
    try {
      await api.post(`/auth/users/${executiveId}/assign-shadow/`, { shadow_id: shadowId });
      toast.success("Shadow assigned");
      setAssigning(null);
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to assign")); }
  };

  const handleRemove = async (executiveId, shadowId) => {
    if (!(await confirmDialog("Remove this shadow assignment?"))) return;
    try {
      await api.post(`/auth/users/${executiveId}/remove-shadow/`, { shadow_id: shadowId });
      toast.success("Shadow removed");
      loadData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to remove")); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-[3px] border-indigo-200 border-t-indigo-600" /></div>;

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50/60 to-yellow-50/40 border border-amber-200/70 shadow-sm">
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-amber-300/20 rounded-full blur-2xl" />
        <div className="relative p-5 flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </div>
          <div>
            <p className="font-bold text-amber-900 text-sm">Executive Shadow Assignments</p>
            <p className="mt-1 text-amber-800/90 text-[12px] leading-relaxed">When you assign Executive A as shadow of Executive B, A gets <strong>full access to ALL of B's clients' emails, WhatsApp messages, and communications</strong>.</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Executives</h2>
        <p className="text-xs text-slate-500 mb-4">{executives.length} {executives.length === 1 ? "executive" : "executives"} · 1 shadow max each</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_2fr_1.2fr] gap-4 px-5 py-3 bg-gradient-to-r from-slate-50 to-slate-50/40 border-b border-slate-200/70 text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">
          <div>Executive</div>
          <div>Shadowed By</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-100">
          {executives.map((exec) => {
            const data = shadows[exec.id] || { shadows: [], shadowing: [] };
            return (
              <div key={exec.id} className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1.2fr] gap-3 md:gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors items-center">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white shadow-sm">
                    {(exec.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{exec.full_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{exec.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.shadows.length === 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 italic">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      No shadow assigned
                    </span>
                  )}
                  {data.shadows.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-emerald-50 to-emerald-100/60 text-emerald-700 rounded-full text-[11px] font-bold ring-1 ring-emerald-200/60">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-[9px] font-bold">{s.name[0]?.toUpperCase()}</div>
                      {s.name}
                      <button onClick={() => handleRemove(exec.id, s.id)} className="hover:bg-rose-100 hover:text-rose-600 p-0.5 rounded transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  {assigning === exec.id ? (
                    <div className="inline-block text-left w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-indigo-50/40 to-white">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Select Shadow</span>
                        <button onClick={() => setAssigning(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {(() => {
                          const alreadyShadowing = new Set();
                          Object.values(shadows).forEach(s => s.shadows?.forEach(sh => alreadyShadowing.add(sh.id)));
                          const available = executives.filter(e =>
                            e.id !== exec.id &&
                            !data.shadows.some(s => s.id === e.id) &&
                            !alreadyShadowing.has(e.id)
                          );
                          if (available.length === 0) return (
                            <div className="text-center py-5">
                              <p className="text-2xl mb-1">🔍</p>
                              <p className="text-xs text-slate-400">No executives available</p>
                            </div>
                          );
                          return available.map(e => (
                            <button key={e.id} onClick={() => handleAssign(exec.id, e.id)}
                              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-indigo-50 transition-colors">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-[10px] font-bold ring-1 ring-white shadow-sm">
                                {(e.full_name || "?")[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{e.full_name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{e.email}</p>
                              </div>
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  ) : (
                    data.shadows.length === 0 ? (
                      <button onClick={() => setAssigning(exec.id)} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg ring-1 ring-indigo-200/60 transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Assign Shadow
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-md">1 shadow max</span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TAB_META = {
  profile: { icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  users: { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  shadows: { icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
  email: { icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  whatsapp: { icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  meetings: { icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  ai: { icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
};

export default function SettingsPage() {
  const user = useSelector((state) => state.auth.user);
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { key: "profile", label: "My Profile" },
    ...(isAdminOrManager ? [{ key: "users", label: "User Management" }] : []),
    ...(isAdminOrManager ? [{ key: "shadows", label: "Shadow Assignments" }] : []),
    { key: "email", label: "Email Accounts" },
    { key: "whatsapp", label: "WhatsApp Config" },
    { key: "meetings", label: "Meeting Platforms" },
    { key: "ai", label: "AI Config" },
  ];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 p-6 shadow-xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-violet-300/20 rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Settings</h1>
            <p className="text-indigo-100 text-sm mt-0.5">Configure integrations &amp; manage your account</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-1.5 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={TAB_META[tab.key]?.icon} />
                </svg>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "profile" && <ProfileTab user={user} />}
      {activeTab === "users" && isAdminOrManager && <UserManagementTab />}
      {activeTab === "shadows" && isAdminOrManager && <ShadowAssignmentsTab />}
      {activeTab === "email" && <EmailAccountsTab />}
      {activeTab === "whatsapp" && <WhatsAppConfigTab />}
      {activeTab === "meetings" && <MeetingPlatformsTab />}
      {activeTab === "ai" && <AIConfigTab />}
    </div>
  );
}
