import { describe, it, expect } from "vitest";
import {
  toNumber,
  formatBinanceFuturesPosition,
  formatDefaultPosition,
  formatPosition,
  formatHolding,
  formatFunds,
} from "./format-utils";
import { IAccount } from "../models/account";

describe("format-utils", () => {
  describe("toNumber", () => {
    it("should convert null and undefined to fallback", () => {
      expect(toNumber(null, 10)).toBe(10);
      expect(toNumber(undefined, 5)).toBe(5);
    });

    it("should return finite numbers as-is", () => {
      expect(toNumber(123.45)).toBe(123.45);
      expect(toNumber(-5)).toBe(-5);
      expect(toNumber(NaN, 8)).toBe(8);
      expect(toNumber(Infinity, 4)).toBe(4);
    });

    it("should parse valid numeric strings", () => {
      expect(toNumber("45.67")).toBe(45.67);
      expect(toNumber("-100")).toBe(-100);
      expect(toNumber("invalid", 10)).toBe(10);
    });

    it("should convert booleans correctly", () => {
      expect(toNumber(true)).toBe(1);
      expect(toNumber(false)).toBe(0);
    });

    it("should return fallback for unhandled types", () => {
      expect(toNumber({}, 3)).toBe(3);
      expect(toNumber([], 2)).toBe(2);
    });
  });

  describe("formatBinanceFuturesPosition", () => {
    const mockAccount: IAccount = {
      _id: "acc-123",
      accountName: "Binance Account",
      accountType: "binance",
      apiKey: "key",
      apiSecret: "secret",
      metadata: {},
      save: async () => mockAccount as any,
    } as any;

    it("should format a long position correctly", () => {
      const rawPos = {
        symbol: "BTCUSDT",
        positionAmt: "1.5",
        entryPrice: "60000",
        markPrice: "65000",
        unRealizedProfit: "7500",
        liquidationPrice: "50000",
        initialMargin: "300",
        leverage: "10",
        marginType: "isolated",
        positionSide: "LONG",
        updateTime: 1719158400000,
      };

      const result = formatBinanceFuturesPosition(rawPos, mockAccount);
      expect(result.id).toBe("acc-123-BTCUSDT-LONG");
      expect(result.symbol).toBe("BTCUSDT");
      expect(result.exchange).toBe("BINANCE");
      expect(result.quantity).toBe(1.5);
      expect(result.averagePrice).toBe(60000);
      expect(result.lastPrice).toBe(65000);
      expect(result.pnl).toBe(7500);
      expect(result.pnlPercentage).toBeCloseTo(8.3333, 4);
      expect(result.leverage).toBe(10);
      expect(result.liquidationPrice).toBe(50000);
      expect(result.breakEvenPrice).toBe(60000 * 1.0008); // long break even: 60000 * (1 + 0.0004 * 2)
      expect(result.margin).toBe(300);
      expect(result.marginType).toBe("isolated");
      expect(result.product).toBe("Futures (ISOLATED)");
      expect(result.vendor).toBe("binance");
      expect(result.accountId).toBe("acc-123");
      expect(result.accountName).toBe("Binance Account");
      expect(result.timestamp).toBe("2024-06-23T16:00:00.000Z");
    });

    it("should format a short position correctly", () => {
      const rawPos = {
        symbol: "BTCUSDT",
        positionAmt: "-1.5",
        entryPrice: "60000",
        markPrice: "55000",
        unRealizedProfit: "7500",
        liquidationPrice: "70000",
        initialMargin: "300",
        leverage: "10",
        marginType: "cross",
        positionSide: "SHORT",
        updateTime: 1719158400000,
      };

      const result = formatBinanceFuturesPosition(rawPos, mockAccount);
      expect(result.id).toBe("acc-123-BTCUSDT-SHORT");
      expect(result.quantity).toBe(-1.5);
      expect(result.breakEvenPrice).toBe(60000 * 0.9992); // short break even: 60000 * (1 - 0.0004 * 2)
      expect(result.product).toBe("Futures (CROSS)");
    });

    it("should handle the symbol fallback chain", () => {
      const mockPos = (fields: any) => ({
        positionAmt: "0",
        entryPrice: "0",
        ...fields,
      });

      expect(formatBinanceFuturesPosition(mockPos({ symbol: "S1" }), mockAccount).symbol).toBe("S1");
      expect(formatBinanceFuturesPosition(mockPos({ pair: "P1" }), mockAccount).symbol).toBe("P1");
      expect(formatBinanceFuturesPosition(mockPos({ displaySymbol: "DS1" }), mockAccount).symbol).toBe("DS1");
      expect(formatBinanceFuturesPosition(mockPos({}), mockAccount).symbol).toBe("UNKNOWN_SYMBOL");
    });
  });

  describe("formatDefaultPosition", () => {
    const mockAccount: IAccount = {
      _id: "acc-upstox",
      accountName: "Upstox Account",
      accountType: "upstox",
    } as any;

    it("should correctly resolve property fallbacks", () => {
      const rawPos = {
        tradingsymbol: "RELIANCE",
        netQty: 10,
        average_price: 2400.0,
        ltp: 2500.0,
        mtm: 1000.0,
        pnl_percentage: 4.17,
      };

      const result = formatDefaultPosition(rawPos, mockAccount);
      expect(result.id).toBe("acc-upstox-RELIANCE");
      expect(result.symbol).toBe("RELIANCE");
      expect(result.exchange).toBe("UPSTOX");
      expect(result.quantity).toBe(10);
      expect(result.averagePrice).toBe(2400.0);
      expect(result.lastPrice).toBe(2500.0);
      expect(result.pnl).toBe(1000.0);
      expect(result.pnlPercentage).toBe(4.17);
    });

    it("should fallback to generic values if primary fields are missing", () => {
      const rawPos = {
        symbol: "TATASTEEL",
        quantity: 5,
        avgPrice: 120.0,
        lastPrice: 125.0,
        pnl: 25.0,
      };

      const result = formatDefaultPosition(rawPos, mockAccount);
      expect(result.symbol).toBe("TATASTEEL");
      expect(result.quantity).toBe(5);
      expect(result.averagePrice).toBe(120.0);
      expect(result.lastPrice).toBe(125.0);
      expect(result.pnl).toBe(25.0);
      expect(result.pnlPercentage).toBe(((125 - 120) / 120) * 100);
    });
  });

  describe("formatPosition", () => {
    const binanceAccount: IAccount = {
      _id: "acc-bin",
      accountType: "binance",
      accountName: "Binance",
    } as any;

    const upstoxAccount: IAccount = {
      _id: "acc-ups",
      accountType: "upstox",
      accountName: "Upstox",
    } as any;

    it("should branch to Binance Futures position formatter if segment is usdm", () => {
      const rawPos = {
        symbol: "BTCUSDT",
        positionAmt: "1.5",
        entryPrice: "60000",
        positionSide: "BOTH",
      };

      const result = formatPosition(binanceAccount, rawPos, { tradingSegment: "usdm" });
      expect(result.exchange).toBe("BINANCE");
      expect(result.id).toBe("acc-bin-BTCUSDT-BOTH");
    });

    it("should branch to default formatter if not Binance or segment is not usdm", () => {
      const rawPos = {
        tradingsymbol: "RELIANCE",
        quantity: 5,
      };

      const result = formatPosition(upstoxAccount, rawPos);
      expect(result.symbol).toBe("RELIANCE");
      expect(result.exchange).toBe("UPSTOX");
    });
  });

  describe("formatHolding", () => {
    const binanceAccount: IAccount = {
      _id: "acc-bin",
      accountType: "binance",
      accountName: "Binance",
    } as any;

    const upstoxAccount: IAccount = {
      _id: "acc-ups",
      accountType: "upstox",
      accountName: "Upstox",
    } as any;

    it("should sum free and locked balances for Binance", () => {
      const rawHolding = {
        asset: "ETH",
        free: "1.2",
        locked: "0.8",
      };

      const result = formatHolding(rawHolding, binanceAccount);
      expect(result.id).toBe("acc-bin-ETH");
      expect(result.symbol).toBe("ETH");
      expect(result.exchange).toBe("SPOT");
      expect(result.quantity).toBe(2.0); // 1.2 + 0.8
      expect(result.averagePrice).toBe(0);
      expect(result.lastPrice).toBe(0);
      expect(result.details.free).toBe(1.2);
      expect(result.details.locked).toBe(0.8);
    });

    it("should merge holding and account properties directly for non-Binance", () => {
      const rawHolding = {
        isin: "INE002A01018",
        quantity: 100,
      };

      const result = formatHolding(rawHolding, upstoxAccount);
      expect(result.isin).toBe("INE002A01018");
      expect(result.quantity).toBe(100);
      expect(result.accountId).toBe("acc-ups");
      expect(result.vendor).toBe("upstox");
    });
  });

  describe("formatFunds", () => {
    const binanceAccount: IAccount = {
      _id: "acc-bin",
      accountType: "binance",
      accountName: "Binance",
    } as any;

    const upstoxAccount: IAccount = {
      _id: "acc-ups",
      accountType: "upstox",
      accountName: "Upstox",
    } as any;

    it("should aggregate balances correctly for spot segment", () => {
      const rawFunds = {
        segment: "spot",
        balances: [
          { asset: "USDT", free: "100", locked: "20" }, // direct USD asset, 120 total
          { asset: "BTC", free: "0.1", locked: "0" },  // requires conversion (priced via cryptocurrencies)
          { asset: "ETH", free: "0.5", locked: "0" },  // ETH not found in cryptocurrencies (skipped)
        ],
      };

      const cryptocurrencies = [
        { symbol: "BTC", price: 60000 },
      ];

      const result = formatFunds(rawFunds, binanceAccount, cryptocurrencies);
      // USDT total = 120, BTC total = 0.1 * 60000 = 6000, ETH skipped. Total = 6120.00
      expect(result.totalBalance).toBe("6120.00");
      // USDT available = 100, BTC available = 0.1 * 60000 = 6000, ETH skipped. Available = 6100.00
      expect(result.availableBalance).toBe("6100.00");
      expect(result.unrealizedPnl).toBe("0.00");
    });

    it("should fallback to flat-field and equity variables for non-spot segment", () => {
      const rawFunds = {
        segment: "futures",
        equity: {
          available_margin: "7500.50",
          used_margin: "2500.00",
          unrealised_pnl: "150.25",
        },
      };

      const result = formatFunds(rawFunds, upstoxAccount);
      expect(result.totalBalance).toBe("7500.50");
      expect(result.availableBalance).toBe("7500.50");
      expect(result.usedMargin).toBe("2500.00");
      expect(result.unrealizedPnl).toBe("150.25");
    });

    it("should fallback to default property fields when equity sub-property is missing", () => {
      const rawFunds = {
        segment: "futures",
        totalMarginBalance: "8000",
        availableBalance: "7800",
        totalInitialMargin: "200",
        totalUnrealizedProfit: "50",
      };

      const result = formatFunds(rawFunds, upstoxAccount);
      expect(result.totalBalance).toBe("8000");
      expect(result.availableBalance).toBe("7800");
      expect(result.usedMargin).toBe("200");
      expect(result.unrealizedPnl).toBe("50");
    });
  });
});
