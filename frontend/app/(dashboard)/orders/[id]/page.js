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
  if (!d) return "\u2014";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "\u2014"; }
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/orders/${id}/`)
      .then((r) => setOrder(r.data))
      .catch(() => toast.error("Failed to load order"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get(`/orders/${id}/download-pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${order.order_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to download PDF")); }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!order) return <p className="text-center text-gray-500 py-8">Order not found</p>;

  return (
    <div>
      <PageHeader
        title={`Order - ${order.order_number}`}
        subtitle={`${order.client_name} \u00b7 ${order.currency}`}
        action={
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              Download PDF
            </button>
            <button onClick={() => router.back()} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">Back</button>
          </div>
        }
      />

      <div className="max-w-4xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{order.order_number}</h2>
              <p className="text-sm text-gray-500 mt-1">Created {fmtDate(order.created_at)}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div><span className="text-gray-500 block mb-1">Client</span><span className="font-medium">{order.client_name}</span></div>
            <div><span className="text-gray-500 block mb-1">Currency</span><span className="font-medium">{order.currency}</span></div>
            <div><span className="text-gray-500 block mb-1">Delivery Terms</span><span className="font-medium">{order.delivery_terms}</span></div>
            {order.created_by_name && <div><span className="text-gray-500 block mb-1">Created By</span><span className="font-medium">{order.created_by_name}</span></div>}
          </div>
        </div>

        {order.items && order.items.length > 0 && (
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
                  {order.items.map((item, i) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-3 px-2 text-gray-500">{i + 1}</td>
                      <td className="py-3 px-2 font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-gray-500">{item.description || ""}</td>
                      <td className="py-3 px-2 text-right">{Number(item.quantity).toLocaleString()}</td>
                      <td className="py-3 px-2">{item.unit || "KG"}</td>
                      <td className="py-3 px-2 text-right">${Number(item.unit_price).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right font-medium">${Number(item.total_price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col items-end">
              <div className="flex gap-8 pt-2 border-t border-gray-200">
                <span className="text-gray-900 font-semibold">Total:</span>
                <span className="font-bold text-lg w-28 text-right">${Number(order.total).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {order.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Notes</h3>
            <p className="text-sm text-gray-700">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
