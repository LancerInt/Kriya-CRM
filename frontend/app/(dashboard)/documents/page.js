"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineFolder } from "react-icons/hi2";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader title="Documents" subtitle="Manage trade documents" />
      <EmptyState icon={HiOutlineFolder} title="Documents" description="Document management will be available here" />
    </div>
  );
}
