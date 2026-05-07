"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import StatsCard from "@/components/ui/StatsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  HiOutlineUsers,
  HiOutlineClipboardDocumentList,
  HiOutlineFunnel,
  HiOutlineShoppingCart,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlineUserGroup,
  HiOutlineTruck,
} from "react-icons/hi2";

// Order status -> overall progress %. Mirrors the Shipments page so the
// dashboard's Active Orders bar tracks the same workflow milestones.
// FIRC (11th step) overrides to 100%.
const ORDER_STATUS_PROGRESS = {
  pif_sent: 9,
  factory_ready: 18,
  docs_preparing: 27,
  inspection: 36,
  inspection_passed: 50,
  container_booked: 60,
  docs_approved: 70,
  dispatched: 75,
  in_transit: 80,
  arrived: 90,
  delivered: 90,
};

function ShadowClientsPopup({ clients, onClose }) {
  if (!clients || clients.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <HiOutlineUserGroup className="w-5 h-5 text-amber-500" />
            Shared Accounts
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <HiOutlineXMark className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          You are the shadow executive for these accounts.
        </p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {clients.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100"
            >
              <span className="text-sm font-medium text-gray-800">{c.company_name}</span>
              <div className="flex items-center gap-2">
                {c.country && (
                  <span className="text-xs text-gray-500">{c.country}</span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.status === "active"
                      ? "bg-green-100 text-green-700"
                      : c.status === "prospect"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DashboardContent({ s, router, label, isPrivileged }) {
  if (!s) return null;
  return (
    <>
      {/* Stats Cards — clickable, navigate to the relevant page */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title={`${label} Accounts`}
          value={s.clients?.total || 0}
          icon={HiOutlineUsers}
          color="indigo"
          subtitle={`${s.clients?.active || 0} active`}
          onClick={() => router.push("/clients")}
        />
        <StatsCard
          title="Open Tasks"
          value={(s.tasks?.pending || 0) + (s.tasks?.in_progress || 0)}
          icon={HiOutlineClipboardDocumentList}
          color="yellow"
          subtitle={`${s.tasks?.overdue || 0} overdue`}
          onClick={() => router.push("/tasks")}
        />
        <StatsCard
          title="Active Shipments"
          value={s.orders?.in_motion || 0}
          icon={HiOutlineTruck}
          color="purple"
          subtitle={`${s.orders?.in_transit || 0} in transit`}
          onClick={() => router.push("/shipments")}
        />
        <StatsCard
          title="Sales Orders"
          value={s.orders?.active || 0}
          icon={HiOutlineShoppingCart}
          color="green"
          onClick={() => router.push("/orders")}
        />
      </div>

      {/* Action Items */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isPrivileged ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-4"} gap-3 mb-6`}>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-amber-100" onClick={() => router.push("/communications?tab=unread_email")}>
          <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center"><span className="text-lg">📧</span></div>
          <div><p className="text-2xl font-bold text-amber-800">{s.unread_emails || 0}</p><p className="text-xs text-amber-600">Unread Emails</p></div>
        </div>
        {isPrivileged && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-purple-100" onClick={() => router.push("/finance?tab=payments")}>
            <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center"><span className="text-lg">💰</span></div>
            <div><p className="text-2xl font-bold text-purple-800">{s.overdue_payments || 0}</p><p className="text-xs text-purple-600">Overdue Payments</p></div>
          </div>
        )}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-orange-100" onClick={() => router.push("/quotations?status=pending_approval")}>
          <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center"><span className="text-lg">📋</span></div>
          <div><p className="text-2xl font-bold text-orange-800">{s.quotations_summary?.pending_approval || 0}</p><p className="text-xs text-orange-600">Pending Approval</p></div>
        </div>
        {isPrivileged && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-blue-100" onClick={() => router.push("/orders")}>
            <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center"><span className="text-lg">📦</span></div>
            <div><p className="text-2xl font-bold text-blue-800">{s.pending_orders || 0}</p><p className="text-xs text-blue-600">Pending Orders</p></div>
          </div>
        )}
        {isPrivileged && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-cyan-100" onClick={() => router.push("/samples")}>
            <div className="w-10 h-10 rounded-full bg-cyan-200 flex items-center justify-center"><span className="text-lg">🧪</span></div>
            <div><p className="text-2xl font-bold text-cyan-800">{s.pending_samples || 0}</p><p className="text-xs text-cyan-600">Pending Samples</p></div>
          </div>
        )}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-red-100" onClick={() => router.push("/tasks")}>
          <div className="w-10 h-10 rounded-full bg-red-200 flex items-center justify-center"><span className="text-lg">⚠️</span></div>
          <div><p className="text-2xl font-bold text-red-800">{s.tasks?.overdue || 0}</p><p className="text-xs text-red-600">Overdue Tasks</p></div>
        </div>
      </div>

      {/* Tasks + Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Pending Tasks</h2>
            <button onClick={() => router.push("/tasks")} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View All</button>
          </div>
          {s.recent_tasks?.length > 0 ? (
            <div className="space-y-2">
              {s.recent_tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 cursor-pointer" onClick={() => router.push(`/tasks?focus=${t.id}`)}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-orange-500" : t.priority === "medium" ? "bg-yellow-500" : "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                    <p className="text-[10px] text-gray-400">{t.client__company_name || "No client"}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.status === "in_progress" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>{t.status === "in_progress" ? "In Progress" : "Pending"}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">No pending tasks</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Tasks Overview</h2>
          <div className="space-y-3">
            {[
              { label: "Pending", count: s.tasks?.pending || 0, color: "#d97706", filter: "pending" },
              { label: "In Progress", count: s.tasks?.in_progress || 0, color: "#2563eb", filter: "in_progress" },
              { label: "Completed", count: s.tasks?.completed || 0, color: "#059669", filter: "completed" },
              { label: "Overdue", count: s.tasks?.overdue || 0, color: "#dc2626", filter: "overdue" },
            ].map(({ label: l, count, color, filter }) => {
              const total = (s.tasks?.pending || 0) + (s.tasks?.in_progress || 0) + (s.tasks?.completed || 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={l} className="cursor-pointer" onClick={() => router.push(`/tasks?status=${filter}`)}>
                  <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-600 hover:text-gray-900">{l}</span><span className="text-xs font-semibold" style={{ color }}>{count}</span></div>
                  <div className="w-full bg-gray-100 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Samples + Quotations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Samples</h2>
            <button onClick={() => router.push("/samples")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Requested", count: s.samples_summary?.requested || 0, color: "text-amber-600", bg: "bg-amber-50", hover: "hover:bg-amber-100", filter: "requested" },
              { label: "Replied", count: s.samples_summary?.replied || 0, color: "text-blue-600", bg: "bg-blue-50", hover: "hover:bg-blue-100", filter: "replied" },
              { label: "Prepared", count: s.samples_summary?.prepared || 0, color: "text-indigo-600", bg: "bg-indigo-50", hover: "hover:bg-indigo-100", filter: "prepared" },
              { label: "Dispatched", count: s.samples_summary?.dispatched || 0, color: "text-emerald-600", bg: "bg-emerald-50", hover: "hover:bg-emerald-100", filter: "dispatched" },
            ].map(({ label: l, count, color, bg, hover, filter }) => (
              <div key={l} className={`${bg} ${hover} rounded-lg p-3 text-center cursor-pointer transition-colors`} onClick={() => router.push(`/samples?status=${filter}`)}><p className={`text-xl font-bold ${color}`}>{count}</p><p className="text-[10px] text-gray-500">{l}</p></div>
            ))}
          </div>
          {s.recent_samples?.length > 0 ? (
            <div className="space-y-2">
              {s.recent_samples.map((sm, i) => {
                const statusBadge = {
                  requested: "bg-amber-50 text-amber-700",
                  replied: "bg-blue-50 text-blue-700",
                  prepared: "bg-indigo-50 text-indigo-700",
                  payment_received: "bg-purple-50 text-purple-700",
                  dispatched: "bg-emerald-50 text-emerald-700",
                  delivered: "bg-teal-50 text-teal-700",
                  feedback_pending: "bg-orange-50 text-orange-700",
                  feedback_received: "bg-gray-100 text-gray-600",
                }[sm.status] || "bg-gray-50 text-gray-600";
                return (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/samples/${sm.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{sm.sample_number || sm.product_name || "Sample"}</p>
                      <p className="text-[10px] text-gray-400 truncate">{sm.client__company_name}{sm.product_name && sm.sample_number ? ` • ${sm.product_name}` : ""}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${statusBadge}`}>{sm.status?.replace(/_/g, " ")}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">No active samples</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Quotations</h2>
            <button onClick={() => router.push("/quotations")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Draft", count: s.quotations_summary?.draft || 0, color: "text-gray-600", bg: "bg-gray-50", hover: "hover:bg-gray-100", filter: "draft" },
              { label: "Pending", count: s.quotations_summary?.pending_approval || 0, color: "text-orange-600", bg: "bg-orange-50", hover: "hover:bg-orange-100", filter: "pending_approval" },
              { label: "Approved", count: s.quotations_summary?.approved || 0, color: "text-green-600", bg: "bg-green-50", hover: "hover:bg-green-100", filter: "approved" },
              { label: "Sent", count: s.quotations_summary?.sent || 0, color: "text-blue-600", bg: "bg-blue-50", hover: "hover:bg-blue-100", filter: "sent" },
            ].map(({ label: l, count, color, bg, hover, filter }) => (
              <div key={l} className={`${bg} ${hover} rounded-lg p-3 text-center cursor-pointer transition-colors`} onClick={() => router.push(`/quotations?status=${filter}`)}><p className={`text-xl font-bold ${color}`}>{count}</p><p className="text-[10px] text-gray-500">{l}</p></div>
            ))}
          </div>
          {s.pending_quotations?.length > 0 && (
            <div className="space-y-2">
              {s.pending_quotations.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/quotations?focus=${q.id}`)}>
                  <div><p className="text-sm font-medium text-gray-800">{q.quotation_number}</p><p className="text-[10px] text-gray-400">{q.client__company_name}</p></div>
                  <p className="text-sm font-semibold text-green-700">{q.currency} {Number(q.total).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Orders */}
      {s.recent_orders?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Active Orders</h2>
            <button onClick={() => router.push("/orders")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          <div className="space-y-2">
            {s.recent_orders.map((o, i) => {
              const pct = o.firc_received_at ? 100 : (ORDER_STATUS_PROGRESS[o.status] ?? 0);
              const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-indigo-500" : pct >= 36 ? "bg-amber-500" : "bg-rose-400";
              return (
                <div key={i} className="flex items-center gap-4 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0"><span className="text-sm">📦</span></div>
                    <div className="min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{o.order_number}</p><p className="text-[10px] text-gray-400 truncate">{o.client__company_name}</p></div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 w-40">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 tabular-nums">{pct}%</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{o.currency} {Number(o.total).toLocaleString()}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 capitalize">{o.status?.replace(/_/g, " ")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showShadow, setShowShadow] = useState(false);
  const [shadowView, setShadowView] = useState(false);
  const user = useSelector((state) => state.auth.user);
  const router = useRouter();
  const isExecutive = user?.role === "executive";
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const loadDashboard = () => {
    api.get("/analytics/dashboard/")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    // Poll every 15s while the tab is open. Combined with the focus &
    // visibility listeners below, the dashboard always reflects current
    // state without the user needing to manually refresh.
    const interval = setInterval(loadDashboard, 15000);
    const handleVisibility = () => { if (document.visibilityState === "visible") loadDashboard(); };
    const handleFocus = () => loadDashboard();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  const shadowClients = stats?.shadow_clients || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1">
          <button onClick={() => setShadowView(false)} className={`text-2xl font-bold ${!shadowView ? "text-gray-900" : "text-gray-400 hover:text-gray-600"} transition-colors`}>Dashboard</button>
          {isExecutive && shadowClients.length > 0 && (
            <>
              <span className="text-2xl text-gray-300 mx-1">/</span>
              <button onClick={() => setShadowView(true)} className={`text-2xl font-bold ${shadowView ? "text-amber-700" : "text-gray-400 hover:text-amber-600"} transition-colors`}>Shadow Dashboard</button>
              {shadowView && <span className="ml-2 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{shadowClients.length} accounts</span>}
            </>
          )}
        </div>
      </div>

      {shadowView && isExecutive ? (
        /* ═══ SHADOW DASHBOARD — same layout as main ═══ */
        <DashboardContent s={stats?.shadow_stats || {}} router={router} label="Shadow" isPrivileged={false} />
      ) : (
        /* ═══ MAIN DASHBOARD ═══ */
        <DashboardContent s={stats} router={router} label={isExecutive ? "My" : "Total"} isPrivileged={isPrivileged} />
      )}

      {showShadow && (
        <ShadowClientsPopup clients={shadowClients} onClose={() => setShowShadow(false)} />
      )}
    </div>
  );
}
