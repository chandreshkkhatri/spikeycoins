/**
 * Daily Candlestick Service
 * Manages 1-day candlestick data for efficient 7-day change calculations
 * Uses Binance klines API with automatic backfill capability
 */

import DatabaseConnection from "./DatabaseConnection";
import DataManager from "../core/DataManager";
import { CandlestickModel } from "../models/Candlestick";
import logger from "../utils/logger";
import { BinanceService } from "../../lib/binance-service";

interface DailyCandle {
  symbol: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface CryptoWith7dChange {
  symbol: string;
  name: string;
  price: string;
  change_24h: number;
  change_7d: number;
  volume: string;
}

class DailyCandlestickService {
  private static instance: DailyCandlestickService;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
  private readonly DAYS_TO_KEEP = 10; // Keep 10 days of daily candles
  private isBackfilling = false;

  private constructor() {}

  static getInstance(): DailyCandlestickService {
    if (!DailyCandlestickService.instance) {
      DailyCandlestickService.instance = new DailyCandlestickService();
    }
    return DailyCandlestickService.instance;
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      logger.warn('DailyCandlestickService: Already running');
      return;
    }

    logger.info('DailyCandlestickService: Starting daily candlestick management');

    // Initial backfill check
    await this.checkAndBackfill();

    // Schedule periodic updates (every hour, check if we need new data)
    this.intervalId = setInterval(async () => {
      await this.checkAndBackfill();
    }, this.UPDATE_INTERVAL_MS);
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('DailyCandlestickService: Stopped');
    }
  }

  /**
   * Check if we need to backfill data and do it
   */
  private async checkAndBackfill(): Promise<void> {
    if (this.isBackfilling) {
      logger.debug('DailyCandlestickService: Backfill already in progress');
      return;
    }

    try {
      this.isBackfilling = true;

      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      // Get list of symbols to track
      const currentTickers = DataManager.getAllTickers();
      if (currentTickers.length === 0) {
        logger.warn('DailyCandlestickService: No ticker data available');
        return;
      }

      const symbols = currentTickers.map((t: any) => t.s).filter((s: string) => s);

      // Check which symbols need backfill (sample 50 symbols to avoid heavy queries)
      const sampleSize = Math.min(50, symbols.length);
      const sampleSymbols = symbols.slice(0, sampleSize);

      let symbolsNeedingBackfill = 0;
      
      for (const symbol of sampleSymbols) {
        const needsBackfill = await this.needsBackfill(symbol);
        if (needsBackfill) {
          symbolsNeedingBackfill++;
        }
      }

      // If more than 20% of sampled symbols need backfill, do a full backfill
      const backfillPercentage = (symbolsNeedingBackfill / sampleSize) * 100;
      
      if (backfillPercentage > 20) {
        logger.info(`DailyCandlestickService: ${backfillPercentage.toFixed(0)}% of symbols need backfill, starting full backfill...`);
        await this.backfillAllSymbols(symbols);
      } else if (symbolsNeedingBackfill > 0) {
        logger.info(`DailyCandlestickService: ${symbolsNeedingBackfill} symbols need update, fetching...`);
        // Just update the ones that need it
        for (const symbol of sampleSymbols) {
          const needsBackfill = await this.needsBackfill(symbol);
          if (needsBackfill) {
            await this.backfillSymbol(symbol);
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
          }
        }
      } else {
        logger.debug('DailyCandlestickService: All sampled symbols up to date');
      }

    } catch (error) {
      logger.error('DailyCandlestickService: Error in checkAndBackfill:', error);
    } finally {
      this.isBackfilling = false;
    }
  }

  /**
   * Check if a symbol needs backfill
   */
  private async needsBackfill(symbol: string): Promise<boolean> {
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Check if we have a daily candle from around 7 days ago
      const oldCandle = await CandlestickModel.findOne({
        symbol,
        interval: '1d',
        openTime: { $gte: sevenDaysAgo - 24 * 60 * 60 * 1000, $lte: sevenDaysAgo + 24 * 60 * 60 * 1000 }
      });

      return !oldCandle;
    } catch (error) {
      logger.error(`DailyCandlestickService: Error checking backfill need for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Backfill all symbols with daily candlestick data
   */
  private async backfillAllSymbols(symbols: string[]): Promise<void> {
    logger.info(`DailyCandlestickService: Starting backfill for ${symbols.length} symbols...`);

    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;

    // Process in batches to respect rate limits
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(symbol => this.backfillSymbol(symbol))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          errorCount++;
          logger.debug(`DailyCandlestickService: Failed to backfill ${batch[index]}`);
        }
      });

      // Rate limiting between batches
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Log progress every 100 symbols
      if ((i + batchSize) % 100 === 0) {
        logger.info(`DailyCandlestickService: Progress ${i + batchSize}/${symbols.length} (${successCount} success, ${errorCount} errors)`);
      }
    }

    logger.info(`DailyCandlestickService: Backfill complete! ${successCount} successful, ${errorCount} errors`);
  }

  /**
   * Backfill daily candlestick data for a single symbol
   */
  private async backfillSymbol(symbol: string): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      
      // Fetch last 10 days of daily candles
      const response = await BinanceService.scheduleRequest(() => 
        axios.get('https://api.binance.com/api/v3/klines', {
          params: {
            symbol: symbol,
            interval: '1d',
            limit: this.DAYS_TO_KEEP,
          },
          timeout: 5000,
        })
      );

      if (response.data && response.data.length > 0) {
        const candles = response.data.map((kline: any) => ({
          symbol,
          openTime: kline[0],
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
          closeTime: kline[6],
          interval: '1d',
        }));

        // Use bulk upsert for better performance
        const bulkOps = candles.map((candle: DailyCandle & { interval: string }) => ({
          updateOne: {
            filter: { symbol: candle.symbol, openTime: candle.openTime, interval: '1d' },
            update: { $set: candle },
            upsert: true
          }
        }));

        if (bulkOps.length > 0) {
          await CandlestickModel.bulkWrite(bulkOps, { ordered: false });
        }

        logger.debug(`DailyCandlestickService: Backfilled ${candles.length} daily candles for ${symbol}`);
      }
    } catch (error: any) {
      // Silently fail for individual symbols (they might be delisted or rate limited)
      if (error.response?.status !== 429) {
        logger.debug(`DailyCandlestickService: Could not backfill ${symbol}`);
      }
    }
  }

  /**
   * Calculate 7-day price changes using daily candlesticks
   */
  async calculate7dChanges(): Promise<CryptoWith7dChange[]> {
    try {
      // Get current prices
      const currentTickers = DataManager.getAllTickers();

      if (currentTickers.length === 0) {
        logger.warn('DailyCandlestickService: No current ticker data available');
        return [];
      }

      // Get 7-day old prices from daily candlesticks
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;

      // Get all symbols
      const symbols = currentTickers.map((t: any) => t.s).filter((s: string) => s);

      // Fetch old prices in one query
      const oldCandles = await CandlestickModel.find({
        symbol: { $in: symbols },
        interval: '1d',
        openTime: { $gte: sevenDaysAgo, $lte: sixDaysAgo }
      });

      // Create a map of symbol -> old price
      const oldPriceMap = new Map<string, number>();
      oldCandles.forEach(candle => {
        if (!oldPriceMap.has(candle.symbol)) {
          oldPriceMap.set(candle.symbol, candle.open);
        }
      });

      logger.info(`DailyCandlestickService: Found 7d data for ${oldPriceMap.size} symbols in database`);

      // If we don't have enough data, trigger backfill for next time
      if (oldPriceMap.size < symbols.length * 0.5) {
        logger.warn(`DailyCandlestickService: Only have 7d data for ${oldPriceMap.size}/${symbols.length} symbols, triggering backfill...`);
        // Don't await - let it run in background
        this.checkAndBackfill().catch(err => 
          logger.error('DailyCandlestickService: Background backfill error:', err)
        );
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
      logger.error('DailyCandlestickService: Error calculating 7d changes:', error);
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
      logger.error('DailyCandlestickService: Error getting 7d top movers:', error);
      return { gainers: [], losers: [] };
    }
  }

  /**
   * Get status
   */
  getStatus(): { running: boolean; interval: string } {
    return {
      running: this.intervalId !== null,
      interval: `${this.UPDATE_INTERVAL_MS / 1000 / 60} minutes`,
    };
  }

  /**
   * Manual trigger for backfill (useful for debugging)
   */
  async manualBackfill(): Promise<void> {
    const currentTickers = DataManager.getAllTickers();
    const symbols = currentTickers.map((t: any) => t.s).filter((s: string) => s);
    
    if (symbols.length > 500) {
      logger.warn(`DailyCandlestickService: Manual backfill triggered for large set (${symbols.length} symbols). This may take a while.`);
    }
    
    await this.backfillAllSymbols(symbols);
  }
}

export default DailyCandlestickService;

