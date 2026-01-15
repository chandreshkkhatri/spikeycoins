/**
 * Candle Interface
 * Represents OHLCV candlestick data for any instrument
 */

export interface ICandle {
  /**
   * Trading symbol
   */
  symbol: string;
  
  /**
   * Candle open time (Unix timestamp in ms)
   */
  openTime: number;
  
  /**
   * Candle close time (Unix timestamp in ms)
   */
  closeTime: number;
  
  /**
   * Opening price
   */
  open: number;
  
  /**
   * Highest price
   */
  high: number;
  
  /**
   * Lowest price
   */
  low: number;
  
  /**
   * Closing price
   */
  close: number;
  
  /**
   * Trading volume
   */
  volume: number;
}
