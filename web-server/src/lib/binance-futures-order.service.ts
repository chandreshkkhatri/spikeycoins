import { BinanceService } from "./binance-service";

/**
 * Helper to round to precision with stepSize awareness
 */
export function roundToPrecision(
  value: number,
  precision: number,
  stepSizeVal: number = 0
): number {
  let rounded = parseFloat(value.toFixed(precision));

  if (stepSizeVal > 0) {
    const stepPrecision =
      stepSizeVal.toString().split(".")[1]?.length || 0;
    const maxPrecision = Math.max(precision, stepPrecision);
    rounded = parseFloat(
      (Math.round(rounded / stepSizeVal) * stepSizeVal).toFixed(
        maxPrecision
      )
    );
  }

  return rounded;
}

/**
 * Validate stop loss / take profit prices relative to current mark price
 */
export function validateStopPrice(
  stopPrice: number,
  markPrice: number,
  side: "BUY" | "SELL",
  orderType: "SL" | "TP",
): { valid: boolean; error?: string } {
  const isLong = side === "BUY";
  const tolerance = 0.001;

  if (orderType === "SL") {
    if (isLong && stopPrice >= markPrice * (1 - tolerance)) {
      return {
        valid: false,
        error: `Stop Loss (${stopPrice}) must be below current price (${markPrice}) for LONG positions`,
      };
    }
    if (!isLong && stopPrice <= markPrice * (1 + tolerance)) {
      return {
        valid: false,
        error: `Stop Loss (${stopPrice}) must be above current price (${markPrice}) for SHORT positions`,
      };
    }
  } else {
    if (isLong && stopPrice <= markPrice * (1 + tolerance)) {
      return {
        valid: false,
        error: `Take Profit (${stopPrice}) must be above current price (${markPrice}) for LONG positions`,
      };
    }
    if (!isLong && stopPrice >= markPrice * (1 - tolerance)) {
      return {
        valid: false,
        error: `Take Profit (${stopPrice}) must be below current price (${markPrice}) for SHORT positions`,
      };
    }
  }
  return { valid: true };
}

/**
 * Retry helper for placing SL/TP algo orders
 */
