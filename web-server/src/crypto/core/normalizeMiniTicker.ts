interface MiniTicker {
  s: string;
  E: number;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
}

/** Mini tickers omit change fields; derive them from the observed rolling open/close. */
export function normalizeMiniTicker(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const item = value as MiniTicker;
  if (typeof item.s !== 'string' || !Number.isFinite(item.E)) return null;
  if (![item.c, item.o, item.h, item.l, item.v, item.q].every(
    field => typeof field === 'string' && field.trim() !== '' && Number.isFinite(Number(field))
  )) return null;
  const open = Number(item.o);
  const close = Number(item.c);
  if (open <= 0 || close <= 0) return null;
  return {
    ...item,
    p: String(close - open),
    P: String((close - open) / open * 100),
    C: item.E,
    O: item.E - 24 * 60 * 60 * 1000,
  };
}
