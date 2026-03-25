"use client";
import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { createQuotation } from "@/store/slices/quotationSlice";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";

export default function NewQuotationPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const [inquiries, setInquiries] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    inquiry: "",
    valid_until: "",
    payment_terms: "advance",
    payment_terms_detail: "",
    delivery_terms: "FOB",
    freight_terms: "sea_fcl",
    notes: "",
    items: [{ product: "", quantity: 1, unit_price: "" }],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/quotations/inquiries/").then((r) => setInquiries(r.data.results || r.data)).catch(() => {});
    api.get("/products/").then((r) => setProducts(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleItemChange = (i, field, value) => {
    const items = [...form.items];
    items[i] = { ...items[i], [field]: value };
    setForm({ ...form, items });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { product: "", quantity: 1, unit_price: "" }] });
  };

  const removeItem = (i) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await dispatch(createQuotation(form)).unwrap();
      toast.success("Quotation created");
      router.push("/quotations");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create quotation")); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Quotation" />
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inquiry *</label>
              <select value={form.inquiry} onChange={(e) => setForm({ ...form, inquiry: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select inquiry</option>
                {inquiries.map((i) => <option key={i.id} value={i.id}>{i.client_name} - {i.product_name || "General"}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>

          <h3 className="font-semibold pt-4 border-t">Trade Terms</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms *</label>
              <select value={form.delivery_terms} onChange={(e) => setForm({ ...form, delivery_terms: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="EXW">EXW - Ex Works (Factory)</option>
                <option value="FCA">FCA - Free Carrier</option>
                <option value="FOB">FOB - Free on Board</option>
                <option value="CFR">CFR - Cost & Freight</option>
                <option value="CIF">CIF - Cost Insurance & Freight</option>
                <option value="DAP">DAP - Delivered at Place</option>
                <option value="DDP">DDP - Delivered Duty Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms *</label>
              <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="advance">100% Advance</option>
                <option value="50_advance">50% Advance + 50% Before Shipment</option>
                <option value="30_70">30% Advance + 70% Against BL</option>
                <option value="lc">Letter of Credit (LC)</option>
                <option value="da">D/A - Documents Against Acceptance</option>
                <option value="dp">D/P - Documents Against Payment</option>
                <option value="cad">CAD - Cash Against Documents</option>
                <option value="tt">TT - Telegraphic Transfer</option>
                <option value="credit_30">Net 30 Days Credit</option>
                <option value="credit_60">Net 60 Days Credit</option>
                <option value="custom">Custom Terms</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Freight</label>
              <select value={form.freight_terms} onChange={(e) => setForm({ ...form, freight_terms: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="sea_fcl">Sea - FCL (Full Container)</option>
                <option value="sea_lcl">Sea - LCL (Less Container)</option>
                <option value="air">Air Freight</option>
                <option value="courier">Courier</option>
                <option value="ex_works">Ex Works (Buyer arranges)</option>
              </select>
            </div>
          </div>
          {form.payment_terms === "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Payment Terms</label>
              <input value={form.payment_terms_detail} onChange={(e) => setForm({ ...form, payment_terms_detail: e.target.value })} placeholder="Describe custom payment terms" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          )}

          <h3 className="font-semibold pt-4 border-t">Line Items</h3>
          {form.items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 items-end p-3 bg-gray-50 rounded-lg">
              <div className="col-span-5">
                <label className="block text-xs text-gray-500 mb-1">Product</label>
                <select value={item.product} onChange={(e) => handleItemChange(i, "product", e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">Select</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-gray-500 mb-1">Qty (MT)</label>
                <input type="number" value={item.quantity} onChange={(e) => handleItemChange(i, "quantity", e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="col-span-3">
                <label className="block text-xs text-gray-500 mb-1">Unit Price ($)</label>
                <input type="number" step="0.01" value={item.unit_price} onChange={(e) => handleItemChange(i, "unit_price", e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-600 text-sm">&times;</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addItem} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Add item</button>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Quotation"}
            </button>
            <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </form>
    </div>
  );
}
