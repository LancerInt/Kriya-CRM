import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, Check, X as XIcon, Eye, RotateCcw, ArrowRightCircle } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchQuotations = () => {
    setLoading(true);
    api.get('/pipeline/quotations', { params: { status: filter || undefined } })
      .then(res => setQuotations(res.data))
      .catch(() => toast.error('Failed to load quotations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchQuotations(); }, [filter]);

  const handleAction = async (id, action) => {
    try {
      await api.post(`/pipeline/quotations/${id}/${action}`);
      toast.success(`Quotation ${action}d`);
      fetchQuotations();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action}`);
    }
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700', pending_approval: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700', sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-500 mt-1">{quotations.length} quotations</p>
        </div>
        <Link to="/quotations/new" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> New Quotation
        </Link>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'draft', 'pending_approval', 'approved', 'accepted', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No quotations found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Quote #</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Client</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Total</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Version</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Created</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotations.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-sm text-blue-600">{q.quotation_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{q.client_name}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{q.currency} {q.total?.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">v{q.version}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[q.status] || 'bg-gray-100'}`}>
                        {q.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {q.status === 'draft' && (
                          <button onClick={() => handleAction(q.id, 'submit')} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">Submit</button>
                        )}
                        {q.status === 'pending_approval' && (user.role === 'admin' || user.role === 'manager') && (
                          <>
                            <button onClick={() => handleAction(q.id, 'approve')} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100 flex items-center gap-1"><Check size={12} /> Approve</button>
                            <button onClick={() => handleAction(q.id, 'reject')} className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 flex items-center gap-1"><XIcon size={12} /> Reject</button>
                          </>
                        )}
                        {q.status === 'approved' && (
                          <button onClick={() => handleAction(q.id, 'convert')} className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded hover:bg-emerald-100 flex items-center gap-1"><ArrowRightCircle size={12} /> Convert to Order</button>
                        )}
                        {(q.status === 'rejected' || q.status === 'sent') && (
                          <button onClick={() => handleAction(q.id, 'revise')} className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded hover:bg-purple-100 flex items-center gap-1"><RotateCcw size={12} /> Revise</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
