import { useDB } from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CreditCard, ShoppingCart, Boxes, Activity,
  ArrowUpRight, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

function StatCard({ label, value, icon: Icon, tone, note }) {
  const colors = {
    default: { bg: 'bg-blue-50', text: 'text-brand', border: 'border-blue-100' },
    red:     { bg: 'bg-red-50',  text: 'text-red-600', border: 'border-red-100' },
    orange:  { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    green:   { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  };
  const c = colors[tone] ?? colors.default;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">{label}</p>
          <p className={`mt-2 text-3xl font-extrabold ${c.text}`}>{value}</p>
          {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
        </div>
        <span className={`rounded-xl border p-2.5 ${c.bg} ${c.border} ${c.text}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

// Build 7-day sales trend from bills
function useSalesTrend(bills) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const map = {};
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toDateString();
    map[key] = { day: days[d.getDay()], sales: 0, txn: 0 };
  }
  for (const bill of bills) {
    const key = new Date(bill.timestamp).toDateString();
    if (map[key]) {
      map[key].sales += bill.total || 0;
      map[key].txn   += 1;
    }
  }
  return Object.values(map);
}

// Top 5 products by revenue
function useTopProducts(bills) {
  const map = {};
  for (const bill of bills) {
    for (const item of (bill.items || [])) {
      if (!map[item.name]) map[item.name] = 0;
      map[item.name] += (item.price * item.qty);
    }
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenue]) => ({ name: name.split(' ').slice(0, 2).join(' '), revenue }));
}

export default function Dashboard() {
  const { bills, lowStockProducts, loading } = useDB();
  const { pendingCount } = useSync();
  const { currentUser } = useAuth();

  // Today's stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayBills = bills.filter((b) => new Date(b.timestamp) >= todayStart);
  const todayRevenue = todayBills.reduce((s, b) => s + (b.total || 0), 0);

  const trendData = useSalesTrend(bills);
  const topProducts = useTopProducts(bills);

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{dateStr}</p>
          <h1 className="mt-1 text-2xl font-extrabold">{greeting}, {currentUser?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500">Here's what's happening with your store today.</p>
        </div>
        <span className={`rounded-xl border px-3 py-2 text-xs font-bold ${
          pendingCount > 0
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {pendingCount > 0 ? `● ${pendingCount} pending sync` : '● Store is operational'}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's Revenue"   value={`₹${todayRevenue.toLocaleString('en-IN')}`} icon={CreditCard}    />
        <StatCard label="Today's Orders"    value={todayBills.length}                            icon={ShoppingCart}  />
        <StatCard label="Low Stock Items"   value={lowStockProducts.length}                      icon={Boxes}   tone="red"    note="Needs restocking" />
        <StatCard label="Pending Sync"      value={pendingCount}                                  icon={Activity} tone={pendingCount > 0 ? 'orange' : 'green'} note="Will sync when online" />
      </div>

      {/* Charts */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Area chart — sales trend */}
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Revenue trend</p>
              <h2 className="mt-1 font-bold">7-Day Sales</h2>
            </div>
            <TrendingUp size={20} className="text-brand" />
          </div>
          <div className="mt-6 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#335CFF" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#335CFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v) => [`₹${v}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="sales" stroke="#335CFF" strokeWidth={2} fill="url(#salesGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Bar chart — top products */}
        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Top sellers</p>
              <h2 className="mt-1 font-bold">By Revenue</h2>
            </div>
            <ArrowUpRight size={20} className="text-brand" />
          </div>
          {topProducts.length === 0 ? (
            <div className="mt-8 flex h-40 items-center justify-center text-sm text-slate-400">
              Complete sales to see top products
            </div>
          ) : (
            <div className="mt-6 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(v) => [`₹${v}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="#335CFF" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Low stock alerts */}
      {lowStockProducts.length > 0 && (
        <section className="card mt-5 p-6">
          <p className="eyebrow">Attention needed</p>
          <h2 className="mt-1 font-bold">Low Stock Alerts</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStockProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.sku}</p>
                </div>
                <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-600">{p.stock} left</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
