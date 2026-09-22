import { productsDB, stockDB, customersDB, promotionsDB, usersDB, billsDB, storesDB, loyaltyTiersDB } from './db.js';

const SEED_FLAG = 'retailsync_seeded_v4';

export async function seedIfNeeded() {
  if (localStorage.getItem(SEED_FLAG)) return false;

  await seedStores();
  await seedUsers();
  await seedProducts();
  await seedCustomers();
  await seedPromotions();
  await seedLoyaltyTiers();

  localStorage.setItem(SEED_FLAG, '1');
  return true;
}

// ─── Stores (Branches) ───────────────────────────────────────────────────────

async function seedStores() {
  const stores = [
    { id: 'store-a', name: 'Branch A — Main Market', password: 'branchA@123' },
    { id: 'store-b', name: 'Branch B — City Centre',  password: 'branchB@456' },
  ];
  for (const s of stores) await storesDB.put(s);
}

// ─── Users ──────────────────────────────────────────────────────────────────

async function seedUsers() {
  const users = [
    { id: 'u-001', userId: 'admin1',   name: 'Arjun Mehta',  role: 'Admin',   storeId: null,      password: 'Admin@9999' },
    { id: 'u-002', userId: 'manager1', name: 'Priya Sharma', role: 'Manager', storeId: 'store-a', password: null },
    { id: 'u-003', userId: 'cashier1', name: 'Ravi Kumar',   role: 'Cashier', storeId: 'store-a', password: null },
    { id: 'u-004', userId: 'staff1',   name: 'Sunita Rao',   role: 'Staff',   storeId: 'store-a', password: null },
    { id: 'u-005', userId: 'manager2', name: 'Vikram Singh', role: 'Manager', storeId: 'store-b', password: null },
    { id: 'u-006', userId: 'cashier2', name: 'Priya Rao',    role: 'Cashier', storeId: 'store-b', password: null },
    { id: 'u-007', userId: 'staff2',   name: 'Deepak Joshi', role: 'Staff',   storeId: 'store-b', password: null },
  ];
  for (const u of users) await usersDB.put(u);
}

// ─── Products + Stock ────────────────────────────────────────────────────────

async function seedProducts() {
  const products = [
    { id: 'p-001', name: 'Amul Taaza Milk 1L',       sku: 'MLK-001', price: 62,  category: 'Dairy',     stock: 42  },
    { id: 'p-002', name: 'Amul Butter 500g',          sku: 'MLK-002', price: 250, category: 'Dairy',     stock: 18  },
    { id: 'p-003', name: 'Britannia Brown Bread',     sku: 'BRD-014', price: 45,  category: 'Bakery',    stock: 8   },
    { id: 'p-004', name: 'Tata Salt 1kg',             sku: 'GRC-031', price: 28,  category: 'Grocery',   stock: 76  },
    { id: 'p-005', name: 'Fortune Sunflower Oil 1L', sku: 'OIL-019', price: 145, category: 'Grocery',   stock: 34  },
    { id: 'p-006', name: 'Parle-G Biscuits 400g',    sku: 'SNK-008', price: 40,  category: 'Snacks',    stock: 110 },
    { id: 'p-007', name: "Lay's Classic Salted",      sku: 'SNK-021', price: 20,  category: 'Snacks',    stock: 6   },
    { id: 'p-008', name: 'Surf Excel Matic 1kg',      sku: 'HOM-022', price: 235, category: 'Household', stock: 12  },
    { id: 'p-009', name: 'Colgate MaxFresh 150g',     sku: 'HOM-044', price: 88,  category: 'Household', stock: 29  },
    { id: 'p-010', name: 'Nescafé Classic 200g',      sku: 'BEV-011', price: 320, category: 'Beverages', stock: 22  },
    { id: 'p-011', name: 'Tropicana Orange 1L',       sku: 'BEV-033', price: 130, category: 'Beverages', stock: 15  },
    { id: 'p-012', name: "Haldiram's Bhujia 400g",    sku: 'SNK-055', price: 130, category: 'Snacks',    stock: 40  },
  ];
  for (const p of products) {
    await productsDB.put(p);
    await stockDB.put({ productId: p.id, quantity: p.stock, lastUpdated: new Date().toISOString() });
  }
}

// ─── Customers ───────────────────────────────────────────────────────────────
// loyaltyPoints now = visit count (number of completed purchases)

async function seedCustomers() {
  const customers = [
    // 7 visits → Gold tier (7+)
    { id: 'c-001', name: 'Deepa Nair',   phone: '9876543210', email: 'deepa@email.com',  purchaseHistory: [], loyaltyPoints: 7  },
    // 3 visits → Silver tier (3+)
    { id: 'c-002', name: 'Suresh Patel', phone: '9123456780', email: 'suresh@email.com', purchaseHistory: [], loyaltyPoints: 3  },
    { id: 'c-003', name: 'Meena Iyer',   phone: '9988776655', email: 'meena@email.com',  purchaseHistory: [], loyaltyPoints: 1  },
    { id: 'c-004', name: 'Karan Singh',  phone: '9001122334', email: 'karan@email.com',  purchaseHistory: [], loyaltyPoints: 0  },
    { id: 'c-005', name: 'Anita Joshi',  phone: '9443322110', email: 'anita@email.com',  purchaseHistory: [], loyaltyPoints: 0  },
  ];
  for (const c of customers) await customersDB.put(c);

  await billsDB.put({
    id: 'bill-seed-001',
    items: [
      { productId: 'p-001', name: 'Amul Taaza Milk 1L',     price: 62, qty: 2 },
      { productId: 'p-006', name: 'Parle-G Biscuits 400g', price: 40, qty: 1 },
    ],
    subtotal: 164, promoDiscount: 0, loyaltyDiscount: 0, discount: 0, total: 164,
    payment: 'Cash', customerPhone: '9876543210', customerId: 'c-001',
    cashierId: 'u-003', visitsAfter: 7,
    timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'SYNCED',
  });
  await customersDB.addPurchaseHistory('c-001', 'bill-seed-001');
}

// ─── Promotions ──────────────────────────────────────────────────────────────

async function seedPromotions() {
  const promotions = [
    { id: 'promo-001', name: '5% Off on ₹500+',   discountType: 'percent', value: 5,  minCartValue: 500,  scope: 'all', branchId: null, active: true,  createdBy: 'admin1' },
    { id: 'promo-002', name: '₹50 Off on ₹1000+', discountType: 'flat',   value: 50, minCartValue: 1000, scope: 'all', branchId: null, active: true,  createdBy: 'admin1' },
    { id: 'promo-003', name: '10% Festive Offer',   discountType: 'percent', value: 10, minCartValue: 0,  scope: 'all', branchId: null, active: false, createdBy: 'admin1' },
  ];
  for (const p of promotions) await promotionsDB.put(p);
}

// ─── Loyalty Tiers ────────────────────────────────────────────────────────────

async function seedLoyaltyTiers() {
  const tiers = [
    { id: 'lt-001', label: 'Silver', minVisits: 3, discountPercent: 5,  active: true  },
    { id: 'lt-002', label: 'Gold',   minVisits: 7, discountPercent: 10, active: true  },
  ];
  for (const t of tiers) await loyaltyTiersDB.put(t);
}

export function clearSeedFlag() {
  localStorage.removeItem(SEED_FLAG);
}
