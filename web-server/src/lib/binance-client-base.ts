import crypto from "crypto";
import axios, { AxiosInstance } from "axios";
import Bottleneck from "bottleneck";

/**
 * Binance Client Base - Handles connections, credentials, signing, and rate limiting
 */
export class BinanceClientBase {
  protected apiKey: string = "";
  protected apiSecret: string = "";
  public spotClient: AxiosInstance;
  public futuresClient: AxiosInstance;
  protected testnet: boolean = false;

  // Cache for exchange info to avoid excessive API calls - STATIC (Shared)
  public static futuresExchangeInfoCache: unknown = null;
  public static futuresExchangeInfoCacheTime: number = 0;
  public static spotExchangeInfoCache: unknown = null;
  public static spotExchangeInfoCacheTime: number = 0;
  public static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  // ── Rate Limiting (shared across all instances) ──────────────
  protected static readonly WEIGHT_LIMIT = 1200; // Binance 1-min IP weight limit
  protected static readonly WEIGHT_WARN_THRESHOLD = 0.8; // Log warning at 80%

  public static readonly limiter = new Bottleneck({
    reservoir: 600,
    reservoirRefreshAmount: 1200,
    reservoirRefreshInterval: 60 * 1000,
    maxConcurrent: 5,
    minTime: 100,
  });

  // ── Monitoring State ─────────────────────────────────────────
  protected static lastReportedWeight: number = 0;
  protected static lastWeightUpdateTime: number = 0;
  protected static readonly WEIGHT_STALE_MS = 120_000;
  protected static weightByEndpoint: Map<string, number> = new Map();
  protected static lastWeightLogTime: number = 0;
  protected static readonly WEIGHT_LOG_INTERVAL = 30_000;
  protected static cooldownEndTime: number = 0;

  // ── Schedule Timeout ─────────────────────────────────────────
  protected static readonly SCHEDULE_TIMEOUT_MS = 15_000;

  // ── Clock Synchronization ───────────────────────────────────
  protected static timeOffset: number = 0;
  protected static isTimeSynced: boolean = false;

  // ── Endpoint Weights Estimation ─────────────────────────────
  private static readonly ENDPOINT_WEIGHTS: Record<string, number> = {
    "/fapi/v1/exchangeInfo": 40,
    "/api/v3/exchangeInfo": 20,
    "/fapi/v2/account": 5,
    "/api/v3/account": 20,
    "/fapi/v2/balance": 5,
    "/fapi/v2/positionRisk": 5,
    "/fapi/v1/openOrders": 5,
    "/api/v3/openOrders": 6,
    "/fapi/v1/allOrders": 5,
    "/api/v3/allOrders": 20,
    "/fapi/v1/userTrades": 5,
    "/api/v3/myTrades": 20,
    "/fapi/v1/income": 30,
    "/fapi/v1/order": 1,
    "/api/v3/order": 1,
    "/fapi/v1/algoOrder": 1,
    "/fapi/v1/allOpenOrders": 1,
  };

  private static getWeightForEndpoint(endpoint: string): number {
    for (const [path, weight] of Object.entries(BinanceClientBase.ENDPOINT_WEIGHTS)) {
      if (endpoint.includes(path)) {
        return weight;
      }
    }
    return 1;
  }

  /**
   * Sync clock offset with Binance server time
   */
  public static async syncTime(testnet = false): Promise<void> {
    try {
      const url = testnet 
        ? "https://testnet.binance.vision/api/v3/time" 
        : "https://api.binance.com/api/v3/time";
      const startTime = Date.now();
      const response = await axios.get(url, { timeout: 5000 });
      const endTime = Date.now();
      const serverTime = response.data.serverTime;
      const estimatedLocalTime = Math.round((startTime + endTime) / 2);
      BinanceClientBase.timeOffset = serverTime - estimatedLocalTime;
      BinanceClientBase.isTimeSynced = true;
      console.log(`[BinanceTimeSync] Synced with Binance (${testnet ? "testnet" : "mainnet"}). Offset: ${BinanceClientBase.timeOffset}ms`);
    } catch (err: unknown) {
      const error = err as Error;
      console.warn(`[BinanceTimeSync] Failed to sync time with Binance, using local system time:`, error.message);
    }
  }

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

