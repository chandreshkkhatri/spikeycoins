import { describe, it, expect } from 'vitest';
import { normalizeMiniTicker } from './normalizeMiniTicker';

const ticker = { s: 'BTCUSDT', E: 1774000000000, c: '110', o: '100', h: '115', l: '90', v: '25', q: '2600' };
describe('Spot mini ticker normalization', () => {
  it('derives rolling change and retains quote volume', () => {
    expect(normalizeMiniTicker(ticker)).toMatchObject({ P: '10', p: '10', q: '2600', C: ticker.E });
    expect(normalizeMiniTicker({ ...ticker, c: '90' })).toMatchObject({ P: '-10', p: '-10' });
  });
  it('rejects missing, malformed and zero-open observations', () => {
    for (const value of [null, {}, { ...ticker, o: '0' }, { ...ticker, c: 'bad' }, { ...ticker, q: '' }]) {
      expect(normalizeMiniTicker(value)).toBeNull();
    }
  });
});
