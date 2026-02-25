"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trash2 } from "lucide-react";
import { formatPrice, formatVolume, formatPercent } from "@/lib/format-utils";
import { formatSymbolForTooltip, type WatchlistItem } from "./watchlist-types";

interface WatchlistItemRowProps {
  item: WatchlistItem;
  isSelected: boolean;
  isContextTarget: boolean;
  accountType?: "binance" | "kite" | "upstox";
  isSystemWatchlist: boolean;
  onSelect: (symbol: string) => void;
  onContextMenu: (symbol: string, x: number, y: number) => void;
  onRemove: (symbol: string) => void;
}

const WatchlistItemRow = memo(function WatchlistItemRow({
  item,
  isSelected,
  isContextTarget,
  accountType,
  isSystemWatchlist,
  onSelect,
  onContextMenu,
  onRemove,
}: WatchlistItemRowProps) {
  const currencyPrefix =
    accountType === "binance"
      ? "$"
      : accountType === "upstox" || accountType === "kite"
        ? "₹"
        : "";

  return (
    <div
      className={`group relative grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 cursor-pointer border-b border-border px-2 pr-1 py-3 transition-colors hover:bg-accent/50 items-center ${
        isSelected
          ? "bg-accent/50 border-l-4 border-l-primary pl-3"
          : "border-l-4 border-l-transparent"
      } ${isContextTarget ? "bg-accent/70" : ""}`}
      onClick={() => onSelect(item.symbol)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(item.symbol, e.clientX, e.clientY);
      }}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate font-semibold text-foreground text-sm cursor-help">
                {item.symbol}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="font-medium">
                {formatSymbolForTooltip(item.symbol, accountType)}
              </p>
              {item.high24h > 0 && item.low24h > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  24h High: {formatPrice(item.high24h)} | Low:{" "}
                  {formatPrice(item.low24h)}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="text-right">
        <span className="font-mono text-xs font-medium text-foreground">
          {formatPrice(item.lastPrice, currencyPrefix)}
        </span>
      </div>
      <div className="text-right">
        <span
          className={`text-xs font-medium ${
            item.priceChange >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatPercent(item.priceChangePercent)}
        </span>
      </div>
      <div className="text-right">
        <span className="text-xs text-muted-foreground">
          {formatVolume(item.volume * item.lastPrice)}
        </span>
      </div>

      {/* Actions column */}
      <div className="flex items-center justify-end">
        <button
          className="opacity-0 transition-opacity group-hover:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded text-sm"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            onContextMenu(item.symbol, rect.left, rect.bottom + 4);
          }}
          title="More actions"
        >
          ⋮
        </button>

        {!isSystemWatchlist && (
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 transition-opacity group-hover:opacity-100 h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.symbol);
            }}
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </div>
  );
});

export default WatchlistItemRow;
