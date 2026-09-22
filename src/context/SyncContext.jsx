import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { runSyncQueue, getPendingCount } from '../services/syncService.js';

const SyncContext = createContext(null);

const ONLINE_KEY = 'retailsync_online';

export function SyncProvider({ children }) {
  const [isOnline, setIsOnlineState] = useState(() => {
    const stored = localStorage.getItem(ONLINE_KEY);
    return stored === null ? true : stored === '1';
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  const setIsOnline = useCallback((val) => {
    localStorage.setItem(ONLINE_KEY, val ? '1' : '0');
    setIsOnlineState(val);
  }, []);

  const runSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await runSyncQueue();
      setLastSyncTime(new Date());
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isOnline, isSyncing, refreshPendingCount]);

  return (
    <SyncContext.Provider value={{ isOnline, setIsOnline, pendingCount, isSyncing, lastSyncTime, runSync, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be inside SyncProvider');
  return ctx;
}
