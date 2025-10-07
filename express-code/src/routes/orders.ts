import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
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

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    let orders;

    if (account.accountType === "kite") {
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      orders = await kiteConnectService.getOrders();
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      orders = await upstoxService.getOrders();
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for orders" });
    }

    return res.json({
      success: true,
      orders,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({
      error: "Failed to fetch orders",
      details: error.message,
    });
  }
});

// POST /api/orders/place - Place a new order
router.post("/place", async (req: Request, res: Response) => {
  try {
    const { accountId, ...orderParams } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
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
      result = await kiteConnectService.placeOrder(orderParams);
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.placeOrder(orderParams);
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
    const { accountId, orderId } = req.query;

    if (!accountId || !orderId) {
      return res
        .status(400)
        .json({ error: "accountId and orderId are required" });
    }

    const account = await getAccountById(accountId as string);

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
      result = await kiteConnectService.cancelOrder(orderId as string);
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      result = await upstoxService.cancelOrder(orderId as string);
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
