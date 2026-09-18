"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProcessVsPnlChart, ProcessVsPnlPoint } from "@/components/gym/process-vs-pnl-chart";
import api from "@/lib/api";
import { API_ROUTES } from "@/lib/constants";
import { Trophy, TrendingUp, ArrowLeft, Shield, BarChart3, Activity } from "lucide-react";
import Link from "next/link";

export default function GymStatsPage() {
  const [stats, setStats] = useState<{
    totalSessions: number;
    completedSessions: number;
    totalTrades: number;
    winRate: number;
    totalRPnL: number;
    totalPctPnL: number;
    meanExpectancyR: number;
    meanProcessScore: number | null;
    correlation: number | null;
  } | null>(null);

  const [chartData, setChartData] = useState<ProcessVsPnlPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const [statsRes, chartRes] = await Promise.all([
          api.get(API_ROUTES.gym.stats),
          api.get(API_ROUTES.gym.processVsPnlChart),
        ]);

        if (statsRes.data?.success) {
          setStats(statsRes.data.stats);
        }
        if (chartRes.data?.success) {
          setChartData(chartRes.data.data || []);
        }
      } catch (err) {
        console.error("[GymStatsPage] Error loading stats:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/gym">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Gym Performance & Process Correlation
            </h1>
            <p className="text-xs text-muted-foreground">
              Across-session methodology metrics evaluated strictly in % of Capital and R-Multiples.
            </p>
          </div>
        </div>
      </div>

      {/* Aggregate Stat Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Mean Process Score</span>
          <span className="text-2xl font-bold font-mono">
            {stats?.meanProcessScore != null ? `${stats.meanProcessScore}/100` : "N/A"}
          </span>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Expectancy / Trade</span>
          <span className={`text-2xl font-bold font-mono ${(stats?.meanExpectancyR || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {(stats?.meanExpectancyR || 0) >= 0 ? "+" : ""}
            {stats?.meanExpectancyR || 0}R
          </span>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Win Rate</span>
          <span className="text-2xl font-bold font-mono">{stats?.winRate || 0}%</span>
          <span className="text-[10px] text-muted-foreground block">
            {stats?.totalTrades || 0} total trades
          </span>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Cumulative P&L</span>
          <span className={`text-2xl font-bold font-mono ${(stats?.totalPctPnL || 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {(stats?.totalPctPnL || 0) >= 0 ? "+" : ""}
            {stats?.totalPctPnL || 0}%
          </span>
        </div>
      </div>

      {/* Process Score vs PnL Correlation Chart */}
      <ProcessVsPnlChart data={chartData} correlation={stats?.correlation ?? null} />
    </div>
  );
}
