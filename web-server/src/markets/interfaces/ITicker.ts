/**
 * Ticker Interface
 * Represents real-time price data for any tradeable instrument
 */

import { MarketType } from './IMarketProvider';

export interface ITicker {
  /**
   * Trading symbol (e.g., BTCUSDT, RELIANCE)
   */
  symbol: string;
  
  /**
   * Human-readable name (e.g., "Bitcoin", "Reliance Industries")
   */
  displayName: string;
  
  /**
   * Current price
   */
  price: number;
  
  /**
   * 24-hour price change percentage
   */
  change24h: number;
  
  /**
   * 24-hour high price
   */
  high24h: number;
  
  /**
   * 24-hour low price
   */
  low24h: number;
  
  /**
   * Trading volume (in base currency)
   */
  volume: number;
  
  /**
   * Trading volume in USD equivalent
   */
  volumeUsd: number;
  
  /**
   * Market capitalization (if available)
   */
  marketCap?: number;
  
  /**
   * Last update timestamp
   */
  lastUpdated: Date;
  
  /**
   * Type of market (crypto/stocks)
   */
  marketType: MarketType;
  
  /**
   * Name of the data provider
   */
  provider: string;
  
  /**
   * Optional: Short-term price changes
   */
  change1h?: number | null;
  change4h?: number | null;
  change8h?: number | null;
  change12h?: number | null;
  
  /**
   * Position in 24h range (0-100)
   */
  rangePosition24h?: number | null;
}
