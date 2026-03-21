import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, CheckSquare, TrendingUp, ShoppingCart, AlertTriangle, Clock, DollarSign, Globe } from 'lucide-react';
import api from '../utils/api';

function StatCard({ icon: Icon, label, value, sub, color, to }) {
  const card = (
    <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/stats').then(res => {
      setStats(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  if (!stats) return <p>Failed to load dashboard</p>;

  const stages = ['inquiry', 'discussion', 'sample', 'quotation', 'negotiation'];
  const stageColors = { inquiry: 'bg-blue-100 text-blue-700', discussion: 'bg-yellow-100 text-yellow-700', sample: 'bg-purple-100 text-purple-700', quotation: 'bg-green-100 text-green-700', negotiation: 'bg-orange-100 text-orange-700' };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your trade operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Active Clients" value={stats.clients.active} sub={`${stats.clients.total} total`} color="bg-blue-600" to="/clients" />
        <StatCard icon={CheckSquare} label="Pending Tasks" value={stats.tasks.pending} sub={`${stats.tasks.overdue} overdue`} color="bg-orange-500" to="/tasks" />
        <StatCard icon={TrendingUp} label="Active Inquiries" value={stats.pipeline.inquiries} sub={`${stats.pipeline.quotations_pending} quotes pending`} color="bg-green-600" to="/pipeline" />
        <StatCard icon={ShoppingCart} label="Active Orders" value={stats.orders.active} sub={`${stats.orders.total} total`} color="bg-purple-600" to="/orders" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Overview */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline Overview</h2>
          <div className="space-y-3">
            {stages.map(stage => {
              const data = stats.pipeline_by_stage?.find(s => s.stage === stage);
              return (
                <div key={stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${stageColors[stage] || 'bg-gray-100 text-gray-700'}`}>
                      {stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-900">{data?.count || 0} deals</span>
                    <span className="text-sm text-gray-500">${(data?.value || 0).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clients by Country */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clients by Country</h2>
          {stats.clients_by_country?.length > 0 ? (
            <div className="space-y-3">
              {stats.clients_by_country.map(c => (
                <div key={c.country} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{c.country}</span>
                  </div>
                  <span className="text-sm font-medium bg-gray-100 px-2.5 py-0.5 rounded-full">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No client data yet</p>
          )}
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Summary</h2>
          <div className="flex items-center gap-3 mb-4">
            <DollarSign size={20} className="text-green-600" />
            <span className="text-2xl font-bold text-gray-900">${stats.revenue.total.toLocaleString()}</span>
          </div>
          {stats.revenue.by_currency?.length > 0 && (
            <div className="space-y-2">
              {stats.revenue.by_currency.map(r => (
                <div key={r.currency} className="flex justify-between text-sm">
                  <span className="text-gray-500">{r.currency}</span>
                  <span className="font-medium">{r.total?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alerts</h2>
          <div className="space-y-3">
            {stats.tasks.overdue > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                <AlertTriangle size={18} className="text-red-500" />
                <span className="text-sm text-red-700">{stats.tasks.overdue} overdue tasks</span>
              </div>
            )}
            {stats.pipeline.quotations_pending > 0 && (
              <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                <Clock size={18} className="text-yellow-600" />
                <span className="text-sm text-yellow-700">{stats.pipeline.quotations_pending} quotations awaiting approval</span>
              </div>
            )}
            {stats.tasks.overdue === 0 && stats.pipeline.quotations_pending === 0 && (
              <p className="text-sm text-gray-400">No alerts at this time</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
