import { Router, Response } from "express";
import { getAccountById } from "../models/account";
import { demoAccountService } from "../lib/demo-account-service";
import axios, { AxiosRequestConfig } from "axios";
import HistoricalDataCache from "../models/historical-data-cache";
import { optionalAuth, AuthenticatedRequest } from "../lib/auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { BrokerFactory } from "../lib/broker-factory";

const router: Router = Router();

// Helper function for retrying requests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchWithRetry = async (
  url: string,
  config: AxiosRequestConfig,
  retries = 3,
  delay = 1000,
) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const isLastAttempt = i === retries - 1;
      if (isLastAttempt) throw error;

      // Don't retry on rate limit errors - makes it worse!
      if (
        error.response?.status === 418 ||
        error.response?.status === 429 ||
        error.response?.data?.code === -1003
      ) {
        throw error;
      }

      // Retry on DNS errors (EAI_AGAIN) or Network errors
      if (
        error.code === "EAI_AGAIN" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT"
      ) {
        console.log(
          `Request failed with ${error.code}, retrying (${i + 1}/${retries})...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i)),
        ); // Exponential backoff
        continue;
      }

      throw error;
    }
  }
  throw new Error("Max retries reached");
};

// GET /api/historical-data - Get historical data for an instrument
router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
      accountId,
      instrumentToken,
      symbol,
      interval,
      fromDate,
      toDate,
      vendor,
      marketType,
    } = req.query;

    let historicalData;

    // Priority 1: Check vendor parameter first (for public APIs like Binance)
    if (vendor === "binance") {
      // Binance uses symbol (e.g., BTCUSDT) instead of instrumentToken
      if (!symbol || !interval) {
        return res.status(400).json({
          error: "symbol and interval are required for Binance",
        });
      }

      // Try to get account preferences, but use defaults if not available
      let tradingSegment = "spot";
      let isTestnet = false;

      const normalizeSegment = (segment?: string | string[]) => {
        if (!segment) return null;
        const value = Array.isArray(segment) ? segment[0] : segment;
        const normalized = value.toLowerCase();
        if (
          normalized.includes("future") ||
          normalized.includes("usdm") ||
          normalized === "futures"
        ) {
          return "usdm";
        }
        if (normalized.includes("spot")) {
          return "spot";
        }
        return null;
      };

      if (accountId) {
        if (!req.user) {
          return res.status(401).json({ error: "Authentication required for account-specific historical data" });
        }
        let account;
        if (demoAccountService.isDemoAccountId(accountId as string)) {
          account = demoAccountService.getDemoAccount(true);
        } else {
          account = await getAccountById(accountId as string);
          if (!account || account.userId !== req.user.id) {
            return res.status(403).json({ error: "Access denied to account" });
          }
        }
        if (account && account.accountType === "binance") {
          tradingSegment = account.metadata?.tradingSegment || "spot";
          isTestnet = account.metadata?.testnet || false;
        }
      }

      const requestedSegment = normalizeSegment(
        marketType as string | string[] | undefined,
      );
      if (requestedSegment) {
        tradingSegment = requestedSegment;
      }

      // Map interval format (1h -> 1h, 1d -> 1d, etc.)
      const binanceInterval = interval as string;
      const symbolUpper = (symbol as string).toUpperCase();

      // Calculate time range
      const startTime = fromDate ? new Date(fromDate as string).getTime() : 0;
      const endTime = toDate ? new Date(toDate as string).getTime() : Date.now();

      // Query for existing cached candles in the requested range
      let cachedCandles: any[] = [];
      try {
        cachedCandles = await HistoricalDataCache.find({
          symbol: symbolUpper,
          interval: binanceInterval,
          marketType: tradingSegment,
          timestamp: { $gte: startTime, $lte: endTime },
        })
          .sort({ timestamp: 1 })
          .lean();

        if (cachedCandles.length > 0) {
          console.log(
            `Found ${cachedCandles.length} cached candles for ${symbolUpper} ${binanceInterval}`
          );
        }
      } catch (cacheErr) {
        console.warn("Cache lookup failed:", cacheErr);
      }

      // Convert cached candles to response format
      const cachedData = cachedCandles.map((c) => ({
        date: new Date(c.timestamp).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      // Helper to parse interval to milliseconds for gap detection
      const parseIntervalMs = (int: string): number => {
        const match = int.match(/^(\d+)([mhHdwM])$/);
        if (!match) return 0;
        const val = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
          case "m": return val * 60 * 1000;
          case "h":
          case "H": return val * 60 * 60 * 1000;
          case "d": return val * 24 * 60 * 60 * 1000;
          case "w": return val * 7 * 24 * 60 * 60 * 1000;
          case "M": return val * 30 * 24 * 60 * 60 * 1000;
          default: return 0;
        }
      };

      // Check for gaps in cached data
      const hasGaps = (candles: any[], intervalMs: number): boolean => {
        if (candles.length < 2 || intervalMs === 0) return false;
        // Allow 10% tolerance for interval variations
        const maxAllowedGap = intervalMs * 1.5;
        for (let i = 1; i < candles.length; i++) {
          const gap = candles[i].timestamp - candles[i - 1].timestamp;
          if (gap > maxAllowedGap) {
            return true;
          }
        }
        return false;
      };

      const intervalMs = parseIntervalMs(binanceInterval);
      const cacheHasGaps = hasGaps(cachedCandles, intervalMs);

      // If we have cached data and it seems complete (no gaps), return it
      if (cachedCandles.length > 0 && !cacheHasGaps) {
        // Check if we need to fetch more recent data (endTime is close to now)
        const latestCachedTime =
          cachedCandles[cachedCandles.length - 1].timestamp;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        // If latest cached candle is recent enough, return cached data
        if (latestCachedTime >= fiveMinutesAgo || endTime < fiveMinutesAgo) {
          return res.json({
            success: true,
            data: cachedData,
            accountType: "binance",
            cached: true,
          });
        }
      }

      try {
        let apiUrl: string;
        if (tradingSegment === "usdm") {
          // USD(S)-M Futures
          apiUrl = isTestnet
            ? "https://testnet.binancefuture.com/fapi/v1/klines"
            : "https://fapi.binance.com/fapi/v1/klines";
        } else {
          // Spot
          apiUrl = isTestnet
            ? "https://testnet.binance.vision/api/v3/klines"
            : "https://api.binance.com/api/v3/klines";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any = {
          symbol: symbolUpper,
          interval: binanceInterval,
          limit: 1000, // Fetch up to 1000 candles per request
        };

        if (fromDate) {
          params.startTime = new Date(fromDate as string).getTime();
        }
        if (toDate) {
          params.endTime = new Date(toDate as string).getTime();
        }

        const response = await fetchWithRetry(apiUrl, { params });

        // Convert Binance klines format to standard format
        // Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        historicalData = response.data.map((candle: any[]) => ({
          date: new Date(candle[0]).toISOString(), // Convert timestamp to ISO date string
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));

        // Save individual candles to cache - use insertMany with ordered:false to ignore duplicates
        const candlesToInsert = response.data.map((candle: any[]) => ({
          symbol: symbolUpper,
          interval: binanceInterval,
          marketType: tradingSegment,
          timestamp: candle[0], // openTime in ms
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }));

        // Insert candles, ignoring duplicates (ordered: false continues on error)
        HistoricalDataCache.insertMany(candlesToInsert, { ordered: false }).catch(
          (err) => {
            // Ignore duplicate key errors (code 11000), log others
            if (err.code !== 11000 && !err.message?.includes("duplicate key")) {
              console.warn("Cache save failed:", err.message);
            }
          }
        );

        return res.json({
          success: true,
          data: historicalData,
          accountType: "binance",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error(
          "Error fetching Binance historical data:",
          error.response?.data || error.message
        );

        // Handle rate limiting (418 "I'm a teapot" or 429)
        const isRateLimit =
          error.response?.status === 418 ||
          error.response?.status === 429 ||
          error.response?.data?.code === -1003;

        if (isRateLimit) {
          const retryAfter = error.response?.headers?.["retry-after"];
          return res.status(429).json({
            error: "Rate limited by Binance",
            retryAfter: retryAfter ? parseInt(retryAfter) : 60,
            details: "Too many requests. Please wait before retrying.",
          });
        }

        // Handle invalid symbol
        const binanceCode = error?.response?.data?.code;
        const binanceMessage = error?.response?.data?.msg;
        const isInvalidSymbol =
          binanceCode === -1121 ||
          (typeof binanceMessage === "string" &&
            binanceMessage.toLowerCase().includes("invalid symbol"));

        if (isInvalidSymbol) {
          return res.status(400).json({
            error: "Symbol not supported on Binance",
            details: binanceMessage || "Invalid symbol",
          });
        }

        return res.status(500).json({
          error: "Failed to fetch historical data from Binance",
          details: error.message,
        });
      }
    }

    // Priority 2: For other vendors, require accountId and check account type
    if (!accountId || !interval) {
      return res.status(400).json({
        error: "accountId and interval are required",
      });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Authentication required for account-specific historical data" });
    }

    let account;
    if (demoAccountService.isDemoAccountId(accountId as string)) {
      account = demoAccountService.getDemoAccount(true);
      if (!account) {
        return res.status(500).json({ error: "Demo account not configured" });
      }
    } else {
      account = await getAccountById(accountId as string);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied to account" });
      }
    }

    if (account.accountType === "upstox") {
      // Resolve instrumentToken from symbol if not provided
      let resolvedInstrumentToken = instrumentToken as string | undefined;

      if (!resolvedInstrumentToken && symbol) {
        const symbolStr = (symbol as string).toUpperCase();
        if (symbolStr.includes("|")) {
          // Already a fully qualified instrument token
          resolvedInstrumentToken = symbolStr;
        } else {
          // Map common index symbols to Upstox format (with proper casing)
          // Include variants with and without spaces to handle different frontend inputs
          const indexMapping: Record<string, string> = {
            NIFTY: "NSE_INDEX|Nifty 50",
            "NIFTY 50": "NSE_INDEX|Nifty 50",
            NIFTY50: "NSE_INDEX|Nifty 50",
            BANKNIFTY: "NSE_INDEX|Nifty Bank",
            "BANK NIFTY": "NSE_INDEX|Nifty Bank",
            "NIFTY BANK": "NSE_INDEX|Nifty Bank",
            NIFTYBANK: "NSE_INDEX|Nifty Bank",
            FINNIFTY: "NSE_INDEX|Nifty Fin Service",
            "FIN NIFTY": "NSE_INDEX|Nifty Fin Service",
            "NIFTY FIN SERVICE": "NSE_INDEX|Nifty Fin Service",
            MIDCPNIFTY: "NSE_INDEX|NIFTY MID SELECT",
            "MIDCP NIFTY": "NSE_INDEX|NIFTY MID SELECT",
            "NIFTY MID SELECT": "NSE_INDEX|NIFTY MID SELECT",
            SENSEX: "BSE_INDEX|SENSEX",
          };

          // Check if it's a known index
          if (indexMapping[symbolStr]) {
            resolvedInstrumentToken = indexMapping[symbolStr];
          } else {
            // Map marketType to appropriate exchange for non-index symbols
            const marketTypeStr = (marketType as string)?.toLowerCase() || "";
            let exchange = "NSE_EQ"; // default

            if (
              marketTypeStr.includes("future") ||
              marketTypeStr === "futures"
            ) {
              // For futures on indices, use index data instead (futures need full contract ID)
              if (
                [
                  "NIFTY",
                  "NIFTY50",
                  "BANKNIFTY",
                  "NIFTYBANK",
                  "FINNIFTY",
                ].includes(symbolStr)
              ) {
                resolvedInstrumentToken =
                  indexMapping[symbolStr] || `NSE_INDEX|${symbolStr}`;
              } else {
                exchange = "NSE_FO";
                resolvedInstrumentToken = `${exchange}|${symbolStr}`;
              }
            } else if (marketTypeStr.includes("index")) {
              exchange = "NSE_INDEX";
              resolvedInstrumentToken = `${exchange}|${symbolStr}`;
            } else if (marketTypeStr.includes("option")) {
              exchange = "NSE_FO";
              resolvedInstrumentToken = `${exchange}|${symbolStr}`;
            } else if (
              marketTypeStr.includes("commodity") ||
              marketTypeStr === "mcx"
            ) {
              exchange = "MCX_FO";
              resolvedInstrumentToken = `${exchange}|${symbolStr}`;
            } else {
              resolvedInstrumentToken = `${exchange}|${symbolStr}`;
            }
          }
        }
      }

      if (!resolvedInstrumentToken) {
        return res.status(400).json({
          error: "instrumentToken or symbol is required for Upstox accounts",
        });
      }

      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }

      // Map common interval formats to Upstox accepted intervals
      // Upstox only supports: 1minute, 30minute, day, week, month
      // Strategy: Use the closest LOWER interval to avoid data loss
      // Note: Frontend may receive more granular data than requested
      const intervalStr = (interval as string).toLowerCase();
      let upstoxInterval: string;
      let intervalMismatch = false;

      if (intervalStr === "1m" || intervalStr === "1minute") {
        upstoxInterval = "1minute";
      } else if (
        intervalStr === "5m" ||
        intervalStr === "15m"
      ) {
        // Use 1minute for sub-30m intervals (more granular than requested)
        upstoxInterval = "1minute";
        intervalMismatch = true;
      } else if (intervalStr === "30m" || intervalStr === "30minute") {
        upstoxInterval = "30minute";
      } else if (
        intervalStr === "1h" ||
        intervalStr === "2h" ||
        intervalStr === "60m"
      ) {
        // Use 30minute for hourly intervals (closest lower interval)
        upstoxInterval = "30minute";
        intervalMismatch = true;
      } else if (
        intervalStr === "4h" ||
        intervalStr === "6h" ||
        intervalStr === "8h" ||
        intervalStr === "12h"
      ) {
        // For multi-hour intervals, day is often more practical than many 30m candles
        // but 30minute gives more precision - use day for 4h+ as compromise
        upstoxInterval = "day";
        intervalMismatch = true;
      } else if (intervalStr === "1d" || intervalStr === "day") {
        upstoxInterval = "day";
      } else if (intervalStr === "3d") {
        upstoxInterval = "day";
        intervalMismatch = true;
      } else if (intervalStr === "1w" || intervalStr === "week") {
        upstoxInterval = "week";
      } else if (
        intervalStr === "1m" ||
        intervalStr.toLowerCase() === "month"
      ) {
        upstoxInterval = "month";
      } else {
        upstoxInterval = "day"; // default fallback
        intervalMismatch = true;
      }

      const upstoxClient = BrokerFactory.getUpstoxClient(account);
      const rawCandles = await upstoxClient.getHistoricalData(
        resolvedInstrumentToken,
        upstoxInterval,
        (toDate as string) || new Date().toISOString().split("T")[0],
        fromDate as string,
      );

      // Transform Upstox candle format to standard format
      // Upstox format: [timestamp, open, high, low, close, volume, oi]
      historicalData = (rawCandles || [])
        .filter(
          (candle: any[]) =>
            Array.isArray(candle) && candle.length >= 5 && candle[0],
        )
        .map((candle: any[]) => ({
          date:
            typeof candle[0] === "string"
              ? candle[0]
              : new Date(candle[0]).toISOString(),
          open: parseFloat(candle[1]) || 0,
          high: parseFloat(candle[2]) || 0,
          low: parseFloat(candle[3]) || 0,
          close: parseFloat(candle[4]) || 0,
          volume: parseFloat(candle[5]) || 0,
        }))
        .filter((d: any) => !isNaN(new Date(d.date).getTime()))
        .sort(
          (a: any, b: any) =>
            new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      // Return Upstox response with interval mismatch info
      return res.json({
        success: true,
        data: historicalData,
        accountType: account.accountType,
        ...(intervalMismatch && {
          intervalMismatch: true,
          actualInterval: upstoxInterval,
        }),
      });
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported account type for historical data" });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error fetching historical data:", error);
      return res.status(500).json({
        error: "Failed to fetch historical data",
        details: error.message,
      });
    }
  })
);

export default router;
