"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineBanknotes } from "react-icons/hi2";

export default function FinancePage() {
  return (
    <div>
      <PageHeader title="Finance" subtitle="Invoices, payments, FIRC and GST records" />
      <EmptyState icon={HiOutlineBanknotes} title="Finance" description="Financial management will be available here" />
    </div>
  );
}
