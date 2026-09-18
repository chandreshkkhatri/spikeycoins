import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataManager from './DataManager';
import CandlestickStorage from '../services/CandlestickStorage';

vi.mock('../services/CandlestickStorage', () => ({
  default: {
    calculatePriceChanges: vi.fn().mockResolvedValue({
      change_1h: null,
      change_4h: null,
      change_8h: null,
      change_12h: null,
    }),
  },
}));

vi.mock('../services/MarketCapService', () => ({
  default: {
    getMarketCapData: vi.fn().mockReturnValue(null),
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

describe('DataManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    DataManager.clearAll();
  });

  describe('volume_usd calculation', () => {
    it('should use raw quote volume (rawTicker.q) instead of volume * price for spot tickers', () => {
      // Intraday price movement means volume * lastPrice != actual 24h quote volume
      const rawSpotTicker = {
        s: 'BTCUSDT',
        c: '60000.00', // last price
        o: '50000.00',
        h: '61000.00',
        l: '49000.00',
        v: '100.0', // base volume
        q: '5500000.00', // true quote volume is 5.5M USDT (not 100 * 60,000 = 6.0M USDT)
        P: '20.0',
        p: '10000.0',
        C: Date.now(),
        O: Date.now() - 86400000,
      };

      DataManager.updateTickers([rawSpotTicker]);

      const ticker = DataManager.getTickerBySymbol('BTCUSDT');
      expect(ticker).not.toBeNull();
      expect(ticker?.volume_usd).toBe(5500000.00);
      expect(ticker?.volume_base).toBe(100.0);
    });

    it('should fallback to volume * price if rawTicker.q is invalid or missing in spot', () => {
      const rawSpotTicker = {
        s: 'ETHUSDT',
        c: '3000.00',
        o: '2900.00',
        h: '3100.00',
        l: '2800.00',
        v: '10.0',
        q: 'invalid_number',
        P: '3.4',
        p: '100.0',
        C: Date.now(),
        O: Date.now() - 86400000,
      };

      DataManager.updateTickers([rawSpotTicker]);

      const ticker = DataManager.getTickerBySymbol('ETHUSDT');
      expect(ticker).not.toBeNull();
      expect(ticker?.volume_usd).toBe(30000.00); // 10 * 3000
    });

    it('should use raw quote volume (rawTicker.q) for futures tickers', () => {
      const rawFuturesTicker = {
        s: 'SOLUSDT',
        c: '150.00',
        o: '140.00',
        h: '155.00',
        l: '135.00',
        v: '5000.0',
        q: '725000.00', // 725k quote volume, not 5000 * 150 = 750k
        P: '7.14',
        p: '10.0',
        C: Date.now(),
        O: Date.now() - 86400000,
      };

      DataManager.updateFuturesTickers([rawFuturesTicker]);

      const ticker = DataManager.getTickerBySymbol('SOLUSDT');
      expect(ticker).not.toBeNull();
      expect(ticker?.volume_usd).toBe(725000.00);
      expect(ticker?.is_futures).toBe(true);
    });
  });

  describe('futures short timeframe returns', () => {
    it('should update and preserve short timeframe returns for futures-only symbols', async () => {
      vi.mocked(CandlestickStorage.calculatePriceChanges).mockResolvedValue({
        change_1h: 1.5,
        change_4h: 3.2,
        change_8h: -0.8,
        change_12h: 4.1,
      });

      const rawFuturesTicker = {
        s: '1000PEPEUSDT',
        c: '0.010',
        o: '0.009',
        h: '0.011',
        l: '0.008',
        v: '10000000',
        q: '95000', // above 50,000 threshold
        P: '11.11',
        p: '0.001',
        C: Date.now(),
        O: Date.now() - 86400000,
      };

      DataManager.updateFuturesTickers([rawFuturesTicker]);

      // Wait for promise resolution in updateFuturesTickers
      await Promise.resolve();

      const ticker = DataManager.getTickerBySymbol('1000PEPEUSDT');
      expect(ticker).not.toBeNull();
      expect(ticker?.change_1h).toBe(1.5);
      expect(ticker?.change_4h).toBe(3.2);
      expect(ticker?.change_8h).toBe(-0.8);
      expect(ticker?.change_12h).toBe(4.1);

      // Now send a subsequent update where CandlestickStorage throttle means it is not re-invoked
      vi.mocked(CandlestickStorage.calculatePriceChanges).mockClear();

      const nextTick = {
        ...rawFuturesTicker,
        c: '0.0105',
      };
      DataManager.updateFuturesTickers([nextTick]);

      const updatedTicker = DataManager.getTickerBySymbol('1000PEPEUSDT');
      expect(updatedTicker?.price).toBe(0.0105);
      // Short timeframe returns must be preserved from existing ticker
      expect(updatedTicker?.change_1h).toBe(1.5);
      expect(updatedTicker?.change_4h).toBe(3.2);
      expect(updatedTicker?.change_8h).toBe(-0.8);
      expect(updatedTicker?.change_12h).toBe(4.1);
    });
  });
});

