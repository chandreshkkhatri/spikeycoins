import axios from 'axios';
import { BinanceService } from '../../lib/binance-service';

interface ExchangeSymbol {
  symbol: string;
  status: string;
  quoteAsset: string;
  contractType?: string;
}

/** Exchange listings are authoritative; CoinGecko tickers are not pair listings. */
export default class BinanceSymbolCatalog {
  private static markets = new Map<string, 'spot' | 'futures'>();
  private static refreshedAt = 0;
  private static pending: Promise<void> | null = null;

  static marketFor(symbol: string): 'spot' | 'futures' | undefined {
    return this.markets.get(symbol);
  }

  static async refresh(): Promise<void> {
    if (this.refreshedAt && Date.now() - this.refreshedAt < 5 * 60 * 1000) return;
    if (this.pending) return this.pending;
    this.pending = this.load();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
  }

  private static async load(): Promise<void> {
    const [spot, futures] = await Promise.all([
      BinanceService.scheduleRequest(() => axios.get<{ symbols: ExchangeSymbol[] }>(
        'https://api.binance.com/api/v3/exchangeInfo', { timeout: 10000 })),
      BinanceService.scheduleRequest(() => axios.get<{ symbols: ExchangeSymbol[] }>(
        'https://fapi.binance.com/fapi/v1/exchangeInfo', { timeout: 10000 })),
    ]);
    const next = new Map<string, 'spot' | 'futures'>();
    for (const item of futures.data.symbols) {
      if (item.status === 'TRADING' && item.quoteAsset === 'USDT' && item.contractType === 'PERPETUAL') {
        next.set(item.symbol, 'futures');
      }
    }
    for (const item of spot.data.symbols) {
      if (item.status === 'TRADING' && item.quoteAsset === 'USDT') next.set(item.symbol, 'spot');
    }
    this.markets = next;
    this.refreshedAt = Date.now();
  }
}
