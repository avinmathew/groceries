'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { flushMutationQueue, FlushResult } from './mutation-queue';
import { offlineDB } from './offline-db';
import { BASE_PATH } from './utils';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingCount: number;
  sync: () => Promise<FlushResult>;
  forceRefresh: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return context;
}

interface SyncProviderProps {
  children: React.ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Use ref to store sync function so event handlers always have latest version
  const syncRef = useRef<() => Promise<FlushResult>>();

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await offlineDB.pendingMutations.count();
      console.log('Pending mutations count:', count);
      setPendingCount(count);
    } catch (error) {
      console.error('Error counting pending mutations:', error);
    }
  }, []); // No external dependencies needed

  // Force refresh from server
  const forceRefresh = useCallback(async () => {
    if (!isOnline) return;

    try {
      // Refresh shopping lists
      const listsResponse = await fetch(`${BASE_PATH}/api/shopping-lists`);
      if (listsResponse.ok) {
        const listsData = await listsResponse.json();
        const lists = listsData.data || listsData;
        
        // Clear and repopulate
        await offlineDB.shoppingLists.clear();
        for (const list of lists) {
          await offlineDB.shoppingLists.put({
            ...list,
            _synced: true,
          });
        }
      }

      // Refresh categories
      const categoriesResponse = await fetch(`${BASE_PATH}/api/categories`);
      if (categoriesResponse.ok) {
        const categoriesData = await categoriesResponse.json();
        const categories = categoriesData.data || categoriesData;
        
        await offlineDB.categories.clear();
        for (const category of categories) {
          await offlineDB.categories.put({
            ...category,
            _synced: true,
          });
        }
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [isOnline]);

  // Sync function
  const sync = useCallback(async (): Promise<FlushResult> => {
    // Check navigator.onLine directly to avoid race conditions with state
    const currentlyOnline = navigator.onLine;
    console.log('Sync called, online status:', currentlyOnline, 'isSyncing:', isSyncing);
    
    if (!currentlyOnline || isSyncing) {
      console.log('Sync skipped - offline or already syncing');
      return { success: 0, failed: 0, errors: [] };
    }
    
    // Quick check: if there are no pending mutations, skip the expensive sync
    const count = await offlineDB.pendingMutations.count();
    if (count === 0) {
      console.log('Sync skipped - no pending mutations');
      return { success: 0, failed: 0, errors: [] };
    }

    setIsSyncing(true);
    console.log('Starting sync...');
    try {
      const result = await flushMutationQueue();
      setLastSyncTime(new Date());
      await updatePendingCount();
      
      console.log('Sync result:', result);
      
      // If some mutations succeeded, refresh cached data
      if (result.success > 0) {
        console.log('Refreshing cached data after successful sync');
        await forceRefresh();
      }
      
      return result;
    } catch (error) {
      console.error('Sync error:', error);
      return {
        success: 0,
        failed: 0,
        errors: [{ mutation: {} as any, error: String(error) }],
      };
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, updatePendingCount, forceRefresh]);
  
  // Update ref whenever sync changes
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network online event detected');
      setIsOnline(true);
      // Use setTimeout to ensure state has updated before syncing
      const timeoutId = setTimeout(() => {
        console.log('Triggering sync after online event, syncRef.current:', !!syncRef.current);
        if (syncRef.current) {
          syncRef.current();
        } else {
          console.error('syncRef.current is not set!');
        }
      }, 100);
      console.log('setTimeout scheduled with ID:', timeoutId);
    };

    const handleOffline = () => {
      console.log('Network offline event detected');
      setIsOnline(false);
    };

    const handleVisibilityChange = () => {
      // Check online status when tab becomes visible
      if (!document.hidden) {
        const currentOnlineStatus = navigator.onLine;
        console.log('Tab visible, online status:', currentOnlineStatus);
        
        // Always update pending count when tab becomes visible
        updatePendingCount();
        
        if (currentOnlineStatus !== isOnline) {
          setIsOnline(currentOnlineStatus);
        }
        
        // Always try to sync when tab becomes visible if online
        if (currentOnlineStatus) {
          console.log('Tab visible and online, triggering sync');
          // Use setTimeout to ensure state has updated
          setTimeout(() => syncRef.current?.(), 100);
        }
      }
    };

    // Listen for service worker sync requests
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        console.log('Sync requested by service worker');
        syncRef.current?.();
      }
    };

    // Set initial state
    setIsOnline(navigator.onLine);
    console.log('Initial online status:', navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [isOnline, updatePendingCount]); // Removed sync from dependencies

  // Initial sync and pending count on mount
  useEffect(() => {
    const initSync = async () => {
      await updatePendingCount();
      
      // Sync on mount if online
      if (navigator.onLine) {
        console.log('Initial mount - triggering sync');
        await syncRef.current?.();
      }
    };
    
    initSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Periodic sync every 30 seconds when online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      if (pendingCount > 0) {
        syncRef.current?.();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, pendingCount]);

  const value: SyncContextType = {
    isOnline,
    isSyncing,
    lastSyncTime,
    pendingCount,
    sync,
    forceRefresh,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
