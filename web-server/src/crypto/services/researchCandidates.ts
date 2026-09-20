/** Research eligibility v1. Turnover floors are not executable-liquidity guarantees. */
export const RESEARCH_MAX_AGE_MS = 5 * 60 * 1000;
export interface CandidateTicker {
  s: string;
  price: number;
  change_24h: number;
  volume_usd: number;
  last_updated: string;
  is_futures: boolean;
}
export function eligibleResearchTicker(ticker: CandidateTicker, now: number): boolean {
  const observed = Date.parse(ticker.last_updated);
  return /^[A-Z0-9_]+USDT$/.test(ticker.s) &&
    Number.isFinite(observed) && observed <= now && now - observed < RESEARCH_MAX_AGE_MS &&
    Number.isFinite(ticker.price) && ticker.price > 0 &&
    Number.isFinite(ticker.change_24h) &&
    Number.isFinite(ticker.volume_usd) &&
    ticker.volume_usd >= (ticker.is_futures ? 50000 : 1000);
}
export function directionalMovers<T extends { symbol: string; priceChange: number }>(
  candidates: T[], limit: number,
): T[] {
  const valid = candidates.filter(item => Number.isFinite(item.priceChange));
  const tie = (a: T, b: T) => a.symbol.localeCompare(b.symbol);
  return [
    ...valid.filter(item => item.priceChange > 0)
      .sort((a, b) => b.priceChange - a.priceChange || tie(a, b)).slice(0, limit),
    ...valid.filter(item => item.priceChange < 0)
      .sort((a, b) => a.priceChange - b.priceChange || tie(a, b)).slice(0, limit),
  ];
}
export function retainResearchHorizons<T extends { symbol: string; timeframe: string }>(items: T[]): T[] {
  return [...new Map(items.map(item => [item.symbol + ":" + item.timeframe, item])).values()];
}
