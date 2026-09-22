import Dexie from 'dexie';
import { isToday } from '../lib/dateUtils.js';

export const db = new Dexie('retailsync-db');

// Version 7: Full Dexie-native schema matching existing tables and indexes
db.version(7).stores({
  products:             'id, category, sku',
  stock:                'productId',
  customers:            'id, phone, email',
  promotions:           'id, active',
  users:                'id, role',
  bills:                'id, customerId, cashierId, timestamp, status',
  returns:              'id, billId, status',
  syncQueue:            'id, status, entityType',
  stores:               'id',
  loyaltyTiers:         'id, minVisits',
  pricingRules:         'id, type, active, branchScope',
  priceRecommendations: 'id, status, ruleId',
});

// Backward-compatible getDB helper
export async function getDB() {
  await db.open();
  return db;
}

// ─── Products ────────────────────────────────────────────────────────────────
export const productsDB = {
  getAll:        () => db.products.toArray(),
  getById:       (id) => db.products.get(id),
  put:           (product) => db.products.put(product),
  delete:        (id) => db.products.delete(id),
  getByCategory: (cat) => db.products.where('category').equals(cat).toArray(),
};

// ─── Stock ───────────────────────────────────────────────────────────────────
export const stockDB = {
  getAll:         () => db.stock.toArray(),
  getByProductId: (productId) => db.stock.get(productId),
  put:            (stockItem) => db.stock.put(stockItem),
  adjustStock: async (productId, delta) => {
    return db.transaction('rw', db.stock, async () => {
      const existing = await db.stock.get(productId);
      if (existing) {
        existing.quantity = Math.max(0, (existing.quantity || 0) + delta);
        existing.lastUpdated = new Date().toISOString();
        await db.stock.put(existing);
      }
    });
  },
};

// ─── Customers ───────────────────────────────────────────────────────────────
export const customersDB = {
  getAll:  () => db.customers.toArray(),
  getById: (id) => db.customers.get(id),
  put:     (customer) => db.customers.put(customer),
  delete:  (id) => db.customers.delete(id),

  /** Look up a customer by phone number. Returns null if not found. */
  getByPhone: async (phone) => {
    const results = await db.customers.where('phone').equals(phone).toArray();
    return results[0] ?? null;
  },

  /** Add a bill ID to purchase history AND increment loyaltyPoints atomically. */
  recordSale: async (customerId, billId, pointsEarned) => {
    return db.transaction('rw', db.customers, async () => {
      const cust = await db.customers.get(customerId);
      if (cust) {
        cust.purchaseHistory = [...(cust.purchaseHistory || []), billId];
        cust.loyaltyPoints = (cust.loyaltyPoints ?? 0) + pointsEarned;
        await db.customers.put(cust);
      }
      return cust;
    });
  },

  /** Legacy helper kept for backwards compat (Returns page uses it). */
  addPurchaseHistory: async (customerId, billId) => {
    return db.transaction('rw', db.customers, async () => {
      const cust = await db.customers.get(customerId);
      if (cust) {
        cust.purchaseHistory = [...(cust.purchaseHistory || []), billId];
        await db.customers.put(cust);
      }
    });
  },
};

