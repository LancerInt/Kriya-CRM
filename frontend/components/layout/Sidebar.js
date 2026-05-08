"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import {
  HiOutlineHome,
  HiOutlineUsers,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentList,
  HiOutlineFunnel,
  HiOutlineDocumentText,
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineShieldCheck,
  HiOutlineBeaker,
  HiOutlineBanknotes,
  HiOutlineFolder,
  HiOutlinePhone,
  HiOutlineChartBar,
  HiOutlineBell,
  HiOutlineCube,
  HiOutlineXMark,
  HiOutlineCog6Tooth,
  HiOutlineSparkles,
  HiOutlineUserGroup,
  HiOutlineTrash,
  HiOutlineInboxArrowDown,
  HiOutlineDocumentDuplicate,
} from "react-icons/hi2";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: HiOutlineHome },
      { name: "Accounts", href: "/clients", icon: HiOutlineUsers },
      { name: "Activities", href: "/communications", icon: HiOutlineChatBubbleLeftRight },
      { name: "Tasks", href: "/tasks", icon: HiOutlineClipboardDocumentList },
    ],
  },
  {
    label: "Sales",
    items: [
      { name: "Products", href: "/products", icon: HiOutlineCube },
      { name: "Sales Orders", href: "/orders", icon: HiOutlineShoppingCart },
      { name: "Shipments", href: "/shipments", icon: HiOutlineTruck },
      { name: "Samples", href: "/samples", icon: HiOutlineBeaker },
      { name: "Finance", href: "/finance", icon: HiOutlineBanknotes, adminOnly: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Quality", href: "/quality", icon: HiOutlineShieldCheck },
      { name: "Documents", href: "/documents", icon: HiOutlineFolder },
      { name: "Meetings", href: "/meetings", icon: HiOutlinePhone },
      { name: "Reports", href: "/analytics", icon: HiOutlineChartBar },
      { name: "Team Chat", href: "/team-chat", icon: HiOutlineUserGroup },
      { name: "Kriya AI", href: "/ai", icon: HiOutlineSparkles, accent: true },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Archive", href: "/recycle-bin", icon: HiOutlineTrash },
      { name: "Settings", href: "/settings", icon: HiOutlineCog6Tooth },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  const currentUser = useSelector((state) => state.auth.user);
  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-slate-200/70 shadow-[1px_0_3px_rgba(0,0,0,0.02)] transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="relative overflow-hidden h-20 px-5 flex items-center justify-between border-b border-slate-200/70 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-violet-300/20 rounded-full blur-xl" />
          <Link href="/dashboard" className="relative flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-md">
              <span className="text-lg font-extrabold text-white">K</span>
            </div>
            <div>
              <p className="text-base font-extrabold text-white tracking-tight leading-none">Kriya CRM</p>
              <p className="text-[10px] text-indigo-100 mt-0.5 font-medium">Delightfully Organic!</p>
            </div>
          </Link>
          <button onClick={onClose} className="relative lg:hidden p-1.5 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 text-white transition-colors">
            <HiOutlineXMark className="w-4 h-4" />
          </button>
        </div>

        <nav className="p-3 overflow-y-auto h-[calc(100%-5rem)]" style={{ scrollbarWidth: "thin" }}>
          {navGroups.map((group, gi) => {
            const groupItems = group.items.filter((item) => !item.adminOnly || isAdminOrManager);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.label} className={gi === 0 ? "" : "mt-5"}>
                <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em]">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {groupItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    const isAccent = item.accent;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                          isActive
                            ? isAccent
                              ? "bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50/60 text-violet-700 shadow-sm ring-1 ring-violet-200/60"
                              : "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200/60"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                        }`}
                      >
                        {isActive && (
                          <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${isAccent ? "bg-gradient-to-b from-violet-500 to-purple-500" : "bg-gradient-to-b from-indigo-500 to-violet-500"}`} />
                        )}
                        <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          isActive
                            ? isAccent
                              ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md"
                              : "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md"
                            : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
                        }`}>
                          <item.icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 truncate tracking-tight">{item.name}</span>
                        {isAccent && !isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 text-violet-700 ring-1 ring-violet-200/60">AI</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* User card at bottom */}
          {currentUser && (
            <div className="mt-6 pt-4 border-t border-slate-200/70">
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-gradient-to-br from-slate-50/80 to-white">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold ring-2 ring-white shadow-sm">
                    {(currentUser.first_name || currentUser.full_name || "?")[0]?.toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{currentUser.full_name || `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() || currentUser.username}</p>
                  <p className="text-[10px] font-semibold text-slate-500 capitalize">{currentUser.role}</p>
                </div>
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
