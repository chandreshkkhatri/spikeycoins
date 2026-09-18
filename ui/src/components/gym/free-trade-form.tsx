"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UseGymSessionReturn } from "./use-gym-session";

interface FreeTradeFormProps {
  currentPrice: number;
  onSubmitTrade: UseGymSessionReturn["placeTrade"];
  disabled?: boolean;
}

export function FreeTradeForm({ currentPrice, onSubmitTrade, disabled }: FreeTradeFormProps) {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [type, setType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState(String(currentPrice));
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const entry = type === "LIMIT" ? Number(limitPrice) : currentPrice;
  const stop = Number(stopLoss);
  const target = Number(takeProfit);
  const valid = [entry, stop, target].every((price) => Number.isFinite(price) && price > 0) &&
    (side === "LONG" ? stop < entry && target > entry : stop > entry && target < entry);

  return (
    <form className="rounded-lg border bg-card p-4 space-y-3 text-xs" onSubmit={async (event) => {
      event.preventDefault();
      if (!valid || disabled) return;
      await onSubmitTrade({ side, type, stopLoss: stop, takeProfit: target,
        ...(type === "LIMIT" ? { limitPrice: entry } : {}) });
    }}>
      <h3 className="font-semibold text-sm">Free Sandbox Order Entry</h3>
      <label className="block">Side
        <select aria-label="Side" value={side} onChange={(event) => setSide(event.target.value as "LONG" | "SHORT")} className="block w-full border rounded bg-background p-2">
          <option value="LONG">LONG</option><option value="SHORT">SHORT</option>
        </select>
      </label>
      <label className="block">Order type
        <select aria-label="Order type" value={type} onChange={(event) => setType(event.target.value as "MARKET" | "LIMIT")} className="block w-full border rounded bg-background p-2">
          <option value="MARKET">MARKET</option><option value="LIMIT">LIMIT</option>
        </select>
      </label>
      {type === "LIMIT" && <label className="block">Limit price
        <Input aria-label="Limit price" type="number" step="any" min="0" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} />
      </label>}
      <label className="block">Stop loss
        <Input aria-label="Stop loss" type="number" step="any" min="0" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} />
      </label>
      <label className="block">Take profit
        <Input aria-label="Take profit" type="number" step="any" min="0" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} />
      </label>
      <Button type="submit" className="w-full" disabled={disabled || !valid}>Place {side} {type} Order</Button>
    </form>
  );
}
