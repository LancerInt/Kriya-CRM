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

  // Stats
  const activeCount = list.filter(c => c.status === "active").length;
  const tier1Count = list.filter(c => c.tier === "tier_1").length;
  const tier2Count = list.filter(c => c.tier === "tier_2").length;
  const totalContacts = list.reduce((sum, c) => sum + (c.contact_count || 0), 0);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 p-6 shadow-xl">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-violet-300/20 rounded-full blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Accounts</h1>
              <p className="text-indigo-100 text-sm mt-0.5">{displayList.length} {displayList.length === 1 ? "account" : "accounts"} · {totalContacts} total contacts</p>
            </div>
          </div>
          <Link
            href="/clients/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-700 text-sm font-bold rounded-xl ring-1 ring-white/30 hover:shadow-lg hover:scale-[1.02] transition-all shadow-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Account
          </Link>
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-indigo-100">Total Accounts</p>
          <p className="relative text-3xl font-extrabold mt-1">{list.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-emerald-50">Active</p>
          <p className="relative text-3xl font-extrabold mt-1">{activeCount}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-rose-50">Tier 1 · VIP</p>
          <p className="relative text-3xl font-extrabold mt-1">{tier1Count}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-white shadow-md">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
          <p className="relative text-[10px] uppercase tracking-[0.12em] font-bold text-amber-50">Tier 2 · Priority</p>
          <p className="relative text-3xl font-extrabold mt-1">{tier2Count}</p>
        </div>
      </div>

      {/* Executive tabs: My Clients / Shadow Clients */}
      {isExecutive && (
        <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-200/70 shadow-sm w-fit">
          <button onClick={() => setTab("all")} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${tab === "all" ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            All <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${tab === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{list.length}</span>
          </button>
          <button onClick={() => setTab("my")} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${tab === "my" ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            My Accounts <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${tab === "my" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{myClients.length}</span>
          </button>
          <button onClick={() => setTab("shadow")} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${tab === "shadow" ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
            Shared <span className={`px-1.5 py-px rounded-full text-[10px] font-bold ${tab === "shadow" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>{shadowClients.length}</span>
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={displayList}
          loading={loading}
          emptyTitle="No accounts"
          emptyDescription={isExecutive ? "No accounts assigned to you" : "Create your first account to get started"}
          onRowClick={(row) => router.push(`/clients/${row.id}`)}
        />
      </div>
    </div>
  );
}
