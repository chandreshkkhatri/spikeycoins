/**
 * Crypto API Routes
 * Express router for cryptocurrency data endpoints
 */
import { Router } from "express";
import {
  healthCheck,
  tickerHealth,
  get24hrTicker,
  getCandlestickSummary,
  getCandlestickData,
  getTickerBySymbol,
  getStorageStats,
  getDiscoveryStats,
  getMarketCapData,
  getCandlestickStorageStats,
  refreshMarketCapData,
  getMarketOverview,
  forceRefreshMarketOverview,
  getSummaries,
  getUserWatchlists,
  get7dTopMovers,
} from "./routes";

const cryptoRouter = Router();

// Health check
cryptoRouter.get("/", healthCheck);

// Ticker routes
cryptoRouter.get("/ticker", tickerHealth);
cryptoRouter.get("/ticker/24hr", get24hrTicker);
cryptoRouter.get("/ticker/symbol/:symbol", getTickerBySymbol);
cryptoRouter.get("/ticker/candlestick", getCandlestickSummary);
cryptoRouter.get("/ticker/candlestick/:symbol", getCandlestickData);
cryptoRouter.get("/ticker/storage-stats", getStorageStats);
cryptoRouter.get("/ticker/discovery-stats", getDiscoveryStats);
cryptoRouter.get("/ticker/candlestick-storage-stats", getCandlestickStorageStats);
cryptoRouter.get("/ticker/marketCap", getMarketCapData);
cryptoRouter.get("/ticker/refreshMarketcapData", refreshMarketCapData);
cryptoRouter.get("/ticker/7d", get7dTopMovers);

// Market routes
cryptoRouter.get("/market/overview", getMarketOverview);
cryptoRouter.post("/market/overview/refresh", forceRefreshMarketOverview);

// Summaries and watchlists
cryptoRouter.get("/summaries", getSummaries);
cryptoRouter.get("/watchlists", getUserWatchlists);

// Debug routes
import { getMemoryStats } from "./debug";
cryptoRouter.get("/debug/memory", getMemoryStats);

export default cryptoRouter;
