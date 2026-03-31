"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import PIEditorModal from "@/components/finance/PIEditorModal";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import SearchableSelect from "@/components/ui/SearchableSelect";

export default function ProformaInvoicesPage() {
  const [piList, setPiList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");

  // PI editor state
  const [showPiModal, setShowPiModal] = useState(false);
  const [pi, setPi] = useState(null);
  const [piForm, setPiForm] = useState({});
  const [piItems, setPiItems] = useState([]);
  const [piLoading, setPiLoading] = useState(false);
  const [piSending, setPiSending] = useState(false);

  // Review modal
  const [selectedPI, setSelectedPI] = useState(null);
  const [showReview, setShowReview] = useState(false);

  const loadPIs = async () => {
    try {
      const res = await api.get("/finance/pi/");
      setPiList(res.data.results || res.data);
    } catch { toast.error("Failed to load proforma invoices"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadPIs();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  // ── Create standalone PI ──
  const handleCreatePI = async () => {
    if (!selectedClient) return;
    try {
      const res = await api.post("/finance/pi/create-standalone/", { client_id: selectedClient });
      toast.success("Proforma Invoice created");
      setShowClientPicker(false);
      setSelectedClient("");
      loadPIs();
      _openPIEditor(res.data.id);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create PI")); }
  };

  // ── Open PI in editor ──
  const _openPIEditor = async (piId) => {
    setPiLoading(true);
    setShowPiModal(true);
    try {
      const res = await api.get(`/finance/pi/${piId}/`);
      setPi(res.data);
      setPiForm(res.data);
      setPiItems(res.data.items || []);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load PI")); setShowPiModal(false); }
    finally { setPiLoading(false); }
  };

  // ── Save PI ──
  const handleSavePI = async () => {
    if (!pi) return;
    try {
      const display_overrides = {};
      Object.entries(piForm).forEach(([k, v]) => {
        if (k.startsWith("_")) display_overrides[k] = v;
      });
      const res = await api.post(`/finance/pi/${pi.id}/save-with-items/`, { ...piForm, display_overrides, items: piItems });
      setPi(res.data);
      setPiItems(res.data.items || []);
      toast.success("PI saved");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to save")); }
  };

  // ── Preview PDF ──
  const handlePreviewPI = async () => {
    if (!pi) return;
    await handleSavePI();
    try {
      const res = await api.get(`/finance/pi/${pi.id}/generate-pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch { toast.error("Failed to preview"); }
  };

  // ── Send PI ──
  const handleSendPI = async () => {
    if (!pi) return;
    setPiSending(true);
    try {
      await handleSavePI();
      await api.post(`/finance/pi/${pi.id}/send-email/`);
      toast.success("PI sent to client!");
      setShowPiModal(false);
      loadPIs();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setPiSending(false); }
  };

  // ── Convert PI to Order ──
  const handleConvertToOrder = async (piData) => {
    try {
      const res = await api.post(`/finance/pi/${piData.id}/convert-to-order/`);
      toast.success(`Order ${res.data.order_number} created from PI`);
      loadPIs();
      setShowReview(false);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to convert to order")); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>;

  const draftPIs = piList.filter(p => p.status === "draft");
  const sentPIs = piList.filter(p => p.status === "sent");

  return (
    <div>
      <PageHeader
        title="Proforma Invoices"
        subtitle={`${piList.length} total · ${draftPIs.length} draft · ${sentPIs.length} sent`}
        action={
          <button onClick={() => setShowClientPicker(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Create PI
          </button>
        }
      />

      {piList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No proforma invoices yet.</p>
          <p className="text-sm text-gray-400 mt-1">Create one for a client or generate from an order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {piList.map((piData) => (
            <div key={piData.id} onClick={() => { setSelectedPI(piData); setShowReview(true); }}
              className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${
                piData.status === "draft" ? "border-amber-300 bg-amber-50/30" : "border-green-300 bg-green-50/20"
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={piData.status} />
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{piData.invoice_number}</span>
                    {piData.order_number && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Order: {piData.order_number}</span>}
                  </div>
                  <h3 className="font-semibold text-sm">{piData.client_company_name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {piData.currency} {Number(piData.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {piData.terms_of_delivery ? ` · ${piData.terms_of_delivery}` : ""}
                  </p>
                  {piData.items && piData.items.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {piData.items.map(item => item.product_name).filter(Boolean).join(", ") || "No products"}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-400">
                  {piData.created_at ? format(new Date(piData.created_at), "MMM d, yyyy h:mm a") : ""}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                {piData.status === "sent" ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">Sent</span>
                ) : (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">Draft</span>
                )}
                <div className="flex gap-2">
                  {!piData.order && (
                    <button onClick={(e) => { e.stopPropagation(); handleConvertToOrder(piData); }} className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium hover:bg-blue-700">Convert to Order</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); _openPIEditor(piData.id); }} className="text-xs bg-teal-600 text-white px-3 py-1 rounded font-medium hover:bg-teal-700">
                    {piData.status === "draft" ? "Edit & Send" : "View"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client Picker Modal */}
      <Modal open={showClientPicker} onClose={() => { setShowClientPicker(false); setSelectedClient(""); }} title="Create Proforma Invoice">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Select an account to create a new Proforma Invoice.</p>
          <SearchableSelect
            label="Account"
            required
            value={selectedClient}
            onChange={(v) => setSelectedClient(v)}
            options={clients.map((c) => ({ value: c.id, label: c.company_name }))}
            placeholder="Select Account"
          />
          <div className="flex gap-3 pt-2">
            <button onClick={handleCreatePI} disabled={!selectedClient} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">Create PI</button>
            <button onClick={() => { setShowClientPicker(false); setSelectedClient(""); }} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title="Proforma Invoice Details" size="lg">
        {selectedPI && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-xs text-gray-500 block">PI Number</span><span className="font-medium">{selectedPI.invoice_number}</span></div>
              <div><span className="text-xs text-gray-500 block">Status</span><StatusBadge status={selectedPI.status} /></div>
              <div><span className="text-xs text-gray-500 block">Date</span><span className="font-medium">{selectedPI.invoice_date || "—"}</span></div>
              <div><span className="text-xs text-gray-500 block">Client</span><span className="font-medium">{selectedPI.client_company_name}</span></div>
              <div><span className="text-xs text-gray-500 block">Total</span><span className="font-medium">{selectedPI.currency} {Number(selectedPI.total).toLocaleString()}</span></div>
              {selectedPI.order_number && <div><span className="text-xs text-gray-500 block">Linked Order</span><span className="font-medium text-blue-600">{selectedPI.order_number}</span></div>}
              {selectedPI.terms_of_delivery && <div><span className="text-xs text-gray-500 block">Delivery Terms</span><span className="font-medium">{selectedPI.terms_of_delivery}</span></div>}
              {selectedPI.terms_of_trade && <div><span className="text-xs text-gray-500 block">Payment Terms</span><span className="font-medium">{selectedPI.terms_of_trade}</span></div>}
            </div>

            {/* Items */}
            {selectedPI.items && selectedPI.items.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Items</h4>
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="py-2 px-2 text-left">Product</th><th className="py-2 px-2 text-right">Qty</th><th className="py-2 px-2 text-right">Price</th><th className="py-2 px-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {selectedPI.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-2">{item.product_name || "—"}</td>
                        <td className="py-2 px-2 text-right">{Number(item.quantity).toLocaleString()} {item.unit}</td>
                        <td className="py-2 px-2 text-right">{Number(item.unit_price).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-medium">{Number(item.total_price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t">
              <button onClick={() => setShowReview(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
              <div className="flex gap-2">
                {!selectedPI.order && (
                  <button onClick={() => handleConvertToOrder(selectedPI)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">Convert to Order</button>
                )}
                <button onClick={() => { setShowReview(false); _openPIEditor(selectedPI.id); }} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                  {selectedPI.status === "draft" ? "Edit PI" : "View PI"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* PI Editor Modal */}
      {piLoading && showPiModal && (
        <Modal open={true} onClose={() => setShowPiModal(false)} title="Loading PI..." size="sm">
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        </Modal>
      )}
      <PIEditorModal
        open={showPiModal && !piLoading}
        onClose={() => { setShowPiModal(false); loadPIs(); }}
        pi={pi} piForm={piForm} setPiForm={setPiForm}
        piItems={piItems} setPiItems={setPiItems}
        onSave={handleSavePI} onPreview={handlePreviewPI}
        onSend={handleSendPI} sending={piSending}
      />
    </div>
  );
}
