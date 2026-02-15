/**
 * Market Overview Service
 * Manages cached market data with periodic updates from Binance API
 */

import axios from 'axios';
import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';
import { BinanceService } from '../../lib/binance-service';

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
  dominance: number;
  change_24h: number;
  last_updated: string;
}

interface CachedMarketData {
  cryptocurrencies: MarketOverviewData[];
  bitcoin_dominance: BitcoinDominance;
  last_updated: string;
  next_update: string;
}

class MarketOverviewService {
  private static instance: MarketOverviewService;
  private cachedData: CachedMarketData | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;
  private readonly UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds
  
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
      // Still start with fallback data
      this.cachedData = {
        cryptocurrencies: this.getFallbackCryptoData(),
        bitcoin_dominance: {
          dominance: 52.5,
          change_24h: 0.2,
          last_updated: new Date().toISOString()
        },
        last_updated: new Date().toISOString(),
        next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString()
      };
      this.startPeriodicUpdates();
      logger.info('MarketOverviewService: Initialized with fallback data');
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
      const [cryptoData, btcDominance] = await Promise.all([
        this.fetchCryptocurrencyData(),
        this.fetchBitcoinDominance()
      ]);

      const timestamp = new Date().toISOString();
      
      this.cachedData = {
        cryptocurrencies: cryptoData,
        bitcoin_dominance: btcDominance,
        last_updated: timestamp,
        next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString()
      };

      // Save to database
      await this.saveCachedDataToDatabase();
      
      logger.info(`MarketOverviewService: Updated ${cryptoData.length} cryptocurrencies and BTC dominance`);
      
    } catch (error) {
      logger.error('MarketOverviewService: Failed to update market data:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  private async fetchCryptocurrencyData(): Promise<MarketOverviewData[]> {
    try {
      const symbolsQuery = this.MAJOR_SYMBOLS.map(s => `"${s}"`).join(',');
      const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsQuery}]`;

      logger.info(`MarketOverviewService: Fetching from ${binanceUrl}`);

      // Route through BinanceService rate limiter
      const response = await BinanceService.scheduleRequest(() =>
        axios.get(binanceUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'SpikeCoins/1.0',
            'Accept': 'application/json'
          }
        })
      );

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
      
      // Return fallback data instead of throwing
      logger.warn('MarketOverviewService: Using fallback cryptocurrency data');
      return this.getFallbackCryptoData();
    }
  }

  private getFallbackCryptoData(): MarketOverviewData[] {
    return [
      { symbol: 'BTC', name: 'Bitcoin', price: 43000, change_24h: 2.5, high_24h: 44000, low_24h: 42000, volume: 15000, volume_usd: 650000000 },
      { symbol: 'ETH', name: 'Ethereum', price: 2600, change_24h: -1.2, high_24h: 2650, low_24h: 2550, volume: 50000, volume_usd: 130000000 },
      { symbol: 'BNB', name: 'BNB', price: 320, change_24h: 1.8, high_24h: 325, low_24h: 315, volume: 8000, volume_usd: 2560000 },
      { symbol: 'SOL', name: 'Solana', price: 98, change_24h: 4.2, high_24h: 102, low_24h: 95, volume: 20000, volume_usd: 1960000 },
      { symbol: 'XRP', name: 'XRP', price: 0.61, change_24h: 0.9, high_24h: 0.62, low_24h: 0.60, volume: 80000, volume_usd: 48800 }
    ];
  }

  private async fetchBitcoinDominance(): Promise<BitcoinDominance> {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/global', {
        timeout: 8000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SpikeCoins/1.0'
        }
      });

      const globalData = response.data?.data;
      if (globalData?.market_cap_percentage?.btc) {
        return {
          dominance: parseFloat(globalData.market_cap_percentage.btc.toFixed(2)),
          change_24h: parseFloat(((Math.random() - 0.5) * 2).toFixed(3)), // Mock change for now
          last_updated: new Date().toISOString()
        };
      } else {
        throw new Error('Invalid BTC dominance data from CoinGecko');
      }
    } catch (error) {
      logger.warn('MarketOverviewService: Using fallback BTC dominance data:', error);
      
      // Fallback data
      return {
        dominance: 52.5,
        change_24h: 0.2,
        last_updated: new Date().toISOString()
      };
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