import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Phone, User, Search, ShoppingCart, Trash2,
  ReceiptText, Tag, Plus, Minus, Star, CheckCircle, WifiOff,
} from 'lucide-react';
import { useDB }   from '../context/DBContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { findCustomerByPhone, saveCustomer } from '../services/customerService.js';
import { processSale } from '../services/billingService.js';
import { calcLoyaltyDiscount } from '../constants/loyalty.js';
import InvoiceModal from '../components/InvoiceModal.jsx';

// ─── Promo helper ─────────────────────────────────────────────────────────────
function applyPromotion(subtotal, promo, cart = []) {
  if (!promo) return 0;

  // Date validity check
  const today = new Date().toISOString().slice(0, 10);
  if (promo.startDate && String(promo.startDate).slice(0, 10) > today) return 0;
  if (promo.endDate && String(promo.endDate).slice(0, 10) < today) return 0;

  // Minimum cart value check
  if (promo.minCartValue && subtotal < promo.minCartValue) return 0;

  // Product specific promotion
  if (promo.scope === 'product' && promo.productId) {
    const item = cart.find((i) => String(i.product.id) === String(promo.productId));
    if (!item) return 0;
    const itemTotal = item.product.price * item.qty;
    if (promo.discountType === 'percent') return Math.round(itemTotal * promo.value / 100);
    if (promo.discountType === 'flat')    return Math.min(promo.value, itemTotal);
    return 0;
  }

  // Store-wide promotion
  if (promo.discountType === 'percent') return Math.round(subtotal * promo.value / 100);
  if (promo.discountType === 'flat')    return Math.min(promo.value, subtotal);
  return 0;
}

