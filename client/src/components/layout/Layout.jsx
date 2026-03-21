import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
