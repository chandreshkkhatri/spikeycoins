/**
 * Market Overview Service
 * Maintains last-known, provider-observed market data and its freshness state.
 */

import axios from 'axios';
import logger from '../utils/logger';
import DatabaseConnection from './DatabaseConnection';

export interface MarketOverviewData {
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

export interface BitcoinDominance {
  dominance: number;
  change_24h: number | null;
  last_updated: string;
}

export type MarketSourceStatus = 'current' | 'stale' | 'unavailable';
export type MarketOverviewStatus = MarketSourceStatus | 'partial';

export interface MarketSourceState {
  status: MarketSourceStatus;
  observed_at: string | null;
  last_attempted_at: string;
}

export interface CachedMarketData {
  schema_version: 2;
  cryptocurrencies: MarketOverviewData[];
  bitcoin_dominance: BitcoinDominance | null;
  sources: {
    binance: MarketSourceState;
    coingecko: MarketSourceState;
  };
  last_updated: string | null;
  next_update: string;
}

export interface MarketOverviewUpdateResult {
  binance: boolean;
  coingecko: boolean;
}

interface MarketOverviewServiceOptions {
  autoInitialize?: boolean;
}

class MarketOverviewService {
  private static instance: MarketOverviewService;
  private cachedData: CachedMarketData | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;
  private readonly UPDATE_INTERVAL_MS = 2 * 60 * 1000;
  private readonly FRESHNESS_WINDOW_MS = this.UPDATE_INTERVAL_MS * 2;
  private readonly CACHE_SCHEMA_VERSION = 2 as const;
  private btcDominanceBackoff = 0;

  private readonly MAJOR_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'
  ];

  private readonly SYMBOL_NAMES: Record<string, string> = {
    BTCUSDT: 'Bitcoin',
    ETHUSDT: 'Ethereum',
    BNBUSDT: 'BNB',
    SOLUSDT: 'Solana',
    XRPUSDT: 'XRP'
  };

  constructor(options: MarketOverviewServiceOptions = {}) {
    if (options.autoInitialize !== false) void this.initialize();
  }

  static getInstance(): MarketOverviewService {
    if (!MarketOverviewService.instance) {
      MarketOverviewService.instance = new MarketOverviewService();
    }
    return MarketOverviewService.instance;
  }

  private async initialize(): Promise<void> {
    logger.info('MarketOverviewService: Initializing...');
    await this.loadCachedDataFromDatabase();
    void this.updateMarketData().catch(error => {
      logger.warn('MarketOverviewService: Initial data fetch failed, will retry:', error);
    });
    this.startPeriodicUpdates();
    logger.info('MarketOverviewService: Initialization completed');
  }

