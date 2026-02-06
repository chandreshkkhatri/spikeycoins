"use client";

import EnhancedCard from "@/components/enhanced-card";
import { TrendingUp, TrendingDown, Target, BarChart3 } from "lucide-react";
import type { JournalStats } from "./types";

function formatPnl(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

interface StatsCardsProps {
  stats: JournalStats | null;
  loading: boolean;
}

export default function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <EnhancedCard key={i} hoverable={false}>
            <div className="animate-pulse space-y-3">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-8 w-20 rounded bg-muted" />
              <div className="h-1.5 w-full rounded bg-muted" />
            </div>
          </EnhancedCard>
        ))}
      </div>
    );
  }

  const winRatePercent = (stats.winRate * 100).toFixed(1);
  const profitFactorDisplay =
    stats.profitFactor === Infinity
      ? "---"
      : stats.profitFactor.toFixed(2);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Total Net PnL */}
      <EnhancedCard hoverable>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Net P&L
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-2xl font-bold ${stats.totalNetPnl >= 0 ? "text-green-500" : "text-red-500"}`}
            >
              {formatPnl(stats.totalNetPnl)}
            </span>
            <span className="text-xs text-muted-foreground">USDT</span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Comm: {stats.totalCommission.toFixed(2)}</span>
            <span>Avg: {formatDuration(stats.avgDuration)}</span>
          </div>
        </div>
      </EnhancedCard>

      {/* Win Rate */}
      <EnhancedCard hoverable>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Win Rate
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold">{winRatePercent}%</span>
            <span className="text-xs text-muted-foreground">
              {stats.winCount}W / {stats.lossCount}L
            </span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.min(100, stats.winRate * 100)}%` }}
            />
          </div>
        </div>
      </EnhancedCard>

      {/* Profit Factor */}
      <EnhancedCard hoverable>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Profit Factor
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold">{profitFactorDisplay}</span>
            {stats.profitFactor !== Infinity && stats.profitFactor > 0 && (
              <span
                className={`text-xs font-medium flex items-center ${stats.profitFactor >= 1 ? "text-green-500" : "text-red-500"}`}
              >
                {stats.profitFactor >= 1 ? (
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                )}
                {stats.profitFactor >= 1 ? "Healthy" : "Below 1"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Gross Profit / Gross Loss
          </p>
        </div>
      </EnhancedCard>

      {/* Total Trades */}
      <EnhancedCard hoverable>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Trades
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold">{stats.totalTrades}</span>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-green-500">
              Best: +{stats.largestWin.toFixed(2)}
            </span>
            <span className="text-red-500">
              Worst: {stats.largestLoss.toFixed(2)}
            </span>
          </div>
        </div>
      </EnhancedCard>
    </div>
  );
}
