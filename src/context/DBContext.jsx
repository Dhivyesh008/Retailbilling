/**
 * DBContext.jsx
 *
 * Global data provider — now backed by Supabase.
 * All pages consume this context via useDB() and see the same live data.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  fetchProducts,
  fetchSales,
  fetchReturns,
  fetchPromotions,
} from '../services/supabaseService.js';
import { loadCustomers } from '../services/customerService.js';

// Loyalty tiers are still stored locally (not in your Supabase schema).
// Keep reading them from IndexedDB if they exist, otherwise default to [].
import { loyaltyTiersDB } from '../db/db.js';

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

      // Parallel fetch from Supabase + local IndexedDB for loyalty tiers
      const [prods, custs, sales, rets, promos, tiers] = await Promise.all([
        fetchProducts(),
        loadCustomers(),
        fetchSales(),
        fetchReturns(),
        fetchPromotions(),
        loyaltyTiersDB.getAll().catch(() => []),   // graceful fallback
      ]);

      setProducts(prods);
      setCustomers(custs);
      setBills(sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      setReturns(rets);
      setPromotions(promos);
      setLoyaltyTiers(tiers.sort((a, b) => b.minVisits - a.minVisits));
    } catch (err) {
      console.error('[DBContext] Failed to load data from Supabase:', err);
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
      // Legacy: stock map (product id → quantity)
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
