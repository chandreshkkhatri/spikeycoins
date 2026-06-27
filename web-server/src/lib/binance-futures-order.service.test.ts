import { describe, it, expect, vi } from "vitest";
import {
  roundToPrecision,
  validateStopPrice,
  placeFuturesOrderWithRisk,
} from "./binance-futures-order.service";
import { BinanceService } from "./binance-service";

function makeMockBinanceService(overrides: Record<string, unknown> = {}) {
  const defaultExchangeInfo = {
    symbols: [
      {
        symbol: "BTCUSDT",
        quantityPrecision: 3,
        pricePrecision: 2,
        filters: [
          { filterType: "LOT_SIZE", minQty: "0.001", stepSize: "0.001" },
          { filterType: "MIN_NOTIONAL", notional: "5.0" },
        ],
      },
      {
        symbol: "ETHUSDT",
        quantityPrecision: 2,
        pricePrecision: 2,
        filters: [
          { filterType: "LOT_SIZE", minQty: "0.01", stepSize: "0.01" },
          { filterType: "MIN_NOTIONAL", notional: "5.0" },
        ],
      },
    ],
  };

  const mockService = {
    getFuturesExchangeInfo: vi.fn().mockResolvedValue(defaultExchangeInfo),
    changeFuturesLeverage: vi.fn().mockResolvedValue({ symbol: "BTCUSDT", leverage: 10 }),
    getFuturesMarkPrice: vi.fn().mockResolvedValue(65000.0),
    placeFuturesOrder: vi.fn().mockResolvedValue({ orderId: "main-order-123", status: "NEW" }),
    placeFuturesAlgoOrder: vi.fn().mockResolvedValue({ orderId: "algo-order-456", status: "NEW" }),
    cancelFuturesSlTpOrders: vi.fn().mockResolvedValue([{ orderId: "canceled-1" }]),
    ...overrides,
  };

  return mockService as unknown as BinanceService;
}

