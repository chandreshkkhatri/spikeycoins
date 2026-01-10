import { useState, useCallback, useEffect } from "react";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import {
  Play,
  TrendingUp,
  TrendingDown,
  X,
  Eye,
  RefreshCw,
  Trophy,
  Target,
  Loader2,
} from "lucide-react";
import { createChart, CandlestickSeries, CandlestickData, Time } from "lightweight-charts";

// Types
interface GymTrade {
  entryCandle: number;
  exitCandle: number | null;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnl: number | null;
  status: "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT";
}

interface GymSession {
  id: string;
  interval: string;
  currentCandleIndex: number;
  totalCandles: number;
  candles: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
  }>;
  trades: GymTrade[];
  totalPnl: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED";
  actualSymbol?: string;
  actualStartTimestamp?: number;
}

// Mini chart component for the 4-chart grid
function GymChart({
  candles,
  trades,
  title,
}: {
  candles: GymSession["candles"];
  trades: GymTrade[];
  title: string;
}) {
  const chartContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || candles.length === 0) return;

      // Clear previous chart
      node.innerHTML = "";

      const chart = createChart(node, {
        width: node.clientWidth,
        height: 200,
        layout: {
          background: { color: "transparent" },
          textColor: "#9ca3af",
        },
        grid: {
          vertLines: { color: "rgba(255, 255, 255, 0.05)" },
          horzLines: { color: "rgba(255, 255, 255, 0.05)" },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: "rgba(255, 255, 255, 0.1)",
        },
        timeScale: {
          borderColor: "rgba(255, 255, 255, 0.1)",
          timeVisible: false,
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#f43f5e",
        borderUpColor: "#10b981",
        borderDownColor: "#f43f5e",
        wickUpColor: "#10b981",
        wickDownColor: "#f43f5e",
      });

      const chartData: CandlestickData[] = candles.map((c, i) => ({
        time: i as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      candleSeries.setData(chartData);

      // Add trade markers
      const openTrade = trades.find((t) => t.status === "OPEN");
      if (openTrade) {
        // Entry line
        candleSeries.createPriceLine({
          price: openTrade.entryPrice,
          color: openTrade.side === "LONG" ? "#22c55e" : "#ef4444",
          lineWidth: 2,
          lineStyle: 0,
          title: `Entry`,
        });
        // SL line
        candleSeries.createPriceLine({
          price: openTrade.stopLoss,
          color: "#ec4899",
          lineWidth: 1,
          lineStyle: 2,
          title: "SL",
        });
        // TP line
        candleSeries.createPriceLine({
          price: openTrade.takeProfit,
          color: "#3b82f6",
          lineWidth: 1,
          lineStyle: 2,
          title: "TP",
        });
      }

      chart.timeScale().fitContent();

      // Cleanup
      return () => chart.remove();
    },
    [candles, trades]
  );

  return (
    <div className="rounded-lg border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 bg-white/5">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <div ref={chartContainerRef} className="w-full" style={{ height: 200 }} />
    </div>
  );
}

export default function TradingGymPage() {
  const { user } = useAuth();
  const [session, setSession] = useState<GymSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trade form state
  const [tradeMode, setTradeMode] = useState<"LONG" | "SHORT" | null>(null);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  // Get current price
  const currentPrice = session?.candles[session.currentCandleIndex - 1]?.close ?? 0;

  // Create new session
  const createSession = async () => {
    if (!user?._id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.post("/gym/session/new", { userId: user._id });
      if (response.data.success) {
        setSession(response.data.session);
        setTradeMode(null);
        setStopLoss("");
        setTakeProfit("");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create session");
    } finally {
      setLoading(false);
    }
  };

  // Wait (advance time)
  const handleWait = async (candles: number = 1) => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await api.post(`/gym/session/${session.id}/wait`, {
        candlesToAdvance: candles,
      });
      if (response.data.success) {
        setSession(response.data.session);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to advance");
    } finally {
      setLoading(false);
    }
  };

  // Place trade
  const handlePlaceTrade = async () => {
    if (!session || !tradeMode) return;

    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);

    if (isNaN(sl) || isNaN(tp)) {
      setError("Please enter valid SL and TP prices");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/gym/session/${session.id}/trade`, {
        side: tradeMode,
        stopLoss: sl,
        takeProfit: tp,
      });
      if (response.data.success) {
        setSession((prev) =>
          prev ? { ...prev, trades: response.data.session.trades } : null
        );
        setTradeMode(null);
        setStopLoss("");
        setTakeProfit("");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to place trade");
    } finally {
      setLoading(false);
    }
  };

  // Close trade
  const handleCloseTrade = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await api.post(`/gym/session/${session.id}/close`);
      if (response.data.success) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                trades: response.data.session.trades,
                totalPnl: response.data.session.totalPnl,
              }
            : null
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to close trade");
    } finally {
      setLoading(false);
    }
  };

  // Reveal session
  const handleReveal = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await api.post(`/gym/session/${session.id}/reveal`);
      if (response.data.success) {
        setSession(response.data.session);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to reveal");
    } finally {
      setLoading(false);
    }
  };

  const openTrade = session?.trades.find((t) => t.status === "OPEN");
  const isRevealed = session?.status === "REVEALED";

  // Auto-suggest SL/TP based on current price
  useEffect(() => {
    if (tradeMode && currentPrice > 0) {
      const slOffset = currentPrice * 0.02; // 2% default
      const tpOffset = currentPrice * 0.04; // 4% default
      if (tradeMode === "LONG") {
        setStopLoss((currentPrice - slOffset).toFixed(2));
        setTakeProfit((currentPrice + tpOffset).toFixed(2));
      } else {
        setStopLoss((currentPrice + slOffset).toFixed(2));
        setTakeProfit((currentPrice - tpOffset).toFixed(2));
      }
    }
  }, [tradeMode, currentPrice]);

  return (
    <PageLayout>
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
          <div className="flex items-center gap-3">
            {session && (
              <Badge
                variant={session.totalPnl >= 0 ? "success" : "danger"}
                className="text-lg px-4 py-1"
              >
                <Trophy className="w-4 h-4 mr-1" />
                {session.totalPnl >= 0 ? "+" : ""}
                {session.totalPnl.toFixed(2)}
              </Badge>
            )}
            <Button onClick={createSession} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              New Session
            </Button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-500">
            {error}
          </div>
        )}

        {/* No session state */}
        {!session && !loading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <Target className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Start a Practice Session</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              You'll see obfuscated chart data from a random instrument and time period.
              Make predictions, place virtual trades, and track your score!
            </p>
            <Button size="lg" onClick={createSession}>
              <Play className="w-5 h-5 mr-2" />
              Start Training
            </Button>
          </div>
        )}

        {/* Session active */}
        {session && (
          <>
            {/* Revealed info banner */}
            {isRevealed && (
              <div className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-4">
                  <Eye className="w-5 h-5 text-primary" />
                  <div>
                    <span className="font-semibold">Revealed: </span>
                    <span className="text-primary font-mono">
                      {session.actualSymbol}
                    </span>
                    <span className="text-muted-foreground mx-2">•</span>
                    <span className="text-muted-foreground">
                      {new Date(session.actualStartTimestamp!).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Chart Grid - 2x2 for multi-timeframe feel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GymChart
                candles={session.candles}
                trades={session.trades}
                title={`Chart • ${session.interval} • Candle ${session.currentCandleIndex}/${session.totalCandles}`}
              />
              <GymChart
                candles={session.candles.slice(
                  Math.max(0, session.currentCandleIndex - 50),
                  session.currentCandleIndex
                )}
                trades={session.trades}
                title="Zoomed View (Last 50)"
              />
            </div>

            {/* Current Price Display */}
            <div className="flex items-center justify-center gap-4 py-2">
              <span className="text-muted-foreground">Current Price:</span>
              <span className="text-2xl font-bold font-mono text-primary">
                ${currentPrice.toFixed(2)}
              </span>
            </div>

            {/* Controls */}
            {!isRevealed && (
              <div className="rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm p-4">
                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
                  <Button
                    variant="outline"
                    onClick={() => handleWait(1)}
                    disabled={loading || !!openTrade}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Wait +1
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleWait(5)}
                    disabled={loading || !!openTrade}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Wait +5
                  </Button>
                  <Button
                    variant="success"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setTradeMode("LONG")}
                    disabled={loading || !!openTrade}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Long
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setTradeMode("SHORT")}
                    disabled={loading || !!openTrade}
                  >
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Short
                  </Button>
                </div>

                {/* Trade Form */}
                {tradeMode && !openTrade && (
                  <div className="flex flex-wrap items-end justify-center gap-3 border-t border-white/10 pt-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Stop Loss
                      </label>
                      <Input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        className="w-28"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Take Profit
                      </label>
                      <Input
                        type="number"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        className="w-28"
                        step="0.01"
                      />
                    </div>
                    <Button
                      onClick={handlePlaceTrade}
                      disabled={loading}
                      className={
                        tradeMode === "LONG"
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-red-600 hover:bg-red-700"
                      }
                    >
                      Confirm {tradeMode}
                    </Button>
                    <Button variant="ghost" onClick={() => setTradeMode(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Open Trade Display */}
                {openTrade && (
                  <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 pt-4">
                    <Badge
                      variant={openTrade.side === "LONG" ? "success" : "danger"}
                    >
                      {openTrade.side} @ ${openTrade.entryPrice.toFixed(2)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      SL: ${openTrade.stopLoss.toFixed(2)} | TP: $
                      {openTrade.takeProfit.toFixed(2)}
                    </span>
                    <Button variant="outline" onClick={() => handleWait(1)} disabled={loading}>
                      Wait +1
                    </Button>
                    <Button variant="secondary" onClick={handleCloseTrade} disabled={loading}>
                      Close Trade
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Trade History */}
            {session.trades.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm p-4">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Trade History
                </h3>
                <div className="flex flex-wrap gap-2">
                  {session.trades.map((trade, i) => (
                    <Badge
                      key={i}
                      variant={
                        trade.status === "OPEN"
                          ? "neutral"
                          : trade.pnl !== null && trade.pnl >= 0
                          ? "success"
                          : "danger"
                      }
                    >
                      #{i + 1} {trade.side}{" "}
                      {trade.pnl !== null ? `${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}` : "Open"}
                      {trade.status === "STOPPED_OUT" && " (SL)"}
                      {trade.status === "TARGET_HIT" && " (TP)"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Reveal Button */}
            {!isRevealed && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={handleReveal}>
                  <Eye className="w-4 h-4 mr-2" />
                  Reveal & End Session
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
