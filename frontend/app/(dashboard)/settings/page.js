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

  const loadAccounts = () => {
    setLoading(true);
    api.get("/communications/email-accounts/")
      .then((r) => setAccounts(r.data.results || r.data))
      .catch(() => toast.error("Failed to load email accounts"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAccounts(); }, []);

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

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Add Email Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No email accounts configured</p>
          <p className="text-sm text-gray-400 mt-1">Add an email account to start sending and receiving emails</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">IMAP Host</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Last Synced</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{acc.email}</p>
                    {acc.display_name && <p className="text-xs text-gray-500">{acc.display_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{acc.imap_host}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {acc.last_synced ? format(new Date(acc.last_synced), "MMM d, yyyy HH:mm") : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={acc.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleTestConnection(acc.id)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Test</button>
                      <button onClick={() => handleSyncNow(acc.id)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Sync</button>
                      <button onClick={() => handleDelete(acc.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Email Account" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Host *</label>
              <input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} required placeholder="imap.gmail.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMAP Port</label>
              <input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host *</label>
              <input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} required placeholder="smtp.gmail.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
              <input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.use_ssl} onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })} className="rounded" />
            <span className="text-sm text-gray-700">Use SSL</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Adding..." : "Add Account"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
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
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;
  }

  return (
    <>
      {/* Setup Guide */}
      {configs.length === 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-green-900 text-lg mb-3">WhatsApp Cloud API Setup Guide</h3>
          <p className="text-sm text-green-800 mb-4">Follow these steps to connect WhatsApp Business API (1,000 free conversations/month):</p>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
              <div>
                <p className="font-medium text-green-900">Create a Meta Developer Account</p>
                <p className="text-green-700">Go to <span className="font-mono bg-green-100 px-1 rounded">developers.facebook.com</span> and create a developer account</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
              <div>
                <p className="font-medium text-green-900">Create a Business App</p>
                <p className="text-green-700">Click &quot;My Apps&quot; &rarr; &quot;Create App&quot; &rarr; Select &quot;Business&quot; type &rarr; Add &quot;WhatsApp&quot; product</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
              <div>
                <p className="font-medium text-green-900">Get API Credentials</p>
                <p className="text-green-700">In your app dashboard &rarr; WhatsApp &rarr; API Setup. You&apos;ll find:</p>
                <ul className="list-disc list-inside mt-1 text-green-700 space-y-0.5">
                  <li><strong>Phone Number ID</strong> &mdash; under &quot;From&quot; phone number</li>
                  <li><strong>WhatsApp Business Account ID</strong> &mdash; shown at the top</li>
                  <li><strong>Temporary Access Token</strong> &mdash; click &quot;Generate&quot; (valid 24hrs)</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">4</span>
              <div>
                <p className="font-medium text-green-900">Get a Permanent Access Token</p>
                <p className="text-green-700">Go to <span className="font-mono bg-green-100 px-1 rounded">business.facebook.com</span> &rarr; Settings &rarr; System Users &rarr; Create system user &rarr; Generate token with <strong>whatsapp_business_messaging</strong> permission</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">5</span>
              <div>
                <p className="font-medium text-green-900">Configure Webhook (for receiving messages)</p>
                <p className="text-green-700">In WhatsApp &rarr; Configuration &rarr; Webhook:</p>
                <ul className="list-disc list-inside mt-1 text-green-700 space-y-0.5">
                  <li><strong>Callback URL</strong>: <span className="font-mono bg-green-100 px-1 rounded">https://your-domain.com/api/communications/whatsapp-webhook/</span></li>
                  <li><strong>Verify Token</strong>: <span className="font-mono bg-green-100 px-1 rounded">kriya_crm_webhook_verify</span> (same as below)</li>
                  <li>Subscribe to: <strong>messages</strong></li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">6</span>
              <div>
                <p className="font-medium text-green-900">Add Config Below</p>
                <p className="text-green-700">Click &quot;+ Add Config&quot; and paste your credentials. You can test with Meta&apos;s test phone number first.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Add Config
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No WhatsApp config added yet</p>
          <p className="text-sm text-gray-400 mt-1">Follow the setup guide above, then click &quot;+ Add Config&quot;</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Phone Number ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Business Account ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {configs.map((cfg) => (
                <tr key={cfg.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{cfg.phone_number_id}</td>
                  <td className="px-4 py-3 text-gray-600">{cfg.business_account_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={cfg.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(cfg.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add WhatsApp Config" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Get these values from: <strong>Meta Developer Dashboard</strong> &rarr; Your App &rarr; WhatsApp &rarr; API Setup
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID *</label>
              <input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} required placeholder="e.g. 106540352456789" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Found under &quot;From&quot; phone number in API Setup</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Account ID *</label>
              <input value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value })} required placeholder="e.g. 102938475612345" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Shown at the top of the WhatsApp API Setup page</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Token *</label>
            <input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} required placeholder="Paste your permanent access token" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            <p className="text-xs text-gray-400 mt-1">Use a permanent token from System Users (Business Settings), not the temporary one</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Verify Token *</label>
            <input value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            <p className="text-xs text-gray-400 mt-1">A custom string you create. Use the same value when configuring the webhook in Meta Dashboard.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Adding..." : "Add Config"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  const platformLabels = { zoom: "Zoom", google: "Google Meet", teams: "Microsoft Teams" };

  return (
    <>
      {/* Setup Guide */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-6">
        <h3 className="font-semibold text-blue-900 text-lg mb-3">Google Meet Setup (OAuth 2.0)</h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <div>
              <p className="font-medium text-blue-900">Create OAuth Credentials</p>
              <p className="text-blue-700">Go to <span className="font-mono bg-blue-100 px-1 rounded">console.cloud.google.com</span> &rarr; APIs &amp; Services &rarr; Credentials &rarr; &quot;+ Create Credentials&quot; &rarr; &quot;OAuth client ID&quot;</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <div>
              <p className="font-medium text-blue-900">Configure OAuth App</p>
              <ul className="list-disc list-inside text-blue-700 space-y-0.5">
                <li>Application type: <strong>Web application</strong></li>
                <li>Name: <strong>Kriya CRM</strong></li>
                <li>Authorized redirect URI: <span className="font-mono bg-blue-100 px-1 rounded">http://localhost:8000/api/meetings/google-oauth-callback/</span></li>
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <div>
              <p className="font-medium text-blue-900">Enable Google Calendar API</p>
              <p className="text-blue-700">Go to APIs &amp; Services &rarr; Library &rarr; Search &quot;Google Calendar API&quot; &rarr; Enable</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">4</span>
            <div>
              <p className="font-medium text-blue-900">Add Config &amp; Connect</p>
              <p className="text-blue-700">Copy <strong>Client ID</strong> and <strong>Client Secret</strong> &rarr; Click &quot;+ Add Platform&quot; below &rarr; Then click &quot;Connect Google Account&quot;</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add Platform</button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No meeting platforms configured</p>
          <p className="text-sm text-gray-400 mt-1">Add Google Meet or Zoom to auto-generate meeting links</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div key={cfg.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{platformLabels[cfg.platform] || cfg.platform}</h4>
                  {cfg.platform === "google" && cfg.google_user_email && (
                    <p className="text-sm text-gray-500 mt-0.5">Connected as: <span className="font-medium text-green-700">{cfg.google_user_email}</span></p>
                  )}
                  {cfg.platform === "google" && !cfg.is_connected && (
                    <p className="text-sm text-amber-600 mt-0.5">Not connected — click &quot;Connect Google Account&quot; to authorize</p>
                  )}
                  {cfg.platform === "zoom" && cfg.zoom_account_id && (
                    <p className="text-sm text-gray-500 mt-0.5">Account: {cfg.zoom_account_id}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={cfg.is_connected ? "connected" : "pending"} />
                  {cfg.platform === "google" && !cfg.is_connected && (
                    <button onClick={() => handleConnectGoogle(cfg.id)} disabled={connecting === cfg.id} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {connecting === cfg.id ? "Redirecting..." : "Connect Google Account"}
                    </button>
                  )}
                  <button onClick={() => handleDelete(cfg.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Meeting Platform" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="google">Google Meet</option>
              <option value="zoom">Zoom</option>
            </select>
          </div>

          {platform === "google" && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                Get these from: <strong>Google Cloud Console</strong> &rarr; APIs &amp; Services &rarr; Credentials &rarr; OAuth 2.0 Client ID
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID *</label>
                  <input value={googleForm.google_client_id} onChange={(e) => setGoogleForm({ ...googleForm, google_client_id: e.target.value })} required placeholder="xxxxx.apps.googleusercontent.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret *</label>
                  <input type="password" value={googleForm.google_client_secret} onChange={(e) => setGoogleForm({ ...googleForm, google_client_secret: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Calendar ID</label>
                <input value={googleForm.google_calendar_id} onChange={(e) => setGoogleForm({ ...googleForm, google_calendar_id: e.target.value })} placeholder="primary" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </>
          )}

          {platform === "zoom" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account ID *</label>
                <input value={zoomForm.zoom_account_id} onChange={(e) => setZoomForm({ ...zoomForm, zoom_account_id: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID *</label>
                  <input value={zoomForm.zoom_client_id} onChange={(e) => setZoomForm({ ...zoomForm, zoom_client_id: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret *</label>
                  <input type="password" value={zoomForm.zoom_client_secret} onChange={(e) => setZoomForm({ ...zoomForm, zoom_client_secret: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Adding..." : "Add Platform"}
            </button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  const modelOptions = {
    groq: [{ value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Free)" }, { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Fast (Free)" }, { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Free)" }],
    gemini: [{ value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }, { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
    claude: [{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }, { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }],
    openai: [{ value: "gpt-4o", label: "GPT-4o" }, { value: "gpt-4o-mini", label: "GPT-4o Mini" }],
  };

  return (
    <>
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 mb-6">
        <h3 className="font-semibold text-purple-900 text-lg mb-2">Kriya AI — Agentic OS</h3>
        <p className="text-sm text-purple-700 mb-3">Connect an AI provider to enable smart CRM features: auto-summaries, insights, drafting, and chat.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <p className="font-semibold text-green-800">Groq (Recommended)</p>
            <p className="text-green-600 text-xs">FREE: 30 req/min, 14,400/day</p>
            <p className="text-green-600 text-xs mt-1">Get key: <span className="font-mono bg-green-50 px-1 rounded">console.groq.com/keys</span></p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <p className="font-semibold text-purple-800">Google Gemini</p>
            <p className="text-purple-600 text-xs">Free tier: 15 req/min</p>
            <p className="text-purple-600 text-xs mt-1">Get key: <span className="font-mono bg-purple-50 px-1 rounded">aistudio.google.com</span></p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <p className="font-semibold text-purple-800">Claude / OpenAI</p>
            <p className="text-purple-600 text-xs">Paid: $2.50-3/M tokens</p>
            <p className="text-purple-600 text-xs mt-1">Best quality, requires billing</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add AI Provider</button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No AI provider configured</p>
          <p className="text-sm text-gray-400 mt-1">Add a provider to enable Kriya AI features</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((cfg) => (
            <div key={cfg.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <h4 className="font-semibold">{cfg.provider === "gemini" ? "Google Gemini" : cfg.provider === "claude" ? "Claude" : "OpenAI"}</h4>
                <p className="text-sm text-gray-500">Model: {cfg.model_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={cfg.is_active ? "active" : "inactive"} />
                <button onClick={() => handleDelete(cfg.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add AI Provider" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value, model_name: modelOptions[e.target.value]?.[0]?.value || "" })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="groq">Groq - Llama (Free)</option>
              <option value="gemini">Google Gemini</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI GPT</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              {(modelOptions[form.provider] || []).map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key *</label>
            <input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required placeholder={form.provider === "gemini" ? "Get from aistudio.google.com/apikey" : "Paste your API key"} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Adding..." : "Add Provider"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Profile & Password Tab ──
function ProfileTab() {
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Edit Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">Edit Profile</h3>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">Change Password</h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password *</label>
            <div className="relative">
              <input type={showOld ? "text" : "password"} value={pwForm.old_password} onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-10" />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showOld ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
              <div className="relative">
                <input type={showNew ? "text" : "password"} value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required minLength={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-10" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input type="password" value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} required minLength={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <button type="submit" disabled={changingPw} className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
            {changingPw ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">+ Add User</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Username</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.first_name} {u.last_name}</td>
                <td className="px-4 py-3 text-gray-600">{u.username}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                <td className="px-4 py-3"><StatusBadge status={u.is_active ? "active" : "inactive"} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {u.role !== "admin" && (
                      <button onClick={() => handleToggleActive(u)} className={`text-xs font-medium ${u.is_active ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}>
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New User" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="executive">Executive</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? "Creating..." : "Create User"}</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium">Executive Shadow Assignments</p>
        <p className="mt-1 text-amber-700">When you assign Executive A as shadow of Executive B, A gets full access to ALL of B's clients' emails, WhatsApp messages, and communications.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Executive</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Shadowed By</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {executives.map((exec) => {
              const data = shadows[exec.id] || { shadows: [], shadowing: [] };
              return (
                <tr key={exec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                        {(exec.full_name || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{exec.full_name}</p>
                        <p className="text-xs text-gray-400">{exec.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {data.shadows.length === 0 && <span className="text-xs text-gray-400">None</span>}
                      {data.shadows.map((s) => (
                        <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {s.name}
                          <button onClick={() => handleRemove(exec.id, s.id)} className="hover:text-red-600">&times;</button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {assigning === exec.id ? (
                      <div className="inline-block text-left w-56 bg-white border border-gray-200 rounded-xl shadow-lg">
                        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-700">Select Shadow</span>
                          <button onClick={() => setAssigning(null)} className="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
                        </div>
                        <div className="max-h-48 overflow-y-auto py-1">
                          {(() => {
                            // Get all executives already shadowing someone
                            const alreadyShadowing = new Set();
                            Object.values(shadows).forEach(s => s.shadows?.forEach(sh => alreadyShadowing.add(sh.id)));
                            const available = executives.filter(e =>
                              e.id !== exec.id &&
                              !data.shadows.some(s => s.id === e.id) &&
                              !alreadyShadowing.has(e.id)
                            );
                            if (available.length === 0) return <p className="text-xs text-gray-400 text-center py-3">No executives available</p>;
                            return available.map(e => (
                              <button key={e.id} onClick={() => handleAssign(exec.id, e.id)}
                                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-indigo-50 transition-colors">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                  {(e.full_name || "?")[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{e.full_name}</p>
                                  <p className="text-[10px] text-gray-400">{e.email}</p>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    ) : (
                      data.shadows.length === 0 ? (
                        <button onClick={() => setAssigning(exec.id)} className="px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                          + Assign Shadow
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">1 shadow max</span>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
    <div>
      <PageHeader title="Settings" subtitle="Configure integrations & manage your account" />

      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "users" && isAdminOrManager && <UserManagementTab />}
      {activeTab === "shadows" && isAdminOrManager && <ShadowAssignmentsTab />}
      {activeTab === "email" && <EmailAccountsTab />}
      {activeTab === "whatsapp" && <WhatsAppConfigTab />}
      {activeTab === "meetings" && <MeetingPlatformsTab />}
      {activeTab === "ai" && <AIConfigTab />}
    </div>
  );
}
