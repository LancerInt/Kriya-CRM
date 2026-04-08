"use client";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  HiOutlineCurrencyDollar,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineArrowDownTray,
  HiOutlineXMark,
} from "react-icons/hi2";

// ── Helpers ─────────────────────────────────────────────────────────────

const fmtMoney = (n, currency = "USD") => {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
};

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return "—";
  }
};

const CREDIT_BADGES = {
  good: { label: "Good", className: "bg-green-100 text-green-700 border border-green-200" },
  pending: { label: "Pending", className: "bg-blue-100 text-blue-700 border border-blue-200" },
  overdue: { label: "Overdue", className: "bg-amber-100 text-amber-800 border border-amber-200" },
  high_risk: { label: "High Risk", className: "bg-red-100 text-red-700 border border-red-200" },
};

// ── KPI Card ────────────────────────────────────────────────────────────

function KpiCard({ title, value, subtitle, icon: Icon, accent = "indigo", trend = null }) {
  const accents = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  const trendColor = trend === null ? "text-gray-400" : trend >= 0 ? "text-green-600" : "text-red-600";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          {trend !== null && (
            <p className={`mt-2 text-xs font-semibold ${trendColor}`}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% vs prev period
            </p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl ${accents[accent]}`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aging Card ──────────────────────────────────────────────────────────

function AgingCard({ bucket }) {
  const colorMap = {
    "0_30": "bg-gray-50 border-gray-200 text-gray-800",
    "31_60": "bg-yellow-50 border-yellow-200 text-yellow-800",
    "61_90": "bg-orange-50 border-orange-200 text-orange-800",
    "90_plus": "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colorMap[bucket.bucket]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{bucket.label}</p>
      <p className="mt-2 text-2xl font-bold">{fmtMoney(bucket.amount)}</p>
      <p className="mt-1 text-xs opacity-80">
        {bucket.invoice_count} invoice{bucket.invoice_count !== 1 ? "s" : ""} ·{" "}
        {bucket.client_count} client{bucket.client_count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ── Client Detail Drawer ────────────────────────────────────────────────

function ClientFinanceDrawer({ clientId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.get(`/finance/client/${clientId}/financial-details/`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load client details"))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {data?.client?.company_name || "Client Details"}
            </h2>
            {data?.client?.country && (
              <p className="text-sm text-gray-500">{data.client.country}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <HiOutlineXMark className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading || !data ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Totals */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-indigo-50 rounded-xl p-4">
                <p className="text-xs text-indigo-600 uppercase font-semibold">Revenue</p>
                <p className="text-xl font-bold text-indigo-900 mt-1">{fmtMoney(data.totals.total_revenue)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-xs text-green-600 uppercase font-semibold">Paid</p>
                <p className="text-xl font-bold text-green-900 mt-1">{fmtMoney(data.totals.total_paid)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4">
                <p className="text-xs text-amber-600 uppercase font-semibold">Outstanding</p>
                <p className="text-xl font-bold text-amber-900 mt-1">{fmtMoney(data.totals.outstanding)}</p>
              </div>
            </div>

            {/* Credit info */}
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase">Credit Limit</p>
                <p className="font-semibold text-gray-900 mt-1">{fmtMoney(data.client.credit_limit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Credit Days</p>
                <p className="font-semibold text-gray-900 mt-1">{data.client.credit_days || 0} days</p>
              </div>
              {data.client.tax_number && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase">Tax Number</p>
                  <p className="font-mono text-xs text-gray-900 mt-1">{data.client.tax_number}</p>
                </div>
              )}
            </div>

            {/* Aging */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Aging Summary</h3>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                  <p className="text-gray-500">0–30 d</p>
                  <p className="font-bold text-gray-900 mt-1">{fmtMoney(data.aging["0_30"])}</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center">
                  <p className="text-yellow-700">31–60 d</p>
                  <p className="font-bold text-yellow-900 mt-1">{fmtMoney(data.aging["31_60"])}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                  <p className="text-orange-700">61–90 d</p>
                  <p className="font-bold text-orange-900 mt-1">{fmtMoney(data.aging["61_90"])}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                  <p className="text-red-700">90+ d</p>
                  <p className="font-bold text-red-900 mt-1">{fmtMoney(data.aging["90_plus"])}</p>
                </div>
              </div>
            </div>

            {/* Invoices */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Invoices ({data.invoices.length})</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-gray-500 uppercase">
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.invoices.map((i) => (
                      <tr key={i.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono">{i.invoice_number}</td>
                        <td className="px-3 py-2 capitalize">{i.invoice_type}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(i.total, i.currency)}</td>
                        <td className="px-3 py-2 capitalize">{i.status}</td>
                        <td className="px-3 py-2">{fmtDate(i.due_date)}</td>
                      </tr>
                    ))}
                    {data.invoices.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No invoices</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Payments ({data.payments.length})</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-gray-500 uppercase">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2 font-mono">{p.invoice_number || "—"}</td>
                        <td className="px-3 py-2 uppercase">{p.mode}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(p.amount, p.currency)}</td>
                      </tr>
                    ))}
                    {data.payments.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No payments</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FIRC */}
            {data.firc_count > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                <span className="font-semibold text-blue-900">{data.firc_count} FIRC record{data.firc_count !== 1 ? "s" : ""}</span>
                <span className="text-blue-700"> on file for this client</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const [summary, setSummary] = useState(null);
  const [revenueByClient, setRevenueByClient] = useState([]);
  const [aging, setAging] = useState([]);
  const [trend, setTrend] = useState([]);
  const [byCountry, setByCountry] = useState([]);
  const [productRevenue, setProductRevenue] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [statusBreakdown, setStatusBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterCountry, setFilterCountry] = useState("");

  // Search/sort for revenue table
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("total_revenue");
  const [sortDir, setSortDir] = useState("desc");

  // Recent activity tab
  const [activitySubTab, setActivitySubTab] = useState("payments");

  // Drawer
  const [drawerClientId, setDrawerClientId] = useState(null);

  const buildParams = () => {
    const p = {};
    if (filterStart) p.start = filterStart;
    if (filterEnd) p.end = filterEnd;
    if (filterClient) p.client = filterClient;
    if (filterCountry) p.country = filterCountry;
    return p;
  };

  const loadAll = async () => {
    setLoading(true);
    const params = buildParams();
    // Use Promise.allSettled so a single failing endpoint doesn't blow away
    // every chart on the dashboard. Each section degrades independently.
    try {
      const results = await Promise.allSettled([
        api.get("/finance/summary/", { params }),
        api.get("/finance/revenue-by-client/", { params }),
        api.get("/finance/aging/", { params }),
        api.get("/finance/revenue-trend/", { params }),
        api.get("/finance/revenue-by-country/", { params }),
        api.get("/finance/product-revenue/", { params }),
        api.get("/finance/recent-payments/"),
        api.get("/finance/recent-invoices/"),
        api.get("/finance/payment-status/", { params }),
      ]);
      const [s, rbc, ag, tr, rbcountry, prods, rp, ri, sb] = results;

      if (s.status === "fulfilled") setSummary(s.value.data);
      if (rbc.status === "fulfilled") setRevenueByClient(rbc.value.data.results || []);
      if (ag.status === "fulfilled") setAging(ag.value.data.buckets || []);
      if (tr.status === "fulfilled") setTrend(tr.value.data.series || []);
      if (rbcountry.status === "fulfilled") setByCountry(rbcountry.value.data.results || []);
      if (prods.status === "fulfilled") setProductRevenue(prods.value.data.results || []);
      if (rp.status === "fulfilled") setRecentPayments(rp.value.data.results || []);
      if (ri.status === "fulfilled") setRecentInvoices(ri.value.data.results || []);
      if (sb.status === "fulfilled") setStatusBreakdown(sb.value.data.segments || []);

      // Surface ANY failed endpoint so we can diagnose 500s in production
      const labels = [
        "summary", "revenue-by-client", "aging", "revenue-trend",
        "revenue-by-country", "product-revenue", "recent-payments",
        "recent-invoices", "payment-status",
      ];
      const failed = results
        .map((r, i) => ({ r, label: labels[i] }))
        .filter((x) => x.r.status === "rejected");
      if (failed.length > 0) {
        const msgs = failed
          .map((x) => `${x.label}: ${x.r.reason?.response?.status || "?"}`)
          .join(", ");
        toast.error(`Some sections failed (${msgs})`);
        // Console-log full reasons for deeper debugging
        failed.forEach((x) => console.error(`[finance dashboard] ${x.label}`, x.r.reason));
      }
    } catch (err) {
      toast.error("Failed to load finance dashboard");
      console.error("[finance dashboard] unexpected error", err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch the dashboard whenever any filter changes. This makes the
  // dropdowns / date pickers feel "live" — the user no longer has to click
  // Apply for the data below to update. Apply still works as a manual
  // trigger if the user wants to force a refetch.
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStart, filterEnd, filterClient, filterCountry]);

  const applyFilters = () => loadAll();
  const clearFilters = () => {
    setFilterStart(""); setFilterEnd(""); setFilterClient(""); setFilterCountry("");
    // No need to call loadAll — the useEffect above will fire automatically
    // when the state setters flush.
  };

  // Filter + sort revenue table client-side
  const filteredRevenueRows = useMemo(() => {
    let rows = revenueByClient;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.client_name || "").toLowerCase().includes(q) ||
          (r.country || "").toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [revenueByClient, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleExport = () => {
    // Export the revenue table as CSV
    const headers = ["Client", "Country", "Total Revenue", "Total Paid", "Outstanding", "Last Payment", "Credit Status"];
    const rows = filteredRevenueRows.map((r) => [
      r.client_name,
      r.country,
      r.total_revenue,
      r.total_paid,
      r.outstanding,
      r.last_payment_date || "",
      r.credit_status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

  // Unique countries and clients for filter dropdowns (from current data)
  const countryOptions = useMemo(() => {
    const set = new Set();
    revenueByClient.forEach((r) => r.country && set.add(r.country));
    return Array.from(set).sort();
  }, [revenueByClient]);

  // Full list of clients (separate from revenueByClient so the dropdown
  // includes clients with zero revenue too).
  const [clientOptions, setClientOptions] = useState([]);
  useEffect(() => {
    api.get("/clients/")
      .then((r) => {
        const list = r.data?.results || r.data || [];
        setClientOptions(
          list
            .map((c) => ({ id: c.id, name: c.company_name || "(unnamed)" }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Filters bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={filterStart}
            onChange={(e) => setFilterStart(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={filterEnd}
            onChange={(e) => setFilterEnd(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="">All Countries</option>
          {countryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-w-[180px]"
        >
          <option value="">All Clients</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={applyFilters}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
        >
          Apply
        </button>
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
        >
          Clear
        </button>
        <div className="ml-auto">
          <button
            onClick={handleExport}
            className="px-4 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-1"
          >
            <HiOutlineArrowDownTray className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Revenue"
          value={fmtMoney(summary?.total_revenue || 0)}
          subtitle="Invoiced amount"
          icon={HiOutlineCurrencyDollar}
          accent="indigo"
          trend={summary?.revenue_delta_pct}
        />
        <KpiCard
          title="Total Paid"
          value={fmtMoney(summary?.total_paid || 0)}
          subtitle="Payments received"
          icon={HiOutlineCheckCircle}
          accent="green"
        />
        <KpiCard
          title="Outstanding"
          value={fmtMoney(summary?.total_outstanding || 0)}
          subtitle="Awaiting payment"
          icon={HiOutlineClock}
          accent="amber"
        />
        <KpiCard
          title="Overdue"
          value={fmtMoney(summary?.overdue_amount || 0)}
          subtitle={`${summary?.overdue_count || 0} invoice${(summary?.overdue_count || 0) !== 1 ? "s" : ""}`}
          icon={HiOutlineExclamationTriangle}
          accent="red"
        />
      </div>

      {/* Aging cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Outstanding Receivables</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {aging.map((b) => <AgingCard key={b.bucket} bucket={b} />)}
        </div>
      </div>

      {/* Charts row 1: Trend + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Monthly Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="Revenue" />
              <Line type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Paid" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Payment Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusBreakdown}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {statusBreakdown.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Country + Client revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Revenue by Country</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCountry.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="country" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtMoney(v)} />
              <Bar dataKey="revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Clients by Revenue</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueByClient.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="client_name" type="category" stroke="#9ca3af" tick={{ fontSize: 11 }} width={100} />
              <Tooltip formatter={(v) => fmtMoney(v)} />
              <Bar dataKey="total_revenue" fill="#10b981" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products + Top Countries panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Products by Revenue</h3>
          <div className="space-y-2">
            {productRevenue.length === 0 && (
              <p className="text-sm text-gray-400 italic">No product data yet.</p>
            )}
            {productRevenue.map((p) => (
              <div key={p.rank} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
                  {p.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 truncate">{p.product_name}</span>
                    <span className="font-semibold text-gray-800 ml-2">{fmtMoney(p.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p.percentage}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{p.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Top Countries by Revenue</h3>
          <div className="space-y-2">
            {byCountry.length === 0 && (
              <p className="text-sm text-gray-400 italic">No country data yet.</p>
            )}
            {byCountry.slice(0, 10).map((c, i) => (
              <div key={c.country} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-green-50 text-green-700 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 truncate">{c.country}</span>
                    <span className="font-semibold text-gray-800 ml-2">{fmtMoney(c.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.percentage}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{c.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue by Client Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800">Revenue by Client</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or country…"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("client_name")}>Client</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("country")}>Country</th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("total_revenue")}>Revenue</th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("total_paid")}>Paid</th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("outstanding")}>Outstanding</th>
                <th className="px-4 py-3">Last Payment</th>
                <th className="px-4 py-3">Credit Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRevenueRows.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No client data yet.</td></tr>
              )}
              {filteredRevenueRows.map((r) => {
                const badge = CREDIT_BADGES[r.credit_status] || CREDIT_BADGES.good;
                return (
                  <tr key={r.client_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.client_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.country || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtMoney(r.total_revenue)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{fmtMoney(r.total_paid)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{fmtMoney(r.outstanding)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.last_payment_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDrawerClientId(r.client_id)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 flex items-center gap-1">
          <button
            onClick={() => setActivitySubTab("payments")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
              activitySubTab === "payments" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Recent Payments
          </button>
          <button
            onClick={() => setActivitySubTab("invoices")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
              activitySubTab === "invoices" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Recent Invoices
          </button>
        </div>
        <div className="overflow-x-auto">
          {activitySubTab === "payments" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Payment Date</th>
                  <th className="px-4 py-2">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentPayments.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No recent payments.</td></tr>
                )}
                {recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{p.client_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.invoice_number || "—"}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="px-4 py-2 text-gray-600">{fmtDate(p.payment_date)}</td>
                    <td className="px-4 py-2 uppercase text-xs">{p.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInvoices.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No recent invoices.</td></tr>
                )}
                {recentInvoices.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{i.client_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtMoney(i.total, i.currency)}</td>
                    <td className="px-4 py-2 text-gray-600">{fmtDate(i.due_date)}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{i.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerClientId && (
        <ClientFinanceDrawer clientId={drawerClientId} onClose={() => setDrawerClientId(null)} />
      )}

      {loading && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-2 text-sm text-gray-600">
          Loading dashboard…
        </div>
      )}
    </div>
  );
}
