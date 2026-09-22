import { syncQueueDB, customersDB, billsDB } from '../db/db.js';
import { supabase } from '../lib/supabase.js';
import { mapCustomer, syncOfflineCustomers } from './customerService.js';
import { insertSale, adjustProductStock, incrementLoyaltyPoints } from './supabaseService.js';

/**
 * Pushes a single sync queue entry to the Supabase database.
 *
 * @param {Object} entry - The syncQueue entry
 * @param {string} entry.id
 * @param {string} entry.entityType  e.g. 'customer', 'bill', 'stock', 'return'
 * @param {string} entry.entityId
 * @param {string} entry.action      e.g. 'CREATE', 'UPDATE'
 * @param {string} entry.timestamp
 * @returns {Promise<void>}
 */
async function pushToServer(entry) {
  if (entry.entityType === 'customer') {
    const cust = await customersDB.getById(entry.entityId);
    if (!cust) {
      console.warn('[SyncService] Customer not found locally for sync queue entry:', entry.entityId);
      return;
    }

    // Insert into Supabase customers table
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: cust.name,
        phone: cust.phone,
        email: cust.email || '',
        loyalty_points: cust.loyaltyPoints || 0,
      })
      .select()
      .single();

    if (error) throw error;

    // Delete temporary offline record if different ID and save updated server record
    if (cust.id !== data.id) {
      await customersDB.delete(cust.id);
    }
    const syncedCust = mapCustomer(data);
    await customersDB.put(syncedCust);
    console.log('[SyncService] Synced customer to Supabase:', syncedCust.name);
    return;
  }

  if (entry.entityType === 'bill') {
    const bill = await billsDB.getById(entry.entityId);
    if (!bill) {
      console.warn('[SyncService] Bill not found locally for sync queue entry:', entry.entityId);
      return;
    }

    const toNumericId = (v) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };

    // Insert sale into Supabase
    const saleId = await insertSale({
      invoiceNumber: bill.invoiceNumber,
      customerId:    bill.customerId,
      cashierId:     toNumericId(bill.cashierId),
      storeId:       toNumericId(bill.storeId),
      subtotal:      bill.subtotal,
      discount:      bill.discount,
      tax:           bill.tax ?? 0,
      total:         bill.total,
      paymentMethod: bill.payment,
      status:        'completed',
      syncStatus:    'synced',
      items: (bill.items || []).map((item) => ({
        productId: item.productId,
        name:      item.name,
        price:     item.price,
        qty:       item.qty,
        category:  item.category,
      })),
    });

    // Reduce stock in Supabase for each item
    if (bill.items && bill.items.length > 0) {
      await Promise.allSettled(
        bill.items.map((i) => adjustProductStock(i.productId, -i.qty))
      );
    }

    // Increment loyalty points in Supabase
    if (bill.customerId) {
      await incrementLoyaltyPoints(bill.customerId, 1).catch(() => {});
    }

    // Update local bill record
    bill.status = 'SYNCED';
    bill.syncStatus = 'synced';
    if (saleId && String(saleId) !== bill.id) {
      await billsDB.delete(bill.id);
      bill.id = String(saleId);
    }
    await billsDB.put(bill);
    console.log('[SyncService] Synced bill to Supabase:', bill.invoiceNumber);
    return;
  }

  // Fallback simulated delay for other entity types if any
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Iterates all PENDING_SYNC entries in the syncQueue store,
 * calls pushToServer() for each, then marks them SYNCED.
 * Also runs syncOfflineCustomers() to ensure all pending local data is flushed.
 *
 * @param {Function} [onProgress] - Optional callback(processed, total)
 * @returns {Promise<{processed: number, failed: number}>}
 */
export async function runSyncQueue(onProgress) {
  // First run customer sync directly to cover any unqueued pending customers
  await syncOfflineCustomers();

  const pending = await syncQueueDB.getPending();
  let processed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      await pushToServer(entry);
      await syncQueueDB.markSynced(entry.id);
      processed++;
    } catch (err) {
      console.error('[SyncService] Failed to sync entry:', entry.id, err);
      failed++;
    }
    if (onProgress) onProgress(processed + failed, pending.length);
  }

  return { processed, failed };
}

/**
 * Returns the count of PENDING_SYNC entries.
 * @returns {Promise<number>}
 */
export async function getPendingCount() {
  const pending = await syncQueueDB.getPending();
  return pending.length;
}
