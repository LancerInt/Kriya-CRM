import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Building2, MapPin, Phone, Mail, DollarSign, Calendar, MessageSquare, FileText, ShoppingCart, CheckSquare, Plus } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [noteForm, setNoteForm] = useState({ subject: '', body: '' });

  useEffect(() => {
    Promise.all([
      api.get(`/clients/${id}`),
      api.get(`/clients/${id}/timeline`),
    ]).then(([clientRes, timelineRes]) => {
      setClient(clientRes.data);
      setTimeline(timelineRes.data);
    }).catch(() => toast.error('Failed to load client'))
      .finally(() => setLoading(false));
  }, [id]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteForm.body) return;
    try {
      await api.post('/communications', {
        client_id: id, type: 'note', direction: 'outbound',
        subject: noteForm.subject, body: noteForm.body,
      });
      setNoteForm({ subject: '', body: '' });
      const res = await api.get(`/clients/${id}/timeline`);
      setTimeline(res.data);
      toast.success('Note added');
    } catch { toast.error('Failed to add note'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  if (!client) return <p>Client not found</p>;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: `Timeline (${timeline.length})` },
    { key: 'contacts', label: `Contacts (${client.contacts?.length || 0})` },
  ];

  return (
    <div>
      <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back to Clients
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <Building2 size={28} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.company_name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                {client.country && <span className="flex items-center gap-1"><MapPin size={14} /> {client.country}</span>}
                <span className="flex items-center gap-1"><DollarSign size={14} /> {client.preferred_currency}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{client.status}</span>
              </div>
            </div>
          </div>
          <Link to={`/clients/${id}/edit`} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Edit size={16} /> Edit
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mt-6 pt-6 border-t border-gray-100">
          {Object.entries(client.stats || {}).map(([key, val]) => (
            <div key={key} className="text-center">
              <p className="text-2xl font-bold text-gray-900">{val}</p>
              <p className="text-xs text-gray-500 capitalize">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Business Details</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Business Type</dt><dd className="font-medium">{client.business_type || 'N/A'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Delivery Terms</dt><dd className="font-medium">{client.delivery_terms}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Payment Mode</dt><dd className="font-medium">{client.payment_mode || 'N/A'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Credit Days</dt><dd className="font-medium">{client.credit_days}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Credit Limit</dt><dd className="font-medium">{client.preferred_currency} {client.credit_limit?.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Executive</dt><dd className="font-medium">{client.executive_name || 'Unassigned'}</dd></div>
            </dl>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-4">Address</h3>
            <p className="text-sm text-gray-600">{client.address || 'No address provided'}</p>
            {client.ports?.length > 0 && (
              <>
                <h3 className="font-semibold text-gray-900 mt-6 mb-3">Destination Ports</h3>
                <div className="flex flex-wrap gap-2">
                  {client.ports.map(p => (
                    <span key={p.id} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">{p.port_name}</span>
                  ))}
                </div>
              </>
            )}
            {client.notes && (
              <>
                <h3 className="font-semibold text-gray-900 mt-6 mb-3">Notes</h3>
                <p className="text-sm text-gray-600">{client.notes}</p>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div>
          {/* Add Note Form */}
          <form onSubmit={addNote} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <div className="flex gap-3">
              <input placeholder="Subject (optional)" value={noteForm.subject} onChange={e => setNoteForm({...noteForm, subject: e.target.value})} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Add a note..." value={noteForm.body} onChange={e => setNoteForm({...noteForm, body: e.target.value})} className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add Note</button>
            </div>
          </form>

          <div className="space-y-3">
            {timeline.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No activity yet</p>
            ) : timeline.map(item => (
              <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    item.timeline_type === 'task' ? 'bg-orange-100' :
                    item.type === 'email' ? 'bg-blue-100' :
                    item.type === 'whatsapp' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {item.timeline_type === 'task' ? <CheckSquare size={14} className="text-orange-600" /> :
                     item.type === 'email' ? <Mail size={14} className="text-blue-600" /> :
                     item.type === 'whatsapp' ? <MessageSquare size={14} className="text-green-600" /> :
                     <FileText size={14} className="text-gray-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm text-gray-900">{item.subject || item.title || item.type}</p>
                      <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    {item.body && <p className="text-sm text-gray-600 mt-1">{item.body}</p>}
                    {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      {item.user_name && <span>By {item.user_name}</span>}
                      {item.direction && <span className="capitalize">{item.direction}</span>}
                      {item.status && <span className={`px-1.5 py-0.5 rounded text-xs ${item.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{item.status}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(client.contacts || []).map(contact => (
            <div key={contact.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                {contact.is_primary ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Primary</span> : null}
              </div>
              {contact.designation && <p className="text-sm text-gray-500 mb-3">{contact.designation}</p>}
              <div className="space-y-2 text-sm">
                {contact.email && <div className="flex items-center gap-2 text-gray-600"><Mail size={14} className="text-gray-400" /> {contact.email}</div>}
                {contact.phone && <div className="flex items-center gap-2 text-gray-600"><Phone size={14} className="text-gray-400" /> {contact.phone}</div>}
                {contact.whatsapp && <div className="flex items-center gap-2 text-gray-600"><MessageSquare size={14} className="text-gray-400" /> {contact.whatsapp}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
