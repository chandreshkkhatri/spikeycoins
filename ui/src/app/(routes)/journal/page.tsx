"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/contexts/account-context";
import { useAuth } from "@/contexts/auth-context";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import StatsCards from "@/components/journal/stats-cards";
import TradesTable from "@/components/journal/trades-table";
import EquityChart from "@/components/journal/equity-chart";
import DailyPnlChart from "@/components/journal/daily-pnl-chart";
import SyncButton from "@/components/journal/sync-button";
import type {
  JournalTrade,
  JournalStats,
  SyncStatus,
  ChartDataPoint,
  JournalPeriod,
} from "@/components/journal/types";

const PERIODS: { value: JournalPeriod; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

const AUTO_SYNC_STALE_MS = 5 * 60 * 1000; // 5 minutes

export default function JournalPage() {
  const { selectedAccount } = useAccount();
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  const [period, setPeriod] = useState<JournalPeriod>("30d");
  const [chartTab, setChartTab] = useState<"equity" | "daily">("equity");

  // Data state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [equityData, setEquityData] = useState<ChartDataPoint[]>([]);
  const [dailyPnlData, setDailyPnlData] = useState<ChartDataPoint[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  } | null>(null);

  // Loading state
  const [statsLoading, setStatsLoading] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [chartsLoading, setChartsLoading] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState("entryTime");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const autoSyncDone = useRef(false);

  const accountId = selectedAccount?._id;
  const isFutures =
    selectedAccount?.accountType === "binance" &&
    selectedAccount?.metadata?.tradingSegment === "usdm";

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    if (!accountId) return null;
    try {
      const res = await api.get(`/journal/sync/status?accountId=${accountId}`);
      const status = res.data.sync as SyncStatus;
      setSyncStatus(status);
      return status;
    } catch {
      return null;
    }
  }, [accountId]);

  // Fetch all journal data
  const fetchData = useCallback(async () => {
    if (!accountId) return;

    const periodParam = period === "all" ? "" : `&period=${period}`;

    setStatsLoading(true);
    setTradesLoading(true);
    setChartsLoading(true);

    try {
      const [statsRes, tradesRes, equityRes, dailyRes] = await Promise.all([
        api.get(`/journal/stats?accountId=${accountId}${periodParam}`),
        api.get(
          `/journal/trades?accountId=${accountId}&status=CLOSED&page=${page}&pageSize=20&sortBy=${sortBy}&sortOrder=${sortOrder}`,
        ),
        api.get(
          `/journal/chart/equity?accountId=${accountId}${periodParam}`,
        ),
        api.get(
          `/journal/chart/daily-pnl?accountId=${accountId}${periodParam}`,
        ),
      ]);

      setStats(statsRes.data.stats);
      setTrades(tradesRes.data.trades);
      setPagination(tradesRes.data.pagination);
      setEquityData(equityRes.data.data);
      setDailyPnlData(dailyRes.data.data);
    } catch (err) {
      console.error("Failed to fetch journal data:", err);
    } finally {
      setStatsLoading(false);
      setTradesLoading(false);
      setChartsLoading(false);
    }
  }, [accountId, period, page, sortBy, sortOrder]);

  // Handle sync
  const handleSync = useCallback(async () => {
    if (!accountId) return;
    try {
      await api.post("/journal/sync", { accountId });
      await fetchSyncStatus();
      await fetchData();
    } catch (err: any) {
      console.error("Sync failed:", err);
      await fetchSyncStatus();
    }
  }, [accountId, fetchSyncStatus, fetchData]);

  // Auto-sync on mount if stale
  useEffect(() => {
    if (!accountId || !isFutures || autoSyncDone.current) return;

    const autoSync = async () => {
      autoSyncDone.current = true;
      const status = await fetchSyncStatus();

      if (
        !status?.initialSyncCompleted ||
        (status.lastSyncTime &&
          Date.now() - status.lastSyncTime > AUTO_SYNC_STALE_MS)
      ) {
        // Trigger sync, then fetch data
        try {
          await api.post("/journal/sync", { accountId });
          await fetchSyncStatus();
        } catch {
          // Ignore — might already be syncing
        }
      }

      await fetchData();
    };

    autoSync();
  }, [accountId, isFutures, fetchSyncStatus, fetchData]);

  // Reset auto-sync flag when account changes
  useEffect(() => {
    autoSyncDone.current = false;
  }, [accountId]);

  // Refetch data when period/sort/page changes (but not on initial mount)
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (accountId && isFutures) {
      fetchData();
    }
  }, [period, page, sortBy, sortOrder]);

  // Handle sort toggle
  const handleSort = useCallback(
    (field: string) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy],
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Not logged in or no account selected
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!selectedAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          Select a trading account to view your journal
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect a Binance Futures account from the Brokers page
        </p>
      </div>
    );
  }

  if (!isFutures) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          Journal is currently available for Binance Futures accounts only
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a USDM Futures account to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge
              variant="info"
              className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-500 border-blue-500/20 bg-blue-500/5"
            >
              Trade Journal
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Performance{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Review
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setPeriod(p.value);
                  setPage(1);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <SyncButton
            syncStatus={syncStatus}
            onSync={handleSync}
            disabled={!isFutures}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} loading={statsLoading} />

      {/* Charts */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border px-4 py-2">
          <button
            onClick={() => setChartTab("equity")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              chartTab === "equity"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Equity Curve
          </button>
          <button
            onClick={() => setChartTab("daily")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              chartTab === "daily"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Daily P&L
          </button>
        </div>
        <div className="p-4">
          {chartTab === "equity" ? (
            <EquityChart data={equityData} loading={chartsLoading} />
          ) : (
            <DailyPnlChart data={dailyPnlData} loading={chartsLoading} />
          )}
        </div>
      </div>

      {/* Trades Table */}
      <div>
        <h2 className="text-lg font-bold mb-3">Trades</h2>
        <TradesTable
          trades={trades}
          loading={tradesLoading}
          pagination={pagination}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}
