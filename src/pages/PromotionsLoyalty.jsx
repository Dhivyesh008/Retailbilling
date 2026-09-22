import { useState, useCallback, useEffect } from 'react';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Tag, Star, Save, X, AlertCircle, Building2, Package, Calendar, Filter, CheckCircle2,
} from 'lucide-react';
import { useDB }   from '../context/DBContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchStores } from '../services/supabaseService.js';
import { savePromotion, togglePromotion, deletePromotion } from '../services/promotionService.js';
import { loyaltyTiersDB, storesDB } from '../db/db.js';

// ─── Shared micro-components ─────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, sub }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-brand" />
          <h2 className="text-lg font-extrabold">{title}</h2>
        </div>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ active, syncStatus }) {
  if (syncStatus === 'PENDING_SYNC') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
        Offline Pending
      </span>
    );
  }
  return active
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Active</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">Inactive</span>;
}

function RowActions({ onEdit, onToggle, onDelete, active }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand">
        <Pencil size={14} />
      </button>
      <button
        onClick={onToggle}
        title={active ? 'Deactivate' : 'Activate'}
        className={`rounded-lg p-1.5 transition-colors ${active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
      >
        {active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
      <button onClick={onDelete} title="Delete" className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section A — Promotions
// ═══════════════════════════════════════════════════════════════════════════════

const BLANK_PROMO = {
  name: '',
  discountType: 'percent',
  value: '',
  minCartValue: '',
  scope: 'all',
  productId: null,
  branchId: null,
  startDate: '',
  endDate: '',
  active: true,
};

function PromotionsSection({
  promotions,
  refresh,
  currentUser,
  currentBranch,
  isAdmin,
  stores = [],
  products = [],
}) {
  const [form, setForm]         = useState(null); // null = closed, {} = new, {id,...} = edit
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [success, setSuccess]   = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive

  const openNew = () => {
    setForm({
      ...BLANK_PROMO,
      branchId: currentBranch?.id ?? null,
    });
    setErr('');
    setSuccess('');
  };

  const openEdit = (p) => {
    setForm({
      ...BLANK_PROMO,
      ...p,
      branchId: p.branchId !== undefined && p.branchId !== null ? p.branchId : '',
      productId: p.productId ?? null,
      startDate: p.startDate ? String(p.startDate).slice(0, 10) : '',
      endDate: p.endDate ? String(p.endDate).slice(0, 10) : '',
    });
    setErr('');
    setSuccess('');
  };

  const closeForm = () => {
    setForm(null);
    setErr('');
  };

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErr('Promotion name is required.');
    const val = parseFloat(form.value);
    if (isNaN(val) || val <= 0) return setErr('Enter a valid discount value > 0.');
    if (form.discountType === 'percent' && val > 100) return setErr('Percentage discount cannot exceed 100%.');
    if (form.scope === 'product' && !form.productId) {
      return setErr('Please select a product for product-specific promotion.');
    }

    setSaving(true);
    setErr('');
    try {
      await savePromotion({
        ...form,
        name: form.name.trim(),
        value: val,
        minCartValue: parseFloat(form.minCartValue) || 0,
        branchId: form.branchId ? (Number(form.branchId) || form.branchId) : null,
        productId: form.scope === 'product' && form.productId ? Number(form.productId) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });

      await refresh();
      setSuccess(`Promotion "${form.name.trim()}" saved successfully.`);
      setTimeout(() => setSuccess(''), 4000);
      closeForm();
    } catch (saveErr) {
      console.error('[PromotionsSection] Save failed:', saveErr);
      setErr(saveErr.message || 'Failed to save promotion to database.');
    } finally {
      setSaving(false);
    }
  }, [form, refresh]);

  const handleToggle = async (p) => {
    try {
      await togglePromotion(p);
      await refresh();
    } catch (toggleErr) {
      console.error('[PromotionsSection] Toggle failed:', toggleErr);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete promotion "${name || id}"?`)) return;
    try {
      await deletePromotion(id);
      await refresh();
      setSuccess('Promotion deleted.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (delErr) {
      console.error('[PromotionsSection] Delete failed:', delErr);
    }
  };

  // Branch filtering & role filtering
  const visible = promotions.filter((p) => {
    // Role filter: non-admins only see promos matching their branch or all-branch
    if (!isAdmin && currentBranch?.id) {
      const matchBranch = !p.branchId || String(p.branchId) === String(currentBranch.id);
      if (!matchBranch) return false;
    }
    // Filter dropdown
    if (filterBranch !== 'all') {
      if (filterBranch === 'all-branches') {
        if (p.branchId) return false;
      } else if (String(p.branchId) !== String(filterBranch)) {
        return false;
      }
    }
    // Status filter
    if (filterStatus === 'active' && !p.active) return false;
    if (filterStatus === 'inactive' && p.active) return false;
    return true;
  });

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeader
            icon={Tag}
            title="Promotions"
            sub="Active promotions appear automatically in the Billing checkout dropdown and apply in real-time."
          />
          <button onClick={openNew} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
            <Plus size={15} /> Add Promotion
          </button>
        </div>

        {/* Filters bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Filter size={13} className="text-brand" />
            Branch:
          </div>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-brand focus:outline-none"
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
          >
            <option value="all">All Promotions</option>
            <option value="all-branches">All-Branches Scope Only</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.location || 'Store'})
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setFilterStatus('all')}
              className={`rounded px-2.5 py-1 transition-colors ${filterStatus === 'all' ? 'bg-white text-brand shadow-xs font-bold' : 'hover:text-slate-900'}`}
            >
              All ({promotions.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`rounded px-2.5 py-1 transition-colors ${filterStatus === 'active' ? 'bg-white text-emerald-600 shadow-xs font-bold' : 'hover:text-slate-900'}`}
            >
              Active ({promotions.filter((p) => p.active).length})
            </button>
            <button
              onClick={() => setFilterStatus('inactive')}
              className={`rounded px-2.5 py-1 transition-colors ${filterStatus === 'inactive' ? 'bg-white text-slate-700 shadow-xs font-bold' : 'hover:text-slate-900'}`}
            >
              Inactive ({promotions.filter((p) => !p.active).length})
            </button>
          </div>
        </div>

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={14} />
            {success}
          </div>
        )}
      </div>

      {/* Add / Edit form */}
      {form && (
        <form onSubmit={handleSave} className="border-b border-slate-100 bg-slate-50/90 px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-extrabold text-slate-800 flex items-center gap-2">
              <Tag size={16} className="text-brand" />
              {form.id ? 'Edit Promotion' : 'New Promotion'}
            </p>
            <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              Promotion Name *
              <input
                className="field mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Festival Special Discount"
                autoFocus
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-bold text-slate-700">
                Discount Type
                <select
                  className="field mt-1"
                  value={form.discountType}
                  onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
                >
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Flat (₹)</option>
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Value *
                <input
                  className="field mt-1"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.discountType === 'percent' ? '10' : '50'}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-bold text-slate-700">
              Min Cart Value (₹)
              <input
                className="field mt-1"
                type="number"
                min="0"
                value={form.minCartValue}
                onChange={(e) => setForm((f) => ({ ...f, minCartValue: e.target.value }))}
                placeholder="0 = always applies"
              />
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Scope
              <select
                className="field mt-1"
                value={form.scope}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  scope: e.target.value,
                  productId: e.target.value === 'product' ? (products[0]?.id ?? null) : null,
                }))}
              >
                <option value="all">Whole store</option>
                <option value="product">Specific product</option>
              </select>
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Branch (Database Stores)
              <select
                className="field mt-1 font-semibold"
                value={form.branchId ?? ''}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  branchId: e.target.value ? (Number(e.target.value) || e.target.value) : null,
                }))}
              >
                <option value="">All Branches</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.location ? ` (${s.location})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Conditional Specific Product Dropdown */}
          {form.scope === 'product' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <label className="block text-sm font-bold text-slate-700">
                <span className="flex items-center gap-1.5 mb-1 text-brand">
                  <Package size={14} />
                  Choose Product for this Promotion *
                </span>
                <select
                  className="field bg-white"
                  value={form.productId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">— Select product from database —</option>
                  {products.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.category || 'General'}) — ₹{prod.price} [SKU: {prod.sku || prod.barcode || prod.id}]
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Validity dates */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              Valid From (optional)
              <input
                type="date"
                className="field mt-1"
                value={form.startDate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Valid Until (optional)
              <input
                type="date"
                className="field mt-1"
                value={form.endDate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              Active immediately
            </label>
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-sm text-red-600 font-semibold">
              <AlertCircle size={15} />
              {err}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm disabled:opacity-60 flex items-center gap-1.5">
              <Save size={14} />
              {saving ? 'Saving to Database…' : 'Save Promotion'}
            </button>
            <button type="button" onClick={closeForm} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5">
              <X size={14} />
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Promotions List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
          <Tag size={36} className="text-slate-300 mb-2" />
          <p className="font-bold text-slate-600">No promotions found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {promotions.length === 0
              ? 'No promotions exist yet. Click "Add Promotion" above to create your first promotion.'
              : 'No promotions match the selected branch/status filter.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((p) => {
            const branchObj = stores.find((s) => String(s.id) === String(p.branchId));
            const branchLabel = branchObj
              ? branchObj.name
              : (p.branchId ? `Branch #${p.branchId}` : 'All branches');

            const prodObj = p.productId
              ? products.find((prod) => String(prod.id) === String(p.productId))
              : null;

            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm text-slate-900">{p.name}</p>
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-brand">
                      {p.discountType === 'percent' ? `${p.value}% OFF` : `₹${p.value} OFF`}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Building2 size={12} className="text-brand" />
                      {branchLabel}
                    </span>

                    {p.scope === 'product' ? (
                      <span className="flex items-center gap-1 font-medium text-indigo-600">
                        <Package size={12} />
                        Product: {prodObj ? prodObj.name : `Product #${p.productId}`}
                      </span>
                    ) : (
                      <span className="text-slate-400">Scope: Whole store</span>
                    )}

                    {p.minCartValue > 0 && (
                      <span className="text-slate-500">Min Cart: ₹{p.minCartValue}</span>
                    )}

                    {(p.startDate || p.endDate) && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Calendar size={11} />
                        {p.startDate ? String(p.startDate).slice(0, 10) : 'Start'}
                        {' → '}
                        {p.endDate ? String(p.endDate).slice(0, 10) : 'Ongoing'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge active={p.active} syncStatus={p.syncStatus} />
                  <RowActions
                    active={p.active}
                    onEdit={() => openEdit(p)}
                    onToggle={() => handleToggle(p)}
                    onDelete={() => handleDelete(p.id, p.name)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section B — Loyalty Tiers
// ═══════════════════════════════════════════════════════════════════════════════

const BLANK_TIER = { label: '', minVisits: '', discountPercent: '', active: true };

function LoyaltySection({ loyaltyTiers, refresh }) {
  const [form, setForm]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const openNew  = () => { setForm({ ...BLANK_TIER }); setErr(''); };
  const openEdit = (t) => { setForm({ ...t }); setErr(''); };
  const closeForm = () => setForm(null);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    const minV = parseInt(form.minVisits, 10);
    const disc = parseFloat(form.discountPercent);
    if (isNaN(minV) || minV < 1) return setErr('Min visits must be ≥ 1.');
    if (isNaN(disc) || disc <= 0 || disc > 100) return setErr('Discount must be between 1–100%.');
    setSaving(true);
    try {
      await loyaltyTiersDB.put({
        id:              form.id ?? `lt-${Date.now()}`,
        label:           form.label.trim() || `${minV}+ visits`,
        minVisits:       minV,
        discountPercent: disc,
        active:          form.active,
      });
      await refresh();
      closeForm();
    } finally { setSaving(false); }
  }, [form, refresh]);

  const handleToggle = async (t) => {
    await loyaltyTiersDB.put({ ...t, active: !t.active });
    await refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this loyalty tier?')) return;
    await loyaltyTiersDB.delete(id);
    await refresh();
  };

  const sorted = [...loyaltyTiers].sort((a, b) => b.minVisits - a.minVisits);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Star} title="Loyalty Tiers"
            sub="Customers automatically receive the highest tier they qualify for at checkout." />
          <button onClick={openNew} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
            <Plus size={15} /> Add Tier
          </button>
        </div>
      </div>

      {form && (
        <form onSubmit={handleSave} className="border-b border-slate-100 bg-slate-50 px-6 py-5 space-y-4">
          <p className="font-bold text-slate-700">{form.id ? 'Edit Tier' : 'New Loyalty Tier'}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-bold text-slate-700">
              Label (optional)
              <input className="field mt-1" value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Silver, Gold" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Min Visits *
              <input className="field mt-1" type="number" min="1"
                value={form.minVisits}
                onChange={(e) => setForm((f) => ({ ...f, minVisits: e.target.value }))}
                placeholder="e.g. 3" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Discount % *
              <input className="field mt-1" type="number" min="1" max="100" step="0.5"
                value={form.discountPercent}
                onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                placeholder="e.g. 5" />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Active immediately
          </label>
          {err && <div className="flex items-center gap-2 text-sm text-red-600"><AlertCircle size={14} />{err}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
              <Save size={14} />{saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={closeForm} className="btn-secondary px-4 py-2 text-sm">
              <X size={14} />Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">
          No tiers yet — add one above.
        </div>
      ) : (
        <>
          {/* Visual tier stack */}
          <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white px-6 py-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Tier ladder (highest first)</p>
            <div className="flex flex-wrap gap-2">
              {sorted.filter((t) => t.active).map((t, i) => (
                <div key={t.id}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${i === 0 ? 'border-amber-300 bg-amber-100 text-amber-700' : 'border-blue-200 bg-blue-50 text-brand'}`}>
                  {t.label || `${t.minVisits}+ visits`} → {t.discountPercent}% off
                </div>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {sorted.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{t.label || `${t.minVisits}+ visits`}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Min {t.minVisits} visit{t.minVisits !== 1 ? 's' : ''} → {t.discountPercent}% discount
                  </p>
                </div>
                <Badge active={t.active} />
                <RowActions
                  active={t.active}
                  onEdit={() => openEdit(t)}
                  onToggle={() => handleToggle(t)}
                  onDelete={() => handleDelete(t.id)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page root
// ═══════════════════════════════════════════════════════════════════════════════

export default function PromotionsLoyalty() {
  const { promotions, loyaltyTiers, refresh, products } = useDB();
  const { currentUser, currentBranch, isAdmin } = useAuth();
  const [stores, setStores] = useState([]);

  // Fetch real database stores from Supabase (with IndexedDB fallback)
  useEffect(() => {
    fetchStores()
      .then((list) => {
        setStores(list);
        for (const s of list) storesDB.put(s).catch(() => {});
      })
      .catch(async (err) => {
        console.warn('[PromotionsLoyalty] fetchStores failed, using local storesDB:', err);
        const cached = await storesDB.getAll().catch(() => []);
        setStores(cached);
      });
  }, []);

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Admin & Manager</p>
        <h1 className="mt-1 text-2xl font-extrabold">Promotions & Loyalty</h1>
        <p className="text-sm text-slate-500">
          Manage branch promotions and visit-based loyalty tiers. Database synced with full offline support.
        </p>
      </div>

      <div className="space-y-6">
        <PromotionsSection
          promotions={promotions}
          refresh={refresh}
          currentUser={currentUser}
          currentBranch={currentBranch}
          isAdmin={isAdmin}
          stores={stores}
          products={products}
        />
        <LoyaltySection
          loyaltyTiers={loyaltyTiers}
          refresh={refresh}
        />
      </div>
    </>
  );
}
