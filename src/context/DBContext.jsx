/**
 * DBContext.jsx
 *
 * Global data provider powered by Dexie.js liveQuery and Supabase.
 * Components consuming useDB() receive live, auto-updating reactive queries:
 * Any write anywhere in the app immediately triggers re-renders across all screens.
 */
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  billsDB,
  promotionsDB,
  pricingRulesDB,
  priceRecommendationsDB,
  loyaltyTiersDB,
  storesDB,
} from '../db/db.js';
import {
  fetchProducts,
  fetchSales,
  fetchReturns,
  fetchPromotions,
  fetchStores,
} from '../services/supabaseService.js';
import { loadCustomers } from '../services/customerService.js';
import { parseTimestamp } from '../lib/dateUtils.js';

const DBContext = createContext(null);

export function DBProvider({ children }) {
  const [supabaseProducts, setSupabaseProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Dexie live queries (auto-reacts to any write across the app) ─────────
  const livePricingRules = useLiveQuery(
    () => db.pricingRules.toArray(),
    [],
    []
  );

  const livePriceRecommendations = useLiveQuery(
    () => db.priceRecommendations.toArray(),
    [],
    []
  );

  const livePromotions = useLiveQuery(
    () => db.promotions.toArray(),
    [],
    []
  );

  const liveBills = useLiveQuery(
    () =>
      db.bills.toArray().then((arr) =>
        arr.sort((a, b) => parseTimestamp(b.timestamp).getTime() - parseTimestamp(a.timestamp).getTime())
      ),
    [],
    []
  );

  const liveLoyaltyTiers = useLiveQuery(
    () =>
      db.loyaltyTiers.toArray().then((arr) =>
        arr.sort((a, b) => b.minVisits - a.minVisits)
      ),
    [],
    []
  );

  const liveStores = useLiveQuery(
    () => db.stores.toArray(),
    [],
    []
  );

  const liveProducts = useLiveQuery(
    () => db.products.toArray(),
    [],
    []
  );

  // Products: Use Supabase fetched list if available, or fall back to Dexie cached products
  const products = supabaseProducts.length > 0 ? supabaseProducts : (liveProducts ?? []);

  // Bills, promotions, pricingRules, priceRecommendations, loyaltyTiers, stores:
  const pricingRules = livePricingRules ?? [];
  const priceRecommendations = livePriceRecommendations ?? [];
  const promotions = livePromotions ?? [];
  const loyaltyTiers = liveLoyaltyTiers ?? [];
  const stores = liveStores ?? [];
  const bills = liveBills ?? [];

  // ─── Derived filtered views ──────────────────────────────────────────────
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.stock <= 10);
  }, [products]);

  const activePromotions = useMemo(() => {
    return promotions.filter((p) => Boolean(p.active));
  }, [promotions]);

  const activeLoyaltyTiers = useMemo(() => {
    return loyaltyTiers.filter((t) => Boolean(t.active));
  }, [loyaltyTiers]);

  // Approved recommendations (for Billing badges)
  const approvedRecommendations = useMemo(() => {
    return priceRecommendations.filter(
      (r) => r.status === 'APPROVED' && !r.isInformational
    );
  }, [priceRecommendations]);

  /**
   * Map of productId (string) → { actionType, actionValue, actionLabel, sourceName }
   * Used by Billing page to show badge on product cards.
   * A product only gets one badge — the first approved recommendation found.
   */
  const productRecommendationMap = useMemo(() => {
    const map = new Map();
    for (const rec of approvedRecommendations) {
      for (const pid of (rec.productIds || [])) {
        if (!map.has(String(pid))) {
          map.set(String(pid), {
            actionType:       rec.actionType,
            actionValue:      rec.actionValue,
            actionLabel:      rec.actionLabel,
            sourceName:       rec.sourceRuleName,
            branchId:         rec.branchId ?? null,
            recommendationId: rec.id,
          });
        }
      }
    }
    return map;
  }, [approvedRecommendations]);

  // ─── Supabase / Network Refresh & Sync ────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      setError(null);

      // Parallel fetch from Supabase + customer service
      const [prods, custs, sales, rets, promos, storeList] = await Promise.all([
        fetchProducts().catch((err) => {
          console.warn('[DBContext] fetchProducts fallback:', err.message);
          return [];
        }),
        loadCustomers().catch(() => []),
        fetchSales().catch(() => []),
        fetchReturns().catch(() => []),
        fetchPromotions().catch(() => []),
        fetchStores().catch(() => []),
      ]);

      if (prods && prods.length > 0) {
        setSupabaseProducts(prods);
        await db.products.bulkPut(prods).catch(() => {});
      }
      setCustomers(custs);
      setReturns(rets);

      if (sales && sales.length > 0) {
        await db.bills.bulkPut(sales).catch(() => {});
      }

      if (promos && promos.length > 0) {
        for (const sp of promos) {
          const existing = await db.promotions.get(sp.id);
          // Don't overwrite locally managed or rule-based promotions unless it's a remote update
          if (!existing) {
            await db.promotions.put(sp).catch(() => {});
          } else if (!existing.isRuleBased && !existing.sourceRecommendationId) {
            await db.promotions.put(sp).catch(() => {});
          }
        }
      }

      if (storeList && storeList.length > 0) {
        await db.stores.bulkPut(storeList).catch(() => {});
      }
    } catch (err) {
      console.error('[DBContext] Failed to load data from Supabase:', err);
      setError(err.message ?? 'Failed to connect to database');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * refreshPricingData: Retained for backwards compatibility,
   * Dexie useLiveQuery automatically updates on any pricing table write.
   */
  const refreshPricingData = useCallback(async () => {
    // Dexie automatically updates via useLiveQuery
  }, []);

  /**
   * addBill: Writes directly to Dexie, which immediately triggers live query updates
   */
  const addBill = useCallback(async (newBill) => {
    if (!newBill) return;
    try {
      await billsDB.put(newBill);
    } catch (err) {
      console.error('[DBContext] addBill failed:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DBContext.Provider
      value={{
        products,
        customers,
        promotions,
        activePromotions,
        bills,
        returns,
        loyaltyTiers,
        activeLoyaltyTiers,
        stores,
        loading,
        error,
        refresh,
        addBill,
        lowStockProducts,
        // Pricing engine
        pricingRules,
        priceRecommendations,
        approvedRecommendations,
        productRecommendationMap,
        refreshPricingData,
        // Legacy: stock map (product id → quantity)
        stock: Object.fromEntries(products.map((p) => [p.id, p.stock])),
      }}
    >
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be inside DBProvider');
  return ctx;
}
