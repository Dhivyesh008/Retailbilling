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
              <Route path="/" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>

                  {/* ── Billing — open to ALL authenticated roles ── */}
                  <Route path="billing" element={<Billing />} />

                  {/* ── Everything else — Cashiers are hard-redirected ── */}
                  <Route element={<NonCashierRoute />}>
                    <Route path="dashboard"  element={<Dashboard />} />
                    <Route path="inventory"  element={<Inventory />} />
                    <Route path="customers"  element={<Customers />} />
                    <Route path="returns"    element={<Returns />} />
                    <Route path="reports"    element={<Reports />} />
                    <Route element={<ManagerRoute />}>
                      <Route path="sync-queue"   element={<SyncQueue />} />
                      <Route path="promotions"   element={<PromotionsLoyalty />} />
                    </Route>
                  </Route>

                  {/* ── Catch-all: Cashier → billing, others → dashboard ── */}
                  <Route path="*" element={<CatchAll />} />
                </Route>
              </Route>
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
