"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
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

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showShadow, setShowShadow] = useState(false);
  const user = useSelector((state) => state.auth.user);
  const isExecutive = user?.role === "executive";

  useEffect(() => {
    api.get("/analytics/dashboard/")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  const shadowClients = stats?.shadow_clients || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {isExecutive && shadowClients.length > 0 && (
          <button
            onClick={() => setShowShadow(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
          >
            <HiOutlineUserGroup className="w-4 h-4" />
            Shared Accounts
            <span className="ml-1 bg-amber-200 text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {shadowClients.length}
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title={isExecutive ? "My Accounts" : "Total Accounts"}
          value={stats?.clients?.total || 0}
          icon={HiOutlineUsers}
          color="indigo"
          subtitle={`${stats?.clients?.active || 0} active`}
        />
        <StatsCard
          title="Open Tasks"
          value={stats?.tasks?.pending || 0}
          icon={HiOutlineClipboardDocumentList}
          color="yellow"
          subtitle={`${stats?.tasks?.overdue || 0} overdue`}
        />
        <StatsCard
          title="Active Leads"
          value={stats?.pipeline?.active_inquiries || 0}
          icon={HiOutlineFunnel}
          color="purple"
        />
        <StatsCard
          title="Sales Orders"
          value={stats?.orders?.active || 0}
          icon={HiOutlineShoppingCart}
          color="green"
        />
      </div>

      {/* Quick Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-4">Quick Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Leads by Stage</h3>
            {stats?.pipeline_by_stage && stats.pipeline_by_stage.length > 0 ? (
              <div className="space-y-2">
                {stats.pipeline_by_stage.map(({ stage, count }) => (
                  <div key={stage} className="flex items-center justify-between">
                    <span className="text-sm capitalize text-gray-700">{stage.replace(/_/g, " ")}</span>
                    <span className="text-sm font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No pipeline data</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Tasks Summary</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Pending</span>
                <span className="text-sm font-medium bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded">{stats?.tasks?.pending || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">In Progress</span>
                <span className="text-sm font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{stats?.tasks?.in_progress || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Completed</span>
                <span className="text-sm font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded">{stats?.tasks?.completed || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Overdue</span>
                <span className="text-sm font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded">{stats?.tasks?.overdue || 0}</span>
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
