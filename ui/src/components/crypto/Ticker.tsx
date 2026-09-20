"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type SortingState,
  type FilterFn,
  type Row,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  ArrowUpDown,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { cryptoApi } from "@/lib/crypto-api";
import api from "@/lib/api";
import { useAccount } from "@/contexts/account-context";
import { useAuth } from "@/contexts/auth-context";
import { PAGE_ROUTES } from "@/lib/constants";

export interface TickerData {
  s: string;
  price: number;
  change_24h: number;
  change_7d?: number | null;
  change_12h?: number | null;
  change_8h?: number | null;
  change_4h?: number | null;
  change_1h?: number | null;
  high_24h: number;
  low_24h: number;
  range_position_24h: number;
  volume_usd: number;
  volume_base: number;
  market_cap?: number | null;
  normalized_volume_score: number;
  is_futures?: boolean;
}

const columnHelper = createColumnHelper<TickerData>();
type ScreenerTimeframe = "24h" | "7d";
type ScreenerDirection = "gainers" | "losers" | null;

const normalizePair = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const readSearchParams = (): URLSearchParams =>
  typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

const readDirection = (): ScreenerDirection => {
  const direction = readSearchParams().get("direction");
  return direction === "gainers" || direction === "losers" ? direction : null;
};

const readTimeframe = (): ScreenerTimeframe =>
  readSearchParams().get("timeframe") === "7d" ? "7d" : "24h";

const readPageIndex = (): number => {
  const page = Number.parseInt(readSearchParams().get("page") || "1", 10);
  return Number.isFinite(page) && page > 0 ? page - 1 : 0;
};

const numberSort = (
  rowA: Row<TickerData>,
  rowB: Row<TickerData>,
  columnId: string
): number => {
  const a = rowA.getValue(columnId) as number | null | undefined;
  const b = rowB.getValue(columnId) as number | null | undefined;
  const numA =
    a === null || a === undefined ? Number.NEGATIVE_INFINITY : Number(a);
  const numB =
    b === null || b === undefined ? Number.NEGATIVE_INFINITY : Number(b);
  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return 1;
  if (isNaN(numB)) return -1;
  return numA - numB;
};

const formatNumber = (num: number | undefined | null): string => {
  if (num === null || num === undefined || isNaN(Number(num))) return "0";
  const number = Number(num);
  if (number >= 1e9) return (number / 1e9).toFixed(2) + "B";
  if (number >= 1e6) return (number / 1e6).toFixed(2) + "M";
  if (number >= 1e3) return (number / 1e3).toFixed(2) + "K";
  return number.toFixed(2);
};

const formatPercentage = (
  value: number | undefined | null
): React.ReactNode => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return <span className="text-muted-foreground text-xs">N/A</span>;
  }
  const percentage = Number(value);
  const colorClass = percentage >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  return (
    <span className={colorClass}>
      {percentage >= 0 ? "+" : ""}
      {percentage.toFixed(2)}%
    </span>
  );
};

const formatPrice = (value: number | undefined | null): string => {
  if (value === null || value === undefined || isNaN(Number(value)))
    return "N/A";
  const price = Number(value);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
};