    // Sync clock offset in the background
    BinanceClientBase.syncTime(testnet).catch(() => {});
  }

  /**
   * Schedule a request through the shared rate limiter.
   */
  static scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
    const remaining = BinanceClientBase.cooldownEndTime - Date.now();
    if (remaining > 0) {
      const waitSec = Math.ceil(remaining / 1000);
      const error = new Error(
        `Rate limited by Binance. Please wait ${waitSec}s before retrying.`,
      ) as Error & { status?: number };
      error.status = 429;
      return Promise.reject(error);
    }

    const staleness = Date.now() - BinanceClientBase.lastWeightUpdateTime;
    if (
      BinanceClientBase.lastWeightUpdateTime > 0 &&
      staleness > BinanceClientBase.WEIGHT_STALE_MS
    ) {
      console.log(
        `[BinanceRateLimit] Weight data stale (${Math.round(staleness / 1000)}s), resetting reservoir`,
      );
      BinanceClientBase.lastReportedWeight = 0;
      BinanceClientBase.lastWeightUpdateTime = Date.now();
      BinanceClientBase.limiter.updateSettings({
        reservoir: BinanceClientBase.WEIGHT_LIMIT,
      });
    }

    const INNER_TIMEOUT_MS = BinanceClientBase.SCHEDULE_TIMEOUT_MS;

    return BinanceClientBase.limiter.schedule(
      { expiration: BinanceClientBase.SCHEDULE_TIMEOUT_MS },
      () => {
        return new Promise<T>((resolve, reject) => {
          const timeout = setTimeout(() => {
            const err = new Error(
              'Binance API request timed out (rate limiter queue stall)',
            ) as Error & { status?: number };
            err.status = 504;
            reject(err);
          }, INNER_TIMEOUT_MS);

          fn()
            .then((result) => {
              clearTimeout(timeout);
              resolve(result);
            })
            .catch((err) => {
              clearTimeout(timeout);
              reject(err);
            });
        });
      },
    );
  }

  /**
   * Attach rate-limit response and request interceptors to an axios instance.
   */
  private attachInterceptors(client: AxiosInstance): void {
    // Request Interceptor: Proactive weight estimation
    client.interceptors.request.use(
      async (config) => {
        const endpoint = config.url?.split("?")[0] || "unknown";
        const estimatedWeight = BinanceClientBase.getWeightForEndpoint(endpoint);
        if (estimatedWeight > 1) {
          try {
            const currentReservoir = await BinanceClientBase.limiter.currentReservoir();
            if (currentReservoir !== null) {
              const newReservoir = Math.max(0, currentReservoir - (estimatedWeight - 1));
              BinanceClientBase.limiter.updateSettings({ reservoir: newReservoir });
            }
          } catch (err) {
            // Ignore settings update errors
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response Interceptor: Reactive weight correction & cooldown handling
    client.interceptors.response.use(
      (response) => {
        const endpoint = response.config.url?.split("?")[0] || "unknown";
        BinanceClientBase.trackWeight(
          endpoint,
          response.headers as Record<string, string>,
        );
        return response;
      },
      async (error) => {
        if (error.response?.headers) {
          const endpoint = error.config?.url?.split("?")[0] || "unknown";
          BinanceClientBase.trackWeight(
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

          BinanceClientBase.cooldownEndTime = Date.now() + waitMs;
          BinanceClientBase.limiter.updateSettings({ reservoir: 0 });

          setTimeout(() => {
            console.log(
              `[BinanceRateLimit] Restoring reservoir after 429 cooldown`,
            );
            BinanceClientBase.cooldownEndTime = 0;
            BinanceClientBase.limiter.updateSettings({
              reservoir: BinanceClientBase.WEIGHT_LIMIT,
            });
          }, waitMs);

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
      BinanceClientBase.lastReportedWeight = usedWeight;
      BinanceClientBase.lastWeightUpdateTime = Date.now();

      const current = BinanceClientBase.weightByEndpoint.get(endpoint) || 0;
      BinanceClientBase.weightByEndpoint.set(endpoint, current + 1);

      const remaining = BinanceClientBase.WEIGHT_LIMIT - usedWeight;
      if (remaining >= 0) {
        BinanceClientBase.limiter.updateSettings({ reservoir: remaining });
      }

      const usageRatio = usedWeight / BinanceClientBase.WEIGHT_LIMIT;
      if (usageRatio >= BinanceClientBase.WEIGHT_WARN_THRESHOLD) {
        console.warn(
          `[BinanceRateLimit] WARNING: Weight ${usedWeight}/${BinanceClientBase.WEIGHT_LIMIT} ` +
            `(${(usageRatio * 100).toFixed(0)}%) - endpoint: ${endpoint}`,
        );
      }

      const now = Date.now();
      if (
        now - BinanceClientBase.lastWeightLogTime >
        BinanceClientBase.WEIGHT_LOG_INTERVAL
      ) {
        BinanceClientBase.lastWeightLogTime = now;
        const topEndpoints = [...BinanceClientBase.weightByEndpoint.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([ep, count]) => `${ep}:${count}`)
          .join(", ");
        console.log(
          `[BinanceRateLimit] Weight: ${usedWeight}/${BinanceClientBase.WEIGHT_LIMIT} | ` +
            `Orders: ${orderCount} | Top endpoints: ${topEndpoints}`,
        );
        BinanceClientBase.weightByEndpoint.clear();
      }
    }
  }

  /**
   * Get current rate limit status.
   */
  static getRateLimitStatus() {
    const cooldownRemaining = Math.max(
      0,
      BinanceClientBase.cooldownEndTime - Date.now(),
    );
    const staleness = Date.now() - BinanceClientBase.lastWeightUpdateTime;
    const isStale =
      BinanceClientBase.lastWeightUpdateTime > 0 &&
      staleness > BinanceClientBase.WEIGHT_STALE_MS;
    const effectiveWeight = isStale ? 0 : BinanceClientBase.lastReportedWeight;
    return {
      lastReportedWeight: effectiveWeight,
      weightLimit: BinanceClientBase.WEIGHT_LIMIT,
      usagePercent: (
        (effectiveWeight / BinanceClientBase.WEIGHT_LIMIT) *
        100
      ).toFixed(1),
      cooldownRemainingSec: Math.ceil(cooldownRemaining / 1000),
      stale: isStale,
    };
  }

  /**
   * Generate signature for authenticated requests
   */
  public generateSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  /**
   * Add timestamp and signature to params
   */
  public signRequest(params: Record<string, unknown> = {}): string {
    const timestamp = Date.now() + BinanceClientBase.timeOffset;

    const entries: Record<string, string> = {};
    if (params.recvWindow === undefined) {
      entries.recvWindow = "10000";
    }

    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      entries[k] = typeof v === "string" ? v : String(v);
    }
    entries.timestamp = timestamp.toString();

    const queryString = new URLSearchParams(entries).toString();
    const signature = this.generateSignature(queryString);
    return `${queryString}&signature=${signature}`;
  }
}

// Retry on 429 with exponential backoff (handled by Bottleneck)
BinanceClientBase.limiter.on("failed", async (error, jobInfo) => {
  if (error?.response?.status === 429 && jobInfo.retryCount < 2) {
    const waitMs = Math.min(5000 * Math.pow(2, jobInfo.retryCount), 60000);
    console.warn(
      `[BinanceRateLimit] Retrying job after ${waitMs}ms (attempt ${jobInfo.retryCount + 1})`,
    );
    return waitMs;
  }
  return undefined;
});
