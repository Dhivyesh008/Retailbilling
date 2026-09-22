/**
 * DBContext.jsx
 *
 * Global data provider — backed by Supabase with full offline IndexedDB caching.
 * All pages consume this context via useDB() and see the same live data,
 * whether online or completely disconnected.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  fetchProducts,
  fetchReturns,
} from '../services/supabaseService.js';
import { loadCustomers } from '../services/customerService.js';
import { loadAllBills } from '../services/billingService.js';
import { loadPromotions } from '../services/promotionService.js';
import { loyaltyTiersDB, productsDB } from '../db/db.js';

const DBContext = createContext(null);

export function DBProvider({ children }) {
  const [products,     setProducts]     = useState([]);
  const [customers,    setCustomers]    = useState([]);
  const [promotions,   setPromotions]   = useState([]);
  const [bills,        setBills]        = useState([]);
  const [returns,      setReturns]      = useState([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch products with offline fallback
      const prodsPromise = fetchProducts()
        .then(async (fetched) => {
          // Cache in IndexedDB for offline availability
          for (const p of fetched) {
            await productsDB.put(p).catch(() => {});
          }
          return fetched;
        })
        .catch(async (err) => {
          console.warn('[DBContext] Supabase fetchProducts failed, loading from local IndexedDB:', err);
          const cached = await productsDB.getAll().catch(() => []);
          return cached;
        });

      // 2. Fetch bills/sales combining Supabase and offline IndexedDB bills
      const billsPromise = loadAllBills().catch(() => []);

      // 3. Fetch customers with hybrid Supabase + IndexedDB support
      const custsPromise = loadCustomers().catch(() => []);

      // 4. Fetch returns, promotions, loyalty tiers
      const retsPromise   = fetchReturns().catch(() => []);
      const promosPromise = loadPromotions().catch(() => []);
      const tiersPromise  = loyaltyTiersDB.getAll().catch(() => []);

      const [prods, custs, allBills, rets, promos, tiers] = await Promise.all([
        prodsPromise,
        custsPromise,
        billsPromise,
        retsPromise,
        promosPromise,
        tiersPromise,
      ]);

      setProducts(prods);
      setCustomers(custs);
      setBills(allBills.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      setReturns(rets);
      setPromotions(promos);
      setLoyaltyTiers(tiers.sort((a, b) => b.minVisits - a.minVisits));
    } catch (err) {
      console.error('[DBContext] Failed to load data:', err);
      setError(err.message ?? 'Failed to connect to database');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => { refresh(); }, [refresh]);

  // Derived / filtered views
  const lowStockProducts   = products.filter((p) => p.stock <= 10);
  const activePromotions   = promotions.filter((p) => p.active);
  const activeLoyaltyTiers = loyaltyTiers.filter((t) => t.active);

  return (
    <DBContext.Provider value={{
      products, customers, promotions, activePromotions,
      bills, returns, loyaltyTiers, activeLoyaltyTiers,
      loading, error, refresh, lowStockProducts,
      stock: Object.fromEntries(products.map((p) => [p.id, p.stock])),
    }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be inside DBProvider');
  return ctx;
}
