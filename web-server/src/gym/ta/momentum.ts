import { ICandle } from "../session/candles";
import { IPivot } from "./pivots";
import { rsi } from "./series";

export type RSIZone = "BULLISH" | "BEARISH" | "NEUTRAL";

export function getRSIZone(rsiValue: number): RSIZone {
  if (rsiValue >= 60) return "BULLISH";
  if (rsiValue <= 40) return "BEARISH";
  return "NEUTRAL";
}

export interface IMomentumState {
  rsiValue: number;
  rsiZone: RSIZone;
  counterTrendFlag: boolean;
}

/**
 * Evaluate momentum RSI zone and counter-trend flag.
 */
export function evaluateMomentum(
  mainCandles: ICandle[],
  higherCandles: ICandle[]
): IMomentumState {
  const mainRsiSeries = rsi(mainCandles, 14);
  const higherRsiSeries = rsi(higherCandles, 14);

  const mainRsi = mainRsiSeries[mainRsiSeries.length - 1] ?? 50;
  const higherRsi = higherRsiSeries[higherRsiSeries.length - 1] ?? 50;

  const rsiZone = getRSIZone(mainRsi);

  // Counter-trend flag: Lower/main timeframe crossing 60 while HTF sits below 60
  const counterTrendFlag = mainRsi >= 60 && higherRsi < 60;

  return {
    rsiValue: mainRsi,
    rsiZone,
    counterTrendFlag,
  };
}
