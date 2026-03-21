import { useState, useEffect } from 'react';
import { MessageSquare, Mail, Phone, FileText, Plus, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Communications() {
  const [comms, setComms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client_id: '', type: 'note', direction: 'outbound', subject: '', body: '' });

  useEffect(() => {
    api.get('/communications').then(res => setComms(res.data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/clients').then(res => setClients(res.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id || !form.body) return toast.error('Client and message required');
    try {
      await api.post('/communications', form);
      toast.success('Communication logged');
      setShowForm(false);
      const res = await api.get('/communications');
      setComms(res.data);
    } catch { toast.error('Failed'); }
  };

  const typeIcons = { email: Mail, whatsapp: MessageSquare, note: FileText, call: Phone };
  const typeColors = { email: 'bg-blue-100 text-blue-600', whatsapp: 'bg-green-100 text-green-600', note: 'bg-gray-100 text-gray-600', call: 'bg-purple-100 text-purple-600' };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
          <p className="text-gray-500 mt-1">Recent communications</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> Log Communication
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log Communication</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                <select className={inputClass} value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} required>
                  <option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select className={inputClass} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="note">Note</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="call">Call</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Direction</label>
                  <select className={inputClass} value={form.direction} onChange={e => setForm({...form, direction: e.target.value})}>
                    <option value="outbound">Outbound</option><option value="inbound">Inbound</option>
                  </select>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject</label><input className={inputClass} value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Message *</label><textarea className={inputClass} rows="3" value={form.body} onChange={e => setForm({...form, body: e.target.value})} required /></div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : comms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No communications logged yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comms.map(c => {
            const Icon = typeIcons[c.type] || FileText;
            return (
              <div key={c.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${typeColors[c.type]}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-gray-900">{c.subject || c.type}</p>
                        <span className="text-xs text-gray-400 capitalize">{c.direction}</span>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    {c.body && <p className="text-sm text-gray-600 mt-1">{c.body}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>{c.client_name}</span>
                      {c.user_name && <span>by {c.user_name}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
