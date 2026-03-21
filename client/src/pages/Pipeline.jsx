import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, X, ArrowRight } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const STAGES = ['inquiry', 'discussion', 'sample', 'quotation', 'negotiation', 'order_confirmed', 'lost'];
const STAGE_COLORS = {
  inquiry: 'bg-blue-500', discussion: 'bg-yellow-500', sample: 'bg-purple-500',
  quotation: 'bg-green-500', negotiation: 'bg-orange-500', order_confirmed: 'bg-emerald-600', lost: 'bg-red-500'
};

export default function Pipeline() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();
  const [form, setForm] = useState({ client_id: '', source: 'manual', product_name: '', quantity: '', requirements: '', notes: '', expected_value: 0, currency: 'USD' });

  const fetchInquiries = () => {
    setLoading(true);
    api.get('/pipeline/inquiries')
      .then(res => setInquiries(res.data))
      .catch(() => toast.error('Failed to load pipeline'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInquiries(); }, []);
  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data));
    api.get('/pipeline/products').then(res => setProducts(res.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id) return toast.error('Select a client');
    try {
      await api.post('/pipeline/inquiries', form);
      toast.success('Inquiry created');
      setShowForm(false);
      setForm({ client_id: '', source: 'manual', product_name: '', quantity: '', requirements: '', notes: '', expected_value: 0, currency: 'USD' });
      fetchInquiries();
    } catch { toast.error('Failed to create inquiry'); }
  };

  const moveStage = async (id, newStage) => {
    try {
      const inq = inquiries.find(i => i.id === id);
      await api.put(`/pipeline/inquiries/${id}`, { stage: newStage, notes: inq.notes, expected_value: inq.expected_value });
      toast.success(`Moved to ${newStage}`);
      fetchInquiries();
    } catch { toast.error('Failed to update'); }
  };

  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = inquiries.filter(i => i.stage === stage);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Pipeline</h1>
          <p className="text-gray-500 mt-1">{inquiries.length} active inquiries</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> New Inquiry
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Inquiry</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                  <option value="">Select client...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.source} onChange={e => setForm({...form, source: e.target.value})}>
                    <option value="manual">Manual</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Product</label><input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} placeholder="Product name" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label><input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} placeholder="e.g., 5 MT" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Expected Value</label><input type="number" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.expected_value} onChange={e => setForm({...form, expected_value: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label><textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" rows="2" value={form.requirements} onChange={e => setForm({...form, requirements: e.target.value})} /></div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Create Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pipeline Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {STAGES.filter(s => s !== 'order_confirmed' && s !== 'lost').map(stage => (
            <div key={stage} className="w-72 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${STAGE_COLORS[stage]}`}></div>
                <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage}</h3>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{grouped[stage]?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {(grouped[stage] || []).map(inq => (
                  <div key={inq.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
                    <p className="font-medium text-sm text-gray-900">{inq.client_name}</p>
                    <p className="text-xs text-gray-500 mt-1">{inq.product_name || inq.product_display_name || 'No product'} {inq.quantity ? `- ${inq.quantity}` : ''}</p>
                    {inq.expected_value > 0 && <p className="text-xs font-medium text-green-600 mt-1">${inq.expected_value.toLocaleString()}</p>}
                    <div className="flex items-center gap-1 mt-3">
                      {STAGES.indexOf(stage) < STAGES.indexOf('negotiation') && (
                        <button onClick={() => moveStage(inq.id, STAGES[STAGES.indexOf(stage) + 1])}
                          className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                          Next <ArrowRight size={12} />
                        </button>
                      )}
                      {stage === 'quotation' && (
                        <Link to={`/quotations/new?inquiry=${inq.id}&client=${inq.client_id}`}
                          className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">
                          Create Quote
                        </Link>
                      )}
                      <button onClick={() => moveStage(inq.id, 'lost')} className="text-xs text-red-400 hover:text-red-600 ml-auto">Lost</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}