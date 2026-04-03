"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";

export default function RecycleBinPage() {
  const user = useSelector((state) => state.auth.user);
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [restoring, setRestoring] = useState(null);
  const [archivedSenders, setArchivedSenders] = useState([]);

  const loadArchivedSenders = () => {
    api.get("/communications/archived-senders/").then(r => setArchivedSenders(r.data)).catch(() => {});
  };

  const handleUnarchiveSender = async (sender) => {
    try {
      await api.post("/communications/unarchive-sender/", { id: sender.id });
      toast.success(`${sender.email} removed from auto-archive list`);
      loadArchivedSenders();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to unarchive")); }
  };

  const loadItems = () => {
    setLoading(true);
    api.get("/recycle-bin/")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadItems(); loadArchivedSenders(); }, []);

  const handleRestore = async (item) => {
    setRestoring(item.id);
    try {
      await api.post("/recycle-bin/restore/", { model: item.model, id: item.id });
      toast.success(`"${item.name}" restored`);
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to restore")); }
    finally { setRestoring(null); }
  };

  const handlePurge = async (item) => {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await api.post("/recycle-bin/purge/", { model: item.model, id: item.id });
      toast.success("Permanently deleted");
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  const handleEmptyAll = async () => {
    if (!confirm("Permanently delete ALL items in the recycle bin? This cannot be undone.")) return;
    try {
      const res = await api.post("/recycle-bin/empty/");
      toast.success(res.data.status);
      loadItems();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to empty")); }
  };

  const types = ["all", ...new Set(items.map((i) => i.type))];
  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  return (
    <div>
      <PageHeader
        title="Archive"
        subtitle={`${items.length} archived item${items.length !== 1 ? "s" : ""}`}
        action={
          isAdminOrManager && items.length > 0 ? (
            <button onClick={handleEmptyAll} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">
              Empty Archive
            </button>
          ) : null
        }
      />

      {items.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                filter === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t === "all" ? "All" : t} {t !== "all" ? `(${items.filter((i) => i.type === t).length})` : ""}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          <p className="text-gray-500 font-medium">Archive is empty</p>
          <p className="text-sm text-gray-400 mt-1">Archived items will appear here for 30 days before permanent removal</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Deleted</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Auto-purge in</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <tr key={`${item.model}-${item.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.type.toLowerCase()} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.deleted_at ? format(new Date(item.deleted_at), "MMM d, yyyy h:mm a") : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      item.days_left <= 5 ? "bg-red-50 text-red-700" :
                      item.days_left <= 15 ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {item.days_left} day{item.days_left !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={restoring === item.id}
                        className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
                      >
                        {restoring === item.id ? "Restoring..." : "Restore"}
                      </button>
                      <button
                        onClick={() => handlePurge(item)}
                        className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Archived Senders Section */}
      {isAdminOrManager && archivedSenders.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">Auto-Archived Senders</h3>
            <p className="text-xs text-gray-500 mt-0.5">Future emails from these senders are automatically archived. Remove to stop auto-archiving.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Sender Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Archived By</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Date</th>
                <th className="text-right px-4 py-2 font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {archivedSenders.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{s.email}</td>
                  <td className="px-4 py-2 text-gray-500">{s.archived_by || "-"}</td>
                  <td className="px-4 py-2 text-gray-500">{(() => { try { return format(new Date(s.created_at), "MMM d, yyyy"); } catch { return "-"; } })()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleUnarchiveSender(s)} className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100">
                      Unarchive Sender
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <p className="font-medium">How Archive works:</p>
        <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-700">
          <li>Deleted items from <strong>Activities, Inquiries, Proforma Invoices, Accounts, Quotes, Sales Orders</strong> and all other modules are moved here</li>
          <li><strong>Promotions, Spam, Social, Updates</strong> emails are <strong>auto-archived after 2 days</strong></li>
          <li>All archived items are <strong>stored for 30 days</strong>, then permanently deleted</li>
          <li>Click <strong>Restore</strong> to recover an item back to its original location</li>
          <li>Click <strong>Delete Forever</strong> to permanently remove immediately</li>
          {isAdminOrManager && <li><strong>Empty Archive</strong> permanently removes everything (admin/manager only)</li>}
          {isAdminOrManager && <li><strong>Auto-Archived Senders</strong> shows senders whose emails are automatically archived. Click "Unarchive Sender" to stop.</li>}
        </ul>
      </div>
    </div>
  );
}
