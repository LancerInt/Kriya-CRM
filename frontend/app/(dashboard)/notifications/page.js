"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import {
  HiOutlineBell,
  HiOutlineClipboardDocumentList,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineEnvelopeOpen,
} from "react-icons/hi2";

const typeConfig = {
  task: { icon: HiOutlineClipboardDocumentList, bg: "bg-blue-100", text: "text-blue-600" },
  approval: { icon: HiOutlineCheckCircle, bg: "bg-yellow-100", text: "text-yellow-600" },
  alert: { icon: HiOutlineExclamationTriangle, bg: "bg-red-100", text: "text-red-600" },
  reminder: { icon: HiOutlineClock, bg: "bg-purple-100", text: "text-purple-600" },
  system: { icon: HiOutlineCog6Tooth, bg: "bg-gray-100", text: "text-gray-600" },
};

function getDateGroup(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  return "Earlier";
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = () => {
    setLoading(true);
    api.get("/notifications/")
      .then((res) => setNotifications(res.data.results || res.data))
      .catch(() => toast.error("Failed to load notifications"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = () => {
    api.post("/notifications/mark_all_read/")
      .then(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        toast.success("All notifications marked as read");
      })
      .catch(() => toast.error("Failed to mark all as read"));
  };

  const handleClick = (notification) => {
    if (!notification.is_read) {
      api.post(`/notifications/${notification.id}/mark_read/`)
        .then(() => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
          );
        })
        .catch(() => {});
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Group notifications by date
  const grouped = notifications.reduce((acc, n) => {
    const group = getDateGroup(n.created_at);
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {});

  const groupOrder = ["Today", "Yesterday", "Earlier"];

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        action={
          unreadCount > 0 ? (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              <HiOutlineEnvelopeOpen className="w-4 h-4" />
              Mark All as Read
            </button>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={HiOutlineBell}
          title="No notifications"
          description="You're all caught up! New notifications will appear here."
        />
      ) : (
        <div className="space-y-6">
          {groupOrder.map((group) => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;

            return (
              <div key={group}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {group}
                </h3>
                <div className="space-y-2">
                  {items.map((notification) => {
                    const config = typeConfig[notification.notification_type] || typeConfig.system;
                    const Icon = config.icon;

                    return (
                      <div
                        key={notification.id}
                        onClick={() => handleClick(notification)}
                        className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                          notification.is_read
                            ? "bg-white border-gray-200 hover:bg-gray-50"
                            : "bg-indigo-50 border-indigo-100 hover:bg-indigo-100"
                        }`}
                      >
                        <div className={`p-2 rounded-lg flex-shrink-0 ${config.bg}`}>
                          <Icon className={`w-5 h-5 ${config.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              notification.is_read
                                ? "text-gray-700 font-normal"
                                : "text-gray-900 font-semibold"
                            }`}
                          >
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="flex-shrink-0 mt-1">
                            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
