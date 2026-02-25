"use client";

import { memo, useCallback } from "react";
import { Plus } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import type { WatchlistInfo, ContextMenuState } from "./watchlist-types";

interface WatchlistContextMenuProps {
  contextMenu: ContextMenuState;
  currentWatchlistId: string | null;
  currentWatchlistName: string;
  watchlists: WatchlistInfo[];
  marketType: string;
  accountId: string;
  getAuthHeaders: () => HeadersInit;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCreateWatchlist: () => void;
}

const WatchlistContextMenu = memo(function WatchlistContextMenu({
  contextMenu,
  currentWatchlistId,
  currentWatchlistName,
  watchlists,
  marketType,
  accountId,
  getAuthHeaders,
  onClose,
  onSuccess,
  onError,
  onCreateWatchlist,
}: WatchlistContextMenuProps) {
  if (!contextMenu.open || !contextMenu.symbol) return null;

  const otherWatchlists = watchlists.filter(
    (wl) => wl.id !== currentWatchlistId && !wl.isSystem
  );

  const handleAddTo = useCallback(
    async (watchlistId: string, watchlistName: string) => {
      try {
        const body = {
          accountId,
          marketType,
          symbol: contextMenu.symbol,
          watchlistId,
        };

        const res = await fetch(getApiUrl("/api/watchlist/symbols"), {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          console.error("Failed to add symbol:", await res.text());
          onError(`Failed to add ${contextMenu.symbol} to ${watchlistName}`);
        } else {
          onSuccess(`${contextMenu.symbol} added to '${watchlistName}'`);
        }
      } catch (err) {
        console.error("Error adding symbol to watchlist:", err);
        onError("Failed to add symbol to watchlist");
      } finally {
        onClose();
      }
    },
    [accountId, marketType, contextMenu.symbol, getAuthHeaders, onClose, onSuccess, onError]
  );

  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-lg text-sm animate-in fade-in zoom-in-95"
      style={{
        top: Math.min(contextMenu.y, window.innerHeight - 280),
        left: Math.min(contextMenu.x, window.innerWidth - 220),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground">
        {contextMenu.symbol}
      </div>

      {/* Add to section */}
      <div className="px-3 py-1.5 text-[10px] uppercase text-muted-foreground tracking-wide">
        Add to watchlist
      </div>

      {/* Current watchlist indicator */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="truncate flex-1">{currentWatchlistName}</span>
        <span className="text-[10px]">Current</span>
      </div>

      {/* Separator */}
      <div className="border-t border-border my-1" />

      {/* Other watchlists */}
      <div className="max-h-[160px] overflow-y-auto">
        {otherWatchlists.map((wl) => (
          <button
            key={wl.id}
            className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-xs flex items-center gap-2 transition-colors"
            onClick={() => handleAddTo(wl.id, wl.name)}
          >
            <span className="truncate flex-1">{wl.name}</span>
            {wl.isDefault && (
              <span className="text-[10px] text-muted-foreground">
                Default
              </span>
            )}
          </button>
        ))}
        {otherWatchlists.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No other watchlists
          </div>
        )}
      </div>

      {/* Add to new watchlist */}
      <div className="border-t border-border">
        <button
          className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground flex items-center gap-1.5 transition-colors"
          onClick={() => {
            onClose();
            onCreateWatchlist();
          }}
        >
          <Plus size={12} />
          Add to new watchlist…
        </button>
      </div>

      {/* Cancel */}
      <div className="border-t border-border">
        <button
          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});

export default WatchlistContextMenu;
