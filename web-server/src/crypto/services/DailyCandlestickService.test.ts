import { describe, it, expect, vi, beforeEach } from 'vitest';
import DailyCandlestickService from './DailyCandlestickService';
import DataManager from '../core/DataManager';
import { DailyCandlestickModel } from '../models/DailyCandlestick';

vi.mock('../core/DataManager', () => ({
  default: {
    getAllTickers: vi.fn(),
  },
}));

vi.mock('../models/DailyCandlestick', () => ({
  DailyCandlestickModel: {
    find: vi.fn(),
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

describe('DailyCandlestickService', () => {
  let service: DailyCandlestickService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = DailyCandlestickService.getInstance();
    (service as any).isBackfilling = false;
  });

  describe('7d calendar day alignment', () => {
    it('should query candlesticks matching 7 UTC calendar days ago', async () => {
      vi.mocked(DataManager.getAllTickers).mockReturnValue([
        { s: 'BTCUSDT', c: '65000', P: '1.2', q: '5000000' } as any,
      ]);

      vi.mocked(DailyCandlestickModel.find).mockResolvedValue([
        { symbol: 'BTCUSDT', open: 60000, openTime: 12345678 } as any,
      ]);

      const now = new Date();
      const expectedMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const expected7DaysAgoMidnight = expectedMidnightUTC - 7 * 24 * 60 * 60 * 1000;

      const changes = await service.calculate7dChanges();

      expect(DailyCandlestickModel.find).toHaveBeenCalled();
      const queryArg = vi.mocked(DailyCandlestickModel.find).mock.calls[0][0] as any;
      expect(queryArg.symbol).toEqual({ $in: ['BTCUSDT'] });
      expect(queryArg.openTime.$gte).toBe(expected7DaysAgoMidnight - 12 * 60 * 60 * 1000);
      expect(queryArg.openTime.$lte).toBe(expected7DaysAgoMidnight + 12 * 60 * 60 * 1000);

      expect(changes.length).toBe(1);
      expect(changes[0].symbol).toBe('BTC');
      expect(changes[0].change_7d).toBeCloseTo(((65000 - 60000) / 60000) * 100);
    });
  });

  describe('sign filtering in get7dTopMovers', () => {
    it('should strictly filter gainers to > 0 and losers to < 0', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '65000', change_24h: 2, change_7d: 8.5, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3500', change_24h: 1, change_7d: 4.2, volume: '1000' },
        { symbol: 'SOL', name: 'SOL', price: '140', change_24h: -1, change_7d: -5.0, volume: '1000' },
        { symbol: 'DOGE', name: 'DOGE', price: '0.12', change_24h: -3, change_7d: -12.3, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers.every((g) => g.change_7d > 0)).toBe(true);
      expect(gainers.length).toBe(2);
      expect(gainers[0].symbol).toBe('BTC'); // +8.5%

      expect(losers.every((l) => l.change_7d < 0)).toBe(true);
      expect(losers.length).toBe(2);
      expect(losers[0].symbol).toBe('DOGE'); // -12.3%
    });

    it('should return empty gainers array when all market 7d changes are negative', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '60000', change_24h: -2, change_7d: -4.5, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3000', change_24h: -4, change_7d: -9.2, volume: '1000' },
        { symbol: 'SOL', name: 'SOL', price: '120', change_24h: -6, change_7d: -15.0, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers).toEqual([]);
      expect(losers.length).toBe(3);
      expect(losers[0].symbol).toBe('SOL');
    });

    it('should return empty losers array when all market 7d changes are positive', async () => {
      vi.spyOn(service, 'calculate7dChanges').mockResolvedValue([
        { symbol: 'BTC', name: 'BTC', price: '68000', change_24h: 5, change_7d: 12.0, volume: '1000' },
        { symbol: 'ETH', name: 'ETH', price: '3800', change_24h: 3, change_7d: 7.5, volume: '1000' },
      ]);

      const { gainers, losers } = await service.get7dTopMovers();

      expect(gainers.length).toBe(2);
      expect(losers).toEqual([]);
    });
  });
});
