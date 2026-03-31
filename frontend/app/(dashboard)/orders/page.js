"use client";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { fetchOrders } from "@/store/slices/orderSlice";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { format } from "date-fns";

export default function OrdersPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { list, loading } = useSelector((state) => state.orders);

  useEffect(() => {
    dispatch(fetchOrders());
  }, []);

  const columns = [
    { key: "order_number", label: "Order #", render: (row) => <span className="font-medium">{row.order_number || `ORD-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Account" },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => { try { return format(new Date(row.created_at), "MMM d, yyyy"); } catch { return "\u2014"; } } },
  ];

  return (
    <div>
      <PageHeader title="Sales Orders" subtitle={`${list.length} orders`} action={
        <AISummaryButton variant="button" title="Orders Summary" prompt="Summarize all current orders. Use get_orders tool. Show: orders by status, total value, clients with active orders, and any that need attention." />
      } />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No orders yet" emptyDescription="Orders are created from approved quotations" onRowClick={(row) => router.push(`/orders/${row.id}`)} />
    </div>
  );
}
