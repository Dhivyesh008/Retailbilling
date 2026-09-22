/**
 * billingService.js
 *
 * Offline-first Point of Sale Billing & Synchronization:
 * - When online: Saves sale directly to Supabase PostgreSQL and caches to IndexedDB.
 * - When offline: Saves sale & items to IndexedDB `bills` store with PENDING_SYNC status,
 *   adjusts local stock, increments local loyalty points, and enqueues to syncQueue.
 * - When internet is restored: Pushes pending offline sales to Supabase, updates inventory,
 *   links customer IDs, and marks bills as SYNCED.
 */
import { supabase } from '../lib/supabase.js';
import { billsDB, stockDB, customersDB, syncQueueDB, productsDB } from '../db/db.js';
import { adjustProductStock, incrementLoyaltyPoints } from './supabaseService.js';
import { findCustomerByPhone } from './customerService.js';

/** Helper to convert potentially non-numeric IDs to number or null */
function toNumericId(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/**
 * Process and complete a sale.
 * Works seamlessly both online and offline.
 *
 * @param {Object} params
 * @param {string} params.invoiceNumber
 * @param {Object} params.customer - { id, name, phone }
 * @param {Object} params.currentUser - { id, name, storeId, role }
 * @param {Array} params.cart - array of { product, qty }
 * @param {number} params.subtotal
 * @param {number} params.promoDiscount
 * @param {number} params.loyaltyDiscount
 * @param {number} params.total
 * @param {string} params.payment
 * @param {Object} [params.promo]
 * @param {Object} [params.tier]
 * @param {number} params.visitsAfter
 * @param {boolean} params.isOnline
 * @returns {Promise<{ bill: Object, isOffline: boolean }>}
 */
export async function processSale({
  invoiceNumber,
  customer,
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
  isOnline = true,
}) {
  const totalDiscount = promoDiscount + loyaltyDiscount;

  const items = cart.map((i) => ({
    productId: i.product.id,
    name:      i.product.name,
    price:     i.product.price,
    qty:       i.qty,
    category:  i.product.category,
  }));

  // ─── 1. ONLINE SALE FLOW ──────────────────────────────────────────────────
  if (isOnline) {
    try {
      // Insert sale into Supabase
      const { data: saleRow, error: saleErr } = await supabase
        .from('sales')
        .insert({
          invoice_number: invoiceNumber,
          customer_id:    toNumericId(customer?.id),
          cashier_id:     toNumericId(currentUser?.id),
          store_id:       toNumericId(currentUser?.storeId),
          subtotal:       subtotal,
          discount:       totalDiscount,
          tax:            0,
          total:          total,
          payment_method: payment,
          status:         'completed',
          sync_status:    'synced',
        })
        .select()
        .single();

      if (saleErr) throw saleErr;

      const saleId = saleRow.id;

      // Insert sale items into Supabase
      if (items.length > 0) {
        const itemRows = items.map((item) => ({
          sale_id:    saleId,
          product_id: toNumericId(item.productId),
          quantity:   item.qty,
          unit_price: item.price,
          discount:   0,
        }));
        const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
        if (itemsErr) console.warn('[billingService] Error inserting sale items:', itemsErr);
      }

      // Decrement stock in Supabase
      await Promise.all(
        cart.map((i) => adjustProductStock(i.product.id, -i.qty).catch((err) => console.warn(err)))
      );

      // Increment customer loyalty points if numeric customer ID exists
      if (toNumericId(customer?.id)) {
        await incrementLoyaltyPoints(toNumericId(customer.id), 1).catch((err) => console.warn(err));
      }

      // Build synced bill record
      const syncedBill = {
        id:              String(saleId),
        invoiceNumber,
        items,
        subtotal,
        promoDiscount,
        loyaltyDiscount,
        discount:        totalDiscount,
        tax:             0,
        total,
        payment,
        paymentMethod:   payment,
        customerPhone:   customer?.phone || '',
        customerName:    customer?.name || '',
        customerId:      customer?.id ?? null,
        cashierId:       currentUser?.id ?? null,
        storeId:         currentUser?.storeId ?? null,
        promoId:         promo?.id ?? null,
        visitsAfter,
        loyaltyTierId:   tier?.id ?? null,
        timestamp:       new Date().toISOString(),
        status:          'SYNCED',
        syncStatus:      'SYNCED',
      };

      // Cache locally in IndexedDB bills store
      await billsDB.put(syncedBill).catch(() => {});

      // Adjust local stock cache in IndexedDB
      for (const i of cart) {
        await stockDB.adjustStock(i.product.id, -i.qty).catch(() => {});
      }

      return { bill: syncedBill, isOffline: false };
    } catch (err) {
      console.warn('[billingService] Online sale failed or network disconnected, switching to offline IndexedDB storage:', err);
      // Fall through to offline flow below
    }
  }

  // ─── 2. OFFLINE SALE FLOW (Stored in IndexedDB) ───────────────────────────
  const offlineBillId = `offline-bill-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const offlineBill = {
    id:              offlineBillId,
    invoiceNumber,
    items,
    subtotal,
    promoDiscount,
    loyaltyDiscount,
    discount:        totalDiscount,
    tax:             0,
    total,
    payment,
    paymentMethod:   payment,
    customerPhone:   customer?.phone || '',
    customerName:    customer?.name || '',
    customerId:      customer?.id ?? null,
    cashierId:       currentUser?.id ?? null,
    storeId:         currentUser?.storeId ?? 1,
    promoId:         promo?.id ?? null,
    visitsAfter,
    loyaltyTierId:   tier?.id ?? null,
    timestamp:       new Date().toISOString(),
    status:          'PENDING_SYNC',
    syncStatus:      'PENDING_SYNC',
    isOffline:       true,
  };

  // 1. Save bill in IndexedDB
  await billsDB.put(offlineBill);

  // 2. Queue in syncQueueDB for background push when connection is restored
  await syncQueueDB.enqueue('bill', offlineBillId, 'CREATE');

  // 3. Decrement local stock in IndexedDB
  for (const i of cart) {
    await stockDB.adjustStock(i.product.id, -i.qty).catch(() => {});
  }

  // 4. Record local sale in customer purchase history & points in IndexedDB
  if (customer?.id) {
    await customersDB.recordSale(customer.id, offlineBillId, 1).catch(() => {});
  }

  console.log('[billingService] Bill stored locally in IndexedDB (Offline):', offlineBill);
  return { bill: offlineBill, isOffline: true };
}

/**
 * Fetch all bills/sales.
 * Combines live Supabase sales with pending offline bills from IndexedDB.
 */
export async function loadAllBills(isOnline = true) {
  // Read local pending bills from IndexedDB
  let localPending = [];
  try {
    const allLocal = await billsDB.getAll();
    localPending = allLocal.filter((b) => b.status === 'PENDING_SYNC' || b.syncStatus === 'PENDING_SYNC');
  } catch (err) {
    console.error('[billingService] Error reading local bills from IndexedDB:', err);
  }

  if (isOnline) {
    try {
      const { data: salesRows, error } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items (
            id, product_id, quantity, unit_price, discount,
            products ( name, sku, category )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const serverBills = (salesRows ?? []).map((row) => ({
        id:            String(row.id),
        invoiceNumber: row.invoice_number ?? '',
        customerId:    row.customer_id ? String(row.customer_id) : null,
        cashierId:     row.cashier_id ? String(row.cashier_id) : null,
        storeId:       row.store_id ? String(row.store_id) : null,
        subtotal:      parseFloat(row.subtotal ?? 0),
        discount:      parseFloat(row.discount ?? 0),
        tax:           parseFloat(row.tax ?? 0),
        total:         parseFloat(row.total ?? 0),
        payment:       row.payment_method ?? '',
        status:        'SYNCED',
        syncStatus:    'SYNCED',
        timestamp:     row.created_at,
        items: (row.sale_items ?? []).map((si) => ({
          productId: si.product_id,
          name:      si.products?.name ?? '',
          sku:       si.products?.sku ?? '',
          category:  si.products?.category ?? '',
          price:     parseFloat(si.unit_price ?? 0),
          qty:       si.quantity ?? 1,
        })),
      }));

      // Cache server bills to IndexedDB
      for (const sb of serverBills) {
        await billsDB.put(sb).catch(() => {});
      }

      // Merge pending offline bills with server bills
      return [...localPending, ...serverBills].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (err) {
      console.warn('[billingService] Could not fetch sales from Supabase, loading from IndexedDB:', err);
    }
  }

  // Offline fallback: load all from IndexedDB
  try {
    const all = await billsDB.getAll();
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[billingService] Failed to load bills from IndexedDB:', err);
    return [];
  }
}

/**
 * Synchronize all pending offline bills from IndexedDB to Supabase.
 * Triggered automatically when internet connection returns.
 */
export async function syncOfflineBills() {
  let pending = [];
  try {
    pending = await billsDB.getPending();
  } catch (err) {
    console.error('[billingService] Error reading pending bills from IndexedDB:', err);
    return { synced: 0, failed: 0 };
  }

  if (pending.length === 0) return { synced: 0, failed: 0 };

  console.log(`[billingService] Syncing ${pending.length} offline bill(s) to Supabase...`);
  let synced = 0;
  let failed = 0;

  for (const bill of pending) {
    try {
      // 1. Resolve Customer ID if it was an offline customer
      let resolvedCustomerId = toNumericId(bill.customerId);
      if (!resolvedCustomerId && bill.customerPhone) {
        const found = await findCustomerByPhone(bill.customerPhone, true);
        if (found && toNumericId(found.id)) {
          resolvedCustomerId = toNumericId(found.id);
        }
      }

      // 2. Insert sale record into Supabase
      const { data: saleRow, error: saleErr } = await supabase
        .from('sales')
        .insert({
          invoice_number: bill.invoiceNumber || `INV-${Date.now()}`,
          customer_id:    resolvedCustomerId,
          cashier_id:     toNumericId(bill.cashierId),
          store_id:       toNumericId(bill.storeId) || 1,
          subtotal:       bill.subtotal,
          discount:       bill.discount || 0,
          tax:            bill.tax || 0,
          total:          bill.total,
          payment_method: bill.payment || bill.paymentMethod || 'Cash',
          status:         'completed',
          sync_status:    'synced',
          created_at:     bill.timestamp,
        })
        .select()
        .single();

      if (saleErr) throw saleErr;

      const newSaleId = saleRow.id;

      // 3. Insert sale items into Supabase
      if (bill.items && bill.items.length > 0) {
        const itemRows = bill.items.map((item) => ({
          sale_id:    newSaleId,
          product_id: toNumericId(item.productId),
          quantity:   item.qty,
          unit_price: item.price,
          discount:   0,
        }));
        const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
        if (itemsErr) console.warn('[billingService] Error inserting synced sale items:', itemsErr);
      }

      // 4. Adjust product stock in Supabase
      if (bill.items) {
        for (const item of bill.items) {
          if (toNumericId(item.productId)) {
            await adjustProductStock(toNumericId(item.productId), -item.qty).catch((err) =>
              console.warn(err)
            );
          }
        }
      }

      // 5. Increment customer loyalty points in Supabase
      if (resolvedCustomerId) {
        await incrementLoyaltyPoints(resolvedCustomerId, 1).catch((err) => console.warn(err));
      }

      // 6. Update local bill in IndexedDB to SYNCED
      const updatedBill = {
        ...bill,
        status:       'SYNCED',
        syncStatus:   'SYNCED',
        serverSaleId: newSaleId,
      };
      await billsDB.put(updatedBill);

      // 7. Mark sync queue item as SYNCED
      const queueItems = await syncQueueDB.getPending();
      for (const q of queueItems) {
        if (q.entityId === bill.id) {
          await syncQueueDB.markSynced(q.id);
        }
      }

      synced++;
      console.log(`[billingService] Successfully synced offline bill ${bill.invoiceNumber} -> Supabase ID ${newSaleId}`);
    } catch (err) {
      console.error(`[billingService] Failed to sync bill ${bill.id}:`, err);
      failed++;
    }
  }

  return { synced, failed };
}