async function placeSLTPWithRetry(
  binanceService: BinanceService,
  orderParams: Record<string, unknown>,
  orderType: string,
  maxRetries: number = 3,
  delayMs: number = 500,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const algoParams = {
        symbol: orderParams.symbol as string,
        side: orderParams.side as "BUY" | "SELL",
        type: orderParams.type as
          | "STOP"
          | "TAKE_PROFIT"
          | "STOP_MARKET"
          | "TAKE_PROFIT_MARKET"
          | "TRAILING_STOP_MARKET",
        triggerPrice: orderParams.stopPrice as number,
        quantity: orderParams.quantity as number | undefined,
        reduceOnly: orderParams.reduceOnly as boolean | undefined,
        closePosition: orderParams.closePosition as boolean | undefined,
      };

      await binanceService.placeFuturesAlgoOrder(algoParams);
      return { success: true };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      console.warn(
        `${orderType} order attempt ${attempt}/${maxRetries} failed:`,
        errorMessage,
      );

      if (attempt === maxRetries) {
        return { success: false, error: errorMessage };
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

/**
 * Orchestrator: places futures order with risk settings (leverage, stop loss, take profit)
 */
export async function placeFuturesOrderWithRisk(
  binanceService: BinanceService,
  orderParams: any,
): Promise<{ order: any; slError: string | null; tpError: string | null; roundedQuantity: number }> {
  const {
    leverage,
    stopLoss,
    takeProfit,
    reduceOnly,
    ...binanceOrderParams
  } = orderParams;

  // Fetch exchange info to get precision and filters
  let quantityPrecision = 0;
  let pricePrecision = 2;
  let stepSize = 0;
  let minQty = 0;
  let minNotional = 0;
  try {
    const exchangeInfo = await binanceService.getFuturesExchangeInfo();
    const symbolInfo = exchangeInfo.symbols?.find(
      (s: any) => s.symbol === orderParams.symbol,
    );
    if (symbolInfo) {
      quantityPrecision = symbolInfo.quantityPrecision || 0;
      pricePrecision = symbolInfo.pricePrecision || 2;

      // Extract LOT_SIZE filter
      const lotSizeFilter = symbolInfo.filters?.find(
        (f: any) => f.filterType === "LOT_SIZE",
      );
      if (lotSizeFilter) {
        minQty = parseFloat(lotSizeFilter.minQty || "0");
        stepSize = parseFloat(lotSizeFilter.stepSize || "0");
      }

      // Extract MIN_NOTIONAL filter
      const minNotionalFilter = symbolInfo.filters?.find(
        (f: any) => f.filterType === "MIN_NOTIONAL",
      );
      if (minNotionalFilter) {
        minNotional = parseFloat(minNotionalFilter.notional || minNotionalFilter.minNotional || "0");
      }
    }
  } catch (infoError) {
    console.warn(
      "Could not fetch exchange info for precision:",
      infoError,
    );
  }

  // Set leverage if provided
  if (leverage && leverage > 0) {
    try {
      await binanceService.changeFuturesLeverage(
        orderParams.symbol,
        leverage,
      );
    } catch (leverageError: any) {
      const msg = leverageError.message || "";
      if (msg.includes("No need to change")) {
        // Already at the requested leverage — proceed normally
      } else if (
        msg.includes("not valid") ||
        msg.includes("exceeds maximum")
      ) {
        throw new Error(
          `Cannot set ${leverage}x leverage for ${orderParams.symbol}: ${msg}. ` +
            `Please check the maximum allowed leverage for this symbol on Binance.`,
        );
      } else {
        console.warn("Failed to set leverage:", msg);
      }
    }
  }

  const roundedQuantity = roundToPrecision(
    binanceOrderParams.quantity,
    quantityPrecision,
    stepSize,
  );
  const roundedPrice = binanceOrderParams.price
    ? roundToPrecision(binanceOrderParams.price, pricePrecision)
    : undefined;
  const roundedStopPrice = binanceOrderParams.stopPrice
    ? roundToPrecision(binanceOrderParams.stopPrice, pricePrecision)
    : undefined;

  if (roundedQuantity <= 0) {
    throw new Error(
      `Order quantity after rounding is ${roundedQuantity}. Quantity must be greater than 0. ` +
      `Try increasing the position size. Minimum quantity: ${minQty}`,
    );
  }

  if (minQty > 0 && roundedQuantity < minQty) {
    throw new Error(
      `Order quantity ${roundedQuantity} is less than minimum ${minQty} for ${orderParams.symbol}. ` +
      `Please increase the position size to at least ${minQty}.`,
    );
  }

  if (minNotional > 0) {
    let notionalPrice = roundedPrice || binanceOrderParams.price || 0;

    if (!notionalPrice && binanceOrderParams.type === "MARKET") {
      try {
        notionalPrice = await binanceService.getFuturesMarkPrice(
          orderParams.symbol,
        );
      } catch {
        throw new Error(
          `Cannot validate notional value for MARKET order: unable to fetch current price for ${orderParams.symbol}. ` +
            `Please try a LIMIT order instead or check your connection.`
        );
      }
    }

    if (notionalPrice <= 0) {
      throw new Error(
        `Invalid price (${notionalPrice}) for notional validation. Cannot place order for ${orderParams.symbol}.`
      );
    }

    const notional = roundedQuantity * notionalPrice;
    if (notional < minNotional) {
      throw new Error(
        `Order notional value ${notional.toFixed(2)} is below minimum ${minNotional} for ${
          orderParams.symbol
        }. ` +
          `Required quantity at current price: ${(minNotional / notionalPrice).toFixed(
            quantityPrecision
          )}`
      );
    }
  }

  const cleanOrderParams: any = {
    symbol: binanceOrderParams.symbol,
    side: binanceOrderParams.side,
    type: binanceOrderParams.type,
    quantity: roundedQuantity,
  };

  if (binanceOrderParams.type === "LIMIT") {
    cleanOrderParams.price = roundedPrice;
    cleanOrderParams.timeInForce = "GTC";
  }

  if (
    ["STOP", "STOP_MARKET", "TAKE_PROFIT", "TAKE_PROFIT_MARKET"].includes(
      binanceOrderParams.type,
    )
  ) {
    if (roundedStopPrice) {
      cleanOrderParams.stopPrice = roundedStopPrice;
    } else {
      console.warn(
        `Type ${binanceOrderParams.type} requires stopPrice but it is missing.`,
      );
    }
  }

  if (reduceOnly) {
    cleanOrderParams.reduceOnly = true;
  }

  if (binanceOrderParams.closePosition) {
    cleanOrderParams.closePosition = true;
  }

  console.log("Placing Binance futures order:", cleanOrderParams);

  const isConditionalOrder = [
    "STOP",
    "STOP_MARKET",
    "TAKE_PROFIT",
    "TAKE_PROFIT_MARKET",
    "TRAILING_STOP_MARKET",
  ].includes(cleanOrderParams.type);

  let order: any;
  if (isConditionalOrder) {
    const algoParams = {
      symbol: cleanOrderParams.symbol,
      side: cleanOrderParams.side,
      type: cleanOrderParams.type,
      triggerPrice: cleanOrderParams.stopPrice,
      quantity: cleanOrderParams.quantity,
      reduceOnly: cleanOrderParams.reduceOnly,
      closePosition: cleanOrderParams.closePosition,
    };
    console.log("Using Algo Order API:", algoParams);
    order = await binanceService.placeFuturesAlgoOrder(algoParams);
  } else {
    order = await binanceService.placeFuturesOrder(cleanOrderParams);
  }

  let slError: string | null = null;
  let tpError: string | null = null;

  let markPrice: number | null = null;
  if (stopLoss || takeProfit) {
    try {
      markPrice = await binanceService.getFuturesMarkPrice(
        orderParams.symbol,
      );
      console.log(
        `[Orders/Place] Current mark price for ${orderParams.symbol}: ${markPrice}`,
      );
    } catch (priceErr) {
      console.warn(
        "Could not fetch mark price for validation:",
        priceErr,
      );
    }
  }

  const isLimitOrder = orderParams.type === "LIMIT";
  const useQuantityBased = isLimitOrder;

  if (stopLoss || takeProfit) {
    try {
      const slTpSide = orderParams.side === "BUY" ? "SELL" : "BUY";
      const cancelResults = await binanceService.cancelFuturesSlTpOrders(
        orderParams.symbol,
        slTpSide,
      );
      if (cancelResults.length > 0) {
        console.log(
          `[Orders/Place] Cancelled ${cancelResults.length} existing SL/TP orders for ${orderParams.symbol}`,
        );
      }
    } catch (cancelErr) {
      console.warn("Could not cancel existing SL/TP orders:", cancelErr);
    }
  }

  if (stopLoss && stopLoss > 0) {
    const slSide = orderParams.side === "BUY" ? "SELL" : "BUY";
    const roundedSL = roundToPrecision(stopLoss, pricePrecision);

    if (markPrice !== null) {
      const validation = validateStopPrice(
        roundedSL,
        markPrice,
        orderParams.side,
        "SL",
      );
      if (!validation.valid) {
        slError = validation.error || "Invalid stop loss price";
        console.warn("Stop loss validation failed:", slError);
      }
    }

    if (!slError) {
      const slOrderParams: Record<string, unknown> = {
        symbol: orderParams.symbol,
        side: slSide,
        type: "STOP_MARKET",
        stopPrice: roundedSL,
      };

      if (useQuantityBased) {
        slOrderParams.quantity = roundedQuantity;
        slOrderParams.reduceOnly = true;
      } else {
        slOrderParams.closePosition = true;
      }

      const slResult = await placeSLTPWithRetry(
        binanceService,
        slOrderParams,
        "Stop Loss",
      );
      if (!slResult.success) {
        slError = slResult.error || "Unknown error";
      }
    }
  }

  if (takeProfit && takeProfit > 0) {
    const tpSide = orderParams.side === "BUY" ? "SELL" : "BUY";
    const roundedTP = roundToPrecision(takeProfit, pricePrecision);

    if (markPrice !== null) {
      const validation = validateStopPrice(
        roundedTP,
        markPrice,
        orderParams.side,
        "TP",
      );
      if (!validation.valid) {
        tpError = validation.error || "Invalid take profit price";
        console.warn("Take profit validation failed:", tpError);
      }
    }

    if (!tpError) {
      const tpOrderParams: Record<string, unknown> = {
        symbol: orderParams.symbol,
        side: tpSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: roundedTP,
      };

      if (useQuantityBased) {
        tpOrderParams.quantity = roundedQuantity;
        tpOrderParams.reduceOnly = true;
      } else {
        tpOrderParams.closePosition = true;
      }

      const tpResult = await placeSLTPWithRetry(
        binanceService,
        tpOrderParams,
        "Take Profit",
      );
      if (!tpResult.success) {
        tpError = tpResult.error || "Unknown error";
      }
    }
  }

  return {
    order,
    slError,
    tpError,
    roundedQuantity,
  };
}
