/**
 * CandlestickStorage Service with Mongoose Backend
 * Efficiently stores and retrieves historical candlestick data
 * Optimized for 5-minute candles to calculate 1h, 4h, 8h, 12h changes
 */

import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';
import { CandlestickModel } from '../models/Candlestick';

interface Candlestick {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

class CandlestickStorage {
  private static readonly MAX_CANDLES_PER_SYMBOL = 288; // 24 hours of 5m candles
  private static isInitialized = false;

  // In-memory cache for fast access
  private static cache: Map<string, Candlestick[]> = new Map();
  private static cacheTimestamps: Map<string, number> = new Map();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Initialize storage and Mongoose connection
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure database connection
      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      this.isInitialized = true;
      logger.info('CandlestickStorage: Initialized with Mongoose CandlestickModel');

      // periodic cache cleanup every hour
      setInterval(() => {
        this.cleanupCache();
      }, 60 * 60 * 1000);

    } catch (error) {
      logger.error('CandlestickStorage: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Cleanup stale cache entries
   */
  private static cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [symbol, timestamp] of this.cacheTimestamps.entries()) {
      // If cache hasn't been accessed/updated in 1 hour
      if (now - timestamp > 60 * 60 * 1000) {
        this.cache.delete(symbol);
        this.cacheTimestamps.delete(symbol);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.info(`CandlestickStorage: Cleaned up ${removedCount} stale cache entries`);
    }
  }

  /**
   * Store candlestick data for a symbol
   */
  static async storeCandlesticks(symbol: string, candlesticks: any[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('CandlestickStorage not initialized');
    }

    try {
      const processed = candlesticks.map(c => ({
        symbol,
        openTime: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        closeTime: c[6],
        interval: '5m',
      }));

      // Use bulk upsert for better performance
      const bulkOps = processed.map(candle => ({
        updateOne: {
          filter: { symbol: candle.symbol, openTime: candle.openTime },
          update: { $set: candle },
          upsert: true
        }
      }));

      if (bulkOps.length > 0) {
        await CandlestickModel.bulkWrite(bulkOps, { ordered: false });

        // Update cache
        this.updateCache(symbol, processed.map(doc => ({
          openTime: doc.openTime,
          open: doc.open,
          high: doc.high,
          low: doc.low,
          close: doc.close,
          volume: doc.volume,
          closeTime: doc.closeTime
        })));

        // Clean old data for this symbol (keep only latest 288 candles)
        await this.cleanOldCandles(symbol);
      }

    } catch (error) {
      logger.error(`CandlestickStorage: Error storing candlesticks for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Clean old candles to keep only the most recent ones
   */
  private static async cleanOldCandles(symbol: string): Promise<void> {
    try {
      // Get the count of candles for this symbol
      const count = await CandlestickModel.countDocuments({ symbol });

      if (count > this.MAX_CANDLES_PER_SYMBOL) {
        // Find the timestamp to keep (288th most recent)
        const oldestToKeep = await CandlestickModel
          .find({ symbol })
          .sort({ openTime: -1 })
          .skip(this.MAX_CANDLES_PER_SYMBOL - 1)
          .limit(1);

        if (oldestToKeep.length > 0) {
          const cutoffTime = oldestToKeep[0].openTime;
          await CandlestickModel.deleteMany({
            symbol,
            openTime: { $lt: cutoffTime }
          });
        }
      }
    } catch (error) {
      logger.error(`CandlestickStorage: Error cleaning old candles for ${symbol}:`, error);
    }
  }

  /**
   * Update in-memory cache
   */
  private static updateCache(symbol: string, candles: Candlestick[]): void {
    // Sort candles by time
    const sortedCandles = candles.sort((a, b) => a.openTime - b.openTime);
    this.cache.set(symbol, sortedCandles);
    this.cacheTimestamps.set(symbol, Date.now());
  }

  /**
   * Get candlesticks from cache or database
   */
  private static async getCandlesticks(symbol: string): Promise<Candlestick[]> {
    // Ensure DB connection is ready before querying
    if (!this.isInitialized || !DatabaseConnection.isConnectionReady()) {
      // Return empty array if not ready (will be fetched later)
      return [];
    }

    // Check cache first
    const cacheTime = this.cacheTimestamps.get(symbol);
    if (cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
      const cached = this.cache.get(symbol);
      if (cached) {
        return cached;
      }
    }

    // Load from database
    try {
      const docs = await CandlestickModel
        .find({ symbol })
        .sort({ openTime: 1 })
        .limit(this.MAX_CANDLES_PER_SYMBOL)
        .lean();

      const candles: Candlestick[] = docs.map((doc: any) => ({
        openTime: doc.openTime,
        open: doc.open,
        high: doc.high,
        low: doc.low,
        close: doc.close,
        volume: doc.volume,
        closeTime: doc.closeTime
      }));

      // Update cache
      this.updateCache(symbol, candles);

      return candles;
    } catch (error) {
      logger.error(`CandlestickStorage: Error loading candlesticks for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get price from N candles ago (for 5-minute candles)
   */
  static async getPriceCandlesAgo(symbol: string, candlesAgo: number): Promise<number | null> {
    const candles = await this.getCandlesticks(symbol);

    if (candles.length === 0) return null;

    // Get the candle from N positions back
    const targetIndex = candles.length - candlesAgo;

    if (targetIndex < 0 || targetIndex >= candles.length) {
      return null;
    }

    const targetCandle = candles[targetIndex];

    // Verify the candle is approximately the right age (within 10 minutes tolerance)
    const expectedAge = candlesAgo * 5 * 60 * 1000; // candlesAgo * 5 minutes in ms
    const actualAge = Date.now() - targetCandle.openTime;
    const tolerance = 10 * 60 * 1000; // 10 minutes tolerance

    if (Math.abs(actualAge - expectedAge) > tolerance) {
      // Candle is too old or too new, data might have gaps
      return null;
    }

    return targetCandle.open;
  }

  /**
   * Calculate price changes for all standard intervals
   */
  static async calculatePriceChanges(symbol: string, currentPrice: number): Promise<{
    change_1h: number | null;
    change_4h: number | null;
    change_8h: number | null;
    change_12h: number | null;
  }> {
    const result = {
      change_1h: null as number | null,
      change_4h: null as number | null,
      change_8h: null as number | null,
      change_12h: null as number | null,
    };

    try {
      // Calculate changes using 5-minute candles
      // 1h = 12 candles, 4h = 48 candles, 8h = 96 candles, 12h = 144 candles
      const intervals = [
        { key: 'change_1h', candles: 12 },
        { key: 'change_4h', candles: 48 },
        { key: 'change_8h', candles: 96 },
        { key: 'change_12h', candles: 144 },
      ];

      for (const { key, candles } of intervals) {
        const historicalPrice = await this.getPriceCandlesAgo(symbol, candles);
        if (historicalPrice && historicalPrice > 0) {
          const change = ((currentPrice - historicalPrice) / historicalPrice) * 100;
          (result as any)[key] = parseFloat(change.toFixed(2));
        }
      }
    } catch (error) {
      logger.error(`CandlestickStorage: Error calculating price changes for ${symbol}:`, error);
    }

    return result;
  }

  /**
   * Get the most recent candlestick data for a symbol
   */
  static async getLatestCandles(symbol: string, limit: number = 288): Promise<Candlestick[]> {
    const candles = await this.getCandlesticks(symbol);
    return candles.slice(-limit);
  }

  /**
   * Check if we have recent data for a symbol
   */
  static async hasRecentData(symbol: string, maxAgeMinutes: number = 10): Promise<boolean> {
    try {
      const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
      const recentCandle = await CandlestickModel.findOne(
        {
          symbol,
          openTime: { $gt: cutoffTime }
        }
      ).sort({ openTime: -1 });

      return recentCandle !== null;
    } catch (error) {
      logger.error(`CandlestickStorage: Error checking recent data for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Get all symbols with stored data
   */
  static async getStoredSymbols(): Promise<string[]> {
    try {
      const symbols = await CandlestickModel.distinct('symbol');
      return symbols;
    } catch (error) {
      logger.error('CandlestickStorage: Error getting stored symbols:', error);
      return [];
    }
  }

  /**
   * Get symbols that need updating
   */
  static async getSymbolsNeedingUpdate(maxAgeMinutes: number = 10): Promise<string[]> {
    try {
      const cutoffTime = new Date(Date.now() - (maxAgeMinutes * 60 * 1000));

      // Find symbols that either have no recent data or haven't been updated recently
      const pipeline = [
        {
          $group: {
            _id: '$symbol',
            latestUpdate: { $max: '$updatedAt' }
          }
        },
        {
          $match: {
            latestUpdate: { $lt: cutoffTime }
          }
        },
        {
          $project: {
            symbol: '$_id',
            _id: 0
          }
        }
      ];

      const results = await CandlestickModel.aggregate(pipeline);
      return results.map((r: any) => r.symbol);
    } catch (error) {
      logger.error('CandlestickStorage: Error getting symbols needing update:', error);
      return [];
    }
  }

  /**
   * Get statistics about stored data
   */
  static async getStats(): Promise<any> {
    try {
      const pipeline = [
        {
          $group: {
            _id: '$symbol',
            candleCount: { $sum: 1 },
            oldestUpdate: { $min: '$updatedAt' },
            newestUpdate: { $max: '$updatedAt' }
          }
        },
        {
          $group: {
            _id: null,
            symbolCount: { $sum: 1 },
            symbolsWithFullData: {
              $sum: { $cond: [{ $gte: ['$candleCount', 144] }, 1, 0] }
            },
            totalCandles: { $sum: '$candleCount' },
            oldestUpdate: { $min: '$oldestUpdate' },
            newestUpdate: { $max: '$newestUpdate' }
          }
        }
      ];

      const results = await CandlestickModel.aggregate(pipeline);

      if (results.length === 0) {
        return {
          symbolCount: 0,
          symbolsWithFullData: 0,
          totalCandles: 0,
          avgCandlesPerSymbol: 0,
          oldestUpdate: null,
          newestUpdate: null
        };
      }

      const stats = results[0];
      return {
        symbolCount: stats.symbolCount,
        symbolsWithFullData: stats.symbolsWithFullData,
        totalCandles: stats.totalCandles,
        avgCandlesPerSymbol: stats.symbolCount > 0 ? Math.round(stats.totalCandles / stats.symbolCount) : 0,
        oldestUpdate: stats.oldestUpdate ? stats.oldestUpdate.toISOString() : null,
        newestUpdate: stats.newestUpdate ? stats.newestUpdate.toISOString() : null
      };
    } catch (error) {
      logger.error('CandlestickStorage: Error getting stats:', error);
      return {
        symbolCount: 0,
        symbolsWithFullData: 0,
        totalCandles: 0,
        avgCandlesPerSymbol: 0,
        oldestUpdate: null,
        newestUpdate: null
      };
    }
  }

  /**
   * Clear all data for a symbol
   */
  static async clearSymbol(symbol: string): Promise<void> {
    try {
      await CandlestickModel.deleteMany({ symbol });
      this.cache.delete(symbol);
      this.cacheTimestamps.delete(symbol);
      logger.info(`CandlestickStorage: Cleared data for ${symbol}`);
    } catch (error) {
      logger.error(`CandlestickStorage: Error clearing data for ${symbol}:`, error);
    }
  }

  /**
   * Cleanup and close connections
   */
  static async cleanup(): Promise<void> {
    this.cache.clear();
    this.cacheTimestamps.clear();
    await DatabaseConnection.cleanup();
    logger.info('CandlestickStorage: Cleanup completed');
  }
}

export default CandlestickStorage;