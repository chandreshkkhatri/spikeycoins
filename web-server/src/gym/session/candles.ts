import axios from "axios";
import HistoricalDataCache from "../../models/historical-data-cache";

export const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
export const SUPPORTED_INTERVALS = ["15m", "1h", "4h", "1d"];

export const INTERVAL_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export const TIMEFRAME_CONFIGS: Record<
  string,
  { lower: string; lowerMultiplier: number; higher: string; higherMultiplier: number }
> = {
  "15m": { lower: "5m", lowerMultiplier: 3, higher: "1h", higherMultiplier: 4 },
  "1h": { lower: "15m", lowerMultiplier: 4, higher: "4h", higherMultiplier: 4 },
  "4h": { lower: "1h", lowerMultiplier: 4, higher: "1d", higherMultiplier: 6 },
  "1d": { lower: "4h", lowerMultiplier: 6, higher: "1w", higherMultiplier: 7 },
};

export interface ICandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

/**
 * Snap timestamp down to a boundary of the given interval.
 */
export function snapToInterval(timestamp: number, interval: string): number {
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) return timestamp;
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

/**
 * Calculate median volume for normalizing volume across obfuscated sessions.
 */
export function calculateVolumeDivisor(candles: ICandle[]): number {
  if (candles.length === 0) return 1;
  const volumes = candles.map((c) => c.volume).sort((a, b) => a - b);
  const mid = Math.floor(volumes.length / 2);
  const median = volumes.length % 2 !== 0 ? volumes[mid] : (volumes[mid - 1] + volumes[mid]) / 2;
  return median > 0 ? median : 1;
}

/**
 * Fetch candles from cache or Binance in chunks of up to 1000.
 */
export async function fetchCandles(
  symbol: string,
  interval: string,
  startTime: number,
  limit: number = 300
): Promise<ICandle[]> {
  const marketType = "usdm";

  // Try cache first
  const cachedCandles = await HistoricalDataCache.find({
    symbol,
    interval,
    marketType,
    timestamp: { $gte: startTime },
  })
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();

  if (cachedCandles.length >= limit) {
    return cachedCandles.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      timestamp: c.timestamp,
    }));
  }

  const candles: ICandle[] = [];
  let currentStartTime = startTime;
  let remaining = limit;
  const intervalMs = INTERVAL_MS[interval] || 60 * 1000;

  try {
    while (remaining > 0) {
      const chunkLimit = Math.min(remaining, 1000);
      const endTime = currentStartTime + chunkLimit * intervalMs;
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=${chunkLimit}`;

      const response = await axios.get(url);
      const chunkCandles = response.data.map((k: unknown[]) => {
        const arr = k as [number, string, string, string, string, string];
        return {
          timestamp: arr[0],
          open: parseFloat(arr[1]),
          high: parseFloat(arr[2]),
          low: parseFloat(arr[3]),
          close: parseFloat(arr[4]),
          volume: parseFloat(arr[5]),
        };
      });

      if (chunkCandles.length === 0) break;

      candles.push(...chunkCandles);
      remaining -= chunkCandles.length;
      currentStartTime = chunkCandles[chunkCandles.length - 1].timestamp + intervalMs;
    }

    if (candles.length > 0) {
      const candlesToInsert = candles.map((c) => ({
        symbol,
        interval,
        marketType,
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      HistoricalDataCache.insertMany(candlesToInsert, { ordered: false }).catch(() => {});
    }
  } catch (err: unknown) {
    console.error(`[fetchCandles] Error fetching ${interval} candles from Binance:`, err);
  }

  return candles;
}

/**
 * Obfuscate price series with price multiplier and normalized volume.
 */
export function obfuscateSeries(
  candles: ICandle[],
  multiplier: number,
  volumeDivisor: number = 1
): ICandle[] {
  return candles.map((c, index) => ({
    open: +(c.open * multiplier).toFixed(2),
    high: +(c.high * multiplier).toFixed(2),
    low: +(c.low * multiplier).toFixed(2),
    close: +(c.close * multiplier).toFixed(2),
    volume: +(c.volume / volumeDivisor).toFixed(4),
    timestamp: index,
  }));
}
