import { useState, useEffect } from 'react';
import { CheckSquare, Plus, Clock, AlertTriangle, X, Calendar } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', client_id: '', owner_id: '', due_date: '', priority: 'medium' });

  const fetchTasks = () => {
    setLoading(true);
    api.get('/tasks', { params: { status: filter || undefined } })
      .then(res => setTasks(res.data))
      .catch(() => toast.error('Failed to load tasks'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(); }, [filter]);
  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data));
    api.get('/auth/users').then(res => setUsers(res.data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return toast.error('Title required');
    try {
      await api.post('/tasks', form);
      toast.success('Task created');
      setShowForm(false);
      setForm({ title: '', description: '', client_id: '', owner_id: '', due_date: '', priority: 'medium' });
      fetchTasks();
    } catch { toast.error('Failed to create task'); }
  };

  const updateStatus = async (id, status) => {
    try {
      const task = tasks.find(t => t.id === id);
      await api.put(`/tasks/${id}`, { ...task, status });
      toast.success(`Task ${status}`);
      fetchTasks();
    } catch { toast.error('Failed to update'); }
  };

  const priorityColors = { low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };

  const isOverdue = (task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">{tasks.length} tasks</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition text-sm">
          <Plus size={18} /> New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'pending', 'in_progress', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Task Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Task</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})}>
                    <option value="">None</option>{clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.owner_id} onChange={e => setForm({...form, owner_id: e.target.value})}>
                    <option value="">Myself</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><input type="datetime-local" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <CheckSquare size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className={`bg-white rounded-xl p-4 shadow-sm border ${isOverdue(task) ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => updateStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${task.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-500'}`}>
                  {task.status === 'completed' && <CheckSquare size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                    {isOverdue(task) && <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle size={12} /> Overdue</span>}
                  </div>
                  {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    {task.client_name && <span>{task.client_name}</span>}
                    {task.owner_name && <span>Assigned to {task.owner_name}</span>}
                    {task.due_date && <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(task.due_date).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {task.status !== 'in_progress' && task.status !== 'completed' && (
                    <button onClick={() => updateStatus(task.id, 'in_progress')} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">Start</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}