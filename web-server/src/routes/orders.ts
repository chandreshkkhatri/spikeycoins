import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import pushNotificationService from "../lib/push-notification-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/orders - Get all orders for an account
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    let orders;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      orders = await kiteConnectService.getOrders();
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);

      try {
        orders = await upstoxService.getOrders();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message,
        );
        orders = [];
      }
    } else if (account.accountType === "binance") {
      console.log(
        `[Orders] Binance account ${account._id} metadata:`,
        account.metadata,
      );
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      console.log(`[Orders] Using trading segment: ${tradingSegment}`);
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Get both basic and conditional orders
        const [basicOrders, algoOrders] = await Promise.all([
          binanceService.getFuturesOpenOrders(),
          binanceService.getFuturesOpenAlgoOrders(),
        ]);

        // Normalize basic orders
        const normalizedBasic = (basicOrders || []).map((o: any) => ({
          ...o,
          orderCategory: "basic",
        }));

        // Normalize algo orders (different structure from Binance)
        const normalizedAlgo = (algoOrders || []).map((o: any) => ({
          orderId: o.algoId,
          clientOrderId: o.clientAlgoId,
          symbol: o.symbol,
          side: o.side,
          type: o.orderType,
          origQty: o.quantity,
          price: o.price || "0",
          stopPrice: o.triggerPrice,
          status: o.algoStatus,
          time: o.createTime,
          updateTime: o.updateTime,
          orderCategory: "conditional",
        }));

        orders = [...normalizedBasic, ...normalizedAlgo];
      } else {
        // Spot - Get open orders
        orders = await binanceService.getSpotOpenOrders();
        orders = (orders || []).map((o: any) => ({
          ...o,
          orderCategory: "basic",
        }));
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for orders" });
    }

    // Map orders to unified format
    const unifiedOrders = Array.isArray(orders)
      ? orders.map((order: any) => ({
          ...order,
          accountId: account._id,
          vendor: account.accountType,
        }))
      : [];

    return res.json({
      success: true,
      data: unifiedOrders,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    // Return consistent structure even on error
    // Include actual error message for better debugging
    const errorMessage = error.message || "Unknown error";
    return res.status(500).json({
      success: false,
      error: `Failed to fetch orders: ${errorMessage}`,
      details: errorMessage,
      data: [], // Ensure data is always present
    });
  }
});

