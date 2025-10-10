import { Router, Request, Response } from "express";
import upstoxService from "../lib/upstox-service";
import { getAccountById } from "../models/account";

const router = Router();

// Upstox-specific endpoints

// GET /api/upstox/market-data/ltp - Get LTP (Last Traded Price)
router.get("/market-data/ltp", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

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

    const instrumentList = (instruments as string).split(",");
    const ltp = await upstoxService.getLTP(instrumentList);

    return res.json({
      success: true,
      data: ltp,
    });
  } catch (error: any) {
    console.error("Error fetching LTP:", error);
    return res.status(500).json({
      error: "Failed to fetch LTP",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/ohlc - Get OHLC data
router.get("/market-data/ohlc", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

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

    const instrumentList = (instruments as string).split(",");
    const ohlc = await upstoxService.getOHLC(instrumentList);

    return res.json({
      success: true,
      data: ohlc,
    });
  } catch (error: any) {
    console.error("Error fetching OHLC:", error);
    return res.status(500).json({
      error: "Failed to fetch OHLC",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/quotes - Get market quotes
router.get("/market-data/quotes", async (req: Request, res: Response) => {
  try {
    const { accountId, instruments } = req.query;

    if (!accountId || !instruments) {
      return res
        .status(400)
        .json({ error: "accountId and instruments are required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

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

    const instrumentList = (instruments as string).split(",");
    const quotes = await upstoxService.getQuote(instrumentList);

    return res.json({
      success: true,
      data: quotes,
    });
  } catch (error: any) {
    console.error("Error fetching quotes:", error);
    return res.status(500).json({
      error: "Failed to fetch quotes",
      details: error.message,
    });
  }
});

export default router;










