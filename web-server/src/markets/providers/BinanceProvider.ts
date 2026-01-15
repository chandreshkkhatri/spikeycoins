/**
 * Binance Market Provider
 * Implements IMarketProvider using existing crypto module components
 */

import { IMarketProvider, MarketType } from '../interfaces/IMarketProvider';
import { ITicker } from '../interfaces/ITicker';
import { ICandle } from '../interfaces/ICandle';
import DataManager from '../../crypto/core/DataManager';
import BinanceClient from '../../crypto/core/BinanceClient';
import CandlestickStorage from '../../crypto/services/CandlestickStorage';

class BinanceProvider implements IMarketProvider {
  readonly providerName = 'binance';
  readonly marketType: MarketType = 'crypto';
  
  private client: BinanceClient | null = null;
  private connected = false;
  private lastUpdate: Date | null = null;

  /**
   * Connect to Binance WebSocket streams
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    
    this.client = new BinanceClient();
    await this.client.start();
    this.connected = true;
    this.lastUpdate = new Date();
  }

  /**
   * Disconnect from Binance
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.cleanup();
      this.client = null;
    }
    this.connected = false;
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected && !!this.client;
  }

  /**
   * Get all tickers in unified format
   */
  async getTickers(): Promise<ITicker[]> {
    const rawTickers = DataManager.getAllTickers();
    return rawTickers.map(ticker => this.mapToUnifiedTicker(ticker));
  }

  /**
   * Get ticker by symbol
   */
  async getTickerBySymbol(symbol: string): Promise<ITicker | null> {
    const rawTicker = DataManager.getTickerBySymbol(symbol);
    if (!rawTicker) return null;
    return this.mapToUnifiedTicker(rawTicker);
  }

  /**
   * Get historical candlestick data
   */
  async getHistoricalData(
    symbol: string,
    _interval: string,
    limit: number
  ): Promise<ICandle[]> {
    const candles = await CandlestickStorage.getLatestCandles(symbol, limit);
    return candles.map(candle => ({
      symbol,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));
  }

  /**
   * Get provider status
   */
  getStatus() {
    const stats = DataManager.getStats();
    return {
      connected: this.connected,
      symbolCount: stats.tickerCount,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Map raw Binance ticker to unified ITicker format
   */
  private mapToUnifiedTicker(raw: any): ITicker {
    this.lastUpdate = new Date();
    
    return {
      symbol: raw.s,
      displayName: raw.s.replace('USDT', ''),
      price: raw.price,
      change24h: raw.change_24h,
      high24h: raw.high_24h,
      low24h: raw.low_24h,
      volume: raw.volume_base,
      volumeUsd: raw.volume_usd,
      marketCap: raw.market_cap || undefined,
      lastUpdated: new Date(raw.last_updated),
      marketType: 'crypto',
      provider: this.providerName,
      change1h: raw.change_1h,
      change4h: raw.change_4h,
      change8h: raw.change_8h,
      change12h: raw.change_12h,
      rangePosition24h: raw.range_position_24h,
    };
  }
}

export default BinanceProvider;