// POST /api/orders/place - Place a new order
router.post("/place", async (req: Request, res: Response) => {
  try {
    const { accountId, ...orderParams } = req.body;

    console.log(
      "[Orders/Place] Request body:",
      JSON.stringify(req.body, null, 2),
    );

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      console.log("[Orders/Place] Account not found:", accountId);
      return res.status(404).json({ error: "Account not found" });
    }

    let result;
    // Track SL/TP errors for response
    let slOrderError: string | null = null;
    let tpOrderError: string | null = null;

    console.log("[Orders/Place] Account found:", {
      id: account._id,
      type: account.accountType,
      segment: account.metadata?.tradingSegment,
      testnet: account.metadata?.testnet,
    });

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      result = await kiteConnectService.placeOrder(orderParams);
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.placeOrder(orderParams);
    } else if (account.accountType === "binance") {
      // Detect trading segment from metadata, or infer from order params
      // If leverage, stopLoss, or takeProfit is set, it's a futures order
      const hasFuturesParams =
        orderParams.leverage || orderParams.stopLoss || orderParams.takeProfit;
      const tradingSegment =
        account.metadata?.tradingSegment ||
        (hasFuturesParams ? "usdm" : "spot");
      const isTestnet = account.metadata?.testnet || false;

      console.log(
        `[Orders/Place] Detected trading segment: ${tradingSegment} (metadata: ${account.metadata?.tradingSegment}, hasFuturesParams: ${hasFuturesParams})`,
      );

      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Extract special params
        const {
          leverage,
          stopLoss,
          takeProfit,
          reduceOnly,
          ...binanceOrderParams
        } = orderParams;

        // Fetch exchange info to get precision
        let quantityPrecision = 0;
        let pricePrecision = 2;
        try {
          const exchangeInfo = await binanceService.getFuturesExchangeInfo();
          const symbolInfo = exchangeInfo.symbols?.find(
            (s: any) => s.symbol === orderParams.symbol,
          );
          if (symbolInfo) {
            quantityPrecision = symbolInfo.quantityPrecision || 0;
            pricePrecision = symbolInfo.pricePrecision || 2;
          }
        } catch (infoError) {
          console.warn(
            "Could not fetch exchange info for precision:",
            infoError,
          );
        }

        // Helper to round to precision
        const roundToPrecision = (value: number, precision: number): number => {
          const factor = Math.pow(10, precision);
          return Math.floor(value * factor) / factor;
        };

        // Set leverage if provided
        if (leverage && leverage > 0) {
          try {
            await binanceService.changeFuturesLeverage(
              orderParams.symbol,
              leverage,
            );
          } catch (leverageError: any) {
            // Ignore "No need to change leverage" errors
            if (!leverageError.message?.includes("No need to change")) {
              console.warn("Failed to set leverage:", leverageError.message);
            }
          }
        }

        // Round quantity and price to correct precision
        const roundedQuantity = roundToPrecision(
          binanceOrderParams.quantity,
          quantityPrecision,
        );
        const roundedPrice = binanceOrderParams.price
          ? roundToPrecision(binanceOrderParams.price, pricePrecision)
          : undefined;
        const roundedStopPrice = binanceOrderParams.stopPrice
          ? roundToPrecision(binanceOrderParams.stopPrice, pricePrecision)
          : undefined;

        // Build clean order params for Binance
        const cleanOrderParams: any = {
          symbol: binanceOrderParams.symbol,
          side: binanceOrderParams.side,
          type: binanceOrderParams.type,
          quantity: roundedQuantity,
        };

        // Add price for LIMIT orders
        if (binanceOrderParams.type === "LIMIT") {
          cleanOrderParams.price = roundedPrice;
          cleanOrderParams.timeInForce = "GTC";
        }

        // Add stopPrice for conditional orders
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

        // Add reduceOnly if true (but not for initial position orders)
        if (reduceOnly) {
          cleanOrderParams.reduceOnly = true;
        }

        // Pass closePosition if present (for MARKET retry)
        if (binanceOrderParams.closePosition) {
          cleanOrderParams.closePosition = true;
        }

        console.log("Placing Binance futures order:", cleanOrderParams);

        // Place main order
        // Use Algo Order API for conditional orders, regular API for LIMIT/MARKET
        const isConditionalOrder = [
          "STOP",
          "STOP_MARKET",
          "TAKE_PROFIT",
          "TAKE_PROFIT_MARKET",
          "TRAILING_STOP_MARKET",
        ].includes(cleanOrderParams.type);

        if (isConditionalOrder) {
          // Use new Algo Order API for conditional orders
          const algoParams = {
            symbol: cleanOrderParams.symbol,
            side: cleanOrderParams.side,
            type: cleanOrderParams.type,
            triggerPrice: cleanOrderParams.stopPrice, // Map stopPrice to triggerPrice
            quantity: cleanOrderParams.quantity,
            reduceOnly: cleanOrderParams.reduceOnly,
            closePosition: cleanOrderParams.closePosition,
          };
          console.log("Using Algo Order API:", algoParams);
          result = await binanceService.placeFuturesAlgoOrder(algoParams);
        } else {
          result = await binanceService.placeFuturesOrder(cleanOrderParams);
        }

        // Helper function to place SL/TP with retry logic using new Algo Order API
        const placeSLTPWithRetry = async (
          orderParams: Record<string, unknown>,
          orderType: string,
          maxRetries: number = 3,
          delayMs: number = 500,
        ): Promise<{ success: boolean; error?: string }> => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // Use the new Algo Order API for conditional orders
              // Map stopPrice to triggerPrice for the new API
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

              // If it's the last attempt, return the error
              if (attempt === maxRetries) {
                return { success: false, error: errorMessage };
              }

              // Wait before retry
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
          return { success: false, error: "Max retries exceeded" };
        };

        // Validate stop price against market price
        const validateStopPrice = (
          stopPrice: number,
          markPrice: number,
          side: "BUY" | "SELL",
          orderType: "SL" | "TP",
        ): { valid: boolean; error?: string } => {
          // For a LONG position (BUY), SL should be below mark price, TP should be above
          // For a SHORT position (SELL), SL should be above mark price, TP should be below
          const isLong = side === "BUY";
          const tolerance = 0.001; // 0.1% tolerance for edge cases

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
            // TP
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
        };

        // Get current mark price for validation
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

        // Determine if we should use quantity-based SL/TP
        // For LIMIT orders, the position doesn't exist yet so we use quantity
        // For MARKET orders, the position exists immediately so we can use closePosition
        const isLimitOrder = orderParams.type === "LIMIT";
        const useQuantityBased = isLimitOrder;

        // Cancel existing SL/TP orders for this symbol and side before placing new ones
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
            // Continue anyway - new orders might still work
          }
        }

        // Place stop loss order if provided
        if (stopLoss && stopLoss > 0) {
          const slSide = orderParams.side === "BUY" ? "SELL" : "BUY";
          const roundedSL = roundToPrecision(stopLoss, pricePrecision);

          // Validate stop price
          if (markPrice !== null) {
            const validation = validateStopPrice(
              roundedSL,
              markPrice,
              orderParams.side,
              "SL",
            );
            if (!validation.valid) {
              slOrderError = validation.error || "Invalid stop loss price";
              console.warn("Stop loss validation failed:", slOrderError);
            }
          }

          // Only place order if validation passed (or we couldn't validate)
          if (!slOrderError) {
            const slOrderParams: Record<string, unknown> = {
              symbol: orderParams.symbol,
              side: slSide,
              type: "STOP_MARKET",
              stopPrice: roundedSL,
            };

            if (useQuantityBased) {
              // For LIMIT orders, use quantity and reduceOnly
              slOrderParams.quantity = roundedQuantity;
              slOrderParams.reduceOnly = true;
            } else {
              // For MARKET orders, use closePosition
              slOrderParams.closePosition = true;
            }

            const slResult = await placeSLTPWithRetry(
              slOrderParams,
              "Stop Loss",
            );
            if (!slResult.success) {
              slOrderError = slResult.error || "Unknown error";
            }
          }
        }

        // Place take profit order if provided
        if (takeProfit && takeProfit > 0) {
          const tpSide = orderParams.side === "BUY" ? "SELL" : "BUY";
          const roundedTP = roundToPrecision(takeProfit, pricePrecision);

          // Validate stop price
          if (markPrice !== null) {
            const validation = validateStopPrice(
              roundedTP,
              markPrice,
              orderParams.side,
              "TP",
            );
            if (!validation.valid) {
              tpOrderError = validation.error || "Invalid take profit price";
              console.warn("Take profit validation failed:", tpOrderError);
            }
          }

          // Only place order if validation passed (or we couldn't validate)
          if (!tpOrderError) {
            const tpOrderParams: Record<string, unknown> = {
              symbol: orderParams.symbol,
              side: tpSide,
              type: "TAKE_PROFIT_MARKET",
              stopPrice: roundedTP,
            };

            if (useQuantityBased) {
              // For LIMIT orders, use quantity and reduceOnly
              tpOrderParams.quantity = roundedQuantity;
              tpOrderParams.reduceOnly = true;
            } else {
              // For MARKET orders, use closePosition
              tpOrderParams.closePosition = true;
            }

            const tpResult = await placeSLTPWithRetry(
              tpOrderParams,
              "Take Profit",
            );
            if (!tpResult.success) {
              tpOrderError = tpResult.error || "Unknown error";
            }
          }
        }

        // Send push notification if SL or TP failed
        if (slOrderError || tpOrderError) {
          const userId = account.userId;
          if (userId) {
            // Determine notification type
            let notificationType: "sl_failed" | "tp_failed" | "sl_tp_failed";
            if (slOrderError && tpOrderError) {
              notificationType = "sl_tp_failed";
            } else if (slOrderError) {
              notificationType = "sl_failed";
            } else {
              notificationType = "tp_failed";
            }

            // Send notification asynchronously (don't block response)
            pushNotificationService
              .sendOrderNotification(userId, notificationType, {
                symbol: orderParams.symbol,
                side: orderParams.side,
                quantity: cleanOrderParams.quantity,
                slError: slOrderError || undefined,
                tpError: tpOrderError || undefined,
              })
              .catch((notifyErr) => {
                console.error("Failed to send push notification:", notifyErr);
              });
          }
        }
      } else {
        // Spot
        const { symbol, side, type, quantity, price, stopPrice, timeInForce } =
          orderParams;

        if (!symbol || !side || !type || !quantity) {
          return res.status(400).json({
            error:
              "symbol, side, type and quantity are required for Binance spot orders",
          });
        }

        const cleanSpotOrder: any = {
          symbol,
          side,
          type,
          quantity,
        };

        const tif = timeInForce || "GTC";

        if (type === "LIMIT") {
          if (!price) {
            return res
              .status(400)
              .json({ error: "price is required for LIMIT orders" });
          }
          cleanSpotOrder.price = price;
          cleanSpotOrder.timeInForce = tif;
        } else if (type === "STOP_LOSS_LIMIT" || type === "TAKE_PROFIT_LIMIT") {
          if (!price || !stopPrice) {
            return res.status(400).json({
              error:
                "price and stopPrice are required for stop/TP limit orders",
            });
          }
          cleanSpotOrder.price = price;
          cleanSpotOrder.stopPrice = stopPrice;
          cleanSpotOrder.timeInForce = tif;
        } else if (type !== "MARKET") {
          return res.status(400).json({
            error: `Unsupported order type for Binance spot: ${type}`,
          });
        }

        result = await binanceService.placeSpotOrder(cleanSpotOrder);
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for orders" });
    }

    // Build response with SL/TP status
    const response: any = {
      success: true,
      order: result,
      accountType: account.accountType,
    };

    // Include SL/TP status if there were any errors
    if (slOrderError || tpOrderError) {
      response.warnings = [];
      if (slOrderError) {
        response.warnings.push({
          type: "sl_failed",
          message: `Stop Loss order failed: ${slOrderError}`,
        });
      }
      if (tpOrderError) {
        response.warnings.push({
          type: "tp_failed",
          message: `Take Profit order failed: ${tpOrderError}`,
        });
      }
    }

    return res.json(response);
  } catch (error: any) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      error: "Failed to place order",
      details: error.message,
    });
  }
});

