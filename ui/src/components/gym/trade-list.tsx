"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GymTrade } from "./types";
import { TrendingUp, TrendingDown, Edit2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export interface TradeListProps {
  trades: GymTrade[];
  onModifyStop?: (tradeIndex: number, newStop: number) => Promise<void>;
  onCloseTrade?: () => Promise<void>;
  onCancelTrade?: () => Promise<void>;
  disabled?: boolean;
}

export function TradeList({
  trades,
  onModifyStop,
  onCloseTrade,
  onCancelTrade,
  disabled = false,
}: TradeListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newStopInput, setNewStopInput] = useState<string>("");

  const handleStartEdit = (index: number, currentStop: number) => {
    setEditingIndex(index);
    setNewStopInput(String(currentStop));
  };

  const handleSaveStop = async (index: number) => {
    const val = parseFloat(newStopInput);
    if (!isNaN(val) && onModifyStop) {
      await onModifyStop(index, val);
      setEditingIndex(null);
    }
  };

  if (!trades || trades.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground">
        No trades executed in this session yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <span>Trade History & Positions</span>
        <Badge variant="neutral" className="text-xs">
          {trades.length} {trades.length === 1 ? "trade" : "trades"}
        </Badge>
      </h3>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {trades.map((t, idx) => {
          const tradeIndex = t.tradeIndex ?? idx;
          const isOpen = t.status === "OPEN";
          const isPending = t.status === "PENDING";

          return (
            <div
              key={tradeIndex}
              className={`p-3 rounded-md border text-xs space-y-2 ${
                isOpen
                  ? "bg-primary/5 border-primary/20"
                  : isPending
                  ? "bg-yellow-500/5 border-yellow-500/20"
                  : "bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  {t.side === "LONG" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={t.side === "LONG" ? "text-emerald-500" : "text-red-500"}>
                    {t.side} #{tradeIndex + 1}
                  </span>
                  <Badge variant="neutral" className="text-[10px] py-0 px-1.5">
                    {t.type}
                  </Badge>
                </div>

                <Badge
                  variant={
                    isOpen
                      ? "info"
                      : isPending
                      ? "warning"
                      : t.status === "TARGET_HIT"
                      ? "success"
                      : "danger"
                  }
                  className="text-[10px]"
                >
                  {t.status}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Entry</span>
                  <span>{t.entryPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Stop Loss</span>
                  <span>{t.stopLoss.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Take Profit</span>
                  <span>{t.takeProfit.toFixed(2)}</span>
                </div>
              </div>

              {t.quantity != null && (
                <div className="flex justify-between items-center text-[11px] font-mono pt-1 border-t">
                  <span className="text-muted-foreground">Qty: {t.quantity}</span>
                  {t.pnl != null && (
                    <span
                      className={`font-bold ${
                        t.pnl >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {t.pnl >= 0 ? "+" : ""}
                      {t.pnl.toFixed(2)}% ({t.rMultiple != null ? `${t.rMultiple}R` : ""})
                    </span>
                  )}
                </div>
              )}

              {/* Stop History indicator */}
              {t.stopHistory && t.stopHistory.length > 0 && (
                <div className="text-[10px] text-muted-foreground bg-background/50 p-1.5 rounded space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Edit2 className="h-3 w-3" /> Stop Modifications:
                  </div>
                  {t.stopHistory.map((sh, sIdx) => (
                    <div key={sIdx} className="flex justify-between items-center">
                      <span>
                        Candle #{sh.atCandle}: {sh.from.toFixed(2)} → {sh.to.toFixed(2)}
                      </span>
                      {sh.widened && (
                        <Badge variant="danger" className="text-[9px] px-1 py-0 flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Widened
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {(isOpen || isPending) && !disabled && (
                <div className="flex items-center gap-2 pt-1 border-t">
                  {editingIndex === tradeIndex ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <Input
                        type="number"
                        step="0.01"
                        value={newStopInput}
                        onChange={(e) => setNewStopInput(e.target.value)}
                        className="h-7 text-xs font-mono"
                        placeholder="New Stop"
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveStop(tradeIndex)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditingIndex(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      {onModifyStop && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-[11px]"
                          onClick={() => handleStartEdit(tradeIndex, t.stopLoss)}
                        >
                          Modify Stop
                        </Button>
                      )}
                      {isOpen && onCloseTrade && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs text-[11px] ml-auto"
                          onClick={onCloseTrade}
                        >
                          Close Market
                        </Button>
                      )}
                      {isPending && onCancelTrade && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-[11px] ml-auto"
                          onClick={onCancelTrade}
                        >
                          Cancel Order
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
