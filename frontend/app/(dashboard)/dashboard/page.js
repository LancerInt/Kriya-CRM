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
} from "react-icons/hi2";

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

function DashboardContent({ s, router, label }) {
  if (!s) return null;
  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title={`${label} Accounts`} value={s.clients?.total || 0} icon={HiOutlineUsers} color="indigo" subtitle={`${s.clients?.active || 0} active`} />
        <StatsCard title="Open Tasks" value={(s.tasks?.pending || 0) + (s.tasks?.in_progress || 0)} icon={HiOutlineClipboardDocumentList} color="yellow" subtitle={`${s.tasks?.overdue || 0} overdue`} />
        <StatsCard title="Active Leads" value={s.pipeline?.active_inquiries || 0} icon={HiOutlineFunnel} color="purple" />
        <StatsCard title="Sales Orders" value={s.orders?.active || 0} icon={HiOutlineShoppingCart} color="green" />
      </div>

      {/* Action Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-amber-100" onClick={() => router.push("/communications?tab=unread_email")}>
          <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center"><span className="text-lg">📧</span></div>
          <div><p className="text-2xl font-bold text-amber-800">{s.unread_emails || 0}</p><p className="text-xs text-amber-600">Unread Emails</p></div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-purple-100" onClick={() => router.push("/communications?tab=drafts")}>
          <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center"><span className="text-lg">✏️</span></div>
          <div><p className="text-2xl font-bold text-purple-800">{s.draft_emails || 0}</p><p className="text-xs text-purple-600">Pending AI Drafts</p></div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-orange-100" onClick={() => router.push("/quotations")}>
          <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center"><span className="text-lg">📋</span></div>
          <div><p className="text-2xl font-bold text-orange-800">{s.quotations_summary?.pending_approval || 0}</p><p className="text-xs text-orange-600">Pending Approval</p></div>
        </div>
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
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 border border-gray-100">
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
              { label: "Pending", count: s.tasks?.pending || 0, color: "#d97706" },
              { label: "In Progress", count: s.tasks?.in_progress || 0, color: "#2563eb" },
              { label: "Completed", count: s.tasks?.completed || 0, color: "#059669" },
              { label: "Overdue", count: s.tasks?.overdue || 0, color: "#dc2626" },
            ].map(({ label: l, count, color }) => {
              const total = (s.tasks?.pending || 0) + (s.tasks?.in_progress || 0) + (s.tasks?.completed || 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (<div key={l}><div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-600">{l}</span><span className="text-xs font-semibold" style={{ color }}>{count}</span></div><div className="w-full bg-gray-100 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} /></div></div>);
            })}
          </div>
        </div>
      </div>

      {/* Quotations + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Quotations</h2>
            <button onClick={() => router.push("/quotations")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Draft", count: s.quotations_summary?.draft || 0, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Pending", count: s.quotations_summary?.pending_approval || 0, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "Approved", count: s.quotations_summary?.approved || 0, color: "text-green-600", bg: "bg-green-50" },
              { label: "Sent", count: s.quotations_summary?.sent || 0, color: "text-blue-600", bg: "bg-blue-50" },
            ].map(({ label: l, count, color, bg }) => (
              <div key={l} className={`${bg} rounded-lg p-3 text-center`}><p className={`text-xl font-bold ${color}`}>{count}</p><p className="text-[10px] text-gray-500">{l}</p></div>
            ))}
          </div>
          {s.pending_quotations?.length > 0 && (
            <div className="space-y-2">
              {s.pending_quotations.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div><p className="text-sm font-medium text-gray-800">{q.quotation_number}</p><p className="text-[10px] text-gray-400">{q.client__company_name}</p></div>
                  <p className="text-sm font-semibold text-green-700">{q.currency} {Number(q.total).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Leads Pipeline</h2>
            <button onClick={() => router.push("/inquiries")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          {s.pipeline_by_stage?.length > 0 ? (
            <div className="space-y-3">
              {s.pipeline_by_stage.map(({ stage, count, value }) => (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: { inquiry: "#6366f1", discussion: "#3b82f6", sample: "#06b6d4", quotation: "#f59e0b", negotiation: "#f97316" }[stage] || "#9ca3af" }} />
                  <span className="text-sm capitalize text-gray-700 flex-1">{stage.replace(/_/g, " ")}</span>
                  <span className="text-sm font-semibold text-gray-800">{count}</span>
                  {value > 0 && <span className="text-[10px] text-gray-400">${Number(value).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-4">No active leads</p>}
        </div>
      </div>

      {/* Orders */}
      {s.recent_orders?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Active Orders</h2>
            <button onClick={() => router.push("/sales-orders")} className="text-xs text-indigo-600 font-medium">View All</button>
          </div>
          <div className="space-y-2">
            {s.recent_orders.map((o, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center"><span className="text-sm">📦</span></div>
                  <div><p className="text-sm font-medium text-gray-800">{o.order_number}</p><p className="text-[10px] text-gray-400">{o.client__company_name}</p></div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{o.currency} {Number(o.total).toLocaleString()}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 capitalize">{o.status?.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
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

  const loadDashboard = () => {
    api.get("/analytics/dashboard/")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    // Refresh when tab becomes visible
    const handleVisibility = () => { if (document.visibilityState === "visible") loadDashboard(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); };
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
        <DashboardContent s={stats?.shadow_stats || {}} router={router} label="Shadow" />
      ) : (
        /* ═══ MAIN DASHBOARD ═══ */
        <DashboardContent s={stats} router={router} label={isExecutive ? "My" : "Total"} />
      )}

      {showShadow && (
        <ShadowClientsPopup clients={shadowClients} onClose={() => setShowShadow(false)} />
      )}
    </div>
  );
}
