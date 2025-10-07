import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { getAccountById } from "../models/account";

const router = Router();

// GET /api/historical-data - Get historical data for an instrument
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId, instrumentToken, interval, fromDate, toDate } =
      req.query;

    if (!accountId || !instrumentToken || !interval) {
      return res.status(400).json({
        error: "accountId, instrumentToken, and interval are required",
      });
    }

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    let historicalData;

    if (account.accountType === "kite") {
      kiteConnectService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret
      );
      kiteConnectService.setAccessToken(account.accessToken);
      historicalData = await kiteConnectService.getHistoricalData(
        instrumentToken as string,
        interval as string,
        (fromDate as string) ||
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        (toDate as string) || new Date().toISOString(),
        false
      );
    } else if (account.accountType === "upstox") {
      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      historicalData = await upstoxService.getHistoricalData(
        instrumentToken as string,
        interval as string,
        (toDate as string) || new Date().toISOString().split("T")[0],
        fromDate as string
      );
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for historical data" });
    }

    return res.json({
      success: true,
      data: historicalData,
      accountType: account.accountType,
    });
  } catch (error: any) {
    console.error("Error fetching historical data:", error);
    return res.status(500).json({
      error: "Failed to fetch historical data",
      details: error.message,
    });
  }
});

export default router;
