/**
 * DataManager
 * Central data storage and management for cryptocurrency ticker and candlestick data
 */
import logger from "../utils/logger";
import { calculate24hRangePosition } from "../utils/calculations";
import MarketCapService from "../services/MarketCapService";
import CandlestickStorage from "../services/CandlestickStorage";

interface TickerData {
  // Original Binance fields
  s: string;    // Symbol
  c: string;    // Close price
  o: string;    // Open price  
  h: string;    // High price
  l: string;    // Low price
  v: string;    // Volume
  q: string;    // Quote volume
  P: string;    // Price change percent
  p: string;    // Price change
  C: number;    // Close time
  O: number;    // Open time

  // Calculated fields
  price: number;
  change_24h: number;
  change_1h: number | null;
  change_4h: number | null;
  change_8h: number | null;
  change_12h: number | null;
  high_24h: number;
  low_24h: number;
  range_position_24h: number | null;
  volume_usd: number;
  volume_base: number;
  market_cap: number | null;
  is_futures: boolean;
  last_updated: string;
}

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

interface SymbolStats {
  symbol: string;
  volume24h: number;
  lastSeen: number;
  rank: number;
}

class DataManager {
  private static tickers: Map<string, TickerData> = new Map();
  private static candlesticks: Map<string, Map<string, CandlestickData[]>> = new Map(); // symbol -> interval -> data
  private static discoveredSymbols: Map<string, SymbolStats> = new Map();
  private static lastDiscoveryUpdate: number = 0;
  private static readonly DISCOVERY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static readonly SYMBOL_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes
  private static readonly MIN_VOLUME_THRESHOLD = 1000;

  private static lastCalculationTime: Map<string, number> = new Map();
  private static readonly CALCULATION_THROTTLE_MS = 60 * 1000; // 1 minute

  /**
   * Update ticker data from WebSocket stream
   */
  static updateTickers(tickerArray: any[]): void {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    let newSymbolCount = 0;
    let updatedSymbolCount = 0;
    
    for (const rawTicker of tickerArray) {
      if (!rawTicker.s || !rawTicker.s.endsWith('USDT')) continue;
      
      const symbol = rawTicker.s;
      const price = parseFloat(rawTicker.c);
      const volume = parseFloat(rawTicker.v);
      const volume24h = parseFloat(rawTicker.q) || 0;
      
      // Skip low volume pairs
      if (volume24h < this.MIN_VOLUME_THRESHOLD) continue;
      
      // Calculate changes asynchronously and update ticker later
      // THROTTLED: Only calculate if enough time has passed since last calculation
      const lastCalc = this.lastCalculationTime.get(symbol) || 0;
      if (timestamp - lastCalc > this.CALCULATION_THROTTLE_MS) {
        this.lastCalculationTime.set(symbol, timestamp);
        
        CandlestickStorage.calculatePriceChanges(symbol, price).then(changes => {
          const existingTicker = this.tickers.get(symbol);
          if (existingTicker) {
            existingTicker.change_1h = changes.change_1h;
            existingTicker.change_4h = changes.change_4h;
            existingTicker.change_8h = changes.change_8h;
            existingTicker.change_12h = changes.change_12h;
          }
        }).catch(_error => {
          // Silently ignore errors to avoid log spam
        });
      }
      
      // Calculate 24h range position
      const rangePosition = calculate24hRangePosition(rawTicker);

      // Get market cap data if available
      const marketCapData = MarketCapService.getMarketCapData(symbol);
      
      // Preserve existing calculated fields if not updating them
      const existingTicker = this.tickers.get(symbol);
      
      const ticker: TickerData = {
        // Original fields
        s: symbol,
        c: rawTicker.c,
        o: rawTicker.o,
        h: rawTicker.h,
        l: rawTicker.l,
        v: rawTicker.v,
        q: rawTicker.q,
        P: rawTicker.P,
        p: rawTicker.p,
        C: rawTicker.C,
        O: rawTicker.O,
        
        // Calculated fields
        price,
        change_24h: parseFloat(rawTicker.P),
        change_1h: existingTicker ? existingTicker.change_1h : null,
        change_4h: existingTicker ? existingTicker.change_4h : null,
        change_8h: existingTicker ? existingTicker.change_8h : null,
        change_12h: existingTicker ? existingTicker.change_12h : null,
        high_24h: parseFloat(rawTicker.h),
        low_24h: parseFloat(rawTicker.l),
        range_position_24h: rangePosition,
        volume_usd: volume * price,
        volume_base: volume,
        market_cap: marketCapData?.marketCap || null,
        is_futures: marketCapData?.marketType === 'futures' || false,
        last_updated: now,
      };
      
      this.tickers.set(symbol, ticker);
      
      // Update discovery tracking
      const existing = this.discoveredSymbols.get(symbol);
      if (existing) {
        existing.volume24h = volume24h;
        existing.lastSeen = timestamp;
        updatedSymbolCount++;
      } else {
        this.discoveredSymbols.set(symbol, {
          symbol,
          volume24h,
          lastSeen: timestamp,
          rank: 0, // Will be calculated
        });
        newSymbolCount++;
      }
    }
    
    // Clean up expired symbols and update rankings
    this.cleanupExpiredSymbols(timestamp);
    this.cleanupStaleData(timestamp); // Add cleanup for stale tickers
    this.updateSymbolRankings();
    
    // Log discovery updates periodically
    if (timestamp - this.lastDiscoveryUpdate > this.DISCOVERY_UPDATE_INTERVAL) {
      const totalSymbols = this.discoveredSymbols.size;
      logger.info(`DataManager: Discovered ${totalSymbols} active USDT symbols (${newSymbolCount} new, ${updatedSymbolCount} updated)`);
      this.lastDiscoveryUpdate = timestamp;
    }
    
    // Only log ticker updates periodically to avoid log spam
    if (timestamp - this.lastDiscoveryUpdate > this.DISCOVERY_UPDATE_INTERVAL) {
      logger.debug(`DataManager: Updated ${tickerArray.length} tickers, tracking ${this.tickers.size} symbols`);
    }
  }

