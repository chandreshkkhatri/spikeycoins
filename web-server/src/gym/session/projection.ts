import { ICandle, TIMEFRAME_CONFIGS } from "./candles";

export interface IProjectionSession {
  _id?: unknown;
  id?: unknown;
  userId?: string;
  schemaVersion?: number;
  mode?: "FREE" | "METHOD";
  interval: string;
  currentCandleIndex: number;
  candles: ICandle[];
  lowerInterval?: string;
  lowerCandles?: ICandle[];
  higherInterval?: string;
  higherCandles?: ICandle[];
  trades: any[];
  totalPnl: number;
  totalPnlCash?: number;
  totalR?: number;
  capital?: number;
  startingCapital?: number;
  riskPercent?: number;
  status: string;
  actualSymbol?: string;
  actualStartTimestamp?: number;
  methodologyVersion?: string;
  endedAt?: Date;
  governor?: any;
}

/**
 * Format consistent, secure session response payload.
 * Aggregates forming HTF bar from visible main candles without leaking future HTF bars.
 */
export function formatSessionResponse(session: IProjectionSession) {
  const config = TIMEFRAME_CONFIGS[session.interval] || {
    lowerMultiplier: 4,
    higherMultiplier: 4,
  };

  const lowerCandleIndex = session.currentCandleIndex * config.lowerMultiplier;
  const completedHigherIndex = Math.floor(session.currentCandleIndex / config.higherMultiplier);
  const isRevealed = session.status === "REVEALED";

  // Base completed higher candles
  let projectedHigherCandles: ICandle[] = [];
  if (session.higherCandles && session.higherCandles.length > 0) {
    projectedHigherCandles = session.higherCandles.slice(0, completedHigherIndex);

    // Aggregate forming HTF candle from visible main candles since last boundary
    const remainderStart = completedHigherIndex * config.higherMultiplier;
    if (remainderStart < session.currentCandleIndex && remainderStart < session.candles.length) {
      const mainSlice = session.candles.slice(remainderStart, session.currentCandleIndex);
      if (mainSlice.length > 0) {
        const formingHtfBar: ICandle = {
          open: mainSlice[0].open,
          high: Math.max(...mainSlice.map((c) => c.high)),
          low: Math.min(...mainSlice.map((c) => c.low)),
          close: mainSlice[mainSlice.length - 1].close,
          volume: +mainSlice.reduce((sum, c) => sum + c.volume, 0).toFixed(4),
          timestamp: completedHigherIndex,
        };
        projectedHigherCandles = [...projectedHigherCandles, formingHtfBar];
      }
    }
  }

  const id = session._id || session.id;

  return {
    id: String(id),
    schemaVersion: session.schemaVersion ?? 1,
    mode: session.mode ?? "FREE",
    interval: session.interval,
    currentCandleIndex: session.currentCandleIndex,
    totalCandles: session.candles.length,
    candles: session.candles.slice(0, session.currentCandleIndex),
    lowerInterval: session.lowerInterval,
    lowerCandles: session.lowerCandles ? session.lowerCandles.slice(0, lowerCandleIndex) : [],
    higherInterval: session.higherInterval,
    higherCandles: projectedHigherCandles,
    trades: session.trades,
    totalPnl: session.totalPnl,
    totalPnlCash: session.totalPnlCash ?? 0,
    totalR: session.totalR ?? 0,
    capital: session.capital,
    startingCapital: session.startingCapital,
    riskPercent: session.riskPercent,
    status: session.status,
    methodologyVersion: session.methodologyVersion,
    endedAt: session.endedAt,
    governor: session.governor,
    ...(isRevealed && {
      actualSymbol: session.actualSymbol,
      actualStartTimestamp: session.actualStartTimestamp,
    }),
  };
}
