import { Routes, Route, NavLink, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Billing from './pages/Billing';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import { useAuth } from './contexts/AuthContext';

const nav = [
  { to: '/', label: 'Billing' },
  { to: '/products', label: 'Products' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/customers', label: 'Customers' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/reports', label: 'Reports' },
];

function DashboardLayout() {
  const { user, logout } = useAuth();
  return (
    <Layout
      sidebar={
        <>
          <nav className="flex gap-1 p-3 overflow-x-auto md:flex-col">
            {nav.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-2 text-sm sm:text-base font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'bg-primary-600 text-white shadow-soft' : 'text-slate-600 hover:bg-surface-100 hover:text-slate-900'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-200 p-3">
            <p className="truncate px-2 text-xs text-slate-500">{user?.email}</p>
            <button
              type="button"
              onClick={() => logout()}
              className="mt-1 w-full rounded-xl px-4 py-2 text-left text-sm font-medium text-slate-600 hover:bg-surface-100 hover:text-slate-900"
            >
              Log out
            </button>
          </div>
        </>
      }
    >
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Billing />} />
        <Route path="products" element={<Products />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="customers" element={<Customers />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}
