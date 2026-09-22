import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Phone, User, Search, ShoppingCart, Trash2,
  ReceiptText, Tag, Plus, Minus, Star, CheckCircle, Camera, Zap,
} from 'lucide-react';
import { useDB }   from '../context/DBContext.jsx';

import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  incrementLoyaltyPoints,
  insertSale,
  adjustProductStock,
} from '../services/supabaseService.js';
import { findCustomerByPhone, saveCustomer } from '../services/customerService.js';
import { calcLoyaltyDiscount, getLoyaltyTier } from '../constants/loyalty.js';
import { billsDB, syncQueueDB } from '../db/db.js';
import InvoiceModal from '../components/InvoiceModal.jsx';
import BarcodeScannerModal from '../components/BarcodeScannerModal.jsx';
import ScanToast from '../components/ScanToast.jsx';

// ─── Promo helper ─────────────────────────────────────────────────────────────
function calculateDiscount(subtotal, promo) {
  if (!promo || !subtotal || subtotal <= 0) return 0;
  const minCart = parseFloat(promo.minCartValue || 0);
  if (minCart > 0 && subtotal < minCart) return 0;

  const val = parseFloat(promo.value ?? promo.discount_value ?? 0);
  if (isNaN(val) || val <= 0) return 0;

  let discount = 0;
  const type = String(promo.discountType || promo.discount_type || 'percent').toLowerCase();

  if (type === 'percent' || type === 'percentage') {
    discount = Math.round(subtotal * (val / 100));
  } else if (type === 'flat') {
    discount = Math.round(val);
  }

  // Capped at subtotal, never let a flat discount push total negative
  return Math.max(0, Math.min(discount, subtotal));
}

