/**
 * Binance Price Service
 * Server-side WebSocket connection to Binance for caching price data
 * This enables initial price loading on page refresh
 */

import WebSocket from "ws";

interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  timestamp: number;
}

type PriceUpdateCallback = (symbol: string, data: TickerData) => void;

class BinancePriceService {
  private ws: WebSocket | null = null;
  private priceCache: Map<string, TickerData> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private isConnecting = false;
  private subscribers: Set<PriceUpdateCallback> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  // Memory limits to prevent heap overflow
  private readonly MAX_CACHE_SIZE = 500;
  private readonly MIN_VOLUME_THRESHOLD = 1000; // Minimum quote volume in USDT

  // Binance Futures WebSocket URL for all tickers stream
  private readonly WS_URL = "wss://fstream.binance.com/ws/!ticker@arr";

  /**
   * Start the WebSocket connection to Binance
   */
  start(): void {
    if (this.ws || this.isConnecting) {
      console.log("[BinancePriceService] Already connected or connecting");
      return;
    }

    this.connect();
  }

  /**
   * Connect to Binance WebSocket
   */
  private connect(): void {
    this.isConnecting = true;

    try {
      console.log("[BinancePriceService] Connecting to Binance Futures ticker stream...");
      this.ws = new WebSocket(this.WS_URL);

      this.ws.on("open", () => {
        console.log("[BinancePriceService] Connected to Binance");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPingInterval();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("error", (error: Error) => {
        console.error("[BinancePriceService] WebSocket error:", error.message);
      });

      this.ws.on("close", () => {
        console.log("[BinancePriceService] WebSocket closed");
        this.isConnecting = false;
        this.stopPingInterval();
        this.handleReconnect();
      });
    } catch (error) {
      console.error("[BinancePriceService] Connection error:", error);
      this.isConnecting = false;
      this.handleReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const tickers = JSON.parse(data);

      if (!Array.isArray(tickers)) return;

      for (const ticker of tickers) {
        // Only cache USDT pairs to limit memory usage
        if (!ticker.s || !ticker.s.endsWith('USDT')) continue;

        const quoteVolume = parseFloat(ticker.q);
        // Skip low-volume pairs unless already cached
        if (quoteVolume < this.MIN_VOLUME_THRESHOLD && !this.priceCache.has(ticker.s)) {
          continue;
        }

        const tickerData: TickerData = {
          symbol: ticker.s,
          lastPrice: parseFloat(ticker.c),
          priceChange: parseFloat(ticker.p),
          priceChangePercent: parseFloat(ticker.P),
          high: parseFloat(ticker.h),
          low: parseFloat(ticker.l),
          volume: parseFloat(ticker.v),
          quoteVolume: quoteVolume,
          timestamp: Date.now(),
        };

        this.priceCache.set(ticker.s, tickerData);

        // Notify subscribers
        for (const callback of this.subscribers) {
          try {
            callback(ticker.s, tickerData);
          } catch (e) {
            // Ignore callback errors
          }
        }
      }

      // Prune cache if it exceeds the limit
      this.pruneCacheIfNeeded();
    } catch (error) {
      // Ignore parse errors for ping/pong messages
    }
  }

  /**
   * Prune cache to keep only top symbols by volume
   */
  private pruneCacheIfNeeded(): void {
    if (this.priceCache.size <= this.MAX_CACHE_SIZE) return;

    const sorted = Array.from(this.priceCache.entries())
      .sort((a, b) => b[1].quoteVolume - a[1].quoteVolume)
      .slice(0, this.MAX_CACHE_SIZE);

    this.priceCache = new Map(sorted);
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[BinancePriceService] Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    
    console.log(`[BinancePriceService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Get price for a specific symbol
   */
  getPrice(symbol: string): TickerData | null {
    return this.priceCache.get(symbol) || null;
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Record<string, TickerData> {
    const prices: Record<string, TickerData> = {};
    for (const [symbol, data] of this.priceCache) {
      prices[symbol] = data;
    }
    return prices;
  }

  /**
   * Get prices for specific symbols
   */
  getPrices(symbols: string[]): Record<string, TickerData> {
    const prices: Record<string, TickerData> = {};
    for (const symbol of symbols) {
      const data = this.priceCache.get(symbol);
      if (data) {
        prices[symbol] = data;
      }
    }
    return prices;
  }

  /**
   * Subscribe to price updates
   */
  subscribe(callback: PriceUpdateCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get cache statistics
   */
  getStats(): { symbolCount: number; isConnected: boolean } {
    return {
      symbolCount: this.priceCache.size,
      isConnected: this.isConnected(),
    };
  }

  /**
   * Stop the service
   */
  stop(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribers.clear();
  }
}

// Export singleton instance
const binancePriceService = new BinancePriceService();
export default binancePriceService;
