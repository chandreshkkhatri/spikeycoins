import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../lib/binance-service', () => ({ BinanceService: { scheduleRequest: (request: () => Promise<unknown>) => request() } }));

describe('Binance exchange listings', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it('prefers Spot for shared symbols, routes futures-only pairs, and excludes unlisted/inactive pairs', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: { symbols: [
      { symbol: 'BTCUSDT', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'OLDUSDT', quoteAsset: 'USDT', status: 'BREAK' },
    ] } }).mockResolvedValueOnce({ data: { symbols: [
      { symbol: 'BTCUSDT', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
      { symbol: 'HYPEUSDT', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
    ] } });
    const { default: catalog } = await import('./BinanceSymbolCatalog');
    await catalog.refresh();
    expect(catalog.marketFor('BTCUSDT')).toBe('spot');
    expect(catalog.marketFor('HYPEUSDT')).toBe('futures');
    expect(catalog.marketFor('WBTUSDT')).toBeUndefined();
    expect(catalog.marketFor('OLDUSDT')).toBeUndefined();
    await catalog.refresh();
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
  it('does not invent listings when exchange discovery fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Offline'));
    const { default: catalog } = await import('./BinanceSymbolCatalog');
    await expect(catalog.refresh()).rejects.toThrow('Offline');
    expect(catalog.marketFor('BTCUSDT')).toBeUndefined();
  });
});
