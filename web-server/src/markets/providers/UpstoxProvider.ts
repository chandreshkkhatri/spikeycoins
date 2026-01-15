/**
 * Upstox Market Provider
 * Implements IMarketProvider for Indian stock market data via Upstox API
 */

import { IMarketProvider, MarketType } from '../interfaces/IMarketProvider';
import { ITicker } from '../interfaces/ITicker';
import { ICandle } from '../interfaces/ICandle';
import upstoxService from '../../lib/upstox-service';

class UpstoxProvider implements IMarketProvider {
  readonly providerName = 'upstox';
  readonly marketType: MarketType = 'stocks';
  
  private connected = false;
  private lastUpdate: Date | null = null;
  private cachedTickers: Map<string, ITicker> = new Map();

  /**
   * Connect to Upstox
   * Note: Upstox requires OAuth authentication, so this just checks if token exists
   */
  async connect(): Promise<void> {
    if (upstoxService.isLoggedIn()) {
      this.connected = true;
      this.lastUpdate = new Date();
    } else {
      throw new Error('Upstox: Not authenticated. User must login first.');
    }
  }

  /**
   * Disconnect (clear cached data)
   */
  async disconnect(): Promise<void> {
    this.cachedTickers.clear();
    this.connected = false;
  }

  /**
   * Check if authenticated and connected
   */
  isConnected(): boolean {
    return this.connected && upstoxService.isLoggedIn();
  }

  /**
   * Get tickers - requires explicit symbol list since Upstox doesn't broadcast all
   */
  async getTickers(): Promise<ITicker[]> {
    if (!this.isConnected()) {
      return [];
    }
    
    // Return cached tickers (populated via getTickerBySymbol calls)
    return Array.from(this.cachedTickers.values());
  }

  /**
   * Get ticker by symbol
   */
  async getTickerBySymbol(symbol: string): Promise<ITicker | null> {
    if (!this.isConnected()) {
      return null;
    }

    try {
      const quote = await upstoxService.getQuote([symbol]);
      if (!quote || !quote.data || !quote.data[symbol]) {
        return null;
      }

      const data = quote.data[symbol];
      const ticker = this.mapToUnifiedTicker(symbol, data);
      
      // Cache for getTickers()
      this.cachedTickers.set(symbol, ticker);
      this.lastUpdate = new Date();
      
      return ticker;
    } catch (error) {
      console.error(`UpstoxProvider: Error fetching ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get historical candlestick data
   */
  async getHistoricalData(
    symbol: string,
    interval: string,
    _limit: number
  ): Promise<ICandle[]> {
    if (!this.isConnected()) {
      return [];
    }

    try {
      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const data = await upstoxService.getHistoricalData(symbol, interval, toDate, fromDate);
      
      if (!data || !data.data || !data.data.candles) {
        return [];
      }

      return data.data.candles.map((candle: any[]) => ({
        symbol,
        openTime: new Date(candle[0]).getTime(),
        closeTime: new Date(candle[0]).getTime() + this.intervalToMs(interval),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
      }));
    } catch (error) {
      console.error(`UpstoxProvider: Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get provider status
   */
  getStatus() {
    return {
      connected: this.connected,
      symbolCount: this.cachedTickers.size,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Map Upstox quote to unified ITicker format
   */
  private mapToUnifiedTicker(symbol: string, data: any): ITicker {
    const ltp = data.last_price || data.ltp || 0;
    const prevClose = data.ohlc?.close || ltp;
    const change24h = prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;

    return {
      symbol,
      displayName: symbol.split('|').pop() || symbol,
      price: ltp,
      change24h,
      high24h: data.ohlc?.high || ltp,
      low24h: data.ohlc?.low || ltp,
      volume: data.volume || 0,
      volumeUsd: (data.volume || 0) * ltp, // Approximate
      lastUpdated: new Date(),
      marketType: 'stocks',
      provider: this.providerName,
    };
  }

  /**
   * Convert interval string to milliseconds
   */
  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      '1minute': 60 * 1000,
      '5minute': 5 * 60 * 1000,
      '15minute': 15 * 60 * 1000,
      '30minute': 30 * 60 * 1000,
      '1hour': 60 * 60 * 1000,
      '1day': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 5 * 60 * 1000;
  }
}

export default UpstoxProvider;
