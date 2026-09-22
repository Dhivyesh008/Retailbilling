/**
 * Products.jsx
 *
 * Products catalog page:
 * - Fetches products from Supabase PostgreSQL via productService.getAllProducts()
 * - Displays dynamic summary cards (Total Products, Total Stock, Low Stock Products)
 * - Frontend search filtering by Name, SKU, and Barcode
 * - Loading and error state handling
 * - Refresh button to re-fetch live data from Supabase
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, RefreshCw, AlertTriangle, Boxes, Layers, AlertCircle } from 'lucide-react';
import { getAllProducts } from '../services/productService.js';
import ProductTable from '../components/ProductTable.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Products() {
  // State variables for products, loading state, error handling, and search query
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * Fetch all products from Supabase via the productService layer
   */
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllProducts();
      setProducts(data);
    } catch (err) {
      console.error('[Products] Failed to load products:', err);
      setError('Unable to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch products on initial component mount
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  /**
   * Calculate summary metrics dynamically from the fetched products
   */
  const metrics = useMemo(() => {
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0);
    const lowStockCount = products.filter((p) => {
      const qty = Number(p.stock_quantity || 0);
      const reorder = Number(p.reorder_level || 0);
      return qty <= reorder;
    }).length;

    return { totalProducts, totalStock, lowStockCount };
  }, [products]);

  /**
   * Filter products on the frontend by Name, SKU, or Barcode
   */
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;

    const term = searchTerm.toLowerCase().trim();
    return products.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const sku = String(p.sku || '').toLowerCase();
      const barcode = String(p.barcode || '').toLowerCase();
      return name.includes(term) || sku.includes(term) || barcode.includes(term);
    });
  }, [products, searchTerm]);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Database Catalog</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Products
          </h1>
          <p className="text-sm text-slate-500">
            Real-time product inventory connected to Supabase PostgreSQL.
          </p>
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadProducts}
          disabled={loading}
          className="btn-ghost inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
          title="Reload products from Supabase"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-brand' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Products */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Layers size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Total Products
              </p>
              <h3 className="mt-0.5 text-2xl font-extrabold text-slate-800">
                {metrics.totalProducts}
              </h3>
            </div>
          </div>
        </div>

        {/* Total Stock */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Boxes size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Total Stock
              </p>
              <h3 className="mt-0.5 text-2xl font-extrabold text-slate-800">
                {metrics.totalStock}
              </h3>
            </div>
          </div>
        </div>

        {/* Low Stock Products */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Low Stock Products
              </p>
              <h3 className="mt-0.5 text-2xl font-extrabold text-amber-600">
                {metrics.lowStockCount}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Section ── */}
      <section className="card overflow-hidden">
        {/* Search Bar Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              className="field w-full pl-9 text-sm"
              placeholder="Search by Name, SKU, or Barcode…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="text-xs font-medium text-slate-500">
            Showing <span className="font-bold text-slate-700">{filteredProducts.length}</span> of{' '}
            <span className="font-bold text-slate-700">{products.length}</span> products
          </div>
        </div>

        {/* Loading State */}
        {loading && <LoadingSpinner message="Loading products..." />}

        {/* Error State */}
        {!loading && error && (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle size={24} />
            </div>
            <p className="text-base font-bold text-red-600">Unable to load products.</p>
            <p className="mt-1 text-sm text-slate-500">Please try again.</p>
            <button
              onClick={loadProducts}
              className="btn-primary mt-4 inline-flex items-center gap-2 text-xs"
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Product Table */}
        {!loading && !error && <ProductTable products={filteredProducts} />}
      </section>
    </div>
  );
}