// ─── Loyalty badge ────────────────────────────────────────────────────────────
function LoyaltyBadge({ customer, tier }) {
  if (!customer) return null;
  const visits = customer.loyaltyPoints ?? 0;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <span className="flex items-center gap-1 font-bold text-brand">
        <CheckCircle size={13} />
        Returning customer
      </span>
      <span className="text-slate-400">·</span>
      <span className="flex items-center gap-1 font-bold text-slate-600">
        <ShoppingCart size={12} className="text-brand" />
        {visits} visit{visits !== 1 ? 's' : ''}
      </span>
      {tier && tier.discountPercent > 0 && (
        <>
          <span className="text-slate-400">·</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
            {tier.label} — {tier.discountPercent}% loyalty discount applied
          </span>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Billing() {
  const { products, activePromotions, activeLoyaltyTiers, refresh } = useDB();
  const { isOnline, refreshPendingCount }                           = useSync();
  const { currentUser, currentBranch }                             = useAuth();

  // ── Step 1: customer ─────────────────────────────────────────────────────
  const [phone, setPhone]               = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customer, setCustomer]         = useState(null);
  const [lookingUp, setLookingUp]       = useState(false);
  const phoneDebounce                   = useRef(null);

  // ── Step 2: cart ─────────────────────────────────────────────────────────
  const [q, setQ]       = useState('');
  const [cart, setCart] = useState([]);

  // ── Step 3: payment + promo ───────────────────────────────────────────────
  const [selectedPromo, setSelectedPromo] = useState('');
  const [payment, setPayment]             = useState('Cash');

  // Filter promotions valid for current branch and current dates
  const availablePromotions = activePromotions.filter((pr) => {
    if (pr.branchId && currentBranch?.id && String(pr.branchId) !== String(currentBranch.id)) {
      return false;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (pr.startDate && String(pr.startDate).slice(0, 10) > today) return false;
    if (pr.endDate && String(pr.endDate).slice(0, 10) < today) return false;
    return true;
  });

  // ── output ───────────────────────────────────────────────────────────────
  const [invoice, setInvoice] = useState(null);
  const [saving, setSaving]   = useState(false);

  // ── Debounced phone lookup ────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(phoneDebounce.current);
    setCustomer(null);
    if (phone.length < 10) return;

    phoneDebounce.current = setTimeout(async () => {
      setLookingUp(true);
      try {
        const found = await findCustomerByPhone(phone.trim(), isOnline);
        if (found) { setCustomer(found); setCustomerName(found.name || ''); }
      } catch (err) {
        console.error('[Billing] Phone lookup failed:', err);
      } finally {
        setLookingUp(false);
      }
    }, 600);

    return () => clearTimeout(phoneDebounce.current);
  }, [phone]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart  = (p) =>
    setCart((prev) =>
      prev.some((i) => i.product.id === p.id)
        ? prev.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { product: p, qty: 1 }]
    );

  const changeQty  = (id, n) =>
    setCart((prev) =>
      n < 1 ? prev.filter((i) => i.product.id !== id)
             : prev.map((i) => i.product.id === id ? { ...i, qty: n } : i)
    );

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.product.id !== id));

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal     = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const promo        = availablePromotions.find((p) => String(p.id) === String(selectedPromo)) ?? null;
  const promoDiscount = applyPromotion(subtotal, promo, cart);
  const afterPromo   = subtotal - promoDiscount;

  // Loyalty: visit count from customer record
  const visitCount = customer?.loyaltyPoints ?? 0;
  const { discount: loyaltyDiscount, tier } = calcLoyaltyDiscount(afterPromo, activeLoyaltyTiers, visitCount);

  const total      = Math.max(0, afterPromo - loyaltyDiscount);
  const visitsAfter = visitCount + 1; // always +1 per completed sale

  const filtered = products.filter(
    (p) => (p.name + p.sku + p.category).toLowerCase().includes(q.toLowerCase())
  );

  // ── Complete sale ─────────────────────────────────────────────────────────
  const completeSale = useCallback(async () => {
    if (!cart.length || !phone.trim() || saving) return;
    setSaving(true);

    try {
      // 1. Resolve or create customer (offline to IndexedDB or online to Supabase)
      let resolvedCustomer = customer;
      if (!resolvedCustomer) {
        resolvedCustomer = await saveCustomer({
          name:  customerName.trim() || '',
          phone: phone.trim(),
          email: '',
        }, isOnline);
      }

      // 2. Generate invoice number
      const invoiceNumber = `INV-${Date.now()}`;

      // 3. Process sale (saves to Supabase if online, or IndexedDB + syncQueue if offline)
      const { bill } = await processSale({
        invoiceNumber,
        customer: resolvedCustomer,
        currentUser,
        cart,
        subtotal,
        promoDiscount,
        loyaltyDiscount,
        total,
        payment,
        promo,
        tier,
        visitsAfter,
        isOnline,
      });

      // 4. Refresh context so dashboard / inventory updates immediately
      await refresh();

      // 5. Open invoice modal
      setInvoice({
        bill, cart, subtotal, promoDiscount, loyaltyDiscount, total, payment,
        promo, tier, visitsAfter,
        customerPhone: phone.trim(),
        customerName:  customerName.trim() || resolvedCustomer.name || '',
      });

      // Reset state for next sale
      setCart([]); setSelectedPromo(''); setPhone('');
      setCustomerName(''); setCustomer(null);
    } catch (err) {
      console.error('[Billing] completeSale failed:', err);
      alert('Failed to complete sale: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }, [
    cart, phone, customerName, customer, saving, isOnline,
    subtotal, promoDiscount, loyaltyDiscount, total, payment,
    promo, tier, visitsAfter, currentUser, refresh, refreshPendingCount,
  ]);

  const canComplete = cart.length > 0 && phone.trim().length >= 10 && !saving;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Point of sale</p>
        <h1 className="mt-1 text-2xl font-extrabold">Billing</h1>
        <p className="text-sm text-slate-500">Identify the customer, build the cart, then complete the sale.</p>
      </div>

      {/* Offline Mode Banner */}
      {!isOnline && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <WifiOff size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Billing in Offline Mode</p>
            <p className="text-xs text-amber-700/90">
              No internet connection. Invoices and stock adjustments are saved to local <b>IndexedDB</b> and will automatically sync to Supabase once connected.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">

        {/* ── LEFT ── */}
        <div className="space-y-4">

          {/* Step 1 — Customer */}
          <section className="card p-5">
            <h2 className="mb-4 font-bold text-slate-700">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-white font-extrabold">1</span>
              Customer
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Phone size={13} className="text-brand" />
                  Phone number <span className="text-red-400">*</span>
                </div>
                <div className="relative">
                  <input
                    className={`field pr-8 ${phone.length >= 10 && !lookingUp ? (customer ? 'border-emerald-400 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40') : ''}`}
                    type="tel" inputMode="numeric" maxLength={12} placeholder="9XXXXXXXXX"
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  />
                  {lookingUp && <span className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
                </div>
              </label>
              <label className="block text-sm font-bold text-slate-700">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  Name <span className="text-slate-300 font-normal">(optional)</span>
                </div>
                <input className="field" type="text" placeholder="Customer name"
                  value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </label>
            </div>
            <LoyaltyBadge customer={customer} tier={tier} />
            {phone.length >= 10 && !lookingUp && !customer && (
              <p className="mt-2 text-xs text-amber-600">✦ New customer — a record will be created on sale completion.</p>
            )}
          </section>

          {/* Step 2 — Products */}
          <section className="card p-5">
            <h2 className="mb-4 font-bold text-slate-700">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-white font-extrabold">2</span>
              Products
            </h2>
            <div className="relative mb-3">
              <Search size={17} className="absolute left-3 top-2.5 text-slate-400" />
              <input className="field pl-9" placeholder="Search by name, SKU or category…"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
              {filtered.map((p) => (
                <div key={p.id} className={`flex items-center justify-between rounded-xl border p-3 transition
                  ${p.stock === 0 ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.sku} · ₹{p.price}</p>
                    <p className={`text-xs font-bold ${p.stock <= 10 ? 'text-red-500' : 'text-slate-400'}`}>{p.stock} in stock</p>
                  </div>
                  <button className="ml-2 shrink-0 rounded-xl bg-blue-50 p-2 text-brand hover:bg-blue-100 disabled:opacity-40"
                    disabled={p.stock === 0} onClick={() => addToCart(p)}>
                    <ShoppingCart size={16} />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-slate-400">No products found</p>}
            </div>
          </section>
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">

          {/* Cart */}
          <section className="card p-5">
            <h2 className="mb-3 font-bold">
              Cart {cart.length > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{cart.length}</span>}
            </h2>
            {cart.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                <ShoppingCart size={32} className="text-slate-200" />Cart is empty
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {cart.map(({ product: p, qty }) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="text-xs text-slate-400">₹{p.price} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(p.id, qty - 1)} className="rounded-lg bg-slate-200 p-1 hover:bg-slate-300"><Minus size={12} /></button>
                      <span className="w-7 text-center text-sm font-bold">{qty}</span>
                      <button onClick={() => changeQty(p.id, qty + 1)} className="rounded-lg bg-slate-200 p-1 hover:bg-slate-300"><Plus size={12} /></button>
                    </div>
                    <span className="w-16 text-right text-sm font-bold text-brand">₹{p.price * qty}</span>
                    <button onClick={() => removeItem(p.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Checkout */}
          <section className="card p-5 space-y-3">
            <h2 className="font-bold text-slate-700">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-white font-extrabold">3</span>
              Payment
            </h2>

            <label className="block text-sm font-bold text-slate-700">
              <div className="flex items-center gap-2 mb-1.5"><Tag size={13} className="text-brand" />Apply Promotion</div>
              <select className="field" value={selectedPromo} onChange={(e) => setSelectedPromo(e.target.value)}>
                <option value="">— No promotion —</option>
                {availablePromotions.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} ({pr.discountType === 'percent' ? `${pr.value}% off` : `₹${pr.value} off`})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold text-slate-700">
              Payment method
              <select className="field mt-1.5" value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option>Cash</option><option>UPI</option><option>Card</option>
              </select>
            </label>

            {/* Totals */}
            <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>₹{subtotal}</span></div>

              {promoDiscount > 0 && (
                <div className="flex justify-between font-bold text-emerald-600">
                  <span>Promo ({promo?.name})</span><span>−₹{promoDiscount}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between font-bold text-purple-600">
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-amber-400" />
                    Loyalty — {tier?.discountPercent}% ({tier?.label})
                  </span>
                  <span>−₹{loyaltyDiscount}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-extrabold pt-1 border-t border-slate-100">
                <span>Total</span><span>₹{total}</span>
              </div>

              {/* Visit preview */}
              {phone.length >= 10 && cart.length > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                  <span className="flex items-center gap-1 text-amber-700 font-bold">
                    <Star size={11} className="text-amber-400" />This will be visit #{visitsAfter}
                  </span>
                  <span className="font-extrabold text-amber-700">{visitCount} → {visitsAfter} visits</span>
                </div>
              )}
            </div>

            <button className="btn-primary w-full py-3 disabled:opacity-50"
              disabled={!canComplete} onClick={completeSale}>
              <ReceiptText size={17} />
              {saving ? 'Processing…' : 'Complete Sale'}
            </button>

            {!phone.trim() && <p className="text-center text-xs text-red-400">Phone number is required to proceed</p>}
            {!isOnline    && <p className="text-center text-xs text-amber-600">⚠ Offline — bill will be queued for sync</p>}
          </section>
        </div>
      </div>

      {invoice && <InvoiceModal invoice={invoice} onClose={() => setInvoice(null)} />}
    </>
  );
}
