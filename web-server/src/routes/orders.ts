import { Router, Response } from "express";
import pushNotificationService from "../lib/push-notification-service";
import { requireAuth, requireAccountAccess, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";
import { placeFuturesOrderWithRisk } from "../lib/binance-futures-order.service";
import { UpstoxOrder, UpstoxPlaceOrderParams, UpstoxModifyOrderParams } from "../lib/upstox-types";

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

    if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const upstoxClient = BrokerFactory.getUpstoxClient(account);
      try {
        orders = await upstoxClient.getOrders();
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

      const binanceService = BrokerFactory.getBinanceClient(account);

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
      ? orders.map((order: UpstoxOrder) => ({
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
    const orderParams = { ...req.body };
    delete orderParams.accountId;
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

    if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const upstoxClient = BrokerFactory.getUpstoxClient(account);
      result = await upstoxClient.placeOrder(orderParams as UpstoxPlaceOrderParams);
    } else if (account.accountType === "binance") {
      // Detect trading segment from metadata, or infer from order params
      // If leverage, stopLoss, or takeProfit is set, it's a futures order
      const hasFuturesParams =
        orderParams.leverage || orderParams.stopLoss || orderParams.takeProfit;
      const tradingSegment =
        account.metadata?.tradingSegment ||
        (hasFuturesParams ? "usdm" : "spot");

      console.log(
        `[Orders/Place] Detected trading segment: ${tradingSegment} (metadata: ${account.metadata?.tradingSegment}, hasFuturesParams: ${hasFuturesParams})`,
      );

      const binanceService = BrokerFactory.getBinanceClient(account);

      if (tradingSegment === "usdm") {
        const { order, slError, tpError, roundedQuantity } = await placeFuturesOrderWithRisk(
          binanceService,
          orderParams
        );
        result = order;
        slOrderError = slError;
        tpOrderError = tpError;

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
                quantity: roundedQuantity,
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
    const { orderId } = req.body;
    const orderParams = { ...req.body };
    delete orderParams.accountId;
    delete orderParams.orderId;
    const account = req.account!;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    let result;

    if (account.accountType === "upstox") {
      const upstoxClient = BrokerFactory.getUpstoxClient(account);
      result = await upstoxClient.modifyOrder(orderId, orderParams as UpstoxModifyOrderParams);
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

    if (account.accountType === "upstox") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      const upstoxClient = BrokerFactory.getUpstoxClient(account);
      result = await upstoxClient.cancelOrder(orderId);
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";

      const binanceService = BrokerFactory.getBinanceClient(account);

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
