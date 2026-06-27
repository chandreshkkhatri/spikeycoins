"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  CandlestickData,
  UTCTimestamp,
  PriceLineOptions,
  LineStyle,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import api from "@/lib/api";
import {
  Play,
  RefreshCw,
  Trophy,
  Target,
  ChevronRight,
  ChevronsRight,
  Eye,
  X,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────

interface GymCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface GymTrade {
  entryCandle: number;
  exitCandle: number | null;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnl: number | null;
  status: "PENDING" | "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT" | "CANCELED";
  type: "MARKET" | "LIMIT";
}

interface GymSession {
  id: string;
  interval: string;
  currentCandleIndex: number;
  totalCandles: number;
  candles: GymCandle[];
  lowerInterval?: string;
  lowerCandles?: GymCandle[];
  higherInterval?: string;
  higherCandles?: GymCandle[];
  trades: GymTrade[];
  totalPnl: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED";
  actualSymbol?: string;
  actualStartTimestamp?: number;
  priceMultiplier?: number;
}

interface SessionSummary {
  id: string;
  interval: string;
  status: string;
  totalPnl: number;
  createdAt: string;
  actualSymbol?: string;
}

// ── Chart Component ────────────────────────────────

function GymChart({
  candles,
  trades,
  height = 400,
}: {
  candles: GymCandle[];
  trades: GymTrade[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
        horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      },
      width: containerRef.current.clientWidth,
      height: height,
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        horzLine: { visible: true, labelVisible: true },
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    seriesRef.current = series;

    // Use candle index as time (timestamps are already indices from obfuscation)
    const chartData: CandlestickData[] = candles.map((c, i) => ({
      time: i as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    series.setData(chartData);

    // Draw price lines for active or pending trade SL/TP
    const activeTrade = trades.find((t) => t.status === "OPEN" || t.status === "PENDING");
    if (activeTrade) {
      const entryLineOpts: PriceLineOptions = {
        price: activeTrade.entryPrice,
        color: activeTrade.status === "PENDING" ? "#c084fc" : "#3b82f6", // purple for pending limit, blue for open
        lineWidth: 1,
        lineStyle: activeTrade.status === "PENDING" ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: activeTrade.status === "PENDING" ? "Limit" : "Entry",
        lineVisible: true,
        axisLabelColor: activeTrade.status === "PENDING" ? "#c084fc" : "#3b82f6",
        axisLabelTextColor: "#ffffff",
      };
      series.createPriceLine(entryLineOpts);

      const slLineOpts: PriceLineOptions = {
        price: activeTrade.stopLoss,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "SL",
        lineVisible: true,
        axisLabelColor: "#ef4444",
        axisLabelTextColor: "#ffffff",
      };
      series.createPriceLine(slLineOpts);

      const tpLineOpts: PriceLineOptions = {
        price: activeTrade.takeProfit,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "TP",
        lineVisible: true,
        axisLabelColor: "#22c55e",
        axisLabelTextColor: "#ffffff",
      };
      series.createPriceLine(tpLineOpts);
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [candles, trades, height]);

  return <div ref={containerRef} />;
}

// ── Main Page ──────────────────────────────────────

export default function TradingGymPage() {
  const { user } = useAuth();

  const [session, setSession] = useState<GymSession | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layout mode state
  const [layoutMode, setLayoutMode] = useState<"single" | "split">("single");

  // Trade form state
  const [tradeSide, setTradeSide] = useState<"LONG" | "SHORT">("LONG");
  const [tradeType, setTradeType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPriceInput, setLimitPriceInput] = useState("");
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const slTpDirty = useRef(false);

  const currentPrice =
    session && session.candles.length > 0
      ? session.candles[session.candles.length - 1].close
      : 0;

  const activeTrade = session?.trades.find((t) => t.status === "OPEN" || t.status === "PENDING") ?? null;
  const openTrade = session?.trades.find((t) => t.status === "OPEN") ?? null;
  const pendingTrade = session?.trades.find((t) => t.status === "PENDING") ?? null;
  const isActive = session?.status === "ACTIVE";
  const isRevealed = session?.status === "REVEALED";
  const isCompleted = session?.status === "COMPLETED";
  const candlesRemaining = session
    ? session.totalCandles - session.currentCandleIndex
    : 0;

  // Fetch session history
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get("/gym/sessions?limit=10");
      setHistory(res.data.sessions || []);
    } catch {
      // ignore
    }
  }, [user]);

  // Session recovery check on load
  useEffect(() => {
    fetchHistory();
    const checkActiveSession = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const res = await api.get("/gym/session/active");
        if (res.data.session) {
          setSession(res.data.session);
        }
      } catch (err) {
        console.error("Failed to check active session:", err);
      } finally {
        setLoading(false);
      }
    };
    checkActiveSession();
  }, [user, fetchHistory]);

  // Create new session
  const createSession = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/gym/session/new");
      setSession(res.data.session);
      setLimitPriceInput("");
      setSlInput("");
      setTpInput("");
      slTpDirty.current = false;
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Advance candles
  const advanceCandles = useCallback(
    async (count: number) => {
      if (!session || !isActive) return;
      try {
        const res = await api.post(`/gym/session/${session.id}/wait`, {
          candlesToAdvance: count,
        });
        setSession(res.data.session);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to advance");
      }
    },
    [session, isActive],
  );

  // Open trade (MARKET or LIMIT)
  const openNewTrade = useCallback(async () => {
    if (!session || !isActive) return;
    const sl = parseFloat(slInput);
    const tp = parseFloat(tpInput);
    const limitPrice = parseFloat(limitPriceInput);
    
    if (isNaN(sl) || isNaN(tp)) {
      setError("Enter valid SL and TP prices");
      return;
    }
    if (tradeType === "LIMIT" && isNaN(limitPrice)) {
      setError("Enter a valid Limit Price");
      return;
    }
    
    setError(null);
    try {
      const res = await api.post(`/gym/session/${session.id}/trade`, {
        side: tradeSide,
        type: tradeType,
        limitPrice: tradeType === "LIMIT" ? limitPrice : undefined,
        stopLoss: sl,
        takeProfit: tp,
      });
      setSession(res.data.session);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to open trade");
    }
  }, [session, isActive, tradeSide, tradeType, limitPriceInput, slInput, tpInput]);

  // Close trade
  const closeTrade = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const res = await api.post(`/gym/session/${session.id}/close`);
      setSession(res.data.session);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to close trade");
    }
  }, [session]);

  // Cancel pending limit order
  const cancelPendingTrade = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const res = await api.post(`/gym/session/${session.id}/trade/cancel`);
      setSession(res.data.session);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to cancel order");
    }
  }, [session]);

  // Reveal session
  const revealSession = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const res = await api.post(`/gym/session/${session.id}/reveal`);
      setSession(res.data.session);
      fetchHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to reveal");
    }
  }, [session, fetchHistory]);

  // Set default SL/TP and Limit price when side/type changes or price updates (only if user hasn't edited)
  useEffect(() => {
    if (!currentPrice || activeTrade || slTpDirty.current) return;
    
    if (tradeType === "LIMIT" && !limitPriceInput) {
      setLimitPriceInput(currentPrice.toFixed(2));
    }

    const referencePrice = tradeType === "LIMIT" && limitPriceInput ? parseFloat(limitPriceInput) : currentPrice;
    if (isNaN(referencePrice)) return;

    const offset = referencePrice * 0.02; // 2% default
    if (tradeSide === "LONG") {
      setSlInput((referencePrice - offset).toFixed(2));
      setTpInput((referencePrice + offset).toFixed(2));
    } else {
      setSlInput((referencePrice + offset).toFixed(2));
      setTpInput((referencePrice - offset).toFixed(2));
    }
  }, [tradeSide, tradeType, limitPriceInput, currentPrice, activeTrade]);

  // ── No session view ──────────────────────────────

  if (!session) {
    return (
      <div className="flex flex-col gap-6 py-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              Trading Gym
            </h1>
            <p className="text-muted-foreground">
              Practice chart analysis with obfuscated historical data
            </p>
          </div>
        </div>

        {/* Start session CTA */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Target className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            Start a Practice Session
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            You&apos;ll see obfuscated chart data from a random instrument and
            time period. Place virtual trades with SL/TP and track your score!
          </p>
          {user ? (
            <Button size="lg" onClick={createSession} disabled={loading}>
              {loading ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              {loading ? "Loading..." : "Start Training"}
            </Button>
          ) : (
            <div className="text-muted-foreground">
              <p className="mb-4">
                Please log in to start a trading gym session.
              </p>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/login")}
              >
                Sign In
              </Button>
            </div>
          )}
          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Session history */}
        {history.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3">Recent Sessions</h2>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Interval</th>
                    <th className="px-4 py-2 text-left">Symbol</th>
                    <th className="px-4 py-2 text-right">PnL %</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">{s.interval}</td>
                      <td className="px-4 py-2">
                        {s.actualSymbol || "Hidden"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${s.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {s.totalPnl >= 0 ? "+" : ""}
                        {s.totalPnl.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            s.status === "REVEALED"
                              ? "info"
                              : s.status === "ACTIVE"
                                ? "success"
                                : "neutral"
                          }
                          className="text-xs"
                        >
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active session view ──────────────────────────

  const closedTrades = session.trades.filter((t) => t.status !== "OPEN" && t.status !== "PENDING");

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            Trading Gym
          </h1>
          <Badge variant="info" className="text-xs">
            {session.interval}
          </Badge>
          {isRevealed && session.actualSymbol && (
            <Badge variant="neutral" className="text-xs">
              {session.actualSymbol}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={session.totalPnl >= 0 ? "success" : "danger"}
            className="text-sm px-3 py-1"
          >
            <Trophy className="w-3.5 h-3.5 mr-1" />
            {session.totalPnl >= 0 ? "+" : ""}
            {session.totalPnl.toFixed(2)}%
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLayoutMode(layoutMode === "single" ? "split" : "single")}
          >
            {layoutMode === "single" ? "Split View" : "Single View"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSession(null);
              fetchHistory();
            }}
          >
            <X className="w-4 h-4 mr-1" />
            Exit
          </Button>
          <Button size="sm" onClick={createSession} disabled={loading}>
            <RefreshCw
              className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            New
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Charts Layout */}
      {layoutMode === "single" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                Candle {session.currentCandleIndex}/{session.totalCandles}
              </span>
              {candlesRemaining > 0 && (
                <span className="text-xs">({candlesRemaining} remaining)</span>
              )}
            </div>
            <div className="text-sm font-medium">
              Price: {currentPrice.toFixed(2)}
            </div>
          </div>
          <GymChart candles={session.candles} trades={session.trades} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground flex justify-between bg-muted/10">
              <span>LOWER TIMEFRAME ({session.lowerInterval})</span>
              <span>Candles: {session.lowerCandles?.length || 0}</span>
            </div>
            <GymChart candles={session.lowerCandles || []} trades={session.trades} height={280} />
          </div>
          
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold text-primary flex justify-between bg-muted/10">
              <span>MAIN TIMEFRAME ({session.interval})</span>
              <span>Candle {session.currentCandleIndex}/{session.totalCandles}</span>
            </div>
            <GymChart candles={session.candles} trades={session.trades} height={280} />
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground flex justify-between bg-muted/10">
              <span>HIGHER TIMEFRAME ({session.higherInterval})</span>
              <span>Candles: {session.higherCandles?.length || 0}</span>
            </div>
            <GymChart candles={session.higherCandles || []} trades={session.trades} height={280} />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Advance controls */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Advance Time</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => advanceCandles(1)}
              disabled={!isActive}
              className="flex-1"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              +1
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => advanceCandles(5)}
              disabled={!isActive}
              className="flex-1"
            >
              <ChevronsRight className="w-4 h-4 mr-1" />
              +5
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => advanceCandles(10)}
              disabled={!isActive}
              className="flex-1"
            >
              +10
            </Button>
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={revealSession}
              disabled={isRevealed}
              className="w-full"
            >
              <Eye className="w-4 h-4 mr-1" />
              {isRevealed ? "Revealed" : "Reveal & End"}
            </Button>
          </div>
        </div>

        {/* Trade controls */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">
            {activeTrade ? (activeTrade.status === "PENDING" ? "Pending Limit" : "Open Trade") : "Place Trade"}
          </h3>

          {activeTrade ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5">
                  <Badge variant={activeTrade.side === "LONG" ? "success" : "danger"}>
                    {activeTrade.side}
                  </Badge>
                  {activeTrade.status === "PENDING" && (
                    <Badge variant="neutral" className="animate-pulse">
                      PENDING
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {activeTrade.status === "PENDING" ? "Limit Price:" : "Entry Price:"} {activeTrade.entryPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>SL: {activeTrade.stopLoss.toFixed(2)}</span>
                <span>TP: {activeTrade.takeProfit.toFixed(2)}</span>
              </div>
              {activeTrade.status === "PENDING" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelPendingTrade}
                  className="w-full text-destructive border-destructive/20 hover:bg-destructive/10"
                  disabled={!isActive}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel Limit Order
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={closeTrade}
                  className="w-full"
                  disabled={!isActive}
                >
                  Close at {currentPrice.toFixed(2)}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Long / Short Selection */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={tradeSide === "LONG" ? "default" : "outline"}
                  onClick={() => { setTradeSide("LONG"); slTpDirty.current = false; }}
                  className={`flex-1 ${tradeSide === "LONG" ? "bg-green-600 hover:bg-green-700" : ""}`}
                  disabled={!isActive}
                >
                  <TrendingUp className="w-4 h-4 mr-1" />
                  Long
                </Button>
                <Button
                  size="sm"
                  variant={tradeSide === "SHORT" ? "default" : "outline"}
                  onClick={() => { setTradeSide("SHORT"); slTpDirty.current = false; }}
                  className={`flex-1 ${tradeSide === "SHORT" ? "bg-red-600 hover:bg-red-700" : ""}`}
                  disabled={!isActive}
                >
                  <TrendingDown className="w-4 h-4 mr-1" />
                  Short
                </Button>
              </div>

              {/* Order Type Toggle */}
              <div className="flex gap-2 border-t border-b border-border/50 py-2">
                <Button
                  variant={tradeType === "MARKET" ? "default" : "ghost"}
                  onClick={() => { setTradeType("MARKET"); slTpDirty.current = false; }}
                  className="h-7 text-xs flex-1"
                  disabled={!isActive}
                >
                  Market
                </Button>
                <Button
                  variant={tradeType === "LIMIT" ? "default" : "ghost"}
                  onClick={() => { setTradeType("LIMIT"); slTpDirty.current = false; }}
                  className="h-7 text-xs flex-1"
                  disabled={!isActive}
                >
                  Limit
                </Button>
              </div>

              {/* Input Fields */}
              <div className="space-y-2">
                {tradeType === "LIMIT" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Limit Entry Price
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={limitPriceInput}
                      onChange={(e) => { setLimitPriceInput(e.target.value); slTpDirty.current = true; }}
                      disabled={!isActive}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Stop Loss
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={slInput}
                      onChange={(e) => { setSlInput(e.target.value); slTpDirty.current = true; }}
                      disabled={!isActive}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Take Profit
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={tpInput}
                      onChange={(e) => { setTpInput(e.target.value); slTpDirty.current = true; }}
                      disabled={!isActive}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                onClick={openNewTrade}
                disabled={!isActive}
                className="w-full"
              >
                Place {tradeSide} {tradeType} Order
              </Button>
            </div>
          )}
        </div>

        {/* Trade history */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">
            Trade History ({closedTrades.length})
          </h3>
          {closedTrades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No trades yet
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {closedTrades.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={t.side === "LONG" ? "success" : "danger"}
                      className="text-xs px-1.5 py-0"
                    >
                      {t.side}
                    </Badge>
                    <span className="text-muted-foreground">
                      {t.status === "CANCELED" ? "Canceled" : t.status}
                    </span>
                  </div>
                  <span
                    className={`font-medium ${(t.pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}%` : "0.00%"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session ended banner */}
      {(isCompleted || isRevealed) && (
        <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
          <h3 className="text-lg font-bold mb-2">
            {isRevealed ? "Session Revealed" : "Session Complete"}
          </h3>
          {isRevealed && session.actualSymbol && (
            <p className="text-muted-foreground mb-2">
              You were trading{" "}
              <span className="font-semibold text-foreground">
                {session.actualSymbol}
              </span>{" "}
              on the{" "}
              <span className="font-semibold text-foreground">
                {session.interval}
              </span>{" "}
              timeframe
              {session.actualStartTimestamp && (
                <>
                  {" "}
                  starting{" "}
                  <span className="font-semibold text-foreground">
                    {new Date(session.actualStartTimestamp).toLocaleDateString()}
                  </span>
                </>
              )}
            </p>
          )}
          <p className="text-2xl font-bold mb-4">
            <span
              className={
                session.totalPnl >= 0 ? "text-green-500" : "text-red-500"
              }
            >
              {session.totalPnl >= 0 ? "+" : ""}
              {session.totalPnl.toFixed(2)}%
            </span>
          </p>
          {!isRevealed && (
            <Button size="sm" variant="outline" onClick={revealSession}>
              <Eye className="w-4 h-4 mr-1" />
              Reveal Symbol
            </Button>
          )}
          <div className="mt-3">
            <Button onClick={createSession} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              New Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
