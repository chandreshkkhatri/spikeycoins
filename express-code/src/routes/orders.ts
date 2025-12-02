import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import binanceService from "../lib/binance-service";
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
        account.apiSecret
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
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);

      try {
        orders = await upstoxService.getOrders();
      } catch (upstoxError: any) {
        // Handle Upstox SDK superagent bug - return empty array for now
        console.warn(
          "Upstox SDK error (known superagent issue):",
          upstoxError.message
        );
        orders = [];
      }
    } else if (account.accountType === "binance") {
      console.log(`[Orders] Binance account ${account._id} metadata:`, account.metadata);
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      console.log(`[Orders] Using trading segment: ${tradingSegment}`);
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Get open orders (can specify symbol if needed)
        orders = await binanceService.getFuturesOpenOrders();
      } else {
        // Spot - Get open orders
        orders = await binanceService.getSpotOpenOrders();
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
    return res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
      details: error.message,
      data: [], // Ensure data is always present
    });
  }
});

// POST /api/orders/place - Place a new order
router.post("/place", async (req: Request, res: Response) => {
  try {
    const { accountId, ...orderParams } = req.body;
    
    console.log("[Orders/Place] Request body:", JSON.stringify(req.body, null, 2));

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId);

    if (!account) {
      console.log("[Orders/Place] Account not found:", accountId);
      return res.status(404).json({ error: "Account not found" });
    }
    
    console.log("[Orders/Place] Account found:", { 
      id: account._id, 
      type: account.accountType, 
      segment: account.metadata?.tradingSegment,
      testnet: account.metadata?.testnet 
    });

    let result;

    if (account.accountType === "kite") {
      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
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
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.placeOrder(orderParams);
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures - Extract special params
        const { leverage, stopLoss, takeProfit, reduceOnly, ...binanceOrderParams } = orderParams;
        
        // Fetch exchange info to get precision
        let quantityPrecision = 0;
        let pricePrecision = 2;
        try {
          const exchangeInfo = await binanceService.getFuturesExchangeInfo();
          const symbolInfo = exchangeInfo.symbols?.find((s: any) => s.symbol === orderParams.symbol);
          if (symbolInfo) {
            quantityPrecision = symbolInfo.quantityPrecision || 0;
            pricePrecision = symbolInfo.pricePrecision || 2;
          }
        } catch (infoError) {
          console.warn("Could not fetch exchange info for precision:", infoError);
        }
        
        // Helper to round to precision
        const roundToPrecision = (value: number, precision: number): number => {
          const factor = Math.pow(10, precision);
          return Math.floor(value * factor) / factor;
        };
        
        // Set leverage if provided
        if (leverage && leverage > 0) {
          try {
            await binanceService.changeFuturesLeverage(orderParams.symbol, leverage);
          } catch (leverageError: any) {
            // Ignore "No need to change leverage" errors
            if (!leverageError.message?.includes("No need to change")) {
              console.warn("Failed to set leverage:", leverageError.message);
            }
          }
        }
        
        // Round quantity and price to correct precision
        const roundedQuantity = roundToPrecision(binanceOrderParams.quantity, quantityPrecision);
        const roundedPrice = binanceOrderParams.price ? roundToPrecision(binanceOrderParams.price, pricePrecision) : undefined;
        
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
        
        // Add reduceOnly if true (but not for initial position orders)
        if (reduceOnly) {
          cleanOrderParams.reduceOnly = true;
        }
        
        console.log("Placing Binance futures order:", cleanOrderParams);
        
        // Place main order
        result = await binanceService.placeFuturesOrder(cleanOrderParams);
        
        // Place stop loss order if provided
        if (stopLoss && stopLoss > 0) {
          try {
            const slSide = orderParams.side === "BUY" ? "SELL" : "BUY";
            const roundedSL = roundToPrecision(stopLoss, pricePrecision);
            await binanceService.placeFuturesOrder({
              symbol: orderParams.symbol,
              side: slSide,
              type: "STOP_MARKET",
              quantity: roundedQuantity,
              stopPrice: roundedSL,
              reduceOnly: true,
            });
          } catch (slError: any) {
            console.warn("Failed to place stop loss order:", slError.message);
            // Don't fail the main order, just log
          }
        }
        
        // Place take profit order if provided
        if (takeProfit && takeProfit > 0) {
          try {
            const tpSide = orderParams.side === "BUY" ? "SELL" : "BUY";
            const roundedTP = roundToPrecision(takeProfit, pricePrecision);
            await binanceService.placeFuturesOrder({
              symbol: orderParams.symbol,
              side: tpSide,
              type: "TAKE_PROFIT_MARKET",
              quantity: roundedQuantity,
              stopPrice: roundedTP,
              reduceOnly: true,
            });
          } catch (tpError: any) {
            console.warn("Failed to place take profit order:", tpError.message);
            // Don't fail the main order, just log
          }
        }
      } else {
        // Spot
        const {
          symbol,
          side,
          type,
          quantity,
          price,
          stopPrice,
          timeInForce,
        } = orderParams;

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
        } else if (
          type === "STOP_LOSS_LIMIT" ||
          type === "TAKE_PROFIT_LIMIT"
        ) {
          if (!price || !stopPrice) {
            return res.status(400).json({
              error: "price and stopPrice are required for stop/TP limit orders",
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

    return res.json({
      success: true,
      order: result,
      accountType: account.accountType,
    });
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
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      result = await kiteConnectService.modifyOrder(orderId, orderParams);
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
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

// DELETE /api/orders/cancel - Cancel an order
router.delete("/cancel", async (req: Request, res: Response) => {
  try {
    const { accountId, orderId, symbol } = req.query;

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
        account.apiSecret
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
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.cancelOrder(orderId as string);
    } else if (account.accountType === "binance") {
      const tradingSegment = account.metadata?.tradingSegment || "spot";
      const isTestnet = account.metadata?.testnet || false;

      binanceService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isTestnet
      );

      if (!symbol) {
        return res
          .status(400)
          .json({ error: "symbol is required for Binance orders" });
      }

      if (tradingSegment === "usdm") {
        // USD(S)-M Futures
        result = await binanceService.cancelFuturesOrder(
          symbol as string,
          parseInt(orderId as string)
        );
      } else {
        // Spot
        result = await binanceService.cancelSpotOrder(
          symbol as string,
          parseInt(orderId as string)
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