export default function Ticker() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { accounts, selectedAccount } = useAccount();
  const initialParams = useRef(readSearchParams());
  const initialSymbol = normalizePair(initialParams.current.get("symbol") || "");
  const [tickerArray, setTickerArray] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState(
    initialSymbol || initialParams.current.get("q") || ""
  );
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    initialSymbol || null
  );
  const [timeframe, setTimeframe] = useState<ScreenerTimeframe>(readTimeframe);
  const [direction, setDirection] = useState<ScreenerDirection>(readDirection);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analyzingSymbol, setAnalyzingSymbol] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<{ symbol: string; success: boolean; message: string } | null>(null);
  const [pagination, setPagination] = useState({
    pageIndex: readPageIndex(),
    pageSize: 20,
  });

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const response = await api.get("/admin/status");
        setIsAdmin(response.data?.isAdmin === true);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  const fetchTickers = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshError(null);
      const [response, sevenDayResponse] = await Promise.all([
        cryptoApi.getTickers(),
        timeframe === "7d" ? cryptoApi.get7dTopMovers(500) : Promise.resolve(null),
      ]);
      const data = response.data?.data || response.data || [];
      const sevenDayData = sevenDayResponse?.data?.data;
      const sevenDayItems = [
        ...(sevenDayData?.gainers || []),
        ...(sevenDayData?.losers || []),
      ] as Array<{ symbol: string; change_7d: number }>;
      const sevenDayBySymbol = new Map(
        sevenDayItems.map((item) => [
          normalizePair(item.symbol.endsWith("USDT") ? item.symbol : `${item.symbol}USDT`),
          item.change_7d,
        ])
      );
      const newArray = Array.isArray(data)
        ? data.map((ticker: TickerData) => ({
            ...ticker,
            change_7d: timeframe === "7d"
              ? sevenDayBySymbol.get(normalizePair(ticker.s)) ?? null
              : ticker.change_7d,
          }))
        : [];
      setTickerArray(newArray);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error("Error fetching tickers:", err);
      setTickerArray((current) => {
        if (current.length === 0) {
          setError("Failed to load market data");
        } else {
          setRefreshError("Failed to update market data in background");
        }
        return current;
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchTickers(true);

    // Auto-refresh every 30s (silent, no loading spinner)
    const interval = setInterval(() => fetchTickers(false), 30000);
    return () => clearInterval(interval);
  }, [fetchTickers]);

  const currentScreenerPath = useCallback(() => {
    if (typeof window === "undefined") return PAGE_ROUTES.CRYPTO_SCREENER;
    return `${window.location.pathname}${window.location.search}`;
  }, []);

  const handleOpenTerminal = useCallback((symbol: string) => {
    const params = new URLSearchParams({
      symbol,
      returnTo: currentScreenerPath(),
    });
    router.push(`${PAGE_ROUTES.TRADING_PANEL}?${params.toString()}`);
  }, [currentScreenerPath, router]);

  const handleSave = useCallback(async (symbol: string) => {
    if (!isLoggedIn) {
      const returnTo = currentScreenerPath();
      if (typeof window !== "undefined") {
        sessionStorage.setItem("spikeyCoins_authReturnTo", returnTo);
      }
      router.push(`${PAGE_ROUTES.LOGIN}?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    const binanceAccount =
      selectedAccount?.accountType === "binance"
        ? selectedAccount
        : accounts.find((account) => account.accountType === "binance" && account.isActive);

    if (!binanceAccount) {
      setActionResult({
        type: "error",
        message: "Connect a Binance broker account to save this instrument.",
      });
      return;
    }

    try {
      await api.post("/watchlist/symbols", {
        accountId: binanceAccount._id,
        marketType: "binance-futures",
        symbol,
      });
      setActionResult({
        type: "success",
        message: `${symbol.replace("USDT", "/USDT")} added to your watchlist.`,
      });
    } catch {
      setActionResult({
        type: "error",
        message: "Could not add this instrument to your watchlist.",
      });
    }
  }, [accounts, currentScreenerPath, isLoggedIn, router, selectedAccount]);

  const handleViewDetails = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, []);

  const handleAnalyze = useCallback(async (symbol: string) => {
    try {
      setAnalyzingSymbol(symbol);
      setAnalyzeResult(null);
      const response = await cryptoApi.researchCoin(symbol);
      setAnalyzeResult({
        symbol,
        success: true,
        message: response.data?.summary?.headline || "Added to market summaries",
      });
      // Clear success message after 5 seconds
      setTimeout(() => setAnalyzeResult(null), 5000);
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
        (err as Error)?.message ||
        "Analysis failed";
      setAnalyzeResult({ symbol, success: false, message: errorMsg });
      setTimeout(() => setAnalyzeResult(null), 5000);
    } finally {
      setAnalyzingSymbol(null);
    }
  }, []);
  const columns = useMemo(
    () => [
      columnHelper.accessor("s", {
        header: "Symbol",
        cell: (info) => (
          <span className="flex items-center gap-1.5">
            <strong className="text-blue-600 dark:text-blue-400">
              {info.getValue().replace("USDT", "/USDT")}
            </strong>
            {info.row.original.is_futures && (
              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-semibold leading-none text-amber-600 dark:text-amber-400">
                PERP
              </span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor("price", {
        header: "Price (USD)",
        cell: (info) => (
          <span className="font-mono">${formatPrice(info.getValue())}</span>
        ),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_24h", {
        header: "24h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      ...(timeframe === "7d"
        ? [
            columnHelper.accessor("change_7d", {
              header: "7d Change",
              cell: (info) => formatPercentage(info.getValue()),
              sortingFn: numberSort,
            }),
          ]
        : []),
      columnHelper.accessor("change_12h", {
        header: "12h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_8h", {
        header: "8h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_4h", {
        header: "4h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_1h", {
        header: "1h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.display({
        id: "highLow_24h",
        header: "24h High/Low",
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            <div className="text-green-600 dark:text-green-400">
              ${formatPrice(row.original.high_24h)}
            </div>
            <div className="text-red-600 dark:text-red-400">
              ${formatPrice(row.original.low_24h)}
            </div>
          </div>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor("range_position_24h", {
        header: "24hr Range Position",
        cell: (info) => {
          const value = info.getValue();
          if (value === null || value === undefined)
            return <span className="text-muted-foreground text-xs">N/A</span>;
          let colorClass = "text-orange-500";
          if (value < 25) colorClass = "text-red-600 dark:text-red-400";
          if (value > 75) colorClass = "text-green-600 dark:text-green-400";
          return (
            <span className={cn("font-bold", colorClass)}>
              {Number(value).toFixed(1)}%
            </span>
          );
        },
        sortingFn: numberSort,
      }),
      columnHelper.accessor("volume_usd", {
        header: "Volume (USD)",
        cell: (info) => (
          <span className="font-mono">${formatNumber(info.getValue())}</span>
        ),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("market_cap", {
        header: "Market Cap",
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={cn("font-mono", !value && "text-muted-foreground")}>
              {value ? `$${formatNumber(value)}` : "N/A"}
            </span>
          );
        },
        sortingFn: numberSort,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const symbol = row.original.s;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleViewDetails(symbol)}
              >
                Details
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void handleSave(symbol)}
                title={isLoggedIn ? "Add to watchlist" : "Sign in to save"}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span className="sr-only">{isLoggedIn ? "Add to watchlist" : "Sign in to save"} {symbol}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleOpenTerminal(symbol)}
                title="Open in Terminal"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="sr-only">Open {symbol} in Terminal</span>
              </Button>
            </div>
          );
        },
        enableSorting: false,
      }),
      ...(isAdmin
        ? [
            columnHelper.display({
              id: "analyze",
              header: "Analyze",
              cell: ({ row }) => {
                const symbol = row.original.s;
                const isAnalyzing = analyzingSymbol === symbol;
                const result = analyzeResult?.symbol === symbol ? analyzeResult : null;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAnalyze(symbol);
                      }}
                      disabled={isAnalyzing}
                      title="Analyze & add to market summaries"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {result && (
                      <span
                        className={cn(
                          "text-[10px] max-w-[120px] truncate",
                          result.success
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                        title={result.message}
                      >
                        {result.success ? "✓" : "✗"}
                      </span>
                    )}
                  </div>
                );
              },
              enableSorting: false,
            }),
          ]
        : []),
    ],
    [
      timeframe,
      isLoggedIn,
      isAdmin,
      analyzingSymbol,
      analyzeResult,
      handleAnalyze,
      handleOpenTerminal,
      handleSave,
      handleViewDetails,
    ]
  );

  const [sorting, setSorting] = useState<SortingState>(() => {
    const params = readSearchParams();
    const urlSort = params.get("sort");
    const sortableColumns = new Set([
      "s",
      "price",
      "change_24h",
      "change_7d",
      "change_12h",
      "change_8h",
      "change_4h",
      "change_1h",
      "range_position_24h",
      "volume_usd",
      "market_cap",
    ]);
    if (urlSort && sortableColumns.has(urlSort)) {
      return [{ id: urlSort, desc: params.get("sortDir") !== "asc" }];
    }
    if (params.has("direction") || params.has("timeframe")) {
      return [{
        id: readTimeframe() === "7d" ? "change_7d" : "change_24h",
        desc: readDirection() !== "losers",
      }];
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("spikeyCoins_screener_sorting");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }
    return [{ id: readTimeframe() === "7d" ? "change_7d" : "change_24h", desc: readDirection() !== "losers" }];
  });

  useEffect(() => {
    try {
      localStorage.setItem("spikeyCoins_screener_sorting", JSON.stringify(sorting));
    } catch {
      // ignore
    }
  }, [sorting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (selectedSymbol) {
      params.set("symbol", selectedSymbol);
      if (searchQuery && normalizePair(searchQuery) !== normalizePair(selectedSymbol)) {
        params.set("q", searchQuery);
      } else {
        params.delete("q");
      }
    } else if (searchQuery) {
      params.set("q", searchQuery);
      params.delete("symbol");
    } else {
      params.delete("q");
      params.delete("symbol");
    }

    params.set("timeframe", timeframe);
    if (direction) params.set("direction", direction);
    else params.delete("direction");

    const activeSort = sorting[0];
    if (activeSort) {
      params.set("sort", activeSort.id);
      params.set("sortDir", activeSort.desc ? "desc" : "asc");
    }
    if (pagination.pageIndex > 0) params.set("page", String(pagination.pageIndex + 1));
    else params.delete("page");

    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  }, [direction, pagination.pageIndex, searchQuery, selectedSymbol, sorting, timeframe]);

  const resetSort = () => {
    setSorting([{
      id: timeframe === "7d" ? "change_7d" : "change_24h",
      desc: direction !== "losers",
    }]);
  };

  const customGlobalFilterFn: FilterFn<TickerData> = React.useCallback(
    (row, columnId, filterValue) => {
      const value = row.getValue(columnId) as
        | string
        | number
        | null
        | undefined;
      const sValue = normalizePair(String(value));
      const fValue = normalizePair(String(filterValue));
      return sValue.includes(fValue);
    },
    []
  );

  const directionalTickers = useMemo(() => {
    if (!direction) return tickerArray;
    const field = timeframe === "7d" ? "change_7d" : "change_24h";
    return tickerArray.filter((ticker) => {
      const change = ticker[field];
      if (change === null || change === undefined) return false;
      return direction === "gainers" ? change > 0 : change < 0;
    });
  }, [direction, tickerArray, timeframe]);

  const selectedTicker = selectedSymbol
    ? tickerArray.find((ticker) => normalizePair(ticker.s) === normalizePair(selectedSymbol))
    : undefined;

  const table = useReactTable({
    data: directionalTickers,
    columns,
    state: {
      sorting,
      globalFilter: searchQuery,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    globalFilterFn: customGlobalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return (
      <div className="text-center p-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-lg text-muted-foreground">Loading market data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-8 text-center">
        <p className="text-lg font-semibold text-red-700 dark:text-red-400">
          Error Loading Data
        </p>
        <p className="text-muted-foreground mt-2">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => fetchTickers(true)}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!tickerArray || tickerArray.length === 0) {
    return (
      <div className="text-center p-10 bg-muted/50 rounded-lg">
        <p className="text-lg font-semibold text-muted-foreground">No Data Available</p>
        <p className="text-muted-foreground mt-2">
          Click &apos;Refresh&apos; to load market data.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {tickerArray.length} USDT trading pairs available
          </span>
          <Button
            variant={timeframe === "24h" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTimeframe("24h");
              setSorting([{ id: "change_24h", desc: direction !== "losers" }]);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
          >
            24h
          </Button>
          <Button
            variant={timeframe === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTimeframe("7d");
              setSorting([{ id: "change_7d", desc: direction !== "losers" }]);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
          >
            7d
          </Button>
          {direction && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDirection(null);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
            >
              {direction === "gainers" ? "Gainers" : "Losers"}
              <X className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search pairs..."
              value={searchQuery}
              onChange={(e) => {
                setSelectedSymbol(null);
                setSearchQuery(e.target.value);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
              className="pl-9 w-64"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            title="Reset Sort"
            onClick={resetSort}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => fetchTickers(true)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Background refresh error banner */}
      {refreshError && (
        <div className="px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Market feed update failed. Displaying cached data
              {lastUpdated ? ` from ${lastUpdated.toLocaleTimeString()}` : ""}.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            onClick={() => fetchTickers(false)}
          >
            Retry
          </Button>
        </div>
      )}

      {actionResult && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm",
            actionResult.type === "success"
              ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
          )}
        >
          <span>{actionResult.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setActionResult(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {selectedTicker && (
        <section className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4" aria-label={`${selectedTicker.s} details`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                  {selectedTicker.s.replace("USDT", "/USDT")}
                </h2>
                {selectedTicker.is_futures && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    PERP
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <span className="block text-xs text-muted-foreground">Price</span>
                  <span className="font-mono">${formatPrice(selectedTicker.price)}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">{timeframe} change</span>
                  {formatPercentage(timeframe === "7d" ? selectedTicker.change_7d : selectedTicker.change_24h)}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">24h volume</span>
                  <span className="font-mono">${formatNumber(selectedTicker.volume_usd)}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">24h range</span>
                  <span className="font-mono">
                    ${formatPrice(selectedTicker.low_24h)}–${formatPrice(selectedTicker.high_24h)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleSave(selectedTicker.s)}>
                <BookmarkPlus className="mr-2 h-4 w-4" />
                {isLoggedIn ? "Add to watchlist" : "Sign in to save"}
              </Button>
              <Button size="sm" onClick={() => handleOpenTerminal(selectedTicker.s)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Terminal
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close details"
                onClick={() => setSelectedSymbol(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Analyze result notification */}
      {analyzeResult && (
        <div
          className={cn(
            "px-4 py-2 rounded-lg text-sm flex items-center gap-2",
            analyzeResult.success
              ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="font-medium">{analyzeResult.symbol}:</span>
          <span>{analyzeResult.message}</span>
        </div>
      )}

      {table.getFilteredRowModel().rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium text-foreground">No matching instruments</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear the search or direction filter to continue scanning.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery("");
              setSelectedSymbol(null);
              setDirection(null);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                    className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        disabled={!header.column.getCanSort()}
                        className={cn(
                          "flex items-center gap-1",
                          header.column.getCanSort() &&
                            "cursor-pointer select-none"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: <ChevronUp className="h-4 w-4" />,
                          desc: <ChevronDown className="h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="mt-4 flex items-center justify-between flex-wrap gap-4 text-sm">
        <div className="text-muted-foreground">
          Showing {table.getRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} matching pairs
        </div>
        {table.getFilteredRowModel().rows.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="text-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}
