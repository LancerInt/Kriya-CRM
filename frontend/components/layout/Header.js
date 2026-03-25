"use client";
import { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { logout } from "@/store/slices/authSlice";
import api from "@/lib/axios";
import { HiOutlineBars3, HiOutlineBell, HiOutlineUser, HiOutlineArrowPath } from "react-icons/hi2";
import toast from "react-hot-toast";

export default function Header({ onMenuClick }) {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
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
      if (!silent) toast.success(totalSynced > 0 ? `${totalSynced} new email(s) synced!` : "No new emails");
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

      <div className="flex-1" />

      <div className="flex items-center gap-2">
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
        <button onClick={() => router.push("/notifications")} className="relative p-2 rounded-lg hover:bg-gray-100">
          <HiOutlineBell className="w-5 h-5 text-gray-600" />
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
