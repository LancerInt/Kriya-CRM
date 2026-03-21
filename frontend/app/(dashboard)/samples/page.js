"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineBeaker } from "react-icons/hi2";

export default function SamplesPage() {
  return (
    <div>
      <PageHeader title="Samples" subtitle="Track sample requests and feedback" />
      <EmptyState icon={HiOutlineBeaker} title="Samples" description="Sample tracking will be available here" />
    </div>
  );
}
