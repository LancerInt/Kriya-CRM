import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    company_name: '', country: '', address: '', business_type: '',
    delivery_terms: 'FOB', preferred_currency: 'USD', credit_days: 30,
    credit_limit: 0, payment_mode: '', primary_executive_id: '', notes: '',
    status: 'active',
  });
  const [contacts, setContacts] = useState([{ name: '', email: '', phone: '', whatsapp: '', designation: '', is_primary: true }]);
  const [ports, setPorts] = useState(['']);

  useEffect(() => {
    api.get('/auth/users').then(res => setUsers(res.data));
    if (isEdit) {
      api.get(`/clients/${id}`).then(res => {
        const c = res.data;
        setForm({
          company_name: c.company_name || '', country: c.country || '', address: c.address || '',
          business_type: c.business_type || '', delivery_terms: c.delivery_terms || 'FOB',
          preferred_currency: c.preferred_currency || 'USD', credit_days: c.credit_days || 30,
          credit_limit: c.credit_limit || 0, payment_mode: c.payment_mode || '',
          primary_executive_id: c.primary_executive_id || '', notes: c.notes || '', status: c.status || 'active',
        });
        if (c.contacts?.length > 0) setContacts(c.contacts.map(ct => ({ ...ct, is_primary: Boolean(ct.is_primary) })));
        if (c.ports?.length > 0) setPorts(c.ports.map(p => p.port_name));
      });
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name) return toast.error('Company name required');
    setLoading(true);
    try {
      const payload = { ...form, contacts, ports: ports.filter(Boolean) };
      if (isEdit) {
        await api.put(`/clients/${id}`, payload);
        toast.success('Client updated');
      } else {
        const res = await api.post('/clients', payload);
        toast.success('Client created');
        navigate(`/clients/${res.data.id}`);
        return;
      }
      navigate(`/clients/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const addContact = () => setContacts([...contacts, { name: '', email: '', phone: '', whatsapp: '', designation: '', is_primary: false }]);
  const removeContact = (i) => setContacts(contacts.filter((_, idx) => idx !== i));
  const updateContact = (i, field, value) => {
    const updated = [...contacts];
    updated[i] = { ...updated[i], [field]: value };
    setContacts(updated);
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{isEdit ? 'Edit Client' : 'New Client'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Company Name *</label><input className={inputClass} value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} required /></div>
            <div><label className={labelClass}>Country</label><input className={inputClass} value={form.country} onChange={e => setForm({...form, country: e.target.value})} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Address</label><textarea className={inputClass} rows="2" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><label className={labelClass}>Business Type</label><input className={inputClass} placeholder="e.g., Importer, Distributor" value={form.business_type} onChange={e => setForm({...form, business_type: e.target.value})} /></div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Trade & Financial */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Trade & Financial</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Delivery Terms</label>
              <select className={inputClass} value={form.delivery_terms} onChange={e => setForm({...form, delivery_terms: e.target.value})}>
                <option>FOB</option><option>CIF</option><option>CFR</option><option>EXW</option><option>DDP</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Preferred Currency</label>
              <select className={inputClass} value={form.preferred_currency} onChange={e => setForm({...form, preferred_currency: e.target.value})}>
                <option value="USD">USD</option><option value="INR">INR</option><option value="EUR">EUR</option>
              </select>
            </div>
            <div><label className={labelClass}>Payment Mode</label><input className={inputClass} placeholder="e.g., TT, LC" value={form.payment_mode} onChange={e => setForm({...form, payment_mode: e.target.value})} /></div>
            <div><label className={labelClass}>Credit Days</label><input type="number" className={inputClass} value={form.credit_days} onChange={e => setForm({...form, credit_days: parseInt(e.target.value) || 0})} /></div>
            <div><label className={labelClass}>Credit Limit</label><input type="number" className={inputClass} value={form.credit_limit} onChange={e => setForm({...form, credit_limit: parseFloat(e.target.value) || 0})} /></div>
            <div>
              <label className={labelClass}>Primary Executive</label>
              <select className={inputClass} value={form.primary_executive_id} onChange={e => setForm({...form, primary_executive_id: e.target.value})}>
                <option value="">Select...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
            <button type="button" onClick={addContact} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={16} /> Add Contact</button>
          </div>
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
              <input className={inputClass} placeholder="Name" value={c.name} onChange={e => updateContact(i, 'name', e.target.value)} />
              <input className={inputClass} placeholder="Email" value={c.email} onChange={e => updateContact(i, 'email', e.target.value)} />
              <input className={inputClass} placeholder="Phone" value={c.phone} onChange={e => updateContact(i, 'phone', e.target.value)} />
              <input className={inputClass} placeholder="WhatsApp" value={c.whatsapp} onChange={e => updateContact(i, 'whatsapp', e.target.value)} />
              <input className={inputClass} placeholder="Designation" value={c.designation} onChange={e => updateContact(i, 'designation', e.target.value)} />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 flex items-center gap-1">
                  <input type="checkbox" checked={c.is_primary} onChange={e => updateContact(i, 'is_primary', e.target.checked)} /> Primary
                </label>
                {contacts.length > 1 && <button type="button" onClick={() => removeContact(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>

        {/* Destination Ports */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Destination Ports</h2>
            <button type="button" onClick={() => setPorts([...ports, ''])} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus size={16} /> Add Port</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ports.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputClass} placeholder="e.g., Jebel Ali, Dubai" value={p} onChange={e => { const np = [...ports]; np[i] = e.target.value; setPorts(np); }} />
                {ports.length > 1 && <button type="button" onClick={() => setPorts(ports.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
          <textarea className={inputClass} rows="3" placeholder="Internal notes about this client..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50">
            {loading ? 'Saving...' : (isEdit ? 'Update Client' : 'Create Client')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </div>
  );
}
