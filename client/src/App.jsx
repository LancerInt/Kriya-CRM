import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientForm from './pages/ClientForm';
import ClientDetail from './pages/ClientDetail';
import Tasks from './pages/Tasks';
import Pipeline from './pages/Pipeline';
import Quotations from './pages/Quotations';
import QuotationForm from './pages/QuotationForm';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Communications from './pages/Communications';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/new" element={<ClientForm />} />
            <Route path="clients/:id" element={<ClientDetail />} />
            <Route path="clients/:id/edit" element={<ClientForm />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="quotations/new" element={<QuotationForm />} />
            <Route path="orders" element={<Orders />} />
            <Route path="products" element={<Products />} />
            <Route path="communications" element={<Communications />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
