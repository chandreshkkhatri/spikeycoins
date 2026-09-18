"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GymChart } from "@/components/gym/gym-chart";
import { RiskPanel } from "@/components/gym/risk-panel";
import { FreeTradeForm } from "@/components/gym/free-trade-form";
import { ThesisForm } from "@/components/gym/thesis-form";
import { TradeList } from "@/components/gym/trade-list";
import { SessionScorecard } from "@/components/gym/session-scorecard";
import { useGymSession } from "@/components/gym/use-gym-session";
import {
  Play,
  ChevronRight,
  ChevronsRight,
  Eye,
  XCircle,
  AlertTriangle,
  Target,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";

export default function TradingGymPage() {
  const {
    session,
    loading,
    actionLoading,
    error,
    governorRejection,
    startNewSession,
    advanceSession,
    placeTrade,
    cancelPendingTrade,
    closeOpenTrade,
    modifyStop,
    abandonSession,
    revealSession,
    clearError,
  } = useGymSession();

  const [splitView, setSplitView] = useState<boolean>(false);

  const isLegacySession = session?.schemaVersion === 1;
  const isHalted = session?.mode === "METHOD" && session.governor?.isHalted;
  const hasActiveTrade = session?.trades.some((trade) => trade.status === "OPEN" || trade.status === "PENDING");

  const currentCandle =
    session && session.candles.length > 0
      ? session.candles[session.currentCandleIndex - 1]
      : null;

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Trading Gym (Methodology Trainer)</h1>
          {session && (
            <Badge variant={session.mode === "METHOD" ? "success" : "neutral"} className="text-xs">
              {session.mode} MODE
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/gym/drills">
            <Button variant="outline" size="sm" className="text-xs h-8">
              <Target className="h-3.5 w-3.5 mr-1" /> TA Drills
            </Button>
          </Link>
          <Link href="/gym/stats">
            <Button variant="outline" size="sm" className="text-xs h-8">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> Stats & Correlation
            </Button>
          </Link>

          {!session || session.status !== "ACTIVE" ? (
            <Button
              size="sm"
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => startNewSession("METHOD")}
              disabled={actionLoading}
            >
              <Play className="h-3.5 w-3.5 mr-1" /> Start Methodology Session
            </Button>
          ) : (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs h-8"
                onClick={abandonSession}
                disabled={actionLoading}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Abandon
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-amber-600 hover:bg-amber-700"
                onClick={revealSession}
                disabled={actionLoading}
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Reveal & End
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Legacy Session Banner */}
      {isLegacySession && session?.status === "ACTIVE" && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Legacy un-gated session (v1). Finish or abandon to start a methodology session.</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={revealSession}>
            Reveal & Upgrade
          </Button>
        </div>
      )}

      {/* Governor Halt Banner */}
      {isHalted && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-500 text-xs font-semibold">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{session.governor?.haltReason || "Session halted by mechanical risk governor."}</span>
        </div>
      )}

      {/* Governor Rejection Error Banner */}
      {governorRejection && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-500 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{governorRejection.reason}</span>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {error && !governorRejection && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {loading ? <p>Loading session…</p> : !session ? (
        <div className="rounded-lg border bg-card p-12 text-center space-y-4">
          <Play className="h-12 w-12 mx-auto text-primary opacity-50" />
          <h3 className="text-lg font-semibold">No Active Gym Session</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Train your discretionary trading process. Declare a thesis before entry while the mechanical governor enforces risk limits.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => startNewSession("METHOD")} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
              Start Method Session
            </Button>
            <Button variant="outline" disabled={actionLoading} onClick={() => startNewSession("FREE")}>
              Start Free Sandbox
            </Button>
          </div>
        </div>
      ) : session.status !== "ACTIVE" ? (
        <div className="space-y-4">
          {session.status === "COMPLETED" && (
            <Button onClick={revealSession} disabled={actionLoading}>Reveal Symbol</Button>
          )}
          <SessionScorecard
            scorecard={session.scorecard ?? null}
            totalPnlCash={session.totalPnlCash ?? 0}
            totalR={session.totalR ?? 0}
            startingCapital={session.startingCapital ?? 100000}
            actualSymbol={session.actualSymbol}
          />
          <GymChart candles={session.candles} height={450} />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Main Chart Area */}
          <div className="col-span-8 space-y-3">
            <div className="flex items-center justify-between bg-card p-2.5 rounded-lg border text-xs">
              <div className="flex items-center gap-3 font-mono">
                <span>Interval: <strong className="text-foreground">{session.interval}</strong></span>
                <span>Candle: <strong className="text-foreground">{session.currentCandleIndex}/{session.totalCandles}</strong></span>
                {currentCandle && (
                  <span>Price: <strong className="text-foreground">{currentCandle.close.toFixed(2)}</strong></span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setSplitView(!splitView)}
                >
                  {splitView ? "Single View" : "Split View"}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => advanceSession(1)}
                  disabled={actionLoading}
                >
                  <ChevronRight className="h-3.5 w-3.5 mr-0.5" /> +1
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => advanceSession(5)}
                  disabled={actionLoading}
                >
                  <ChevronsRight className="h-3.5 w-3.5 mr-0.5" /> +5
                </Button>
              </div>
            </div>

            {/* Charts */}
            <div className="space-y-3">
              <GymChart candles={session.candles} height={splitView ? 320 : 480} />

              {splitView && session.higherCandles && session.higherCandles.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">
                    HIGHER TIMEFRAME ({session.higherInterval})
                  </span>
                  <GymChart candles={session.higherCandles} height={200} />
                </div>
              )}
            </div>

            {/* Trade List Component */}
            <TradeList
              trades={session.trades}
              onModifyStop={modifyStop}
              onCloseTrade={closeOpenTrade}
              onCancelTrade={cancelPendingTrade}
              disabled={actionLoading}
            />
          </div>

          {/* Right Control Panels */}
          <div className="col-span-4 space-y-4">
            <RiskPanel session={session} entryPrice={currentCandle?.close} />

            {session.mode === "METHOD" ? (
              <ThesisForm
                sessionId={session.id}
                currentPrice={currentCandle?.close || 100}
                onSubmitTrade={async (params) => { await placeTrade(params); }}
                disabled={Boolean(isHalted || actionLoading || hasActiveTrade)}
              />
            ) : (
              <FreeTradeForm
                key={session.id}
                currentPrice={currentCandle?.close || 100}
                onSubmitTrade={placeTrade}
                disabled={Boolean(actionLoading || hasActiveTrade)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
