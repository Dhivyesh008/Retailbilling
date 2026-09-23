import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, ArrowRight, Wifi, ShieldCheck,
  User, Building2, Lock, AlertCircle,
} from 'lucide-react';
import { useAuth }  from '../context/AuthContext.jsx';

const ROLES = ['Admin', 'Manager', 'Cashier', 'Staff'];

function FieldLabel({ icon: Icon, children }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-600">
      <Icon size={13} className="text-brand" />
      {children}
    </p>
  );
}

export default function Login() {
  const nav = useNavigate();
  const { loginBranch, loginAdmin, getStores } = useAuth();

  const [role, setRole]         = useState('Manager');
  const [stores, setStores]     = useState([]);
  const [storeId, setStoreId]   = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    getStores().then((list) => {
      setStores(list);
      if (list.length > 0) setStoreId(String(list[0].id));
    }).catch((err) => console.error('[Login] Failed to load stores:', err));
  }, [getStores]);

  // Admin gets "All Branches" as first option
  const branchOptions = role === 'Admin'
    ? [{ id: '', name: 'All Branches' }, ...stores]
    : stores;

  const handleRoleChange = (r) => {
    setRole(r);
    setError('');
    // Default to first option for newly selected role
    if (r === 'Admin') setStoreId('');
    else if (stores.length > 0) setStoreId(stores[0].id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (role === 'Admin') {
        const branch = storeId ? stores.find((s) => s.id === storeId) ?? null : null;
        await loginAdmin(password, branch);
        nav('/dashboard');
      } else {
        const user = await loginBranch({ role, storeId, branchPassword: password });
        nav(user.role === 'Cashier' ? '/billing' : '/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      {/* Brand */}
      <div className="login-brand">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white shadow-lg">
          <Store size={20} />
        </span>
        <span>Retail<span className="text-brand">Sync</span></span>
      </div>

      <div className="login-layout">
        {/* Hero */}
        <div className="login-hero">
          <div>
            <p className="eyebrow text-blue-200">Smart offline retail</p>
            <h1 className="mt-4 text-4xl leading-tight text-white sm:text-5xl">
              Run your store<br />
              <span className="text-blue-200">with clarity.</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-blue-100">
              One calm workspace for sales, inventory, customers, and every detail in between.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-3 text-xs text-blue-100">
            <span className="rounded-xl border border-white/15 bg-white/10 p-3">
              <Wifi size={16} className="mb-2" />Works offline
            </span>
            <span className="rounded-xl border border-white/15 bg-white/10 p-3">
              <ShieldCheck size={16} className="mb-2" />Role-based access
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="login-card relative overflow-hidden pl-8">
          {/* Left accent bar */}
          <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl bg-brand" />

          <p className="eyebrow">Welcome back</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Sign in to RetailSync</h2>
          <p className="mt-1 mb-7 text-sm text-slate-500">Select your role, branch, and enter the password.</p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Role */}
            <div>
              <FieldLabel icon={User}>Role</FieldLabel>
              <select
                className="field"
                value={role}
                onChange={(e) => handleRoleChange(e.target.value)}
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>

            {/* Branch */}
            <div>
              <FieldLabel icon={Building2}>Branch</FieldLabel>
              <select
                className="field"
                value={storeId}
                onChange={(e) => { setStoreId(e.target.value); setError(''); }}
              >
                {branchOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div>
              <FieldLabel icon={Lock}>
                {role === 'Admin' ? 'Admin password' : 'Branch password'}
              </FieldLabel>
              <input
                className="field"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        © 2024 RetailSync · Smart offline retail management
      </p>
    </div>
  );
}
