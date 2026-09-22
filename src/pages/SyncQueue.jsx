import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';
import { useSync } from '../context/SyncContext.jsx';
import { syncQueueDB } from '../db/db.js';

const STATUS_MAP = {
  PENDING_SYNC: { label: 'Pending Sync', color: 'bg-amber-100 text-amber-700', icon: Clock },
  SYNCED:       { label: 'Synced',       color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
};

const ENTITY_ICONS = {
  customer: '👤',
  bill:     '🧾',
  stock:    '📦',
  return:   '↩️',
};

export default function SyncQueue() {
  const { isOnline, isSyncing, runSync, pendingCount, lastSyncTime } = useSync();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    const all = await syncQueueDB.getAll();
    setQueue(all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, pendingCount, lastSyncTime]);

  const handleSync = async () => {
    await runSync();
    await loadQueue();
  };

  const filtered = queue.filter((q) => filter === 'ALL' || q.status === filter);

  const pendingEntries = queue.filter((q) => q.status === 'PENDING_SYNC');
  const syncedEntries  = queue.filter((q) => q.status === 'SYNCED');

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-1 text-2xl font-extrabold">Sync Queue</h1>
          <p className="text-sm text-slate-500">Monitor offline writes and push them to the backend when online.</p>
        </div>

        <button
          onClick={handleSync}
          disabled={!isOnline || isSyncing || pendingCount === 0}
          className="btn-primary disabled:opacity-50"
        >
          <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {/* Status banner */}
      {!isOnline && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle size={18} className="text-amber-600 shrink-0" />
          <p className="text-sm font-bold text-amber-700">
            Store is offline — writes are being queued. Toggle the badge in the header to go online.
          </p>
        </div>
      )}
      {isOnline && pendingCount === 0 && queue.length > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-bold text-emerald-700">All records are synced with the server.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="eyebrow">Pending</p>
          <b className={`mt-2 block text-3xl ${pendingEntries.length > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{pendingEntries.length}</b>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Synced</p>
          <b className="mt-2 block text-3xl text-emerald-600">{syncedEntries.length}</b>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Last Sync</p>
          <b className="mt-2 block text-sm font-bold text-slate-600">
            {lastSyncTime ? lastSyncTime.toLocaleTimeString('en-IN') : '—'}
          </b>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {['ALL', 'PENDING_SYNC', 'SYNCED'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${filter === f ? 'bg-brand text-white shadow' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            {f === 'ALL' ? `All (${queue.length})` : f === 'PENDING_SYNC' ? `Pending (${pendingEntries.length})` : `Synced (${syncedEntries.length})`}
          </button>
        ))}
      </div>

      {/* Queue table */}
      <section className="card overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
            <Wifi size={36} className="text-slate-200" />
            <p className="text-sm">No entries in this filter</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((entry) => {
              const { label, color, icon: Icon } = STATUS_MAP[entry.status] ?? STATUS_MAP.PENDING_SYNC;
              return (
                <div key={entry.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="text-xl">{ENTITY_ICONS[entry.entityType] ?? '📝'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold capitalize">{entry.entityType} · {entry.action}</p>
                    <p className="text-xs text-slate-400 truncate">{entry.entityId}</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {new Date(entry.timestamp).toLocaleString('en-IN')}
                  </p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${color}`}>
                    <Icon size={11} />
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
