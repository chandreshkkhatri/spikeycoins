/**
 * BinanceClient
 * Handles WebSocket connections and efficient candlestick data fetching
 * Optimized to minimize API calls while maintaining data freshness
 */
import WebSocket from "ws";
import axios from "axios";
import logger from "../utils/logger";
import DataManager from "./DataManager";
import MarketCapService from "../services/MarketCapService";
import CandlestickStorage from "../services/CandlestickStorage";

class BinanceClient {
  private tickerWs: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  
  // Candlestick fetching configuration
  private candlestickFetchInterval: NodeJS.Timeout | null = null;
  private currentSymbolIndex: number = 0;
  private symbolsToTrack: string[] = [];
  private isFetching: boolean = false;
  
  // Rate limiting configuration
  private readonly CANDLES_TO_FETCH = 288; // 24 hours of 5m candles
  private readonly UPDATE_CYCLE_MINUTES = 5; // Complete cycle every 5 minutes
  private readonly FETCH_DELAY_MS = 100; // 100ms between requests = 10 req/sec

  /**
   * Start all connections
   */
  async start(): Promise<void> {
    logger.info("BinanceClient: Starting connections...");
    
    // Initialize services
    await MarketCapService.initialize();
    CandlestickStorage.initialize();
    
    // Start ticker stream
    this.connectTickerStream();
    
    // Wait for initial ticker data, then start candlestick fetching
    setTimeout(() => {
      this.startCandlestickFetching();
    }, 5000);
  }

  /**
   * Connect to Binance 24hr ticker stream
   */
  private connectTickerStream(): void {
    const wsUrl = 'wss://stream.binance.com:9443/ws/!ticker@arr';
    
    this.tickerWs = new WebSocket(wsUrl);
    
    this.tickerWs.on('open', () => {
      logger.info("BinanceClient: Ticker WebSocket connected");
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });
    
    this.tickerWs.on('message', (data: Buffer) => {
      try {
        const tickerArray = JSON.parse(data.toString());
        if (Array.isArray(tickerArray)) {
          DataManager.updateTickers(tickerArray);
        }
      } catch (error) {
        logger.error("BinanceClient: Error processing ticker data:", error);
      }
    });
    
    this.tickerWs.on('close', () => {
      logger.warn("BinanceClient: Ticker WebSocket disconnected");
      this.isConnected = false;
      this.handleReconnect();
    });
    
    this.tickerWs.on('error', (error) => {
      logger.error("BinanceClient: Ticker WebSocket error:", error);
    });
  }

  /**
   * Start the candlestick fetching process
   */
  private async startCandlestickFetching(): Promise<void> {
    // Initial fetch for all symbols
    await this.updateSymbolsList();
    await this.fetchAllSymbolsOnce();
    
    // Start the continuous rotation
    this.startContinuousRotation();
  }

  /**
   * Update the list of symbols to track
   */
  private async updateSymbolsList(): Promise<void> {
    // Get active symbols from DataManager
    const activeSymbols = DataManager.getActiveSymbols();
    
    // Get top symbols by market cap
    const topMarketCapSymbols = MarketCapService.getTopSymbolsByMarketCap(200);
    
    // Combine and deduplicate
    const allSymbols = new Set([...activeSymbols, ...topMarketCapSymbols]);
    
    // Sort by volume (prioritize high-volume pairs)
    this.symbolsToTrack = Array.from(allSymbols)
      .filter(symbol => symbol.endsWith('USDT'))
      .sort((a, b) => {
        const tickerA = DataManager.getTickerBySymbol(a);
        const tickerB = DataManager.getTickerBySymbol(b);
        const volA = tickerA?.volume_usd || 0;
        const volB = tickerB?.volume_usd || 0;
        return volB - volA;
      });
    
    logger.info(`BinanceClient: Tracking ${this.symbolsToTrack.length} symbols for candlestick data`);
  }

