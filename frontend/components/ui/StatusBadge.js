const colorMap = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  prospect: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  draft: "bg-gray-100 text-gray-800",
  pending_approval: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  accepted: "bg-emerald-100 text-emerald-800",
  inquiry: "bg-purple-100 text-purple-800",
  discussion: "bg-blue-100 text-blue-800",
  sample: "bg-cyan-100 text-cyan-800",
  quotation: "bg-yellow-100 text-yellow-800",
  negotiation: "bg-orange-100 text-orange-800",
  order_confirmed: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
  confirmed: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
  partial: "bg-yellow-100 text-yellow-800",
  unpaid: "bg-red-100 text-red-800",
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const colors = colorMap[status] || "bg-gray-100 text-gray-800";
  const label = status.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors}`}>
      {label}
    </span>
  );
}
