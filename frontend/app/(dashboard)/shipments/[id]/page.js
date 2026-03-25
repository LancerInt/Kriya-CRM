"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [updating, setUpdating] = useState(false);

  const loadShipment = () => {
    setLoading(true);
    api.get(`/shipments/${id}/`)
      .then((r) => {
        setShipment(r.data);
        setNewStatus(r.data.status);
      })
      .catch(() => toast.error("Failed to load shipment"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadShipment();
  }, [id]);

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const res = await api.patch(`/shipments/${id}/`, { status: newStatus });
      setShipment(res.data);
      toast.success("Status updated");
      setShowStatusModal(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update status")); } finally {
      setUpdating(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!shipment) return <p className="text-center text-gray-500 py-8">Shipment not found</p>;

  const formatDate = (d) => d ? format(new Date(d), "MMM d, yyyy") : "\u2014";

  return (
    <div>
      <PageHeader
        title={shipment.shipment_number}
        subtitle={`${shipment.client_name || "\u2014"} \u00b7 ${shipment.order_number || "\u2014"}`}
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowStatusModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              Update Status
            </button>
            <button onClick={() => router.push("/shipments")} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
              Back
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Shipment Info */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Shipment Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={shipment.status} /></div>
            <div><span className="text-gray-500">Shipment #:</span> <span className="ml-1">{shipment.shipment_number}</span></div>
            <div><span className="text-gray-500">Client:</span> <span className="ml-1">{shipment.client_name || "\u2014"}</span></div>
            <div><span className="text-gray-500">Order #:</span> <span className="ml-1">{shipment.order_number || "\u2014"}</span></div>
            <div><span className="text-gray-500">Container #:</span> <span className="ml-1">{shipment.container_number || "\u2014"}</span></div>
            <div><span className="text-gray-500">BL Number:</span> <span className="ml-1">{shipment.bl_number || "\u2014"}</span></div>
            <div><span className="text-gray-500">Forwarder:</span> <span className="ml-1">{shipment.forwarder || "\u2014"}</span></div>
            <div><span className="text-gray-500">Delivery Terms:</span> <span className="ml-1">{shipment.delivery_terms || "\u2014"}</span></div>
          </div>
        </div>

        {/* Shipping Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Shipping Details</h3>
          <div className="space-y-3 text-sm">
            <div><span className="text-gray-500">Port of Loading:</span> <span className="ml-1 block font-medium">{shipment.port_of_loading || "\u2014"}</span></div>
            <div><span className="text-gray-500">Port of Discharge:</span> <span className="ml-1 block font-medium">{shipment.port_of_discharge || "\u2014"}</span></div>
            <div><span className="text-gray-500">Dispatch Date:</span> <span className="ml-1 block font-medium">{formatDate(shipment.dispatch_date)}</span></div>
            <div><span className="text-gray-500">Transit Days:</span> <span className="ml-1 block font-medium">{shipment.transit_days || "\u2014"}</span></div>
            <div><span className="text-gray-500">Estimated Arrival:</span> <span className="ml-1 block font-medium">{formatDate(shipment.estimated_arrival)}</span></div>
            <div><span className="text-gray-500">Actual Arrival:</span> <span className="ml-1 block font-medium">{formatDate(shipment.actual_arrival)}</span></div>
          </div>
        </div>

        {/* Notes */}
        {shipment.notes && (
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold mb-2">Notes</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{shipment.notes}</p>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      <Modal open={showStatusModal} onClose={() => setShowStatusModal(false)} title="Update Shipment Status" size="sm">
        <form onSubmit={handleStatusUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Status</label>
            <StatusBadge status={shipment.status} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="pending">Pending</option>
              <option value="packed">Packed</option>
              <option value="dispatched">Dispatched</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={updating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {updating ? "Updating..." : "Update Status"}
            </button>
            <button type="button" onClick={() => setShowStatusModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
