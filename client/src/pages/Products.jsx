import { useState, useEffect } from 'react';
import { Plus, Package, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', active_ingredient: '', concentration: '', description: '', base_price: 0, currency: 'USD' });

  const fetchProducts = () => {
    setLoading(true);
    api.get('/pipeline/products')
      .then(res => setProducts(res.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) return toast.error('Name required');
    try {
      await api.post('/pipeline/products', form);
      toast.success('Product created');
      setShowForm(false);
      setForm({ name: '', category: '', active_ingredient: '', concentration: '', description: '', base_price: 0, currency: 'USD' });
      fetchProducts();
    } catch { toast.error('Failed'); }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-1">{products.length} products</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> Add Product
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Product</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input className={inputClass} value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><input className={inputClass} value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Active Ingredient</label><input className={inputClass} value={form.active_ingredient} onChange={e => setForm({...form, active_ingredient: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Concentration</label><input className={inputClass} value={form.concentration} onChange={e => setForm({...form, concentration: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label><input type="number" className={inputClass} value={form.base_price} onChange={e => setForm({...form, base_price: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <div key={p.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><Package size={18} className="text-green-600" /></div>
                <div>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.category}</p>
                </div>
              </div>
              <dl className="space-y-1 text-sm">
                {p.active_ingredient && <div className="flex justify-between"><dt className="text-gray-500">Ingredient</dt><dd>{p.active_ingredient}</dd></div>}
                {p.concentration && <div className="flex justify-between"><dt className="text-gray-500">Concentration</dt><dd>{p.concentration}</dd></div>}
                {p.base_price > 0 && <div className="flex justify-between"><dt className="text-gray-500">Base Price</dt><dd className="font-medium">{p.currency} {p.base_price}</dd></div>}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
