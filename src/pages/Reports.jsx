import { useState, useMemo } from 'react';
import { useDB } from '../context/DBContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { parseTimestamp } from '../lib/dateUtils.js';
import { computePredictiveStockAlerts } from '../lib/stockPrediction.js';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieIcon, AlertTriangle, CheckCircle2 } from 'lucide-react';

const COLORS = ['#335CFF', '#60A5FA', '#34D399', '#FBBF24', '#F87171'];

function useSalesTrend(bills) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const map = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toDateString();
    map[key] = { date: `${d.getDate()}/${d.getMonth()+1}`, day: days[d.getDay()], revenue: 0, orders: 0 };
  }
  for (const bill of bills) {
    const key = parseTimestamp(bill.timestamp).toDateString();
    if (map[key]) {
      map[key].revenue += parseFloat(bill.total || 0);
      map[key].orders  += 1;
    }
  }
  return Object.values(map);
}

function useTopProducts(bills) {
  const map = {};
  for (const bill of bills) {
    for (const item of (bill.items || [])) {
      if (!map[item.productId]) map[item.productId] = { name: item.name, revenue: 0, units: 0 };
      map[item.productId].revenue += item.price * item.qty;
      map[item.productId].units   += item.qty;
    }
  }
  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({ ...p, name: p.name.split(' ').slice(0, 2).join(' ') }));
}

function useCategoryBreakdown(bills) {
  const map = {};
  for (const bill of bills) {
    for (const item of (bill.items || [])) {
      const cat = item.category ?? 'Other';
      map[cat] = (map[cat] || 0) + item.price * item.qty;
    }
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-brand">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Reports() {
  const { bills, products, stores, loading } = useDB();
  const { currentUser, currentBranch, isAdmin } = useAuth();

  // Admin viewing "All Branches" if no specific branch was selected at login
  const isAllBranches = isAdmin && !currentBranch;
  const [selectedBranch, setSelectedBranch] = useState(
    currentBranch?.id ? String(currentBranch.id) : 'ALL'
  );

  const activeBranchId = isAllBranches
    ? (selectedBranch === 'ALL' ? null : selectedBranch)
    : (currentBranch?.id ? String(currentBranch.id) : null);

  // Show branch tag if in All Branches view and looking across all branches
  const showBranchTag = isAllBranches && selectedBranch === 'ALL';

  // Live computation of predictive low-stock alerts
  const stockAlerts = useMemo(() => {
    return computePredictiveStockAlerts({
      products: products || [],
      bills: bills || [],
      stores: stores || [],
      branchId: activeBranchId,
    });
  }, [products, bills, stores, activeBranchId]);

  const totalRevenue = bills.reduce((s, b) => s + (b.total || 0), 0);
  const totalOrders  = bills.length;
  const avgOrder     = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const totalDiscount = bills.reduce((s, b) => s + (b.discount || 0), 0);

  const trendData    = useSalesTrend(bills);
  const topProducts  = useTopProducts(bills);
  const categoryData = useCategoryBreakdown(bills);

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Analytics</p>
        <h1 className="mt-1 text-2xl font-extrabold">Reports</h1>
        <p className="text-sm text-slate-500">All data computed from local IndexedDB — no backend required.</p>
      </div>

      {/* Summary row */}
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} sub="All time" />
        <SummaryCard label="Total Orders"  value={totalOrders} sub="All bills" />
        <SummaryCard label="Avg Order Value" value={`₹${avgOrder}`} sub="Per transaction" />
        <SummaryCard label="Total Discounts" value={`₹${totalDiscount.toLocaleString('en-IN')}`} sub="Promotions applied" />
      </div>

      {/* Charts row 1 */}
      <div className="mb-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* 30-day trend */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow">Revenue trend</p>
              <h2 className="font-bold">30-Day Sales</h2>
            </div>
            <TrendingUp size={20} className="text-brand" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="rev30" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#335CFF" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#335CFF" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v) => [`₹${v}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#335CFF" strokeWidth={2} fill="url(#rev30)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Category pie */}
        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow">Category split</p>
              <h2 className="font-bold">Revenue by Category</h2>
            </div>
            <PieIcon size={20} className="text-brand" />
          </div>
          {categoryData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">No sales data yet</div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {categoryData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`₹${v}`, 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Predictive Low-Stock Alerts */}
      <section className="card p-6 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="eyebrow">Inventory Forecast</p>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="font-bold text-base">Predictive Low-Stock Alerts</h2>
              {stockAlerts.length > 0 && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                  {stockAlerts.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAllBranches && stores && stores.length > 1 && (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-brand"
              >
                <option value="ALL">All Branches</option>
                {stores.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <span className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-600">
              <AlertTriangle size={18} />
            </span>
          </div>
        </div>

        {stockAlerts.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center text-sm text-slate-400">
            <CheckCircle2 size={24} className="mb-2 text-emerald-500 opacity-80" />
            <p className="font-medium text-slate-500">No products at risk of running out soon</p>
            <p className="mt-0.5 text-xs text-slate-400">All fast-moving items have sufficient inventory based on recent sales.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {stockAlerts.map((item) => {
              const urgencyClasses =
                item.urgency === 'red'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : item.urgency === 'orange'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-yellow-200 bg-yellow-50 text-yellow-800';

              return (
                <div
                  key={`${item.productId}-${item.storeId}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {item.productName}
                      </span>
                      {showBranchTag && (
                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {item.storeName}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        Current stock: <strong className="font-semibold text-slate-700">{item.currentStock} units</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Avg daily rate: <strong className="font-semibold text-slate-700">{item.formattedRate} / day</strong>
                      </span>
                      <span>·</span>
                      <span className="text-slate-400">
                        ({item.totalQtySold} sold in last 7d)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-slate-700">
                        ~{item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'} left
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${urgencyClasses}`}
                    >
                      {item.urgency === 'red' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                      )}
                      {item.urgencyLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Top products bar */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="eyebrow">Top performers</p>
            <h2 className="font-bold">Top 5 Products by Revenue</h2>
          </div>
          <BarChart3 size={20} className="text-brand" />
        </div>
        {topProducts.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Complete some sales to see top products</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v, name) => [name === 'revenue' ? `₹${v}` : v, name]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend />
                <Bar dataKey="revenue" fill="#335CFF" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="units"   fill="#60A5FA" radius={[6, 6, 0, 0]} name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </>
  );
}
