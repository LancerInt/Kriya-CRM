"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format, differenceInDays } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

// Status → hero gradient & accent so the page feels alive at a glance.
const STATUS_THEME = {
  pending:    { bg: "from-slate-700 to-slate-900",    accent: "bg-slate-400",   chipBg: "bg-slate-100/90 text-slate-800" },
  packed:     { bg: "from-amber-700 to-amber-900",    accent: "bg-amber-400",   chipBg: "bg-amber-100/90 text-amber-900" },
  dispatched: { bg: "from-indigo-700 to-violet-900",  accent: "bg-indigo-400",  chipBg: "bg-indigo-100/90 text-indigo-900" },
  in_transit: { bg: "from-blue-700 to-cyan-900",      accent: "bg-blue-400",    chipBg: "bg-blue-100/90 text-blue-900" },
  delivered:  { bg: "from-emerald-700 to-teal-900",   accent: "bg-emerald-400", chipBg: "bg-emerald-100/90 text-emerald-900" },
};

const STAGES = [
  { key: "pending",    label: "Pending" },
  { key: "packed",     label: "Packed" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered",  label: "Delivered" },
];

function formatDate(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs uppercase tracking-wide text-gray-500 font-medium pt-0.5 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right break-words">{children || <span className="text-gray-400">—</span>}</span>
    </div>
  );
}

