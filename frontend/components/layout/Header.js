"use client";
import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { logout } from "@/store/slices/authSlice";
import api from "@/lib/axios";
import { HiOutlineBars3, HiOutlineBell, HiOutlineUser, HiOutlineArrowPath, HiOutlineInboxArrowDown, HiOutlineDocumentDuplicate } from "react-icons/hi2";
import toast from "react-hot-toast";

export default function Header({ onMenuClick }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [piCount, setPiCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-sync every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      runSync(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll unread notification count every 30 seconds
  const fetchUnread = () => {
    api.get("/notifications/unread-count/").then(r => setUnreadCount(r.data.count || 0)).catch(() => {});
  };
  // Poll Inquiries (new) and Proforma Invoice (draft) counts — role-filtered server-side
  const fetchHeaderCounts = () => {
    api.get("/communications/quote-requests/count/").then(r => setInquiryCount(r.data.count || 0)).catch(() => {});
    api.get("/finance/pi/count/").then(r => setPiCount(r.data.count || 0)).catch(() => {});
  };
  useEffect(() => {
    fetchUnread();
    fetchHeaderCounts();
    const interval = setInterval(() => { fetchUnread(); fetchHeaderCounts(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const runSync = async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const accounts = await api.get("/communications/email-accounts/");
      const accs = accounts.data.results || accounts.data;
      let totalSynced = 0;
      for (const acc of accs) {
        const res = await api.post(`/communications/email-accounts/${acc.id}/sync-now/`);
        const match = res.data?.status?.match(/(\d+)/);
        if (match) totalSynced += parseInt(match[1]);
      }
      setLastSync(new Date());
      // Refresh header counts (bell badge picks up any new notifications) and
      // notify any listening page that data changed.
      fetchHeaderCounts();
      fetchUnread();
      // Custom event so the Activities/Communications page (and any other
      // page that displays emails) can refetch its list without a manual reload.
      try { window.dispatchEvent(new CustomEvent("kriya:emails-synced", { detail: { count: totalSynced } })); } catch {}

      if (!silent) {
        toast.success(totalSynced > 0 ? `${totalSynced} new email(s) synced!` : "No new emails");
      }
    } catch {
      if (!silent) toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200">
      <button onClick={onMenuClick} className="p-2 rounded-lg hover:bg-gray-100 lg:hidden">
        <HiOutlineBars3 className="w-6 h-6" />
      </button>

      <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Go back">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Proforma Invoices — icon only, badge with role-filtered draft count */}
        <button
          onClick={() => { router.push("/proforma-invoices"); fetchHeaderCounts(); }}
          className="relative p-2 rounded-lg hover:bg-gray-100"
          title="Proforma Invoices"
        >
          <HiOutlineDocumentDuplicate className="w-5 h-5 text-gray-600" />
          {piCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-purple-500 rounded-full">
              {piCount > 99 ? "99+" : piCount}
            </span>
          )}
        </button>

        {/* Inquiries (Quote Requests) — icon only, badge with role-filtered new count */}
        <button
          onClick={() => { router.push("/quote-requests"); fetchHeaderCounts(); }}
          className="relative p-2 rounded-lg hover:bg-gray-100"
          title="Inquiries"
        >
          <HiOutlineInboxArrowDown className="w-5 h-5 text-gray-600" />
          {inquiryCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-orange-500 rounded-full">
              {inquiryCount > 99 ? "99+" : inquiryCount}
            </span>
          )}
        </button>

        {/* Sync button */}
        <button
          onClick={() => runSync(false)}
          disabled={syncing}
          className={`p-2 rounded-lg hover:bg-gray-100 ${syncing ? "animate-spin text-indigo-600" : "text-gray-500"}`}
          title={lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : "Sync emails & data"}
        >
          <HiOutlineArrowPath className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button onClick={() => { router.push("/notifications"); fetchUnread(); }} className="relative p-2 rounded-lg hover:bg-gray-100">
          <HiOutlineBell className="w-5 h-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100"
          >
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
              <HiOutlineUser className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700">
              {user?.first_name || user?.username || "User"}
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium">{user?.first_name} {user?.last_name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
                <p className="text-xs text-indigo-600 capitalize mt-0.5">{user?.role}</p>
              </div>
              <button
                onClick={() => { setDropdownOpen(false); router.push("/settings"); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                My Profile & Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
