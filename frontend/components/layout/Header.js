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
  // Show recent unread notifications as toast popups on app load
  const shownNotifRef = useRef(false);
  useEffect(() => {
    if (shownNotifRef.current) return;
    shownNotifRef.current = true;
    api.get("/notifications/?is_read=false&ordering=-created_at&limit=5").then(r => {
      const notifs = (r.data.results || r.data || []).slice(0, 5);
      // Show each with a small delay so they stack nicely
      notifs.forEach((n, i) => {
        setTimeout(() => {
          toast(n.title || n.message || "New notification", {
            icon: n.notification_type === "email" ? "📧" : n.notification_type === "task" ? "📋" : "🔔",
            duration: 5000,
            style: { fontSize: "13px" },
          });
        }, i * 800);
      });
    }).catch(() => {});
  }, []);

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
        // Backend's sync-now wraps the task return value in `{status: ...}`.
        // The task now returns `{synced: N, message: "N emails synced"}`
        // (dict). Older builds returned a plain string. Handle both shapes.
        const s = res.data?.status;
        if (s && typeof s === "object" && typeof s.synced === "number") {
          totalSynced += s.synced;
        } else if (typeof s === "string") {
          const match = s.match(/(\d+)/);
          if (match) totalSynced += parseInt(match[1]);
        }
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
    } catch (err) {
      if (!silent) {
        const msg = err?.response?.data?.error || err?.message || "Sync failed";
        toast.error(msg.length > 120 ? "Sync failed — check email account settings" : msg);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  const initials = `${(user?.first_name || "?")[0] || ""}${(user?.last_name || "")[0] || ""}`.toUpperCase() || (user?.username || "U")[0]?.toUpperCase();
  const iconBtn = "relative p-2 rounded-xl bg-slate-50 hover:bg-white ring-1 ring-slate-200/70 hover:ring-indigo-200 hover:shadow-sm text-slate-600 hover:text-indigo-600 transition-all";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <button onClick={onMenuClick} className="p-2 rounded-xl bg-slate-50 hover:bg-white ring-1 ring-slate-200/70 hover:ring-indigo-200 text-slate-600 hover:text-indigo-600 transition-all lg:hidden">
        <HiOutlineBars3 className="w-5 h-5" />
      </button>

      <button onClick={() => router.back()} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-white ring-1 ring-slate-200/70 hover:ring-indigo-200 hover:shadow-sm text-slate-600 hover:text-indigo-600 transition-all" title="Go back">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Back</span>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {/* Proforma Invoices — icon only, badge with role-filtered draft count */}
        <button
          onClick={() => { router.push("/proforma-invoices"); fetchHeaderCounts(); }}
          className={iconBtn}
          title="Proforma Invoices"
        >
          <HiOutlineDocumentDuplicate className="w-5 h-5" />
          {piCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-extrabold text-white bg-gradient-to-br from-purple-500 to-purple-600 rounded-full ring-2 ring-white shadow-sm">
              {piCount > 99 ? "99+" : piCount}
            </span>
          )}
        </button>

        {/* Inquiries (Quote Requests) — icon only, badge with role-filtered new count */}
        <button
          onClick={() => { router.push("/quote-requests"); fetchHeaderCounts(); }}
          className={iconBtn}
          title="Inquiries"
        >
          <HiOutlineInboxArrowDown className="w-5 h-5" />
          {inquiryCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-extrabold text-white bg-gradient-to-br from-orange-500 to-orange-600 rounded-full ring-2 ring-white shadow-sm">
              {inquiryCount > 99 ? "99+" : inquiryCount}
            </span>
          )}
        </button>

        {/* Sync button */}
        <button
          onClick={() => runSync(false)}
          disabled={syncing}
          className={`relative p-2 rounded-xl ring-1 transition-all ${syncing ? "bg-indigo-50 ring-indigo-200 text-indigo-600" : "bg-slate-50 hover:bg-white ring-slate-200/70 hover:ring-indigo-200 hover:shadow-sm text-slate-600 hover:text-indigo-600"}`}
          title={lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : "Sync emails & data"}
        >
          <HiOutlineArrowPath className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
          {syncing && <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />}
        </button>

        {/* Notifications */}
        <button onClick={() => { router.push("/notifications"); fetchUnread(); }} className={iconBtn} title="Notifications">
          <HiOutlineBell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-extrabold text-white bg-gradient-to-br from-rose-500 to-rose-600 rounded-full ring-2 ring-white shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <span className="w-px h-7 bg-slate-200 mx-1.5" />

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl ring-1 transition-all ${dropdownOpen ? "bg-white ring-indigo-200 shadow-sm" : "bg-slate-50 hover:bg-white ring-slate-200/70 hover:ring-indigo-200 hover:shadow-sm"}`}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-xs font-extrabold ring-2 ring-white shadow-sm">
                {initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-tight">{user?.first_name || user?.username || "User"}</p>
              {user?.role && <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 capitalize leading-tight">{user.role}</p>}
            </div>
            <svg className={`hidden sm:block w-3 h-3 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/70 ring-1 ring-slate-200/40 overflow-hidden">
              <div className="px-4 py-4 bg-gradient-to-br from-indigo-50/60 via-violet-50/40 to-white border-b border-slate-100 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-base font-extrabold ring-2 ring-white shadow-md">
                    {initials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{user?.first_name} {user?.last_name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  {user?.role && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-700 ring-1 ring-indigo-200/60 capitalize">
                      {user.role}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setDropdownOpen(false); router.push("/settings"); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </span>
                  Profile &amp; Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </span>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