// ─── Promotions ──────────────────────────────────────────────────────────────
export const promotionsDB = {
  getAll:    () => db.promotions.toArray(),
  getById:   (id) => db.promotions.get(id),
  getActive: async () => {
    const all = await db.promotions.toArray();
    return all.filter((p) => p.active);
  },
  put:       (promo) => db.promotions.put(promo),
  delete:    (id) => db.promotions.delete(id),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersDB = {
  getAll:      () => db.users.toArray(),
  getById:     (id) => db.users.get(id),
  getByRole:   (role) => db.users.where('role').equals(role).toArray(),
  validatePin: async (role, pin) => {
    const all = await db.users.toArray();
    return all.find((u) => u.role === role && u.pin === pin) || null;
  },
  put:         (user) => db.users.put(user),
};

// ─── Bills ───────────────────────────────────────────────────────────────────
export const billsDB = {
  getAll:         () => db.bills.toArray(),
  getById:        (id) => db.bills.get(id),
  put:            (bill) => db.bills.put(bill),
  delete:         (id) => db.bills.delete(id),
  getByCustomer:  (customerId) => db.bills.where('customerId').equals(customerId).toArray(),
  getPending: async () => {
    const all = await db.bills.toArray();
    return all.filter((b) => b.status === 'PENDING_SYNC');
  },
  getTodaysBills: async () => {
    const all = await db.bills.toArray();
    return all.filter((b) => isToday(b.timestamp) && b.status !== 'cancelled');
  },
};

// ─── Returns ─────────────────────────────────────────────────────────────────
export const returnsDB = {
  getAll:    () => db.returns.toArray(),
  getById:   (id) => db.returns.get(id),
  put:       (ret) => db.returns.put(ret),
  getByBill: (billId) => db.returns.where('billId').equals(billId).toArray(),
};

// ─── Sync Queue ───────────────────────────────────────────────────────────────
export const syncQueueDB = {
  getAll:     () => db.syncQueue.toArray(),
  getById:    (id) => db.syncQueue.get(id),
  put:        (item) => db.syncQueue.put(item),
  getPending: async () => {
    const all = await db.syncQueue.toArray();
    return all.filter((q) => q.status === 'PENDING_SYNC');
  },
  enqueue: async (entityType, entityId, action) => {
    const item = {
      id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entityType,
      entityId,
      action,
      timestamp: new Date().toISOString(),
      status: 'PENDING_SYNC',
    };
    await db.syncQueue.put(item);
    return item;
  },
  markSynced: async (id) => {
    const item = await db.syncQueue.get(id);
    if (item) {
      item.status = 'SYNCED';
      await db.syncQueue.put(item);
    }
  },
};

// ─── Stores (Branches) ────────────────────────────────────────────────────────
export const storesDB = {
  getAll: () => db.stores.toArray(),
  getById: (id) => db.stores.get(id),
  put: (store) => db.stores.put(store),
  /** Returns the store record if password matches, else null. */
  validatePassword: async (storeId, password) => {
    const store = await db.stores.get(storeId);
    if (!store) return null;
    return store.password === password ? store : null;
  },
};

// ─── Users (extended) ─────────────────────────────────────────────────────────
export async function getUserByUserId(userId) {
  const all = await db.users.toArray();
  return all.find((u) => u.userId === userId) ?? null;
}

// ─── Loyalty Tiers ────────────────────────────────────────────────────────────
export const loyaltyTiersDB = {
  getAll: () => db.loyaltyTiers.toArray(),
  getById: (id) => db.loyaltyTiers.get(id),
  put: (tier) => db.loyaltyTiers.put(tier),
  delete: (id) => db.loyaltyTiers.delete(id),
  getActive: async () => {
    const all = await db.loyaltyTiers.toArray();
    return all
      .filter((t) => t.active)
      .sort((a, b) => b.minVisits - a.minVisits); // descending — first match wins
  },
};

// ─── Pricing Rules ────────────────────────────────────────────────────────────
export const pricingRulesDB = {
  getAll:    () => db.pricingRules.toArray(),
  getById:   (id) => db.pricingRules.get(id),
  put:       (rule) => db.pricingRules.put(rule),
  delete:    (id) => db.pricingRules.delete(id),
  getActive: async () => {
    const all = await db.pricingRules.toArray();
    return all.filter((r) => r.active);
  },
};

// ─── Price Recommendations ────────────────────────────────────────────────────
export const priceRecommendationsDB = {
  getAll:    () => db.priceRecommendations.toArray(),
  getById:   (id) => db.priceRecommendations.get(id),
  put:       (rec) => db.priceRecommendations.put(rec),
  delete:    (id) => db.priceRecommendations.delete(id),
  getPending: async () => {
    const all = await db.priceRecommendations.toArray();
    return all.filter((r) => r.status === 'PENDING_APPROVAL');
  },
  getByStatus: async (status) => {
    const all = await db.priceRecommendations.toArray();
    return all.filter((r) => r.status === status);
  },
  getByRule: async (ruleId) => {
    const all = await db.priceRecommendations.toArray();
    return all.filter((r) => r.ruleId === ruleId);
  },
  /** Returns all non-rejected recommendations (PENDING + APPROVED) */
  getActive: async () => {
    const all = await db.priceRecommendations.toArray();
    return all.filter((r) => r.status !== 'REJECTED');
  },
};
