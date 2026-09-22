import { useState } from 'react';
import {
  Search, User, Phone, Mail, ShoppingBag, X, Plus,
  Wifi, WifiOff, RefreshCw, CloudCheck, AlertCircle, Database
} from 'lucide-react';
import { useDB } from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { saveCustomer } from '../services/customerService.js';

function CustomerDetail({ customer, bills, onClose }) {
  const purchasedBills = bills.filter((b) => customer.purchaseHistory?.includes(b.id));
  const isOffline = customer.syncStatus === 'PENDING_SYNC' || String(customer.id).startsWith('offline-');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white text-lg font-extrabold shadow-md shadow-brand/20">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">{customer.name}</h2>
                {isOffline ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    <Database size={10} className="text-amber-600" />
                    IndexedDB (Offline)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    <CloudCheck size={10} className="text-emerald-600" />
                    Supabase Synced
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-slate-400">ID: {customer.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <Phone size={15} className="text-slate-400 shrink-0" />
            <span className="text-sm font-bold text-slate-700">{customer.phone}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <Mail size={15} className="text-slate-400 shrink-0" />
            <span className="text-sm font-bold truncate text-slate-700">{customer.email || '—'}</span>
          </div>
        </div>

        <div className="mt-5">
          <p className="eyebrow mb-3">Purchase History ({purchasedBills.length} orders)</p>
          {purchasedBills.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No purchases yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {purchasedBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500">{b.id}</p>
                    <p className="text-[11px] text-slate-400">{new Date(b.timestamp).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">{b.items?.length} items · {b.payment}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-brand">₹{b.total}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${b.status === 'SYNCED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddCustomerModal({ onClose, onCreated }) {
  const { isOnline } = useSync();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Please provide both customer name and phone number.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await saveCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      }, isOnline);

      onCreated(created);
      onClose();
    } catch (err) {
      console.error('[AddCustomerModal] Error saving customer:', err);
      setError('Failed to save customer. Please check your input.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Add New Customer</h2>
            <p className="text-xs text-slate-500">
              {isOnline ? 'Will be saved to Supabase database & cached locally.' : 'Store is offline: will save to IndexedDB and auto-sync when online.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Customer Name *
            </label>
            <input
              type="text"
              required
              className="field w-full text-sm"
              placeholder="e.g. Dhivyesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Phone Number *
            </label>
            <input
              type="tel"
              required
              className="field w-full text-sm"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Email Address (Optional)
            </label>
            <input
              type="email"
              className="field w-full text-sm"
              placeholder="e.g. customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 flex items-center gap-2">
            {isOnline ? (
              <>
                <Wifi size={14} className="text-emerald-500 shrink-0" />
                <span>Status: <b>Online</b> (Saves to Supabase PostgreSQL)</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-amber-500 shrink-0" />
                <span>Status: <b>Offline</b> (Saves locally to IndexedDB)</span>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary px-5 py-2.5 text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Customers() {
  const { customers, bills, loading, refresh } = useDB();
  const { isOnline, isSyncing, runSync } = useSync();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = customers.filter(
    (c) => (c.name + c.phone + (c.email || '')).toLowerCase().includes(q.toLowerCase())
  );

  const totalOrders = (c) => c.purchaseHistory?.length ?? 0;
  const totalSpend = (c) => {
    return bills
      .filter((b) => c.purchaseHistory?.includes(b.id))
      .reduce((s, b) => s + (b.total || 0), 0);
  };

  const pendingOfflineCount = customers.filter(
    (c) => c.syncStatus === 'PENDING_SYNC' || String(c.id).startsWith('offline-')
  ).length;

  const handleCustomerCreated = async () => {
    await refresh();
  };

  const handleManualSync = async () => {
    await runSync();
    await refresh();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading customers…</div>;

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">CRM & Database Sync</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">Customers</h1>
          <p className="text-sm text-slate-500">
            Customer directory with IndexedDB offline support and Supabase cloud sync.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {pendingOfflineCount > 0 && isOnline && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : `Sync ${pendingOfflineCount} Offline Customer(s)`}
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Connectivity & Offline Banner */}
      {!isOnline && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <Database size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Working in Offline Mode</p>
              <p className="text-xs text-amber-700/90">
                Internet is unavailable. Customer data is stored in local <b>IndexedDB</b> and will automatically sync to Supabase PostgreSQL once your connection returns.
              </p>
            </div>
          </div>
          {pendingOfflineCount > 0 && (
            <span className="shrink-0 rounded-xl bg-amber-200/80 px-3 py-1 font-mono text-xs font-bold text-amber-900">
              {pendingOfflineCount} pending sync
            </span>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-5">
        <Search size={17} className="absolute left-3.5 top-3 text-slate-400" />
        <input
          className="field w-full pl-9 bg-white text-sm"
          placeholder="Search by name, phone or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Customer List Card */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-800">
            {filtered.length} {filtered.length === 1 ? 'Customer' : 'Customers'}
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {pendingOfflineCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                <Database size={11} /> {pendingOfflineCount} in IndexedDB
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-slate-400">
              <CloudCheck size={13} className="text-emerald-500" /> {customers.length - pendingOfflineCount} Synced
            </span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.map((c) => {
            const isOfflineCust = c.syncStatus === 'PENDING_SYNC' || String(c.id).startsWith('offline-');

            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5 cursor-pointer hover:bg-slate-50 transition"
                onClick={() => setSelected(c)}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-brand font-extrabold text-sm shadow-sm">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800">{c.name}</p>
                      {isOfflineCust ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Database size={10} className="text-amber-500" />
                          Offline (IndexedDB)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <CloudCheck size={10} className="text-emerald-500" />
                          Synced
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 font-mono"><Phone size={11} />{c.phone}</span>
                      {c.email && (
                        <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-slate-400">Orders</p>
                    <p className="font-extrabold text-brand">{totalOrders(c)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Total Spend</p>
                    <p className="font-extrabold text-slate-800">₹{totalSpend(c).toLocaleString('en-IN')}</p>
                  </div>
                  <User size={16} className="text-slate-300" />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <ShoppingBag size={36} className="text-slate-200" />
              <p className="font-semibold text-slate-600">No customers found</p>
              <p className="text-xs text-slate-400">Add a customer using the button above.</p>
            </div>
          )}
        </div>
      </section>

      {/* Selected Customer Detail Modal */}
      {selected && (
        <CustomerDetail customer={selected} bills={bills} onClose={() => setSelected(null)} />
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCustomerCreated}
        />
      )}
    </>
  );
}
