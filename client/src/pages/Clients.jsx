import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Building2, MapPin, MoreVertical, Eye } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchClients = () => {
    setLoading(true);
    api.get('/clients', { params: { search: search || undefined } })
      .then(res => setClients(res.data))
      .catch(() => toast.error('Failed to load clients'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClients(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchClients();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">{clients.length} total clients</p>
        </div>
        <Link to="/clients/new" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> Add Client
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by company name or country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchClients()}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          />
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No clients found</p>
          <Link to="/clients/new" className="text-blue-600 text-sm font-medium mt-2 inline-block">Add your first client</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Company</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Country</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Executive</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Currency</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Orders</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clients.map(client => (
                  <tr key={client.id} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => navigate(`/clients/${client.id}`)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Building2 size={18} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{client.company_name}</p>
                          <p className="text-xs text-gray-400">{client.business_type || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <MapPin size={14} className="text-gray-400" />
                        {client.country || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.executive_name || 'Unassigned'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.preferred_currency}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{client.order_count}</td>
                    <td className="px-6 py-4">
                      <Link to={`/clients/${client.id}`} className="text-blue-600 hover:text-blue-700" onClick={e => e.stopPropagation()}>
                        <Eye size={18} />
                      </Link>
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