// PUT /api/orders/modify - Modify an existing order
router.put("/modify", async (req: Request, res: Response) => {
  try {
    const { accountId, orderId, ...orderParams } = req.body;

    if (!accountId || !orderId) {
      return res
        .status(400)
        .json({ error: "accountId and orderId are required" });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    let result;

    if (account.accountType === "kite") {
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      result = await kiteConnectService.modifyOrder(orderId, orderParams);
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.modifyOrder(orderId, orderParams);
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for orders" });
    }

    return res.json({
      success: true,
      order: result,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error modifying order:", error);
    return res.status(500).json({
      error: "Failed to modify order",
      details: error.message,
    });
  }
});

// DELETE /api/orders/:orderId - Cancel an order (RESTful path param version)
router.delete("/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    // Accept accountId and symbol from query string OR request body
    const accountId = (req.query.accountId as string) || req.body?.accountId;
    const symbol = (req.query.symbol as string) || req.body?.symbol;

    if (!accountId || !orderId) {
      return res
        .status(400)
        .json({ error: "accountId and orderId are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    let result;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
      );
      kiteConnectService.setAccessToken(account.accessToken);
      result = await kiteConnectService.cancelOrder(orderId as string);
    } else if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox,
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.cancelOrder(orderId as string);
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      const binanceService = new BinanceService();
      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet,
      );

      if (!symbol) {
        return res
          .status(400)
          .json({ error: "symbol is required for Binance orders" });
      }

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures
        // Try standard cancel first, if fails with -2011 (Unknown order), try algo cancel
        try {
          result = await binanceService.cancelFuturesOrder(
            symbol as string,
            parseInt(orderId as string),
          );
        } catch (standardCancelError: any) {
          // Check if error is "Unknown order sent" (code -2011)
          if (standardCancelError.message?.includes("Unknown order")) {
            console.log("Standard cancel failed, trying Algo Order cancel...");
            result = await binanceService.cancelFuturesAlgoOrder(
              symbol as string,
              parseInt(orderId as string),
            );
          } else {
            throw standardCancelError;
          }
        }
      } else {
        // Spot
        result = await binanceService.cancelSpotOrder(
          symbol as string,
          parseInt(orderId as string),
        );
      }
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for orders" });
    }

    return res.json({
      success: true,
      order: result,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error cancelling order:", error);
    return res.status(500).json({
      error: "Failed to cancel order",
      details: error.message,
    });
  }
});

export default router;
