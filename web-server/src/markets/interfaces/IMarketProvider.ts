/**
 * Market Provider Interface
 * Defines the contract for market data providers (Binance, Upstox, etc.)
 */

import { ITicker } from './ITicker';
import { ICandle } from './ICandle';

export type MarketType = 'crypto' | 'stocks';

export interface IMarketProvider {
  /**
   * Unique identifier for this provider
   */
  readonly providerName: string;
  
  /**
   * Type of market this provider serves
   */
  readonly marketType: MarketType;
  
  /**
   * Connect to the data source (WebSocket, API, etc.)
   */
  connect(): Promise<void>;
  
  /**
   * Disconnect from the data source
   */
  disconnect(): Promise<void>;
  
  /**
   * Check if currently connected
   */
  isConnected(): boolean;
  
  /**
   * Get all available tickers
   */
  getTickers(): Promise<ITicker[]>;
  
  /**
   * Get ticker data for a specific symbol
   */
  getTickerBySymbol(symbol: string): Promise<ITicker | null>;
  
  /**
   * Get historical candlestick data
   */
  getHistoricalData(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<ICandle[]>;
  
  /**
   * Get provider status/health
   */
  getStatus(): {
    connected: boolean;
    symbolCount: number;
    lastUpdate: Date | null;
  };
}
