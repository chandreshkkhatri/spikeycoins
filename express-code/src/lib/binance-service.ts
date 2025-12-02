import crypto from "crypto";
import axios, { AxiosInstance } from "axios";

/**
 * Binance Service - Unified service for Spot and USD(S)-M Futures trading
 * Documentation: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
 */
class BinanceService {
  private apiKey: string = "";
  private apiSecret: string = "";
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  private testnet: boolean = false;
  
  // Cache for exchange info to avoid excessive API calls
  private futuresExchangeInfoCache: any = null;
  private futuresExchangeInfoCacheTime: number = 0;
  private spotExchangeInfoCache: any = null;
  private spotExchangeInfoCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  // Base URLs according to Binance API docs
  private readonly SPOT_BASE_URL = "https://api.binance.com";
  private readonly SPOT_TESTNET_URL = "https://testnet.binance.vision";
  private readonly FUTURES_BASE_URL = "https://fapi.binance.com";
  private readonly FUTURES_TESTNET_URL = "https://testnet.binancefuture.com";

  constructor() {
    this.spotClient = axios.create({
      baseURL: this.SPOT_BASE_URL,
      timeout: 10000,
    });

    this.futuresClient = axios.create({
      baseURL: this.FUTURES_BASE_URL,
      timeout: 10000,
    });
  }

  /**
   * Initialize service with API credentials
   */
  initializeWithCredentials(
    apiKey: string,
    apiSecret: string,
    testnet: boolean = false
  ) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.testnet = testnet;

    // Update base URLs based on testnet flag
    const spotBaseURL = testnet ? this.SPOT_TESTNET_URL : this.SPOT_BASE_URL;
    const futuresBaseURL = testnet
      ? this.FUTURES_TESTNET_URL
      : this.FUTURES_BASE_URL;

