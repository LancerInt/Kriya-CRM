"use client";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchClients } from "@/store/slices/clientSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Link from "next/link";

export default function ClientsPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading, count } = useSelector((state) => state.clients);

  useEffect(() => {
    dispatch(fetchClients());
  }, []);

  const columns = [
    { key: "company_name", label: "Company", render: (row) => (
      <span className="font-medium text-gray-900">{row.company_name}</span>
    )},
    { key: "country", label: "Country" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
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
