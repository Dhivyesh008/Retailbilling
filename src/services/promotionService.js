/**
 * promotionService.js
 *
 * Full promotion management service supporting both Supabase PostgreSQL and offline IndexedDB.
 * - Online: Performs CRUD on Supabase `promotions` table and keeps IndexedDB synced.
 * - Offline: Performs CRUD on IndexedDB `promotions` store with syncStatus tracking and enqueues sync tasks.
 * - Auto-Sync: Automatically synchronizes pending offline changes to Supabase when network is restored.
 */

import { supabase } from '../lib/supabase.js';
import { promotionsDB, syncQueueDB } from '../db/db.js';

export function checkIsOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Maps a Supabase row to the application's promotion model
 */
export function mapPromotion(row) {
  if (!row) return null;
  return {
    id:           row.id,
    name:         row.name ?? '',
    discountType: row.discount_type ?? 'percent',
    value:        parseFloat(row.discount_value ?? 0),
    productId:    row.product_id ? Number(row.product_id) : null,
    startDate:    row.start_date ?? null,
    endDate:      row.end_date   ?? null,
    active:       Boolean(row.active),
    minCartValue: parseFloat(row.min_cart_value ?? 0),
    scope:        row.scope ?? (row.product_id ? 'product' : 'all'),
    branchId:     row.branch_id ? (Number(row.branch_id) || row.branch_id) : null,
    syncStatus:   'SYNCED',
  };
}

/**
 * Load promotions from Supabase with offline IndexedDB fallback.
 * Merges local metadata (like branchId or minCartValue) with Supabase data.
 */
export async function loadPromotions() {
  const isOnline = checkIsOnline();

  if (isOnline) {
    try {
      const { data: serverPromos, error } = await supabase
        .from('promotions')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      // Get local promotions to preserve offline additions and local metadata
      const localPromos = await promotionsDB.getAll().catch(() => []);
      const localMap = new Map(localPromos.map((p) => [String(p.id), p]));

      const merged = (serverPromos ?? []).map((row) => {
        const mapped = mapPromotion(row);
        const cached = localMap.get(String(row.id));
        if (cached) {
          // Preserve local rich fields if not present in server table
          if (cached.branchId !== undefined && mapped.branchId === null) mapped.branchId = cached.branchId;
          if (cached.scope !== undefined) mapped.scope = cached.scope;
          if (cached.minCartValue !== undefined && mapped.minCartValue === 0) mapped.minCartValue = cached.minCartValue;
        }
        return mapped;
      });

      // Also keep any pending offline promotions that haven't synced yet
      for (const loc of localPromos) {
        if (loc.syncStatus === 'PENDING_SYNC' && !merged.some((m) => String(m.id) === String(loc.id))) {
          merged.push(loc);
        }
      }

      // Update IndexedDB cache
      for (const p of merged) {
        await promotionsDB.put(p).catch(() => {});
      }

      return merged;
    } catch (err) {
      console.warn('[promotionService] Failed to fetch from Supabase, using IndexedDB fallback:', err);
    }
  }

  // Fallback to IndexedDB
  const cached = await promotionsDB.getAll().catch(() => []);
  return cached;
}

/**
 * Save a promotion (create or edit)
 */
