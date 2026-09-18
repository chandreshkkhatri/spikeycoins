"use client";

import { Badge } from "@/components/ui/badge";
import { GymScorecard } from "./types";
import { Trophy, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

export interface SessionScorecardProps {
  scorecard: GymScorecard | null;
  totalPnlCash: number;
  totalR: number;
  startingCapital?: number;
  actualSymbol?: string;
}

export function SessionScorecard({
  scorecard,
  totalPnlCash,
  totalR,
  startingCapital = 100000,
  actualSymbol,
}: SessionScorecardProps) {
  const pnlPct = (totalPnlCash / startingCapital) * 100;
  const isGreen = pnlPct >= 0;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" /> Session Reveal & Scorecard
          </h2>
          {actualSymbol && (
            <p className="text-xs text-muted-foreground">
              Revealed Symbol: <span className="font-mono font-bold text-foreground">{actualSymbol}</span>
            </p>
          )}
        </div>
        {scorecard?.methodologyVersion && (
          <Badge variant="neutral" className="text-xs font-mono">
            v{scorecard.methodologyVersion}
          </Badge>
        )}
      </div>

      {/* Side-by-side Headline Tiles (Equal Prominence) */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tile 1: Process Score */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Process Score</span>
          {scorecard?.processScore != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono">{scorecard.processScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
          ) : (
            <div className="py-1">
              <Badge variant="neutral" className="text-xs font-medium">
                Not Scored (0 Trades Executed)
              </Badge>
            </div>
          )}
        </div>

        {/* Tile 2: P&L Outcome */}
        <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
          <span className="text-xs text-muted-foreground block font-medium">Performance Outcome</span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-bold font-mono flex items-center ${
                isGreen ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {isGreen ? "+" : ""}
              {pnlPct.toFixed(2)}%
            </span>
            <span className="text-sm font-mono text-muted-foreground">({totalR >= 0 ? "+" : ""}{totalR.toFixed(2)}R)</span>
          </div>
        </div>
      </div>

      {/* Score Components Breakdown */}
      {scorecard?.components && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Process Components Breakdown
          </h4>

          <div className="space-y-2">
            {Object.entries(scorecard.components).map(([key, comp]) => (
              <div key={key} className="flex items-center justify-between p-2.5 rounded border text-xs bg-background/50">
                <div className="space-y-0.5">
                  <span className="font-semibold block">{key.replace(/_/g, " ")}</span>
                  {comp.reason && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {comp.reason}
                    </span>
                  )}
                </div>
                <div className="text-right font-mono">
                  <span className="font-bold">{comp.score}%</span>
                  <span className="text-[10px] text-muted-foreground block">Weight: {comp.weight}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
