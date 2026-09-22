import { useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Tag, Star, Save, X, AlertCircle,
} from 'lucide-react';
import { useDB }   from '../context/DBContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { promotionsDB, loyaltyTiersDB } from '../db/db.js';

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

function Badge({ active }) {
  return active
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Active</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">Inactive</span>;
}

function RowActions({ onEdit, onToggle, onDelete, active }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit}   title="Edit"   className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand"><Pencil size={14} /></button>
      <button onClick={onToggle} title={active ? 'Deactivate' : 'Activate'}
        className={`rounded-lg p-1.5 ${active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}>
        {active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
      </button>
      <button onClick={onDelete} title="Delete" className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section A — Promotions
// ═══════════════════════════════════════════════════════════════════════════════

const BLANK_PROMO = {
  name: '', discountType: 'percent', value: '', minCartValue: '',
  scope: 'all', branchId: null, active: true,
};

function PromotionsSection({ promotions, refresh, currentUser, currentBranch, isAdmin }) {
  const [form, setForm]     = useState(null); // null = closed, {} = new, {id,...} = edit
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const openNew  = () => { setForm({ ...BLANK_PROMO, branchId: isAdmin ? null : currentBranch?.id ?? null }); setErr(''); };
  const openEdit = (p) => { setForm({ ...p }); setErr(''); };
  const closeForm = () => setForm(null);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErr('Name is required.');
    const val = parseFloat(form.value);
    if (isNaN(val) || val <= 0) return setErr('Enter a valid discount value > 0.');
    setSaving(true);
    try {
      const record = {
        id:           form.id ?? `promo-${Date.now()}`,
        name:         form.name.trim(),
        discountType: form.discountType,
        value:        val,
        minCartValue: parseFloat(form.minCartValue) || 0,
        scope:        form.scope,
        branchId:     form.branchId,
        active:       form.active,
        createdBy:    form.createdBy ?? currentUser?.userId,
      };
      await promotionsDB.put(record);
      await refresh();
      closeForm();
    } finally { setSaving(false); }
  }, [form, currentUser, refresh]);

  const handleToggle = async (p) => {
    await promotionsDB.put({ ...p, active: !p.active });
    await refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this promotion?')) return;
    await promotionsDB.delete(id);
    await refresh();
  };

  // Managers only see promos scoped to their branch or null (all-branch)
  const visible = isAdmin
    ? promotions
    : promotions.filter((p) => p.branchId === null || p.branchId === currentBranch?.id);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <SectionHeader icon={Tag} title="Promotions"
          sub="Active promotions appear automatically in the Billing promotions dropdown." />
        <button onClick={openNew} className="btn-primary px-4 py-2 text-sm">
          <Plus size={15} /> Add Promotion
        </button>
      </div>

      {/* Add / Edit form */}
      {form && (
        <form onSubmit={handleSave} className="border-b border-slate-100 bg-slate-50 px-6 py-5 space-y-4">
          <p className="font-bold text-slate-700">{form.id ? 'Edit Promotion' : 'New Promotion'}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              Name *
              <input className="field mt-1" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend Special" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-bold text-slate-700">
                Type
                <select className="field mt-1" value={form.discountType}
                  onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}>
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Flat (₹)</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Value *
                <input className="field mt-1" type="number" min="0.01" step="0.01"
                  value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={form.discountType === 'percent' ? '10' : '50'} />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-bold text-slate-700">
              Min Cart Value (₹)
              <input className="field mt-1" type="number" min="0"
                value={form.minCartValue} onChange={(e) => setForm((f) => ({ ...f, minCartValue: e.target.value }))}
                placeholder="0 = always applies" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Scope
              <select className="field mt-1" value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                <option value="all">Whole store</option>
                <option value="category">By category</option>
                <option value="product">Specific product</option>
              </select>
            </label>
            {isAdmin && (
              <label className="block text-sm font-bold text-slate-700">
                Branch
                <select className="field mt-1" value={form.branchId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value || null }))}>
                  <option value="">Both branches</option>
                  <option value="store-a">Branch A only</option>
                  <option value="store-b">Branch B only</option>
                </select>
              </label>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active immediately
            </label>
          </div>

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

      {/* Table */}
      {visible.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">No promotions yet — add one above.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{p.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {p.discountType === 'percent' ? `${p.value}%` : `₹${p.value}`} off
                  {p.minCartValue > 0 ? ` on ₹${p.minCartValue}+` : ''}
                  {' · '}scope: {p.scope}
                  {p.branchId ? ` · ${p.branchId === 'store-a' ? 'Branch A' : 'Branch B'} only` : ' · all branches'}
                </p>
              </div>
              <Badge active={p.active} />
              <RowActions
                active={p.active}
                onEdit={() => openEdit(p)}
                onToggle={() => handleToggle(p)}
                onDelete={() => handleDelete(p.id)}
              />
            </div>
          ))}
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
        <SectionHeader icon={Star} title="Loyalty Tiers"
          sub="Customers automatically receive the highest tier they qualify for at checkout." />
        <button onClick={openNew} className="btn-primary px-4 py-2 text-sm">
          <Plus size={15} /> Add Tier
        </button>
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
  const { promotions, loyaltyTiers, refresh } = useDB();
  const { currentUser, currentBranch, isAdmin } = useAuth();

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Admin & Manager</p>
        <h1 className="mt-1 text-2xl font-extrabold">Promotions & Loyalty</h1>
        <p className="text-sm text-slate-500">
          Manage discount promotions and visit-based loyalty tiers. Changes reflect in Billing immediately.
        </p>
      </div>

      <div className="space-y-6">
        <PromotionsSection
          promotions={promotions}
          refresh={refresh}
          currentUser={currentUser}
          currentBranch={currentBranch}
          isAdmin={isAdmin}
        />
        <LoyaltySection
          loyaltyTiers={loyaltyTiers}
          refresh={refresh}
        />
      </div>
    </>
  );
}
