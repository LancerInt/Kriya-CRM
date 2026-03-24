"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";

const TABS = ["Invoices", "Payments", "FIRC", "GST"];

const initialInvoiceForm = { client: "", order: "", invoice_type: "proforma", currency: "USD", subtotal: "", tax: "", due_date: "", notes: "" };
const initialPaymentForm = { client: "", invoice: "", amount: "", currency: "USD", payment_date: "", mode: "TT", reference: "", notes: "" };
const initialFircForm = { payment: "", status: "pending", received_date: "" };
const initialGstForm = { shipment: "", eligible_amount: "", claimed_amount: "", status: "filed" };

export default function FinancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Invoices");

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
    setLoading(true);
    try {
      if (activeTab === "Invoices") {
        const res = await api.get("/finance/invoices/");
        setInvoices(res.data.results || res.data);
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
    } catch {
      toast.error("Failed to create invoice");
    } finally {
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
    } catch {
      toast.error("Failed to record payment");
    } finally {
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
    } catch {
      toast.error("Failed to add FIRC record");
    } finally {
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
    } catch {
      toast.error("Failed to add GST record");
    } finally {
      setSubmitting(false);
    }
  };

  // Column definitions
  const invoiceColumns = [
    { key: "invoice_number", label: "Invoice #", render: (row) => <span className="font-medium">{row.invoice_number || `INV-${row.id?.slice(0, 8)}`}</span> },
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "invoice_type", label: "Type", render: (row) => <StatusBadge status={row.invoice_type} /> },
    { key: "currency", label: "Currency", render: (row) => row.currency || "USD" },
    { key: "total", label: "Total", render: (row) => row.total ? `${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "due_date", label: "Due Date", render: (row) => row.due_date ? format(new Date(row.due_date), "MMM d, yyyy") : "\u2014" },
  ];

  const paymentColumns = [
    { key: "client_name", label: "Client", render: (row) => row.client_name || "\u2014" },
    { key: "amount", label: "Amount", render: (row) => row.amount ? `${Number(row.amount).toLocaleString()}` : "\u2014" },
    { key: "currency", label: "Currency", render: (row) => row.currency || "USD" },
    { key: "mode", label: "Mode", render: (row) => row.mode || "\u2014" },
    { key: "payment_date", label: "Date", render: (row) => row.payment_date ? format(new Date(row.payment_date), "MMM d, yyyy") : "\u2014" },
    { key: "reference", label: "Reference", render: (row) => row.reference || "\u2014" },
  ];

  const fircColumns = [
    { key: "payment_reference", label: "Payment Ref", render: (row) => row.payment_reference || row.payment_detail?.reference || `PAY-${row.payment?.toString().slice(0, 8) || row.id?.slice(0, 8)}` },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "received_date", label: "Received Date", render: (row) => row.received_date ? format(new Date(row.received_date), "MMM d, yyyy") : "\u2014" },
  ];

  const gstColumns = [
    { key: "shipment_name", label: "Shipment", render: (row) => row.shipment_name || row.shipment_detail?.name || `SHP-${row.shipment?.toString().slice(0, 8) || row.id?.slice(0, 8)}` },
    { key: "eligible_amount", label: "Eligible Amount", render: (row) => row.eligible_amount ? `${Number(row.eligible_amount).toLocaleString()}` : "\u2014" },
    { key: "claimed_amount", label: "Claimed Amount", render: (row) => row.claimed_amount ? `${Number(row.claimed_amount).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  const getActionButton = () => {
    if (activeTab === "Invoices") {
      return (
        <button onClick={() => setShowInvoiceModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          + New Invoice
        </button>
      );
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

  return (
    <div>
      <PageHeader title="Finance" subtitle="Invoices, payments, FIRC and GST records" action={getActionButton()} />

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
      {activeTab === "Invoices" && (
        <DataTable columns={invoiceColumns} data={invoices} loading={loading} emptyTitle="No invoices yet" emptyDescription="Create your first invoice to get started" onRowClick={(row) => router.push(`/finance/invoices/${row.id}`)} />
      )}
      {activeTab === "Payments" && (
        <DataTable columns={paymentColumns} data={payments} loading={loading} emptyTitle="No payments yet" emptyDescription="Record your first payment" />
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
