import { useState } from 'react';
import {
  Search, ArrowDownToLine, ArrowUpFromLine, Boxes, AlertTriangle, Plus, Minus,
  Trash2, X, AlertCircle, Loader2, PackagePlus
} from 'lucide-react';
import { useDB } from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { adjustProductStock } from '../services/supabaseService.js';
import { createProduct, deleteProduct } from '../services/productService.js';
import { db } from '../db/db.js';

const CATEGORIES = [
  'Groceries',
  'Dairy',
  'Bakery',
  'Beverages',
  'Snacks',
  'Personal Care',
  'Household',
  'Produce',
  'General',
];

function AddProductModal({ onClose, onCreated, currentBranch }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('5');
  const [stock, setStock] = useState('20');
  const [reorder, setReorder] = useState('10');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      setError('Please provide a valid price greater than ₹0.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await createProduct({
        name: name.trim(),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        category: category.trim(),
        price: parseFloat(price),
        tax_rate: parseFloat(taxRate) || 0,
        stock_quantity: parseInt(stock, 10) || 0,
        reorder_level: parseInt(reorder, 10) || 10,
        store_id: currentBranch?.id || 1,
      });

      await db.products.put(created).catch(() => {});
      await onCreated(created);
      onClose();
    } catch (err) {
      console.error('[AddProductModal] Failed to create product:', err);
      setError(err.message || 'Failed to add product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="card w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand">
              <PackagePlus size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Add New Product</h2>
              <p className="text-xs text-slate-500">
                Adds product to inventory and Supabase database
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Product Name *
            </label>
            <input
              type="text"
              required
              className="field w-full text-sm"
              placeholder="e.g. Basmati Rice 5kg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Category *
              </label>
              <select
                className="field w-full text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                SKU (Code)
              </label>
              <input
                type="text"
                className="field w-full text-sm"
                placeholder="Auto-generated if empty"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Barcode
              </label>
              <input
                type="text"
                className="field w-full text-sm font-mono"
                placeholder="e.g. 8901030826856"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Price (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                className="field w-full text-sm"
                placeholder="e.g. 250"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Initial Stock
              </label>
              <input
                type="number"
                min="0"
                className="field w-full text-sm"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Tax Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="field w-full text-sm"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Reorder Level
              </label>
              <input
                type="number"
                min="0"
                className="field w-full text-sm"
                value={reorder}
                onChange={(e) => setReorder(e.target.value)}
              />
            </div>
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
              className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-xs disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <span>{saving ? 'Adding Product…' : 'Add Product'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ product, onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="card w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-red-600">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-100">
            <Trash2 size={20} />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900">Remove Product</h3>
            <p className="text-xs text-slate-500">This action cannot be undone</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Are you sure you want to remove <b className="text-slate-900">{product.name}</b> ({product.sku || 'No SKU'}) from inventory?
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition disabled:opacity-50"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            <span>{deleting ? 'Removing…' : 'Remove Product'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { products, loading, refresh } = useDB();
  const { isOnline } = useSync();
  const { canManage, currentBranch } = useAuth();

  const [q, setQ] = useState('');
  const [adjusting, setAdjusting] = useState({});
  const [customAdj, setCustomAdj] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleProductCreated = async () => {
    await refresh();
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      await db.products.delete(productToDelete.id).catch(() => {});
      await refresh();
      setProductToDelete(null);
    } catch (err) {
      console.error('[Inventory] Delete product failed:', err);
      alert(`Could not remove product: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Loading…</div>;

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Stock control</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">Monitor, add, and update stock levels in real time.</p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Add Product</span>
          </button>
        )}
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
          <h2 className="font-bold text-slate-800">Product Inventory</h2>
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
                    <b className="text-sm text-slate-800">{p.name}</b>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <AlertTriangle size={10} />LOW
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {p.sku} · {p.category} · ₹{p.price}
                    {p.barcode && <span className="ml-2 font-mono text-[11px] text-slate-400">Barcode: {p.barcode}</span>}
                  </p>
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
                  <button onClick={() => handleCustomAdj(p.id, 1)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100" title="Add quantity">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => handleCustomAdj(p.id, -1)} className="rounded-xl border border-orange-200 bg-orange-50 px-2 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100" title="Subtract quantity">
                    <Minus size={12} />
                  </button>
                </div>

                {/* Remove product (Admin & Manager only) */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setProductToDelete(p)}
                    className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition shadow-2xs"
                    title={`Remove ${p.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No products match your search</p>
          )}
        </div>
      </section>

      {/* Add Product Modal */}
      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleProductCreated}
          currentBranch={currentBranch}
        />
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <DeleteConfirmModal
          product={productToDelete}
          deleting={deleting}
          onClose={() => setProductToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}

