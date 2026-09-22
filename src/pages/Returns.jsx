import { useState } from 'react';
import { Search, RotateCcw, Package, CheckCircle } from 'lucide-react';
import { useDB } from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { returnsDB, stockDB, syncQueueDB } from '../db/db.js';

export default function Returns() {
  const { bills, products, loading, refresh } = useDB();
  const { isOnline, refreshPendingCount } = useSync();

  const [billSearch, setBillSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [selectedItems, setSelectedItems] = useState({}); // { productId: qty }
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(null);

  const filteredBills = bills.filter(
    (b) => b.id.toLowerCase().includes(billSearch.toLowerCase()) ||
           (b.customerId || '').toLowerCase().includes(billSearch.toLowerCase())
  );

  const toggleItem = (productId, maxQty) => {
    setSelectedItems((prev) => {
      if (prev[productId]) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: maxQty };
    });
  };

  const setItemQty = (productId, qty) => {
    setSelectedItems((prev) => ({ ...prev, [productId]: Math.max(1, qty) }));
  };

  const processReturn = async () => {
    if (!selectedBill || !reason || Object.keys(selectedItems).length === 0 || processing) return;
    setProcessing(true);

    const returnId = `ret-${Date.now()}`;
    const status = isOnline ? 'SYNCED' : 'PENDING_SYNC';

    const returnRecord = {
      id: returnId,
      billId: selectedBill.id,
      items: Object.entries(selectedItems).map(([productId, qty]) => {
        const item = selectedBill.items.find((i) => i.productId === productId);
        return { productId, name: item?.name, qty };
      }),
      reason,
      timestamp: new Date().toISOString(),
      status,
    };

    // Save return
    await returnsDB.put(returnRecord);

    // Restock
    for (const [productId, qty] of Object.entries(selectedItems)) {
      await stockDB.adjustStock(productId, qty);
    }

    // Enqueue if offline
    if (!isOnline) {
      await syncQueueDB.enqueue('return', returnId, 'CREATE');
      await refreshPendingCount();
    }

    await refresh();
    setSuccess(returnId);
    setSelectedBill(null);
    setSelectedItems({});
    setReason('');
    setProcessing(false);
  };

  const productName = (id) => products.find((p) => p.id === id)?.name ?? id;

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">After-sale</p>
        <h1 className="mt-1 text-2xl font-extrabold">Returns</h1>
        <p className="text-sm text-slate-500">Process a return, restock inventory, and log the reason.</p>
      </div>

      {success && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle size={20} className="text-emerald-600 shrink-0" />
          <div>
            <p className="font-bold text-emerald-700">Return processed successfully!</p>
            <p className="text-xs text-slate-500">Return ID: {success} · Stock has been restocked.</p>
          </div>
          <button className="ml-auto text-xs text-slate-400 hover:text-slate-600" onClick={() => setSuccess(null)}>Dismiss</button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Bill search */}
        <section className="card p-5">
          <h2 className="mb-4 font-bold">Step 1: Find the Bill</h2>
          <div className="relative mb-3">
            <Search size={17} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              className="field pl-9"
              placeholder="Search by bill ID or customer ID…"
              value={billSearch}
              onChange={(e) => { setBillSearch(e.target.value); setSelectedBill(null); setSelectedItems({}); }}
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {filteredBills.map((b) => (
              <div
                key={b.id}
                onClick={() => { setSelectedBill(b); setSelectedItems({}); }}
                className={`cursor-pointer rounded-xl border p-3 transition ${selectedBill?.id === b.id ? 'border-brand bg-blue-50' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{b.id}</p>
                    <p className="text-xs text-slate-400">{new Date(b.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand">₹{b.total}</p>
                    <p className="text-xs text-slate-400">{b.items?.length} items</p>
                  </div>
                </div>
              </div>
            ))}
            {filteredBills.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No bills found</p>
            )}
          </div>
        </section>

        {/* Return form */}
        <section className="card p-5">
          <h2 className="mb-4 font-bold">Step 2: Select Items & Reason</h2>
          {!selectedBill ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
              <Package size={36} className="text-slate-200" />
              Select a bill to continue
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Items in bill</p>
                <div className="space-y-2">
                  {selectedBill.items?.map((item) => {
                    const selected = !!selectedItems[item.productId];
                    return (
                      <div key={item.productId} className={`flex items-center gap-3 rounded-xl border p-3 transition cursor-pointer ${selected ? 'border-brand bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`} onClick={() => toggleItem(item.productId, item.qty)}>
                        <input type="checkbox" checked={selected} readOnly className="accent-brand" />
                        <div className="flex-1">
                          <p className="text-sm font-bold">{item.name}</p>
                          <p className="text-xs text-slate-400">Qty: {item.qty} · ₹{item.price}</p>
                        </div>
                        {selected && (
                          <input
                            type="number"
                            min={1}
                            max={item.qty}
                            value={selectedItems[item.productId]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setItemQty(item.productId, parseInt(e.target.value))}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-bold"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="block text-sm font-bold text-slate-700">
                Reason for return
                <select className="field mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">— Select reason —</option>
                  <option>Defective / Damaged product</option>
                  <option>Wrong item delivered</option>
                  <option>Customer changed mind</option>
                  <option>Expired product</option>
                  <option>Other</option>
                </select>
              </label>

              <button
                className="btn-primary w-full py-3 disabled:opacity-50"
                disabled={Object.keys(selectedItems).length === 0 || !reason || processing}
                onClick={processReturn}
              >
                <RotateCcw size={16} />
                {processing ? 'Processing…' : 'Process Return'}
              </button>
              {!isOnline && (
                <p className="text-center text-xs text-amber-600">⚠ Offline — return will be queued for sync</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
