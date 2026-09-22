import { syncQueueDB } from '../db/db.js';

// ============================================================
// SYNC SEAM
// This is the ONLY file the backend developer needs to modify
// to wire in real API calls. Replace the body of pushToServer()
// with a real fetch/axios call to your Express/Supabase endpoint.
// ============================================================

/**
 * Pushes a single sync queue entry to the server.
 * Currently mocked — replace with real API call.
 *
 * @param {Object} entry - The syncQueue entry
 * @param {string} entry.id
 * @param {string} entry.entityType  e.g. 'bill', 'stock', 'return'
 * @param {string} entry.entityId
 * @param {string} entry.action      e.g. 'CREATE', 'UPDATE'
 * @param {string} entry.timestamp
 * @returns {Promise<void>}
 */
async function pushToServer(entry) {
  // TODO: Replace this mock with a real API call, e.g.:
  // await fetch(`${API_BASE}/sync`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  //   body: JSON.stringify(entry),
  // });

  // Simulated network delay
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Iterates all PENDING_SYNC entries in the syncQueue store,
 * calls pushToServer() for each, then marks them SYNCED.
 *
 * @param {Function} [onProgress] - Optional callback(processed, total)
 * @returns {Promise<{processed: number, failed: number}>}
 */
export async function runSyncQueue(onProgress) {
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
