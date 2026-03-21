"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineChartBar } from "react-icons/hi2";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Business intelligence and reports" />
      <EmptyState icon={HiOutlineChartBar} title="Analytics" description="Analytics dashboard will be available here" />
    </div>
  );
}
