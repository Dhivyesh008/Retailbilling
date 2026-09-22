import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { runSyncQueue, getPendingCount } from '../services/syncService.js';

const SyncContext = createContext(null);

const ONLINE_KEY = 'retailsync_online';

export function SyncProvider({ children }) {
  const [isOnline, setIsOnlineState] = useState(() => {
    const stored = localStorage.getItem(ONLINE_KEY);
    return stored === null ? (navigator.onLine ?? true) : stored === '1';
  });
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error('[SyncContext] Error reading pending count:', err);
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await runSyncQueue();
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('[SyncContext] Sync failed:', err);
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isSyncing, refreshPendingCount]);

  const setIsOnline = useCallback((val) => {
    localStorage.setItem(ONLINE_KEY, val ? '1' : '0');
    setIsOnlineState(val);
    if (val) {
      // Trigger automatic sync when coming online
      runSync();
    }
  }, [runSync]);

  // Listen to browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncContext] Browser detected internet is back online! Initiating auto-sync...');
      localStorage.setItem(ONLINE_KEY, '1');
      setIsOnlineState(true);
      runSync();
    };

    const handleOffline = () => {
      console.log('[SyncContext] Browser detected offline mode.');
      localStorage.setItem(ONLINE_KEY, '0');
      setIsOnlineState(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync]);

  return (
    <SyncContext.Provider value={{
      isOnline, setIsOnline, pendingCount, isSyncing,
      lastSyncTime, runSync, refreshPendingCount
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be inside SyncProvider');
  return ctx;
}
