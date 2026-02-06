"use client";

import { useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import type { SyncStatus } from "./types";

interface SyncButtonProps {
  syncStatus: SyncStatus | null;
  onSync: () => Promise<void>;
  disabled?: boolean;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SyncButton({
  syncStatus,
  onSync,
  disabled,
}: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const isSyncing =
    syncing || syncStatus?.syncStatus === "syncing";
  const isInitial = !syncStatus?.initialSyncCompleted;

  const handleSync = async () => {
    if (isSyncing || disabled) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {syncStatus?.lastError && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          <span>Sync error</span>
        </div>
      )}
      {syncStatus?.lastSyncTime ? (
        <span className="text-xs text-muted-foreground">
          Synced {formatTimeAgo(syncStatus.lastSyncTime)}
        </span>
      ) : null}
      <button
        onClick={handleSync}
        disabled={isSyncing || disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
        />
        {isSyncing
          ? isInitial
            ? "Initial sync..."
            : "Syncing..."
          : "Sync"}
      </button>
    </div>
  );
}
