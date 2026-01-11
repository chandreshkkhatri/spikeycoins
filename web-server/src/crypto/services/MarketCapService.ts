/**
 * MarketCapService
 * Loads and manages market cap data from database
 */

import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';

interface MarketCapData {
  binanceSymbol: string;
  baseAsset: string;
  marketType: 'spot' | 'futures';
  marketCap?: number;
  coingeckoId?: string;
  coingeckoName?: string;
  volume24h?: number;
  circulatingSupply?: number;
  maxSupply?: number;
  priceChange24h?: number;
  priceChangePercentage24h?: number;
}

class MarketCapService {
  private static marketCapData: Map<string, MarketCapData> = new Map();
  private static lastUpdateTime: number = 0;
  private static updateInterval = 5 * 60 * 1000; // 5 minutes
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Initialize the service and load data
   */
  static async initialize(): Promise<void> {
    await this.loadMarketCapData();
    
    // Periodic reload every 5 minutes
    this.intervalId = setInterval(() => {
      this.loadMarketCapData();
    }, this.updateInterval);

    logger.info('MarketCapService: Service initialized');
  }

  /**
   * Stop the service
   */
  static cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('MarketCapService: Service stopped');
    }
  }

  /**
   * Load market cap data from database
   */
  private static async loadMarketCapData(): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady()) {
        await DatabaseConnection.initialize();
      }

      const db = DatabaseConnection.getDatabase();
      if (!db) {
        logger.warn('MarketCapService: Database connection not available');
        return;
      }

      const collection = db.collection('binance_coingecko_matches');
      
      // Load all matches from database
      const matches = await collection.find({}).toArray();

      // Clear existing data
      this.marketCapData.clear();

      // Populate market cap data
      for (const match of matches) {
        this.marketCapData.set(match.binanceSymbol, {
          binanceSymbol: match.binanceSymbol,
          baseAsset: match.baseAsset,
          marketType: match.marketType,
          marketCap: match.marketCap,
          coingeckoId: match.coingeckoId,
          coingeckoName: match.coingeckoName,
          volume24h: match.volume24h,
          circulatingSupply: match.circulatingSupply,
          maxSupply: match.maxSupply,
          priceChange24h: match.price_change_24h,
          priceChangePercentage24h: match.price_change_percentage_24h
        });
      }

      this.lastUpdateTime = Date.now();
      logger.info(`MarketCapService: Loaded market cap data for ${this.marketCapData.size} symbols from database`);
      
    } catch (error) {
      logger.error('MarketCapService: Error loading market cap data from database:', error);
    }
  }

  /**
   * Get market cap data for a symbol
   */
  static getMarketCapData(symbol: string): MarketCapData | undefined {
    return this.marketCapData.get(symbol);
  }

  /**
   * Get all symbols with their market types
   */
  static getAllSymbols(): Map<string, MarketCapData> {
    return this.marketCapData;
  }

  /**
   * Check if a symbol is available in futures market
   */
  static isFuturesAvailable(symbol: string): boolean {
    const data = this.marketCapData.get(symbol);
    return data?.marketType === 'futures' || false;
  }

  /**
   * Get top symbols by market cap
   */
  static getTopSymbolsByMarketCap(limit: number = 100): string[] {
    const symbolsWithMarketCap = Array.from(this.marketCapData.entries())
      .filter(([_, data]) => data.marketCap && data.marketCap > 0)
      .sort((a, b) => (b[1].marketCap || 0) - (a[1].marketCap || 0))
      .slice(0, limit)
      .map(([symbol]) => symbol);
    
    return symbolsWithMarketCap;
  }

  /**
   * Force reload data from database
   */
  static async forceReload(): Promise<void> {
    await this.loadMarketCapData();
  }

  /**
   * Get last update time
   */
  static getLastUpdateTime(): Date | null {
    return this.lastUpdateTime > 0 ? new Date(this.lastUpdateTime) : null;
  }
}

export default MarketCapService;
