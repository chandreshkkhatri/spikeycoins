/**
 * Calculation utilities for ticker data processing
 */

interface CandlestickData {
  symbol: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  interval: string;
}

interface TickerItem {
  h: string;
  l: string;
  c: string;
  v: string;
  P: string;
  p: string;
}

interface AdditionalMetrics {
  volume_usd: number | null;
  volume_base: number | null;
  range_position_24h: number | null;
  price: number | null;
  price_change_24h_percent: number;
  price_change_24h_value: number;
  high_24h: number;
  low_24h: number;
}

/**
 * Calculate percentage change between two prices
 */
export function calculatePercentageChange(
  oldPrice: number,
  newPrice: number
): number | null {
  if (
    oldPrice === null ||
    oldPrice === undefined ||
    typeof oldPrice !== "number" ||
    newPrice === null ||
    newPrice === undefined ||
    typeof newPrice !== "number"
  ) {
    return null; // Or handle as an error, depending on requirements
  }
  if (oldPrice === 0) return newPrice === 0 ? 0 : null; // Avoid division by zero; if newPrice is also 0, change is 0.
  const change = ((newPrice - oldPrice) / oldPrice) * 100;
  return parseFloat(change.toFixed(2)); // Round to 2 decimal places
}

/**
 * Calculate 24h range position percentage
 * Shows where current price sits within the day's high-low range
 */
export function calculate24hRangePosition(item: TickerItem): number | null {
  if (
    !item ||
    typeof item.h !== "string" ||
    typeof item.l !== "string" ||
    typeof item.c !== "string"
  )
    return null;
  const high = parseFloat(item.h);
  const low = parseFloat(item.l);
  const current = parseFloat(item.c);

  if (isNaN(high) || isNaN(low) || isNaN(current)) return null;
  if (high === low) return 50; // Avoid division by zero, price is stable

  const position = ((current - low) / (high - low)) * 100;
  return parseFloat(position.toFixed(2));
}

/**
 * Calculate additional metrics for ticker data
 * Moves all calculations from frontend to backend
 */
export function calculateAdditionalMetrics(
  item: TickerItem
): AdditionalMetrics {
  const metrics: AdditionalMetrics = {
    volume_usd: null,
    volume_base: null,
    range_position_24h: null,
    price: null,
    price_change_24h_percent: 0,
    price_change_24h_value: 0,
    high_24h: 0,
    low_24h: 0,
  };

  const price = parseFloat(item.c);
  const volume = parseFloat(item.v);

  // Volume calculations
  metrics.volume_usd =
    !isNaN(price) && !isNaN(volume)
      ? parseFloat((volume * price).toFixed(0))
      : null;
  metrics.volume_base = !isNaN(volume) ? volume : null;

  // Range position calculation
  metrics.range_position_24h = calculate24hRangePosition(item);

  // Convert string numbers to actual numbers for better sorting/filtering
  metrics.price = !isNaN(price) ? price : null;
  metrics.price_change_24h_percent = parseFloat(item.P); // Binance provides this as 'P'
  metrics.price_change_24h_value = parseFloat(item.p); // Binance provides this as 'p'
  metrics.high_24h = parseFloat(item.h);
  metrics.low_24h = parseFloat(item.l);

  return metrics;
}

/**
 * Calculate short-term price changes from candlestick data
 */
export function calculateShortTermChanges(
  currentPrice: number,
  candlesticks: Map<string, CandlestickData[]>
): {
  change_1h: number | null;
  change_4h: number | null;
  change_8h: number | null;
  change_12h: number | null;
} {
  const result = {
    change_1h: null as number | null,
    change_4h: null as number | null,
    change_8h: null as number | null,
    change_12h: null as number | null,
  };

  // Calculate 1h change from 5m candlesticks (12 candles back)
  const fiveMinCandles = candlesticks.get('5m');
  if (fiveMinCandles && fiveMinCandles.length >= 12) {
    const oneHourAgo = fiveMinCandles[fiveMinCandles.length - 12];
    const oldPrice = parseFloat(oneHourAgo.close);
    result.change_1h = calculatePercentageChange(oldPrice, currentPrice);
  }

  // Calculate 4h change from 30m candlesticks (8 candles back)
  const thirtyMinCandles = candlesticks.get('30m');
  if (thirtyMinCandles && thirtyMinCandles.length >= 8) {
    const fourHoursAgo = thirtyMinCandles[thirtyMinCandles.length - 8];
    const oldPrice = parseFloat(fourHoursAgo.close);
    result.change_4h = calculatePercentageChange(oldPrice, currentPrice);
  }

  // Calculate 8h change from 30m candlesticks (16 candles back)
  if (thirtyMinCandles && thirtyMinCandles.length >= 16) {
    const eightHoursAgo = thirtyMinCandles[thirtyMinCandles.length - 16];
    const oldPrice = parseFloat(eightHoursAgo.close);
    result.change_8h = calculatePercentageChange(oldPrice, currentPrice);
  }

  // Calculate 12h change from 1h candlesticks (12 candles back)
  const hourlyCandles = candlesticks.get('1h');
  if (hourlyCandles && hourlyCandles.length >= 12) {
    const twelveHoursAgo = hourlyCandles[hourlyCandles.length - 12];
    const oldPrice = parseFloat(twelveHoursAgo.close);
    result.change_12h = calculatePercentageChange(oldPrice, currentPrice);
  }

  return result;
}
