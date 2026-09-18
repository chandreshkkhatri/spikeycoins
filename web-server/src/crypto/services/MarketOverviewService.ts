/**
 * Market Overview Service
 * Manages cached market data with periodic updates from Binance API
 */

import axios from 'axios';
import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';

interface MarketOverviewData {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  high_24h: number;
  low_24h: number;
  volume: number;
  volume_usd: number;
  market_cap?: number;
}

interface BitcoinDominance {
  dominance: number | null;
  change_24h: number | null;
  last_updated: string;
  is_stale?: boolean;
}

interface CachedMarketData {
  cryptocurrencies: MarketOverviewData[];
  bitcoin_dominance: BitcoinDominance;
  last_updated: string;
  next_update: string;
  is_stale?: boolean;
}

class MarketOverviewService {
  private static instance: MarketOverviewService;
  private cachedData: CachedMarketData | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;
  private readonly UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
  private btcDominanceBackoff = 0; // exponential backoff for CoinGecko 429s
  private previousBtcDominance: number | null = null;
  
  // Major cryptocurrencies to track
  private readonly MAJOR_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'
  ];

  private readonly SYMBOL_NAMES: Record<string, string> = {
    'BTCUSDT': 'Bitcoin',
    'ETHUSDT': 'Ethereum', 
    'BNBUSDT': 'BNB',
    'SOLUSDT': 'Solana',
    'XRPUSDT': 'XRP'
  };

  constructor() {
    this.initialize();
  }

  static getInstance(): MarketOverviewService {
    if (!MarketOverviewService.instance) {
      MarketOverviewService.instance = new MarketOverviewService();
    }
    return MarketOverviewService.instance;
  }

  private async initialize(): Promise<void> {
    logger.info('MarketOverviewService: Initializing...');
    
    try {
      // Load cached data from database first
      await this.loadCachedDataFromDatabase();
      
      // Fetch fresh data (don't let this block initialization)
      this.updateMarketData().catch(error => {
        logger.warn('MarketOverviewService: Initial data fetch failed, will retry:', error);
      });
      
      // Start periodic updates
      this.startPeriodicUpdates();
      
      logger.info('MarketOverviewService: Initialization completed');
    } catch (error) {
      logger.error('MarketOverviewService: Initialization failed:', error);
      this.startPeriodicUpdates();
    }
  }

  private async loadCachedDataFromDatabase(): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady()) {
        return;
      }

      const db = DatabaseConnection.getDatabase();
      if (!db) {
        throw new Error('Database connection not available');
      }
      const collection = db.collection('market_overview_cache');

      const cached = await collection.findOne(
        {},
        { sort: { timestamp: -1 } }
      );

      if (cached && this.isDataFresh(cached.timestamp)) {
        this.cachedData = {
          cryptocurrencies: cached.cryptocurrencies || [],
          bitcoin_dominance: cached.bitcoin_dominance || { dominance: 0, change_24h: 0, last_updated: '' },
          last_updated: cached.timestamp,
          next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString()
        };
        
        logger.info(`MarketOverviewService: Loaded ${cached.cryptocurrencies?.length || 0} cached items from database`);
      }
    } catch (error) {
      logger.warn('MarketOverviewService: Failed to load cached data from database:', error);
    }
  }

  private isDataFresh(timestamp: string): boolean {
    const dataAge = Date.now() - new Date(timestamp).getTime();
    return dataAge < this.UPDATE_INTERVAL_MS * 2; // Consider fresh if less than 60s old
  }

  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(async () => {
      await this.updateMarketData();
    }, this.UPDATE_INTERVAL_MS);
    
    logger.info(`MarketOverviewService: Started periodic updates every ${this.UPDATE_INTERVAL_MS / 1000}s`);
  }

  private async updateMarketData(): Promise<void> {
    if (this.isUpdating) {
      logger.debug('MarketOverviewService: Update already in progress, skipping');
      return;
    }

    this.isUpdating = true;
    
    try {
      logger.info('MarketOverviewService: Fetching fresh market data...');
      
      // Fetch cryptocurrency data and BTC dominance in parallel
      const [cryptoDataResult, btcDominanceResult] = await Promise.allSettled([
        this.fetchCryptocurrencyData(),
        this.fetchBitcoinDominance()
      ]);

      const nowIso = new Date().toISOString();
      let isStale = false;

      let cryptoData: MarketOverviewData[];
      if (cryptoDataResult.status === 'fulfilled' && cryptoDataResult.value !== null) {
        cryptoData = cryptoDataResult.value;
      } else {
        isStale = true;
        if (this.cachedData && this.cachedData.cryptocurrencies.length > 0) {
          cryptoData = this.cachedData.cryptocurrencies;
          logger.warn('MarketOverviewService: Binance fetch failed, preserving previous cached cryptocurrency data as stale');
        } else {
          cryptoData = [];
        }
      }

      let btcDominance: BitcoinDominance;
      if (btcDominanceResult.status === 'fulfilled' && btcDominanceResult.value !== null) {
        btcDominance = btcDominanceResult.value;
      } else {
        isStale = true;
        if (this.cachedData && this.cachedData.bitcoin_dominance.dominance !== null) {
          btcDominance = { ...this.cachedData.bitcoin_dominance, is_stale: true };
          logger.warn('MarketOverviewService: CoinGecko fetch failed, preserving previous cached BTC dominance as stale');
        } else {
          btcDominance = {
            dominance: null,
            change_24h: null,
            last_updated: nowIso,
            is_stale: true,
          };
        }
      }

      const lastUpdated = isStale && this.cachedData ? this.cachedData.last_updated : nowIso;

      this.cachedData = {
        cryptocurrencies: cryptoData,
        bitcoin_dominance: btcDominance,
        last_updated: lastUpdated,
        next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString(),
        is_stale: isStale,
      };

      // Save to database only if we have fresh data
      if (!isStale && cryptoData.length > 0) {
        await this.saveCachedDataToDatabase();
      }
      
      logger.info(`MarketOverviewService: Updated ${cryptoData.length} cryptocurrencies and BTC dominance (isStale: ${isStale})`);
      
    } catch (error) {
      logger.error('MarketOverviewService: Failed to update market data:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  private async fetchCryptocurrencyData(): Promise<MarketOverviewData[] | null> {
    try {
      const symbolsQuery = this.MAJOR_SYMBOLS.map(s => `"${s}"`).join(',');
      const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsQuery}]`;

      // Direct fetch — this is a public endpoint (no API key needed).
      // Bypasses the shared BinanceService rate limiter so it doesn't
      // compete with authenticated user requests (funds, orders, positions).
      const response = await axios.get(binanceUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SpikeCoins/1.0',
          'Accept': 'application/json'
        }
      });

      if (!response.data || !Array.isArray(response.data)) {
        logger.error('MarketOverviewService: Invalid Binance API response format', response.data);
        throw new Error('Invalid response from Binance API');
      }

      if (response.data.length === 0) {
        logger.warn('MarketOverviewService: Binance API returned empty array');
        throw new Error('Empty response from Binance API');
      }

      logger.info(`MarketOverviewService: Successfully fetched ${response.data.length} symbols from Binance`);

      const mappedData = response.data.map((ticker: any): MarketOverviewData => ({
        symbol: ticker.symbol.replace('USDT', ''),
        name: this.SYMBOL_NAMES[ticker.symbol] || ticker.symbol.replace('USDT', ''),
        price: parseFloat(ticker.lastPrice),
        change_24h: parseFloat(ticker.priceChangePercent),
        high_24h: parseFloat(ticker.highPrice),
        low_24h: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        volume_usd: parseFloat(ticker.quoteVolume),
      }));

      logger.info(`MarketOverviewService: Mapped data for symbols: ${mappedData.map(d => d.symbol).join(', ')}`);
      return mappedData;

    } catch (error) {
      logger.error('MarketOverviewService: Error fetching cryptocurrency data:', error);
      return null;
    }
  }

  private async fetchBitcoinDominance(): Promise<BitcoinDominance | null> {
    try {
      // Exponential backoff for CoinGecko 429 errors
      if (this.btcDominanceBackoff > Date.now()) {
        throw new Error('CoinGecko backoff active');
      }

      const response = await axios.get('https://api.coingecko.com/api/v3/global', {
        timeout: 8000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SpikeCoins/1.0'
        }
      });

      // Reset backoff on success
      this.btcDominanceBackoff = 0;

      const globalData = response.data?.data;
      if (globalData?.market_cap_percentage?.btc != null) {
        const currentDominance = parseFloat(globalData.market_cap_percentage.btc.toFixed(2));
        let change24h: number | null = null;
        if (this.previousBtcDominance !== null) {
          change24h = parseFloat((currentDominance - this.previousBtcDominance).toFixed(3));
        }
        this.previousBtcDominance = currentDominance;

        return {
          dominance: currentDominance,
          change_24h: change24h,
          last_updated: new Date().toISOString(),
          is_stale: false,
        };
      } else {
        throw new Error('Invalid BTC dominance data from CoinGecko');
      }
    } catch (error: any) {
      // If 429 or backoff, increase backoff: 2min, 4min, 8min, 16min (max)
      const errorMsg = error?.message || '';
      const is429 = error?.response?.status === 429 || errorMsg.includes('429');
      if (is429 || errorMsg.includes('backoff')) {
        const currentBackoffMs = Math.max(0, this.btcDominanceBackoff - Date.now());
        const nextBackoffMs = Math.min(currentBackoffMs > 0 ? currentBackoffMs * 2 : 2 * 60 * 1000, 16 * 60 * 1000);
        this.btcDominanceBackoff = Date.now() + nextBackoffMs;
        logger.warn(`MarketOverviewService: CoinGecko backoff set to ${Math.round(nextBackoffMs / 1000)}s`);
      } else {
        logger.warn('MarketOverviewService: Error fetching BTC dominance data:', error);
      }
      
      return null;
    }
  }

  private async saveCachedDataToDatabase(): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady() || !this.cachedData) {
        return;
      }

      const db = DatabaseConnection.getDatabase();
      if (!db) {
        throw new Error('Database connection not available');
      }
      const collection = db.collection('market_overview_cache');

      // Insert new cache entry
      await collection.insertOne({
        ...this.cachedData,
        timestamp: this.cachedData.last_updated,
        created_at: new Date()
      });

      // Keep only last 10 cache entries (cleanup old data)
      const oldEntries = await collection.find({})
        .sort({ timestamp: -1 })
        .skip(10)
        .toArray();
      
      if (oldEntries.length > 0) {
        const oldIds = oldEntries.map(entry => entry._id);
        await collection.deleteMany({ _id: { $in: oldIds } });
      }

    } catch (error) {
      logger.warn('MarketOverviewService: Failed to save cached data to database:', error);
    }
  }

  public getCachedData(): CachedMarketData | null {
    return this.cachedData;
  }

  public getStatus() {
    return {
      hasData: this.cachedData !== null,
      lastUpdated: this.cachedData?.last_updated || null,
      nextUpdate: this.cachedData?.next_update || null,
      isUpdating: this.isUpdating,
      isStale: this.cachedData?.is_stale || false,
      cryptoCount: this.cachedData?.cryptocurrencies?.length || 0,
      updateInterval: this.UPDATE_INTERVAL_MS / 1000
    };
  }

  public async forceUpdate(): Promise<void> {
    logger.info('MarketOverviewService: Force update requested');
    await this.updateMarketData();
  }

  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('MarketOverviewService: Cleaned up periodic updates');
    }
  }
}

export default MarketOverviewService;