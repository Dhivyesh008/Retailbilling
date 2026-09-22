/**
 * src/lib/stockPrediction.js
 *
 * RetailSync — Predictive Low-Stock Alerts calculation.
 * Pure math, no ML, no backend — recomputes live from local data.
 */
import { parseTimestamp } from './dateUtils.js';

// Configuration constants: easy to tune without touching UI code
export const PREDICTION_CONFIG = {
  LOOKBACK_DAYS: 7,
  ALERT_THRESHOLD_DAYS: 5,
};

/**
 * Computes predictive low-stock alerts.
 *
 * For each product, per store:
 * 1. Sum quantity sold from `bills` over the last 7 days for that product at that store → `totalQtySold`
 * 2. `avgDailyRate = totalQtySold / 7`
 * 3. Get current stock for that product at that store
 * 4. `daysRemaining = avgDailyRate > 0 ? Math.floor(currentStock / avgDailyRate) : null`
 *    - null: not enough recent sales to estimate (exclude)
 * 5. Flag as an alert if `daysRemaining <= 5`
 * 6. Sort ascending — most urgent (soonest to run out) first
 *
 * @param {Object} params
 * @param {Array} params.products - Products list ({ id, name, sku, stock, storeId, ... })
 * @param {Array} params.bills - Bills list ({ storeId, timestamp, status, items: [...] })
 * @param {Array} [params.stores=[]] - Stores list ({ id, name, ... })
 * @param {string|number|null} [params.branchId=null] - Selected branch filter (null or 'ALL' for all branches)
 * @returns {Array<Object>} Flagged alerts sorted ascending by daysRemaining
 */
export function computePredictiveStockAlerts({
  products = [],
  bills = [],
  stores = [],
  branchId = null,
}) {
  const now = new Date();
  const lookbackCutoff = new Date(
    now.getTime() - PREDICTION_CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  // Store lookup map for branch names
  const storeMap = new Map();
  for (const s of stores) {
    if (s && s.id !== undefined && s.id !== null) {
      storeMap.set(String(s.id), s.name || `Branch ${s.id}`);
    }
  }

  // Filter bills to active ones in the last 7 days
  const recentBills = (bills || []).filter((b) => {
    if (!b) return false;
    const status = (b.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'void') return false;
    const billDate = parseTimestamp(b.timestamp);
    return billDate >= lookbackCutoff;
  });

  // Aggregate quantity sold per (productId, storeId)
  // Also track per productId across stores in case bills or products lack storeId
  const storeProductSales = new Map(); // `${productId}__${storeId}` -> qty
  const globalProductSales = new Map(); // `${productId}` -> qty

  for (const bill of recentBills) {
    const billStore = bill.storeId ? String(bill.storeId) : '';
    for (const item of (bill.items || [])) {
      if (!item || !item.productId) continue;
      const pid = String(item.productId);
      const qty = parseInt(item.qty, 10) || 0;
      if (qty <= 0) continue;

      if (billStore) {
        const key = `${pid}__${billStore}`;
        storeProductSales.set(key, (storeProductSales.get(key) || 0) + qty);
      }
      globalProductSales.set(pid, (globalProductSales.get(pid) || 0) + qty);
    }
  }

  const alerts = [];

  for (const product of products || []) {
    if (!product || !product.id) continue;
    const pid = String(product.id);
    const pStoreId = product.storeId ? String(product.storeId) : '';

    // If a branch filter is specified (and not 'ALL'), skip products not in that branch
    if (branchId && branchId !== 'ALL') {
      const targetBranch = String(branchId);
      // If product has a storeId, ensure it matches
      if (pStoreId && pStoreId !== targetBranch) {
        continue;
      }
    }

    // 1. Sum quantity sold from bills over the last 7 days for that product at that store
    let totalQtySold = 0;
    if (pStoreId) {
      totalQtySold = storeProductSales.get(`${pid}__${pStoreId}`) ?? 0;
      // If store-specific sales are 0, check if bills were logged with empty storeId
      if (totalQtySold === 0 && globalProductSales.has(pid)) {
        totalQtySold = globalProductSales.get(pid) || 0;
      }
    } else {
      totalQtySold = globalProductSales.get(pid) ?? 0;
    }

    // 2. avgDailyRate = totalQtySold / 7
    const avgDailyRate = totalQtySold / PREDICTION_CONFIG.LOOKBACK_DAYS;

    // 3. Get current stock for that product at that store
    const currentStock = Math.max(0, parseInt(product.stock ?? 0, 10));

    // 4. daysRemaining = avgDailyRate > 0 ? Math.floor(currentStock / avgDailyRate) : null
    // null = not enough recent sales to estimate — exclude from alerts
    if (avgDailyRate <= 0) {
      continue;
    }

    const daysRemaining = Math.floor(currentStock / avgDailyRate);

    // 5. Flag as an alert if daysRemaining <= 5
    if (daysRemaining <= PREDICTION_CONFIG.ALERT_THRESHOLD_DAYS) {
      let urgency = 'yellow';
      let urgencyLabel = 'Keep an eye on it';

      if (daysRemaining <= 1) {
        urgency = 'red';
        urgencyLabel = 'Restock today';
      } else if (daysRemaining <= 3) {
        urgency = 'orange';
        urgencyLabel = 'Restock soon';
      }

      const storeName =
        storeMap.get(pStoreId) ||
        (pStoreId ? `Branch ${pStoreId}` : stores[0]?.name || 'Main Branch');

      alerts.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        category: product.category || '',
        currentStock,
        totalQtySold,
        avgDailyRate,
        formattedRate:
          avgDailyRate >= 10
            ? Math.round(avgDailyRate).toString()
            : avgDailyRate.toFixed(1),
        daysRemaining: Math.max(0, daysRemaining),
        urgency,
        urgencyLabel,
        storeId: pStoreId,
        storeName,
      });
    }
  }

  // 6. Sort ascending — most urgent (soonest to run out) first
  alerts.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    // Secondary sort: lower stock first, then product name
    if (a.currentStock !== b.currentStock) {
      return a.currentStock - b.currentStock;
    }
    return a.productName.localeCompare(b.productName);
  });

  return alerts;
}
