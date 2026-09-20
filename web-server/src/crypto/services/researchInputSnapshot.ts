import { randomUUID } from 'node:crypto';
import type { CandidateTicker } from './researchCandidates';

/** Exact observed inputs, not a reconstruction from a rounded percentage. */
export interface ResearchInputSnapshot {
  id: string;
  version: 1;
  capturedAt: string;
  symbol: string;
  venue: 'binance-spot' | 'binance-usdm-futures';
  timeframe: '24h' | '7d';
  windowMethod: 'exchange-24h-ticker' | 'utc-calendar-7d';
  observedAt: string;
  price: number;
  priceChange: number;
  quoteTurnover: number;
  quoteAsset: 'USDT';
  referencePrice: number | null;
  referenceTime: string | null;
  exchangeCloseTime: string | null;
  eligibilityPolicyVersion: 1;
}

function exchangeTime(value: number | undefined): string | null {
  return value !== undefined && Number.isFinite(value) && value > 0 &&
    Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
}

export function snapshot24h(ticker: CandidateTicker & { o?: string; O?: number; C?: number }): ResearchInputSnapshot {
  const reference = Number(ticker.o);
  return {
    id: randomUUID(), version: 1, capturedAt: new Date().toISOString(),
    symbol: ticker.s, venue: ticker.is_futures ? 'binance-usdm-futures' : 'binance-spot',
    timeframe: '24h', windowMethod: 'exchange-24h-ticker',
    observedAt: ticker.last_updated, price: ticker.price, priceChange: ticker.change_24h,
    quoteTurnover: ticker.volume_usd, quoteAsset: 'USDT',
    referencePrice: Number.isFinite(reference) && reference > 0 ? reference : null,
    referenceTime: exchangeTime(ticker.O), exchangeCloseTime: exchangeTime(ticker.C),
    eligibilityPolicyVersion: 1,
  };
}

export function snapshot7d(input: {
  symbol: string; price: number; priceChange: number; volume: number;
  observedAt: string; referenceTime: string; referencePrice: number;
}): ResearchInputSnapshot {
  return {
    id: randomUUID(), version: 1, capturedAt: new Date().toISOString(),
    symbol: input.symbol, venue: 'binance-spot', timeframe: '7d', windowMethod: 'utc-calendar-7d',
    observedAt: input.observedAt, price: input.price, priceChange: input.priceChange,
    quoteTurnover: input.volume, quoteAsset: 'USDT', referencePrice: input.referencePrice,
    referenceTime: input.referenceTime, exchangeCloseTime: null, eligibilityPolicyVersion: 1,
  };
}
