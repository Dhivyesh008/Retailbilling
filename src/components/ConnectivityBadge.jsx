import { useSync } from '../context/SyncContext.jsx';
import { Wifi, WifiOff } from 'lucide-react';

export default function ConnectivityBadge() {
  const { isOnline, setIsOnline, pendingCount } = useSync();

  return (
    <button
      onClick={() => setIsOnline(!isOnline)}
      title={isOnline ? 'Click to go offline' : 'Click to go online'}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
        isOnline
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={13} />
          Online
        </>
      ) : (
        <>
          <WifiOff size={13} />
          Offline
          {pendingCount > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">
              {pendingCount}
            </span>
          )}
        </>
      )}
    </button>
  );
}
