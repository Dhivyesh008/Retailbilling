/**
 * customerService.js
 *
 * Hybrid Customer Data Management:
 * - When online: Saves directly to Supabase PostgreSQL and caches to IndexedDB.
 * - When offline (no internet): Saves to IndexedDB with PENDING_SYNC status and enqueues in syncQueue.
 * - When internet connection is restored: Automatically pushes all pending offline customers to Supabase.
 */
import { supabase } from '../lib/supabase.js';
import { customersDB, syncQueueDB } from '../db/db.js';

/** Map a Supabase row to the frontend customer model */
export function mapCustomer(row) {
  if (!row) return null;
  return {
    id:              row.id,
    name:            row.name ?? '',
    phone:           row.phone ?? '',
    email:           row.email ?? '',
    loyaltyPoints:   row.loyalty_points ?? 0,
    purchaseHistory: [],
    syncStatus:      'SYNCED',
    createdAt:       row.created_at,
  };
}

/**
 * Check if the browser currently has connectivity
 */
export function checkIsOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Save a customer.
 * - If online: Writes to Supabase & caches to IndexedDB.
 * - If offline: Writes to IndexedDB with PENDING_SYNC status and enqueues to syncQueue.
 *
 * @param {Object} customerData - { name, phone, email, loyaltyPoints }
 * @param {boolean} [forcedOnlineState] - Optional override from SyncContext
 * @returns {Promise<Object>} The created/saved customer object
 */
export async function saveCustomer({ name, phone, email = '', loyaltyPoints = 0 }, forcedOnlineState) {
  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();

  // Try online flow first if connected
  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: (name || '').trim(),
          phone: (phone || '').trim(),
          email: (email || '').trim(),
          loyalty_points: loyaltyPoints || 0,
        })
        .select()
        .single();

      if (error) throw error;

      const syncedCust = mapCustomer(data);
      // Cache to IndexedDB for offline access
      await customersDB.put(syncedCust);
      return syncedCust;
    } catch (err) {
      console.warn('[customerService] Supabase insert failed or network unavailable, falling back to IndexedDB:', err);
      // Fall through to offline storage
    }
  }

  // ─── OFFLINE FLOW (Store in IndexedDB) ──────────────────────────────────────
  const tempId = `offline-cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const offlineCust = {
    id: tempId,
    name: (name || '').trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    loyaltyPoints: loyaltyPoints || 0,
    purchaseHistory: [],
    syncStatus: 'PENDING_SYNC',
    isOffline: true,
    createdAt: new Date().toISOString(),
  };

  // 1. Save locally in IndexedDB
  await customersDB.put(offlineCust);

  // 2. Queue for automatic synchronization when internet returns
  await syncQueueDB.enqueue('customer', tempId, 'CREATE');

  console.log('[customerService] Customer stored locally in IndexedDB (Offline):', offlineCust);
  return offlineCust;
}

/**
 * Find customer by phone number.
 * Tries Supabase if online; falls back to IndexedDB.
 *
 * @param {string} phone
 * @param {boolean} [forcedOnlineState]
 * @returns {Promise<Object|null>}
 */
export async function findCustomerByPhone(phone, forcedOnlineState) {
  const cleanPhone = (phone || '').trim();
  if (!cleanPhone) return null;

  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();

  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (!error && data) {
        const cust = mapCustomer(data);
        await customersDB.put(cust); // cache locally
        return cust;
      }
    } catch (err) {
      console.warn('[customerService] Online phone lookup failed, checking IndexedDB:', err);
    }
  }

  // Offline / fallback lookup in IndexedDB
  try {
    const local = await customersDB.getByPhone(cleanPhone);
    return local ?? null;
  } catch (err) {
    console.error('[customerService] IndexedDB getByPhone error:', err);
    return null;
  }
}

/**
 * Fetch all customers.
 * If online: Fetches from Supabase and merges with any pending offline customers from IndexedDB.
 * If offline: Fetches all stored customers from IndexedDB.
 *
 * @param {boolean} [forcedOnlineState]
 * @returns {Promise<Array>}
 */
export async function loadCustomers(forcedOnlineState) {
  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();

  // Retrieve any local offline pending customers from IndexedDB
  let localPending = [];
  try {
    const allLocal = await customersDB.getAll();
    localPending = allLocal.filter((c) => c.syncStatus === 'PENDING_SYNC' || String(c.id).startsWith('offline-'));
  } catch (err) {
    console.error('[customerService] Error reading local customers from IndexedDB:', err);
  }

  if (isOnline) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      const serverCustomers = (data || []).map(mapCustomer);

      // Cache server customers in IndexedDB
      for (const sc of serverCustomers) {
        await customersDB.put(sc);
      }

      // Merge pending offline customers so they are visible in the UI
      return [...localPending, ...serverCustomers];
    } catch (err) {
      console.warn('[customerService] Failed to fetch customers from Supabase, loading from IndexedDB:', err);
    }
  }

  // Offline: return everything stored in IndexedDB
  try {
    return await customersDB.getAll();
  } catch (err) {
    console.error('[customerService] Failed to load customers from IndexedDB:', err);
    return [];
  }
}

/**
 * Sync all pending offline customers from IndexedDB to Supabase PostgreSQL.
 * Called automatically when connection is restored or manually triggered.
 *
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function syncOfflineCustomers() {
  if (!checkIsOnline()) {
    console.log('[customerService] Cannot sync: Still offline');
    return { synced: 0, failed: 0 };
  }

  let allLocal = [];
  try {
    allLocal = await customersDB.getAll();
  } catch (err) {
    console.error('[customerService] Error reading IndexedDB for sync:', err);
    return { synced: 0, failed: 0 };
  }

  const pending = allLocal.filter((c) => c.syncStatus === 'PENDING_SYNC' || String(c.id).startsWith('offline-'));
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  console.log(`[customerService] Syncing ${pending.length} offline customer(s) to Supabase...`);
  let synced = 0;
  let failed = 0;

  for (const cust of pending) {
    try {
      // 1. Insert into Supabase
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

      // 2. Remove temporary offline record from IndexedDB
      if (cust.id !== data.id) {
        await customersDB.delete(cust.id);
      }

      // 3. Save the new official Supabase customer record in IndexedDB
      const serverCust = mapCustomer(data);
      await customersDB.put(serverCust);

      // 4. Mark corresponding syncQueue entries as SYNCED
      const queueItems = await syncQueueDB.getPending();
      for (const item of queueItems) {
        if (item.entityId === cust.id || (item.entityType === 'customer' && item.entityId === cust.id)) {
          await syncQueueDB.markSynced(item.id);
        }
      }

      synced++;
      console.log(`[customerService] Successfully synced customer "${cust.name}" (Supabase ID: ${data.id})`);
    } catch (err) {
      console.error(`[customerService] Failed to sync customer ${cust.id} (${cust.name}):`, err);
      failed++;
    }
  }

  return { synced, failed };
}
