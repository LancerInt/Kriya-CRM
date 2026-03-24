"use client";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchQuotations, submitForApproval, approveQuotation, generatePI, convertToOrder } from "@/store/slices/quotationSlice";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "react-hot-toast";
import { format } from "date-fns";
import Link from "next/link";

export default function QuotationsPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.quotations);

  useEffect(() => {
    dispatch(fetchQuotations());
  }, []);

  const handleAction = async (action, id, label) => {
    try {
      await dispatch(action(id)).unwrap();
      toast.success(label);
    } catch (err) {
      toast.error(err?.detail || `Failed to ${label.toLowerCase()}`);
    }
  };

  const columns = [
    { key: "quotation_number", label: "Number", render: (row) => <span className="font-medium">{row.quotation_number || `Q-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Client" },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "\u2014" },
    { key: "actions", label: "", render: (row) => (
      <div className="flex gap-2">
        {row.status === "draft" && (
          <button onClick={(e) => { e.stopPropagation(); handleAction(submitForApproval, row.id, "Submitted for approval"); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Submit</button>
        )}
        {row.status === "pending_approval" && (
          <button onClick={(e) => { e.stopPropagation(); handleAction(approveQuotation, row.id, "Approved"); }} className="text-xs text-green-600 hover:text-green-700 font-medium">Approve</button>
        )}
        {row.status === "approved" && (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleAction(generatePI, row.id, "Proforma Invoice generated"); dispatch(fetchQuotations()); }} className="text-xs text-purple-600 hover:text-purple-700 font-medium">Generate PI</button>
            <button onClick={(e) => { e.stopPropagation(); handleAction(convertToOrder, row.id, "Converted to order"); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Convert to Order</button>
          </>
        )}
        {row.status === "sent" && (
          <button onClick={(e) => { e.stopPropagation(); handleAction(convertToOrder, row.id, "Converted to order"); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Convert to Order</button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Quotations"
        action={
          <div className="flex gap-2">
            <AISummaryButton variant="button" title="Quotations Summary" prompt="Summarize the current quotations pipeline. Use get_pipeline_summary and get_orders tools. Show: total quotations by status, conversion rate, top clients, and pending actions." />
            <Link href="/quotations/new" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              + New Quotation
            </Link>
          </div>
        }
      />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No quotations" emptyDescription="Create your first quotation" />
    </div>
  );
}
