"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineShieldCheck } from "react-icons/hi2";

export default function QualityPage() {
  return (
    <div>
      <PageHeader title="Quality Inspections" subtitle="Manage quality inspections and COA documents" />
      <EmptyState icon={HiOutlineShieldCheck} title="Quality Inspections" description="Quality inspection management will be available here" />
    </div>
  );
}
