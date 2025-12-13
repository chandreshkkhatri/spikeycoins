import limiter from "./limiter";

// Import KiteConnect and KiteTicker from the package
const KiteConnect = require("kiteconnect").KiteConnect;
const KiteTicker = require("kiteconnect").KiteTicker;

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
    this.kc = null;
  }

  public static getInstance(): KiteConnectService {
    if (!KiteConnectService.instance) {
      KiteConnectService.instance = new KiteConnectService();
    }
    return KiteConnectService.instance;
  }

  public initializeWithCredentials(apiKey: string, apiSecret: string): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;

    try {
      this.kc = new KiteConnect({ api_key: apiKey });
    } catch (error) {
      console.error("Error creating KiteConnect instance:", error);
      throw error;
    }
  }

  getKiteConnect(): any {
    if (!this.kc) {
      throw new Error(
        "KiteConnect not initialized. Call initializeWithCredentials() first."
      );
    }
    return this.kc;
  }

  reset(): void {
    this.accessToken = null;
    if (this.ticker) {
      this.ticker.disconnect();
      this.ticker = null;
    }
    if (this.apiKey) {
      this.kc = new KiteConnect({ api_key: this.apiKey });
    }
  }

  setAccessToken(accessToken: string): void {
    try {
      this.kc.setAccessToken(accessToken);
      this.accessToken = accessToken;
    } catch (error) {
      console.error("Error setting access token:", error);
      throw error;
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  getLoginURL(): string {
    if (!this.kc) {
      throw new Error(
        "KiteConnect not initialized. Call initializeWithCredentials() first."
      );
    }
    return this.kc.getLoginURL();
  }

  async generateSession(requestToken: string): Promise<any> {
    if (!this.kc || !this.apiSecret) {
      throw new Error(
        "KiteConnect not initialized. Call initializeWithCredentials() first."
      );
    }
    try {
      const response = await this.kc.generateSession(
        requestToken,
        this.apiSecret
      );
      this.setAccessToken(response.access_token);
      return response;
    } catch (error) {
      console.error("Error generating session:", error);
      throw error;
    }
  }

  async invalidateAccessToken(): Promise<any> {
    try {
      const response = await limiter.schedule(() =>
        this.kc.invalidateAccessToken(this.accessToken)
      );
      this.reset();
      return response;
    } catch (error) {
      console.error("Error invalidating access token:", error);
      throw error;
    }
  }

  async getProfile(): Promise<any> {
    return limiter.schedule(() => this.kc.getProfile());
  }

  async getMargins(segment?: string): Promise<any> {
    if (!this.kc) {
      throw new Error(
        "KiteConnect not initialized. Call initializeWithCredentials() first."
      );
    }

    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    try {
      const result = await limiter.schedule(() => {
        return this.kc.getMargins(segment);
      });
      return result;
    } catch (error) {
      console.error("Error in getMargins:", error);
      throw error;
    }
  }

  async getPositions(): Promise<any> {
    return limiter.schedule(() => this.kc.getPositions());
  }

  async getHoldings(): Promise<any> {
    return limiter.schedule(() => this.kc.getHoldings());
  }

  async getOrders(): Promise<any> {
    return limiter.schedule(() => this.kc.getOrders());
  }

  async getOrderHistory(orderId: string): Promise<any> {
    return limiter.schedule(() => this.kc.getOrderHistory(orderId));
  }

  async getTrades(): Promise<any[]> {
    return limiter.schedule(() => this.kc.getTrades());
  }

  async placeOrder(params: any): Promise<{ order_id: string }> {
    const variety = params.product === "CNC" ? "regular" : "regular";
    return limiter.schedule(() => this.kc.placeOrder(variety, params));
  }

  async modifyOrder(
    orderId: string,
    params: any
  ): Promise<{ order_id: string }> {
    const variety = "regular";
    return limiter.schedule(() =>
      this.kc.modifyOrder(variety, orderId, params)
    );
  }

  async cancelOrder(orderId: string): Promise<{ order_id: string }> {
    const variety = "regular";
    return limiter.schedule(() => this.kc.cancelOrder(variety, orderId));
  }

  async getQuote(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getQuote(instruments));
  }

  async getLTP(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getLTP(instruments));
  }

  async getOHLC(instruments: string[]): Promise<any> {
    return limiter.schedule(() => this.kc.getOHLC(instruments));
  }

  async getHistoricalData(
    instrumentToken: string,
    interval: string,
    fromDate: string | Date,
    toDate: string | Date,
    continuous: boolean = false
  ): Promise<any> {
    return limiter.schedule(() =>
      this.kc.getHistoricalData(
        instrumentToken,
        interval,
        fromDate,
        toDate,
        continuous
      )
    );
  }

  async getInstruments(exchange?: string[]): Promise<any[]> {
    return limiter.schedule(() => this.kc.getInstruments(exchange));
  }

  async convertPosition(params: any): Promise<boolean> {
    return limiter.schedule(() => this.kc.convertPosition(params));
  }

  initTicker(): any {
    if (!this.accessToken || !this.apiKey) {
      throw new Error(
        "Access token and API key required for WebSocket connection"
      );
    }

    if (this.ticker) {
      return this.ticker;
    }

    this.ticker = new KiteTicker({
      api_key: this.apiKey,
      access_token: this.accessToken,
    });

    this.ticker.autoReconnect(true, 3, 5);

    return this.ticker;
  }

  subscribeInstruments(tokens: number[]): void {
    if (!this.ticker) {
      throw new Error("Ticker not initialized. Call initTicker() first");
    }
    this.ticker.subscribe(tokens);
    this.ticker.setMode(this.ticker.modeFull, tokens);
  }

  unsubscribeInstruments(tokens: number[]): void {
    if (this.ticker) {
      this.ticker.unsubscribe(tokens);
    }
  }

  disconnectTicker(): void {
    if (this.ticker) {
      this.ticker.disconnect();
      this.ticker = null;
    }
  }

  setSessionExpiryHook(callback: () => void): void {
    this.kc.setSessionExpiryHook(callback);
  }
}

const kiteConnectService = KiteConnectService.getInstance();
export default kiteConnectService;
