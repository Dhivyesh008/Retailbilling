import { syncQueueDB, customersDB } from '../db/db.js';
import { supabase } from '../lib/supabase.js';
import { mapCustomer, syncOfflineCustomers } from './customerService.js';

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
