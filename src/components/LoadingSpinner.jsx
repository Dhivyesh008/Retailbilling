/**
 * LoadingSpinner.jsx
 *
 * Reusable loading indicator displayed while fetching data from Supabase.
 */
import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ message = 'Loading products...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Loader2 size={36} className="animate-spin text-brand mb-3" />
      <p className="text-sm font-semibold tracking-wide text-slate-600">{message}</p>
    </div>
  );
}
