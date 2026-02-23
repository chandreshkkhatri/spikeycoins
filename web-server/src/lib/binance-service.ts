import crypto from "crypto";
import axios, { AxiosInstance } from "axios";
import Bottleneck from "bottleneck";

/**
 * Binance Service - Unified service for Spot and USD(S)-M Futures trading
 * Documentation: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
 */
export class BinanceService {
  private apiKey: string = "";
  private apiSecret: string = "";
  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  private testnet: boolean = false;

  // Cache for exchange info to avoid excessive API calls - STATIC (Shared)
  private static futuresExchangeInfoCache: any = null;
  private static futuresExchangeInfoCacheTime: number = 0;
  private static spotExchangeInfoCache: any = null;
  private static spotExchangeInfoCacheTime: number = 0;
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  // ── Rate Limiting (shared across all instances) ──────────────
  private static readonly WEIGHT_LIMIT = 1200; // Binance 1-min IP weight limit
  private static readonly WEIGHT_WARN_THRESHOLD = 0.8; // Log warning at 80%

  static readonly limiter = new Bottleneck({
    reservoir: 1200,
    reservoirRefreshAmount: 1200,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 10,
    minTime: 50,
  });

  // ── Monitoring State ─────────────────────────────────────────
  private static lastReportedWeight: number = 0;
  private static lastWeightUpdateTime: number = 0;
  private static readonly WEIGHT_STALE_MS = 120_000; // 2 minutes: after this, consider weight stale
  private static weightByEndpoint: Map<string, number> = new Map();
  private static lastWeightLogTime: number = 0;
  private static readonly WEIGHT_LOG_INTERVAL = 30_000;
  private static cooldownEndTime: number = 0;

  // ── Schedule Timeout ─────────────────────────────────────────
  private static readonly SCHEDULE_TIMEOUT_MS = 15_000; // 15s max for schedule + execution

  // Base URLs
  private readonly SPOT_BASE_URL = "https://api.binance.com";
  private readonly SPOT_TESTNET_URL = "https://testnet.binance.vision";
  private readonly FUTURES_BASE_URL = "https://fapi.binance.com";
  private readonly FUTURES_TESTNET_URL = "https://testnet.binancefuture.com";

  constructor() {
    this.spotClient = axios.create({
      baseURL: this.SPOT_BASE_URL,
      timeout: 10000,
    });
    this.attachInterceptors(this.spotClient);

    this.futuresClient = axios.create({
      baseURL: this.FUTURES_BASE_URL,
      timeout: 10000,
    });
    this.attachInterceptors(this.futuresClient);
  }

  /**
   * Initialize service with API credentials
   */
  initializeWithCredentials(
    apiKey: string,
    apiSecret: string,
    testnet: boolean = false,
  ) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.testnet = testnet;

    const spotBaseURL = testnet ? this.SPOT_TESTNET_URL : this.SPOT_BASE_URL;
    const futuresBaseURL = testnet
      ? this.FUTURES_TESTNET_URL
      : this.FUTURES_BASE_URL;

    this.spotClient = axios.create({
      baseURL: spotBaseURL,
      timeout: 10000,
      headers: { "X-MBX-APIKEY": apiKey },
    });
    this.attachInterceptors(this.spotClient);

