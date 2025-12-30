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
      isSandbox,
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
      isSandbox,
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
      isSandbox,
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

// GET /api/upstox/market-data/authorize - Authorize WebSocket
router.get("/market-data/authorize", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    const account = await getAccountById(accountId as string);

    if (!account || account.accountType !== "upstox") {
      return res.status(404).json({ error: "Upstox account not found" });
    }

    if (!account.accessToken) {
      return res.status(401).json({ error: "Account not authenticated" });
    }

    // Upstox V3 Market Data Feed URL
    // Use sandbox URL for sandbox accounts
    const isSandbox = account.metadata?.sandbox || false;
    const baseUrl = isSandbox
      ? "wss://api-sandbox.upstox.com/v2/feed/market-data-feed"
      : "wss://api.upstox.com/v2/feed/market-data-feed";
    const wsUrl = `${baseUrl}?response_type=json`;

    // We append the access token as a query parameter since browser WebSocket implementation
    // doesn't support custom headers
    const urlWithToken = `${wsUrl}&access_token=${account.accessToken}`;

    return res.json({
      success: true,
      url: urlWithToken,
    });
  } catch (error: any) {
    console.error("Error authorizing Upstox WebSocket:", error);
    return res.status(500).json({
      error: "Failed to authorize WebSocket",
      details: error.message,
    });
  }
});

// POST /api/upstox/instruments/resolve - Resolve symbols to instrument keys
router.post("/instruments/resolve", async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: "symbols array is required" });
    }

    const mappings = await upstoxService.resolveInstruments(symbols);

    return res.json({
      success: true,
      mappings,
    });
  } catch (error: any) {
    console.error("Error resolving instruments:", error);
    return res.status(500).json({
      error: "Failed to resolve instruments",
      details: error.message,
    });
  }
});

// GET /api/upstox/market-data/proto - Get Protobuf schema
router.get("/market-data/proto", async (req: Request, res: Response) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // Try to find the proto file in potential locations
    const possiblePaths = [
      path.join(process.cwd(), "src", "proto", "MarketDataFeed.proto"),
      path.join(process.cwd(), "proto", "MarketDataFeed.proto"),
      path.join(__dirname, "../../src/proto/MarketDataFeed.proto"),
    ];

    let protoPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        protoPath = p;
        break;
      }
    }

    if (!protoPath) {
      console.error("Proto file not found in paths:", possiblePaths);
      return res.status(404).json({ error: "Proto definition not found" });
    }

    const content = fs.readFileSync(protoPath, "utf-8");
    res.setHeader("Content-Type", "text/plain");
    return res.send(content);
  } catch (error: any) {
    console.error("Error serving proto file:", error);
    return res.status(500).json({
      error: "Failed to serve proto file",
      details: error.message,
    });
  }
});

export default router;
