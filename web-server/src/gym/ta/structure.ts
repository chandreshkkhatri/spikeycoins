import { ICandle } from "../session/candles";
import { ema } from "./series";

export type TrendState = "BULLISH" | "BEARISH" | "CONSOLIDATING";

/**
 * Evaluate structural trend state using 20/50/200 EMA alignment.
 */
export function evaluateTrendState(candles: ICandle[]): TrendState {
  if (candles.length < 50) return "CONSOLIDATING";

  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, Math.min(200, closes.length));

  const lastIndex = closes.length - 1;
  const e20 = ema20[lastIndex];
  const e50 = ema50[lastIndex];
  const e200 = ema200[lastIndex];

  const separation = Math.abs(e20 - e50) / (e50 || 1);
  if (separation < 0.001) {
    return "CONSOLIDATING";
  }

  if (e20 > e50 && e50 >= e200) {
    return "BULLISH";
  }
  if (e20 < e50 && e50 <= e200) {
    return "BEARISH";
  }

  return "CONSOLIDATING";
}
