"use client";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrders } from "@/store/slices/orderSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { format } from "date-fns";

export default function OrdersPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.orders);

  useEffect(() => {
    dispatch(fetchOrders());
  }, []);

  const columns = [
    { key: "order_number", label: "Order #", render: (row) => <span className="font-medium">{row.order_number || `ORD-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Client" },
    { key: "total_value", label: "Value", render: (row) => row.total_value ? `$${Number(row.total_value).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => format(new Date(row.created_at), "MMM d, yyyy") },
  ];

  return (
    <div>
      <PageHeader title="Orders" subtitle={`${list.length} orders`} />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No orders yet" emptyDescription="Orders are created from approved quotations" />
    </div>
  );
}
