"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import FinanceDashboard from "@/components/finance/FinanceDashboard";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import AISummaryButton from "@/components/ai/AISummaryButton";

const TABS = ["Dashboard", "Invoices", "Payments", "FIRC"];

const initialInvoiceForm = { client: "", order: "", invoice_type: "proforma", currency: "USD", subtotal: "", tax: "", due_date: "", notes: "" };
const initialPaymentForm = { client: "", invoice: "", amount: "", currency: "USD", payment_date: "", mode: "TT", reference: "", notes: "" };
const initialFircForm = { payment: "", status: "pending", received_date: "" };
const initialGstForm = { shipment: "", eligible_amount: "", claimed_amount: "", status: "filed" };

export default function FinancePage() {
  const router = useRouter();
  const currentUser = useSelector((state) => state.auth.user);
  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  // Role gate — Finance is restricted to admin/manager only.
  // If an executive lands here (typed URL, bookmark, etc.) bounce them
  // back to the dashboard with a toast.
  useEffect(() => {
    if (currentUser && !isAdminOrManager) {
      toast.error("Finance is restricted to admin and manager only");
      router.replace("/dashboard");
    }
  }, [currentUser, isAdminOrManager, router]);

  const [activeTab, setActiveTab] = useState("Dashboard");

  // Data states
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [fircs, setFircs] = useState([]);
  const [gstRecords, setGstRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFircModal, setShowFircModal] = useState(false);
  const [showGstModal, setShowGstModal] = useState(false);

  // Form states
  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [fircForm, setFircForm] = useState(initialFircForm);
  const [gstForm, setGstForm] = useState(initialGstForm);

  // Dropdown options
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  // Load dropdown options
  useEffect(() => {
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
    api.get("/orders/").then((r) => setOrders(r.data.results || r.data)).catch(() => {});
    api.get("/shipments/").then((r) => setShipments(r.data.results || r.data)).catch(() => {});
  }, []);

  // Load tab data
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const loadTabData = async () => {
    if (activeTab === "Dashboard") {
      // Dashboard component fetches its own data — don't trigger the
      // legacy invoice/payment loads here.
      return;
    }
    setLoading(true);
    try {
      if (activeTab === "Invoices") {
        // Show Client (Commercial) Invoices here — Proforma Invoices live
        // in their own page. The CI model stores client_company_name as a
        // snapshot taken at creation, but we prefer the live client name
        // off the FK so a later client rename in the sales order surfaces
        // here automatically. Falls back to the snapshot if the FK is gone.
        const [ciRes, clientsRes] = await Promise.all([
          api.get("/finance/ci/"),
          api.get("/clients/", { params: { page_size: 1000 } }).catch(() => ({ data: { results: [] } })),
        ]);
        const cis = ciRes.data.results || ciRes.data;
        const clientList = clientsRes.data.results || clientsRes.data || [];
        const clientById = new Map(clientList.map(c => [c.id, c.company_name]));
        const normalized = (cis || []).map(ci => ({
          ...ci,
          client_name: clientById.get(ci.client) || ci.client_company_name || "",
          invoice_type: "commercial",
          total: ci.total_invoice_usd || ci.grand_total_inr || 0,
          due_date: ci.invoice_date || null,
        }));
        setInvoices(normalized);
      } else if (activeTab === "Payments") {
        const res = await api.get("/finance/payments/");
        setPayments(res.data.results || res.data);
        // Also load invoices for the payment modal dropdown
        const invRes = await api.get("/finance/invoices/");
        setInvoiceOptions(invRes.data.results || invRes.data);
      } else if (activeTab === "FIRC") {
        const res = await api.get("/finance/firc/");
        setFircs(res.data.results || res.data);
        // Also load payments for the FIRC modal dropdown
        const payRes = await api.get("/finance/payments/");
        setPaymentOptions(payRes.data.results || payRes.data);
      } else if (activeTab === "GST") {
        const res = await api.get("/finance/gst/");
        setGstRecords(res.data.results || res.data);
      }
    } catch {
      toast.error(`Failed to load ${activeTab.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate total
  const invoiceTotal = (Number(invoiceForm.subtotal) || 0) + (Number(invoiceForm.tax) || 0);

  // Handlers
  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...invoiceForm, total: invoiceTotal };
      await api.post("/finance/invoices/", payload);
      toast.success("Invoice created");
      setShowInvoiceModal(false);
      setInvoiceForm(initialInvoiceForm);
      loadTabData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create invoice")); } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/finance/payments/", paymentForm);
      toast.success("Payment recorded");
      setShowPaymentModal(false);
      setPaymentForm(initialPaymentForm);
      loadTabData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to record payment")); } finally {
      setSubmitting(false);
    }
  };

  const handleCreateFirc = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/finance/firc/", fircForm);
      toast.success("FIRC record added");
      setShowFircModal(false);
      setFircForm(initialFircForm);
      loadTabData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add FIRC record")); } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGst = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/finance/gst/", gstForm);
      toast.success("GST record added");
      setShowGstModal(false);
      setGstForm(initialGstForm);
      loadTabData();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to add GST record")); } finally {
      setSubmitting(false);
    }
  };

  // Column definitions
  const invoiceColumns = [
    { key: "invoice_number", label: "Invoice #", render: (row) => <span className="font-medium">{row.invoice_number || `INV-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "invoice_type", label: "Type", render: () => <StatusBadge status="Client Invoice" /> },
    { key: "currency", label: "Currency", render: (row) => row.currency || "USD" },
    { key: "total", label: "Total", render: (row) => row.total ? `${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "due_date", label: "Invoice Date", render: (row) => row.due_date ? format(new Date(row.due_date), "MMM d, yyyy") : "\u2014" },
  ];

  const paymentColumns = [
    { key: "client_name", label: "Client", render: (row) => row.client_name || "—" },
    { key: "amount", label: "Amount", render: (row) => {
      if (!row.amount) return "—";
      const total = Number(row.amount).toLocaleString();
      const b = row.payment_breakdown;
      if (!b || (!b.advance_pct && !b.balance_pct)) {
        return <span className="font-semibold text-gray-900">{total}</span>;
      }
      const advanceTotal = Number(b.advance_amount || 0);
      const balanceTotal = Number(b.balance_amount || 0);
      const grandTotal = advanceTotal + balanceTotal;
      const advanceWidth = grandTotal > 0 ? (advanceTotal / grandTotal) * 100 : 0;
      const balanceWidth = 100 - advanceWidth;
      // Pill colors — emerald when received, amber for advance pending,
      // slate for balance pending.
      const advClass = b.advance_received
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
      const balClass = b.balance_received
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-slate-50 text-slate-700 border-slate-200";
      return (
        <div className="space-y-1.5 min-w-[180px]">
          <div className="font-semibold text-gray-900">{total}</div>
          {/* segmented progress bar — shows split + paid state */}
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
            {b.advance_pct > 0 && (
              <div
                className={b.advance_received ? "bg-emerald-500" : "bg-amber-400"}
                style={{ width: `${advanceWidth}%` }}
                title={`Advance ${b.advance_pct}%`}
              />
            )}
            {b.balance_pct > 0 && (
              <div
                className={b.balance_received ? "bg-emerald-500" : "bg-slate-300"}
                style={{ width: `${balanceWidth}%` }}
                title={`Balance ${b.balance_pct}%`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {b.advance_pct > 0 && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${advClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${b.advance_received ? "bg-emerald-500" : "bg-amber-400"}`} />
                Adv {b.advance_pct}% · {Number(b.advance_amount).toLocaleString()}
              </span>
            )}
            {b.balance_pct > 0 && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${balClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${b.balance_received ? "bg-emerald-500" : "bg-slate-400"}`} />
                Bal {b.balance_pct}% · {Number(b.balance_amount).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      );
    } },
    { key: "currency", label: "Currency", render: (row) => row.currency || "USD" },
    { key: "order_number", label: "Order #", render: (row) => row.order_number ? <span className="font-medium text-blue-700">{row.order_number}</span> : "—" },
    { key: "payment_date", label: "Date", render: (row) => row.payment_date ? format(new Date(row.payment_date), "MMM d, yyyy") : "—" },
  ];

  const fircColumns = [
    { key: "source_label", label: "Source", render: (row) => {
      if (!row.source_label) return "—";
      const kindBadge = row.source_kind === "order"
        ? <span className="text-[10px] uppercase tracking-wide font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Order</span>
        : row.source_kind === "sample"
          ? <span className="text-[10px] uppercase tracking-wide font-semibold text-fuchsia-700 bg-fuchsia-50 px-1.5 py-0.5 rounded">Sample</span>
          : <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">Payment</span>;
      return (
        <div className="flex items-center gap-2">
          {kindBadge}
          <span className="font-medium">{row.source_label}</span>
        </div>
      );
    }},
    { key: "client_name", label: "Client", render: (row) => row.client_name || "—" },
    { key: "amount", label: "Amount", render: (row) => row.amount != null ? `${row.currency || "USD"} ${Number(row.amount).toLocaleString()}` : "—" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "received_date", label: "Received Date", render: (row) => row.received_date ? format(new Date(row.received_date), "MMM d, yyyy") : "—" },
  ];

  const gstColumns = [
    { key: "shipment_name", label: "Shipment", render: (row) => row.shipment_name || row.shipment_detail?.name || `SHP-${row.shipment?.toString().slice(0, 8) || row.id?.slice(0, 8)}` },
    { key: "eligible_amount", label: "Eligible Amount", render: (row) => row.eligible_amount ? `${Number(row.eligible_amount).toLocaleString()}` : "\u2014" },
    { key: "claimed_amount", label: "Claimed Amount", render: (row) => row.claimed_amount ? `${Number(row.claimed_amount).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  const getActionButton = () => {
    // Client Invoices are created from the Sales Order page only — no
    // standalone "+ New Invoice" entry point on this tab.
    if (activeTab === "Invoices") {
      return null;
    }
    if (activeTab === "Payments") {
      return (
        <button onClick={() => setShowPaymentModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Record Payment
        </button>
      );
    }
    if (activeTab === "FIRC") {
      return (
        <button onClick={() => setShowFircModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Add FIRC
        </button>
      );
    }
    if (activeTab === "GST") {
      return (
        <button onClick={() => setShowGstModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + Add GST Record
        </button>
      );
    }
    return null;
  };

  // Don't render anything for executives — the useEffect above will redirect.
  // This prevents a flash of content while the redirect is in flight.
  if (currentUser && !isAdminOrManager) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle={
          activeTab === "Dashboard"
            ? "Track revenue, payments, receivables, and financial performance across clients."
            : "Invoices, payments, and FIRC records"
        }
        action={
          <div className="flex gap-2">
            {getActionButton()}
            <AISummaryButton variant="button" title="Finance Summary" prompt={`Write a tight Finance summary for the ${activeTab} view using the pre-loaded finance data. Structure with these sections (## headings):\n\n## Revenue & Payments\nOne paragraph: total invoiced (by currency), payments received total, this month's payment total.\n\n## Receivables\nOutstanding amount, overdue amount, and overdue invoice count. List up to 5 oldest overdue invoices: invoice# · client · amount · days overdue.\n\n## FIRC\nPending vs received counts in one line.\n\n## Payment Risk\nUp to 5 orders flagged for payment risk: order# · client · payment terms · days since dispatch.\n\n## Top Clients\nTop 5 by revenue, one line each.\n\n### Needs Attention Today\n2-3 specific actions.\n\nKeep under 350 words. Don't enumerate every record.`} />
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Dashboard" && <FinanceDashboard />}
      {activeTab === "Invoices" && (
        <DataTable columns={invoiceColumns} data={invoices} loading={loading} emptyTitle="No client invoices yet" emptyDescription="Client Invoices are created from the Sales Order page." onRowClick={(row) => row.order ? router.push(`/orders/${row.order}`) : null} />
      )}
      {activeTab === "Payments" && (
        <DataTable columns={paymentColumns} data={payments} loading={loading} emptyTitle="No payments yet" emptyDescription="Record your first payment" onRowClick={(row) => row.order_id ? router.push(`/orders/${row.order_id}`) : null} />
      )}
      {activeTab === "FIRC" && (
        <DataTable columns={fircColumns} data={fircs} loading={loading} emptyTitle="No FIRC records" emptyDescription="Add your first FIRC record" />
      )}
      {activeTab === "GST" && (
        <DataTable columns={gstColumns} data={gstRecords} loading={loading} emptyTitle="No GST records" emptyDescription="Add your first GST record" />
      )}

      {/* Invoice Modal */}
      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="New Invoice" size="lg">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={invoiceForm.client} onChange={(e) => setInvoiceForm({ ...invoiceForm, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <select value={invoiceForm.order} onChange={(e) => setInvoiceForm({ ...invoiceForm, order: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number || `ORD-${o.id?.slice(0, 8)}`}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Type</label>
              <select value={invoiceForm.invoice_type} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="proforma">Proforma</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={invoiceForm.currency} onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal *</label>
              <input type="number" step="0.01" value={invoiceForm.subtotal} onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax</label>
              <input type="number" step="0.01" value={invoiceForm.tax} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
              <input type="text" value={invoiceTotal.toFixed(2)} readOnly className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
            <input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Invoice"}
            </button>
            <button type="button" onClick={() => setShowInvoiceModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Record Payment" size="lg">
        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={paymentForm.client} onChange={(e) => setPaymentForm({ ...paymentForm, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice</label>
              <select value={paymentForm.invoice} onChange={(e) => setPaymentForm({ ...paymentForm, invoice: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {invoiceOptions.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_number || `INV-${inv.id?.slice(0, 8)}`}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={paymentForm.currency} onChange={(e) => setPaymentForm({ ...paymentForm, currency: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
              <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="TT">TT (Telegraphic Transfer)</option>
                <option value="LC">LC (Letter of Credit)</option>
                <option value="advance">Advance</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
              <input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Recording..." : "Record Payment"}
            </button>
            <button type="button" onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* FIRC Modal */}
      <Modal open={showFircModal} onClose={() => setShowFircModal(false)} title="Add FIRC Record">
        <form onSubmit={handleCreateFirc} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment *</label>
            <select value={fircForm.payment} onChange={(e) => setFircForm({ ...fircForm, payment: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select</option>
              {paymentOptions.map((p) => <option key={p.id} value={p.id}>{p.reference || `PAY-${p.id?.slice(0, 8)}`}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={fircForm.status} onChange={(e) => setFircForm({ ...fircForm, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="pending">Pending</option>
              <option value="received">Received</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Received Date</label>
            <input type="date" value={fircForm.received_date} onChange={(e) => setFircForm({ ...fircForm, received_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Adding..." : "Add FIRC Record"}
            </button>
            <button type="button" onClick={() => setShowFircModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* GST Modal */}
      <Modal open={showGstModal} onClose={() => setShowGstModal(false)} title="Add GST Record">
        <form onSubmit={handleCreateGst} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shipment *</label>
            <select value={gstForm.shipment} onChange={(e) => setGstForm({ ...gstForm, shipment: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="">Select</option>
              {shipments.map((s) => <option key={s.id} value={s.id}>{s.shipment_number || s.name || `SHP-${s.id?.slice(0, 8)}`}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eligible Amount *</label>
              <input type="number" step="0.01" value={gstForm.eligible_amount} onChange={(e) => setGstForm({ ...gstForm, eligible_amount: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Claimed Amount</label>
              <input type="number" step="0.01" value={gstForm.claimed_amount} onChange={(e) => setGstForm({ ...gstForm, claimed_amount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={gstForm.status} onChange={(e) => setGstForm({ ...gstForm, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="filed">Filed</option>
              <option value="processing">Processing</option>
              <option value="received">Received</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Adding..." : "Add GST Record"}
            </button>
            <button type="button" onClick={() => setShowGstModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