  /**
   * Remove inactive tickers and candlesticks to prevent memory leaks
   */
  private static cleanupStaleData(now: number): void {
    // Only run cleanup periodically (e.g., every 1 hour)
    // We use the same interval as DISCOVERY_UPDATE_INTERVAL (5m) for check, but actual cleanup threshold is 24h
    if (now - this.lastDiscoveryUpdate < this.DISCOVERY_UPDATE_INTERVAL) return;

    const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
    let removedTickers = 0;
    
    // Cleanup stale tickers
    for (const [symbol, ticker] of this.tickers.entries()) {
      const lastUpdate = new Date(ticker.last_updated).getTime();
      if (now - lastUpdate > STALE_THRESHOLD) {
        this.tickers.delete(symbol);
        this.lastCalculationTime.delete(symbol);
        removedTickers++;
      }
    }

    // Cleanup stale in-memory candlesticks
    // Note: CandlestickStorage handles its own cache, but DataManager also keeps a small buffer
    for (const symbol of this.candlesticks.keys()) {
      if (!this.tickers.has(symbol)) {
        this.candlesticks.delete(symbol);
      }
    }

    if (removedTickers > 0) {
      logger.info(`DataManager: Cleaned up ${removedTickers} stale tickers`);
    }
  }

  /**
   * Update candlestick data
   */
  static updateCandlesticks(symbol: string, candlestickArray: any[], interval: string = '15m'): void {
    const candlesticks = candlestickArray.map(candle => ({
      symbol,
      openTime: candle[0],
      closeTime: candle[6],
      open: candle[1],
      high: candle[2], 
      low: candle[3],
      close: candle[4],
      volume: candle[5],
      interval,
    }));
    
    // Ensure symbol entry exists
    if (!this.candlesticks.has(symbol)) {
      this.candlesticks.set(symbol, new Map());
    }
    
    // Store data for the specific interval
    this.candlesticks.get(symbol)!.set(interval, candlesticks);
    // Reduce candlestick logging frequency
    if (Math.random() < 0.1) { // Log only 10% of candlestick updates
      logger.debug(`DataManager: Updated ${candlesticks.length} candlesticks for ${symbol} (${interval})`);
    }
  }

  /**
   * Get all ticker data
   */
  static getAllTickers(): TickerData[] {
    return Array.from(this.tickers.values())
      .sort((a, b) => b.volume_usd - a.volume_usd);
  }

  /**
   * Get candlestick data for a symbol and interval
   */
  static getCandlesticks(symbol: string, interval: string = '15m'): CandlestickData[] {
    const symbolData = this.candlesticks.get(symbol);
    if (!symbolData) return [];
    return symbolData.get(interval) || [];
  }
  
  /**
   * Get all active symbols (symbols with recent ticker updates)
   */
  static getActiveSymbols(): string[] {
    const activeSymbols: string[] = [];
    const now = Date.now();
    const ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    this.tickers.forEach((ticker, symbol) => {
      const lastUpdate = new Date(ticker.last_updated).getTime();
      if (now - lastUpdate < ACTIVE_THRESHOLD) {
        activeSymbols.push(symbol);
      }
    });
    
    return activeSymbols;
  }

