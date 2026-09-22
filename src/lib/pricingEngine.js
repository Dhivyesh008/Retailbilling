/**
 * src/lib/pricingEngine.js
 *
 * RetailSync - Rules-Based Pricing Engine.
 * Pure function - reads inputs, returns recommendation objects.
 * All writes to IndexedDB are done in the caller (PricingRules.jsx).
 */

// Constants

export const RULE_TYPES = [
  { value: 'expiry',           label: 'Expiry-based Discount' },
  { value: 'slowSales',        label: 'Slow Sales Discount' },
  { value: 'excessInventory',  label: 'Excess Inventory / Bundle' },
  { value: 'timeOfDay',        label: 'Time of Day Discount' },
  { value: 'demand',           label: 'High Demand - Replenish Alert' },
  { value: 'festivalSeason',   label: 'Festival Season Discount' },
];

export const ACTION_TYPES = [
  { value: 'percentDiscount',       label: 'Percent Discount (%)' },
  { value: 'flatDiscount',          label: 'Flat Discount (Rs)' },
  { value: 'bundleDiscount',        label: 'Bundle Discount' },
  { value: 'replenishmentPriority', label: 'Replenishment Priority (Informational)' },
];

export const DEFAULT_PARAMS = {
  expiry:          { daysBeforeExpiry: 15, discountPercent: 10 },
  slowSales:       { minDailyRate: 0.5, overDays: 7, actionType: 'percentDiscount', actionValue: 10 },
  excessInventory: { excessMultiplier: 3, relatedProductIds: [] },
  timeOfDay:       { category: '', afterHour: 19, discountPercent: 5 },
  demand:          { spikeThreshold: 2.0, lookbackDays: 3, compareDays: 7 },
  festivalSeason:  {
    festivals: [
      { name: 'Diwali',     startDate: '2026-10-20', endDate: '2026-10-24' },
      { name: 'Christmas',  startDate: '2026-12-24', endDate: '2026-12-26' },
      { name: 'New Year',   startDate: '2026-12-31', endDate: '2027-01-02' },
    ],
    discountPercent: 10,
    category: '',
  },
};