  private async loadCachedDataFromDatabase(): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady()) return;
      const db = DatabaseConnection.getDatabase();
      if (!db) throw new Error('Database connection not available');

      const cached = await db.collection('market_overview_cache').findOne(
        { schema_version: this.CACHE_SCHEMA_VERSION },
        { sort: { timestamp: -1 } }
      );
      if (!cached) return;

      const attemptedAt = new Date().toISOString();
      this.cachedData = {
        schema_version: this.CACHE_SCHEMA_VERSION,
        cryptocurrencies: Array.isArray(cached.cryptocurrencies) ? cached.cryptocurrencies : [],
        bitcoin_dominance: cached.bitcoin_dominance || null,
        sources: {
          binance: this.loadedSourceState(cached.sources?.binance, attemptedAt),
          coingecko: this.loadedSourceState(cached.sources?.coingecko, attemptedAt),
        },
        last_updated: cached.last_updated || cached.timestamp || null,
        next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString(),
      };

      logger.info(`MarketOverviewService: Loaded ${this.cachedData.cryptocurrencies.length} verified cached items`);
    } catch (error) {
      logger.warn('MarketOverviewService: Failed to load cached data from database:', error);
    }
  }

  private loadedSourceState(source: Partial<MarketSourceState> | undefined, fallbackAttempt: string): MarketSourceState {
    const observedAt = source?.observed_at || null;
    return {
      status: observedAt ? 'stale' : 'unavailable',
      observed_at: observedAt,
      last_attempted_at: source?.last_attempted_at || fallbackAttempt,
    };
  }

  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(() => {
      void this.updateMarketData();
    }, this.UPDATE_INTERVAL_MS);
    logger.info(`MarketOverviewService: Started periodic updates every ${this.UPDATE_INTERVAL_MS / 1000}s`);
  }

  private emptySourceState(attemptedAt: string): MarketSourceState {
    return { status: 'unavailable', observed_at: null, last_attempted_at: attemptedAt };
  }

  private async updateMarketData(): Promise<MarketOverviewUpdateResult> {
    if (this.isUpdating) {
      logger.debug('MarketOverviewService: Update already in progress, skipping');
      return { binance: false, coingecko: false };
    }

    this.isUpdating = true;
    const attemptedAt = new Date().toISOString();

    try {
      const [cryptoResult, dominanceResult] = await Promise.allSettled([
        this.fetchCryptocurrencyData(),
        this.fetchBitcoinDominance(),
      ]);

      const previous = this.cachedData;
      const cryptoSucceeded = cryptoResult.status === 'fulfilled';
      const dominanceSucceeded = dominanceResult.status === 'fulfilled';
      const binanceObservedAt = cryptoSucceeded ? attemptedAt : previous?.sources.binance.observed_at || null;
      const coingeckoObservedAt = dominanceSucceeded ? attemptedAt : previous?.sources.coingecko.observed_at || null;

      this.cachedData = {
        schema_version: this.CACHE_SCHEMA_VERSION,
        cryptocurrencies: cryptoSucceeded ? cryptoResult.value : previous?.cryptocurrencies || [],
        bitcoin_dominance: dominanceSucceeded ? dominanceResult.value : previous?.bitcoin_dominance || null,
        sources: {
          binance: {
            status: cryptoSucceeded ? 'current' : binanceObservedAt ? 'stale' : 'unavailable',
            observed_at: binanceObservedAt,
            last_attempted_at: attemptedAt,
          },
          coingecko: {
            status: dominanceSucceeded ? 'current' : coingeckoObservedAt ? 'stale' : 'unavailable',
            observed_at: coingeckoObservedAt,
            last_attempted_at: attemptedAt,
          },
        },
        last_updated: this.latestTimestamp(binanceObservedAt, coingeckoObservedAt),
        next_update: new Date(Date.now() + this.UPDATE_INTERVAL_MS).toISOString(),
      };

      if (!cryptoSucceeded) {
        logger.warn('MarketOverviewService: Binance update failed; retaining verified data if available', cryptoResult.reason);
      }
      if (!dominanceSucceeded) {
        logger.warn('MarketOverviewService: CoinGecko update failed; retaining verified data if available', dominanceResult.reason);
      }
      if (this.hasVerifiedData(this.cachedData)) await this.saveCachedDataToDatabase();

      return { binance: cryptoSucceeded, coingecko: dominanceSucceeded };
    } finally {
      this.isUpdating = false;
    }
  }

  private latestTimestamp(...timestamps: Array<string | null>): string | null {
    const valid = timestamps.filter((timestamp): timestamp is string => Boolean(timestamp));
    if (valid.length === 0) return null;
    return valid.reduce((latest, timestamp) =>
      new Date(timestamp).getTime() > new Date(latest).getTime() ? timestamp : latest
    );
  }

  private hasVerifiedData(data: CachedMarketData): boolean {
    return data.cryptocurrencies.length > 0 || data.bitcoin_dominance !== null;
  }

  private async fetchCryptocurrencyData(): Promise<MarketOverviewData[]> {
    const symbolsQuery = this.MAJOR_SYMBOLS.map(symbol => `"${symbol}"`).join(',');
    const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbolsQuery}]`;
    const response = await axios.get(binanceUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'SpikeCoins/1.0', Accept: 'application/json' }
    });

    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error('Invalid or empty response from Binance API');
    }

    const mappedData = response.data.map((ticker: Record<string, unknown>): MarketOverviewData => {
      const symbol = String(ticker.symbol || '');
      const data = {
        symbol: symbol.replace('USDT', ''),
        name: this.SYMBOL_NAMES[symbol] || symbol.replace('USDT', ''),
        price: Number(ticker.lastPrice),
        change_24h: Number(ticker.priceChangePercent),
        high_24h: Number(ticker.highPrice),
        low_24h: Number(ticker.lowPrice),
        volume: Number(ticker.volume),
        volume_usd: Number(ticker.quoteVolume),
      };
      if (!symbol || Object.values(data).some(value => typeof value === 'number' && !Number.isFinite(value))) {
        throw new Error(`Invalid Binance ticker data for ${symbol || 'unknown symbol'}`);
      }
      return data;
    });

    logger.info(`MarketOverviewService: Fetched ${mappedData.length} symbols from Binance`);
    return mappedData;
  }

  private async fetchBitcoinDominance(): Promise<BitcoinDominance> {
    try {
      if (this.btcDominanceBackoff > Date.now()) throw new Error('CoinGecko backoff active');
      const response = await axios.get('https://api.coingecko.com/api/v3/global', {
        timeout: 8000,
        headers: { Accept: 'application/json', 'User-Agent': 'SpikeCoins/1.0' }
      });

      const dominance = Number(response.data?.data?.market_cap_percentage?.btc);
      if (!Number.isFinite(dominance)) throw new Error('Invalid BTC dominance data from CoinGecko');

      this.btcDominanceBackoff = 0;
      return {
        dominance: Number(dominance.toFixed(2)),
        change_24h: null,
        last_updated: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const details = error as { message?: string; response?: { status?: number } };
      const message = details.message || '';
      const isRateLimited = details.response?.status === 429 || message.includes('429');
      if (isRateLimited || message.includes('backoff')) {
        const currentBackoffMs = Math.max(0, this.btcDominanceBackoff - Date.now());
        const nextBackoffMs = Math.min(
          currentBackoffMs > 0 ? currentBackoffMs * 2 : 2 * 60 * 1000,
          16 * 60 * 1000
        );
        this.btcDominanceBackoff = Date.now() + nextBackoffMs;
        logger.warn(`MarketOverviewService: CoinGecko backoff set to ${Math.round(nextBackoffMs / 1000)}s`);
      }
      throw error;
    }
  }

  private async saveCachedDataToDatabase(): Promise<void> {
    try {
      if (!DatabaseConnection.isConnectionReady() || !this.cachedData) return;
      const db = DatabaseConnection.getDatabase();
      if (!db) throw new Error('Database connection not available');

      const collection = db.collection('market_overview_cache');
      await collection.insertOne({
        ...this.cachedData,
        timestamp: this.cachedData.last_updated,
        created_at: new Date(),
      });

      const oldEntries = await collection.find({ schema_version: this.CACHE_SCHEMA_VERSION })
        .sort({ timestamp: -1 })
        .skip(10)
        .toArray();
      if (oldEntries.length > 0) {
        await collection.deleteMany({ _id: { $in: oldEntries.map(entry => entry._id) } });
      }
    } catch (error) {
      logger.warn('MarketOverviewService: Failed to save cached data to database:', error);
    }
  }

  private freshnessAdjustedSource(source: MarketSourceState): MarketSourceState {
    if (!source.observed_at) return { ...source, status: 'unavailable' };
    const age = Date.now() - new Date(source.observed_at).getTime();
    return {
      ...source,
      status: source.status === 'current' && age <= this.FRESHNESS_WINDOW_MS ? 'current' : 'stale',
    };
  }

  public getCachedData(): CachedMarketData | null {
    if (!this.cachedData) return null;
    return {
      ...this.cachedData,
      sources: {
        binance: this.freshnessAdjustedSource(this.cachedData.sources.binance),
        coingecko: this.freshnessAdjustedSource(this.cachedData.sources.coingecko),
      },
    };
  }

  public getFreshCryptocurrencyData(maxAgeMs = this.FRESHNESS_WINDOW_MS): MarketOverviewData[] {
    const observedAt = this.cachedData?.sources.binance.observed_at;
    if (!observedAt || !this.cachedData?.cryptocurrencies.length) return [];
    if (Date.now() - new Date(observedAt).getTime() > maxAgeMs) return [];
    return this.cachedData.cryptocurrencies;
  }

  public getStatus() {
    const data = this.getCachedData();
    const binance = data?.sources.binance || this.emptySourceState(new Date().toISOString());
    const coingecko = data?.sources.coingecko || this.emptySourceState(new Date().toISOString());
    const sourceStatuses = [binance.status, coingecko.status];

    let overviewStatus: MarketOverviewStatus;
    if (sourceStatuses.every(status => status === 'unavailable')) overviewStatus = 'unavailable';
    else if (sourceStatuses.every(status => status === 'current')) overviewStatus = 'current';
    else if (sourceStatuses.every(status => status === 'stale')) overviewStatus = 'stale';
    else overviewStatus = 'partial';

    return {
      hasData: Boolean(data && this.hasVerifiedData(data)),
      overviewStatus,
      sources: { binance, coingecko },
      lastUpdated: data?.last_updated || null,
      nextUpdate: data?.next_update || null,
      isUpdating: this.isUpdating,
      cryptoCount: data?.cryptocurrencies.length || 0,
      updateInterval: this.UPDATE_INTERVAL_MS / 1000,
    };
  }

  public async forceUpdate(): Promise<MarketOverviewUpdateResult> {
    logger.info('MarketOverviewService: Force update requested');
    return this.updateMarketData();
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
