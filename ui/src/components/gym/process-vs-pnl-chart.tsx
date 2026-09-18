"use client";

import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity } from "lucide-react";

export interface ProcessVsPnlPoint {
  sessionId: string;
  processScore: number;
  pnlPct: number;
  totalR: number;
  createdAt: string;
}

export interface ProcessVsPnlChartProps {
  data: ProcessVsPnlPoint[];
  correlation: number | null;
}

export function ProcessVsPnlChart({ data, correlation }: ProcessVsPnlChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-xs text-muted-foreground">
        No completed methodology sessions recorded yet.
      </div>
    );
  }

  const getCorrelationBadge = (r: number | null) => {
    if (r == null) return { label: "Correlation: Insufficient Data (n < 3)", variant: "neutral" as const };
    if (r >= 0.7) return { label: `Strong Positive Correlation (r = ${r})`, variant: "success" as const };
    if (r >= 0.3) return { label: `Moderate Correlation (r = ${r})`, variant: "info" as const };
    if (r >= -0.3) return { label: `Weak / Neutral Correlation (r = ${r})`, variant: "neutral" as const };
    return { label: `Negative Correlation (r = ${r})`, variant: "danger" as const };
  };

  const corrBadge = getCorrelationBadge(correlation);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Process Score vs. P&L (% Capital)</h3>
        </div>
        <Badge variant={corrBadge.variant} className="text-xs font-mono">
          {corrBadge.label}
        </Badge>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {data.map((pt, idx) => (
          <div key={pt.sessionId || idx} className="flex items-center justify-between p-2.5 rounded border text-xs bg-muted/20">
            <span className="font-mono text-muted-foreground text-[11px]">
              Session #{idx + 1}
            </span>

            <div className="flex items-center gap-4 font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground block">Process Score</span>
                <span className="font-bold">{pt.processScore}/100</span>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">P&L (% Capital)</span>
                <span className={`font-bold ${pt.pnlPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {pt.pnlPct >= 0 ? "+" : ""}
                  {pt.pnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
