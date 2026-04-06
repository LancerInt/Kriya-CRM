"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchQuotations, submitForApproval, approveQuotation, generatePI, convertToOrder } from "@/store/slices/quotationSlice";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import AISummaryButton from "@/components/ai/AISummaryButton";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import QuotationEditorModal from "@/components/finance/QuotationEditorModal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import SearchableSelect from "@/components/ui/SearchableSelect";

export default function QuotationsPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.quotations);

  // Client selection for new quotation
  const [clients, setClients] = useState([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");

  // Quotation editor state
  const [showQtModal, setShowQtModal] = useState(false);
  const [qt, setQt] = useState(null);
  const [qtForm, setQtForm] = useState({});
  const [qtLoading, setQtLoading] = useState(false);
  const [qtSending, setQtSending] = useState(false);
  const [qtItems, setQtItems] = useState([]);

  useEffect(() => {
    dispatch(fetchQuotations());
  }, []);

  const handleAction = async (action, id, label) => {
    try {
      await dispatch(action(id)).unwrap();
      toast.success(label);
      dispatch(fetchQuotations());
    } catch (err) {
      toast.error(err?.detail || `Failed to ${label.toLowerCase()}`);
    }
  };

  const handleDownloadPDF = async (row) => {
    try {
      const res = await api.get(`/quotations/quotations/${row.id}/generate-pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url;
      a.setAttribute("download", `${row.quotation_number}.pdf`);
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error("Failed to download PDF"); }
  };

  // ── Create Quotation Flow ──
  const handleCreateQuotation = async () => {
    // Load clients list
    try {
      const res = await api.get("/clients/?page_size=500");
      setClients(res.data.results || res.data);
      setShowClientPicker(true);
    } catch { toast.error("Failed to load clients"); }
  };

  const handleClientSelected = async () => {
    if (!selectedClient) { toast.error("Select a client"); return; }
    setShowClientPicker(false);
    setQtLoading(true);
    setShowQtModal(true);
    try {
      const res = await api.post("/quotations/quotations/create-blank/", { client_id: selectedClient });
      setQt(res.data);
      setQtForm(res.data);
      setQtItems(res.data.items || []);
      dispatch(fetchQuotations());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create quotation")); setShowQtModal(false); }
    finally { setQtLoading(false); setSelectedClient(""); }
  };

  // ── Open existing quotation in editor ──
  const handleOpenQuotation = async (row) => {
    setQtLoading(true);
    setShowQtModal(true);
    try {
      const res = await api.get(`/quotations/quotations/${row.id}/`);
      setQt(res.data);
      setQtForm(res.data);
      setQtItems(res.data.items || []);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load quotation")); setShowQtModal(false); }
    finally { setQtLoading(false); }
  };

  // ── Save / Preview / Send handlers ──
  const handleSaveQt = async () => {
    if (!qt) return;
    try {
      const display_overrides = {};
      Object.entries(qtForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/quotations/quotations/${qt.id}/save-with-items/`, { ...qtForm, display_overrides, items: qtItems });
      setQt(res.data);
      setQtItems(res.data.items || []);
      toast.success("Quotation saved");
      dispatch(fetchQuotations());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  const handlePreviewQt = async () => {
    if (!qt) return;
    await handleSaveQt();
    try {
      const res = await api.get(`/quotations/quotations/${qt.id}/generate-pdf/`, { responseType: "blob" });
      const pdfUrl = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const title = `Quotation ${qt.quotation_number} - ${qt.client_name || "Client"}`;
      const w = window.open("", "_blank");
      if (w) { w.document.title = title; w.document.write(`<html><head><title>${title}</title><style>body{margin:0}</style></head><body><iframe src="${pdfUrl}" style="width:100%;height:100vh;border:none"></iframe></body></html>`); w.document.close(); }
    } catch { toast.error("Failed to preview"); }
  };

  const handleSendQt = async () => {
    if (!qt) return;
    setQtSending(true);
    try {
      await handleSaveQt();
      await api.post(`/quotations/quotations/${qt.id}/send-to-client/`, { send_via: "email" });
      toast.success("Quotation sent!");
      setShowQtModal(false);
      dispatch(fetchQuotations());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setQtSending(false); }
  };

  const columns = [
    { key: "quotation_number", label: "Number", render: (row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => handleOpenQuotation(row)} className="font-medium text-indigo-600 hover:text-indigo-700">{row.quotation_number || `Q-${row.id?.slice(0, 8)}`}</button>
        {row.version > 1 && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">v{row.version}</span>}
        {row.parent_number && <span className="text-[10px] text-gray-400">from {row.parent_number}</span>}
      </div>
    )},
    { key: "client_name", label: "Account" },
    { key: "total", label: "Value", render: (row) => row.total ? `$${Number(row.total).toLocaleString()}` : "\u2014" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", label: "Date", render: (row) => row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "\u2014" },
    { key: "actions", label: "", render: (row) => (
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => handleDownloadPDF(row)} className="text-xs text-green-600 hover:text-green-700 font-medium">PDF</button>
        {row.status === "draft" && (
          <button onClick={() => handleAction(submitForApproval, row.id, "Submitted for approval")} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Submit</button>
        )}
        {row.status === "pending_approval" && (
          <button onClick={() => handleAction(approveQuotation, row.id, "Approved")} className="text-xs text-green-600 hover:text-green-700 font-medium">Approve</button>
        )}
        {row.status === "approved" && (
          <>
            <button onClick={async () => { try { await api.post(`/quotations/quotations/${row.id}/send-to-client/`, { send_via: "email" }); toast.success("Quotation sent!"); dispatch(fetchQuotations()); } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); } }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Send via Email</button>
            <button onClick={() => { handleAction(generatePI, row.id, "PI generated"); }} className="text-xs text-purple-600 hover:text-purple-700 font-medium">Generate PI</button>
            <button onClick={() => handleAction(convertToOrder, row.id, "Converted to order")} className="text-xs text-green-600 hover:text-green-700 font-medium">Create Order</button>
          </>
        )}
        {row.status === "sent" && (
          <>
            <button onClick={() => { handleAction(generatePI, row.id, "PI generated"); }} className="text-xs text-purple-600 hover:text-purple-700 font-medium">Generate PI</button>
            <button onClick={() => handleAction(convertToOrder, row.id, "Converted to order")} className="text-xs text-green-600 hover:text-green-700 font-medium">Create Order</button>
          </>
        )}
        {["draft", "sent", "approved"].includes(row.status) && (
          <button onClick={async () => {
            try {
              const res = await api.post(`/quotations/quotations/${row.id}/revise/`);
              toast.success(`Revision v${res.data.version} created`);
              dispatch(fetchQuotations());
              handleOpenQuotation(res.data);
            } catch (err) { toast.error(getErrorMessage(err, "Failed to revise")); }
          }} className="text-xs text-amber-600 hover:text-amber-700 font-medium">Revise</button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Quotes"
        action={
          <div className="flex gap-2">
            <AISummaryButton variant="button" title="Quotations Summary" prompt="Summarize the current quotations pipeline. Use get_pipeline_summary and get_orders tools. Show: total quotations by status, conversion rate, top clients, and pending actions." />
            <button onClick={handleCreateQuotation} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
              Create Quotation
            </button>
          </div>
        }
      />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No quotations" emptyDescription="Create your first quotation" />

      {/* Client Picker Modal */}
      <Modal open={showClientPicker} onClose={() => setShowClientPicker(false)} title="Select Account" size="lg">
        <div className="space-y-4">
          <SearchableSelect
            label="Account"
            required
            value={selectedClient}
            onChange={(v) => setSelectedClient(v)}
            options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="Select an account..."
          />
          <div className="flex gap-3 pt-4">
            <button onClick={handleClientSelected} className="px-6 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700">Create</button>
            <button onClick={() => setShowClientPicker(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Loading Modal */}
      {qtLoading && showQtModal && (
        <Modal open={true} onClose={() => setShowQtModal(false)} title="Loading Quotation..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}

      {/* Quotation Editor Modal */}
      <QuotationEditorModal
        open={showQtModal && !qtLoading}
        onClose={() => { setShowQtModal(false); dispatch(fetchQuotations()); }}
        qt={qt} qtForm={qtForm} setQtForm={setQtForm}
        qtItems={qtItems} setQtItems={setQtItems}
        onSave={handleSaveQt} onPreview={handlePreviewQt}
        onSend={handleSendQt} sending={qtSending}
      />
    </div>
  );
}
