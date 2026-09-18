import { ICandle } from "../session/candles";

/**
 * Exponential Moving Average (EMA) with optional seed value.
 * Scale-invariant: multiplying values by k scales output by k.
 */
export function ema(values: number[], period: number, seed?: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = new Array(values.length).fill(NaN);

  let prevEma = seed != null ? seed : values[0];
  let startIndex = 0;

  if (seed != null) {
    prevEma = values[0] * k + seed * (1 - k);
    result[0] = +prevEma.toFixed(4);
    startIndex = 1;
  } else {
    result[0] = +prevEma.toFixed(4);
    startIndex = 1;
  }

  for (let i = startIndex; i < values.length; i++) {
    prevEma = values[i] * k + prevEma * (1 - k);
    result[i] = +prevEma.toFixed(4);
  }

  return result;
}

/**
 * Wilder's Relative Strength Index (RSI).
 * Scale-invariant: scale factor cancels out in relative gain/loss ratio.
 */
export function rsi(candles: ICandle[], period: number = 14): number[] {
  if (candles.length < period + 1) {
    return new Array(candles.length).fill(50);
  }

  const result: number[] = new Array(candles.length).fill(NaN);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = +(100 - 100 / (1 + rs)).toFixed(2);

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const currentGain = change >= 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = +(100 - 100 / (1 + currentRs)).toFixed(2);
  }

  // Backfill warm-up period with first computed value
  const firstValid = result[period];
  for (let i = 0; i < period; i++) {
    result[i] = firstValid;
  }

  return result;
}

/**
 * Average True Range (ATR).
 */
export function atr(candles: ICandle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const result: number[] = new Array(candles.length).fill(NaN);

  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(highLow, highClose, lowClose));
  }

  if (candles.length < period) {
    const avgTr = trs.reduce((a, b) => a + b, 0) / trs.length;
    return new Array(candles.length).fill(+avgTr.toFixed(4));
  }

  let currentAtr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = +currentAtr.toFixed(4);

  for (let i = period; i < candles.length; i++) {
    currentAtr = (currentAtr * (period - 1) + trs[i]) / period;
    result[i] = +currentAtr.toFixed(4);
  }

  // Backfill warm-up
  const firstValid = result[period - 1];
  for (let i = 0; i < period - 1; i++) {
    result[i] = firstValid;
  }

  return result;
}
