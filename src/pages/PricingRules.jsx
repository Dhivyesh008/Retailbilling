import { useState, useCallback } from 'react';
import {
  Zap, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Tag,
  AlertTriangle, Info, Package, RefreshCw, Sparkles, RotateCcw,
} from 'lucide-react';
import { useDB }   from '../context/DBContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { pricingRulesDB, priceRecommendationsDB, promotionsDB } from '../db/db.js';
import { runPricingAnalysis, RULE_TYPES, ACTION_TYPES, DEFAULT_PARAMS } from '../lib/pricingEngine.js';

function uid() { return 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }

function RuleTypeBadge({ type }) {
  const colors = {
    expiry:          'bg-orange-100 text-orange-700',
    slowSales:       'bg-blue-100 text-blue-700',
    excessInventory: 'bg-purple-100 text-purple-700',
    timeOfDay:       'bg-teal-100 text-teal-700',
    demand:          'bg-rose-100 text-rose-700',
    festivalSeason:  'bg-amber-100 text-amber-700',
  };
  const label = RULE_TYPES.find((r) => r.value === type)?.label ?? type;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${colors[type] ?? 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  if (status === 'PENDING_APPROVAL') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Clock size={10}/>Pending</span>;
  if (status === 'APPROVED')         return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle size={10}/>Approved</span>;
  if (status === 'REJECTED')         return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-500"><XCircle size={10}/>Rejected</span>;
  if (status === 'REMOVED')          return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500"><RotateCcw size={10}/>Removed</span>;
  return null;
}

function ParamsForm({ type, params, onChange }) {
  const set = (key, val) => onChange({ ...params, [key]: val });

  if (type === 'expiry') return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-bold text-slate-700">Days before expiry
        <input type="number" min="1" className="field mt-1" value={params.daysBeforeExpiry ?? 15}
          onChange={(e) => set('daysBeforeExpiry', Number(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Discount (%)
        <input type="number" min="1" max="100" className="field mt-1" value={params.discountPercent ?? 10}
          onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>
    </div>
  );

  if (type === 'slowSales') return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-bold text-slate-700">Min daily rate (units/day)
        <input type="number" step="0.1" min="0" className="field mt-1" value={params.minDailyRate ?? 0.5}
          onChange={(e) => set('minDailyRate', parseFloat(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Lookback (days)
        <input type="number" min="1" className="field mt-1" value={params.overDays ?? 7}
          onChange={(e) => set('overDays', Number(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Action type
        <select className="field mt-1" value={params.actionType ?? 'percentDiscount'}
          onChange={(e) => set('actionType', e.target.value)}>
          <option value="percentDiscount">Percent Discount (%)</option>
          <option value="flatDiscount">Flat Discount (Rs)</option>
        </select>
      </label>
      <label className="block text-sm font-bold text-slate-700">Action value
        <input type="number" min="0" className="field mt-1" value={params.actionValue ?? 10}
          onChange={(e) => set('actionValue', Number(e.target.value))} />
      </label>
    </div>
  );

  if (type === 'excessInventory') return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-bold text-slate-700">Excess multiplier (x reorder)
        <input type="number" step="0.5" min="1" className="field mt-1" value={params.excessMultiplier ?? 3}
          onChange={(e) => set('excessMultiplier', Number(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Bundle discount (%)
        <input type="number" min="0" max="100" className="field mt-1" value={params.bundleDiscountPercent ?? 10}
          onChange={(e) => set('bundleDiscountPercent', Number(e.target.value))} />
      </label>
      <div className="sm:col-span-2">
        <p className="text-sm font-bold text-slate-700 mb-1">Related product IDs (comma-separated, min 2)</p>
        <input type="text" className="field" placeholder="e.g. 1,2 or 101,205"
          value={(params.relatedProductIds || []).join(',')}
          onChange={(e) => set('relatedProductIds', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
        <p className="mt-1 text-xs text-slate-400">Enter at least 2 product IDs. Both must exceed the excess multiplier threshold.</p>
      </div>
    </div>
  );

  if (type === 'timeOfDay') return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-bold text-slate-700">Category (blank = all)
        <input type="text" className="field mt-1" placeholder="e.g. bakery" value={params.category ?? ''}
          onChange={(e) => set('category', e.target.value)} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Apply after hour (24h)
        <input type="number" min="0" max="23" className="field mt-1" value={params.afterHour ?? 19}
          onChange={(e) => set('afterHour', Number(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Discount (%)
        <input type="number" min="1" max="100" className="field mt-1" value={params.discountPercent ?? 5}
          onChange={(e) => set('discountPercent', Number(e.target.value))} />
      </label>
      <div className="sm:col-span-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
        <Info size={12} className="inline mr-1"/>Once approved, applies every day after the set hour — no re-approval needed daily.
      </div>
    </div>
  );

  if (type === 'demand') return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-bold text-slate-700">Spike threshold (x normal)
        <input type="number" step="0.1" min="1" className="field mt-1" value={params.spikeThreshold ?? 2.0}
          onChange={(e) => set('spikeThreshold', parseFloat(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Recent window (days)
        <input type="number" min="1" className="field mt-1" value={params.lookbackDays ?? 3}
          onChange={(e) => set('lookbackDays', Number(e.target.value))} />
      </label>
      <label className="block text-sm font-bold text-slate-700">Compare window (days)
        <input type="number" min="1" className="field mt-1" value={params.compareDays ?? 7}
          onChange={(e) => set('compareDays', Number(e.target.value))} />
      </label>
      <div className="sm:col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
        <AlertTriangle size={12} className="inline mr-1"/>Generates informational replenishment alerts only — no price change or approval gate.
      </div>
    </div>
  );

  if (type === 'festivalSeason') {
    const festivals = params.festivals ?? DEFAULT_PARAMS.festivalSeason.festivals;
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">Discount (%)
            <input type="number" min="1" max="100" className="field mt-1" value={params.discountPercent ?? 10}
              onChange={(e) => set('discountPercent', Number(e.target.value))} />
          </label>
          <label className="block text-sm font-bold text-slate-700">Category (blank = store-wide)
            <input type="text" className="field mt-1" placeholder="e.g. sweets" value={params.category ?? ''}
              onChange={(e) => set('category', e.target.value)} />
          </label>
        </div>
        <p className="text-sm font-bold text-slate-700">Festivals</p>
        <div className="space-y-2">
          {festivals.map((f, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input type="text" className="field text-xs" placeholder="Festival name" value={f.name}
                onChange={(e) => { const fs=[...festivals]; fs[idx]={...f,name:e.target.value}; set('festivals',fs); }} />
              <input type="date" className="field text-xs" value={f.startDate}
                onChange={(e) => { const fs=[...festivals]; fs[idx]={...f,startDate:e.target.value}; set('festivals',fs); }} />
              <input type="date" className="field text-xs" value={f.endDate}
                onChange={(e) => { const fs=[...festivals]; fs[idx]={...f,endDate:e.target.value}; set('festivals',fs); }} />
              <button type="button" className="text-slate-300 hover:text-red-500 p-1"
                onClick={() => { const fs=festivals.filter((_,i)=>i!==idx); set('festivals',fs); }}>
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
          <button type="button" className="text-xs font-bold text-brand hover:underline"
            onClick={() => set('festivals',[...festivals,{name:'',startDate:'',endDate:''}])}>
            + Add festival
          </button>
        </div>
      </div>
    );
  }
  return null;
}

const BLANK_RULE = {
  name: '', type: 'expiry',
  params: { ...DEFAULT_PARAMS.expiry },
  actionType: 'percentDiscount', actionValue: 10,
  branchScope: 'all', active: true,
};

export default function PricingRules() {
  const { products, bills, stores, pricingRules, priceRecommendations, refreshPricingData } = useDB();
  const { currentUser, currentBranch, isAdmin, canManage } = useAuth();

  const [form,        setForm]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [formErr,     setFormErr]     = useState('');
  const [running,     setRunning]     = useState(false);
  const [runMsg,      setRunMsg]      = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [approving,   setApproving]   = useState({});
  const [rejecting,   setRejecting]   = useState({});

  const [recsTab,            setRecsTab]            = useState('pending'); // 'pending' | 'active'
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const [removing,           setRemoving]           = useState({});

  const pendingRecs  = priceRecommendations.filter((r) => r.status === 'PENDING_APPROVAL');
  const activeOffers = priceRecommendations.filter((r) => r.status === 'APPROVED');
  const historyRecs  = priceRecommendations.filter((r) => r.status !== 'PENDING_APPROVAL');

  const openNew = () => {
    setForm({ ...BLANK_RULE, params: { ...DEFAULT_PARAMS.expiry },
      branchScope: isAdmin ? 'all' : (currentBranch?.id ? String(currentBranch.id) : 'all') });
    setFormErr('');
  };
  const openEdit  = (r) => { setForm({ ...r }); setFormErr(''); };
  const closeForm = () => setForm(null);

  const handleTypeChange = (type) => {
    setForm((f) => ({ ...f, type, params: { ...(DEFAULT_PARAMS[type] ?? {}) } }));
  };

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormErr('Rule name is required.');
    setSaving(true);
    try {
      const rule = {
        id:          form.id ?? uid(),
        name:        form.name.trim(),
        type:        form.type,
        params:      form.params ?? {},
        actionType:  form.actionType,
        actionValue: Number(form.actionValue ?? 0),
        branchScope: form.branchScope || 'all',
        active:      form.active ?? true,
        createdBy:   form.createdBy ?? currentUser?.id,
        createdAt:   form.createdAt ?? new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };
      await pricingRulesDB.put(rule);
      await refreshPricingData();
      window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
      closeForm();
    } catch (err) {
      setFormErr('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [form, currentUser, refreshPricingData]);

  const handleToggle = useCallback(async (rule) => {
    await pricingRulesDB.put({ ...rule, active: !rule.active });
    await refreshPricingData();
    window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
  }, [refreshPricingData]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this rule? Existing recommendations from it will remain.')) return;
    await pricingRulesDB.delete(id);
    await refreshPricingData();
    window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
  }, [refreshPricingData]);

  const handleRunAnalysis = useCallback(async () => {
    setRunning(true); setRunMsg(null);
    try {
      const activeRules = pricingRules.filter((r) => r.active);
      const newRecs = runPricingAnalysis({
        rules: activeRules, products, bills, stores,
        currentBranch, existingRecs: priceRecommendations,
      });
      for (const rec of newRecs) await priceRecommendationsDB.put(rec);
      await refreshPricingData();
      window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
      setRunMsg(newRecs.length === 0
        ? 'No new recommendations — all rules current or no matching products.'
        : `${newRecs.length} new recommendation${newRecs.length > 1 ? 's' : ''} generated.`
      );
    } catch (err) {
      setRunMsg('Analysis failed: ' + err.message);
    } finally {
      setRunning(false);
    }
  }, [pricingRules, priceRecommendations, products, bills, stores, currentBranch, refreshPricingData]);

  const handleApprove = useCallback(async (rec) => {
    setApproving((p) => ({ ...p, [rec.id]: true }));
    try {
      const promoId = 'promo-rule-' + Date.now();
      await promotionsDB.put({
        id:           promoId,
        name:         `${rec.sourceRuleName} — ${rec.actionLabel}`,
        discountType: rec.actionType === 'flatDiscount' ? 'flat' : 'percent',
        actionType:   rec.actionType,
        value:        rec.actionValue,
        minCartValue: 0,
        scope:        'all',
        branchId:     rec.branchId ?? null,
        active:       true,
        createdBy:    currentUser?.id,
        sourceRecommendationId: rec.id,
        isRuleBased:  true,
      });
      await priceRecommendationsDB.put({
        ...rec, status: 'APPROVED', promotionId: promoId,
        reviewedBy: currentUser?.name ?? 'Manager',
        reviewedAt: new Date().toISOString(),
      });
      await refreshPricingData();
      window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
    } catch (err) {
      alert('Approval failed: ' + err.message);
    } finally {
      setApproving((p) => ({ ...p, [rec.id]: false }));
    }
  }, [currentUser, refreshPricingData]);

  const handleReject = useCallback(async (rec) => {
    setRejecting((p) => ({ ...p, [rec.id]: true }));
    try {
      await priceRecommendationsDB.put({
        ...rec, status: 'REJECTED',
        reviewedBy: currentUser?.name ?? 'Manager',
        reviewedAt: new Date().toISOString(),
      });
      await refreshPricingData();
      window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
    } catch (err) {
      alert('Reject failed: ' + err.message);
    } finally {
      setRejecting((p) => ({ ...p, [rec.id]: false }));
    }
  }, [currentUser, refreshPricingData]);

  const handleRemoveOffer = useCallback(async (rec) => {
    setRemoving((p) => ({ ...p, [rec.id]: true }));
    try {
      // 1. Set recommendation status to REMOVED
      await priceRecommendationsDB.put({
        ...rec,
        status: 'REMOVED',
        removedBy: currentUser?.name ?? 'Manager',
        removedAt: new Date().toISOString(),
      });

      // 2. Deactivate linked entry in promotions (active: false)
      if (rec.promotionId) {
        const promo = await promotionsDB.getById(rec.promotionId);
        if (promo) {
          await promotionsDB.put({ ...promo, active: false });
        }
      }
      // Also ensure any matching promo by sourceRecommendationId is deactivated
      const allPromos = await promotionsDB.getAll();
      for (const p of allPromos) {
        if (p.sourceRecommendationId === rec.id && p.active) {
          await promotionsDB.put({ ...p, active: false });
        }
      }

      // 3. Refresh and broadcast
      await refreshPricingData();
      window.dispatchEvent(new CustomEvent('retailsync:pricing-updated'));
      setConfirmingRemoveId(null);
    } catch (err) {
      alert('Failed to remove offer: ' + err.message);
    } finally {
      setRemoving((p) => ({ ...p, [rec.id]: false }));
    }
  }, [currentUser, refreshPricingData]);

  if (!canManage) {
    return <div className="card p-8 text-center text-slate-400">Access restricted to Managers and Admins.</div>;
  }

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Intelligence</p>
        <h1 className="mt-1 text-2xl font-extrabold">Pricing Engine</h1>
        <p className="text-sm text-slate-500">Define rules, run analysis, and approve pricing recommendations.</p>
      </div>

      {/* Rules Manager */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand" />
            <h2 className="text-lg font-extrabold">Pricing Rules</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{pricingRules.length}</span>
          </div>
          <button className="btn-primary gap-2" onClick={openNew}><Plus size={15}/>Add Rule</button>
        </div>

        {form && (
          <form onSubmit={handleSave} className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
            <p className="text-sm font-extrabold text-slate-700">{form.id ? 'Edit Rule' : 'New Rule'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700">Rule name <span className="text-red-400">*</span>
                <input type="text" className="field mt-1" placeholder="e.g. Expiry 15-day alert" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block text-sm font-bold text-slate-700">Rule type
                <select className="field mt-1" value={form.type} onChange={(e) => handleTypeChange(e.target.value)}>
                  {RULE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              {isAdmin && (
                <label className="block text-sm font-bold text-slate-700">Branch scope
                  <select className="field mt-1" value={form.branchScope}
                    onChange={(e) => setForm((f) => ({ ...f, branchScope: e.target.value }))}>
                    <option value="all">All Branches</option>
                    {stores.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-auto mb-1">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active (include in analysis)
              </label>
            </div>
            <div className="border-t border-blue-200 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Rule Parameters</p>
              <ParamsForm type={form.type} params={form.params ?? {}}
                onChange={(p) => setForm((f) => ({ ...f, params: p }))} />
            </div>
            {formErr && <p className="text-sm text-red-500">{formErr}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary gap-1.5" disabled={saving}>
                {saving ? 'Saving...' : 'Save Rule'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        )}

        {pricingRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <Zap size={28} className="text-slate-200" />
            <p className="text-sm">No pricing rules yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 text-left">Name</th>
                  <th className="pb-2 text-left">Type</th>
                  <th className="pb-2 text-left">Branch</th>
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pricingRules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="py-3 font-bold">{rule.name}</td>
                    <td className="py-3"><RuleTypeBadge type={rule.type} /></td>
                    <td className="py-3 text-slate-500 text-xs">
                      {rule.branchScope === 'all'
                        ? 'All branches'
                        : (stores.find((s) => String(s.id) === String(rule.branchScope))?.name ?? rule.branchScope)}
                    </td>
                    <td className="py-3">
                      {rule.active
                        ? <span className="text-emerald-600 font-bold text-xs">Active</span>
                        : <span className="text-slate-400 text-xs">Inactive</span>}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(rule)} title="Edit"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand">
                          <Pencil size={13}/>
                        </button>
                        <button onClick={() => handleToggle(rule)} title={rule.active ? 'Deactivate' : 'Activate'}
                          className={`rounded-lg p-1.5 ${rule.active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}>
                          {rule.active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                        </button>
                        <button onClick={() => handleDelete(rule.id)} title="Delete"
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run Analysis */}
      <div className="card p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Play size={17} className="text-brand"/>
              <h2 className="font-extrabold">Run Analysis</h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Evaluates all active rules against current products and sales data.
            </p>
          </div>
          <button
            className="btn-primary gap-2 shrink-0 py-3 px-6"
            onClick={handleRunAnalysis}
            disabled={running || pricingRules.filter((r) => r.active).length === 0}>
            {running
              ? <><RefreshCw size={15} className="animate-spin"/>Analysing...</>
              : <><Play size={15}/>Run Analysis</>}
          </button>
        </div>
        {runMsg && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${runMsg.includes('failed') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {runMsg}
          </div>
        )}
        {pricingRules.filter((r) => r.active).length === 0 && (
          <p className="mt-3 text-xs text-slate-400">Enable at least one rule above before running analysis.</p>
        )}
      </div>

      {/* Recommendations & Active Offers */}
      <div className="card p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-brand"/>
            <h2 className="font-extrabold text-slate-800">Recommendations & Offers</h2>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setRecsTab('pending'); setConfirmingRemoveId(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                recsTab === 'pending'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock size={13} className={recsTab === 'pending' ? 'text-amber-500' : 'text-slate-400'} />
              <span>Pending</span>
              {pendingRecs.length > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-extrabold text-amber-700">
                  {pendingRecs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setRecsTab('active'); setConfirmingRemoveId(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                recsTab === 'active'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle size={13} className={recsTab === 'active' ? 'text-emerald-500' : 'text-slate-400'} />
              <span>Active Offers</span>
              {activeOffers.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-700">
                  {activeOffers.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: Pending */}
        {recsTab === 'pending' && (
          pendingRecs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
              <CheckCircle size={28} className="text-slate-200"/>
              <p className="text-sm">No pending recommendations. Run analysis to generate new ones.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRecs.map((rec) => (
                <div key={rec.id}
                  className={`rounded-2xl border p-4 ${rec.isInformational ? 'border-blue-100 bg-blue-50/30' : 'border-amber-100 bg-amber-50/20'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {rec.isInformational
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              <Info size={10}/>Informational
                            </span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              <Tag size={10}/>{rec.actionLabel}
                            </span>
                        }
                        <span className="text-[11px] font-bold text-slate-400">{rec.sourceRuleName}</span>
                      </div>
                      <p className="text-sm font-bold truncate">{(rec.productNames || []).join(', ')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{rec.reason}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rec.branchName} · {new Date(rec.generatedAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rec.isInformational ? (
                        <span className="text-xs text-blue-600 font-bold bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
                          No action needed
                        </span>
                      ) : (
                        <>
                          <button
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                            onClick={() => handleApprove(rec)}
                            disabled={approving[rec.id]}>
                            {approving[rec.id] ? 'Approving...' : <><CheckCircle size={12}/>Approve</>}
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                            onClick={() => handleReject(rec)}
                            disabled={rejecting[rec.id]}>
                            {rejecting[rec.id] ? 'Rejecting...' : <><XCircle size={12}/>Reject</>}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* TAB 2: Active Offers */}
        {recsTab === 'active' && (
          activeOffers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
              <Tag size={28} className="text-slate-200"/>
              <p className="text-sm">No active offers. Approve a recommendation to activate an offer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOffers.map((rec) => (
                <div key={rec.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                          <Zap size={10}/>{rec.actionLabel}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">{rec.sourceRuleName}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {rec.branchName || 'All Branches'}
                        </span>
                      </div>
                      <p className="text-sm font-bold truncate">{(rec.productNames || []).join(', ')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{rec.reason}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Approved {rec.reviewedAt ? new Date(rec.reviewedAt).toLocaleString('en-IN') : ''}
                        {rec.reviewedBy ? ` by ${rec.reviewedBy}` : ''}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {confirmingRemoveId === rec.id ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
                          <p className="font-bold text-red-900 mb-1">
                            Remove this {rec.actionLabel} offer on {(rec.productNames || []).join(', ')}?
                          </p>
                          <p className="text-red-700 mb-2">
                            This immediately removes the live discount and promotional badge.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                              onClick={() => handleRemoveOffer(rec)}
                              disabled={removing[rec.id]}
                            >
                              {removing[rec.id] ? 'Removing...' : 'Yes, Remove Offer'}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                              onClick={() => setConfirmingRemoveId(null)}
                              disabled={removing[rec.id]}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-300 transition"
                          onClick={() => setConfirmingRemoveId(rec.id)}
                        >
                          <Trash2 size={13} className="text-red-500" />
                          Remove Offer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* History Log */}
      <div className="card p-5">
        <button className="flex w-full items-center justify-between font-extrabold"
          onClick={() => setShowHistory((h) => !h)}>
          <div className="flex items-center gap-2">
            <Package size={17} className="text-slate-400"/>
            History Log
            <span className="text-xs font-normal text-slate-400 ml-1">({historyRecs.length})</span>
          </div>
          {showHistory ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>

        {showHistory && (
          historyRecs.length === 0 ? (
            <p className="mt-4 text-sm text-center text-slate-400">No approved, rejected, or removed recommendations yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 font-bold uppercase tracking-wider text-slate-400">
                    <th className="pb-2 text-left">Product(s)</th>
                    <th className="pb-2 text-left">Rule</th>
                    <th className="pb-2 text-left">Action</th>
                    <th className="pb-2 text-left">Status</th>
                    <th className="pb-2 text-left">Reviewed / Removed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...historyRecs].reverse().map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-2 font-bold max-w-[160px] truncate">{(rec.productNames || []).join(', ')}</td>
                      <td className="py-2 text-slate-500">{rec.sourceRuleName}</td>
                      <td className="py-2">{rec.actionLabel}</td>
                      <td className="py-2"><StatusBadge status={rec.status}/></td>
                      <td className="py-2 text-slate-400">
                        {rec.status === 'REMOVED'
                          ? (rec.removedAt ? `Removed ${new Date(rec.removedAt).toLocaleString('en-IN')}` : 'Removed')
                          : (rec.reviewedAt ? new Date(rec.reviewedAt).toLocaleString('en-IN') : '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </>
  );
}
