import { Router, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { BinanceService } from "../lib/binance-service";
import pushNotificationService from "../lib/push-notification-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";

const router: Router = Router();

// All orders routes require authentication and account access check
router.use(requireAuth);
router.use(requireAccountAccess);

// GET /api/orders - Get all orders for an account
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const account = req.account!;
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

      const binanceService = new BinanceService();
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
          stopPrice: o.triggerPrice || o.stopPrice,
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
  })
);

// POST /api/orders/place - Place a new order
router.post(
  "/place",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { accountId, ...orderParams } = req.body;
    const account = req.account!;

    console.log(
      "[Orders/Place] Request body:",
      JSON.stringify(req.body, null, 2),
    );

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

        // Helper to round to precision with stepSize awareness
        const roundToPrecision = (
          value: number,
          precision: number,
          stepSizeVal: number = 0
        ): number => {
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
        };

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
          result = await binanceService.placeFuturesAlgoOrder(algoParams);
        } else {
          result = await binanceService.placeFuturesOrder(cleanOrderParams);
        }

        const placeSLTPWithRetry = async (
          orderParams: Record<string, unknown>,
          orderType: string,
          maxRetries: number = 3,
          delayMs: number = 500,
        ): Promise<{ success: boolean; error?: string }> => {
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
        };

        const validateStopPrice = (
          stopPrice: number,
          markPrice: number,
          side: "BUY" | "SELL",
          orderType: "SL" | "TP",
        ): { valid: boolean; error?: string } => {
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
        };

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
              slOrderError = validation.error || "Invalid stop loss price";
              console.warn("Stop loss validation failed:", slOrderError);
            }
          }

          if (!slOrderError) {
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
              slOrderParams,
              "Stop Loss",
            );
            if (!slResult.success) {
              slOrderError = slResult.error || "Unknown error";
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
              tpOrderError = validation.error || "Invalid take profit price";
              console.warn("Take profit validation failed:", tpOrderError);
            }
          }

          if (!tpOrderError) {
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
              tpOrderParams,
              "Take Profit",
            );
            if (!tpResult.success) {
              tpOrderError = tpResult.error || "Unknown error";
            }
          }
        }

        if (slOrderError || tpOrderError) {
          const userId = account.userId;
          if (userId) {
            let notificationType: "sl_failed" | "tp_failed" | "sl_tp_failed";
            if (slOrderError && tpOrderError) {
              notificationType = "sl_tp_failed";
            } else if (slOrderError) {
              notificationType = "sl_failed";
            } else {
              notificationType = "tp_failed";
            }

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

    const response: any = {
      success: true,
      order: result,
      accountType: account.accountType,
    };

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
  })
);

// PUT /api/orders/modify - Modify an existing order
router.put(
  "/modify",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { accountId, orderId, ...orderParams } = req.body;
    const account = req.account!;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
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
  })
);

// DELETE /api/orders/:orderId - Cancel an order (RESTful path param version)
router.delete(
  "/:orderId",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const symbol = (req.query.symbol as string) || req.body?.symbol;
    const account = req.account!;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
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
      result = await kiteConnectService.cancelOrder(orderId);
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
      result = await upstoxService.cancelOrder(orderId);
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
        try {
          result = await binanceService.cancelFuturesOrder(
            symbol,
            parseInt(orderId),
          );
        } catch (standardCancelError: any) {
          if (standardCancelError.message?.includes("Unknown order")) {
            console.log("Standard cancel failed, trying Algo Order cancel...");
            result = await binanceService.cancelFuturesAlgoOrder(
              symbol,
              parseInt(orderId),
            );
          } else {
            throw standardCancelError;
          }
        }
      } else {
        result = await binanceService.cancelSpotOrder(
          symbol,
          parseInt(orderId),
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
  })
);

export default router;
