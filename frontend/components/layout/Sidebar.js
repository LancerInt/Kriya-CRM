"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: HiOutlineHome },
  { name: "Accounts", href: "/clients", icon: HiOutlineUsers },
  { name: "Activities", href: "/communications", icon: HiOutlineChatBubbleLeftRight },
  { name: "Tasks", href: "/tasks", icon: HiOutlineClipboardDocumentList },
  { name: "Leads", href: "/pipeline", icon: HiOutlineFunnel },
  { name: "Products", href: "/products", icon: HiOutlineCube },
  { name: "Quotes", href: "/quotations", icon: HiOutlineDocumentText },
  { name: "Inquiries", href: "/quote-requests", icon: HiOutlineInboxArrowDown },
  { name: "Proforma Invoices", href: "/proforma-invoices", icon: HiOutlineDocumentDuplicate },
  { name: "Sales Orders", href: "/orders", icon: HiOutlineShoppingCart },
  { name: "Shipments", href: "/shipments", icon: HiOutlineTruck },
  { name: "Quality", href: "/quality", icon: HiOutlineShieldCheck },
  { name: "Samples", href: "/samples", icon: HiOutlineBeaker },
  { name: "Finance", href: "/finance", icon: HiOutlineBanknotes },
  { name: "Documents", href: "/documents", icon: HiOutlineFolder },
  { name: "Meetings", href: "/meetings", icon: HiOutlinePhone },
  { name: "Reports", href: "/analytics", icon: HiOutlineChartBar },
  { name: "Team Chat", href: "/team-chat", icon: HiOutlineUserGroup },
  { name: "Kriya AI", href: "/ai", icon: HiOutlineSparkles },
  { name: "Notifications", href: "/notifications", icon: HiOutlineBell },
  { name: "Archive", href: "/recycle-bin", icon: HiOutlineTrash },
  { name: "Settings", href: "/settings", icon: HiOutlineCog6Tooth },
];

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Link href="/dashboard" className="text-xl font-bold text-indigo-600">
            Kriya CRM
          </Link>
          <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-gray-100">
            <HiOutlineXMark className="w-6 h-6" />
          </button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100%-4rem)]">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-indigo-600" : "text-gray-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
