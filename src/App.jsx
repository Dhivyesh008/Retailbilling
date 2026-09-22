import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import { DBProvider } from './context/DBContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Inventory from './pages/Inventory.jsx';
import Customers from './pages/Customers.jsx';
import Returns from './pages/Returns.jsx';
import Reports from './pages/Reports.jsx';
import SyncQueue from './pages/SyncQueue.jsx';
import PromotionsLoyalty from './pages/PromotionsLoyalty.jsx';
import Products from './pages/Products.jsx';

// ── Guards ────────────────────────────────────────────────────────────────────

/** Any unauthenticated visitor → Login */
function ProtectedRoute() {
  const { currentUser } = useAuth();
  return currentUser ? <Outlet /> : <Navigate to="/" replace />;
}

/**
 * Hard block for Cashiers — any route other than /billing redirects them.
 * This runs BEFORE the page renders, so hiding nav links is not enough.
 */
function NonCashierRoute() {
  const { isCashier } = useAuth();
  return isCashier ? <Navigate to="/billing" replace /> : <Outlet />;
}

/** Admin/Manager-only routes */
function ManagerRoute() {
  const { canManage } = useAuth();
  return canManage ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <DBProvider>
          <BrowserRouter>
            <Routes>
              {/* Main Layout containing Products as the primary startup page */}
              <Route element={<Layout />}>
                <Route index element={<Products />} />
                <Route path="products" element={<Products />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="billing" element={<Billing />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="customers" element={<Customers />} />
                <Route path="returns" element={<Returns />} />
                <Route path="reports" element={<Reports />} />
                <Route path="sync-queue" element={<SyncQueue />} />
                <Route path="promotions" element={<PromotionsLoyalty />} />
              </Route>
              <Route path="login" element={<Login />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </DBProvider>
      </SyncProvider>
    </AuthProvider>
  );
}

function CatchAll() {
  const { isCashier } = useAuth();
  return <Navigate to={isCashier ? '/billing' : '/dashboard'} replace />;
}
