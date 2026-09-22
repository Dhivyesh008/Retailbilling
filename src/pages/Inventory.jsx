import { useState } from 'react';
import { Search, ArrowDownToLine, ArrowUpFromLine, Boxes, AlertTriangle, Plus, Minus } from 'lucide-react';
import { useDB } from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { adjustProductStock } from '../services/supabaseService.js';

export default function Inventory() {
  const { products, loading, refresh } = useDB();
  const { isOnline, refreshPendingCount } = useSync();
  const [q, setQ] = useState('');
  const [adjusting, setAdjusting] = useState({});
  const [customAdj, setCustomAdj] = useState({});

  const filtered = products.filter(
    (p) => (p.name + p.sku + p.category).toLowerCase().includes(q.toLowerCase())
  );

  const totalUnits = products.reduce((s, p) => s + (p.stock || 0), 0);
  const lowCount = products.filter((p) => p.stock <= 10).length;

  const adjust = async (productId, delta) => {
    if (adjusting[productId]) return;
    setAdjusting((prev) => ({ ...prev, [productId]: true }));
    try {
      await adjustProductStock(productId, delta);
      await refresh();
    } catch (err) {
      console.error('[Inventory] Stock adjust failed:', err);
      alert(`Could not update stock: ${err.message}`);
    } finally {
      setAdjusting((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleCustomAdj = async (productId, sign) => {
    const val = parseInt(customAdj[productId] || '0', 10);
    if (!val || isNaN(val)) return;
    await adjust(productId, sign * val);
    setCustomAdj((prev) => ({ ...prev, [productId]: '' }));
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Stock control</p>
        <h1 className="mt-1 text-2xl font-extrabold">Inventory</h1>
        <p className="text-sm text-slate-500">Monitor and update stock levels in real time.</p>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="eyebrow">Total SKUs</p>
          <b className="mt-2 block text-3xl text-brand">{products.length}</b>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Units in stock</p>
          <b className="mt-2 block text-3xl text-brand">{totalUnits.toLocaleString('en-IN')}</b>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Low stock</p>
          <b className={`mt-2 block text-3xl ${lowCount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{lowCount}</b>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={17} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="field pl-9 bg-white" placeholder="Search by name, SKU or category…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h2 className="font-bold">Product Inventory</h2>
          <span className="text-xs text-slate-400"><Boxes size={14} className="inline mr-1" />Live — synced with Supabase</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filtered.map((p) => {
            const isLow = p.stock <= 10;
            return (
              <div key={p.id} className={`flex flex-wrap items-center gap-4 p-5 ${isLow ? 'bg-red-50/30' : ''}`}>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{p.name}</b>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <AlertTriangle size={10} />LOW
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{p.sku} · {p.category} · ₹{p.price}</p>
                </div>

                {/* Stock display */}
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-extrabold ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
                    {p.stock}
                    <span className="ml-1 text-xs font-normal text-slate-400">units</span>
                  </span>
                </div>

                {/* Quick adjust ±1 */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjust(p.id, -1)}
                    disabled={adjusting[p.id] || p.stock === 0}
                    className="rounded-xl bg-orange-50 p-2.5 text-orange-600 hover:bg-orange-100 disabled:opacity-40 transition"
                    title="Remove 1 unit"
                  >
                    <ArrowUpFromLine size={15} />
                  </button>
                  <button
                    onClick={() => adjust(p.id, 1)}
                    disabled={adjusting[p.id]}
                    className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 hover:bg-emerald-100 disabled:opacity-40 transition"
                    title="Add 1 unit"
                  >
                    <ArrowDownToLine size={15} />
                  </button>
                </div>

                {/* Custom adjust */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm font-bold"
                    placeholder="qty"
                    value={customAdj[p.id] || ''}
                    onChange={(e) => setCustomAdj((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <button onClick={() => handleCustomAdj(p.id, 1)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => handleCustomAdj(p.id, -1)} className="rounded-xl border border-orange-200 bg-orange-50 px-2 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100">
                    <Minus size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No products match your search</p>
          )}
        </div>
      </section>
    </>
  );
}
