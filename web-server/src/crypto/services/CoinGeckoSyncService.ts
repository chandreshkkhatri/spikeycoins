/**
 * CoinGecko Sync Service
 * Fetches market cap data from CoinGecko and maps to Binance symbols
 * Updates every 2 hours to stay within free tier rate limits
 */

import axios from 'axios';
import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  max_supply: number | null;
}

class CoinGeckoSyncService {
  private static instance: CoinGeckoSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  
  // Sync every 2 hours (free tier allows ~30 calls/min, we need ~3 calls per sync)
  private readonly SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;
  private readonly COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
  private readonly COINS_PER_PAGE = 250;
  private readonly PAGES_TO_FETCH = 2; // Top 500 coins

  private constructor() {}

  static getInstance(): CoinGeckoSyncService {
    if (!CoinGeckoSyncService.instance) {
      CoinGeckoSyncService.instance = new CoinGeckoSyncService();
    }
    return CoinGeckoSyncService.instance;
  }

  /**
   * Initialize and start periodic sync
   */
  async initialize(): Promise<void> {
    logger.info('CoinGeckoSyncService: Initializing...');
    
    // Do initial sync
    await this.syncMarketCaps();
    
    // Start periodic sync
    this.syncInterval = setInterval(() => {
      this.syncMarketCaps();
    }, this.SYNC_INTERVAL_MS);
    
    logger.info(`CoinGeckoSyncService: Started. Syncing every ${this.SYNC_INTERVAL_MS / 60000} minutes`);
  }

  /**
   * Stop the service
   */
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('CoinGeckoSyncService: Stopped');
    }
  }

  /**
   * Sync market caps from CoinGecko
   */
  async syncMarketCaps(): Promise<void> {
    if (this.isSyncing) {
      logger.warn('CoinGeckoSyncService: Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      logger.info('CoinGeckoSyncService: Starting market cap sync...');

      // Fetch market data from CoinGecko
      const allCoins: CoinGeckoMarket[] = [];
      
      for (let page = 1; page <= this.PAGES_TO_FETCH; page++) {
        const coins = await this.fetchCoinGeckoPage(page);
        allCoins.push(...coins);
        
        // Rate limiting: wait 2 seconds between requests
        if (page < this.PAGES_TO_FETCH) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      logger.info(`CoinGeckoSyncService: Fetched ${allCoins.length} coins from CoinGecko`);

      // Map to Binance symbols and store
      await this.storeMarketCaps(allCoins);

      this.lastSyncTime = new Date();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`CoinGeckoSyncService: Sync complete in ${duration}s`);

    } catch (error) {
      logger.error('CoinGeckoSyncService: Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Fetch a page of market data from CoinGecko
   */
  private async fetchCoinGeckoPage(page: number): Promise<CoinGeckoMarket[]> {
    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: Record<string, string> = {};
    
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    const response = await axios.get(`${this.COINGECKO_API_BASE}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: this.COINS_PER_PAGE,
        page,
        sparkline: false,
        price_change_percentage: '24h',
      },
      headers,
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * Store market cap data in database
   */
  private async storeMarketCaps(coins: CoinGeckoMarket[]): Promise<void> {
    if (!DatabaseConnection.isConnectionReady()) {
      await DatabaseConnection.initialize();
    }

    const db = DatabaseConnection.getDatabase();
    if (!db) {
      logger.warn('CoinGeckoSyncService: Database connection not available');
      return;
    }

    const collection = db.collection('binance_coingecko_matches');
    let upsertCount = 0;

    for (const coin of coins) {
      // Create Binance symbol (uppercase symbol + USDT)
      const binanceSymbol = coin.symbol.toUpperCase() + 'USDT';

      const doc = {
        binanceSymbol,
        baseAsset: coin.symbol.toUpperCase(),
        marketType: 'spot',
        coingeckoId: coin.id,
        coingeckoName: coin.name,
        marketCap: coin.market_cap,
        marketCapRank: coin.market_cap_rank,
        volume24h: coin.total_volume,
        circulatingSupply: coin.circulating_supply,
        maxSupply: coin.max_supply,
        price_change_24h: coin.price_change_24h,
        price_change_percentage_24h: coin.price_change_percentage_24h,
        lastUpdated: new Date(),
      };

      try {
        await collection.updateOne(
          { binanceSymbol },
          { $set: doc },
          { upsert: true }
        );
        upsertCount++;
      } catch (error) {
        // Silently ignore individual failures
      }
    }

    logger.info(`CoinGeckoSyncService: Upserted ${upsertCount} market cap records`);
  }

  /**
   * Force an immediate sync
   */
  async forceSync(): Promise<void> {
    await this.syncMarketCaps();
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      syncIntervalMinutes: this.SYNC_INTERVAL_MS / 60000,
    };
  }
}

export default CoinGeckoSyncService;
