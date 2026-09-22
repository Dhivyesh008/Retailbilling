import { useEffect, useState } from 'react';
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
import PricingRules from './pages/PricingRules.jsx';

// ── DB upgrade banner ────────────────────────────────────────────────────────

/**
 * Shown when another tab is holding a stale DB connection that blocks
 * the schema upgrade from completing. The user just needs to reload.
 */
function DBBlockedBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('retailsync:db-blocked', handler);
    return () => window.removeEventListener('retailsync:db-blocked', handler);
  }, []);

  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#f59e0b', color: '#1c1917',
      padding: '10px 20px', textAlign: 'center',
      fontSize: 14, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      ⚠️ A database update is waiting. Please reload this tab to apply it.
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#1c1917', color: '#fef3c7',
          border: 'none', borderRadius: 8,
          padding: '4px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
        }}
      >
        Reload Now
      </button>
    </div>
  );
}

// ── Guards ────────────────────────────────────────────────────────────────────

/** Any unauthenticated visitor → Login */
function ProtectedRoute() {
  const { currentUser } = useAuth();
  return currentUser ? <Outlet /> : <Navigate to="/login" replace />;
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

function RootRedirect() {
  const { currentUser, isCashier } = useAuth();

  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={isCashier ? '/billing' : '/dashboard'} replace />;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <DBProvider>
          <DBBlockedBanner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="products" element={<Products />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="returns" element={<Returns />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="sync-queue" element={<SyncQueue />} />
                  <Route path="promotions" element={<PromotionsLoyalty />} />
                  <Route path="pricing-rules" element={<PricingRules />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
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