    this.futuresClient = axios.create({
      baseURL: futuresBaseURL,
      timeout: 10000,
      headers: { "X-MBX-APIKEY": apiKey },
    });
    this.attachInterceptors(this.futuresClient);
  }

  /**
   * Schedule a request through the shared rate limiter.
   * Fails fast with a user-friendly message if currently in cooldown.
   * Includes a safety timeout to prevent indefinite hangs from Bottleneck queue stalls.
   */
  static scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
    const remaining = BinanceService.cooldownEndTime - Date.now();
    if (remaining > 0) {
      const waitSec = Math.ceil(remaining / 1000);
      const error: any = new Error(
        `Rate limited by Binance. Please wait ${waitSec}s before retrying.`,
      );
      error.status = 429;
      return Promise.reject(error);
    }

    // If the weight data is stale (no successful Binance call in a while),
    // reset the reservoir so queued jobs can proceed.
    const staleness = Date.now() - BinanceService.lastWeightUpdateTime;
    if (
      BinanceService.lastWeightUpdateTime > 0 &&
      staleness > BinanceService.WEIGHT_STALE_MS
    ) {
      console.log(
        `[BinanceRateLimit] Weight data stale (${Math.round(staleness / 1000)}s), resetting reservoir`,
      );
      BinanceService.lastReportedWeight = 0;
      BinanceService.lastWeightUpdateTime = 0;
      BinanceService.limiter.updateSettings({
        reservoir: BinanceService.WEIGHT_LIMIT,
      });
    }

    // Use Bottleneck's expiration to auto-reject jobs stuck in queue,
    // and wrap with a timeout for end-to-end safety.
    const scheduled = BinanceService.limiter.schedule(
      { expiration: BinanceService.SCHEDULE_TIMEOUT_MS },
      fn,
    );

    // Race against a timeout in case both Bottleneck and Axios hang
    return Promise.race([
      scheduled,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          const err: any = new Error(
            'Binance API request timed out (rate limiter queue stall)',
          );
          err.status = 504;
          reject(err);
        }, BinanceService.SCHEDULE_TIMEOUT_MS + 2000); // +2s grace
        // Ensure the timer doesn't keep the process alive
        if (timer.unref) timer.unref();
      }),
    ]);
  }

  /**
   * Attach rate-limit response interceptors to an axios instance.
   */
  private attachInterceptors(client: AxiosInstance): void {
    client.interceptors.response.use(
      (response) => {
        const endpoint = response.config.url?.split("?")[0] || "unknown";
        BinanceService.trackWeight(
          endpoint,
          response.headers as Record<string, string>,
        );
        return response;
      },
      async (error) => {
        // Track weight even from error responses (Binance sends headers on 429)
        if (error.response?.headers) {
          const endpoint = error.config?.url?.split("?")[0] || "unknown";
          BinanceService.trackWeight(
            endpoint,
            error.response.headers as Record<string, string>,
          );
        }

        if (
          error.response?.status === 429 ||
          error.response?.status === 418
        ) {
          const retryAfter = parseInt(
            error.response.headers?.["retry-after"] || "0",
            10,
          );
          const endpoint = error.config?.url?.split("?")[0] || "unknown";
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : 60_000;
          const waitSec = Math.ceil(waitMs / 1000);

          console.warn(
            `[BinanceRateLimit] 429 received on ${endpoint}. ` +
              `Pausing for ${waitSec}s. Retry-After: ${retryAfter}s`,
          );

          // Set cooldown so scheduleRequest() fails fast with wait time
          BinanceService.cooldownEndTime = Date.now() + waitMs;

          // Drain reservoir to stop all outgoing requests
          BinanceService.limiter.updateSettings({ reservoir: 0 });

          // Restore after cooldown
          setTimeout(() => {
            console.log(
              `[BinanceRateLimit] Restoring reservoir after 429 cooldown`,
            );
            BinanceService.cooldownEndTime = 0;
            BinanceService.limiter.updateSettings({
              reservoir: BinanceService.WEIGHT_LIMIT,
            });
          }, waitMs);

          // Override error message so it surfaces the wait time to the user
          if (error.response?.data) {
            error.response.data.msg = `Rate limited by Binance. Please wait ${waitSec}s before retrying.`;
          }
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Extract and log Binance rate limit headers from a response.
   */
  private static trackWeight(
    endpoint: string,
    headers: Record<string, string>,
  ): void {
    const usedWeight = parseInt(
      headers["x-mbx-used-weight-1m"] ||
        headers["x-mbx-used-weight"] ||
        "0",
      10,
    );
    const orderCount = parseInt(
      headers["x-mbx-order-count-1m"] || "0",
      10,
    );

    if (usedWeight > 0) {
      BinanceService.lastReportedWeight = usedWeight;
      BinanceService.lastWeightUpdateTime = Date.now();

      const current = BinanceService.weightByEndpoint.get(endpoint) || 0;
      BinanceService.weightByEndpoint.set(endpoint, current + 1);

      // Dynamically sync reservoir with actual Binance-reported weight
      const remaining = BinanceService.WEIGHT_LIMIT - usedWeight;
      if (remaining >= 0) {
        BinanceService.limiter.updateSettings({ reservoir: remaining });
      }

      // Warn at threshold
      const usageRatio = usedWeight / BinanceService.WEIGHT_LIMIT;
      if (usageRatio >= BinanceService.WEIGHT_WARN_THRESHOLD) {
        console.warn(
          `[BinanceRateLimit] WARNING: Weight ${usedWeight}/${BinanceService.WEIGHT_LIMIT} ` +
            `(${(usageRatio * 100).toFixed(0)}%) - endpoint: ${endpoint}`,
        );
      }

      // Periodic summary log
      const now = Date.now();
      if (
        now - BinanceService.lastWeightLogTime >
        BinanceService.WEIGHT_LOG_INTERVAL
      ) {
        BinanceService.lastWeightLogTime = now;
        const topEndpoints = [...BinanceService.weightByEndpoint.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([ep, count]) => `${ep}:${count}`)
          .join(", ");
        console.log(
          `[BinanceRateLimit] Weight: ${usedWeight}/${BinanceService.WEIGHT_LIMIT} | ` +
            `Orders: ${orderCount} | Top endpoints: ${topEndpoints}`,
        );
        BinanceService.weightByEndpoint.clear();
      }
    }
  }

  /**
   * Get current rate limit status (useful for health checks or logging).
   */
  static getRateLimitStatus() {
    const cooldownRemaining = Math.max(
      0,
      BinanceService.cooldownEndTime - Date.now(),
    );
    // If weight data is stale, report 0% instead of misleading stale value
    const staleness = Date.now() - BinanceService.lastWeightUpdateTime;
    const isStale =
      BinanceService.lastWeightUpdateTime > 0 &&
      staleness > BinanceService.WEIGHT_STALE_MS;
    const effectiveWeight = isStale ? 0 : BinanceService.lastReportedWeight;
    return {
      lastReportedWeight: effectiveWeight,
      weightLimit: BinanceService.WEIGHT_LIMIT,
      usagePercent: (
        (effectiveWeight / BinanceService.WEIGHT_LIMIT) *
        100
      ).toFixed(1),
      cooldownRemainingSec: Math.ceil(cooldownRemaining / 1000),
      stale: isStale,
    };
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
      const signedParams = this.signRequest();
      const response = await BinanceService.scheduleRequest(() =>
        this.spotClient.get(`/api/v3/account?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getAccount error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot account",
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
          parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0,
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
      const response = await BinanceService.scheduleRequest(() =>
        this.spotClient.get(`/api/v3/openOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getOpenOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Spot open orders",
      );
    }
  }

  /**
   * Get Spot all orders (history)
   */
  async getSpotAllOrders(symbol: string, limit: number = 500) {
    try {
      const signedParams = this.signRequest({ symbol, limit });
      const response = await BinanceService.scheduleRequest(() =>
        this.spotClient.get(`/api/v3/allOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot getAllOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Spot order history",
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
      const response = await BinanceService.scheduleRequest(() =>
        this.spotClient.post(`/api/v3/order?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot placeOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to place Binance Spot order",
      );
    }
  }

  /**
   * Cancel Spot order
   */
  async cancelSpotOrder(symbol: string, orderId: number) {
    try {
      const signedParams = this.signRequest({ symbol, orderId });
      const response = await BinanceService.scheduleRequest(() =>
        this.spotClient.delete(`/api/v3/order?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Spot cancelOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to cancel Binance Spot order",
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
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v2/account?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getAccount error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures account",
      );
    }
  }

  /**
   * Get Futures wallet balance
   */
  async getFuturesBalance() {
    try {
      const signedParams = this.signRequest();
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v2/balance?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getBalance error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to fetch Binance Futures balance",
      );
    }
  }

  /**
   * Get Futures positions
   */
  async getFuturesPositions() {
    try {
      const signedParams = this.signRequest();
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v2/positionRisk?${signedParams}`),
      );
      // Filter out positions with no quantity
      return response.data.filter(
        (position: any) => parseFloat(position.positionAmt) !== 0,
      );
    } catch (error: any) {
      console.error(
        "Binance Futures getPositions error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures positions",
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
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/openOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getOpenOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures open orders",
      );
    }
  }

  /**
   * Get Futures open Algo orders (conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
   * Endpoint: GET /fapi/v1/openAlgoOrders
   */
  async getFuturesOpenAlgoOrders(symbol?: string) {
    try {
      const params: Record<string, unknown> = {};
      if (symbol) {
        params.symbol = symbol;
      }
      const signedParams = this.signRequest(params);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/openAlgoOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getOpenAlgoOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures open Algo orders",
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
    endTime?: number,
  ) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const signedParams = this.signRequest(params);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/allOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getAllOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures order history",
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
    endTime?: number,
  ) {
    try {
      const params: any = { limit };
      if (symbol) params.symbol = symbol;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const signedParams = this.signRequest(params);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/userTrades?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getUserTrades error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures trade history",
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
    endTime?: number,
  ) {
    try {
      const params: Record<string, unknown> = { limit };
      if (incomeType) params.incomeType = incomeType;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const signedParams = this.signRequest(params);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/income?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getIncomeHistory error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures income history",
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
      // Ensure boolean flags are included correctly
      const apiParams: Record<string, unknown> = { ...params };
      if (typeof apiParams["closePosition"] === "boolean") {
        apiParams["closePosition"] = (apiParams["closePosition"] as boolean)
          ? true
          : false;
      }
      const signedParams = this.signRequest(apiParams as Record<string, any>);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.post(`/fapi/v1/order?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures placeOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to place Binance Futures order",
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
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.post(`/fapi/v1/algoOrder?${signedParams}`),
      );
      console.log("Binance Algo Order response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures placeAlgoOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to place Binance Futures Algo order",
      );
    }
  }

  /**
   * Cancel Futures order
   */
  async cancelFuturesOrder(symbol: string, orderId: number) {
    try {
      const signedParams = this.signRequest({ symbol, orderId });
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.delete(`/fapi/v1/order?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to cancel Binance Futures order",
      );
    }
  }

  /**
   * Cancel Futures Algo order (conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
   * Endpoint: DELETE /fapi/v1/algoOrder
   */
  async cancelFuturesAlgoOrder(symbol: string, algoId: number) {
    try {
      const signedParams = this.signRequest({ symbol, algoId });
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.delete(`/fapi/v1/algoOrder?${signedParams}`),
      );
      console.log("Binance Algo Order cancel response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelAlgoOrder error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to cancel Binance Futures Algo order",
      );
    }
  }

  /**
   * Cancel all open Futures orders for a symbol
   */
  async cancelAllFuturesOrders(symbol: string) {
    try {
      const signedParams = this.signRequest({ symbol });
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.delete(`/fapi/v1/allOpenOrders?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures cancelAllOrders error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to cancel all Binance Futures orders",
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
          order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET",
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
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/premiumIndex`, {
          params: { symbol },
        }),
      );
      return parseFloat(response.data.markPrice);
    } catch (error: any) {
      console.error(
        "Binance Futures getMarkPrice error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures mark price",
      );
    }
  }

  /**
   * Change Futures leverage
   */
  async changeFuturesLeverage(symbol: string, leverage: number) {
    try {
      const signedParams = this.signRequest({ symbol, leverage });
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.post(`/fapi/v1/leverage?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures changeLeverage error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to change Binance Futures leverage",
      );
    }
  }

  /**
   * Change Futures margin type (ISOLATED or CROSSED)
   */
  async changeFuturesMarginType(
    symbol: string,
    marginType: "ISOLATED" | "CROSSED",
  ) {
    try {
      const signedParams = this.signRequest({ symbol, marginType });
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.post(`/fapi/v1/marginType?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures changeMarginType error:",
        error.response?.data || error.message,
      );

      // If error is "No need to change", return success
      if (error.response?.data?.code === -4046) {
        return { msg: "No need to change margin type" };
      }

      throw new Error(
        error.response?.data?.msg ||
          "Failed to change Binance Futures margin type",
      );
    }
  }

  /**
   * Get Futures leverage brackets (tier info)
   */
  async getFuturesLeverageBrackets(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const signedParams = this.signRequest(params);
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/leverageBracket?${signedParams}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getLeverageBrackets error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures leverage brackets",
      );
    }
  }

  /**
   * Get Futures Exchange Info (Symbols, rules, etc.)
   * Cached to improve performance
   */
  async getFuturesExchangeInfo() {
    // Check cache
    const now = Date.now();
    if (
      BinanceService.futuresExchangeInfoCache &&
      now - BinanceService.futuresExchangeInfoCacheTime <
        BinanceService.CACHE_TTL
    ) {
      return BinanceService.futuresExchangeInfoCache;
    }

    try {
      // Exchange info is public, but we use futuresClient to track rate-limit headers
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get('/fapi/v1/exchangeInfo'),
      );

      // Update cache
      BinanceService.futuresExchangeInfoCache = response.data;
      BinanceService.futuresExchangeInfoCacheTime = now;

      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getExchangeInfo error:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to fetch Binance Futures exchange info");
    }
  }

  /**
   * Get Futures Premium Index (Funding Rates)
   */
  async getFuturesPremiumIndex(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const response = await BinanceService.scheduleRequest(() =>
        this.futuresClient.get(`/fapi/v1/premiumIndex`, { params }),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures getPremiumIndex error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg ||
          "Failed to fetch Binance Futures premium index",
      );
    }
  }

  /**
   * Test connectivity to Spot API
   */
  async testSpotConnectivity() {
    try {
      await BinanceService.scheduleRequest(() =>
        this.spotClient.get("/api/v3/ping"),
      );
      return { status: "ok", latency: "unknown" };
    } catch (error: any) {
      throw new Error(`Spot connectivity failed: ${error.message}`);
    }
  }

  /**
   * Test connectivity to Futures API
   */
  async testFuturesConnectivity() {
    try {
      const start = Date.now();
      await BinanceService.scheduleRequest(() =>
        this.futuresClient.get("/fapi/v1/ping"),
      );
      const latency = Date.now() - start;
      return { status: "ok", latency: `${latency}ms` };
    } catch (error: any) {
      throw new Error(`Futures connectivity failed: ${error.message}`);
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

// Retry on 429 with exponential backoff (handled by Bottleneck)
BinanceService.limiter.on("failed", async (error, jobInfo) => {
  if (error?.response?.status === 429 && jobInfo.retryCount < 2) {
    const waitMs = Math.min(5000 * Math.pow(2, jobInfo.retryCount), 60000);
    console.warn(
      `[BinanceRateLimit] Retrying job after ${waitMs}ms (attempt ${jobInfo.retryCount + 1})`,
    );
    return waitMs;
  }
  return undefined;
});

// Export singleton instance - DEPRECATED: Do not use for authenticated concurrent requests
// Keeping for backward compatibility until all consumers are updated
const binanceService = new BinanceService();
export default binanceService;