function MetricTile({ icon, label, value, sub, tone = "indigo" }) {
  const TONE = {
    indigo:  "from-indigo-50 to-violet-50 border-indigo-100 text-indigo-700",
    emerald: "from-emerald-50 to-teal-50 border-emerald-100 text-emerald-700",
    amber:   "from-amber-50 to-orange-50 border-amber-100 text-amber-700",
    rose:    "from-rose-50 to-pink-50 border-rose-100 text-rose-700",
    blue:    "from-blue-50 to-cyan-50 border-blue-100 text-blue-700",
  };
  return (
    <div className={`bg-gradient-to-br ${TONE[tone]} border rounded-xl p-4`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-1.5">{sub}</p>}
    </div>
  );
}

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
      .then((r) => { setShipment(r.data); setNewStatus(r.data.status); })
      .catch(() => toast.error("Failed to load shipment"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadShipment(); }, [id]);

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

  // Days remaining / overdue vs estimated arrival.
  const arrivalInfo = useMemo(() => {
    if (!shipment) return null;
    const eta = shipment.actual_arrival || shipment.estimated_arrival;
    if (!eta) return null;
    const days = differenceInDays(new Date(eta), new Date());
    if (shipment.actual_arrival) return { tone: "emerald", label: "Arrived", value: formatDate(shipment.actual_arrival) };
    if (days > 0) return { tone: "indigo", label: "Days to ETA", value: `${days}d`, sub: formatDate(eta) };
    if (days === 0) return { tone: "amber", label: "ETA today", value: formatDate(eta) };
    return { tone: "rose", label: "ETA passed", value: `${-days}d ago`, sub: formatDate(eta) };
  }, [shipment]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!shipment) return <p className="text-center text-gray-500 py-8">Shipment not found</p>;

  const theme = STATUS_THEME[shipment.status] || STATUS_THEME.pending;
  const stageIdx = Math.max(0, STAGES.findIndex((s) => s.key === shipment.status));
  const orderId = shipment.order_id || shipment.order;

  return (
    <div className="space-y-6">
      {/* Hero strip ─────────────────────────────────────────── */}
      <div className={`relative bg-gradient-to-br ${theme.bg} rounded-2xl p-6 text-white overflow-hidden shadow-sm`}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 40%)" }} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => router.push("/shipments")} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Back to Shipments">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${theme.chipBg}`}>
                {(shipment.status || "").replace(/_/g, " ").toUpperCase()}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{shipment.shipment_number}</h1>
            <p className="text-sm text-white/80 mt-1">
              <span className="font-medium">{shipment.client_name || "—"}</span>
              {shipment.order_number && (
                <>
                  <span className="mx-2 text-white/40">·</span>
                  <button onClick={() => orderId && router.push(`/orders/${orderId}`)} className="underline-offset-2 hover:underline">
                    {shipment.order_number}
                  </button>
                </>
              )}
              {shipment.country && (
                <>
                  <span className="mx-2 text-white/40">·</span>
                  <span>{shipment.country}</span>
                </>
              )}
            </p>
          </div>
          <button onClick={() => setShowStatusModal(true)} className="px-4 py-2.5 bg-white text-gray-900 text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition-shadow">
            Update Status
          </button>
        </div>

        {/* Stage progress strip */}
        <div className="relative mt-5">
          <div className="flex items-center gap-1.5">
            {STAGES.map((stage, idx) => {
              const reached = idx <= stageIdx;
              const current = idx === stageIdx;
              return (
                <div key={stage.key} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      reached ? theme.accent : "bg-white/20"
                    } ${current ? "shadow-[0_0_12px_rgba(255,255,255,0.5)]" : ""}`}
                  />
                  <p className={`mt-1.5 text-[10px] uppercase tracking-wider ${reached ? "text-white" : "text-white/50"}`}>
                    {stage.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Metric tiles ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile
          icon="📅"
          label="Dispatched"
          value={formatDate(shipment.dispatch_date)}
          tone="indigo"
        />
        <MetricTile
          icon="⏱"
          label="Transit Days"
          value={shipment.transit_days || "—"}
          sub={shipment.transit_days ? "Estimated voyage" : "Not set"}
          tone="blue"
        />
        <MetricTile
          icon="🛬"
          label="ETA"
          value={formatDate(shipment.estimated_arrival)}
          sub={arrivalInfo?.label === "Arrived" ? `Actual: ${arrivalInfo.value}` : (arrivalInfo?.label === "Days to ETA" ? `${arrivalInfo.value} remaining` : undefined)}
          tone={arrivalInfo?.tone === "rose" ? "rose" : arrivalInfo?.tone === "amber" ? "amber" : "emerald"}
        />
        <MetricTile
          icon="✅"
          label="Actual Arrival"
          value={formatDate(shipment.actual_arrival)}
          sub={shipment.actual_arrival ? "Delivered to port" : "Pending"}
          tone={shipment.actual_arrival ? "emerald" : "amber"}
        />
      </div>

      {/* Journey card — POL → POD with the dates as midpoints ─ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-lg">🚢</span>
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Voyage</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Origin */}
          <div className="text-center min-w-[120px]">
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 flex items-center justify-center text-xl">📦</div>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Port of Loading</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{shipment.port_of_loading || "—"}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(shipment.dispatch_date)}</p>
          </div>

          {/* Track */}
          <div className="flex-1 relative h-1 bg-gray-200 rounded-full">
            <div
              className={`absolute inset-y-0 left-0 ${theme.accent} rounded-full transition-all`}
              style={{ width: `${Math.min(100, (stageIdx / (STAGES.length - 1)) * 100)}%` }}
            />
            {/* Floating ship */}
            <div
              className="absolute -top-3 transition-all"
              style={{ left: `calc(${Math.min(100, (stageIdx / (STAGES.length - 1)) * 100)}% - 14px)` }}
            >
              <div className="text-2xl">🚢</div>
            </div>
          </div>

          {/* Destination */}
          <div className="text-center min-w-[120px]">
            <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center text-xl ${shipment.actual_arrival ? "bg-emerald-100" : "bg-gray-100"}`}>📍</div>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Port of Discharge</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{shipment.port_of_discharge || "—"}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(shipment.actual_arrival || shipment.estimated_arrival)}</p>
          </div>
        </div>
      </div>

      {/* Two-column detail grid ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Logistics Partners */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤝</span>
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Logistics Partners</h2>
          </div>
          <InfoRow label="Forwarder">{shipment.forwarder}</InfoRow>
          <InfoRow label="CHA">{shipment.cha}</InfoRow>
          <InfoRow label="Shipping Line">{shipment.shipping_line}</InfoRow>
          <InfoRow label="Container #">{shipment.container_number}</InfoRow>
          <InfoRow label="BL Number">
            {shipment.bl_number ? (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">{shipment.bl_number}</span>
            ) : null}
          </InfoRow>
        </div>

        {/* Trade & Order */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📋</span>
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Trade & Order</h2>
          </div>
          <InfoRow label="Client">{shipment.client_name}</InfoRow>
          <InfoRow label="Country">{shipment.country}</InfoRow>
          <InfoRow label="Order">
            {shipment.order_number ? (
              <button onClick={() => orderId && router.push(`/orders/${orderId}`)} className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline underline-offset-2">
                {shipment.order_number}
              </button>
            ) : null}
          </InfoRow>
          <InfoRow label="Delivery Terms">
            {shipment.delivery_terms ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">{shipment.delivery_terms}</span>
            ) : null}
          </InfoRow>
          <InfoRow label="Status"><StatusBadge status={shipment.status} /></InfoRow>
        </div>
      </div>

      {/* Notes */}
      {shipment.notes && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📝</span>
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Notes</h2>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{shipment.notes}</p>
        </div>
      )}

      {/* Status Update Modal */}
      <Modal open={showStatusModal} onClose={() => setShowStatusModal(false)} title="Update Shipment Status" size="sm">
        <form onSubmit={handleStatusUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Current Status</label>
            <StatusBadge status={shipment.status} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={updating} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow disabled:opacity-50">
              {updating ? "Updating..." : "Update Status"}
            </button>
            <button type="button" onClick={() => setShowStatusModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
