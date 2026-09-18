"use client";

import { Badge } from "@/components/ui/badge";
import { Shield, AlertCircle, DollarSign, Percent } from "lucide-react";
import { GymSession } from "./types";

export interface RiskPanelProps {
  session: GymSession;
  entryPrice?: number;
  stopLoss?: number;
  atr?: number;
  minStopAtrMultiple?: number;
}

export function RiskPanel({
  session,
  entryPrice,
  stopLoss,
  atr = 0,
  minStopAtrMultiple = 1.0,
}: RiskPanelProps) {
  const capital = session.capital ?? session.startingCapital ?? 100000;
  const riskPercent = session.riskPercent ?? 1;
  const riskTier = session.governor?.riskTier || "WARMUP";

  const tierFactor = riskTier === "FULL" ? 1.0 : 0.5;
  const effectiveRiskPercent = riskPercent * tierFactor;
  const maxRiskAmount = (capital * effectiveRiskPercent) / 100;

  let computedQty = 0;
  let riskPerUnit = 0;
  let isAtrFloorBreached = false;
  let minDistanceNeeded = 0;

  if (entryPrice != null && stopLoss != null && entryPrice > 0 && stopLoss > 0) {
    riskPerUnit = Math.abs(entryPrice - stopLoss);
    if (riskPerUnit > 0) {
      computedQty = Math.floor(maxRiskAmount / riskPerUnit);
    }
    if (atr > 0 && minStopAtrMultiple > 0) {
      minDistanceNeeded = minStopAtrMultiple * atr;
      isAtrFloorBreached = riskPerUnit < minDistanceNeeded;
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Risk & Sizing Engine</h3>
        </div>
        <Badge
          variant={riskTier === "FULL" ? "success" : riskTier === "REDUCED" ? "danger" : "neutral"}
          className="text-xs"
        >
          {riskTier} TIER ({tierFactor * 100}%)
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/50 p-2 rounded">
          <span className="text-muted-foreground block">Equity</span>
          <span className="font-mono font-bold text-sm">
            ${capital.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="bg-muted/50 p-2 rounded">
          <span className="text-muted-foreground block">Max Risk / Trade</span>
          <span className="font-mono font-bold text-sm">
            ${maxRiskAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ({effectiveRiskPercent}%)
          </span>
        </div>
      </div>

      {entryPrice != null && stopLoss != null && (
        <div className="pt-2 border-t space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Stop Distance:</span>
            <span className="font-mono">{riskPerUnit.toFixed(2)} pts</span>
          </div>

          {atr > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ATR Floor ({minStopAtrMultiple}x):</span>
              <span className={`font-mono ${isAtrFloorBreached ? "text-red-500 font-bold" : "text-emerald-500"}`}>
                {minDistanceNeeded.toFixed(2)} pts
              </span>
            </div>
          )}

          <div className="flex justify-between items-center bg-primary/10 p-2 rounded text-primary">
            <span className="font-medium">Calculated Quantity:</span>
            <span className="font-mono font-bold text-sm">{computedQty} units</span>
          </div>

          {isAtrFloorBreached && (
            <div className="flex items-center gap-1.5 text-red-500 bg-red-500/10 p-2 rounded text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Stop is too tight. Requires at least {minDistanceNeeded.toFixed(2)} pts breathing room.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