  /**
   * Get ticker data for a specific symbol
   */
  static getTickerBySymbol(symbol: string): TickerData | null {
    return this.tickers.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get candlestick summary
   */
  static getCandlestickSummary() {
    const summary: any[] = [];
    this.candlesticks.forEach((intervalMap, symbol) => {
      const intervals: any = {};
      let totalCandles = 0;
      let latestTime = 0;
      
      intervalMap.forEach((candles, interval) => {
        intervals[interval] = {
          candleCount: candles.length,
          latestTime: candles.length > 0 ? candles[candles.length - 1].closeTime : 0,
        };
        totalCandles += candles.length;
        if (intervals[interval].latestTime > latestTime) {
          latestTime = intervals[interval].latestTime;
        }
      });
      
      summary.push({
        symbol,
        intervals,
        totalCandles,
        latestTime,
      });
    });
    return summary;
  }

  /**
   * Get statistics
   */
  static getStats() {
    return {
      tickerCount: this.tickers.size,
      candlestickSymbols: this.candlesticks.size,
      discoveredSymbols: this.discoveredSymbols.size,
    };
  }

  /**
   * Check if ticker data is available (has received initial data)
   */
  static hasData(): boolean {
    return this.tickers.size > 0;
  }

  /**
   * Wait for initial ticker data to be available
   * @param timeoutMs Maximum time to wait in milliseconds (default 30 seconds)
   * @param minSymbols Minimum number of symbols to consider ready (default 10)
   * @returns Promise that resolves when data is ready or rejects on timeout
   */
  static async waitForData(timeoutMs: number = 30000, minSymbols: number = 10): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

    return new Promise((resolve, reject) => {
      const checkData = () => {
        const symbolCount = this.tickers.size;

        if (symbolCount >= minSymbols) {
          logger.info(`DataManager: Data ready with ${symbolCount} symbols`);
          resolve();
          return;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutMs) {
          const errorMsg = `DataManager: Timeout waiting for ticker data after ${elapsed}ms (got ${symbolCount} symbols, need ${minSymbols})`;
          logger.error(errorMsg);
          reject(new Error(errorMsg));
          return;
        }

        // Log progress periodically
        if (elapsed % 2000 < checkInterval) {
          logger.info(`DataManager: Waiting for ticker data... (${symbolCount} symbols received, need ${minSymbols})`);
        }

        setTimeout(checkData, checkInterval);
      };

      checkData();
    });
  }

  /**
   * Get discovery statistics (like SymbolDiscoveryService)
   */
  static getDiscoveryStats() {
    const symbols = Array.from(this.discoveredSymbols.values());
    const avgVolume = symbols.length > 0 
      ? symbols.reduce((sum, info) => sum + info.volume24h, 0) / symbols.length 
      : 0;

    return {
      totalSymbols: symbols.length,
      lastUpdate: this.lastDiscoveryUpdate,
      topSymbols: this.getTopSymbolsByVolume(20),
      avgVolume: Math.round(avgVolume),
      minVolumeThreshold: this.MIN_VOLUME_THRESHOLD,
      symbolExpiryTime: this.SYMBOL_EXPIRY_TIME,
    };
  }

  /**
   * Get top symbols by volume
   */
  static getTopSymbolsByVolume(count: number): string[] {
    return Array.from(this.discoveredSymbols.values())
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, count)
      .map(info => info.symbol);
  }

  /**
   * Get storage statistics (simulated for in-memory)
   */
  static getStorageStats() {
    let totalCandles = 0;
    let totalSymbols = 0;
    const intervalStats: any = {};

    this.candlesticks.forEach((intervalMap, symbol) => {
      totalSymbols++;
      intervalMap.forEach((candles, interval) => {
        totalCandles += candles.length;
        if (!intervalStats[interval]) {
          intervalStats[interval] = { symbols: 0, candles: 0 };
        }
        intervalStats[interval].symbols++;
        intervalStats[interval].candles += candles.length;
      });
    });

    // Estimate memory usage (very rough)
    const estimatedSizeBytes = (totalCandles * 200) + (this.tickers.size * 500); // rough estimate
    
    return {
      metadata: {
        type: 'in-memory',
        persistent: false,
        note: 'Data is stored in memory only and will be lost on restart'
      },
      filesCount: 0, // No files for in-memory
      totalSizeBytes: estimatedSizeBytes,
      inMemory: {
        tickerSymbols: this.tickers.size,
        candlestickSymbols: totalSymbols,
        totalCandles,
        intervalStats,
      }
    };
  }

  /**
   * Remove symbols that haven't been seen recently
   */
  private static cleanupExpiredSymbols(now: number): void {
    let removedCount = 0;
    for (const [symbol, info] of this.discoveredSymbols.entries()) {
      if (now - info.lastSeen > this.SYMBOL_EXPIRY_TIME) {
        this.discoveredSymbols.delete(symbol);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`DataManager: Removed ${removedCount} expired symbols`);
    }
  }

  /**
   * Update symbol rankings based on volume
   */
  private static updateSymbolRankings(): void {
    const symbols = Array.from(this.discoveredSymbols.values())
      .sort((a, b) => b.volume24h - a.volume24h);
    
    symbols.forEach((symbol, index) => {
      symbol.rank = index + 1;
    });
  }

  /**
   * Clear all data (for testing)
   */
  static clearAll(): void {
    this.tickers.clear();
    this.candlesticks.clear();
    this.discoveredSymbols.clear();
    this.lastDiscoveryUpdate = 0;
  }
}

export default DataManager;