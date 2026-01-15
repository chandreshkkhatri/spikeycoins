/**
 * Crypto Module Initialization
 * Initializes all crypto-related services and background processes
 */
import BinanceClient from "./core/BinanceClient";
import DatabaseConnection from "./services/DatabaseConnection";
import MarketOverviewService from "./services/MarketOverviewService";
import DailyCandlestickService from "./services/DailyCandlestickService";
import PriceHistoryService from "./services/PriceHistoryService";
import CoinGeckoSyncService from "./services/CoinGeckoSyncService";
import MarketCapService from "./services/MarketCapService";
import { setBinanceClient } from "./routes/routes";
import logger from "./utils/logger";

let binanceClient: BinanceClient | null = null;

/**
 * Initialize all crypto services
 */
export async function initializeCryptoServices(): Promise<void> {
  logger.info("CryptoModule: Starting initialization...");

  try {
    // Initialize database connection
    logger.info("CryptoModule: Initializing database connection...");
    await DatabaseConnection.initialize();

    // Initialize Binance client (WebSocket + REST)
    logger.info("CryptoModule: Starting Binance client...");
    binanceClient = new BinanceClient();
    setBinanceClient(binanceClient);
    await binanceClient.start();

    // Initialize Market Overview Service (30s updates)
    logger.info("CryptoModule: Starting Market Overview service...");
    MarketOverviewService.getInstance();

    // Initialize Daily Candlestick Service (for 7d calculations)
    logger.info("CryptoModule: Starting Daily Candlestick service...");
    await DailyCandlestickService.getInstance().start();

    // Initialize Price History Service (hourly snapshots)
    logger.info("CryptoModule: Starting Price History service...");
    PriceHistoryService.getInstance().start();

    // Initialize CoinGecko Sync Service (market cap data, every 2 hours)
    logger.info("CryptoModule: Starting CoinGecko sync service...");
    await CoinGeckoSyncService.getInstance().initialize();

    // Initialize Market Cap Service (data cache)
    logger.info("CryptoModule: Starting Market Cap service...");
    await MarketCapService.initialize();

    logger.info("CryptoModule: All services initialized successfully");
  } catch (error) {
    logger.error("CryptoModule: Failed to initialize services:", error);
    throw error;
  }
}

/**
 * Cleanup all crypto services
 */
export async function cleanupCryptoServices(): Promise<void> {
  logger.info("CryptoModule: Cleaning up services...");

  if (binanceClient) {
    binanceClient.cleanup();
  }

  MarketOverviewService.getInstance().cleanup();
  DailyCandlestickService.getInstance().stop();
  PriceHistoryService.getInstance().stop();
  CoinGeckoSyncService.getInstance().cleanup();

  await DatabaseConnection.cleanup();

  logger.info("CryptoModule: Cleanup completed");
}

export { default as cryptoRouter } from "./routes/crypto";
