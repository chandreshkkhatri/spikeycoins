"use client";

import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import binanceWebSocketService from "@/lib/binance-websocket";
import { formatPrice } from "@/lib/format-utils";
import { upstoxWebSocket } from "@/lib/upstox-websocket";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X, Search } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SymbolSearchModal from "./SymbolSearchModal";
import TradingWindow from "./TradingWindow";
import WatchlistItemRow from "./WatchlistItemRow";
import WatchlistContextMenu from "./WatchlistContextMenu";
import {
  type WatchlistItem,
  type WatchlistProps,
  type WatchlistInfo,
  type ContextMenuState,
  type SortConfig,
  getStoredWatchlistSettings,
  saveWatchlistSettings,
  getStoredWatchlistPrices,
  saveWatchlistPrices,
} from "./watchlist-types";

// Re-export for backwards compatibility
export type { WatchlistItem } from "./watchlist-types";

const Watchlist = memo(function Watchlist({
  accounts = [],
  selectedAccount,
  marketType = "binance-futures",
}: WatchlistProps) {
  const { user, getAccessToken } = useAuth();

  // Helper to get auth headers for API calls
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [getAccessToken]);
  const storedWatchlistSettings = useRef(getStoredWatchlistSettings());
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [watchlistItemsData, setWatchlistItemsData] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    storedWatchlistSettings.current?.lastSelectedSymbol || ""
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistInfo[]>([]);
  const [currentWatchlistId, setCurrentWatchlistId] = useState<string | null>(
    null
  );
  const [currentWatchlistName, setCurrentWatchlistName] =
    useState<string>("Default Watchlist");
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [showSymbolSearchModal, setShowSymbolSearchModal] = useState(false);
  const [isMobileWatchlistOpen, setIsMobileWatchlistOpen] = useState(false);
  const [addAnchorRect, setAddAnchorRect] = useState<{
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
  } | null>(null);
  const [showCreateWatchlistModal, setShowCreateWatchlistModal] =
    useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Context menu state for right-click "Add to" functionality
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(
    { symbol: "", x: 0, y: 0, open: false }
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, open: false }));
  }, []);

  // Close context menu on Escape key or click outside
  useEffect(() => {
    if (!contextMenu.open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    const handleClickOutside = () => closeContextMenu();

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [contextMenu.open, closeContextMenu]);

  // Handle click outside search to close it
  // Uses "click" (not "mousedown") so React's onClick on search results
  // fires first, ensuring setSelectedSymbol runs before the search closes.
  useEffect(() => {
    if (!isSearchOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isSearchOpen]);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: storedWatchlistSettings.current?.sortKey || "symbol",
    direction: storedWatchlistSettings.current?.sortDirection || "asc",
  });

  // Persist sort + symbol settings to localStorage
  useEffect(() => {
    saveWatchlistSettings({
      sortKey: sortConfig.key,
      sortDirection: sortConfig.direction,
      lastSelectedSymbol: selectedSymbol || undefined,
    });
  }, [sortConfig, selectedSymbol]);

  // Persist watchlist prices/data to localStorage
  useEffect(() => {
    if (!selectedAccount || watchlistItems.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      saveWatchlistPrices(selectedAccount._id, watchlistItems);
    }, 2000); // Debounce save every 2 seconds
    
    return () => clearTimeout(timeoutId);
  }, [watchlistItems, selectedAccount]);

  // Ensure selected symbol stays valid based on available symbols
  useEffect(() => {
    if (watchlistSymbols.length === 0) {
      // Don't clear selectedSymbol when watchlist is empty during loading
      // It will be validated once symbols are loaded
      return;
    }

    // First priority: check if currently selected symbol is valid
    if (selectedSymbol && watchlistSymbols.includes(selectedSymbol)) {
      return;
    }

    // Second priority: try to restore from localStorage
    const storedSymbol = storedWatchlistSettings.current?.lastSelectedSymbol;
    if (storedSymbol && watchlistSymbols.includes(storedSymbol)) {
      setSelectedSymbol(storedSymbol);
      return;
    }

    // Fallback: select first symbol from watchlist
    setSelectedSymbol(watchlistSymbols[0]);
  }, [watchlistSymbols, selectedSymbol]);

  // Pending updates buffer for throttling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());

  const currentPrice =
    watchlistItems.find((item) => item.symbol === selectedSymbol)?.lastPrice ||
    0;

  // Track previous account to avoid unnecessary disconnects on watchlist changes
  const prevAccountIdRef = useRef<string | null>(null);
  const prevAccountTypeRef = useRef<"binance" | "upstox" | null>(null);
  const shouldDisconnectRef = useRef<boolean>(false);

  // Fetch watchlist symbols from database when account changes
  useEffect(() => {
    // Determine if the trading account actually changed
    const prevId = prevAccountIdRef.current;
    const prevType = prevAccountTypeRef.current;
    const currId = selectedAccount?._id || null;
    const currType = selectedAccount?.accountType || null;
    const accountChanged = prevId !== currId || prevType !== currType;
    shouldDisconnectRef.current = accountChanged;

    // Clear pending updates on account change
    pendingUpdatesRef.current.clear();

    const fetchWatchlistSymbols = async () => {
      if (!selectedAccount) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Default to system watchlist for Binance if no specific watchlist is selected
        const isSystemRequest =
          currentWatchlistId?.startsWith("system-") ||
          (selectedAccount.accountType === "binance" && !currentWatchlistId);

        // 1. Fetch User Watchlists & Default/Selected User Watchlist Data
        // If requesting system watchlist, we still fetch user watchlists to populate dropdown
        // but we don't pass the system ID to the user endpoint
        // For system requests, use noCreate=true to avoid 401 when no user watchlist exists
        const userWlUrl =
          !isSystemRequest && currentWatchlistId
            ? getApiUrl(
              `/api/watchlist/symbols?accountId=${selectedAccount._id}&marketType=${marketType}&watchlistId=${currentWatchlistId}`
            )
            : getApiUrl(
              `/api/watchlist/symbols?accountId=${selectedAccount._id
              }&marketType=${marketType}${isSystemRequest ? "&noCreate=true" : ""
              }`
            );

        const userRes = await fetch(userWlUrl, { headers: getAuthHeaders() });
        if (!userRes.ok) {
          const errorBody = await userRes.text();
          throw new Error(
            `Watchlist API ${userRes.status}: ${errorBody || userRes.statusText || "Unknown error"
            }`
          );
        }
        const userData = await userRes.json();

        let finalWatchlists = userData.watchlists || [];
        let finalSymbols = userData.symbols || [];
        let finalItems = userData.items || [];
        let finalCurrentId = userData.watchlist?.id;
        let finalCurrentName = userData.watchlist?.name;

        // 2. Handle System Watchlist (Binance Futures)
        if (selectedAccount.accountType === "binance") {
          // Add system watchlist to the list
          const systemWl = {
            id: "system-binance-futures",
            name: "Binance Futures",
            isDefault: false,
            isSystem: true,
          };
          // Prepend system watchlist
          finalWatchlists = [systemWl, ...finalWatchlists];

          // If we are currently selecting the system watchlist, fetch its symbols
          if (isSystemRequest) {
            try {
              const sysRes = await fetch(
                getApiUrl("/api/watchlist/system/binance-futures"),
                { headers: getAuthHeaders() }
              );
              const sysData = await sysRes.json();
              if (sysData.success) {
                finalSymbols = sysData.symbols;
                finalItems = sysData.items;
                finalCurrentId =
                  sysData.watchlistId || "system-binance-futures";
                finalCurrentName = sysData.watchlistName || "Binance Futures";
              }
            } catch (sysErr) {
              console.error("Failed to fetch system watchlist", sysErr);
            }
          }
        }

        if (userData.success) {
          // Update watchlists
          setWatchlists(finalWatchlists);

          // Update current watchlist info
          if (isSystemRequest) {
            setCurrentWatchlistId(finalCurrentId || "system-binance-futures");
            setCurrentWatchlistName(finalCurrentName || "Binance Futures");
          } else if (userData.watchlist) {
            setCurrentWatchlistId(userData.watchlist.id);
            setCurrentWatchlistName(userData.watchlist.name);
          }

          if (finalSymbols.length > 0) {
            setWatchlistSymbols(finalSymbols);
            setWatchlistItemsData(finalItems); // Store full item data

            // Initialize watchlist items with cached data if available, otherwise zeros
            const cachedPrices = selectedAccount ? getStoredWatchlistPrices(selectedAccount._id) : null;
            
            const initialData: WatchlistItem[] = finalSymbols.map(
              (symbol: string) => {
                const cached = cachedPrices ? cachedPrices[symbol] : null;
                // Use cached data if it exists and looks valid (non-zero price)
                if (cached && cached.lastPrice > 0) {
                  return cached;
                }
                
                return {
                  symbol,
                  lastPrice: 0,
                  priceChange: 0,
                  priceChangePercent: 0,
                  volume: 0,
                  high24h: 0,
                  low24h: 0,
                };
              }
            );

            setWatchlistItems(initialData);
            // Symbol selection is handled by the useEffect that watches watchlistSymbols

            // Fetch cached prices from server for immediate display
            if (selectedAccount?.accountType === "binance") {
              try {
                const pricesRes = await fetch(getApiUrl("/api/prices"));
                const pricesData = await pricesRes.json();
                if (pricesData.success && pricesData.prices) {
                  // Update items with cached prices
                  setWatchlistItems((prev) =>
                    prev.map((item) => {
                      const cached = pricesData.prices[item.symbol];
                      if (cached) {
                        return {
                          ...item,
                          lastPrice: cached.lastPrice || 0,
                          priceChange: cached.priceChange || 0,
                          priceChangePercent: cached.priceChangePercent || 0,
                          volume: cached.volume || 0,
                          high24h: cached.high || 0,
                          low24h: cached.low || 0,
                        };
                      }
                      return item;
                    })
                  );
                }
              } catch (priceErr) {
                // Ignore pricing cache failures
              }
            }

            // Start WebSocket connection for real-time updates
            if (selectedAccount?.accountType === "binance") {
              // Determine segment type based on market type
              const segment =
                marketType === "binance-futures" ? "usdm" : "spot";

              // Connect to WebSocket first (don't use testnet for now - it's unstable)
              binanceWebSocketService
                .connect(segment, false)
                .then(() => {
                  // Subscribe to each symbol (ensure lowercase)
                  finalSymbols.forEach((symbol: string) => {
                    binanceWebSocketService.subscribe(
                      symbol.toLowerCase(),
                      (priceUpdate: {
                        symbol?: string;
                        lastPrice?: string;
                        priceChange?: string;
                        priceChangePercent?: string;
                        volume?: string;
                        high?: string;
                        low?: string;
                      }) => {
                        // Buffer the update instead of setting state immediately
                        if (priceUpdate.symbol) {
                          pendingUpdatesRef.current.set(
                            priceUpdate.symbol.toLowerCase(),
                            priceUpdate
                          );
                        }
                      }
                    );
                  });
                })
                .catch((err) => {
                  console.error("Failed to connect to Binance WebSocket:", err);
                });
            } else if (selectedAccount?.accountType === "upstox") {
              // Upstox: connect via v3 websocket using accountId and 'ltpc' for light feed in watchlist
              upstoxWebSocket.connect(
                finalSymbols,
                (priceUpdate) => {
                  // Buffer the update
                  if (priceUpdate.symbol) {
                    pendingUpdatesRef.current.set(
                      priceUpdate.symbol,
                      priceUpdate
                    );
                  }
                },
                { accountId: selectedAccount._id, mode: "ltpc" }
              );
            }
          } else {
            // No symbols in watchlist
            setWatchlistItems([]);
            setWatchlistSymbols([]);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch watchlist symbols:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load watchlist data"
        );
        setWatchlistItems([]);
        setLoading(false);
      }
    };

    fetchWatchlistSymbols();

    // Cleanup WebSocket on component unmount or account change
    return () => {
      if (!shouldDisconnectRef.current) return;
      if (prevAccountTypeRef.current === "binance") {
        binanceWebSocketService.disconnect();
      } else if (prevAccountTypeRef.current === "upstox") {
        upstoxWebSocket.disconnect();
      }
    };
    // We intentionally exclude selectedSymbol to avoid reconnecting the feed on selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, marketType, currentWatchlistId]);

  // Throttled update effect - optimized with requestAnimationFrame batching
  useEffect(() => {
    let rafId: number | null = null;
    let lastUpdate = 0;
    const minInterval = 500; // Reduced from 1000ms to 500ms for more responsive UI

    const processUpdates = () => {
      const now = performance.now();
      if (
        now - lastUpdate < minInterval ||
        pendingUpdatesRef.current.size === 0
      ) {
        rafId = requestAnimationFrame(processUpdates);
        return;
      }

      lastUpdate = now;
      setWatchlistItems((prev) => {
        // Create normalized lookup map (O(1) instead of O(N))
        const itemMap = new Map(
          prev.map((item) => [item.symbol.toLowerCase(), item])
        );
        let hasChanges = false;

        pendingUpdatesRef.current.forEach((update, symbolKey) => {
          // Normalize key for consistent lookup
          const normalizedKey = symbolKey.toLowerCase();
          const item = itemMap.get(normalizedKey);

          if (item) {
            hasChanges = true;
            const newItem = { ...item };

            // Check if it's a Binance update (strings) or Upstox (numbers)
            if (typeof update.lastPrice === "string") {
              // Binance format
              newItem.lastPrice = parseFloat(update.lastPrice || "0");
              newItem.priceChange = parseFloat(update.priceChange || "0");
              newItem.priceChangePercent = parseFloat(
                update.priceChangePercent || "0"
              );
              newItem.volume = parseFloat(update.volume || "0");
              newItem.high24h = parseFloat(update.high || "0");
              newItem.low24h = parseFloat(update.low || "0");
            } else {
              // Upstox format (already numbers)
              newItem.lastPrice = update.lastPrice;
              newItem.priceChange = update.priceChange;
              newItem.priceChangePercent = update.priceChangePercent;
              newItem.volume = update.volume;
              newItem.high24h = update.high24h;
              newItem.low24h = update.low24h;
            }

            itemMap.set(normalizedKey, newItem);
          }
        });

        pendingUpdatesRef.current.clear();
        return hasChanges ? Array.from(itemMap.values()) : prev;
      });

      rafId = requestAnimationFrame(processUpdates);
    };

    rafId = requestAnimationFrame(processUpdates);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // After each effect run, update previous account refs
  useEffect(() => {
    prevAccountIdRef.current = selectedAccount?._id || null;
    prevAccountTypeRef.current = selectedAccount?.accountType || null;
  }, [selectedAccount]);

  const handleSort = (key: keyof WatchlistItem) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedWatchlistItems = useMemo(() => {
    const items = [...watchlistItems];
    items.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      // For volume, sort by dollar value (price × units)
      if (sortConfig.key === "volume") {
        aValue = a.volume * a.lastPrice;
        bValue = b.volume * b.lastPrice;
      } else {
        aValue = a[sortConfig.key];
        bValue = b[sortConfig.key];
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [watchlistItems, sortConfig]);

  const filteredWatchlistItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedWatchlistItems;
    const query = searchQuery.toLowerCase().trim();
    return sortedWatchlistItems.filter((item) =>
      item.symbol.toLowerCase().includes(query)
    );
  }, [sortedWatchlistItems, searchQuery]);

  const addSymbol = async (item: {
    symbol: string;
    name?: string;
    exchange?: string;
    token?: string;
    segment?: string;
    instrument_type?: string;
    isin?: string;
  }) => {
    // Check if symbol already exists
    if (watchlistSymbols.includes(item.symbol)) {
      setError(`${item.symbol} is already in your watchlist`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Add to local state
    const newSymbols = [...watchlistSymbols, item.symbol];
    setWatchlistSymbols(newSymbols);

    // Add to watchlist items with initial values
    setWatchlistItems((prev) => [
      ...prev,
      {
        symbol: item.symbol,
        lastPrice: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        high24h: 0,
        low24h: 0,
      },
    ]);

    // If no symbol selected, select the new one
    if (!selectedSymbol) {
      setSelectedSymbol(item.symbol);
    }

    // Save to database with full item data
    if (selectedAccount) {
      try {
        // Use existing items data if available, or create minimal items
        const currentItems =
          watchlistItemsData.length > 0
            ? watchlistItemsData
            : watchlistItems.map((wi) => ({
              symbol: wi.symbol,
            }));

        // Add new item with full details
        const newItems = [
          ...currentItems,
          {
            symbol: item.symbol,
            name: item.name,
            exchange: item.exchange,
            token: item.token,
            segment: item.segment,
            instrument_type: item.instrument_type,
            isin: item.isin,
          },
        ];

        // Update local state with new items data
        setWatchlistItemsData(newItems);

        // Save to backend - backend expects 'symbol' not 'items'
        const body: {
          accountId: string;
          marketType: string;
          symbol?: string;
          watchlistId?: string;
          items?: unknown[];
        } = {
          accountId: selectedAccount._id,
          marketType,
          symbol: item.symbol, // Backend expects single symbol
        };

        if (currentWatchlistId) {
          body.watchlistId = currentWatchlistId;
        }

        const response = await fetch(getApiUrl("/api/watchlist/symbols"), {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error("Failed to save symbol to watchlist");
        }

        // Add to WebSocket subscription
        if (selectedAccount.accountType === "binance") {
          binanceWebSocketService.addSymbol(item.symbol);
        } else if (selectedAccount.accountType === "upstox") {
          upstoxWebSocket.addSymbol(item.symbol);
        }
      } catch (err) {
        console.error("Failed to add symbol to watchlist:", err);
        setError("Failed to add symbol to watchlist");
        // Revert on error
        setWatchlistSymbols((prev) => prev.filter((s) => s !== item.symbol));
        setWatchlistItems((prev) =>
          prev.filter((wi) => wi.symbol !== item.symbol)
        );
      }
    }
  };

  const removeSymbol = async (symbol: string) => {
    setWatchlistItems((prev) => prev.filter((item) => item.symbol !== symbol));
    setWatchlistSymbols((prev) => prev.filter((s) => s !== symbol));
    // Remove from WebSocket subscription
    if (selectedAccount?.accountType === "binance") {
      binanceWebSocketService.removeSymbol(symbol);
    } else if (selectedAccount?.accountType === "upstox") {
      upstoxWebSocket.removeSymbol(symbol);
    }
    if (selectedSymbol === symbol && watchlistItems.length > 1) {
      setSelectedSymbol(
        watchlistItems.find((item) => item.symbol !== symbol)?.symbol || ""
      );
    }

    // Save to database with items
    if (selectedAccount) {
      try {
        // Filter out the removed symbol from items data
        const remainingItems = watchlistItemsData.filter(
          (item) => item.symbol !== symbol
        );

        // Update local state
        setWatchlistItemsData(remainingItems);

        const body: {
          accountId: string;
          marketType: string;
          items: unknown[];
          watchlistId?: string;
        } = {
          accountId: selectedAccount._id,
          marketType,
          items: remainingItems, // Changed from symbols to items
        };

        if (currentWatchlistId) {
          body.watchlistId = currentWatchlistId;
        }

        await fetch(getApiUrl("/api/watchlist/symbols"), {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error("Failed to remove symbol from watchlist:", err);
      }
    }
  };

  const switchWatchlist = useCallback(
    (watchlistId: string, watchlistName: string) => {
      setCurrentWatchlistId(watchlistId);
      setCurrentWatchlistName(watchlistName);
      setShowWatchlistDropdown(false);
    },
    []
  );

  const handleOrderPlaced = useCallback(() => {
    // Handle order placed event - could refresh data, show notification, etc.
  }, []);

  const handleContextMenu = useCallback(
    (symbol: string, x: number, y: number) => {
      setContextMenu({ symbol, x, y, open: true });
    },
    []
  );

  const handleSelectSymbol = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      setIsMobileWatchlistOpen(false);
      if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }
    },
    [isSearchOpen]
  );

  const createWatchlist = async () => {
    if (!selectedAccount || !newWatchlistName.trim() || !user?._id) return;

    try {
      const response = await fetch(getApiUrl("/api/watchlist"), {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: user._id,
          accountId: selectedAccount._id,
          name: newWatchlistName.trim(),
          marketType,
          symbols: [],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Create watchlist failed:", response.status, errorText);
        throw new Error("Failed to create watchlist");
      }

      const data = await response.json();
      if (data.success) {
        setWatchlists((prev) => [
          ...prev,
          {
            id: data.watchlist._id,
            name: data.watchlist.name,
            isDefault: false,
          },
        ]);
        switchWatchlist(data.watchlist._id, data.watchlist.name);
        setShowCreateWatchlistModal(false);
        setNewWatchlistName("");
      }
    } catch (err) {
      console.error("Failed to create watchlist:", err);
      setError("Failed to create watchlist");
    }
  };

  const deleteWatchlist = async (watchlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this watchlist?")) return;

    try {
      const response = await fetch(getApiUrl(`/api/watchlist/${watchlistId}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error("Failed to delete watchlist");

      setWatchlists((prev) => prev.filter((w) => w.id !== watchlistId));

      // If deleted current watchlist, switch to default
      if (currentWatchlistId === watchlistId) {
        const defaultWl = watchlists.find(
          (w) => w.isDefault && w.id !== watchlistId
        );
        if (defaultWl) {
          switchWatchlist(defaultWl.id, defaultWl.name);
        }
      }
    } catch (err) {
      console.error("Failed to delete watchlist:", err);
      setError("Failed to delete watchlist");
    }
  };

  const isDefaultBinance =
    selectedAccount?.accountType === "binance" &&
    watchlists.find((w) => w.id === currentWatchlistId)?.isSystem;

  if (loading) {
    return (
      <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="hidden h-full md:grid md:grid-cols-[320px_1fr]">
          <div className="h-full flex flex-col border-r border-border bg-card overflow-hidden">
            {/* Skeleton Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-3">
              <div className="h-6 w-32 animate-pulse rounded bg-muted"></div>
              <div className="h-8 w-8 animate-pulse rounded bg-muted"></div>
            </div>

            {/* Skeleton Column Headers */}
            <div className="grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border bg-muted/50 px-2 pr-1 py-2">
              <div className="h-3 w-12 animate-pulse rounded bg-muted"></div>
              <div className="h-3 w-10 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-10 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-8 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-8 animate-pulse rounded bg-muted justify-self-end"></div>
            </div>

            {/* Skeleton Items */}
            <div className="flex-1 min-h-0 overflow-y-auto p-0">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border px-2 pr-1 py-3 items-center"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-16 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-16 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-12 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-3 w-10 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-8 animate-pulse rounded bg-muted"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-full overflow-hidden bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">
                Loading trading interface...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (accounts.length === 0 || !selectedAccount) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-xl font-semibold text-foreground">
            Trading Panel
          </h3>
          <p className="text-muted-foreground">
            Select an account to view your watchlist
          </p>
          {accounts.length === 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => (window.location.href = "/accounts")}
            >
              Add Trading Account
            </Button>
          )}
        </div>
      </div>
    );
  }

  const renderSortHeader = (label: string, key: keyof WatchlistItem) => (
    <div
      className="flex cursor-pointer items-center gap-1 hover:text-foreground"
      onClick={() => handleSort(key)}
    >
      {label}
      {sortConfig.key === key &&
        (sortConfig.direction === "asc" ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        ))}
    </div>
  );

  const renderWatchlistContent = () => (
    <div
      ref={isSearchOpen ? searchContainerRef : null}
      className="h-full flex flex-col border-r border-border bg-card overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-3 h-[50px]">
        {isSearchOpen ? (
          <div
            className="flex-1 flex items-center gap-2 animate-in fade-in slide-in-from-right-5 mx-1"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Search..."
              className="flex-1 h-8 bg-transparent border-none text-sm focus:outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <>
            <div className="relative flex-1">
              <div
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
              >
                <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                  {currentWatchlistName}
                </span>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </div>
              {showWatchlistDropdown && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95">
                  <div className="mb-1 border-b border-border pb-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 px-2 text-xs"
                      onClick={() => {
                        setShowCreateWatchlistModal(true);
                        setShowWatchlistDropdown(false);
                      }}
                    >
                      <Plus size={12} /> Create New Watchlist
                    </Button>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {watchlists.map((wl) => (
                      <div
                        key={wl.id}
                        className={`group flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${wl.id === currentWatchlistId
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-popover-foreground"
                          }`}
                        onClick={() => switchWatchlist(wl.id, wl.name)}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="truncate">{wl.name}</span>
                          {wl.isSystem && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              System
                            </span>
                          )}
                        </div>
                        {!wl.isSystem && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => deleteWatchlist(wl.id, e)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setIsSearchOpen(true)}
                title="Search symbols"
              >
                <Search size={16} />
              </Button>
              {!isDefaultBinance && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    setAddAnchorRect({
                      top: rect.top,
                      left: rect.left,
                      bottom: rect.bottom,
                      right: rect.right,
                      width: rect.width,
                      height: rect.height,
                    });
                    setShowSymbolSearchModal(true);
                  }}
                  title="Add Symbol"
                >
                  <Plus size={18} />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {showCreateWatchlistModal && (
        <div className="border-b border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Watchlist Name"
              className="h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") createWatchlist();
                if (e.key === "Escape") setShowCreateWatchlistModal(false);
              }}
            />
            <Button size="sm" className="h-8 px-3" onClick={createWatchlist}>
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setShowCreateWatchlistModal(false)}
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}



      {error && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
          {error}
        </div>
      )}

      {watchlistItems.length === 0 && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <p className="mb-2 text-sm">No symbols in your watchlist</p>
          {!isDefaultBinance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSymbolSearchModal(true)}
              className="gap-2"
            >
              <Plus size={14} /> Add Symbol
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Column Headers */}
        {watchlistItems.length > 0 && (
          <div className="sticky top-0 z-10 grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border bg-muted px-2 pr-1 py-2 text-[10px] font-medium text-muted-foreground">
            {renderSortHeader("Symbol", "symbol")}
            <div className="justify-self-end">{renderSortHeader("Price", "lastPrice")}</div>
            <div className="justify-self-end">{renderSortHeader("24h %", "priceChangePercent")}</div>
            <div className="justify-self-end">{renderSortHeader("Vol", "volume")}</div>
            <div></div>
          </div>
        )}
        {filteredWatchlistItems.map((item) => (
          <WatchlistItemRow
            key={item.symbol}
            item={item}
            isSelected={selectedSymbol === item.symbol}
            isContextTarget={contextMenu.open && contextMenu.symbol === item.symbol}
            accountType={selectedAccount?.accountType}
            isSystemWatchlist={!!isDefaultBinance}
            onSelect={handleSelectSymbol}
            onContextMenu={handleContextMenu}
            onRemove={removeSymbol}
          />
        ))}
      </div>

      {/* Context Menu */}
      {selectedAccount && (
        <WatchlistContextMenu
          contextMenu={contextMenu}
          currentWatchlistId={currentWatchlistId}
          currentWatchlistName={currentWatchlistName}
          watchlists={watchlists}
          marketType={marketType}
          accountId={selectedAccount._id}
          getAuthHeaders={getAuthHeaders}
          onClose={closeContextMenu}
          onSuccess={(msg) => {
            setSuccess(msg);
            setTimeout(() => setSuccess(null), 3000);
          }}
          onError={(msg) => {
            setError(msg);
            setTimeout(() => setError(null), 3000);
          }}
          onCreateWatchlist={() => setShowCreateWatchlistModal(true)}
        />
      )}

      {/* Success message */}
      {success && (
        <div className="absolute bottom-4 left-4 right-4 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200 shadow-lg animate-in fade-in slide-in-from-bottom-2">
          ✓ {success}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      {/* Desktop View */}
      <div className="hidden h-full md:grid md:grid-cols-[320px_1fr]">
        {renderWatchlistContent()}
        <div className="h-full overflow-hidden bg-background">
          <TradingWindow
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            accounts={accounts}
            selectedAccount={selectedAccount}
            marketType={marketType?.includes("spot") ? "spot" : "futures"}
            onOrderPlaced={handleOrderPlaced}
            onSymbolSelect={setSelectedSymbol}
          />
        </div>
      </div>

      {/* Mobile View */}
      <div className="flex h-full flex-col md:hidden relative">
        <div
          className="flex items-center justify-between border-b border-border bg-card p-4 shadow-sm z-20 relative cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setIsMobileWatchlistOpen(!isMobileWatchlistOpen)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">
              {selectedSymbol || "Select Symbol"}
            </span>
            <ChevronDown
              size={20}
              className={`transition-transform duration-200 text-muted-foreground ${isMobileWatchlistOpen ? "rotate-180" : ""
                }`}
            />
          </div>
          {selectedSymbol && (
            <div className="flex flex-col items-end">
              <span className="font-mono font-medium text-foreground">
                {selectedAccount?.accountType === "binance"
                  ? formatPrice(currentPrice, "$")
                  : selectedAccount?.accountType === "upstox"
                    ? formatPrice(currentPrice, "₹")
                    : formatPrice(currentPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Watchlist Dropdown Overlay */}
        {isMobileWatchlistOpen && (
          <div className="absolute top-[61px] left-0 right-0 bottom-0 z-10 bg-background animate-in slide-in-from-top-5 fade-in duration-200 shadow-lg">
            {renderWatchlistContent()}
          </div>
        )}

        {/* Trading Window */}
        <div className="flex-1 overflow-hidden bg-background">
          <TradingWindow
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            accounts={accounts}
            selectedAccount={selectedAccount}
            marketType={marketType?.includes("spot") ? "spot" : "futures"}
            onOrderPlaced={handleOrderPlaced}
            onSymbolSelect={setSelectedSymbol}
          />
        </div>
      </div>

      {/* Symbol Search Modal */}
      {showSymbolSearchModal && selectedAccount && (
        <SymbolSearchModal
          isOpen={showSymbolSearchModal}
          onClose={() => setShowSymbolSearchModal(false)}
          onSelectSymbol={addSymbol}
          accountType={selectedAccount.accountType}
          anchorRect={addAnchorRect || undefined}
        />
      )}
    </div>
  );
});

export default Watchlist;
