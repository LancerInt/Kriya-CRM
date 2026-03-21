"use client";
import { useEffect, useState } from "react";
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
} from "react-icons/hi2";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/analytics/dashboard/")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Clients"
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
          title="Pipeline Inquiries"
          value={stats?.pipeline?.total || 0}
          icon={HiOutlineFunnel}
          color="purple"
        />
        <StatsCard
          title="Active Orders"
          value={stats?.orders?.active || 0}
          icon={HiOutlineShoppingCart}
          color="green"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-4">Quick Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Pipeline by Stage</h3>
            {stats?.pipeline?.by_stage ? (
              <div className="space-y-2">
                {Object.entries(stats.pipeline.by_stage).map(([stage, count]) => (
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
    </div>
  );
}