describe("binance-futures-order.service", () => {
  describe("roundToPrecision", () => {
    it("should round to specified decimals", () => {
      expect(roundToPrecision(1.23456, 2)).toBe(1.23);
      expect(roundToPrecision(1.23456, 4)).toBe(1.2346);
    });

    it("should snap to step size if stepSize is positive", () => {
      // step 0.01, precision 2 -> value 0.137 snaped to 0.14
      expect(roundToPrecision(0.137, 2, 0.01)).toBe(0.14);
      expect(roundToPrecision(0.133, 2, 0.01)).toBe(0.13);
      expect(roundToPrecision(0.135, 2, 0.01)).toBe(0.14);
      
      // step 0.005
      expect(roundToPrecision(0.137, 3, 0.005)).toBe(0.135);
      expect(roundToPrecision(0.138, 3, 0.005)).toBe(0.140);
    });

    it("should bypass step snapping if stepSize is 0", () => {
      expect(roundToPrecision(0.137, 3, 0)).toBe(0.137);
    });
  });

  describe("validateStopPrice", () => {
    it("should validate Stop Loss relative to mark price for LONG (BUY)", () => {
      // mark = 100, tolerance = 0.001 -> mark * (1 - tolerance) = 99.9
      // SL price < 99.9 is valid
      expect(validateStopPrice(98, 100, "BUY", "SL").valid).toBe(true);
      expect(validateStopPrice(99.8, 100, "BUY", "SL").valid).toBe(true);
      expect(validateStopPrice(100, 100, "BUY", "SL").valid).toBe(false);
      expect(validateStopPrice(101, 100, "BUY", "SL").valid).toBe(false);
    });

    it("should validate Stop Loss relative to mark price for SHORT (SELL)", () => {
      // mark = 100, tolerance = 0.001 -> mark * (1 + tolerance) = 100.1
      // SL price > 100.1 is valid
      expect(validateStopPrice(102, 100, "SELL", "SL").valid).toBe(true);
      expect(validateStopPrice(100.2, 100, "SELL", "SL").valid).toBe(true);
      expect(validateStopPrice(100, 100, "SELL", "SL").valid).toBe(false);
      expect(validateStopPrice(99, 100, "SELL", "SL").valid).toBe(false);
    });

    it("should validate Take Profit relative to mark price for LONG (BUY)", () => {
      // mark = 100, tolerance = 0.001 -> mark * (1 + tolerance) = 100.1
      // TP price > 100.1 is valid
      expect(validateStopPrice(105, 100, "BUY", "TP").valid).toBe(true);
      expect(validateStopPrice(100.2, 100, "BUY", "TP").valid).toBe(true);
      expect(validateStopPrice(100, 100, "BUY", "TP").valid).toBe(false);
      expect(validateStopPrice(99, 100, "BUY", "TP").valid).toBe(false);
    });

    it("should validate Take Profit relative to mark price for SHORT (SELL)", () => {
      // mark = 100, tolerance = 0.001 -> mark * (1 - tolerance) = 99.9
      // TP price < 99.9 is valid
      expect(validateStopPrice(95, 100, "SELL", "TP").valid).toBe(true);
      expect(validateStopPrice(99.8, 100, "SELL", "TP").valid).toBe(true);
      expect(validateStopPrice(100, 100, "SELL", "TP").valid).toBe(false);
      expect(validateStopPrice(101, 100, "SELL", "TP").valid).toBe(false);
    });
  });

  describe("placeFuturesOrderWithRisk", () => {
    it("should reject with error when rounded quantity is 0 or less than minQty", async () => {
      const mockService = makeMockBinanceService();
      
      // Rounded qty is 0
      const paramsZero = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.0002, // rounds to 0 under precision 3
        price: 65000.0,
      };

      await expect(placeFuturesOrderWithRisk(mockService, paramsZero)).rejects.toThrow(
        "Order quantity after rounding is 0. Quantity must be greater than 0"
      );
      expect(mockService.placeFuturesOrder).not.toHaveBeenCalled();


      const mockServiceWithLargeMin = makeMockBinanceService({
        getFuturesExchangeInfo: vi.fn().mockResolvedValue({
          symbols: [
            {
              symbol: "BTCUSDT",
              quantityPrecision: 3,
              pricePrecision: 2,
              filters: [
                { filterType: "LOT_SIZE", minQty: "0.05", stepSize: "0.001" },
              ],
            },
          ],
        }),
      });

      const paramsLowQty = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.02, // rounds to 0.020, which is < minQty (0.05)
        price: 65000.0,
      };

      await expect(placeFuturesOrderWithRisk(mockServiceWithLargeMin, paramsLowQty)).rejects.toThrow(
        "Order quantity 0.02 is less than minimum 0.05 for BTCUSDT"
      );
    });

    it("should validate MIN_NOTIONAL and reject if quantity * price is too low", async () => {
      const mockService = makeMockBinanceService();

      // LIMIT order notional = 0.001 * 1000 = 1.0 < minNotional (5.0)
      const paramsLowNotionalLimit = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.001,
        price: 1000.0,
      };

      await expect(placeFuturesOrderWithRisk(mockService, paramsLowNotionalLimit)).rejects.toThrow(
        "Order notional value 1.00 is below minimum 5 for BTCUSDT"
      );

      // MARKET order fetches mark price (65000) inside
      // Let's mock getFuturesMarkPrice to return 1000
      const mockLowMarkPriceService = makeMockBinanceService({
        getFuturesMarkPrice: vi.fn().mockResolvedValue(1000.0),
      });

      const paramsLowNotionalMarket = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 0.001, // notional = 0.001 * 1000 = 1.0 < 5.0
      };

      await expect(placeFuturesOrderWithRisk(mockLowMarkPriceService, paramsLowNotionalMarket)).rejects.toThrow(
        "Order notional value 1.00 is below minimum 5 for BTCUSDT"
      );
      expect(mockLowMarkPriceService.getFuturesMarkPrice).toHaveBeenCalledWith("BTCUSDT");
    });

    it("should handle leverage changes, swallowing 'No need to change' errors but throwing on hard failure", async () => {
      // Swallows "No need to change"
      const mockSwallowService = makeMockBinanceService({
        changeFuturesLeverage: vi.fn().mockRejectedValue(new Error("No need to change")),
      });

      const params = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 0.1,
        leverage: 10,
      };

      const result = await placeFuturesOrderWithRisk(mockSwallowService, params);
      expect(result.order).toBeDefined();
      expect(mockSwallowService.placeFuturesOrder).toHaveBeenCalled();

      // Throws on hard error
      const mockFailService = makeMockBinanceService({
        changeFuturesLeverage: vi.fn().mockRejectedValue(new Error("exceeds maximum leverage")),
      });

      await expect(placeFuturesOrderWithRisk(mockFailService, params)).rejects.toThrow(
        "Cannot set 10x leverage for BTCUSDT: exceeds maximum leverage."
      );
      expect(mockFailService.placeFuturesOrder).not.toHaveBeenCalled();
    });

    it("should route main order to placeFuturesOrder for LIMIT/MARKET, and placeFuturesAlgoOrder for conditionals", async () => {
      const mockService = makeMockBinanceService();

      // LIMIT -> placeFuturesOrder
      const paramsLimit = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.1,
        price: 60000.0,
      };
      await placeFuturesOrderWithRisk(mockService, paramsLimit);
      expect(mockService.placeFuturesOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LIMIT", quantity: 0.1, price: 60000.0 })
      );

      // STOP_MARKET -> placeFuturesAlgoOrder
      const paramsStop = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "STOP_MARKET",
        quantity: 0.1,
        stopPrice: 60000.0,
        price: 60000.0, // Satisfy notional validation
      };
      await placeFuturesOrderWithRisk(mockService, paramsStop);
      expect(mockService.placeFuturesAlgoOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: "STOP_MARKET", quantity: 0.1, triggerPrice: 60000.0 })
      );
    });

    it("should place companion Stop Loss and Take Profit orders on the opposite side", async () => {
      const mockService = makeMockBinanceService();

      const params = {
        symbol: "BTCUSDT",
        side: "BUY", // entry side is BUY
        type: "LIMIT",
        quantity: 0.1,
        price: 65000.0,
        stopLoss: 64000.0,
        takeProfit: 66000.0,
      };

      await placeFuturesOrderWithRisk(mockService, params);

      // Cancels existing SL/TP orders first on opposite side (SELL)
      expect(mockService.cancelFuturesSlTpOrders).toHaveBeenCalledWith("BTCUSDT", "SELL");

      // Verify SL placement on opposite side (SELL)
      expect(mockService.placeFuturesAlgoOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "STOP_MARKET",
          triggerPrice: 64000.0,
        })
      );

      // Verify TP placement on opposite side (SELL)
      expect(mockService.placeFuturesAlgoOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "TAKE_PROFIT_MARKET",
          triggerPrice: 66000.0,
        })
      );
    });

    it("should use quantity-based reduceOnly for LIMIT entries and closePosition=true for non-LIMIT entries", async () => {
      const mockService = makeMockBinanceService();

      // LIMIT entry -> SL/TP have quantity and reduceOnly
      const paramsLimit = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.1,
        price: 65000.0,
        stopLoss: 64000.0,
      };
      await placeFuturesOrderWithRisk(mockService, paramsLimit);
      expect(mockService.placeFuturesAlgoOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({
          quantity: 0.1,
          reduceOnly: true,
          closePosition: undefined,
        })
      );

      // MARKET entry -> SL/TP have closePosition: true, no quantity or reduceOnly
      const paramsMarket = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 0.1,
        stopLoss: 64000.0,
      };
      await placeFuturesOrderWithRisk(mockService, paramsMarket);
      expect(mockService.placeFuturesAlgoOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({
          closePosition: true,
          quantity: undefined,
          reduceOnly: undefined,
        })
      );
    });

    it("should capture and return SL/TP placement errors while main order succeeds", async () => {
      // Mock placeFuturesAlgoOrder to reject for Stop Loss, but main order succeeds
      const mockService = makeMockBinanceService();
      mockService.placeFuturesAlgoOrder = vi.fn().mockRejectedValue(new Error("TP/SL error placement"));

      const params = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.1,
        price: 65000.0,
        stopLoss: 64000.0,
        takeProfit: 66000.0,
      };

      const result = await placeFuturesOrderWithRisk(mockService, params);

      // Main order placed successfully
      expect(result.order).toEqual({ orderId: "main-order-123", status: "NEW" });
      
      // slError and tpError populated
      expect(result.slError).toBe("TP/SL error placement");
      expect(result.tpError).toBe("TP/SL error placement");
    });

    it("should return roundedQuantity reflecting lot size precision and step snapping", async () => {
      const mockService = makeMockBinanceService();

      const params = {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.12389, // should round to 0.124 for BTCUSDT (qty precision = 3, stepSize = 0.001)
        price: 65000.0,
      };

      const result = await placeFuturesOrderWithRisk(mockService, params);
      expect(result.roundedQuantity).toBe(0.124);
    });
  });
});
