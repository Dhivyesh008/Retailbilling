/**
 * ProductTable.jsx
 *
 * Responsive, reusable table component to display products retrieved from Supabase.
 * Columns: ID, Name, SKU, Barcode, Category, Price, Tax, Stock Quantity, Reorder Level, Status
 */
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ProductTable({ products = [] }) {
  // Empty state handling
  if (!products || products.length === 0) {
    return (
      <div className="py-16 text-center text-slate-500">
        <p className="text-base font-semibold text-slate-600">No products available.</p>
        <p className="mt-1 text-xs text-slate-400">
          No records matched your search or the database table is empty.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3.5">ID</th>
            <th className="px-4 py-3.5">Name</th>
            <th className="px-4 py-3.5">SKU</th>
            <th className="px-4 py-3.5">Barcode</th>
            <th className="px-4 py-3.5">Category</th>
            <th className="px-4 py-3.5 text-right">Price</th>
            <th className="px-4 py-3.5 text-right">Tax</th>
            <th className="px-4 py-3.5 text-right">Stock Quantity</th>
            <th className="px-4 py-3.5 text-right">Reorder Level</th>
            <th className="px-4 py-3.5 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {products.map((p) => {
            const quantity = Number(p.stock_quantity ?? 0);
            const reorderLevel = Number(p.reorder_level ?? 0);
            const isLowStock = quantity <= reorderLevel;
            const tax = p.tax_rate ?? p.tax ?? 0;

            return (
              <tr
                key={p.id}
                className="transition-colors hover:bg-slate-50/70"
              >
                {/* ID */}
                <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                  #{p.id}
                </td>

                {/* Name */}
                <td className="px-4 py-3.5 font-semibold text-slate-800">
                  {p.name || '—'}
                </td>

                {/* SKU */}
                <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                  {p.sku || '—'}
                </td>

                {/* Barcode */}
                <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                  {p.barcode || '—'}
                </td>

                {/* Category */}
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {p.category || 'General'}
                  </span>
                </td>

                {/* Price */}
                <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                  ₹{Number(p.price || 0).toFixed(2)}
                </td>

                {/* Tax */}
                <td className="px-4 py-3.5 text-right text-slate-600">
                  {Number(tax).toFixed(1)}%
                </td>

                {/* Stock Quantity */}
                <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                  {quantity}
                </td>

                {/* Reorder Level */}
                <td className="px-4 py-3.5 text-right text-slate-500">
                  {reorderLevel}
                </td>

                {/* Status Badge */}
                <td className="px-4 py-3.5 text-center">
                  {isLowStock ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <AlertCircle size={12} className="text-amber-600" />
                      Low Stock
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      In Stock
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
