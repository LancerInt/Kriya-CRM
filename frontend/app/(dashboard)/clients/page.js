"use client";
import { useEffect, useCallback, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchClients } from "@/store/slices/clientSlice";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import ModernSelect from "@/components/ui/ModernSelect";
import Link from "next/link";
import toast from "react-hot-toast";

export default function ClientsPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading, count } = useSelector((state) => state.clients);
  const user = useSelector((state) => state.auth.user);
  const isExecutive = user?.role === "executive";
  const [tab, setTab] = useState("all");

  const loadClients = useCallback(() => {
    dispatch(fetchClients());
  }, [dispatch]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleStatusChange = async (clientId, newStatus, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/clients/${clientId}/`, { status: newStatus });
      toast.success(`Status changed to ${newStatus}`);
      loadClients();
    } catch { toast.error("Failed to update status"); }
  };

  const handleTierChange = async (clientId, newTier) => {
    try {
      await api.patch(`/clients/${clientId}/`, { tier: newTier });
      toast.success(`Tier updated`);
      loadClients();
    } catch { toast.error("Failed to update tier"); }
  };

  // For executives: split into my clients and shadow clients
  const myClients = useMemo(() => list.filter((c) => c.client_role === "primary"), [list]);
  const shadowClients = useMemo(() => list.filter((c) => c.client_role === "shadow"), [list]);
  const displayList = useMemo(() => {
    if (!isExecutive) return list;
    if (tab === "my") return myClients;
    if (tab === "shadow") return shadowClients;
    return list;
  }, [isExecutive, tab, list, myClients, shadowClients]);

  const columns = [
    { key: "company_name", label: "Account Name", render: (row) => (
      <div className="flex items-center gap-2">
        {row.tier === "tier_1" && <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200 animate-pulse" />}
        {row.tier === "tier_2" && <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" />}
        <span className={`font-medium ${row.tier === "tier_1" ? "text-red-700" : row.tier === "tier_2" ? "text-amber-700" : "text-gray-900"}`}>{row.company_name}</span>
        {isExecutive && row.client_role === "shadow" && (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">Shadow</span>
        )}
      </div>
    )},
    { key: "tier", label: "Tier", render: (row) => (
      <div onClick={e => e.stopPropagation()}>
        <ModernSelect value={row.tier || "tier_3"} onChange={(v) => handleTierChange(row.id, v)} size="xs" options={[
          { value: "tier_1", label: "Tier 1 - VIP", color: "#dc2626", dot: true },
          { value: "tier_2", label: "Tier 2 - Priority", color: "#d97706", dot: true },
          { value: "tier_3", label: "Tier 3 - Standard", color: "#6b7280", dot: true },
        ]} />
      </div>
    )},
    { key: "country", label: "Country" },
    { key: "status", label: "Status", render: (row) => (
      <div onClick={e => e.stopPropagation()}>
        <ModernSelect value={row.status} onChange={(v) => handleStatusChange(row.id, v)} size="xs" options={[
          { value: "active", label: "Active", color: "#059669", dot: true },
          { value: "prospect", label: "Prospect", color: "#d97706", dot: true },
          { value: "on_hold", label: "On Hold", color: "#7c3aed", dot: true },
          { value: "inactive", label: "Inactive", color: "#6b7280", dot: true },
        ]} />
      </div>
    )},
    { key: "contact_count", label: "Contacts", render: (row) => row.contact_count || 0 },
    { key: "primary_executive_name", label: "Account Owner", render: (row) => row.primary_executive_name || "-" },
  ];

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={`${displayList.length} account${displayList.length !== 1 ? "s" : ""}`}
        action={
          <Link
            href="/clients/new"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            + New Account
          </Link>
        }
      />

      {/* Executive tabs: My Clients / Shadow Clients */}
      {isExecutive && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab("all")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${tab === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            All ({list.length})
          </button>
          <button onClick={() => setTab("my")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${tab === "my" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            My Accounts ({myClients.length})
          </button>
          <button onClick={() => setTab("shadow")} className={`px-4 py-1.5 text-sm font-medium rounded-lg ${tab === "shadow" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
            Shared Accounts ({shadowClients.length})
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={displayList}
        loading={loading}
        emptyTitle="No accounts"
        emptyDescription={isExecutive ? "No accounts assigned to you" : "Create your first account to get started"}
        onRowClick={(row) => router.push(`/clients/${row.id}`)}
      />
    </div>
  );
}
