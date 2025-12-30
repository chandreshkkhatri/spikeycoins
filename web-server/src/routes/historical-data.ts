import { Router, Request, Response } from "express";
import kiteConnectService from "../lib/kiteconnect-service";
import upstoxService from "../lib/upstox-service";
import { getAccountById } from "../models/account";
import axios, { AxiosRequestConfig } from "axios";

const router = Router();

// Helper function for retrying requests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchWithRetry = async (
  url: string,
  config: AxiosRequestConfig,
  retries = 3,
  delay = 1000
) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const isLastAttempt = i === retries - 1;
      if (isLastAttempt) throw error;

      // Retry on DNS errors (EAI_AGAIN) or Network errors
      if (
        error.code === "EAI_AGAIN" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT"
      ) {
        console.log(
          `Request failed with ${error.code}, retrying (${i + 1}/${retries})...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, i))
        ); // Exponential backoff
        continue;
      }

      throw error;
    }
  }
  throw new Error("Max retries reached");
};

// GET /api/historical-data - Get historical data for an instrument
router.get("/", async (req: Request, res: Response) => {
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
        if (normalized.includes("future") || normalized.includes("usdm") || normalized === "futures") {
          return "usdm";
        }
        if (normalized.includes("spot")) {
          return "spot";
        }
        return null;
      };

      if (accountId) {
        try {
          const account = await getAccountById(accountId as string);
          if (account && account.accountType === "binance") {
            tradingSegment = account.metadata?.tradingSegment || "spot";
            isTestnet = account.metadata?.testnet || false;
          }
        } catch (err) {
          // Account not found or error - use defaults
          console.log("Using default Binance settings (spot, production)");
        }
      }

      const requestedSegment = normalizeSegment(
        marketType as string | string[] | undefined
      );
      if (requestedSegment) {
        tradingSegment = requestedSegment;
      }

      // Map interval format (1h -> 1h, 1d -> 1d, etc.)
      const binanceInterval = interval as string;

      // Calculate time range (default: last 100 candles)
      const limit = 100;

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
          symbol: (symbol as string)?.toUpperCase(),
          interval: binanceInterval,
          limit,
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

        return res.json({
          success: true,
          data: historicalData,
          accountType: "binance",
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error("Error fetching Binance historical data:", error);

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

    const account = await getAccountById(accountId as string);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (account.accountType === "kite") {
      if (!instrumentToken) {
        return res.status(400).json({
          error: "instrumentToken is required for Kite accounts",
        });
      }

      if (!account.accessToken) {
        return res.status(401).json({ error: "Account not authenticated" });
      }

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
      // Resolve instrumentToken from symbol if not provided
      let resolvedInstrumentToken = instrumentToken as string | undefined;

      if (!resolvedInstrumentToken && symbol) {
        const symbolStr = (symbol as string).toUpperCase();
        if (symbolStr.includes("|")) {
          // Already a fully qualified instrument token
          resolvedInstrumentToken = symbolStr;
        } else {
          // Map common index symbols to Upstox format (with proper casing)
          const indexMapping: Record<string, string> = {
            "NIFTY": "NSE_INDEX|Nifty 50",
            "NIFTY50": "NSE_INDEX|Nifty 50",
            "BANKNIFTY": "NSE_INDEX|Nifty Bank",
            "NIFTYBANK": "NSE_INDEX|Nifty Bank",
            "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
            "MIDCPNIFTY": "NSE_INDEX|NIFTY MID SELECT",
            "SENSEX": "BSE_INDEX|SENSEX",
          };

          // Check if it's a known index
          if (indexMapping[symbolStr]) {
            resolvedInstrumentToken = indexMapping[symbolStr];
          } else {
            // Map marketType to appropriate exchange for non-index symbols
            const marketTypeStr = (marketType as string)?.toLowerCase() || "";
            let exchange = "NSE_EQ"; // default

            if (marketTypeStr.includes("future") || marketTypeStr === "futures") {
              // For futures on indices, use index data instead (futures need full contract ID)
              if (["NIFTY", "NIFTY50", "BANKNIFTY", "NIFTYBANK", "FINNIFTY"].includes(symbolStr)) {
                resolvedInstrumentToken = indexMapping[symbolStr] || `NSE_INDEX|${symbolStr}`;
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
            } else if (marketTypeStr.includes("commodity") || marketTypeStr === "mcx") {
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
      // Upstox accepts: 1minute, 30minute, day, week, month
      const intervalStr = (interval as string).toLowerCase();
      let upstoxInterval: string;

      if (intervalStr === "1m" || intervalStr === "5m" || intervalStr === "1minute") {
        upstoxInterval = "1minute";
      } else if (intervalStr === "15m" || intervalStr === "30m" || intervalStr === "30minute") {
        upstoxInterval = "30minute";
      } else if (intervalStr === "1h" || intervalStr === "4h" || intervalStr === "60m") {
        upstoxInterval = "30minute"; // closest available
      } else if (intervalStr === "1d" || intervalStr === "day") {
        upstoxInterval = "day";
      } else if (intervalStr === "1w" || intervalStr === "week") {
        upstoxInterval = "week";
      } else if (intervalStr === "1M" || intervalStr.toLowerCase() === "month") {
        upstoxInterval = "month";
      } else {
        upstoxInterval = "day"; // default fallback
      }

      const isSandbox = account.metadata?.sandbox || false;
      upstoxService.initializeWithCredentials(
        account.apiKey,
        account.apiSecret,
        isSandbox
      );
      upstoxService.setAccessToken(account.accessToken);
      const rawCandles = await upstoxService.getHistoricalData(
        resolvedInstrumentToken,
        upstoxInterval,
        (toDate as string) || new Date().toISOString().split("T")[0],
        fromDate as string
      );

      // Transform Upstox candle format to standard format
      // Upstox format: [timestamp, open, high, low, close, volume, oi]
      historicalData = (rawCandles || [])
        .filter((candle: any[]) => Array.isArray(candle) && candle.length >= 5 && candle[0])
        .map((candle: any[]) => ({
          date: typeof candle[0] === 'string' ? candle[0] : new Date(candle[0]).toISOString(),
          open: parseFloat(candle[1]) || 0,
          high: parseFloat(candle[2]) || 0,
          low: parseFloat(candle[3]) || 0,
          close: parseFloat(candle[4]) || 0,
          volume: parseFloat(candle[5]) || 0,
        }))
        .filter((d: any) => !isNaN(new Date(d.date).getTime()))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Error fetching historical data:", error);
    return res.status(500).json({
      error: "Failed to fetch historical data",
      details: error.message,
    });
  }
});

export default router;
