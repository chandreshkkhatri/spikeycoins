import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import MarketOverviewService from './MarketOverviewService';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('./DatabaseConnection', () => ({
  default: {
    isConnectionReady: vi.fn(() => false),
    getDatabase: vi.fn(() => null),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const binanceResponse = {
  data: [{
    symbol: 'BTCUSDT',
    lastPrice: '65000',
    priceChangePercent: '2.5',
    highPrice: '66000',
    lowPrice: '63000',
    volume: '1000',
    quoteVolume: '65000000',
  }],
};

const coinGeckoResponse = {
  data: {
    data: {
      market_cap_percentage: { btc: 56.789 },
    },
  },
};

function mockSuccessfulProviders() {
  vi.mocked(axios.get).mockImplementation(async (url: string) => {
    return url.includes('binance.com') ? binanceResponse : coinGeckoResponse;
  });
}

describe('MarketOverviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores only provider-observed data and leaves dominance change unavailable', async () => {
    mockSuccessfulProviders();
    const randomSpy = vi.spyOn(Math, 'random');
    const service = new MarketOverviewService({ autoInitialize: false });

    const result = await service.forceUpdate();
    const data = service.getCachedData();

    expect(result).toEqual({ binance: true, coingecko: true });
    expect(data?.cryptocurrencies[0]).toMatchObject({ symbol: 'BTC', price: 65000 });
    expect(data?.bitcoin_dominance).toMatchObject({
      dominance: 56.79,
      change_24h: null,
    });
    expect(data?.sources.binance.status).toBe('current');
    expect(data?.sources.coingecko.status).toBe('current');
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('supports partial data when one provider is unavailable on cold start', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('binance.com')) return binanceResponse;
      throw new Error('CoinGecko unavailable');
    });
    const service = new MarketOverviewService({ autoInitialize: false });

    await service.forceUpdate();
    const data = service.getCachedData();

    expect(data?.cryptocurrencies).toHaveLength(1);
    expect(data?.bitcoin_dominance).toBeNull();
    expect(data?.sources.binance.status).toBe('current');
    expect(data?.sources.coingecko.status).toBe('unavailable');
    expect(service.getStatus().overviewStatus).toBe('partial');
  });

  it('retains a verified observation and its timestamp after a failed update', async () => {
    mockSuccessfulProviders();
    const service = new MarketOverviewService({ autoInitialize: false });
    await service.forceUpdate();

    const original = service.getCachedData();
    vi.mocked(axios.get).mockRejectedValue(new Error('provider outage'));
    const result = await service.forceUpdate();
    const stale = service.getCachedData();

    expect(result).toEqual({ binance: false, coingecko: false });
    expect(stale?.cryptocurrencies).toEqual(original?.cryptocurrencies);
    expect(stale?.bitcoin_dominance).toEqual(original?.bitcoin_dominance);
    expect(stale?.sources.binance.observed_at).toBe(original?.sources.binance.observed_at);
    expect(stale?.sources.coingecko.observed_at).toBe(original?.sources.coingecko.observed_at);
    expect(stale?.sources.binance.status).toBe('stale');
    expect(stale?.sources.coingecko.status).toBe('stale');
  });

  it('returns no verified data when both providers fail on cold start', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('provider outage'));
    const service = new MarketOverviewService({ autoInitialize: false });

    await service.forceUpdate();

    expect(service.getCachedData()?.cryptocurrencies).toEqual([]);
    expect(service.getCachedData()?.bitcoin_dominance).toBeNull();
    expect(service.getStatus()).toMatchObject({
      hasData: false,
      overviewStatus: 'unavailable',
    });
    expect(service.getFreshCryptocurrencyData()).toEqual([]);
  });
});
