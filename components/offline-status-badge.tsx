'use client';

import { useSync } from '@/lib/sync-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CloudOff, Cloud, RefreshCw, WifiOff } from 'lucide-react';

export function OfflineStatusBadge() {
  const { isOnline, isSyncing, pendingCount, sync } = useSync();

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null; // Don't show anything when fully synced
  }

  const handleSync = async () => {
    console.log('Manual sync triggered from badge');
    await sync();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      {!isOnline && (
        <Badge variant="destructive" className="flex items-center gap-2 px-3 py-2">
          <WifiOff className="h-4 w-4" />
          <span>Offline</span>
        </Badge>
      )}
      
      {isSyncing && (
        <Badge variant="secondary" className="flex items-center gap-2 px-3 py-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Syncing...</span>
        </Badge>
      )}
      
      {pendingCount > 0 && !isSyncing && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSync}
          className="flex items-center gap-2"
          disabled={!isOnline}
        >
          <Cloud className="h-4 w-4" />
          <span>{pendingCount} pending</span>
          <RefreshCw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
