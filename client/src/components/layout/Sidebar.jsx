import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CheckSquare, TrendingUp, FileText, Package, ShoppingCart, MessageSquare, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/pipeline', icon: TrendingUp, label: 'Pipeline' },
  { to: '/quotations', icon: FileText, label: 'Quotations' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/communications', icon: MessageSquare, label: 'Communications' },
];

export default function Sidebar({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-slate-900 text-white p-2 rounded-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transform transition-transform lg:transform-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-tight">Kriya GTIP</h1>
          <p className="text-xs text-slate-400 mt-1">Global Trade Intelligence</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-r-3 border-blue-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
            </div>
            <button onClick={onLogout} className="text-slate-400 hover:text-white" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
