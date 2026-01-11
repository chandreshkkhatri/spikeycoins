/**
 * Binance WebSocket Service
 * Handles real-time market data for Spot and USD(S)-M Futures
 * Based on Binance WebSocket API documentation
 */

type TradingSegment = "spot" | "usdm";

interface BinanceTickerData {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  volume: string;
  quoteVolume?: string;
  openTime?: number;
  closeTime?: number;
}

interface SubscriptionCallback {
  (data: any): void;
}

class BinanceWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private subscribedSymbols: Set<string> = new Set();
  private callbacks: Map<string, SubscriptionCallback[]> = new Map();
  private segment: TradingSegment = "spot";
  private isConnecting = false;
  private pingInterval: number | null = null;
  private intentionalDisconnect = false;

  // WebSocket URLs according to Binance documentation
  private readonly SPOT_WS_URL = "wss://stream.binance.com:9443/ws";
  private readonly FUTURES_WS_URL = "wss://fstream.binance.com/ws";
  private readonly SPOT_TESTNET_WS_URL = "wss://testnet.binance.vision/ws";
  private readonly FUTURES_TESTNET_WS_URL = "wss://stream.binancefuture.com/ws";

  /**
   * Initialize WebSocket connection
   */
  connect(
    segment: TradingSegment = "spot",
    testnet: boolean = false,
  ): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return Promise.resolve();
    }

    this.segment = segment;
    this.isConnecting = true;
    this.intentionalDisconnect = false;

    return new Promise((resolve, reject) => {
      try {
        // Select WebSocket URL based on segment and testnet flag
        let wsUrl: string;
        if (segment === "usdm") {
          wsUrl = testnet ? this.FUTURES_TESTNET_WS_URL : this.FUTURES_WS_URL;
        } else {
          wsUrl = testnet ? this.SPOT_TESTNET_WS_URL : this.SPOT_WS_URL;
        }

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Start ping interval to keep connection alive
          this.startPingInterval();

          // Subscribe to All Market Tickers Stream (!ticker@arr)
          this.subscribeToAllMarketTickers();

          resolve();
        };

        this.ws.onmessage = (event) => {
          // Removed verbose logging to prevent console flooding
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error("Binance WebSocket error:", error);
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.stopPingInterval();
          this.handleReconnect();
        };
      } catch (error) {
        console.error("Error connecting to Binance WebSocket:", error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Subscribe to the All Market Tickers Stream
   * This provides updates for ALL symbols in a single stream
   */
  private subscribeToAllMarketTickers() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscribeMessage = {
      method: "SUBSCRIBE",
      params: ["!ticker@arr"],
      id: Date.now(),
    };

    this.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);

      // Handle All Market Tickers Stream (Array of tickers)
      if (Array.isArray(message)) {
        message.forEach((tickerData: any) => {
          const symbol = tickerData.s;
          if (!symbol) return;

          // Only process symbols that have active subscribers
          const symbolLower = symbol.toLowerCase();
          const symbolCallbacks = this.callbacks.get(symbolLower);

          if (symbolCallbacks && symbolCallbacks.length > 0) {
            const formattedData = this.formatTickerData(tickerData);
            symbolCallbacks.forEach((callback) => {
              try {
                callback(formattedData);
              } catch (error) {
                console.error("Error in callback:", error);
              }
            });
          }
        });
        return;
      }

      // Handle different message types
      if (message.e) {
        // Event-based message (ticker, trade, etc.)
        const symbol = message.s;

        // Invoke callbacks for this symbol
        const symbolCallbacks = this.callbacks.get(symbol.toLowerCase());
        if (symbolCallbacks) {
          symbolCallbacks.forEach((callback) => {
            try {
              callback(this.formatTickerData(message));
            } catch (error) {
              console.error("Error in callback:", error);
            }
          });
        }
      } else if (message.result === null) {
        // Subscription confirmation
      } else if (message.error) {
        // Error message
        console.error("Binance WebSocket error:", message.error);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  }

  /**
   * Format ticker data to a consistent structure
   */
  private formatTickerData(rawData: any): BinanceTickerData {
    return {
      symbol: rawData.s,
      lastPrice: rawData.c || rawData.p,
      priceChange: rawData.p || "0",
      priceChangePercent: rawData.P || "0",
      high: rawData.h || "0",
      low: rawData.l || "0",
      volume: rawData.v || "0",
      quoteVolume: rawData.q,
      openTime: rawData.O,
      closeTime: rawData.C,
    };
  }

  /**
   * Subscribe to ticker updates for a symbol
   */
  subscribe(symbol: string, callback: SubscriptionCallback) {
    // Safety check
    if (!symbol) {
      return;
    }

    const symbolLower = symbol.toLowerCase();

    // Add callback to the list
    if (!this.callbacks.has(symbolLower)) {
      this.callbacks.set(symbolLower, []);
    }
    this.callbacks.get(symbolLower)!.push(callback);

    // Add to subscribed symbols
    this.subscribedSymbols.add(symbolLower);
  }

  /**
   * Unsubscribe from a symbol
   */
  unsubscribe(symbol: string) {
    const symbolLower = symbol.toLowerCase();

    this.callbacks.delete(symbolLower);
    this.subscribedSymbols.delete(symbolLower);
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect() {
    // Don't reconnect if disconnect was intentional
    if (this.intentionalDisconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts++;

    setTimeout(() => {
      if (!this.intentionalDisconnect) {
        this.connect(this.segment);
      }
    }, this.reconnectDelay);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval() {
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Binance WebSocket expects pong responses to ping, but we can also send list subscriptions
        const pingMessage = {
          method: "LIST_SUBSCRIPTIONS",
          id: Date.now(),
        };
        this.ws.send(JSON.stringify(pingMessage));
      }
    }, 180000); // 3 minutes (Binance timeout is 5 minutes)
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Add a symbol to watchlist (alias for subscribe without callback)
   */
  addSymbol(symbol: string) {
    // Subscribe without a specific callback - data will be handled by existing listeners
    this.subscribe(symbol, () => {
      // Default no-op callback
    });
  }

  /**
   * Remove a symbol from watchlist (alias for unsubscribe)
   */
  removeSymbol(symbol: string) {
    this.unsubscribe(symbol);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    this.intentionalDisconnect = true;

    if (this.ws) {
      this.stopPingInterval();
      // Clear all event handlers before closing
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (
        this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.subscribedSymbols.clear();
    this.callbacks.clear();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current trading segment
   */
  getSegment(): TradingSegment {
    return this.segment;
  }
}

// Export singleton instance
const binanceWebSocketService = new BinanceWebSocketService();
export default binanceWebSocketService;
