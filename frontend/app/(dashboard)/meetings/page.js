"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlinePhone } from "react-icons/hi2";

export default function MeetingsPage() {
  return (
    <div>
      <PageHeader title="Meetings & Calls" subtitle="Schedule and log meetings" />
      <EmptyState icon={HiOutlinePhone} title="Meetings" description="Meeting management will be available here" />
    </div>
  );
}
