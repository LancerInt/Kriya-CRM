"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineBell } from "react-icons/hi2";

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" subtitle="View all notifications" />
      <EmptyState icon={HiOutlineBell} title="Notifications" description="Notification center will be available here" />
    </div>
  );
}
