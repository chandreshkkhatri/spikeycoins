import limiter from './limiter';

// Import KiteConnect and KiteTicker from the package
const KiteConnect = require('kiteconnect').KiteConnect;
const KiteTicker = require('kiteconnect').KiteTicker;

// Define types for KiteConnect responses
export interface KiteOrder {
  order_id: string;
  exchange_order_id: string | null;
  placed_by: string;
  variety: string;
  status: string;
  tradingsymbol: string;
  exchange: string;
  order_type: string;
  transaction_type: string;
  validity: string;
  product: string;
  quantity: number;
  disclosed_quantity: number;
  price: number;
  trigger_price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  cancelled_quantity: number;
  order_timestamp: string;
  exchange_timestamp: string | null;
  status_message: string | null;
  tag: string | null;
}

export interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  overnight_quantity: number;
  multiplier: number;
  average_price: number;
  close_price: number;
  last_price: number;
  value: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  buy_quantity: number;
  buy_price: number;
  buy_value: number;
  buy_m2m: number;
  sell_quantity: number;
  sell_price: number;
  sell_value: number;
  sell_m2m: number;
  day_buy_quantity: number;
  day_buy_price: number;
  day_buy_value: number;
  day_sell_quantity: number;
  day_sell_price: number;
  day_sell_value: number;
}

export interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  price: number;
  quantity: number;
  t1_quantity: number;
  realised_quantity: number;
  authorised_quantity: number;
  authorised_date: string;
  opening_quantity: number;
  collateral_quantity: number;
  collateral_type: string;
  discrepancy: boolean;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export interface KiteMargins {
  equity?: {
    enabled: boolean;
    net: number;
    available: {
      adhoc_margin: number;
      cash: number;
      collateral: number;
      intraday_payin: number;
      live_balance: number;
      opening_balance: number;
    };
    utilised: {
      debits: number;
      exposure: number;
      m2m_realised: number;
      m2m_unrealised: number;
      option_premium: number;
      payout: number;
      span: number;
      holding_sales: number;
      turnover: number;
      liquid_collateral: number;
      stock_collateral: number;
    };
  };
  commodity?: {
    enabled: boolean;
    net: number;
    available: {
      adhoc_margin: number;
      cash: number;
      collateral: number;
      intraday_payin: number;
    };
    utilised: {
      debits: number;
      exposure: number;
      m2m_realised: number;
      m2m_unrealised: number;
      option_premium: number;
      payout: number;
      span: number;
      holding_sales: number;
      turnover: number;
      liquid_collateral: number;
      stock_collateral: number;
    };
  };
}

export interface KiteOrderParams {
  exchange: string;
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: 'CNC' | 'MIS' | 'NRML';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  validity?: 'DAY' | 'IOC' | 'TTL';
  price?: number;
  trigger_price?: number;
  disclosed_quantity?: number;
  tag?: string;
  iceberg_legs?: number;
  iceberg_quantity?: number;
}

/**
 * KiteConnect Service - Unified service for all KiteConnect operations
 * Implements v3 API with proper typing and error handling
 */
class KiteConnectService {
  private kc: any;
  private ticker: any | null = null;
  private accessToken: string | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private static instance: KiteConnectService;

  private constructor() {
    // Initialize without credentials - will be set later
    this.kc = null;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): KiteConnectService {
    if (!KiteConnectService.instance) {
      KiteConnectService.instance = new KiteConnectService();
    }
    return KiteConnectService.instance;
  }

  /**
   * Initialize with API credentials from account
   */
  public initializeWithCredentials(apiKey: string, apiSecret: string): void {
    console.log('Initializing KiteConnect with credentials');
    console.log('KiteConnect class available:', !!KiteConnect);
    console.log('API Key provided:', !!apiKey);
    console.log('API Secret provided:', !!apiSecret);

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    try {
      this.kc = new KiteConnect({ api_key: apiKey });
      console.log('KiteConnect instance created successfully');
      console.log('Instance methods available:', typeof this.kc.getMargins);
    } catch (error) {
      console.error('Error creating KiteConnect instance:', error);
      throw error;
    }
  }

  /**
   * Get the KiteConnect instance
   */
  getKiteConnect(): any {
    if (!this.kc) {
      throw new Error('KiteConnect not initialized. Call initializeWithCredentials() first.');
    }
    return this.kc;
  }

