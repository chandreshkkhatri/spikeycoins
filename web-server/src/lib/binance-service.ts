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

  // Rate limiting to prevent IP bans
  private requestCount: number = 0;
  private requestWindowStart: number = Date.now();
  private readonly REQUEST_WINDOW = 60 * 1000; // 1 minute window
  private readonly MAX_REQUESTS_PER_WINDOW = 1200; // Conservative limit (Binance allows 1200/min)

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
   * Check and enforce rate limits
   */
  private checkRateLimit(): void {
    const now = Date.now();

    // Reset counter if we're in a new window
    if (now - this.requestWindowStart >= this.REQUEST_WINDOW) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }

    // Check if we've exceeded the limit
    if (this.requestCount >= this.MAX_REQUESTS_PER_WINDOW) {
      const waitTime = this.REQUEST_WINDOW - (now - this.requestWindowStart);
      throw new Error(
        `Rate limit exceeded. Please wait ${Math.ceil(
          waitTime / 1000
        )}s before making more requests. Use websocket streams for live price updates.`
      );
    }

    this.requestCount++;
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
  private signRequest(params: Record<string, unknown> = {}): string {
    const timestamp = Date.now();

    // Convert params to string key/value pairs for URLSearchParams
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      entries[k] = typeof v === "string" ? v : String(v);
    }
    entries.timestamp = timestamp.toString();

    const queryString = new URLSearchParams(entries).toString();
    const signature = this.generateSignature(queryString);
    return `${queryString}&signature=${signature}`;
  }

  // ==================== SPOT API METHODS ====================

  /**
   * Get Spot account information (balances, permissions)
   */
  async getSpotAccount() {
    try {
      this.checkRateLimit();
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
      this.checkRateLimit();
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
      this.checkRateLimit();
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
      this.checkRateLimit();
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
   * Get Futures open Algo orders (conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
   * Endpoint: GET /fapi/v1/openAlgoOrders
   */
  async getFuturesOpenAlgoOrders(symbol?: string) {
    try {
      this.checkRateLimit();
      const params: Record<string, unknown> = {};
      if (symbol) {
        params.symbol = symbol;
      }
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/openAlgoOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getOpenAlgoOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
        "Failed to fetch Binance Futures open Algo orders"
      );
    }
  }

  /**
   * Get Futures all orders (history)
   * @param symbol - Trading symbol (optional)
   * @param limit - Max number of orders (default 100)
   * @param startTime - Start time in milliseconds (optional)
   * @param endTime - End time in milliseconds (optional)
   */
  async getFuturesAllOrders(
    symbol?: string,
    limit: number = 100,
    startTime?: number,
    endTime?: number
  ) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
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
   * @param symbol - Trading symbol (optional)
   * @param limit - Max number of trades (default 50)
   * @param startTime - Start time in milliseconds (optional)
   * @param endTime - End time in milliseconds (optional)
   */
  async getFuturesUserTrades(
    symbol?: string,
    limit: number = 50,
    startTime?: number,
    endTime?: number
  ) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
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
   * Get Futures income history (realized PnL, commissions, funding fees, etc.)
   * This endpoint does NOT require a symbol, so it returns history across all symbols
   * @param incomeType - Filter by income type (optional): REALIZED_PNL, COMMISSION, FUNDING_FEE, etc.
   * @param limit - Max number of records (default 100, max 1000)
   * @param startTime - Start time in milliseconds (optional)
   * @param endTime - End time in milliseconds (optional)
   */
  async getFuturesIncomeHistory(
    incomeType?: string,
    limit: number = 100,
    startTime?: number,
    endTime?: number
  ) {
    try {
      const params: Record<string, unknown> = { limit };
      if (incomeType) params.incomeType = incomeType;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const signedParams = this.signRequest(params);
      const response = await this.futuresClient.get(
        `/fapi/v1/income?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getIncomeHistory error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
        "Failed to fetch Binance Futures income history"
      );
    }
  }

  /**
   * Place Futures order
   * Note: When closePosition=true, quantity is not required (entire position is closed)
   * NOTE: As of Dec 9, 2025, conditional orders (STOP_MARKET, TAKE_PROFIT_MARKET, etc.)
   * must use the Algo Order API. Use placeFuturesAlgoOrder() for those order types.
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
    quantity?: number; // Optional when closePosition=true
    price?: number;
    stopPrice?: number;
    timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
    reduceOnly?: boolean;
    closePosition?: boolean; // When true, closes entire position (mutually exclusive with reduceOnly)
  }) {
    try {
      this.checkRateLimit();
      // Ensure boolean flags are included correctly
      const apiParams: Record<string, unknown> = { ...params };
      if (typeof apiParams["closePosition"] === "boolean") {
        // leave as boolean; URLSearchParams will stringify it
        apiParams["closePosition"] = (apiParams["closePosition"] as boolean)
          ? true
          : false;
      }
      const signedParams = this.signRequest(apiParams as Record<string, any>);
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
   * Place Futures Algo Order (for conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
   * Required since Binance migrated conditional orders to Algo API on Dec 9, 2025.
   * Endpoint: POST /fapi/v1/algoOrder
   */
  async placeFuturesAlgoOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    positionSide?: "BOTH" | "LONG" | "SHORT";
    type:
    | "STOP"
    | "TAKE_PROFIT"
    | "STOP_MARKET"
    | "TAKE_PROFIT_MARKET"
    | "TRAILING_STOP_MARKET";
    quantity?: number;
    price?: number;
    triggerPrice: number; // Required for conditional orders (replaces stopPrice)
    timeInForce?: "GTC" | "IOC" | "FOK";
    reduceOnly?: boolean;
    closePosition?: boolean;
    workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
    priceProtect?: boolean;
  }) {
    try {
      this.checkRateLimit();

      // Build API params
      const apiParams: Record<string, unknown> = {
        algoType: "CONDITIONAL", // Required for conditional orders
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        triggerPrice: params.triggerPrice,
      };

      if (params.positionSide) {
        apiParams.positionSide = params.positionSide;
      }
      if (params.quantity !== undefined) {
        apiParams.quantity = params.quantity;
      }
      if (params.price !== undefined) {
        apiParams.price = params.price;
      }
      if (params.timeInForce) {
        apiParams.timeInForce = params.timeInForce;
      }
      if (params.reduceOnly !== undefined) {
        apiParams.reduceOnly = params.reduceOnly ? "true" : "false";
      }
      if (params.closePosition !== undefined) {
        apiParams.closePosition = params.closePosition ? "true" : "false";
      }
      if (params.workingType) {
        apiParams.workingType = params.workingType;
      }
      if (params.priceProtect !== undefined) {
        apiParams.priceProtect = params.priceProtect ? "TRUE" : "FALSE";
      }

      console.log("Placing Binance Algo Order:", apiParams);

      const signedParams = this.signRequest(apiParams as Record<string, any>);
      const response = await this.futuresClient.post(
        `/fapi/v1/algoOrder?${signedParams}`
      );
      console.log("Binance Algo Order response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures placeAlgoOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to place Binance Futures Algo order"
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
   * Cancel Futures Algo order (conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
   * Endpoint: DELETE /fapi/v1/algoOrder
   */
  async cancelFuturesAlgoOrder(symbol: string, algoId: number) {
    try {
      this.checkRateLimit();
      const signedParams = this.signRequest({ symbol, algoId });
      const response = await this.futuresClient.delete(
        `/fapi/v1/algoOrder?${signedParams}`
      );
      console.log("Binance Algo Order cancel response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelAlgoOrder error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to cancel Binance Futures Algo order"
      );
    }
  }

  /**
   * Cancel all open Futures orders for a symbol
   */
  async cancelAllFuturesOrders(symbol: string) {
    try {
      this.checkRateLimit();
      const signedParams = this.signRequest({ symbol });
      const response = await this.futuresClient.delete(
        `/fapi/v1/allOpenOrders?${signedParams}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelAllOrders error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
        "Failed to cancel all Binance Futures orders"
      );
    }
  }

  /**
   * Get existing SL/TP orders for a symbol (STOP_MARKET and TAKE_PROFIT_MARKET)
   */
  async getFuturesSlTpOrders(symbol: string): Promise<
    Array<{
      orderId: number;
      symbol: string;
      type: string;
      side: string;
      stopPrice: string;
    }>
  > {
    try {
      const openOrders = await this.getFuturesOpenOrders(symbol);
      return openOrders.filter(
        (order: { type: string }) =>
          order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET"
      );
    } catch (error: any) {
      console.error("Error fetching SL/TP orders:", error.message);
      return [];
    }
  }

  /**
   * Cancel specific SL/TP orders for a symbol
   * @param symbol - Trading symbol
   * @param side - Optional: only cancel orders for this side (BUY/SELL)
   */
  async cancelFuturesSlTpOrders(symbol: string, side?: "BUY" | "SELL") {
    try {
      const slTpOrders = await this.getFuturesSlTpOrders(symbol);
      const ordersToCancel = side
        ? slTpOrders.filter((o: { side: string }) => o.side === side)
        : slTpOrders;

      const results = [];
      for (const order of ordersToCancel) {
        try {
          const result = await this.cancelFuturesOrder(symbol, order.orderId);
          results.push({ orderId: order.orderId, success: true, result });
        } catch (cancelError: unknown) {
          const errorMessage =
            cancelError instanceof Error
              ? cancelError.message
              : "Unknown error";
          results.push({
            orderId: order.orderId,
            success: false,
            error: errorMessage,
          });
        }
      }
      return results;
    } catch (error: any) {
      console.error("Error cancelling SL/TP orders:", error.message);
      throw error;
    }
  }

  /**
   * Get current mark price for a futures symbol (for validation)
   * Uses mark price which is more stable than last price
   */
  async getFuturesMarkPrice(symbol: string): Promise<number> {
    try {
      this.checkRateLimit();
      const response = await this.futuresClient.get(`/fapi/v1/premiumIndex`, {
        params: { symbol },
      });
      return parseFloat(response.data.markPrice);
    } catch (error: any) {
      console.error(
        "Binance Futures getMarkPrice error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg ||
        "Failed to fetch Binance Futures mark price"
      );
    }
  }

  /**
   * Change Futures leverage
   */
  async changeFuturesLeverage(symbol: string, leverage: number) {
    try {
      this.checkRateLimit();
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
      this.checkRateLimit();
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
      const response = await this.futuresClient.get(`/fapi/v1/premiumIndex`, {
        params,
      });
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
      if (
        this.futuresExchangeInfoCache &&
        now - this.futuresExchangeInfoCacheTime < this.CACHE_TTL
      ) {
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
   * WARNING: This makes a REST API call and contributes to rate limits.
   * Use binancePriceService.getPrice() for cached websocket data instead!
   * @deprecated Use binancePriceService.getPrice() to avoid rate limits
   */
  async getSpotPrice(symbol: string) {
    try {
      console.warn(
        `[RATE LIMIT WARNING] getSpotPrice() called for ${symbol}. Use binancePriceService.getPrice() instead to avoid API bans!`
      );
      this.checkRateLimit();
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
   * WARNING: This makes a REST API call and contributes to rate limits.
   * Use binancePriceService.getPrice() for cached websocket data instead!
   * @deprecated Use binancePriceService.getPrice() to avoid rate limits
   */
  async getFuturesPrice(symbol: string) {
    try {
      console.warn(
        `[RATE LIMIT WARNING] getFuturesPrice() called for ${symbol}. Use binancePriceService.getPrice() instead to avoid API bans!`
      );
      this.checkRateLimit();
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

  // ==================== USER DATA STREAM (for Order Monitoring) ====================

  /**
   * Create a listenKey for Futures User Data Stream
   * Required for WebSocket connection to receive order/position updates
   * POST /fapi/v1/listenKey
   */
  async createFuturesListenKey(): Promise<string> {
    try {
      this.checkRateLimit();
      const response = await this.futuresClient.post("/fapi/v1/listenKey");
      return response.data.listenKey;
    } catch (error: any) {
      console.error(
        "Binance Futures createListenKey error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to create Binance Futures listenKey"
      );
    }
  }

  /**
   * Keep alive a Futures listenKey (extend validity by 60 minutes)
   * Should be called every 30 minutes to prevent timeout
   * PUT /fapi/v1/listenKey
   */
  async keepAliveFuturesListenKey(listenKey: string): Promise<void> {
    try {
      this.checkRateLimit();
      await this.futuresClient.put("/fapi/v1/listenKey", null, {
        params: { listenKey },
      });
    } catch (error: any) {
      console.error(
        "Binance Futures keepAliveListenKey error:",
        error.response?.data || error.message
      );
      throw new Error(
        error.response?.data?.msg || "Failed to keep alive Binance Futures listenKey"
      );
    }
  }

  /**
   * Delete a Futures listenKey (close the User Data Stream)
   * DELETE /fapi/v1/listenKey
   */
  async deleteFuturesListenKey(listenKey: string): Promise<void> {
    try {
      this.checkRateLimit();
      await this.futuresClient.delete("/fapi/v1/listenKey", {
        params: { listenKey },
      });
    } catch (error: any) {
      console.error(
        "Binance Futures deleteListenKey error:",
        error.response?.data || error.message
      );
      // Don't throw - deletion is best effort
    }
  }

  /**
   * Get the WebSocket URL for Futures User Data Stream
   */
  getFuturesUserDataStreamUrl(listenKey: string): string {
    const baseWs = this.testnet
      ? "wss://stream.binancefuture.com"
      : "wss://fstream.binance.com";
    return `${baseWs}/ws/${listenKey}`;
  }

  /**
   * Get credentials for external use (e.g., by order monitor service)
   */
  getCredentials(): { apiKey: string; apiSecret: string; testnet: boolean } {
    return {
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      testnet: this.testnet,
    };
  }
}

// Export singleton instance
const binanceService = new BinanceService();
export default binanceService;
