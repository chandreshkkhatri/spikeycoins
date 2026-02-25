"use client";

/**
 * Shared types, interfaces, and localStorage utilities for the Watchlist.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const WATCHLIST_SETTINGS_KEY = "spikeyCoins_watchlistSettings";
export const WATCHLIST_PRICES_KEY = "spikeyCoins_watchlistPrices";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface WatchlistSettings {
  sortKey: keyof WatchlistItem;
  sortDirection: "asc" | "desc";
  lastSelectedSymbol?: string;
}

export interface WatchlistItem {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export interface WatchlistProps {
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  }>;
  selectedAccount?: {
    _id: string;
    accountName: string;
    accountType: "binance" | "kite" | "upstox";
    isActive: boolean;
  } | null;
  marketType?: string;
}

export interface WatchlistInfo {
  id: string;
  name: string;
  isDefault: boolean;
  isSystem?: boolean;
}

export interface ContextMenuState {
  symbol: string;
  x: number;
  y: number;
  open: boolean;
}

export interface SortConfig {
  key: keyof WatchlistItem;
  direction: "asc" | "desc";
}

// ─── LocalStorage Utilities ──────────────────────────────────────────────────

export const getStoredWatchlistSettings = (): WatchlistSettings | null => {
  try {
    const stored = localStorage.getItem(WATCHLIST_SETTINGS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const saveWatchlistSettings = (settings: WatchlistSettings) => {
  try {
    localStorage.setItem(WATCHLIST_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
};

export const getStoredWatchlistPrices = (
  accountId: string
): Record<string, WatchlistItem> | null => {
  try {
    if (typeof window === "undefined") return null;
    const key = `${WATCHLIST_PRICES_KEY}_${accountId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const saveWatchlistPrices = (
  accountId: string,
  items: WatchlistItem[]
) => {
  try {
    if (typeof window === "undefined") return;
    const key = `${WATCHLIST_PRICES_KEY}_${accountId}`;
    const pricesMap = items.reduce(
      (acc, item) => {
        acc[item.symbol] = item;
        return acc;
      },
      {} as Record<string, WatchlistItem>
    );
    localStorage.setItem(key, JSON.stringify(pricesMap));
  } catch {
    // Ignore
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format symbol name for tooltip display.
 */
export const formatSymbolForTooltip = (
  symbol: string,
  accountType?: string
): string => {
  if (accountType === "binance") {
    if (symbol.endsWith("USDT")) {
      const base = symbol.slice(0, -4);
      return `${base}/USDT Perpetual`;
    }
    if (symbol.endsWith("BUSD")) {
      const base = symbol.slice(0, -4);
      return `${base}/BUSD Perpetual`;
    }
    if (symbol.endsWith("USD")) {
      const base = symbol.slice(0, -3);
      return `${base}/USD`;
    }
  }
  if (accountType === "kite" || accountType === "upstox") {
    return symbol.replace(":", " - ");
  }
  return symbol;
};
