"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

function fmtDate(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/finance/invoices/${id}/`)
      .then((r) => setInvoice(r.data))
      .catch(() => toast.error("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      await api.patch(`/finance/invoices/${id}/`, { status: newStatus });
      setInvoice({ ...invoice, status: newStatus });
      toast.success(`Invoice marked as ${newStatus}`);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update status")); }
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/finance/invoices/${id}/download-pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${invoice.invoice_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to download PDF")); }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!invoice) return <p className="text-center text-gray-500 py-8">Invoice not found</p>;

  const isPI = invoice.invoice_type === "proforma";

  return (
    <div>
      <PageHeader
        title={`${isPI ? "Proforma Invoice" : "Commercial Invoice"} - ${invoice.invoice_number}`}
        subtitle={`${invoice.client_name} · ${invoice.currency}`}
        action={
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">Download PDF</button>
            {invoice.status === "draft" && (
              <button onClick={() => handleStatusChange("sent")} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Mark as Sent</button>
            )}
            <button onClick={() => router.back()} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">Back</button>
          </div>
        }
      />

      <div className="max-w-4xl space-y-6">
        {/* Invoice Header Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isPI ? "Proforma Invoice" : "Commercial Invoice"} &middot; Created {fmtDate(invoice.created_at)}
              </p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block mb-1">Client</span>
              <span className="font-medium">{invoice.client_name}</span>
            </div>
            {invoice.quotation_number && (
              <div>
                <span className="text-gray-500 block mb-1">Quotation</span>
                <span className="font-medium">{invoice.quotation_number}</span>
              </div>
            )}
            {invoice.order_number && (
              <div>
                <span className="text-gray-500 block mb-1">Order</span>
                <span className="font-medium">{invoice.order_number}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500 block mb-1">Currency</span>
              <span className="font-medium">{invoice.currency}</span>
            </div>
            {invoice.delivery_terms && (
              <div>
                <span className="text-gray-500 block mb-1">Delivery Terms</span>
                <span className="font-medium">{invoice.delivery_terms}</span>
              </div>
            )}
            {invoice.payment_terms && (
              <div>
                <span className="text-gray-500 block mb-1">Payment Terms</span>
                <span className="font-medium">{invoice.payment_terms}</span>
              </div>
            )}
            {invoice.validity && (
              <div>
                <span className="text-gray-500 block mb-1">Validity</span>
                <span className="font-medium">{invoice.validity}</span>
              </div>
            )}
            {invoice.due_date && (
              <div>
                <span className="text-gray-500 block mb-1">Due Date</span>
                <span className="font-medium">{fmtDate(invoice.due_date)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        {invoice.items && invoice.items.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">#</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Product</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Description</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Qty</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Unit</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Unit Price</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, i) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-3 px-2 text-gray-500">{i + 1}</td>
                      <td className="py-3 px-2 font-medium">{item.product_name || item.description}</td>
                      <td className="py-3 px-2 text-gray-500">{item.description && item.product_name ? item.description : ""}</td>
                      <td className="py-3 px-2 text-right">{Number(item.quantity).toLocaleString()}</td>
                      <td className="py-3 px-2">{item.unit || "KG"}</td>
                      <td className="py-3 px-2 text-right">${Number(item.unit_price).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right font-medium">${Number(item.total_price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col items-end space-y-2 text-sm">
              <div className="flex gap-8">
                <span className="text-gray-500">Subtotal:</span>
                <span className="font-medium w-28 text-right">${Number(invoice.subtotal).toLocaleString()}</span>
              </div>
              {Number(invoice.tax) > 0 && (
                <div className="flex gap-8">
                  <span className="text-gray-500">Tax:</span>
                  <span className="font-medium w-28 text-right">${Number(invoice.tax).toLocaleString()}</span>
                </div>
              )}
              <div className="flex gap-8 pt-2 border-t border-gray-200">
                <span className="text-gray-900 font-semibold">Total:</span>
                <span className="font-bold text-lg w-28 text-right">${Number(invoice.total).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Bank Details */}
        {invoice.bank_details && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Bank Details</h3>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-lg p-4">{invoice.bank_details}</pre>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Notes</h3>
            <p className="text-sm text-gray-700">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
