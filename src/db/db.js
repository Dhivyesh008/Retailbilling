import { openDB } from 'idb';

const DB_NAME = 'retailsync-db';
const DB_VERSION = 3;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // products
        if (!db.objectStoreNames.contains('products')) {
          const ps = db.createObjectStore('products', { keyPath: 'id' });
          ps.createIndex('by-category', 'category');
          ps.createIndex('by-sku', 'sku', { unique: true });
        }
        // stock
        if (!db.objectStoreNames.contains('stock')) {
          const ss = db.createObjectStore('stock', { keyPath: 'productId' });
          ss.createIndex('by-productId', 'productId');
        }
        // customers
        if (!db.objectStoreNames.contains('customers')) {
          const cs = db.createObjectStore('customers', { keyPath: 'id' });
          cs.createIndex('by-phone', 'phone');
          cs.createIndex('by-email', 'email');
        }
        // promotions
        if (!db.objectStoreNames.contains('promotions')) {
          db.createObjectStore('promotions', { keyPath: 'id' });
        }
        // users
        if (!db.objectStoreNames.contains('users')) {
          const us = db.createObjectStore('users', { keyPath: 'id' });
          us.createIndex('by-role', 'role');
        }
        // bills
        if (!db.objectStoreNames.contains('bills')) {
          const bs = db.createObjectStore('bills', { keyPath: 'id' });
          bs.createIndex('by-customerId', 'customerId');
          bs.createIndex('by-cashierId', 'cashierId');
          bs.createIndex('by-timestamp', 'timestamp');
          bs.createIndex('by-status', 'status');
        }
        // returns
        if (!db.objectStoreNames.contains('returns')) {
          const rs = db.createObjectStore('returns', { keyPath: 'id' });
          rs.createIndex('by-billId', 'billId');
          rs.createIndex('by-status', 'status');
        }
        // syncQueue
        if (!db.objectStoreNames.contains('syncQueue')) {
          const sq = db.createObjectStore('syncQueue', { keyPath: 'id' });
          sq.createIndex('by-status', 'status');
          sq.createIndex('by-entityType', 'entityType');
        }
        // stores (branches)
        if (!db.objectStoreNames.contains('stores')) {
          db.createObjectStore('stores', { keyPath: 'id' });
        }
        // loyaltyTiers
        if (!db.objectStoreNames.contains('loyaltyTiers')) {
          const lt = db.createObjectStore('loyaltyTiers', { keyPath: 'id' });
          lt.createIndex('by-minVisits', 'minVisits');
        }
      },
    });
  }
  return dbPromise;
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

async function getAll(store) {
  const db = await getDB();
  return db.getAll(store);
}

async function getById(store, id) {
  const db = await getDB();
  return db.get(store, id);
}

async function put(store, item) {
  const db = await getDB();
  return db.put(store, item);
}

async function del(store, id) {
  const db = await getDB();
  return db.delete(store, id);
}

async function getAllByIndex(store, index, value) {
  const db = await getDB();
  return db.getAllFromIndex(store, index, value);
}

// ─── Products ────────────────────────────────────────────────────────────────
export const productsDB = {
  getAll: () => getAll('products'),
  getById: (id) => getById('products', id),
  put: (product) => put('products', product),
  delete: (id) => del('products', id),
  getByCategory: (cat) => getAllByIndex('products', 'by-category', cat),
};

// ─── Stock ───────────────────────────────────────────────────────────────────
export const stockDB = {
  getAll: () => getAll('stock'),
  getByProductId: (productId) => getById('stock', productId),
  put: (stockItem) => put('stock', stockItem),
  adjustStock: async (productId, delta) => {
    const db = await getDB();
    const tx = db.transaction('stock', 'readwrite');
    const existing = await tx.store.get(productId);
    if (existing) {
      existing.quantity = Math.max(0, existing.quantity + delta);
      existing.lastUpdated = new Date().toISOString();
      await tx.store.put(existing);
    }
    await tx.done;
  },
};