// ─── Item-level Offer Pricing Helper ──────────────────────────────────────────
function getItemPricing(product, productRecommendationMap, currentBranch) {
  const originalPrice = parseFloat(product?.price) || 0;
  if (!product || !originalPrice) {
    return { originalPrice: 0, discountedPrice: 0, effectivePrice: 0, hasOffer: false, discountAmount: 0, offerLabel: null };
  }

  const rec = productRecommendationMap?.get(String(product.id));
  // Bundle deals are order-level, not auto-applied to single items
  if (!rec || rec.actionType === 'bundleDiscount') {
    return {
      originalPrice,
      discountedPrice: originalPrice,
      effectivePrice: originalPrice,
      hasOffer: false,
      discountAmount: 0,
      offerLabel: null,
    };
  }

  // Branch check: if recommendation is branch-specific, ensure it matches current branch
  if (rec.branchId && currentBranch?.id && String(rec.branchId) !== String(currentBranch.id)) {
    return {
      originalPrice,
      discountedPrice: originalPrice,
      effectivePrice: originalPrice,
      hasOffer: false,
      discountAmount: 0,
      offerLabel: null,
    };
  }

  const val = Number(rec.actionValue ?? 0);
  let disc = 0;
  const type = String(rec.actionType || 'percentDiscount').toLowerCase();

  if (type === 'percentdiscount' || type === 'percent' || type === 'percentage') {
    disc = Math.round(originalPrice * (val / 100));
  } else if (type === 'flatdiscount' || type === 'flat') {
    disc = Math.round(val);
  }

  disc = Math.max(0, Math.min(disc, originalPrice));
  const discountedPrice = Math.max(0, originalPrice - disc);
  const hasOffer = disc > 0;

  return {
    originalPrice,
    discountedPrice,
    effectivePrice: hasOffer ? discountedPrice : originalPrice,
    hasOffer,
    discountAmount: disc,
    offerLabel: rec.actionLabel,
    offerSource: rec.sourceName,
  };
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
  const { products, activePromotions, activeLoyaltyTiers, refresh, addBill, productRecommendationMap } = useDB();
  const { isOnline, refreshPendingCount }                                     = useSync();
  const { currentUser, currentBranch }                                      = useAuth();

  // ── Step 1: customer ─────────────────────────────────────────────────────
  const [phone, setPhone]               = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customer, setCustomer]         = useState(null);
  const [lookingUp, setLookingUp]       = useState(false);
  const phoneDebounce                   = useRef(null);

  // ── Step 2: cart ─────────────────────────────────────────────────────────
  const [q, setQ]       = useState('');
  const [cart, setCart] = useState([]);

  // ── Barcode scanner ───────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError,   setScanError]   = useState(null);
  const [toast,       setToast]       = useState(null);

  // ── Step 3: payment + promo ───────────────────────────────────────────────
  const [selectedPromo, setSelectedPromo] = useState('');
  const [payment, setPayment]             = useState('Cash');

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
  const addToCart = useCallback((p) => {
    const pricing = getItemPricing(p, productRecommendationMap, currentBranch);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === p.id);
      if (existing) {
        return prev.map((i) => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [
        ...prev,
        {
          product: p,
          qty: 1,
          originalPrice: pricing.originalPrice,
          discountedPrice: pricing.discountedPrice,
          effectivePrice: pricing.effectivePrice,
          hasOffer: pricing.hasOffer,
          offerLabel: pricing.offerLabel,
          offerSource: pricing.offerSource,
        },
      ];
    });
  }, [productRecommendationMap, currentBranch]);

  // ── Barcode scan handler ──────────────────────────────────────────────────
  const handleScan = useCallback((barcode) => {
    const trimmed = String(barcode || '').trim();
    if (!trimmed) return;

    const match = products.find((p) => {
      const pBarcode = String(p.barcode || '').trim();
      const pSku = String(p.sku || '').trim();
      if (pBarcode && pBarcode === trimmed) return true;
      // Handle UPC-A / EAN-13 leading 0 normalization
      if (pBarcode && trimmed.startsWith('0') && pBarcode === trimmed.replace(/^0+/, '')) return true;
      if (pBarcode && pBarcode.startsWith('0') && pBarcode.replace(/^0+/, '') === trimmed) return true;
      // Also match SKU directly if user scans a SKU barcode
      if (pSku && pSku.toLowerCase() === trimmed.toLowerCase()) return true;
      return false;
    });

    if (!match) {
      setScanError(`No product matches barcode "${trimmed}"`);
      return;
    }
    if (match.stock === 0) {
      setScanError(`${match.name} is out of stock`);
      return;
    }
    // Found and in stock — add to cart, close modal, show toast
    addToCart(match);
    setScannerOpen(false);
    setScanError(null);
    setToast({ message: `${match.name} added to cart` });
  }, [products, addToCart]);

  const changeQty  = (id, n) =>
    setCart((prev) =>
      n < 1 ? prev.filter((i) => i.product.id !== id)
             : prev.map((i) => i.product.id === id ? { ...i, qty: n } : i)
    );

  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.product.id !== id));

  // ── Derived Cart with Item-Level Pricing ──────────────────────────────────
  const cartWithPricing = useMemo(() => {
    return cart.map((i) => {
      // Preserve pricing snapshot captured when item was added to the cart
      const pricing = i.effectivePrice !== undefined
        ? {
            originalPrice:   i.originalPrice ?? parseFloat(i.product.price),
            discountedPrice: i.discountedPrice ?? parseFloat(i.product.price),
            effectivePrice:  i.effectivePrice,
            hasOffer:        Boolean(i.hasOffer),
            offerLabel:      i.offerLabel ?? null,
            offerSource:     i.offerSource ?? null,
          }
        : getItemPricing(i.product, productRecommendationMap, currentBranch);

      const qty = parseInt(i.qty, 10) || 1;
      return {
        ...i,
        ...pricing,
        lineTotal: pricing.effectivePrice * qty,
      };
    });
  }, [cart, productRecommendationMap, currentBranch]);

  // ── Order-Level Promotions (Excludes auto-applied item offers) ─────────────
  const orderPromotions = useMemo(() => {
    return activePromotions.filter((pr) => {
      if (pr.sourceRecommendationId || pr.isRuleBased) {
        return pr.actionType === 'bundleDiscount' || pr.discountType === 'bundleDiscount';
      }
      return true;
    });
  }, [activePromotions]);

  // Reset selected promo automatically if it was deactivated/removed elsewhere
  useEffect(() => {
    if (selectedPromo && !orderPromotions.some((p) => String(p.id) === String(selectedPromo))) {
      setSelectedPromo('');
    }
  }, [selectedPromo, orderPromotions]);

  // ── Derived Totals (Reactive calculation) ─────────────────────────────────
  const { subtotal, promo, promoDiscount, loyaltyDiscount, tier, total, totalDiscount, totalItemSavings } = useMemo(() => {
    // 1. subtotal = sum of each item's already-discounted line price
    const sub = cartWithPricing.reduce((s, i) => s + i.lineTotal, 0);

    // Sum of item-level savings already deducted in subtotal
    const itemSavings = cartWithPricing.reduce(
      (s, i) => s + (i.hasOffer ? (i.originalPrice - i.discountedPrice) * (parseInt(i.qty, 10) || 0) : 0),
      0
    );

    // 2. promoDiscount = calculateDiscount(subtotal, selectedPromotion)
    const matchedPromo = orderPromotions.find((p) => String(p.id) === String(selectedPromo)) ?? null;
    const pDisc = calculateDiscount(sub, matchedPromo);

    // 3. loyaltyDiscount = calculateLoyaltyDiscount(subtotal, customer.loyaltyPoints)
    const visits = customer?.loyaltyPoints ?? 0;
    const { discount: rawLoyaltyDisc, tier: matchedTier } = calcLoyaltyDiscount(
      sub,
      activeLoyaltyTiers,
      visits
    );
    // Cap loyalty discount so total discounts do not exceed subtotal
    const lDisc = Math.max(0, Math.min(rawLoyaltyDisc, sub - pDisc));

    // 4. total = subtotal - promoDiscount - loyaltyDiscount
    const tot = Math.max(0, sub - pDisc - lDisc);
    const totDisc = pDisc + lDisc;

    return {
      subtotal: sub,
      promo: matchedPromo,
      promoDiscount: pDisc,
      loyaltyDiscount: lDisc,
      tier: matchedTier,
      total: tot,
      totalDiscount: totDisc,
      totalItemSavings: itemSavings,
    };
  }, [cartWithPricing, selectedPromo, orderPromotions, customer, activeLoyaltyTiers]);

  const visitCount = customer?.loyaltyPoints ?? 0;
  const visitsAfter = visitCount + 1; // always +1 per completed sale

  const filtered = products.filter(
    (p) => (p.name + p.sku + p.category).toLowerCase().includes(q.toLowerCase())
  );

  // ── Complete sale ─────────────────────────────────────────────────────────
  const completeSale = useCallback(async () => {
    if (!cartWithPricing.length || !phone.trim() || saving) return;
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

      // 2. Generate invoice number and local bill ID
      const invoiceNumber = `INV-${Date.now()}`;
      const localBillId = `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const totalDiscount = promoDiscount + loyaltyDiscount;

      // 3. Build initial bill object (marked PENDING_SYNC initially)
      let bill = {
        id:            localBillId,
        invoiceNumber,
        items: cartWithPricing.map((i) => ({
          productId:     i.product.id,
          name:          i.product.name,
          price:         i.effectivePrice,
          originalPrice: i.originalPrice,
          qty:           i.qty,
          category:      i.product.category,
          hasOffer:      Boolean(i.hasOffer),
          discountAmount: i.discountAmount || 0,
        })),
        subtotal,
        promoDiscount,
        loyaltyDiscount,
        discount:      totalDiscount,
        total,
        payment,
        customerPhone: phone.trim(),
        customerName:  customerName.trim() || resolvedCustomer?.name || '',
        customerId:    resolvedCustomer?.id,
        cashierId:     currentUser?.id,
        promoId:       promo?.id ?? null,
        visitsAfter,
        loyaltyTierId: tier?.id ?? null,
        timestamp:     new Date().toISOString(),
        status:        'PENDING_SYNC',
        syncStatus:    'pending',
      };

      // 4. If online, attempt to push directly to Supabase
      let syncedOnline = false;
      if (isOnline) {
        try {
          const toNumericId = (v) => {
            const n = parseInt(v, 10);
            return isNaN(n) ? null : n;
          };

          const saleId = await insertSale({
            invoiceNumber,
            customerId:    resolvedCustomer?.id,
            cashierId:     toNumericId(currentUser?.id),
            storeId:       toNumericId(currentUser?.storeId),
            subtotal,
            discount:      totalDiscount,
            tax:           0,
            total,
            paymentMethod: payment,
            status:        'completed',
            syncStatus:    'synced',
            items: cartWithPricing.map((i) => ({
              productId: i.product.id,
              name:      i.product.name,
              price:     parseFloat(i.effectivePrice),
              qty:       i.qty,
              category:  i.product.category,
            })),
          });

          if (saleId) {
            bill.id = String(saleId);
            bill.status = 'SYNCED';
            bill.syncStatus = 'synced';
            syncedOnline = true;
          }

          // Reduce stock & increment loyalty points in Supabase
          await Promise.allSettled(
            cartWithPricing.map((i) => adjustProductStock(i.product.id, -i.qty))
          );
          if (resolvedCustomer?.id) {
            await incrementLoyaltyPoints(resolvedCustomer.id, 1).catch(() => {});
          }
        } catch (supaErr) {
          console.warn('[Billing] Supabase insert failed, saving offline as PENDING_SYNC:', supaErr);
          bill.status = 'PENDING_SYNC';
          bill.syncStatus = 'pending';
          syncedOnline = false;
        }
      }

      // 5. Always persist to local IndexedDB (billsDB)
      await billsDB.put(bill);

      // 6. If not synced online, enqueue in syncQueueDB
      if (!syncedOnline) {
        await syncQueueDB.enqueue('bill', bill.id, 'CREATE');
        await refreshPendingCount();
      }

      // 7. Reactively update shared bills state in DBContext immediately
      addBill(bill);

      // 8. Dispatch global event for any extra listeners
      window.dispatchEvent(new CustomEvent('retailsync:bill-added', { detail: bill }));

      // 9. Silent background refresh of DBContext
      refresh().catch(() => {});

      setInvoice({
        bill, cart: cartWithPricing, subtotal, promoDiscount, loyaltyDiscount, total, payment,
        promo, tier, visitsAfter,
        pointsEarned: 1,
        pointsAfter: visitsAfter,
        customerPhone: phone.trim(),
        customerName:  customerName.trim() || resolvedCustomer?.name || '',
      });

      setCart([]); setSelectedPromo(''); setPhone('');
      setCustomerName(''); setCustomer(null);
    } catch (err) {
      console.error('[Billing] completeSale failed:', err);
      alert(`Sale could not be saved: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [
    cartWithPricing, phone, customerName, customer, saving, isOnline,
    subtotal, promoDiscount, loyaltyDiscount, total, payment,
    currentUser, promo, tier, visitsAfter,
    refresh, refreshPendingCount, addBill,
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
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-3 top-2.5 text-slate-400" />
                <input className="field pl-9" placeholder="Search by name, SKU or category…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button
                id="scan-barcode-btn"
                title="Scan barcode"
                onClick={() => { setScanError(null); setScannerOpen(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 13px',
                  background: 'linear-gradient(135deg, #335CFF, #4f7bff)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  boxShadow: '0 2px 8px #335cff40',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                <Camera size={15} />
                Scan
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
              {filtered.map((p) => {
                const badge = productRecommendationMap?.get(String(p.id));
                const itemPricing = getItemPricing(p, productRecommendationMap, currentBranch);
                return (
                  <div key={p.id} className={`relative flex items-center justify-between rounded-xl border p-3 transition
                    ${p.stock === 0 ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'}`}>
                    {badge && (
                      <span className="absolute right-9 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                        <Zap size={8}/>{badge.actionLabel}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span>{p.sku}</span>
                        <span>·</span>
                        {itemPricing.hasOffer ? (
                          <span className="flex items-center gap-1">
                            <span className="line-through text-slate-400">₹{itemPricing.originalPrice}</span>
                            <span className="font-bold text-emerald-600">₹{itemPricing.discountedPrice}</span>
                          </span>
                        ) : (
                          <span>₹{p.price}</span>
                        )}
                      </div>
                      <p className={`text-xs font-bold ${p.stock <= 10 ? 'text-red-500' : 'text-slate-400'}`}>{p.stock} in stock</p>
                    </div>
                    <button className="ml-2 shrink-0 rounded-xl bg-blue-50 p-2 text-brand hover:bg-blue-100 disabled:opacity-40"
                      disabled={p.stock === 0} onClick={() => addToCart(p)}>
                      <ShoppingCart size={16} />
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-slate-400">No products found</p>}
            </div>
          </section>
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">

          {/* Cart */}
          <section className="card p-5">
            <h2 className="mb-3 font-bold">
              Cart {cartWithPricing.length > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{cartWithPricing.length}</span>}
            </h2>
            {cartWithPricing.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-400">
                <ShoppingCart size={32} className="text-slate-200" />Cart is empty
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {cartWithPricing.map((item) => {
                  const { product: p, qty, originalPrice, discountedPrice, effectivePrice, hasOffer, offerLabel } = item;
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{p.name}</p>
                        {hasOffer ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs mt-0.5">
                            <span className="line-through text-slate-400">₹{originalPrice}</span>
                            <span className="font-extrabold text-emerald-600">₹{discountedPrice}</span>
                            <span className="text-slate-400">each</span>
                            {offerLabel && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                <Zap size={8} />{offerLabel}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">₹{originalPrice} each</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => changeQty(p.id, qty - 1)} className="rounded-lg bg-slate-200 p-1 hover:bg-slate-300"><Minus size={12} /></button>
                        <span className="w-7 text-center text-sm font-bold">{qty}</span>
                        <button onClick={() => changeQty(p.id, qty + 1)} className="rounded-lg bg-slate-200 p-1 hover:bg-slate-300"><Plus size={12} /></button>
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-bold text-brand">₹{effectivePrice * qty}</span>
                        {hasOffer && (
                          <p className="text-[10px] text-emerald-600 font-semibold">
                            save ₹{(originalPrice - discountedPrice) * qty}
                          </p>
                        )}
                      </div>
                      <button onClick={() => removeItem(p.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                  );
                })}
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
                {orderPromotions.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
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
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-700">₹{subtotal}</span>
              </div>

              {totalItemSavings > 0 && (
                <div className="flex justify-between text-xs text-emerald-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Zap size={11} className="text-emerald-500" />
                    Item offers savings (applied in subtotal)
                  </span>
                  <span>−₹{totalItemSavings}</span>
                </div>
              )}

              {/* Promotion discount line */}
              {(selectedPromo !== '' || promoDiscount > 0) && (
                <div>
                  <div className={`flex justify-between font-bold ${promoDiscount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1">
                      <Tag size={12} className={promoDiscount > 0 ? 'text-emerald-500' : 'text-slate-400'} />
                      Order promotion {promo?.name ? `(${promo.name})` : ''}
                    </span>
                    <span>−₹{promoDiscount}</span>
                  </div>
                  {promo?.minCartValue > 0 && subtotal < promo.minCartValue && (
                    <p className="text-[11px] text-amber-600 font-normal text-right">
                      Requires min cart of ₹{promo.minCartValue}
                    </p>
                  )}
                </div>
              )}

              {/* Loyalty discount line */}
              {(customer || loyaltyDiscount > 0) && (
                <div className={`flex justify-between font-bold ${loyaltyDiscount > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                  <span className="flex items-center gap-1">
                    <Star size={12} className={loyaltyDiscount > 0 ? 'text-amber-400' : 'text-slate-300'} />
                    Loyalty discount {tier?.label ? `— ${tier.discountPercent}% (${tier.label})` : ''}
                  </span>
                  <span>−₹{loyaltyDiscount}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-extrabold pt-1 border-t border-slate-100">
                <span>Total</span>
                <span className="text-brand">₹{total}</span>
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

      {scannerOpen && (
        <BarcodeScannerModal
          onScan={handleScan}
          onClose={() => { setScannerOpen(false); setScanError(null); }}
          scanError={scanError}
        />
      )}

      {toast && (
        <ScanToast
          message={`✅ ${toast.message}`}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