export async function savePromotion(promoData, forcedOnlineState) {
  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();
  const isEditing = Boolean(promoData.id && !String(promoData.id).startsWith('offline-'));

  const payload = {
    name:           (promoData.name || '').trim(),
    discount_type:  promoData.discountType || 'percent',
    discount_value: parseFloat(promoData.value) || 0,
    product_id:     promoData.scope === 'product' && promoData.productId ? Number(promoData.productId) : null,
    start_date:     promoData.startDate || null,
    end_date:       promoData.endDate || null,
    active:         promoData.active ?? true,
  };

  if (isOnline) {
    try {
      let savedRow;
      if (isEditing) {
        const { data, error } = await supabase
          .from('promotions')
          .update(payload)
          .eq('id', promoData.id)
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
      } else {
        const { data, error } = await supabase
          .from('promotions')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedRow = data;
      }

      const fullRecord = {
        ...mapPromotion(savedRow),
        branchId:     promoData.branchId ?? null,
        scope:        promoData.scope || 'all',
        minCartValue: parseFloat(promoData.minCartValue) || 0,
        syncStatus:   'SYNCED',
      };

      await promotionsDB.put(fullRecord);
      return fullRecord;
    } catch (err) {
      console.error('[promotionService] Online save failed, writing offline:', err);
    }
  }

  // Offline flow
  const offlineId = promoData.id ?? `offline-promo-${Date.now()}`;
  const offlineRecord = {
    id:           offlineId,
    name:         payload.name,
    discountType: payload.discount_type,
    value:        payload.discount_value,
    productId:    payload.product_id,
    startDate:    payload.start_date,
    endDate:      payload.end_date,
    active:       payload.active,
    minCartValue: parseFloat(promoData.minCartValue) || 0,
    scope:        promoData.scope || 'all',
    branchId:     promoData.branchId ?? null,
    syncStatus:   'PENDING_SYNC',
  };

  await promotionsDB.put(offlineRecord);
  await syncQueueDB.enqueue('promotion', offlineId, isEditing ? 'UPDATE' : 'CREATE').catch(() => {});
  return offlineRecord;
}

/**
 * Toggle active state of a promotion
 */
export async function togglePromotion(promo, forcedOnlineState) {
  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();
  const nextActive = !promo.active;

  if (isOnline && promo.id && !String(promo.id).startsWith('offline-')) {
    try {
      const { data, error } = await supabase
        .from('promotions')
        .update({ active: nextActive })
        .eq('id', promo.id)
        .select()
        .single();
      if (error) throw error;

      const updated = { ...promo, active: data.active, syncStatus: 'SYNCED' };
      await promotionsDB.put(updated);
      return updated;
    } catch (err) {
      console.warn('[promotionService] Online toggle failed, updating offline:', err);
    }
  }

  const updated = { ...promo, active: nextActive, syncStatus: 'PENDING_SYNC' };
  await promotionsDB.put(updated);
  await syncQueueDB.enqueue('promotion', promo.id, 'UPDATE').catch(() => {});
  return updated;
}

/**
 * Delete a promotion
 */
export async function deletePromotion(promoId, forcedOnlineState) {
  const isOnline = forcedOnlineState !== undefined ? forcedOnlineState : checkIsOnline();

  if (isOnline && !String(promoId).startsWith('offline-')) {
    try {
      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', promoId);
      if (error) throw error;
    } catch (err) {
      console.warn('[promotionService] Online delete failed, removing locally:', err);
    }
  }

  await promotionsDB.delete(promoId);
  await syncQueueDB.enqueue('promotion', promoId, 'DELETE').catch(() => {});
}

/**
 * Sync offline pending promotions to Supabase
 */
export async function syncOfflinePromotions() {
  if (!checkIsOnline()) return;

  const allLocal = await promotionsDB.getAll().catch(() => []);
  const pending = allLocal.filter((p) => p.syncStatus === 'PENDING_SYNC');

  for (const promo of pending) {
    try {
      const payload = {
        name:           (promo.name || '').trim(),
        discount_type:  promo.discountType || 'percent',
        discount_value: parseFloat(promo.value) || 0,
        product_id:     promo.productId ? Number(promo.productId) : null,
        start_date:     promo.startDate || null,
        end_date:       promo.endDate || null,
        active:         promo.active ?? true,
      };

      if (String(promo.id).startsWith('offline-')) {
        // Insert new
        const { data, error } = await supabase
          .from('promotions')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        // Clean up old offline ID and save synced row
        await promotionsDB.delete(promo.id);
        await promotionsDB.put({
          ...promo,
          id: data.id,
          syncStatus: 'SYNCED',
        });
      } else {
        // Update existing
        const { error } = await supabase
          .from('promotions')
          .update(payload)
          .eq('id', promo.id);
        if (error) throw error;

        await promotionsDB.put({ ...promo, syncStatus: 'SYNCED' });
      }
    } catch (err) {
      console.error('[promotionService] Failed to sync offline promotion:', promo.id, err);
    }
  }
}