  /**
   * Reset the service (logout)
   */
  reset(): void {
    this.accessToken = null;
    if (this.ticker) {
      this.ticker.disconnect();
      this.ticker = null;
    }
    // Reset KiteConnect instance if credentials are available
    if (this.apiKey) {
      this.kc = new KiteConnect({ api_key: this.apiKey });
    }
  }

  /**
   * Set access token after authentication
   */
  setAccessToken(accessToken: string): void {
    console.log('Setting access token');
    console.log('Access token provided:', !!accessToken);
    console.log('KiteConnect instance available:', !!this.kc);

    try {
      this.kc.setAccessToken(accessToken);
      this.accessToken = accessToken;
      console.log('Access token set successfully');
    } catch (error) {
      console.error('Error setting access token:', error);
      throw error;
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get login URL for user authentication
   */
  getLoginURL(): string {
    if (!this.kc) {
      throw new Error('KiteConnect not initialized. Call initializeWithCredentials() first.');
    }
    return this.kc.getLoginURL();
  }

  /**
   * Generate session from request token
   */
  async generateSession(requestToken: string): Promise<any> {
    if (!this.kc || !this.apiSecret) {
      throw new Error('KiteConnect not initialized. Call initializeWithCredentials() first.');
    }
    try {
      const response = await this.kc.generateSession(requestToken, this.apiSecret);
      this.setAccessToken(response.access_token);
      return response;
    } catch (error) {
      console.error('Error generating session:', error);
      throw error;
    }
  }

  /**
   * Invalidate access token (logout)
   */
  async invalidateAccessToken(): Promise<any> {
    try {
      const response = await limiter.schedule(() =>
        this.kc.invalidateAccessToken(this.accessToken)
      );
      this.reset();
      return response;
    } catch (error) {
      console.error('Error invalidating access token:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<any> {
    return limiter.schedule(() => this.kc.getProfile());
  }

  /**
   * Get margins (funds)
   */
  async getMargins(segment?: string): Promise<KiteMargins> {
    console.log('KiteConnect service getMargins called');
    console.log('Has kc instance:', !!this.kc);
    console.log('Has access token:', !!this.accessToken);

    if (!this.kc) {
      throw new Error('KiteConnect not initialized. Call initializeWithCredentials() first.');
    }

    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    try {
      console.log('Calling kc.getMargins through limiter...');
      const result = await limiter.schedule(() => {
        console.log('Inside limiter - calling this.kc.getMargins()');
        return this.kc.getMargins(segment);
      });
      console.log('getMargins result:', result);
      return result;
    } catch (error) {
      console.error('Error in getMargins:', error);
      throw error;
    }
  }

  /**
   * Get positions
   */
  async getPositions(): Promise<{ net: KitePosition[]; day: KitePosition[] }> {
    return limiter.schedule(() => this.kc.getPositions());
  }

  /**
   * Get holdings
   */
  async getHoldings(): Promise<KiteHolding[]> {
    return limiter.schedule(() => this.kc.getHoldings());
  }

  /**
   * Get orders
   */
  async getOrders(): Promise<KiteOrder[]> {
    return limiter.schedule(() => this.kc.getOrders());
  }

  /**
   * Get order history
   */
  async getOrderHistory(orderId: string): Promise<KiteOrder[]> {
    return limiter.schedule(() => this.kc.getOrderHistory(orderId));
  }

  /**
   * Get trades
   */
  async getTrades(): Promise<any[]> {
    return limiter.schedule(() => this.kc.getTrades());
  }

  /**
   * Place an order
   */
  async placeOrder(params: KiteOrderParams): Promise<{ order_id: string }> {
    const variety = params.product === 'CNC' ? 'regular' : 'regular'; // Can be 'regular', 'iceberg', 'amo'
    return limiter.schedule(() => this.kc.placeOrder(variety, params));
  }

  /**
   * Modify an order
   */
  async modifyOrder(
    orderId: string,
    params: Partial<KiteOrderParams>
  ): Promise<{ order_id: string }> {
    const variety = 'regular';
    return limiter.schedule(() => this.kc.modifyOrder(variety, orderId, params));
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ order_id: string }> {
    const variety = 'regular';
    return limiter.schedule(() => this.kc.cancelOrder(variety, orderId));
  }

  /**
   * Get quote for instruments
   */
  async getQuote(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getQuote(instruments));
  }

  /**
   * Get LTP for instruments
   */
  async getLTP(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getLTP(instruments));
  }

  /**
   * Get OHLC for instruments
   */
  async getOHLC(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getOHLC(instruments));
  }

  /**
   * Get historical data
   */
  async getHistoricalData(
    instrumentToken: string,
    interval: string,
    fromDate: string | Date,
    toDate: string | Date,
    continuous: boolean = false
  ): Promise<any> {
    return limiter.schedule(() =>
      this.kc.getHistoricalData(instrumentToken, interval, fromDate, toDate, continuous)
    );
  }

  /**
   * Get instruments list
   */
  async getInstruments(exchange?: string[]): Promise<any[]> {
    return limiter.schedule(() => this.kc.getInstruments(exchange));
  }

  /**
   * Convert position
   */
  async convertPosition(params: {
    exchange: string;
    tradingsymbol: string;
    transaction_type: 'BUY' | 'SELL';
    position_type: 'day' | 'overnight';
    quantity: number;
    old_product: string;
    new_product: string;
  }): Promise<boolean> {
    return limiter.schedule(() => this.kc.convertPosition(params));
  }

  /**
   * Initialize WebSocket ticker for live data
   */
  initTicker(): any {
    if (!this.accessToken || !this.apiKey) {
      throw new Error('Access token and API key required for WebSocket connection');
    }

    if (this.ticker) {
      return this.ticker;
    }

    this.ticker = new KiteTicker({
      api_key: this.apiKey,
      access_token: this.accessToken,
    });

    // Set up auto-reconnect
    this.ticker.autoReconnect(true, 3, 5); // Enable, max 3 retries, 5 second intervals

    return this.ticker;
  }

  /**
   * Subscribe to instruments for live data
   */
  subscribeInstruments(tokens: number[]): void {
    if (!this.ticker) {
      throw new Error('Ticker not initialized. Call initTicker() first');
    }
    this.ticker.subscribe(tokens);
    this.ticker.setMode(this.ticker.modeFull, tokens);
  }

  /**
   * Unsubscribe from instruments
   */
  unsubscribeInstruments(tokens: number[]): void {
    if (this.ticker) {
      this.ticker.unsubscribe(tokens);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectTicker(): void {
    if (this.ticker) {
      this.ticker.disconnect();
      this.ticker = null;
    }
  }

  /**
   * Set session expiry hook
   */
  setSessionExpiryHook(callback: () => void): void {
    this.kc.setSessionExpiryHook(callback);
  }
}

// Export singleton instance
const kiteConnectService = KiteConnectService.getInstance();
export default kiteConnectService;

// Export for backward compatibility
export const {
  getProfile,
  getMargins,
  getPositions,
  getHoldings,
  getOrders,
  getTrades,
  getQuote,
  getLTP,
  getOHLC,
  getHistoricalData,
  getInstruments,
  placeOrder,
  modifyOrder,
  cancelOrder,
  checkAuth,
} = {
  getProfile: () => kiteConnectService.getProfile(),
  getMargins: (segment?: string) => kiteConnectService.getMargins(segment),
  getPositions: () => kiteConnectService.getPositions(),
  getHoldings: () => kiteConnectService.getHoldings(),
  getOrders: () => kiteConnectService.getOrders(),
  getTrades: () => kiteConnectService.getTrades(),
  getQuote: (instruments: string[]) => kiteConnectService.getQuote(instruments),
  getLTP: (instruments: string[]) => kiteConnectService.getLTP(instruments),
  getOHLC: (instruments: string[]) => kiteConnectService.getOHLC(instruments),
  getHistoricalData: (
    instrumentToken: string,
    interval: string,
    fromDate: string,
    toDate: string,
    continuous: number = 0
  ) =>
    kiteConnectService.getHistoricalData(
      instrumentToken,
      interval,
      fromDate,
      toDate,
      continuous === 1
    ),
  getInstruments: (exchange?: string) =>
    kiteConnectService.getInstruments(exchange ? [exchange] : undefined),
  placeOrder: (params: any) => kiteConnectService.placeOrder(params),
  modifyOrder: (orderId: string, params: any) => kiteConnectService.modifyOrder(orderId, params),
  cancelOrder: (orderId: string) => kiteConnectService.cancelOrder(orderId),
  checkAuth: () => kiteConnectService.isLoggedIn(),
};

// Export types
export type { KiteConnectService };