  /**
   * Fetch candlestick data for all symbols once (initial load)
   */
  private async fetchAllSymbolsOnce(): Promise<void> {
    logger.info(`BinanceClient: Starting initial candlestick fetch for ${this.symbolsToTrack.length} symbols`);
    
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < this.symbolsToTrack.length; i++) {
      const symbol = this.symbolsToTrack[i];
      
      // Check if we already have recent data
      if (await CandlestickStorage.hasRecentData(symbol, 30)) {
        continue;
      }
      
      try {
        await this.fetchCandlesticksForSymbol(symbol);
        successCount++;
        
        // Log progress every 50 symbols
        if ((i + 1) % 50 === 0) {
          logger.info(`BinanceClient: Fetched ${i + 1}/${this.symbolsToTrack.length} symbols`);
        }
      } catch (error) {
        errorCount++;
        if (errorCount < 5) { // Log first few errors only
          logger.error(`BinanceClient: Error fetching ${symbol}:`, error);
        }
      }
      
      // Rate limiting: wait between requests
      await new Promise(resolve => setTimeout(resolve, this.FETCH_DELAY_MS));
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`BinanceClient: Initial fetch complete. Success: ${successCount}, Errors: ${errorCount}, Duration: ${duration}s`);
  }

  /**
   * Start continuous rotation through symbols
   */
  private startContinuousRotation(): void {
    // Calculate how often to fetch based on desired cycle time
    const totalSymbols = this.symbolsToTrack.length;
    const secondsPerCycle = this.UPDATE_CYCLE_MINUTES * 60;
    const delayBetweenFetches = Math.max(
      (secondsPerCycle * 1000) / totalSymbols,
      this.FETCH_DELAY_MS
    );
    
    logger.info(`BinanceClient: Starting continuous rotation. ${totalSymbols} symbols, ${delayBetweenFetches}ms between fetches`);
    
    this.candlestickFetchInterval = setInterval(async () => {
      if (this.isFetching) return; // Skip if previous fetch is still running
      
      this.isFetching = true;
      
      try {
        // Update symbols list periodically
        if (this.currentSymbolIndex === 0) {
          await this.updateSymbolsList();
        }
        
        // Fetch next symbol
        if (this.symbolsToTrack.length > 0) {
          const symbol = this.symbolsToTrack[this.currentSymbolIndex];
          
          try {
            await this.fetchCandlesticksForSymbol(symbol);
          } catch (error) {
            // Silently skip individual symbol errors
          }
          
          // Move to next symbol
          this.currentSymbolIndex = (this.currentSymbolIndex + 1) % this.symbolsToTrack.length;
          
          // Log progress periodically
          if (this.currentSymbolIndex === 0) {
            const stats = await CandlestickStorage.getStats();
            logger.info(`BinanceClient: Completed cycle. ${stats.symbolCount} symbols stored, ${stats.symbolsWithFullData} with full data`);
          }
        }
      } finally {
        this.isFetching = false;
      }
    }, delayBetweenFetches);
  }

  /**
   * Fetch candlestick data for a single symbol
   */
  private async fetchCandlesticksForSymbol(symbol: string): Promise<void> {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = {
      symbol,
      interval: '5m',
      limit: this.CANDLES_TO_FETCH
    };
    
    const response = await axios.get(url, { 
      params, 
      timeout: 5000,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    if (response.status === 200 && response.data && Array.isArray(response.data)) {
      await CandlestickStorage.storeCandlesticks(symbol, response.data);
    } else if (response.status === 429) {
      // Rate limited - slow down
      logger.warn('BinanceClient: Rate limited, slowing down');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("BinanceClient: Max reconnection attempts reached");
      return;
    }

    // Clean up old connection to prevent memory leaks
    if (this.tickerWs) {
      try {
        this.tickerWs.removeAllListeners();
        this.tickerWs.terminate();
      } catch (err) {
        logger.error("BinanceClient: Error terminating WebSocket:", err);
      }
      this.tickerWs = null;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    logger.info(`BinanceClient: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectTickerStream();
    }, delay);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      candlestickData: {
        symbolsTracked: this.symbolsToTrack.length,
        currentIndex: this.currentSymbolIndex,
        // Note: MongoDB stats are async, use the stats endpoint instead
      }
    };
  }

  /**
   * Cleanup connections
   */
  cleanup(): void {
    if (this.candlestickFetchInterval) {
      clearInterval(this.candlestickFetchInterval);
    }
    
    if (this.tickerWs) {
      this.tickerWs.close();
    }
    
    CandlestickStorage.cleanup();
    
    logger.info("BinanceClient: Cleaned up all connections");
  }
}

export default BinanceClient;