    this.spotClient = axios.create({
      baseURL: spotBaseURL,
      timeout: 10000,
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    this.futuresClient = axios.create({
      baseURL: futuresBaseURL,
      timeout: 10000,
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });
  }

  /**
   * Generate signature for authenticated requests
   */
  private generateSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  /**
   * Add timestamp and signature to params
   */
  private signRequest(params: Record<string, any> = {}): string {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({
      ...params,
      timestamp: timestamp.toString(),
    }).toString();

    const signature = this.generateSignature(queryString);
    return `${queryString}&signature=${signature}`;
  }

  // ==================== SPOT API METHODS ====================

  /**
   * Get Spot account information (balances, permissions)
   */
  async getSpotAccount() {
    try {
      const signedParams = this.signRequest();
      const response = await this.spotClient.get(
        `/api/v3/account?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getAccount error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot account"
      );
    }
  }

  /**
   * Get Spot wallet balances
   */
  async getSpotBalances() {
    try {
      const accountData = await this.getSpotAccount();
      // Filter out zero balances
      return accountData.balances.filter(
        (balance: any) =>
          parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
      );
    } catch (error: any) {
      console.error("Binance Spot getBalances error:", error.message);
      throw error;
    }
  }

  /**
   * Get Spot open orders
   */
  async getSpotOpenOrders(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const signedParams = this.signRequest(params);
      const response = await this.spotClient.get(
        `/api/v3/openOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getOpenOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot open orders"
      );
    }
  }

  /**
   * Get Spot all orders (history)
   */
  async getSpotAllOrders(symbol: string, limit: number = 500) {
    try {
      const signedParams = this.signRequest({ symbol, limit });
      const response = await this.spotClient.get(
        `/api/v3/allOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getAllOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Spot order history"
      );
    }
  }

  /**
   * Place Spot order
   */
  async placeSpotOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET" | "STOP_LOSS_LIMIT" | "TAKE_PROFIT_LIMIT";
    quantity: number;
    price?: number;
    timeInForce?: "GTC" | "IOC" | "FOK";
  }) {
    try {
      const signedParams = this.signRequest(params);
      const response = await this.spotClient.post(
        `/api/v3/order?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot placeOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to place Binance Spot order"
      );
    }
  }

  /**
   * Cancel Spot order
   */
  async cancelSpotOrder(symbol: string, orderId: number) {
    try {
      const signedParams = this.signRequest({ symbol, orderId });
      const response = await this.spotClient.delete(
        `/api/v3/order?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot cancelOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to cancel Binance Spot order"
      );
    }
  }

  // ==================== USD(S)-M FUTURES API METHODS ====================

  /**
   * Get Futures account information
   */
  async getFuturesAccount() {
    try {
      const signedParams = this.signRequest();
      const response = await this.futuresClient.get(
        `/fapi/v2/account?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getAccount error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures account"
      );
    }
  }

  /**
   * Get Futures wallet balance
   */
  async getFuturesBalance() {
    try {
      const signedParams = this.signRequest();
      const response = await this.futuresClient.get(
        `/fapi/v2/balance?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getBalance error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures balance"
      );
    }
  }

  /**
   * Get Futures positions
   */
  async getFuturesPositions() {
    try {
      const signedParams = this.signRequest();
      const response = await this.futuresClient.get(
        `/fapi/v2/positionRisk?${signedParams}`
      );
      // Filter out positions with no quantity
      return response.data.filter(
        (position: any) => parseFloat(position.positionAmt) !== 0
      );
    } catch (error: any) {
      console.error(
        "Binance Futures getPositions error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures positions"
      );
    }
  }

  /**
   * Get Futures open orders
   */
  async getFuturesOpenOrders(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/openOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getOpenOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures open orders"
      );
    }
  }

  /**
   * Get Futures all orders (history)
   */
  async getFuturesAllOrders(symbol?: string, limit: number = 100) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/allOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getAllOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures order history"
      );
    }
  }

  /**
   * Get Futures user trades (executed trades)
   */
  async getFuturesUserTrades(symbol?: string, limit: number = 50) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/userTrades?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getUserTrades error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures trade history"
      );
    }
  }

  /**
   * Place Futures order
   */
  async placeFuturesOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    positionSide?: "BOTH" | "LONG" | "SHORT";
    type:
      | "LIMIT"
      | "MARKET"
      | "STOP"
      | "TAKE_PROFIT"
      | "STOP_MARKET"
      | "TAKE_PROFIT_MARKET";
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
    reduceOnly?: boolean;
  }) {
    try {
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.post(
        `/fapi/v1/order?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures placeOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to place Binance Futures order"
      );
    }
  }

  /**
   * Cancel Futures order
   */
  async cancelFuturesOrder(symbol: string, orderId: number) {
    try {
      const signedParams = this.signRequest({ symbol, orderId });
      const response = await this.futuresClient.delete(
        `/fapi/v1/order?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to cancel Binance Futures order"
      );
    }
  }

  /**
   * Change Futures leverage
   */
  async changeFuturesLeverage(symbol: string, leverage: number) {
    try {
      const signedParams = this.signRequest({ symbol, leverage });
      const response = await this.futuresClient.post(
        `/fapi/v1/leverage?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures changeLeverage error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to change Binance Futures leverage"
      );
    }
  }

  /**
   * Change Futures margin type
   */
  async changeFuturesMarginType(
    symbol: string,
    marginType: "ISOLATED" | "CROSSED"
  ) {
    try {
      const signedParams = this.signRequest({ symbol, marginType });
      const response = await this.futuresClient.post(
        `/fapi/v1/marginType?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures changeMarginType error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to change Binance Futures margin type"
      );
    }
  }

  /**
   * Get Futures leverage brackets
   * Contains info about allowed leverage and margin requirements
   */
  async getFuturesLeverageBrackets(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/leverageBracket?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getLeverageBrackets error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures leverage brackets"
      );
    }
  }

  /**
   * Get Futures premium index (funding rates)
   */
  async getFuturesPremiumIndex(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      // Public endpoint, no signature needed usually, but client is configured with headers
      // Using public client or just removing signature for this one if needed.
      // premiumIndex is public, doesn't need signature.
      const response = await this.futuresClient.get(
        `/fapi/v1/premiumIndex`, { params }
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getPremiumIndex error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures premium index"
      );
    }
  }

  /**
   * Get Futures exchange info (all symbols) - CACHED to reduce API weight
   */
  async getFuturesExchangeInfo() {
    try {
      const now = Date.now();
      
      // Return cached data if still valid
      if (this.futuresExchangeInfoCache && (now - this.futuresExchangeInfoCacheTime) < this.CACHE_TTL) {
        return this.futuresExchangeInfoCache;
      }
      
      const response = await this.futuresClient.get("/fapi/v1/exchangeInfo");
      
      // Cache the response
      this.futuresExchangeInfoCache = response.data;
      this.futuresExchangeInfoCacheTime = now;
      
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getExchangeInfo error:",
        error.response?.data || error.message
      );
      
      // Return cached data if available even if expired (better than failing)
      if (this.futuresExchangeInfoCache) {
        console.warn("Returning stale cached exchange info");
        return this.futuresExchangeInfoCache;
      }
      
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures exchange info"
      );
    }
  }

  // ==================== PUBLIC/MARKET DATA METHODS ====================

  /**
   * Get latest price for a symbol (Spot)
   */
  async getSpotPrice(symbol: string) {
    try {
      const response = await this.spotClient.get(`/api/v3/ticker/price`, {
        params: { symbol },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getPrice error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot price"
      );
    }
  }

  /**
   * Get latest price for a symbol (Futures)
   */
  async getFuturesPrice(symbol: string) {
    try {
      const response = await this.futuresClient.get(`/fapi/v1/ticker/price`, {
        params: { symbol },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getPrice error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures price"
      );
    }
  }

  /**
   * Get 24hr ticker statistics (Spot)
   */
  async getSpot24hrTicker(symbol: string) {
    try {
      const response = await this.spotClient.get(`/api/v3/ticker/24hr`, {
        params: { symbol },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot get24hrTicker error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot 24hr ticker"
      );
    }
  }

  /**
   * Get 24hr ticker statistics (Futures)
   */
  async getFutures24hrTicker(symbol: string) {
    try {
      const response = await this.futuresClient.get(`/fapi/v1/ticker/24hr`, {
        params: { symbol },
      });
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures get24hrTicker error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures 24hr ticker"
      );
    }
  }

  /**
   * Test connectivity to Spot API
   */
  async testSpotConnectivity() {
    try {
      await this.spotClient.get("/api/v3/ping");
      return { success: true, message: "Binance Spot API is reachable" };
    } catch (error: any) {
      console.error("Binance Spot connectivity test failed:", error.message);
      throw new Error("Failed to connect to Binance Spot API");
    }
  }

  /**
   * Test connectivity to Futures API
   */
  async testFuturesConnectivity() {
    try {
      await this.futuresClient.get("/fapi/v1/ping");
      return { success: true, message: "Binance Futures API is reachable" };
    } catch (error: any) {
      console.error("Binance Futures connectivity test failed:", error.message);
      throw new Error("Failed to connect to Binance Futures API");
    }
  }
}

// Export singleton instance
const binanceService = new BinanceService();
export default binanceService;
