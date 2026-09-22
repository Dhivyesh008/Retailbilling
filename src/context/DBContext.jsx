import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { productsDB, stockDB, customersDB, promotionsDB, billsDB, returnsDB, loyaltyTiersDB } from '../db/db.js';

const DBContext = createContext(null);

export function DBProvider({ children }) {
  const [products, setProducts]           = useState([]);
  const [stock, setStock]                 = useState({});
  const [customers, setCustomers]         = useState([]);
  const [promotions, setPromotions]       = useState([]);
  const [bills, setBills]                 = useState([]);
  const [returns, setReturns]             = useState([]);
  const [loyaltyTiers, setLoyaltyTiers]   = useState([]);
  const [loading, setLoading]             = useState(true);

  const refresh = useCallback(async () => {
    const [prods, stockArr, custs, promos, billsArr, returnsArr, tiers] = await Promise.all([
      productsDB.getAll(),
      stockDB.getAll(),
      customersDB.getAll(),
      promotionsDB.getAll(),
      billsDB.getAll(),
      returnsDB.getAll(),
      loyaltyTiersDB.getAll(),
    ]);

    const stockMap = {};
    for (const s of stockArr) stockMap[s.productId] = s.quantity;

    setProducts(prods.map((p) => ({ ...p, stock: stockMap[p.id] ?? p.stock ?? 0 })));
    setStock(stockMap);
    setCustomers(custs);
    setPromotions(promos);
    setBills(billsArr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    setReturns(returnsArr);
    // Sort tiers descending by minVisits so first-match wins logic works
    setLoyaltyTiers(tiers.sort((a, b) => b.minVisits - a.minVisits));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const lowStockProducts    = products.filter((p) => p.stock <= 10);
  const activePromotions    = promotions.filter((p) => p.active);
  const activeLoyaltyTiers  = loyaltyTiers.filter((t) => t.active);

  return (
    <DBContext.Provider value={{
      products, stock, customers, promotions, activePromotions,
      bills, returns, loyaltyTiers, activeLoyaltyTiers,
      loading, refresh, lowStockProducts,
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
