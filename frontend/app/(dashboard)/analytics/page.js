"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatsCard from "@/components/ui/StatsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import {
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineShoppingCart,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineFunnel,
  HiOutlineCheckCircle,
  HiOutlineArrowPath,
  HiOutlineXMark,
} from "react-icons/hi2";

const stageColors = [
  "bg-purple-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-orange-500",
  "bg-green-500",
  "bg-pink-500",
  "bg-red-500",
];

const countryBarColors = [
  "bg-indigo-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-yellow-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-purple-500",
];

function ShadowClientsPopup({ clients, onClose }) {
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
          You are the shadow executive for these accounts. Their data is included in your analytics.
        </p>
        {clients.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No shared accounts</p>
        ) : (
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
        )}
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

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showShadow, setShowShadow] = useState(false);
  const [viewMode, setViewMode] = useState("my"); // "my" | "shared" | "combined"
  const user = useSelector((state) => state.auth.user);
  const isExecutive = user?.role === "executive";

  const fetchData = () => {
    setLoading(true);
    api.get("/analytics/dashboard/")
      .then((res) => setData(res.data))
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  const shadowClients = data?.shadow_clients || [];
  const hasShadow = isExecutive && shadowClients.length > 0;
  const ss = data?.shadow_stats || {};

  // Pick the active dataset based on view mode
  const active = (() => {
    if (!isExecutive || viewMode === "my") return data;
    if (viewMode === "shared") return {
      ...data,
      clients: ss.clients || { total: 0, active: 0 },
      tasks: ss.tasks || {},
      orders: ss.orders || {},
      revenue: { total: (ss.orders?.total || 0) },
      pipeline: ss.pipeline || {},
      pipeline_by_stage: ss.pipeline_by_stage || [],
      clients_by_country: ss.clients_by_country || [],
    };
    // combined
    return {
      ...data,
      clients: {
        total: (data?.clients?.total || 0) + (ss.clients?.total || 0),
        active: (data?.clients?.active || 0) + (ss.clients?.active || 0),
      },
      tasks: {
        pending: (data?.tasks?.pending || 0) + (ss.tasks?.pending || 0),
        in_progress: (data?.tasks?.in_progress || 0) + (ss.tasks?.in_progress || 0),
        completed: (data?.tasks?.completed || 0) + (ss.tasks?.completed || 0),
        overdue: (data?.tasks?.overdue || 0) + (ss.tasks?.overdue || 0),
      },
      orders: {
        total: (data?.orders?.total || 0) + (ss.orders?.total || 0),
        active: (data?.orders?.active || 0) + (ss.orders?.active || 0),
      },
      revenue: { total: (data?.revenue?.total || 0) },
      pipeline: {
        active_inquiries: (data?.pipeline?.active_inquiries || 0) + (ss.pipeline?.active_inquiries || 0),
      },
    };
  })();

  const pipelineStages = active?.pipeline_by_stage || [];
  const maxStageCount = Math.max(...pipelineStages.map((s) => s.count), 1);

  const clientsByCountry = (active?.clients_by_country || []).slice(0, 10);
  const maxCountryCount = Math.max(...clientsByCountry.map((c) => c.count), 1);

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={isExecutive
          ? viewMode === "shared" ? "Shared accounts performance" : viewMode === "combined" ? "Combined portfolio" : "Your portfolio performance"
          : "Business intelligence and reports"}
        action={
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all"
          >
            <HiOutlineArrowPath className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      {/* View Mode Toggle — segmented pill control */}
      {hasShadow && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-1.5 inline-flex gap-1">
            {[
              { key: "my",       label: "My Accounts",     icon: "👤", count: data?.clients?.total || 0 },
              { key: "shared",   label: "Shared Accounts", icon: "🤝", count: ss.clients?.total || 0 },
              { key: "combined", label: "Combined",        icon: "📊", count: (data?.clients?.total || 0) + (ss.clients?.total || 0) },
            ].map((tab) => {
              const isActive = viewMode === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                    isActive
                      ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                      : "text-gray-500 hover:text-gray-800 hover:bg-white/60"
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-600"}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
          {viewMode === "shared" && (
            <button onClick={() => setShowShadow(true)} className="text-xs font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2">
              View shared accounts
            </button>
          )}
        </div>
      )}

      {/* Stat tiles — gradient cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">👤</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">{viewMode === "shared" ? "Shared" : viewMode === "combined" ? "All" : isExecutive ? "My" : "Total"} Accounts</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{active?.clients?.total || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">✓</span><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Active Clients</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{active?.clients?.active || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📦</span><span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Total Orders</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{active?.orders?.total || 0}</p>
        </div>
        {!isExecutive && (
          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-100 rounded-xl p-4">
            <div className="flex items-center gap-2"><span className="text-lg">💰</span><span className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Revenue</span></div>
            <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">${Number(active?.revenue?.total || 0).toLocaleString()}</p>
          </div>
        )}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⏳</span><span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Pending Tasks</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{active?.tasks?.pending || 0}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⚠️</span><span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Overdue Tasks</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{active?.tasks?.overdue || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pipeline by Stage */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-base">🔀</span>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-700">Pipeline by Stage</h2>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5">
              {pipelineStages.length} stages
            </span>
          </div>
          {pipelineStages.length > 0 ? (
            <div className="space-y-4">
              {pipelineStages.map((stage, idx) => (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-800 capitalize tracking-tight">
                      {stage.stage.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-2">
                      {stage.value > 0 && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 tabular-nums">
                          ${Number(stage.value || 0).toLocaleString()}
                        </span>
                      )}
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{stage.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${stageColors[idx % stageColors.length]} transition-all`}
                      style={{ width: `${(stage.count / maxStageCount) * 100}%`, minWidth: stage.count > 0 ? "8px" : "0" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">No pipeline data available</p>
            </div>
          )}
        </div>

        {/* Clients by Country */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="text-base">🌍</span>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-700">
                {isExecutive ? "My Accounts by Country" : "Clients by Country"}
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5">
              Top {clientsByCountry.length}
            </span>
          </div>
          {clientsByCountry.length > 0 ? (
            <div className="space-y-3">
              {clientsByCountry.map((item, idx) => (
                <div key={item.country} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-700 w-28 truncate flex-shrink-0">
                    {item.country || "Unknown"}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${countryBarColors[idx % countryBarColors.length]} transition-all`}
                      style={{ width: `${(item.count / maxCountryCount) * 100}%`, minWidth: item.count > 0 ? "8px" : "0" }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-8 text-right flex-shrink-0 tabular-nums">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">🗺️</div>
              <p className="text-sm">No country data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics — gradient tiles to match top */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-base">⭐</span>
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-700">Key Metrics</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-100 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
                <HiOutlineFunnel className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Active Inquiries</p>
                <p className="text-2xl font-bold text-gray-900 leading-none mt-1">
                  {active?.pipeline?.active_inquiries || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <HiOutlineClock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Pending Approvals</p>
                <p className="text-2xl font-bold text-gray-900 leading-none mt-1">
                  {active?.pipeline?.pending_approvals || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <HiOutlineCheckCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Active Orders</p>
                <p className="text-2xl font-bold text-gray-900 leading-none mt-1">
                  {active?.orders?.active || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showShadow && (
        <ShadowClientsPopup clients={shadowClients} onClose={() => setShowShadow(false)} />
      )}
    </div>
  );
}
