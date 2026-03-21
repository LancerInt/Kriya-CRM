import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function QuotationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    client_id: searchParams.get('client') || '',
    inquiry_id: searchParams.get('inquiry') || '',
    delivery_terms: 'FOB', currency: 'USD', packaging_details: '',
    validity_days: 30, notes: '',
  });

  const [items, setItems] = useState([{ product_name: '', description: '', quantity: 1, unit: 'KG', price: 0 }]);

  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data));
    api.get('/pipeline/products').then(res => setProducts(res.data));
  }, []);

  const addItem = () => setItems([...items, { product_name: '', description: '', quantity: 1, unit: 'KG', price: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id) return toast.error('Select a client');
    if (items.some(i => !i.product_name)) return toast.error('All items need a product name');
    setLoading(true);
    try {
      const res = await api.post('/pipeline/quotations', {
        ...form, items, subtotal, total: subtotal,
      });
      toast.success(`Quotation ${res.data.quotation_number} created`);
      navigate('/quotations');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create quotation');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm";

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Quotation</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select className={inputClass} value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                <option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
              <select className={inputClass} value={form.delivery_terms} onChange={e => setForm({...form, delivery_terms: e.target.value})}>
                <option>FOB</option><option>CIF</option><option>CFR</option><option>EXW</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select className={inputClass} value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                <option value="USD">USD</option><option value="INR">INR</option><option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validity (days)</label>
              <input type="number" className={inputClass} value={form.validity_days} onChange={e => setForm({...form, validity_days: parseInt(e.target.value) || 30})} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Packaging Details</label>
              <input className={inputClass} value={form.packaging_details} onChange={e => setForm({...form, packaging_details: e.target.value})} placeholder="e.g., 25kg bags, palletized" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
            <button type="button" onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={16} /> Add Item</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-600">Product</th>
                  <th className="text-left py-2 font-medium text-gray-600">Description</th>
                  <th className="text-left py-2 font-medium text-gray-600 w-24">Qty</th>
                  <th className="text-left py-2 font-medium text-gray-600 w-24">Unit</th>
                  <th className="text-left py-2 font-medium text-gray-600 w-32">Price</th>
                  <th className="text-left py-2 font-medium text-gray-600 w-32">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 pr-2"><input className={inputClass} value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} placeholder="Product" /></td>
                    <td className="py-2 pr-2"><input className={inputClass} value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Spec details" /></td>
                    <td className="py-2 pr-2"><input type="number" className={inputClass} value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                    <td className="py-2 pr-2">
                      <select className={inputClass} value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}>
                        <option>KG</option><option>MT</option><option>LTR</option><option>PCS</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2"><input type="number" step="0.01" className={inputClass} value={item.price} onChange={e => updateItem(i, 'price', parseFloat(e.target.value) || 0)} /></td>
                    <td className="py-2 pr-2 font-medium">{form.currency} {(item.quantity * item.price).toLocaleString()}</td>
                    <td className="py-2">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan="5" className="py-3 text-right font-semibold text-gray-700">Total:</td>
                  <td className="py-3 font-bold text-lg text-gray-900">{form.currency} {subtotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
          <textarea className={inputClass} rows="3" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Additional terms or notes..." />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Quotation'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
