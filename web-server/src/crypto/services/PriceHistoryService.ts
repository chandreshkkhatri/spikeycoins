/**
 * Price History Service
 * Tracks price history for calculating 7-day changes
 */

import DatabaseConnection from "./DatabaseConnection";
import DataManager from "../core/DataManager";
import logger from "../utils/logger";

interface PriceSnapshot {
  symbol: string;
  price: number;
  timestamp: Date;
}

interface CryptoWith7dChange {
  symbol: string;
  name: string;
  price: string;
  change_24h: number;
  change_7d: number;
  volume: string;
}

class PriceHistoryService {
  private static instance: PriceHistoryService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // Take snapshot every hour

  private constructor() {}

  static getInstance(): PriceHistoryService {
    if (!PriceHistoryService.instance) {
      PriceHistoryService.instance = new PriceHistoryService();
    }
    return PriceHistoryService.instance;
  }

  /**
   * Start periodic price snapshots
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('PriceHistoryService: Already running');
      return;
    }

    logger.info('PriceHistoryService: Starting periodic price snapshots (every hour)');

    // Take immediate snapshot
    this.takeSnapshot();

    // Schedule hourly snapshots
    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, this.SNAPSHOT_INTERVAL_MS);
  }

  /**
   * Stop periodic snapshots
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('PriceHistoryService: Stopped');
    }
  }

  /**
   * Take a snapshot of current prices and store in database
   */
  private async takeSnapshot(): Promise<void> {
    try {
      const tickers = DataManager.getAllTickers();

      if (tickers.length === 0) {
        logger.warn('PriceHistoryService: No ticker data available for snapshot');
        return;
      }

      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      const db = DatabaseConnection.getDatabase();
      if (!db) {
        throw new Error('Database connection not available');
      }

      const priceHistoryCollection = db.collection('price_history');
      const BATCH_SIZE = 500;
      let totalSaved = 0;

      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const snapshots: PriceSnapshot[] = batch.map((ticker: any) => ({
          symbol: ticker.s || 'UNKNOWN',
          price: parseFloat(ticker.c || '0'),
          timestamp: new Date(),
        }));
        
        if (snapshots.length > 0) {
          await priceHistoryCollection.insertMany(snapshots);
          totalSaved += snapshots.length;
        }
      }

      logger.info(`PriceHistoryService: Saved ${totalSaved} price snapshots`);

      // Clean up old data (keep only last 8 days)
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const deleteResult = await priceHistoryCollection.deleteMany({
        timestamp: { $lt: eightDaysAgo },
      });

      if (deleteResult.deletedCount && deleteResult.deletedCount > 0) {
        logger.info(`PriceHistoryService: Cleaned up ${deleteResult.deletedCount} old snapshots`);
      }
    } catch (error) {
      logger.error('PriceHistoryService: Error taking snapshot:', error);
    }
  }

  /**
   * Fetch 7-day kline data from Binance API for a symbol
   */
  private async fetch7dPriceFromBinance(symbol: string): Promise<number | null> {
    try {
      const axios = (await import('axios')).default;
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
          symbol: symbol,
          interval: '1d',
          startTime: sevenDaysAgoMs,
          limit: 1,
        },
        timeout: 5000,
      });

      if (response.data && response.data.length > 0) {
        // Kline format: [openTime, open, high, low, close, ...]
        return parseFloat(response.data[0][1]); // Open price 7 days ago
      }

      return null;
    } catch (error) {
      // Silently fail for individual symbols
      return null;
    }
  }

  /**
   * Calculate 7-day price changes for all cryptocurrencies
   * Falls back to Binance API if no historical data exists in database
   */
  async calculate7dChanges(): Promise<CryptoWith7dChange[]> {
    try {
      // Get current prices
      const currentTickers = DataManager.getAllTickers();

      if (currentTickers.length === 0) {
        logger.warn('PriceHistoryService: No current ticker data available');
        return [];
      }

      // Try to use database snapshots first
      const oldPriceMap = new Map<string, number>();
      let useDatabase = false;

      if (DatabaseConnection.isConnectionReady()) {
        const db = DatabaseConnection.getDatabase();
        if (db) {
          const priceHistoryCollection = db.collection('price_history');
          
          // Find the oldest snapshot we have
          const oldestSnapshot = await priceHistoryCollection
            .find({})
            .sort({ timestamp: 1 })
            .limit(1)
            .toArray();

          if (oldestSnapshot.length === 0) {
            logger.info('PriceHistoryService: No historical data in database yet');
          } else {
            const oldestTimestamp = oldestSnapshot[0].timestamp;
            const ageInDays = (Date.now() - new Date(oldestTimestamp).getTime()) / (24 * 60 * 60 * 1000);
            
            logger.info(`PriceHistoryService: Oldest snapshot is ${ageInDays.toFixed(1)} days old`);

            // Only use database if we have at least 6 days of data
            if (ageInDays >= 6) {
              // Find prices from approximately 7 days ago (within a 2-hour window)
              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

              const oldPrices = await priceHistoryCollection
                .aggregate([
                  {
                    $match: {
                      timestamp: { 
                        $gte: sevenDaysAgo,
                        $lte: sixDaysAgo  // Look for prices between 6-7 days ago
                      },
                    },
                  },
                  {
                    $sort: { timestamp: 1 },
                  },
                  {
                    $group: {
                      _id: '$symbol',
                      oldPrice: { $first: '$price' },  // Get the oldest price in this range
                      timestamp: { $first: '$timestamp' },
                    },
                  },
                ])
                .toArray();

              if (oldPrices.length > 100) {
                // We have enough historical data
                useDatabase = true;
                oldPrices.forEach((item: any) => {
                  oldPriceMap.set(item._id, item.oldPrice);
                });
                logger.info(`PriceHistoryService: Using database snapshots for 7d changes (${oldPrices.length} symbols, ~${ageInDays.toFixed(1)} days old)`);
              } else {
                logger.info(`PriceHistoryService: Not enough symbols in 7d range (found ${oldPrices.length}), falling back to Binance API`);
              }
            } else {
              logger.info(`PriceHistoryService: Historical data too recent (${ageInDays.toFixed(1)} days), need at least 6 days. Falling back to Binance API`);
            }
          }
        }
      }

      // If not enough database data, fetch from Binance API
      if (!useDatabase) {
        logger.info('PriceHistoryService: Fetching 7d data from Binance API (database history not yet available)');

        // Fetch in batches to avoid rate limits
        const batchSize = 10;
        const symbols = currentTickers.map((t: any) => t.s).filter((s: string) => s);

        for (let i = 0; i < Math.min(symbols.length, 200); i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);
          const promises = batch.map(async (symbol: string) => {
            const oldPrice = await this.fetch7dPriceFromBinance(symbol);
            if (oldPrice) {
              oldPriceMap.set(symbol, oldPrice);
            }
          });

          await Promise.all(promises);

          // Small delay between batches to respect rate limits
          if (i + batchSize < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        logger.info(`PriceHistoryService: Fetched 7d prices for ${oldPriceMap.size} symbols from Binance`);
      }

      // Calculate 7d changes
      const result: CryptoWith7dChange[] = currentTickers
        .map((ticker: any) => {
          const symbol = ticker.s || 'UNKNOWN';
          const currentPrice = parseFloat(ticker.c || '0');
          const oldPrice = oldPriceMap.get(symbol);

          let change_7d = 0;
          if (oldPrice && oldPrice > 0) {
            change_7d = ((currentPrice - oldPrice) / oldPrice) * 100;
          }

          return {
            symbol: symbol.replace('USDT', ''),
            name: symbol.replace('USDT', ''),
            price: currentPrice.toString(),
            change_24h: parseFloat(ticker.P || '0'),
            change_7d,
            volume: ticker.q || '0',
          };
        })
        .filter((item) => !isNaN(item.change_7d) && item.change_7d !== 0);

      return result;
    } catch (error) {
      logger.error('PriceHistoryService: Error calculating 7d changes:', error);
      return [];
    }
  }

  /**
   * Get top gainers and losers for 7-day timeframe
   */
  async get7dTopMovers(limit: number = 5): Promise<{
    gainers: CryptoWith7dChange[];
    losers: CryptoWith7dChange[];
  }> {
    try {
      const allCryptos = await this.calculate7dChanges();

      if (allCryptos.length === 0) {
        return { gainers: [], losers: [] };
      }

      // Sort by 7d change
      const sortedByChange = [...allCryptos].sort((a, b) => b.change_7d - a.change_7d);

      const gainers = sortedByChange.slice(0, limit);
      const losers = sortedByChange.slice(-limit).reverse();

      return { gainers, losers };
    } catch (error) {
      logger.error('PriceHistoryService: Error getting 7d top movers:', error);
      return { gainers: [], losers: [] };
    }
  }

  /**
   * Get status
   */
  getStatus(): { running: boolean; interval: string } {
    return {
      running: this.intervalId !== null,
      interval: '1 hour',
    };
  }
}

export default PriceHistoryService;
