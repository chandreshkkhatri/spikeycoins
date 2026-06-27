"use client";

import { useAuth } from "@/contexts/auth-context";
import binanceWebSocketService from "@/lib/binance-websocket";
import { upstoxWebSocket } from "@/lib/upstox-websocket";
import { getApiUrl } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function useWatchlist({
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    symbol: "",
    x: 0,
    y: 0,
    open: false,
  });

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
    if (watchlistSymbols.length === 0) return;

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
    const prevId = prevAccountIdRef.current;
    const prevType = prevAccountTypeRef.current;
    const currId = selectedAccount?._id || null;
    const currType = selectedAccount?.accountType || null;
    const accountChanged = prevId !== currId || prevType !== currType;
    shouldDisconnectRef.current = accountChanged;

    pendingUpdatesRef.current.clear();

    const fetchWatchlistSymbols = async () => {
      if (!selectedAccount) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const isSystemRequest =
          currentWatchlistId?.startsWith("system-") ||
          (selectedAccount.accountType === "binance" && !currentWatchlistId);

        const userWlUrl =
          !isSystemRequest && currentWatchlistId
            ? getApiUrl(
                `/api/watchlist/symbols?accountId=${selectedAccount._id}&marketType=${marketType}&watchlistId=${currentWatchlistId}`
              )
            : getApiUrl(
                `/api/watchlist/symbols?accountId=${
                  selectedAccount._id
                }&marketType=${marketType}${isSystemRequest ? "&noCreate=true" : ""}`
              );

        const userRes = await fetch(userWlUrl, { headers: getAuthHeaders() });
        if (!userRes.ok) {
          const errorBody = await userRes.text();
          throw new Error(
            `Watchlist API ${userRes.status}: ${
              errorBody || userRes.statusText || "Unknown error"
            }`
          );
        }
        const userData = await userRes.json();

        let finalWatchlists = userData.watchlists || [];
        let finalSymbols = userData.symbols || [];
        let finalItems = userData.items || [];
        let finalCurrentId = userData.watchlist?.id;
        let finalCurrentName = userData.watchlist?.name;

        if (selectedAccount.accountType === "binance") {
          const systemWl = {
            id: "system-binance-futures",
            name: "Binance Futures",
            isDefault: false,
            isSystem: true,
          };
          finalWatchlists = [systemWl, ...finalWatchlists];

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
          setWatchlists(finalWatchlists);

          if (isSystemRequest) {
            setCurrentWatchlistId(finalCurrentId || "system-binance-futures");
            setCurrentWatchlistName(finalCurrentName || "Binance Futures");
          } else if (userData.watchlist) {
            setCurrentWatchlistId(userData.watchlist.id);
            setCurrentWatchlistName(userData.watchlist.name);
          }

          if (finalSymbols.length > 0) {
            setWatchlistSymbols(finalSymbols);
            setWatchlistItemsData(finalItems);

            const cachedPrices = selectedAccount
              ? getStoredWatchlistPrices(selectedAccount._id)
              : null;

            const initialData: WatchlistItem[] = finalSymbols.map(
              (symbol: string) => {
                const cached = cachedPrices ? cachedPrices[symbol] : null;
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

            if (selectedAccount?.accountType === "binance") {
              try {
                const pricesRes = await fetch(getApiUrl("/api/prices"));
                const pricesData = await pricesRes.json();
                if (pricesData.success && pricesData.prices) {
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
              } catch {
                // Ignore pricing cache failures
              }
            }

            if (selectedAccount?.accountType === "binance") {
              const segment =
                marketType === "binance-futures" ? "usdm" : "spot";

              binanceWebSocketService
                .connect(segment, false)
                .then(() => {
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
              upstoxWebSocket.connect(
                finalSymbols,
                (priceUpdate) => {
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

    return () => {
      if (!shouldDisconnectRef.current) return;
      if (prevAccountTypeRef.current === "binance") {
        binanceWebSocketService.disconnect();
      } else if (prevAccountTypeRef.current === "upstox") {
        upstoxWebSocket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, marketType, currentWatchlistId]);

  // Throttled update effect - optimized with requestAnimationFrame batching
  useEffect(() => {
    let rafId: number | null = null;
    let lastUpdate = 0;
    const minInterval = 500;

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
        const itemMap = new Map(
          prev.map((item) => [item.symbol.toLowerCase(), item])
        );
        let hasChanges = false;

        pendingUpdatesRef.current.forEach((update, symbolKey) => {
          const normalizedKey = symbolKey.toLowerCase();
          const item = itemMap.get(normalizedKey);

          if (item) {
            hasChanges = true;
            const newItem = { ...item };

            if (typeof update.lastPrice === "string") {
              newItem.lastPrice = parseFloat(update.lastPrice || "0");
              newItem.priceChange = parseFloat(update.priceChange || "0");
              newItem.priceChangePercent = parseFloat(
                update.priceChangePercent || "0"
              );
              newItem.volume = parseFloat(update.volume || "0");
              newItem.high24h = parseFloat(update.high || "0");
              newItem.low24h = parseFloat(update.low || "0");
            } else {
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
    if (watchlistSymbols.includes(item.symbol)) {
      setError(`${item.symbol} is already in your watchlist`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const newSymbols = [...watchlistSymbols, item.symbol];
    setWatchlistSymbols(newSymbols);

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

    if (!selectedSymbol) {
      setSelectedSymbol(item.symbol);
    }

    if (selectedAccount) {
      try {
        const currentItems =
          watchlistItemsData.length > 0
            ? watchlistItemsData
            : watchlistItems.map((wi) => ({
                symbol: wi.symbol,
              }));

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

        setWatchlistItemsData(newItems);

        const body: {
          accountId: string;
          marketType: string;
          symbol?: string;
          watchlistId?: string;
          items?: unknown[];
        } = {
          accountId: selectedAccount._id,
          marketType,
          symbol: item.symbol,
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

        if (selectedAccount.accountType === "binance") {
          binanceWebSocketService.addSymbol(item.symbol);
        } else if (selectedAccount.accountType === "upstox") {
          upstoxWebSocket.addSymbol(item.symbol);
        }
      } catch (err) {
        console.error("Failed to add symbol to watchlist:", err);
        setError("Failed to add symbol to watchlist");
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

    if (selectedAccount) {
      try {
        const remainingItems = watchlistItemsData.filter(
          (item) => item.symbol !== symbol
        );

        setWatchlistItemsData(remainingItems);

        const body: {
          accountId: string;
          marketType: string;
          items: unknown[];
          watchlistId?: string;
        } = {
          accountId: selectedAccount._id,
          marketType,
          items: remainingItems,
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

  const handleOrderPlaced = useCallback(() => {}, []);

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
      const response = await fetch(
        getApiUrl(
          `/api/watchlist/${watchlistId}?accountId=${selectedAccount?._id}`
        ),
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete watchlist");
      }

      const data = await response.json();
      if (data.success) {
        setWatchlists((prev) => prev.filter((wl) => wl.id !== watchlistId));
        setSuccess("Watchlist deleted successfully");
        setTimeout(() => setSuccess(null), 3000);

        // Fallback to default user watchlist
        const remaining = watchlists.filter((wl) => wl.id !== watchlistId);
        const defaultWl = remaining.find((wl) => !wl.isSystem) || remaining[0];

        if (defaultWl) {
          switchWatchlist(defaultWl.id, defaultWl.name);
        } else if (selectedAccount?.accountType === "binance") {
          switchWatchlist("system-binance-futures", "Binance Futures");
        } else {
          setCurrentWatchlistId(null);
          setCurrentWatchlistName("Default Watchlist");
          setWatchlistSymbols([]);
          setWatchlistItems([]);
        }
      }
    } catch (err) {
      console.error("Failed to delete watchlist:", err);
      setError("Failed to delete watchlist");
    }
  };

  return {
    watchlistItems,
    watchlistItemsData,
    selectedSymbol,
    setSelectedSymbol,
    loading,
    error,
    setError,
    watchlistSymbols,
    watchlists,
    currentWatchlistId,
    currentWatchlistName,
    showWatchlistDropdown,
    setShowWatchlistDropdown,
    showSymbolSearchModal,
    setShowSymbolSearchModal,
    isMobileWatchlistOpen,
    setIsMobileWatchlistOpen,
    addAnchorRect,
    setAddAnchorRect,
    showCreateWatchlistModal,
    setShowCreateWatchlistModal,
    newWatchlistName,
    setNewWatchlistName,
    success,
    setSuccess,
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchContainerRef,
    contextMenu,
    closeContextMenu,
    sortConfig,
    currentPrice,
    handleSort,
    sortedWatchlistItems,
    filteredWatchlistItems,
    addSymbol,
    removeSymbol,
    switchWatchlist,
    handleOrderPlaced,
    handleContextMenu,
    handleSelectSymbol,
    createWatchlist,
    deleteWatchlist,
    getAuthHeaders,
  };
}