// ─── Customers ───────────────────────────────────────────────────────────────
export const customersDB = {
  getAll: () => getAll('customers'),
  getById: (id) => getById('customers', id),
  put: (customer) => put('customers', customer),

  /** Look up a customer by phone number. Returns null if not found. */
  getByPhone: async (phone) => {
    const db = await getDB();
    const results = await db.getAllFromIndex('customers', 'by-phone', phone);
    return results[0] ?? null;
  },

  /** Add a bill ID to purchase history AND increment loyaltyPoints atomically. */
  recordSale: async (customerId, billId, pointsEarned) => {
    const db = await getDB();
    const tx = db.transaction('customers', 'readwrite');
    const cust = await tx.store.get(customerId);
    if (cust) {
      cust.purchaseHistory = [...(cust.purchaseHistory || []), billId];
      cust.loyaltyPoints = (cust.loyaltyPoints ?? 0) + pointsEarned;
      await tx.store.put(cust);
    }
    await tx.done;
    return cust;
  },

  /** Legacy helper kept for backwards compat (Returns page uses it). */
  addPurchaseHistory: async (customerId, billId) => {
    const db = await getDB();
    const tx = db.transaction('customers', 'readwrite');
    const cust = await tx.store.get(customerId);
    if (cust) {
      cust.purchaseHistory = [...(cust.purchaseHistory || []), billId];
      await tx.store.put(cust);
    }
    await tx.done;
  },
};

// ─── Promotions ──────────────────────────────────────────────────────────────
export const promotionsDB = {
  getAll: () => getAll('promotions'),
  getById: (id) => getById('promotions', id),
  getActive: async () => {
    const all = await getAll('promotions');
    return all.filter((p) => p.active);
  },
  put: (promo) => put('promotions', promo),
  delete: (id) => del('promotions', id),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersDB = {
  getAll: () => getAll('users'),
  getById: (id) => getById('users', id),
  getByRole: (role) => getAllByIndex('users', 'by-role', role),
  validatePin: async (role, pin) => {
    const db = await getDB();
    const all = await db.getAll('users');
    return all.find((u) => u.role === role && u.pin === pin) || null;
  },
  put: (user) => put('users', user),
};

// ─── Bills ───────────────────────────────────────────────────────────────────
export const billsDB = {
  getAll: () => getAll('bills'),
  getById: (id) => getById('bills', id),
  put: (bill) => put('bills', bill),
  getByCustomer: (customerId) => getAllByIndex('bills', 'by-customerId', customerId),
  getPending: async () => {
    const all = await getAll('bills');
    return all.filter((b) => b.status === 'PENDING_SYNC');
  },
  getTodaysBills: async () => {
    const all = await getAll('bills');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return all.filter((b) => new Date(b.timestamp) >= todayStart);
  },
};

// ─── Returns ─────────────────────────────────────────────────────────────────
export const returnsDB = {
  getAll: () => getAll('returns'),
  getById: (id) => getById('returns', id),
  put: (ret) => put('returns', ret),
  getByBill: (billId) => getAllByIndex('returns', 'by-billId', billId),
};

// ─── Sync Queue ───────────────────────────────────────────────────────────────
export const syncQueueDB = {
  getAll: () => getAll('syncQueue'),
  getById: (id) => getById('syncQueue', id),
  put: (item) => put('syncQueue', item),
  getPending: async () => {
    const all = await getAll('syncQueue');
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
    await put('syncQueue', item);
    return item;
  },
  markSynced: async (id) => {
    const db = await getDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const item = await tx.store.get(id);
    if (item) {
      item.status = 'SYNCED';
      await tx.store.put(item);
    }
    await tx.done;
  },
};

// ─── Stores (Branches) ────────────────────────────────────────────────────────
export const storesDB = {
  getAll: () => getAll('stores'),
  getById: (id) => getById('stores', id),
  put: (store) => put('stores', store),
  /** Returns the store record if password matches, else null. */
  validatePassword: async (storeId, password) => {
    const store = await getById('stores', storeId);
    if (!store) return null;
    return store.password === password ? store : null;
  },
};

// ─── Users (extended) ─────────────────────────────────────────────────────────
// New helper: look up user by userId string (e.g. "cashier1")
export async function getUserByUserId(userId) {
  const db = await getDB();
  const all = await db.getAll('users');
  return all.find((u) => u.userId === userId) ?? null;
}

// ─── Loyalty Tiers ────────────────────────────────────────────────────────────
export const loyaltyTiersDB = {
  getAll: () => getAll('loyaltyTiers'),
  getById: (id) => getById('loyaltyTiers', id),
  put: (tier) => put('loyaltyTiers', tier),
  delete: (id) => del('loyaltyTiers', id),
  getActive: async () => {
    const all = await getAll('loyaltyTiers');
    return all
      .filter((t) => t.active)
      .sort((a, b) => b.minVisits - a.minVisits); // descending — first match wins
  },
};
