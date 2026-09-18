import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MarketOverviewService from './MarketOverviewService';

vi.mock('axios');
vi.mock('./DatabaseConnection', () => ({
  default: {
    isConnectionReady: vi.fn().mockReturnValue(false),
    getDatabase: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MarketOverviewService', () => {
  let service: MarketOverviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = MarketOverviewService.getInstance();
    // Reset service state
    (service as any).cachedData = null;
    (service as any).isUpdating = false;
    (service as any).btcDominanceBackoff = 0;
    (service as any).previousBtcDominance = null;
  });

  afterEach(() => {
    const interval = (service as any).updateInterval;
    if (interval) {
      clearInterval(interval);
      (service as any).updateInterval = null;
    }
  });

  it('should not return hardcoded prices (such as BTC at $43,000) when Binance API fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Binance network timeout'));

    await service.forceUpdate();

    const result = service.getCachedData();
    expect(result).not.toBeNull();
    // When no previous cache and Binance fails, cryptocurrencies must be empty, NOT fabricated
    expect(result?.cryptocurrencies).toEqual([]);
    expect(result?.is_stale).toBe(true);

    // Verify status reflects stale state
    const status = service.getStatus();
    expect(status.isStale).toBe(true);
    expect(status.cryptoCount).toBe(0);
  });

  it('should preserve previous successful data with is_stale=true when upstream request fails', async () => {
    const mockBinanceData = [
      {
        symbol: 'BTCUSDT',
        lastPrice: '68500.25',
        priceChangePercent: '2.5',
        highPrice: '69000.00',
        lowPrice: '67000.00',
        volume: '15000.5',
        quoteVolume: '1027500000',
      },
    ];

    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('binance.com')) {
        return { data: mockBinanceData };
      }
      if (url.includes('coingecko.com')) {
        return {
          data: {
            data: {
              market_cap_percentage: { btc: 56.4 },
            },
          },
        };
      }
      return { data: {} };
    });

    // Initial successful update
    await service.forceUpdate();

    const freshResult = service.getCachedData();
    expect(freshResult?.is_stale).toBe(false);
    expect(freshResult?.cryptocurrencies[0].symbol).toBe('BTC');
    expect(freshResult?.cryptocurrencies[0].price).toBe(68500.25);
    const originalTimestamp = freshResult?.last_updated;

    // Simulate subsequent upstream failure
    vi.mocked(axios.get).mockRejectedValue(new Error('Upstream Binance failure'));

    await service.forceUpdate();

    const staleResult = service.getCachedData();
    expect(staleResult).not.toBeNull();
    expect(staleResult?.is_stale).toBe(true);
    // Preserves original cryptocurrency data
    expect(staleResult?.cryptocurrencies[0].symbol).toBe('BTC');
    expect(staleResult?.cryptocurrencies[0].price).toBe(68500.25);
    // Preserves original timestamp
    expect(staleResult?.last_updated).toBe(originalTimestamp);
  });

  it('should not generate random numbers for BTC dominance 24h change when upstream fails', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('binance.com')) {
        return {
          data: [
            {
              symbol: 'BTCUSDT',
              lastPrice: '68000',
              priceChangePercent: '1.0',
              highPrice: '69000',
              lowPrice: '67000',
              volume: '1000',
              quoteVolume: '68000000',
            },
          ],
        };
      }
      if (url.includes('coingecko.com')) {
        throw new Error('CoinGecko 429 Rate Limit');
      }
      return { data: {} };
    });

    await service.forceUpdate();

    const result = service.getCachedData();
    expect(result).not.toBeNull();
    // Dominance change_24h must be null or not random
    expect(result?.bitcoin_dominance.change_24h).toBeNull();
    expect(result?.bitcoin_dominance.dominance).toBeNull();
  });
});

