import { describe, it, expect } from "vitest";
import { advance, calcPctPnl, calcCashPnl, calcRMultiple, recomputeTotals, closeTrade, IEngineTrade, IEngineSessionState } from "./engine";

describe("Gym Engine", () => {
  it("calculates percentage PnL correctly", () => {
    expect(calcPctPnl(100, 110, "LONG")).toBe(10);
    expect(calcPctPnl(100, 90, "LONG")).toBe(-10);
    expect(calcPctPnl(100, 90, "SHORT")).toBe(10);
    expect(calcPctPnl(100, 110, "SHORT")).toBe(-10);
  });

  it("calculates cash PnL correctly", () => {
    expect(calcCashPnl(100, 110, "LONG", 5)).toBe(50);
    expect(calcCashPnl(100, 90, "SHORT", 5)).toBe(50);
  });

  it("calculates R-multiple correctly", () => {
    // Risk per unit = 100 - 90 = 10. Reward per unit = 120 - 100 = 20. R = +2.0
    expect(calcRMultiple(100, 120, 90, "LONG")).toBe(2);
    expect(calcRMultiple(100, 90, 90, "LONG")).toBe(-1);
  });

  it("enforces worst-case intrabar resolution (stop loss before target hit when both hit)", () => {
    const state: IEngineSessionState = {
      currentCandleIndex: 1,
      status: "ACTIVE",
      totalPnl: 0,
      candles: [
        { open: 100, high: 100, low: 100, close: 100, volume: 10, timestamp: 0 },
        // Candle 2 hits BOTH stop loss (90) and take profit (120)
        { open: 100, high: 125, low: 85, close: 105, volume: 10, timestamp: 1 },
      ],
      trades: [
        {
          entryCandle: 0,
          exitCandle: null,
          side: "LONG",
          entryPrice: 100,
          exitPrice: null,
          stopLoss: 90,
          takeProfit: 120,
          pnl: null,
          status: "OPEN",
          type: "MARKET",
        },
      ],
    };

    advance(state, 1);

    expect(state.currentCandleIndex).toBe(2);
    const trade = state.trades[0];
    expect(trade.status).toBe("STOPPED_OUT");
    expect(trade.exitPrice).toBe(90);
    expect(trade.pnl).toBe(-10);
    expect(state.totalPnl).toBe(-10);
  });

  it("auto-cancels a pending limit order if invalidation price is breached before fill", () => {
    const state: IEngineSessionState = {
      currentCandleIndex: 1,
      status: "ACTIVE",
      totalPnl: 0,
      candles: [
        { open: 100, high: 100, low: 100, close: 100, volume: 10, timestamp: 0 },
        // Candle 2 drops below invalidation (80) before reaching limit entry price (90)
        { open: 100, high: 100, low: 75, close: 85, volume: 10, timestamp: 1 },
      ],
      trades: [
        {
          entryCandle: 0,
          exitCandle: null,
          side: "LONG",
          entryPrice: 90,
          exitPrice: null,
          stopLoss: 85,
          takeProfit: 120,
          invalidationPrice: 80,
          pnl: null,
          status: "PENDING",
          type: "LIMIT",
        },
      ],
    };

    advance(state, 1);

    expect(state.trades[0].status).toBe("CANCELED");
  });

  it("is idempotent when calling recomputeTotals", () => {
    const state: IEngineSessionState = {
      currentCandleIndex: 2,
      status: "ACTIVE",
      totalPnl: 0,
      candles: [],
      trades: [
        {
          entryCandle: 0,
          exitCandle: 1,
          side: "LONG",
          entryPrice: 100,
          exitPrice: 110,
          stopLoss: 90,
          takeProfit: 120,
          pnl: 10,
          pnlCash: 50,
          rMultiple: 1,
          status: "CLOSED",
          type: "MARKET",
        },
      ],
    };

    recomputeTotals(state);
    expect(state.totalPnl).toBe(10);
    expect(state.totalPnlCash).toBe(50);
    expect(state.totalR).toBe(1);

    recomputeTotals(state);
    expect(state.totalPnl).toBe(10);
    expect(state.totalPnlCash).toBe(50);
    expect(state.totalR).toBe(1);
  });
});

describe("Original trade risk", () => {
  const makeTrade = (): IEngineTrade => ({
    entryCandle: 0, exitCandle: null, side: "LONG", entryPrice: 100, exitPrice: null,
    initialStopLoss: 95, stopLoss: 90, takeProfit: 110, quantity: 100,
    pnl: null, status: "OPEN", type: "MARKET",
  });

  it("uses initial risk for automatic stops and updates capital", () => {
    const state: IEngineSessionState = {
      currentCandleIndex: 0, status: "ACTIVE", totalPnl: 0, startingCapital: 100000,
      candles: [{ open: 100, high: 100, low: 89, close: 90, volume: 1, timestamp: 0 }],
      trades: [makeTrade()],
    };
    advance(state);
    expect(state.trades[0].rMultiple).toBe(-2);
    expect(state.totalR).toBe(-2);
    expect(state.capital).toBe(99000);
    recomputeTotals(state);
    expect(state.capital).toBe(99000);
  });

  it("recovers original risk from legacy stop history for manual closure", () => {
    const trade = makeTrade();
    delete trade.initialStopLoss;
    trade.stopHistory = [{ from: 95 }, { from: 92 }];
    closeTrade(trade, 110, 5);
    expect(trade.rMultiple).toBe(2);
    expect(trade.pnlCash).toBe(1000);
  });

  it("settles open trades at the final candle before completion", () => {
    const state: IEngineSessionState = {
      currentCandleIndex: 0, status: "ACTIVE", totalPnl: 0,
      candles: [{ open: 100, high: 104, low: 99, close: 103, volume: 1, timestamp: 0 }],
      trades: [makeTrade()],
    };
    advance(state);
    expect(state.status).toBe("COMPLETED");
    expect(state.trades[0].status).toBe("CLOSED");
    expect(state.totalR).toBe(0.6);
  });
});
