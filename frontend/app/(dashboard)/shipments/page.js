"use client";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { HiOutlineTruck } from "react-icons/hi2";

export default function ShipmentsPage() {
  return (
    <div>
      <PageHeader title="Shipments" subtitle="Track and manage shipments" />
      <EmptyState icon={HiOutlineTruck} title="Shipments" description="Shipment tracking will be available here" />
    </div>
  );
}
