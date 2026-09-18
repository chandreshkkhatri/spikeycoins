import { ICandle } from "./candles";

export interface IEngineTrade {
  entryCandle: number;
  exitCandle: number | null;
  side: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnl: number | null;
  pnlCash?: number | null;
  rMultiple?: number | null;
  quantity?: number;
  riskAmount?: number;
  initialStopLoss?: number;
  stopHistory?: Array<{ from: number }>;
  thesis?: { plannedStop: number };
  status: "PENDING" | "OPEN" | "CLOSED" | "STOPPED_OUT" | "TARGET_HIT" | "CANCELED";
  type: "MARKET" | "LIMIT";
  durationBars?: number | null;
  invalidationPrice?: number;
}

export interface IEngineSessionState {
  currentCandleIndex: number;
  candles: ICandle[];
  trades: IEngineTrade[];
  totalPnl: number;
  totalPnlCash?: number;
  totalR?: number;
  capital?: number;
  startingCapital?: number;
  status: "ACTIVE" | "COMPLETED" | "REVEALED" | "ABANDONED";
}

/**
 * Calculate percentage PnL for a trade.
 */
export function calcPctPnl(entryPrice: number, exitPrice: number, side: "LONG" | "SHORT"): number {
  if (side === "LONG") {
    return +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(4);
  }
  return +(((entryPrice - exitPrice) / entryPrice) * 100).toFixed(4);
}

/**
 * Calculate absolute cash PnL for a trade given quantity.
 */
export function calcCashPnl(
  entryPrice: number,
  exitPrice: number,
  side: "LONG" | "SHORT",
  quantity: number
): number {
  const diff = side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return +(diff * quantity).toFixed(2);
}

/**
 * Calculate R-multiple achieved on a trade.
 */
export function calcRMultiple(
  entryPrice: number,
  exitPrice: number,
  stopLoss: number,
  side: "LONG" | "SHORT"
): number {
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  if (riskPerUnit === 0) return 0;
  const rewardPerUnit = side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return +(rewardPerUnit / riskPerUnit).toFixed(2);
}

/** Recover original risk for older trades before the immutable field existed. */
export function getInitialStop(trade: IEngineTrade): number {
  return trade.initialStopLoss ?? trade.stopHistory?.[0]?.from ?? trade.thesis?.plannedStop ?? trade.stopLoss;
}

/** Settle a trade using its original risk, regardless of later stop modifications. */
export function closeTrade(trade: IEngineTrade, exitPrice: number, exitCandle: number): void {
  trade.exitPrice = exitPrice;
  trade.exitCandle = exitCandle;
  trade.status = "CLOSED";
  trade.pnl = calcPctPnl(trade.entryPrice, exitPrice, trade.side);
  if (trade.quantity != null) {
    trade.pnlCash = calcCashPnl(trade.entryPrice, exitPrice, trade.side, trade.quantity);
  }
  trade.rMultiple = calcRMultiple(trade.entryPrice, exitPrice, getInitialStop(trade), trade.side);
  trade.durationBars = exitCandle - trade.entryCandle;
}

/**
 * Idempotently recompute total PnL, cash PnL, and total R for a session.
 */
export function recomputeTotals(state: IEngineSessionState): void {
  let totalPnl = 0;
  let totalPnlCash = 0;
  let totalR = 0;

  for (const trade of state.trades) {
    if (
      trade.status === "CLOSED" ||
      trade.status === "STOPPED_OUT" ||
      trade.status === "TARGET_HIT"
    ) {
      if (trade.pnl != null) {
        totalPnl += trade.pnl;
      }
      if (trade.pnlCash != null) {
        totalPnlCash += trade.pnlCash;
      }
      if (trade.rMultiple != null) {
        totalR += trade.rMultiple;
      }
    }
  }

  state.totalPnl = +totalPnl.toFixed(4);
  state.totalPnlCash = +totalPnlCash.toFixed(2);
  state.totalR = +totalR.toFixed(2);
  if (state.startingCapital != null) {
    state.capital = +(state.startingCapital + totalPnlCash).toFixed(2);
  }
}

/**
 * Pure engine fill loop advancing session candles by `n`.
 * Enforces worst-case intrabar resolution (stopLoss checked before takeProfit).
 */
