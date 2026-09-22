import { useState } from 'react';
import { Search, User, Phone, Mail, ShoppingBag, X } from 'lucide-react';
import { useDB } from '../context/DBContext.jsx';

function CustomerDetail({ customer, bills, onClose }) {
  const purchasedBills = bills.filter((b) => customer.purchaseHistory?.includes(b.id));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white text-lg font-extrabold">
              {customer.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-extrabold">{customer.name}</h2>
              <p className="text-xs text-slate-400">{customer.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <Phone size={15} className="text-slate-400" />
            <span className="text-sm font-bold">{customer.phone}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
            <Mail size={15} className="text-slate-400" />
            <span className="text-sm font-bold truncate">{customer.email}</span>
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

export default function Customers() {
  const { customers, bills, loading } = useDB();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = customers.filter(
    (c) => (c.name + c.phone + c.email).toLowerCase().includes(q.toLowerCase())
  );

  const totalOrders = (c) => c.purchaseHistory?.length ?? 0;
  const totalSpend = (c) => {
    return bills
      .filter((b) => c.purchaseHistory?.includes(b.id))
      .reduce((s, b) => s + (b.total || 0), 0);
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">CRM</p>
        <h1 className="mt-1 text-2xl font-extrabold">Customers</h1>
        <p className="text-sm text-slate-500">View customer profiles and purchase histories.</p>
      </div>

      <div className="relative mb-4">
        <Search size={17} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="field pl-9 bg-white" placeholder="Search by name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold">{filtered.length} customers</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-4 p-5 cursor-pointer hover:bg-slate-50 transition"
              onClick={() => setSelected(c)}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-brand font-extrabold text-sm">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold">{c.name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Phone size={11} />{c.phone}</span>
                    <span className="flex items-center gap-1"><Mail size={11} />{c.email}</span>
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
                  <p className="font-extrabold">₹{totalSpend(c).toLocaleString('en-IN')}</p>
                </div>
                <User size={16} className="text-slate-300" />
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <ShoppingBag size={36} className="text-slate-200" />
              No customers found
            </div>
          )}
        </div>
      </section>

      {selected && (
        <CustomerDetail customer={selected} bills={bills} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