// Helpers

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysDiff(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function computeAvgDailyRate(productId, bills, overDays) {
  const pid = String(productId);
  const cutoff = new Date(Date.now() - overDays * 24 * 60 * 60 * 1000);
  let total = 0;
  for (const bill of bills) {
    const status = (bill.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'void') continue;
    const ts = bill.timestamp;
    const billDate = new Date(
      typeof ts === 'string' && ts.includes('T') && !ts.endsWith('Z') ? ts + 'Z' : ts
    );
    if (billDate < cutoff) continue;
    for (const item of (bill.items || [])) {
      if (String(item.productId) === pid) total += parseInt(item.qty, 10) || 0;
    }
  }
  return total / overDays;
}

function dedupKey(ruleId, productIds) {
  return ruleId + '__' + [...productIds].sort().join(',');
}

function actionLabel(actionType, actionValue) {
  if (actionType === 'percentDiscount')       return actionValue + '% off';
  if (actionType === 'flatDiscount')          return 'Rs' + actionValue + ' off';
  if (actionType === 'bundleDiscount')        return 'Bundle: ' + actionValue + '% off';
  if (actionType === 'replenishmentPriority') return 'Replenishment Priority';
  return String(actionValue);
}

function makeId() {
  return 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

// Main Engine

export function runPricingAnalysis({
  rules = [],
  products = [],
  bills = [],
  stores = [],
  currentBranch = null,
  existingRecs = [],
}) {
  const now = new Date();
  const nowHour = now.getHours();

  const existingKeys = new Set(
    existingRecs
      .filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'APPROVED')
      .map((r) => dedupKey(r.ruleId, r.productIds || []))
  );

  const storeMap = new Map(stores.map((s) => [String(s.id), s.name || 'Branch ' + s.id]));
  const newRecs = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const ruleBranch = rule.branchScope === 'all' ? null : rule.branchScope;
    const scopedProducts = products.filter((p) =>
      !ruleBranch || String(p.storeId) === String(ruleBranch)
    );
    const p = rule.params || {};

    if (rule.type === 'expiry') {
      const daysBeforeExpiry = Number(p.daysBeforeExpiry ?? 15);
      const discountPercent  = Number(p.discountPercent ?? 10);
      for (const product of scopedProducts) {
        if (!product.expiryDate) continue;
        const expiry = parseDate(product.expiryDate);
        if (!expiry) continue;
        const daysUntilExpiry = daysDiff(expiry, now);
        if (daysUntilExpiry > daysBeforeExpiry || daysUntilExpiry < 0) continue;
        const key = dedupKey(rule.id, [product.id]);
        if (existingKeys.has(key)) continue;
        newRecs.push({
          id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
          productIds: [product.id], productNames: [product.name],
          reason: 'Expires in ' + daysUntilExpiry + ' day' + (daysUntilExpiry !== 1 ? 's' : '') + ' (' + product.expiryDate + ')',
          actionType: 'percentDiscount', actionValue: discountPercent,
          actionLabel: discountPercent + '% off',
          branchId: ruleBranch ?? (product.storeId ? String(product.storeId) : null),
          branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
          status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
          reviewedBy: null, reviewedAt: null, promotionId: null,
        });
        existingKeys.add(key);
      }
    }

    if (rule.type === 'slowSales') {
      const minDailyRate = Number(p.minDailyRate ?? 0.5);
      const overDays     = Number(p.overDays ?? 7);
      const actionType   = p.actionType ?? 'percentDiscount';
      const actionValue  = Number(p.actionValue ?? 10);
      for (const product of scopedProducts) {
        const rate = computeAvgDailyRate(product.id, bills, overDays);
        if (rate === 0 || rate >= minDailyRate) continue;
        const key = dedupKey(rule.id, [product.id]);
        if (existingKeys.has(key)) continue;
        newRecs.push({
          id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
          productIds: [product.id], productNames: [product.name],
          reason: 'Avg daily sales ' + rate.toFixed(2) + ' units/day - below threshold of ' + minDailyRate + ' over ' + overDays + ' days',
          actionType, actionValue, actionLabel: actionLabel(actionType, actionValue),
          branchId: ruleBranch ?? (product.storeId ? String(product.storeId) : null),
          branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
          status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
          reviewedBy: null, reviewedAt: null, promotionId: null,
        });
        existingKeys.add(key);
      }
    }

    if (rule.type === 'excessInventory') {
      const excessMultiplier  = Number(p.excessMultiplier ?? 3);
      const relatedProductIds = (p.relatedProductIds || []).map(String);
      const actionValue       = Number(rule.actionValue ?? 10);
      if (relatedProductIds.length < 2) continue;
      const relatedProducts = relatedProductIds
        .map((pid) => scopedProducts.find((pr) => String(pr.id) === pid))
        .filter(Boolean);
      if (relatedProducts.length < relatedProductIds.length) continue;
      const allExcess = relatedProducts.every((pr) => pr.stock >= (pr.reorder ?? 5) * excessMultiplier);
      if (!allExcess) continue;
      const key = dedupKey(rule.id, relatedProductIds);
      if (existingKeys.has(key)) continue;
      newRecs.push({
        id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
        productIds: relatedProductIds, productNames: relatedProducts.map((pr) => pr.name),
        reason: 'All bundle products have stock >= ' + excessMultiplier + 'x reorder threshold',
        actionType: 'bundleDiscount', actionValue,
        actionLabel: 'Bundle: ' + actionValue + '% off',
        branchId: ruleBranch,
        branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
        status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
        reviewedBy: null, reviewedAt: null, promotionId: null,
      });
      existingKeys.add(key);
    }

    if (rule.type === 'timeOfDay') {
      const category        = (p.category || '').toLowerCase().trim();
      const afterHour       = Number(p.afterHour ?? 19);
      const discountPercent = Number(p.discountPercent ?? 5);
      if (nowHour < afterHour) continue;
      const categoryProducts = category
        ? scopedProducts.filter((pr) => (pr.category || '').toLowerCase().trim() === category)
        : scopedProducts;
      if (!categoryProducts.length) continue;
      const productIds = categoryProducts.map((pr) => String(pr.id));
      const key = dedupKey(rule.id, productIds);
      if (existingKeys.has(key)) continue;
      const afterTimeStr = String(afterHour).padStart(2, '0') + ':00';
      newRecs.push({
        id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
        productIds, productNames: categoryProducts.map((pr) => pr.name),
        reason: 'Time-of-day discount for "' + (category || 'all categories') + '" after ' + afterTimeStr + ' - once approved, applies daily',
        actionType: 'percentDiscount', actionValue: discountPercent,
        actionLabel: discountPercent + '% off after ' + afterTimeStr,
        branchId: ruleBranch,
        branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
        isStanding: true,
        status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
        reviewedBy: null, reviewedAt: null, promotionId: null,
      });
      existingKeys.add(key);
    }

    if (rule.type === 'demand') {
      const spikeThreshold = Number(p.spikeThreshold ?? 2.0);
      const lookbackDays   = Number(p.lookbackDays ?? 3);
      const compareDays    = Number(p.compareDays ?? 7);
      for (const product of scopedProducts) {
        const recentRate   = computeAvgDailyRate(product.id, bills, lookbackDays);
        const historicRate = computeAvgDailyRate(product.id, bills, compareDays);
        if (historicRate <= 0 || recentRate <= 0) continue;
        if (recentRate / historicRate < spikeThreshold) continue;
        const key = dedupKey(rule.id, [product.id]);
        if (existingKeys.has(key)) continue;
        newRecs.push({
          id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
          productIds: [product.id], productNames: [product.name],
          reason: 'Sales spike: ' + recentRate.toFixed(2) + ' units/day (last ' + lookbackDays + 'd) vs ' + historicRate.toFixed(2) + ' units/day (prior ' + compareDays + 'd) - ' + (recentRate / historicRate).toFixed(1) + 'x increase',
          actionType: 'replenishmentPriority', actionValue: 0,
          actionLabel: 'Replenishment Priority',
          branchId: ruleBranch ?? (product.storeId ? String(product.storeId) : null),
          branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
          isInformational: true,
          status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
          reviewedBy: null, reviewedAt: null, promotionId: null,
        });
        existingKeys.add(key);
      }
    }

    if (rule.type === 'festivalSeason') {
      const festivals       = p.festivals || [];
      const discountPercent = Number(p.discountPercent ?? 10);
      const category        = (p.category || '').toLowerCase().trim();
      const activeFestival = festivals.find((f) => {
        const start = parseDate(f.startDate);
        const end   = parseDate(f.endDate);
        if (!start || !end) return false;
        return now >= start && now <= new Date(end.getTime() + 86400000 - 1);
      });
      if (!activeFestival) continue;
      const targetProducts = category
        ? scopedProducts.filter((pr) => (pr.category || '').toLowerCase().trim() === category)
        : scopedProducts;
      if (!targetProducts.length) continue;
      const productIds = targetProducts.map((pr) => String(pr.id));
      const key = dedupKey(rule.id, productIds);
      if (existingKeys.has(key)) continue;
      newRecs.push({
        id: makeId(), ruleId: rule.id, sourceRuleName: rule.name,
        productIds, productNames: targetProducts.map((pr) => pr.name),
        reason: activeFestival.name + ' season (' + activeFestival.startDate + ' - ' + activeFestival.endDate + ') - ' + (category || 'store-wide') + ' discount',
        actionType: 'percentDiscount', actionValue: discountPercent,
        actionLabel: discountPercent + '% off (' + activeFestival.name + ')',
        branchId: ruleBranch,
        branchName: ruleBranch ? (storeMap.get(String(ruleBranch)) ?? ruleBranch) : 'All Branches',
        status: 'PENDING_APPROVAL', generatedAt: now.toISOString(),
        reviewedBy: null, reviewedAt: null, promotionId: null,
      });
      existingKeys.add(key);
    }
  }

  return newRecs;
}
