"use client";
import { useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchClients } from "@/store/slices/clientSlice";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Link from "next/link";
import toast from "react-hot-toast";

export default function ClientsPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading, count } = useSelector((state) => state.clients);

  const loadClients = useCallback(() => {
    dispatch(fetchClients());
  }, [dispatch]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleStatusChange = async (clientId, newStatus, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/clients/${clientId}/`, { status: newStatus });
      toast.success(`Status changed to ${newStatus}`);
      loadClients();
    } catch { toast.error("Failed to update status"); }
  };

  const columns = [
    { key: "company_name", label: "Company", render: (row) => (
      <span className="font-medium text-gray-900">{row.company_name}</span>
    )},
    { key: "country", label: "Country" },
    { key: "status", label: "Status", render: (row) => (
      <select
        value={row.status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => handleStatusChange(row.id, e.target.value, e)}
        className="text-xs font-medium px-2 py-1 rounded-full border-0 outline-none cursor-pointer bg-transparent"
        style={{ color: row.status === "active" ? "#059669" : row.status === "prospect" ? "#d97706" : "#6b7280" }}
      >
        <option value="active">Active</option>
        <option value="prospect">Prospect</option>
        <option value="inactive">Inactive</option>
      </select>
    )},
    { key: "contact_count", label: "Contacts", render: (row) => row.contact_count || 0 },
    { key: "primary_executive_name", label: "Executive", render: (row) => row.primary_executive_name || "-" },
  ];

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${count} total clients`}
        action={
          <Link
            href="/clients/new"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            + Add Client
          </Link>
        }
      />
      <DataTable
        columns={columns}
        data={list}
        loading={loading}
        emptyTitle="No clients yet"
        emptyDescription="Create your first client to get started"
        onRowClick={(row) => router.push(`/clients/${row.id}`)}
      />
    </div>
  );
}
