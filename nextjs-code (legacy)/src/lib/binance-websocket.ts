interface PriceUpdate {
  symbol: string;
  price: string;
  priceChangePercent: string;
  volume: string;
  high: string;
  low: string;
}

interface WebSocketManager {
  connect: (symbols: string[], onMessage: (data: PriceUpdate) => void) => void;
  disconnect: () => void;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
}

export class BinanceWebSocket implements WebSocketManager {
  private ws: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private onMessageCallback: ((data: PriceUpdate) => void) | null = null;
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private intentionalDisconnect: boolean = false;

  connect(symbols: string[], onMessage: (data: PriceUpdate) => void): void {
    // Prevent double connections
    if (this.isConnecting) {
      return;
    }

    // If already connected, just update the callback and symbols
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.onMessageCallback = onMessage;
      this.subscribedSymbols = new Set(symbols.map(s => s.toLowerCase()));
      return;
    }

    this.onMessageCallback = onMessage;
    this.subscribedSymbols = new Set(symbols.map(s => s.toLowerCase()));
    this.isConnecting = true;
    this.intentionalDisconnect = false;

    try {
      // Binance WebSocket URL for 24hr ticker data
      const wsUrl = 'wss://fstream.binance.com/ws/!ticker@arr';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Binance WebSocket connected');
        this.isConnecting = false;

        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          // Handle array of tickers
          if (Array.isArray(data)) {
            data.forEach(ticker => {
              const symbol = ticker.s; // Symbol
              if (this.subscribedSymbols.has(symbol.toLowerCase())) {
                const priceUpdate: PriceUpdate = {
                  symbol: symbol,
                  price: ticker.c, // Close price
                  priceChangePercent: ticker.P, // Price change percent
                  volume: ticker.v, // Volume
                  high: ticker.h, // High price
                  low: ticker.l, // Low price
                };
                this.onMessageCallback?.(priceUpdate);
              }
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('Binance WebSocket disconnected');
        this.isConnecting = false;

        // Only schedule reconnect if it wasn't an intentional disconnect
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = error => {
        console.error('Binance WebSocket error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.reconnectTimer = null;

      if (this.onMessageCallback && this.subscribedSymbols.size > 0) {
        this.connect(Array.from(this.subscribedSymbols), this.onMessageCallback);
      }
    }, this.reconnectInterval);
  }

  disconnect(): void {
    // Mark as intentional disconnect to prevent auto-reconnect
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Remove event handlers first to prevent any callbacks during cleanup
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      // Only close if the WebSocket is fully open
      // Avoid closing CONNECTING sockets to prevent the warning
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Normal closure');
      } else if (this.ws.readyState === WebSocket.CONNECTING) {
        // For connecting sockets, just nullify the reference
        // The connection will fail naturally without error messages
        console.log('WebSocket still connecting, canceling...');
      }

      this.ws = null;
    }

    this.subscribedSymbols.clear();
    this.onMessageCallback = null;
    this.isConnecting = false;
  }

  addSymbol(symbol: string): void {
    this.subscribedSymbols.add(symbol.toLowerCase());

    // If WebSocket is connected, we don't need to do anything special
    // as we're already subscribed to all tickers
  }

  removeSymbol(symbol: string): void {
    this.subscribedSymbols.delete(symbol.toLowerCase());
  }
}

// Singleton instance
export const binanceWebSocket = new BinanceWebSocket();
