"use client";
import { useEffect, useState } from "react";
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

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const pipelineStages = data?.pipeline_by_stage || [];
  const maxStageCount = Math.max(...pipelineStages.map((s) => s.count), 1);

  const clientsByCountry = (data?.clients_by_country || []).slice(0, 10);
  const maxCountryCount = Math.max(...clientsByCountry.map((c) => c.count), 1);

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Business intelligence and reports"
        action={
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            <HiOutlineArrowPath className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatsCard
          title="Total Clients"
          value={data?.clients?.total || 0}
          icon={HiOutlineUsers}
          color="indigo"
        />
        <StatsCard
          title="Active Clients"
          value={data?.clients?.active || 0}
          icon={HiOutlineUserGroup}
          color="green"
        />
        <StatsCard
          title="Total Orders"
          value={data?.orders?.total || 0}
          icon={HiOutlineShoppingCart}
          color="blue"
        />
        <StatsCard
          title="Revenue"
          value={`$${Number(data?.revenue?.total || 0).toLocaleString()}`}
          icon={HiOutlineBanknotes}
          color="purple"
        />
        <StatsCard
          title="Pending Tasks"
          value={data?.tasks?.pending || 0}
          icon={HiOutlineClock}
          color="yellow"
        />
        <StatsCard
          title="Overdue Tasks"
          value={data?.tasks?.overdue || 0}
          icon={HiOutlineExclamationTriangle}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Pipeline by Stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline by Stage</h2>
          {pipelineStages.length > 0 ? (
            <div className="space-y-4">
              {pipelineStages.map((stage, idx) => (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {stage.stage.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        ${Number(stage.value || 0).toLocaleString()}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{stage.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${stageColors[idx % stageColors.length]}`}
                      style={{ width: `${(stage.count / maxStageCount) * 100}%`, minWidth: stage.count > 0 ? "12px" : "0" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No pipeline data available</p>
          )}
        </div>

        {/* Clients by Country */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clients by Country</h2>
          {clientsByCountry.length > 0 ? (
            <div className="space-y-3">
              {clientsByCountry.map((item, idx) => (
                <div key={item.country} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-28 truncate flex-shrink-0">
                    {item.country || "Unknown"}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${countryBarColors[idx % countryBarColors.length]}`}
                      style={{ width: `${(item.count / maxCountryCount) * 100}%`, minWidth: item.count > 0 ? "12px" : "0" }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right flex-shrink-0">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No country data available</p>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <HiOutlineFunnel className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-purple-600 font-medium">Active Inquiries</p>
                <p className="text-2xl font-bold text-purple-900">
                  {data?.pipeline?.active_inquiries || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <HiOutlineClock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-yellow-600 font-medium">Pending Approvals</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {data?.pipeline?.pending_approvals || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <HiOutlineCheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-green-600 font-medium">Active Orders</p>
                <p className="text-2xl font-bold text-green-900">
                  {data?.orders?.active || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
