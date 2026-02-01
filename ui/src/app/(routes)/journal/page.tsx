"use client";

import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  ShieldCheck,
  BookOpen,
  LineChart,
  History,
  AlertTriangle,
  Lightbulb
} from "lucide-react";

export default function AnalystDeskPage() {
  return (
    <div className="relative">
      {/* Watermark */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
        <h1 className="select-none text-[15vw] font-black uppercase text-foreground/10 -rotate-12">
          Boilerplate
        </h1>
      </div>

      <div className="relative z-10 mb-12 text-left">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="info" className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-500 border-blue-500/20 bg-blue-500/5">
            Trade Journal
          </Badge>
          <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
        </div>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Performance <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Review</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
          Analyze your past execution, refine your technical edge, and build a master trade journal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-10">
        <EnhancedCard hoverable>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Win Rate (Last 20)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold">55%</span>
              <span className="text-xs font-medium text-green-500 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" /> +2.5%
              </span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-green-500 w-[55%]" />
            </div>
          </div>
        </EnhancedCard>

        <EnhancedCard hoverable>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Profit Factor</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold">1.8</span>
              <Badge variant="success" className="ml-auto">Healthy</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Gross Profit / Gross Loss</p>
          </div>
        </EnhancedCard>

        <EnhancedCard hoverable>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Avg Risk:Reward</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold">1:2.5</span>
              <span className="text-xs font-medium text-muted-foreground">Target: 1:3</span>
            </div>
            <div className="flex gap-1 mt-3">
              <div className="h-1.5 flex-1 bg-red-400 rounded-l-full" />
              <div className="h-1.5 flex-[2.5] bg-green-500 rounded-r-full" />
            </div>
          </div>
        </EnhancedCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-500" />
              <h2 className="text-xl font-bold">Recent Trades</h2>
            </div>
            <Badge variant="neutral" className="cursor-pointer hover:bg-muted">View All</Badge>
          </div>
          <div className="space-y-4">
            {[
              { asset: "BTC/USDT", type: "Long", result: "Win", r: "2.8R", setup: "Supply Zone S/R Flip", date: "2h ago" },
              { asset: "ETH/USDT", type: "Short", result: "Loss", r: "-1.0R", setup: "Bearish Div + 15m Break", date: "5h ago" },
              { asset: "SOL/USDT", type: "Long", result: "Win", r: "3.2R", setup: "Golden Pocket Retrace", date: "1d ago" },
              { asset: "LINK/USDT", type: "Long", result: "Break Even", r: "0.0R", setup: "Trendline Bounce", date: "1d ago" },
            ].map((trade, i) => (
              <div key={i} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent/5 transition-all cursor-pointer">
                <div className="flex items-center gap-4 mb-3 sm:mb-0">
                  <div className={`h-10 w-1 rounded-full ${trade.result === "Win" ? "bg-green-500" :
                    trade.result === "Loss" ? "bg-red-500" : "bg-yellow-500"
                    }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{trade.asset}</span>
                      <Badge variant={trade.type === "Long" ? "success" : "danger"} className="text-[10px] px-1.5 py-0">
                        {trade.type}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                      <BookOpen className="h-3 w-3" />
                      {trade.setup}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                  <div className="text-right">
                    <div className={`font-bold ${trade.result === "Win" ? "text-green-500" :
                      trade.result === "Loss" ? "text-red-500" : "text-yellow-500"
                      }`}>
                      {trade.result === "Win" ? "+" : ""}{trade.r}
                    </div>
                    <div className="text-xs text-muted-foreground">{trade.date}</div>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <LineChart className="h-4 w-4 text-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <h2 className="text-xl font-bold">Strategy Insights</h2>
          </div>

          <div className="rounded-2xl border bg-gradient-to-b from-card to-transparent p-1 overflow-hidden">
            <div className="bg-card/50 rounded-xl p-5 space-y-6">
              <div>
                <h3 className="flex items-center gap-2 font-bold text-sm text-green-500 mb-2">
                  <ShieldCheck className="h-4 w-4" />
                  What&apos;s Working
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Entries on <strong>15m Order Blocks</strong> aligned with 4H structure are yielding the highest R:R. Patience in waiting for the retest is paying off.
                </p>
              </div>

              <div className="h-px w-full bg-border/50" />

              <div>
                <h3 className="flex items-center gap-2 font-bold text-sm text-orange-500 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Needs Improvement
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong>Stop Loss Management:</strong> You are moving stops to breakeven too early on trend continuations, getting wicked out before the expansion.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-dashed">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Weekly Journal Score</span>
                  <span className="text-foreground">8.5/10</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full mt-2">
                  <div className="h-full bg-blue-500 w-[85%]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
