"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import StatsCard from "@/components/ui/StatsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import AISummaryButton from "@/components/ai/AISummaryButton";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
              <HiOutlineUserGroup className="w-4 h-4 text-white" />
            </div>
            Shared Accounts
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors">
            <HiOutlineXMark className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-3">You are the shadow executive for these accounts.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {clients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200/60"
              >
                <span className="text-sm font-bold text-slate-800">{c.company_name}</span>
                <div className="flex items-center gap-2">
                  {c.country && <span className="text-[11px] text-slate-500 font-medium">{c.country}</span>}
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${
                      c.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : c.status === "prospect" ? "bg-blue-50 text-blue-700 ring-blue-200"
                      : "bg-slate-100 text-slate-500 ring-slate-200"
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
            className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white text-sm font-bold hover:shadow-md transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardStat({ title, value, subtitle, icon: Icon, gradient, onClick }) {
  return (
    <div
      onClick={onClick}
      role="button"
      className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200/70 shadow-sm p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-200 transition-all"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
          {subtitle && <p className="mt-1 text-[11px] text-slate-500 font-medium">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionChip({ icon, value, label, gradient, ringTone, onClick }) {
  return (
    <div
      onClick={onClick}
      role="button"
      className={`relative overflow-hidden rounded-2xl bg-white border ${ringTone} shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.06]`} />
      <div className={`relative shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm text-white`}>
        {icon}
      </div>
      <div className="relative min-w-0">
        <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function DashboardContent({ s, router, label, isPrivileged }) {
  if (!s) return null;
  return (
    <>
      {/* Stats Cards — clickable, navigate to the relevant page */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <DashboardStat
          title={`${label} Accounts`}
          value={s.clients?.total || 0}
          subtitle={`${s.clients?.active || 0} active`}
          icon={HiOutlineUsers}
          gradient="from-indigo-500 to-violet-600"
          onClick={() => router.push("/clients")}
        />
        <DashboardStat
          title="Open Tasks"
          value={(s.tasks?.pending || 0) + (s.tasks?.in_progress || 0)}
          subtitle={`${s.tasks?.overdue || 0} overdue`}
          icon={HiOutlineClipboardDocumentList}
          gradient="from-amber-500 to-orange-500"
          onClick={() => router.push("/tasks")}
        />
        <DashboardStat
          title="Active Shipments"
          value={s.orders?.in_motion || 0}
          subtitle={`${s.orders?.in_transit || 0} in transit`}
          icon={HiOutlineTruck}
          gradient="from-purple-500 to-violet-500"
          onClick={() => router.push("/shipments")}
        />
        <DashboardStat
          title="Sales Orders"
          value={s.orders?.active || 0}
          icon={HiOutlineShoppingCart}
          gradient="from-emerald-500 to-emerald-600"
          onClick={() => router.push("/orders")}
        />
      </div>

      {/* Action Items */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isPrivileged ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-4"} gap-3 mb-6`}>
        <ActionChip
          value={s.unread_emails || 0}
          label="Unread Emails"
          gradient="from-amber-500 to-amber-600"
          ringTone="border-amber-200/60"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
          onClick={() => router.push("/communications?tab=unread_email")}
        />
        {isPrivileged && (
          <ActionChip
            value={s.overdue_payments || 0}
            label="Overdue Payments"
            gradient="from-purple-500 to-purple-600"
            ringTone="border-purple-200/60"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            onClick={() => router.push("/finance?tab=payments")}
          />
        )}
        <ActionChip
          value={s.quotations_summary?.pending_approval || 0}
          label="Pending Approval"
          gradient="from-orange-500 to-orange-600"
          ringTone="border-orange-200/60"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          onClick={() => router.push("/quotations?status=pending_approval")}
        />
        {isPrivileged && (
          <ActionChip
            value={s.pending_orders || 0}
            label="Pending Orders"
            gradient="from-blue-500 to-indigo-500"
            ringTone="border-blue-200/60"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
            onClick={() => router.push("/orders")}
          />
        )}
        {isPrivileged && (
          <ActionChip
            value={s.pending_samples || 0}
            label="Pending Samples"
            gradient="from-cyan-500 to-teal-500"
            ringTone="border-cyan-200/60"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
            onClick={() => router.push("/samples")}
          />
        )}
        <ActionChip
          value={s.tasks?.overdue || 0}
          label="Overdue Tasks"
          gradient="from-rose-500 to-rose-600"
          ringTone="border-rose-200/60"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          onClick={() => router.push("/tasks")}
        />
      </div>

      {/* Tasks + Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50/40 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Pending Tasks</h2>
                <p className="text-[11px] text-slate-500">Latest action items</p>
              </div>
            </div>
            <button onClick={() => router.push("/tasks")} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-bold">
              View All
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="p-4">
            {s.recent_tasks?.length > 0 ? (
              <div className="space-y-2">
                {s.recent_tasks.map((t, i) => {
                  const priorityTone = t.priority === "urgent" ? "from-rose-500 to-rose-600" : t.priority === "high" ? "from-orange-500 to-orange-600" : t.priority === "medium" ? "from-amber-500 to-amber-600" : "from-slate-400 to-slate-500";
                  return (
                    <div key={i} className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50/60 border border-slate-100 cursor-pointer transition-all" onClick={() => router.push(`/tasks?focus=${t.id}`)}>
                      <div className={`shrink-0 w-2 h-10 rounded-full bg-gradient-to-b ${priorityTone}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">{t.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{t.client__company_name || "No client"}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ring-1 shrink-0 ${t.status === "in_progress" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>{t.status === "in_progress" ? "In Progress" : "Pending"}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-sm font-semibold text-slate-500">No pending tasks</p>
                <p className="text-[11px] text-slate-400 mt-0.5">You're all caught up!</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-indigo-50/40 to-white">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Tasks Overview</h2>
              <p className="text-[11px] text-slate-500">Distribution by status</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Pending", count: s.tasks?.pending || 0, fromColor: "from-amber-400", toColor: "to-amber-500", textColor: "text-amber-600", filter: "pending" },
              { label: "In Progress", count: s.tasks?.in_progress || 0, fromColor: "from-blue-400", toColor: "to-blue-500", textColor: "text-blue-600", filter: "in_progress" },
              { label: "Completed", count: s.tasks?.completed || 0, fromColor: "from-emerald-400", toColor: "to-emerald-500", textColor: "text-emerald-600", filter: "completed" },
              { label: "Overdue", count: s.tasks?.overdue || 0, fromColor: "from-rose-400", toColor: "to-rose-500", textColor: "text-rose-600", filter: "overdue" },
            ].map(({ label: l, count, fromColor, toColor, textColor, filter }) => {
              const total = (s.tasks?.pending || 0) + (s.tasks?.in_progress || 0) + (s.tasks?.completed || 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={l} className="cursor-pointer group" onClick={() => router.push(`/tasks?status=${filter}`)}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">{l}</span>
                    <span className={`text-xs font-extrabold ${textColor}`}>{count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-2.5 rounded-full bg-gradient-to-r ${fromColor} ${toColor} shadow-sm transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Samples + Quotations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-cyan-50/40 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Samples</h2>
                <p className="text-[11px] text-slate-500">Pipeline status</p>
              </div>
            </div>
            <button onClick={() => router.push("/samples")} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-bold">
              View All
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { label: "Requested", count: s.samples_summary?.requested || 0, gradient: "from-amber-500 to-orange-500", filter: "requested" },
                { label: "Replied", count: s.samples_summary?.replied || 0, gradient: "from-blue-500 to-indigo-500", filter: "replied" },
                { label: "Prepared", count: s.samples_summary?.prepared || 0, gradient: "from-indigo-500 to-violet-500", filter: "prepared" },
                { label: "Dispatched", count: s.samples_summary?.dispatched || 0, gradient: "from-emerald-500 to-emerald-600", filter: "dispatched" },
              ].map(({ label: l, count, gradient, filter }) => (
                <div key={l} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} p-3 text-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm`} onClick={() => router.push(`/samples?status=${filter}`)}>
                  <div className="absolute -right-2 -top-2 w-8 h-8 bg-white/10 rounded-full blur-md" />
                  <p className="relative text-2xl font-extrabold text-white">{count}</p>
                  <p className="relative text-[9px] font-bold uppercase tracking-wider text-white/90">{l}</p>
                </div>
              ))}
            </div>
            {s.recent_samples?.length > 0 ? (
              <div className="space-y-2">
                {s.recent_samples.map((sm, i) => {
                  const statusTone = {
                    requested: "bg-amber-50 text-amber-700 ring-amber-200",
                    replied: "bg-blue-50 text-blue-700 ring-blue-200",
                    prepared: "bg-indigo-50 text-indigo-700 ring-indigo-200",
                    payment_received: "bg-purple-50 text-purple-700 ring-purple-200",
                    dispatched: "bg-emerald-50 text-emerald-700 ring-emerald-200",
                    delivered: "bg-teal-50 text-teal-700 ring-teal-200",
                    feedback_pending: "bg-orange-50 text-orange-700 ring-orange-200",
                    feedback_received: "bg-slate-100 text-slate-600 ring-slate-200",
                  }[sm.status] || "bg-slate-100 text-slate-600 ring-slate-200";
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => router.push(`/samples/${sm.id}`)}>
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-100 to-teal-100 text-cyan-700 flex items-center justify-center text-xs font-bold ring-1 ring-cyan-200/60">
                        🧪
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{sm.sample_number || sm.product_name || "Sample"}</p>
                        <p className="text-[11px] text-slate-400 truncate">{sm.client__company_name}{sm.product_name && sm.sample_number ? ` · ${sm.product_name}` : ""}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ring-1 capitalize shrink-0 ${statusTone}`}>{sm.status?.replace(/_/g, " ")}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-2">
                  <span className="text-xl">🧪</span>
                </div>
                <p className="text-sm font-semibold text-slate-500">No active samples</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/40 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Quotations</h2>
                <p className="text-[11px] text-slate-500">Pipeline status</p>
              </div>
            </div>
            <button onClick={() => router.push("/quotations")} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-bold">
              View All
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { label: "Draft", count: s.quotations_summary?.draft || 0, gradient: "from-slate-500 to-slate-600", filter: "draft" },
                { label: "Pending", count: s.quotations_summary?.pending_approval || 0, gradient: "from-orange-500 to-orange-600", filter: "pending_approval" },
                { label: "Approved", count: s.quotations_summary?.approved || 0, gradient: "from-emerald-500 to-emerald-600", filter: "approved" },
                { label: "Sent", count: s.quotations_summary?.sent || 0, gradient: "from-blue-500 to-indigo-500", filter: "sent" },
              ].map(({ label: l, count, gradient, filter }) => (
                <div key={l} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} p-3 text-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm`} onClick={() => router.push(`/quotations?status=${filter}`)}>
                  <div className="absolute -right-2 -top-2 w-8 h-8 bg-white/10 rounded-full blur-md" />
                  <p className="relative text-2xl font-extrabold text-white">{count}</p>
                  <p className="relative text-[9px] font-bold uppercase tracking-wider text-white/90">{l}</p>
                </div>
              ))}
            </div>
            {s.pending_quotations?.length > 0 ? (
              <div className="space-y-2">
                {s.pending_quotations.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => router.push(`/quotations?focus=${q.id}`)}>
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center text-xs font-bold ring-1 ring-indigo-200/60">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{q.quotation_number}</p>
                      <p className="text-[11px] text-slate-400 truncate">{q.client__company_name}</p>
                    </div>
                    <p className="text-sm font-extrabold text-emerald-700 shrink-0">{q.currency} {Number(q.total).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-2">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <p className="text-sm font-semibold text-slate-500">No pending quotations</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Orders */}
      {s.recent_orders?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/40 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Active Orders</h2>
                <p className="text-[11px] text-slate-500">In-progress shipments</p>
              </div>
            </div>
            <button onClick={() => router.push("/orders")} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-bold">
              View All
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="p-4 space-y-2">
            {s.recent_orders.map((o, i) => {
              const pct = o.firc_received_at ? 100 : (ORDER_STATUS_PROGRESS[o.status] ?? 0);
              const barGradient = pct >= 100 ? "from-emerald-400 to-emerald-500" : pct >= 75 ? "from-indigo-400 to-violet-500" : pct >= 36 ? "from-amber-400 to-orange-500" : "from-rose-400 to-rose-500";
              return (
                <div key={i} className="group flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/60 hover:border-indigo-200 cursor-pointer transition-all" onClick={() => router.push(`/orders/${o.id}`)}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">{o.order_number}</p>
                      <p className="text-[11px] text-slate-400 truncate">{o.client__company_name}</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 w-44">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${barGradient} shadow-sm transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-extrabold text-slate-700 tabular-nums w-9 text-right">{pct}%</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-emerald-700">{o.currency} {Number(o.total).toLocaleString()}</p>
                    <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 capitalize">{o.status?.replace(/_/g, " ")}</span>
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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = user?.first_name || user?.full_name?.split(" ")[0] || "there";
  const heroGradient = shadowView ? "from-amber-500 via-orange-500 to-amber-600" : "from-indigo-600 via-violet-600 to-purple-600";

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${heroGradient} p-6 shadow-xl`}>
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
              {shadowView ? (
                <HiOutlineUserGroup className="w-7 h-7 text-white" />
              ) : (
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">{greeting}, {firstName}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <button onClick={() => setShadowView(false)} className={`text-2xl sm:text-3xl font-extrabold tracking-tight transition-all ${!shadowView ? "text-white" : "text-white/50 hover:text-white/80"}`}>Dashboard</button>
                {isExecutive && shadowClients.length > 0 && (
                  <>
                    <span className="text-2xl text-white/40">/</span>
                    <button onClick={() => setShadowView(true)} className={`text-2xl sm:text-3xl font-extrabold tracking-tight transition-all ${shadowView ? "text-white" : "text-white/50 hover:text-white/80"}`}>Shadow</button>
                    {shadowView && <span className="ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-white/20 backdrop-blur text-white rounded-full ring-1 ring-white/30">{shadowClients.length} accounts</span>}
                  </>
                )}
              </div>
              <p className="text-sm text-white/80 mt-1">{shadowView ? "Viewing shared accounts" : "Here's what's happening across your CRM"}</p>
            </div>
          </div>
          <div className="hidden sm:flex">
            <AISummaryButton
              variant="hero"
              title="Dashboard Summary"
              prompt={`Write a tight Dashboard summary using the pre-loaded CRM data. Structure with these sections (## headings):\n\n## Overview\nOne short line: active accounts, open tasks, pending orders, pending samples, active shipments, and unread emails.\n\n## Needs Attention\nUp to 5 items requiring action right now: overdue tasks, overdue payments, pending approvals, stuck orders. Format each as: type · what · why it's urgent.\n\n## Pipeline\nWhere business is concentrated today: top clients by activity, most active product line, and the biggest in-progress deal.\n\n## Notable Highlights\n2-3 wins or interesting signals from the last few days (recently dispatched orders, replies received, etc.).\n\n### Next Steps\n2-3 concrete actions the team should take today.\n\nKeep under 250 words. Don't enumerate every record — pick the most important.`}
            />
          </div>
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