export function advance(state: IEngineSessionState, candlesToAdvance: number = 1): IEngineSessionState {
  if (state.status !== "ACTIVE") {
    return state;
  }

  const validAdvance = Math.max(1, Math.floor(candlesToAdvance || 1));
  const newIndex = Math.min(state.currentCandleIndex + validAdvance, state.candles.length);
  const newCandles = state.candles.slice(state.currentCandleIndex, newIndex);

  for (const trade of state.trades) {
    if (
      trade.status === "CLOSED" ||
      trade.status === "STOPPED_OUT" ||
      trade.status === "TARGET_HIT" ||
      trade.status === "CANCELED"
    ) {
      continue;
    }

    for (let i = 0; i < newCandles.length; i++) {
      const candle = newCandles[i];
      const candleIndex = state.currentCandleIndex + i;

      // 1. Process PENDING limit orders
      if (trade.status === "PENDING") {
        // Auto-cancel if invalidation level is breached before fill
        if (trade.invalidationPrice != null) {
          const invalidationBreached =
            trade.side === "LONG"
              ? candle.low <= trade.invalidationPrice
              : candle.high >= trade.invalidationPrice;
          if (invalidationBreached) {
            trade.status = "CANCELED";
            break;
          }
        }

        // Fill condition
        const filled =
          trade.side === "LONG"
            ? candle.low <= trade.entryPrice
            : candle.high >= trade.entryPrice;

        if (filled) {
          trade.status = "OPEN";
          trade.entryCandle = candleIndex;
        }
      }

      // 2. Process OPEN trades (worst-case SL before TP)
      if (trade.status === "OPEN") {
        if (trade.side === "LONG") {
          // Check Stop Loss first
          if (candle.low <= trade.stopLoss) {
            trade.status = "STOPPED_OUT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.stopLoss;
            trade.pnl = calcPctPnl(trade.entryPrice, trade.stopLoss, "LONG");
            if (trade.quantity) {
              trade.pnlCash = calcCashPnl(trade.entryPrice, trade.stopLoss, "LONG", trade.quantity);
            }
            trade.rMultiple = calcRMultiple(trade.entryPrice, trade.stopLoss, getInitialStop(trade), "LONG");
            trade.durationBars = trade.exitCandle - trade.entryCandle;
            break;
          }
          // Check Take Profit second
          if (candle.high >= trade.takeProfit) {
            trade.status = "TARGET_HIT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.takeProfit;
            trade.pnl = calcPctPnl(trade.entryPrice, trade.takeProfit, "LONG");
            if (trade.quantity) {
              trade.pnlCash = calcCashPnl(trade.entryPrice, trade.takeProfit, "LONG", trade.quantity);
            }
            trade.rMultiple = calcRMultiple(trade.entryPrice, trade.takeProfit, getInitialStop(trade), "LONG");
            trade.durationBars = trade.exitCandle - trade.entryCandle;
            break;
          }
        } else {
          // SHORT: Check Stop Loss first
          if (candle.high >= trade.stopLoss) {
            trade.status = "STOPPED_OUT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.stopLoss;
            trade.pnl = calcPctPnl(trade.entryPrice, trade.stopLoss, "SHORT");
            if (trade.quantity) {
              trade.pnlCash = calcCashPnl(trade.entryPrice, trade.stopLoss, "SHORT", trade.quantity);
            }
            trade.rMultiple = calcRMultiple(trade.entryPrice, trade.stopLoss, getInitialStop(trade), "SHORT");
            trade.durationBars = trade.exitCandle - trade.entryCandle;
            break;
          }
          // SHORT: Check Take Profit second
          if (candle.low <= trade.takeProfit) {
            trade.status = "TARGET_HIT";
            trade.exitCandle = candleIndex;
            trade.exitPrice = trade.takeProfit;
            trade.pnl = calcPctPnl(trade.entryPrice, trade.takeProfit, "SHORT");
            if (trade.quantity) {
              trade.pnlCash = calcCashPnl(trade.entryPrice, trade.takeProfit, "SHORT", trade.quantity);
            }
            trade.rMultiple = calcRMultiple(trade.entryPrice, trade.takeProfit, getInitialStop(trade), "SHORT");
            trade.durationBars = trade.exitCandle - trade.entryCandle;
            break;
          }
        }
      }
    }
  }

  state.currentCandleIndex = newIndex;
  if (newIndex >= state.candles.length) {
    for (const trade of state.trades) {
      if (trade.status === "OPEN" && newIndex > 0) {
        closeTrade(trade, state.candles[newIndex - 1].close, newIndex - 1);
      } else if (trade.status === "PENDING") {
        trade.status = "CANCELED";
      }
    }
    state.status = "COMPLETED";
  }

  recomputeTotals(state);
  return state;
}
