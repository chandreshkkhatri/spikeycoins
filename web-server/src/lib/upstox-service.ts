import limiter from "./limiter";

// Import Upstox SDK components
const UpstoxClient = require("upstox-js-sdk");

/**
 * Upstox Service - Unified service for all Upstox operations
 * Implements Upstox API v2 with proper typing and error handling
 */
class UpstoxService {
  private client: any;
  private accessToken: string | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private isSandbox: boolean = false;
  private static instance: UpstoxService;

  private constructor() {
    this.client = null;
  }

  public static getInstance(): UpstoxService {
    if (!UpstoxService.instance) {
      UpstoxService.instance = new UpstoxService();
    }
    return UpstoxService.instance;
  }

  public initializeWithCredentials(
    apiKey: string,
    apiSecret: string,
    isSandbox: boolean = false
  ): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isSandbox = isSandbox;

    try {
      this.client = new UpstoxClient.ApiClient(isSandbox);
    } catch (error) {
      throw error;
    }
  }

  getUpstoxClient(): any {
    if (!this.client) {
      throw new Error(
        "Upstox client not initialized. Call initializeWithCredentials() first."
      );
    }
    return this.client;
  }

  reset(): void {
    this.accessToken = null;
    if (this.apiKey) {
      this.client = new UpstoxClient.ApiClient();
      this.client.basePath = "https://api.upstox.com/v2";
    }
  }

  setAccessToken(accessToken: string): void {
    try {
      this.accessToken = accessToken;
      const oauth = this.client.authentications["OAUTH2"];
      oauth.accessToken = accessToken;
    } catch (error) {
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
    if (!this.apiKey) {
      throw new Error(
        "API key not set. Call initializeWithCredentials() first."
      );
    }

    const baseUrl = process.env.BASE_URL || "http://localhost:3001";
    const redirectUri = `${baseUrl}/api/auth/upstox/callback`;
    const scope = this.isSandbox ? "NSE|BSE" : "NSE|BSE|NFO|CDS|MCX|BFO";
    const authDomain = this.isSandbox
      ? "https://api-sandbox.upstox.com"
      : "https://api.upstox.com";

    const fullUrl = `${authDomain}/v2/login/authorization/dialog?response_type=code&client_id=${
      this.apiKey
    }&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=upstox_auth&scope=${encodeURIComponent(scope)}`;

    return fullUrl;
  }

  async generateSession(authorizationCode: string): Promise<any> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        "API credentials not set. Call initializeWithCredentials() first."
      );
    }

    try {
      const baseUrl = process.env.BASE_URL || "http://localhost:3001";
      const redirectUri = `${baseUrl}/api/auth/upstox/callback`;

      const tokenEndpoint = this.isSandbox
        ? "https://api-sandbox.upstox.com/v2/login/authorization/token"
        : "https://api.upstox.com/v2/login/authorization/token";

      const requestData = {
        code: authorizationCode,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      };

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams(requestData).toString(),
      });

    const responseData = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(
        responseData.message ||
          responseData.error ||
          "Failed to exchange authorization code for token"
      );
    }

    if (responseData && responseData.access_token) {
      this.setAccessToken(responseData.access_token);
      return responseData;
    } else {
      throw new Error("Invalid response from token endpoint");
    }
    } catch (error: any) {
      throw error;
    }
  }

  async revokeAccessToken(): Promise<any> {
    try {
      if (!this.accessToken) {
        throw new Error("No access token to revoke");
      }

      const tokenApi = new UpstoxClient.LoginApi(this.client);
      const apiVersion = "2.0";

      const response = await limiter.schedule(() =>
        tokenApi.logout(apiVersion, this.accessToken)
      );

      this.reset();
      return response;
    } catch (error) {
      throw error;
    }
  }

  async getProfile(): Promise<any> {
    const userApi = new UpstoxClient.UserApi(this.client);
    const apiVersion = "2.0";

    return limiter.schedule(() => userApi.getProfile(apiVersion));
  }

  async getFunds(): Promise<any> {
    if (!this.client) {
      throw new Error(
        "Upstox client not initialized. Call initializeWithCredentials() first."
      );
    }

    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    if (this.isSandbox) {
      return {
        equity: {
          used_margin: 2500,
          payin_amount: 0,
          span_margin: 1200,
          adhoc_margin: 0,
          notional_cash: 10000,
          available_margin: 7500,
          exposure_margin: 800,
          option_premium: 0,
          collateral_amount: 0,
          coverage_margin: 0,
          liquidity_before: 0,
          cash_deposit: 0,
          liquid_collateral: 10000,
          stock_collateral: 0,
          unrealized_mtm: 150,
          realized_mtm: 300,
          opening_balance: 10000,
          payin_amount_t1: 0,
          payin_amount_t0: 0,
          additional_leverage_amount: 0,
          utilized_amount: 2500,
          available_credits: 0,
        },
      };
    }

    try {
      const userApi = new UpstoxClient.UserApi(this.client);
      const apiVersion = "2.0";

      const response = await limiter.schedule(() =>
        userApi.getUserFundMargin(apiVersion)
      );

      return (response as any).data;
    } catch (error) {
      throw error;
    }
  }

  async getPositions(): Promise<any[]> {
    if (!this.client) {
      throw new Error(
        "Upstox client not initialized. Call initializeWithCredentials() first."
      );
    }

    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    if (this.isSandbox) {
      return [];
    }

    try {
      const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
      const apiVersion = "2.0";

      const response = await limiter.schedule(() =>
        portfolioApi.getPositions(apiVersion)
      );

      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  async getHoldings(): Promise<any[]> {
    if (!this.client) {
      throw new Error(
        "Upstox client not initialized. Call initializeWithCredentials() first."
      );
    }

    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    if (this.isSandbox) {
      return [];
    }

    try {
      const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
      const apiVersion = "2.0";

      const response = await limiter.schedule(() =>
        portfolioApi.getHoldings(apiVersion)
      );

      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  async getOrders(): Promise<any[]> {
    if (!this.client) {
      throw new Error(
        "Upstox client not initialized. Call initializeWithCredentials() first."
      );
    }

    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    if (this.isSandbox) {
      return [];
    }

    try {
      const orderApi = new UpstoxClient.OrderApi(this.client);
      const apiVersion = "2.0";

      const response = await limiter.schedule(() =>
        orderApi.getOrderBook(apiVersion)
      );

      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  async placeOrder(params: any): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = "2.0";

    const response = await limiter.schedule(() =>
      orderApi.placeOrder(apiVersion, params)
    );
    return (response as any).data;
  }

  async modifyOrder(
    orderId: string,
    params: any
  ): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = "2.0";

    const response = await limiter.schedule(() =>
      orderApi.modifyOrder(apiVersion, orderId, params)
    );
    return (response as any).data;
  }

  async cancelOrder(orderId: string): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = "2.0";

    const response = await limiter.schedule(() =>
      orderApi.cancelOrder(apiVersion, orderId)
    );
    return (response as any).data;
  }

  async getQuote(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(",");

    const response = await limiter.schedule(() =>
      marketQuoteApi.getFullMarketQuote(instrumentKey)
    );
    return (response as any).data;
  }

  async getLTP(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(",");

    const response = await limiter.schedule(() =>
      marketQuoteApi.getLtp(instrumentKey)
    );
    return (response as any).data;
  }

  async getOHLC(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(",");

    const response = await limiter.schedule(() =>
      marketQuoteApi.getMarketQuoteOHLC(instrumentKey)
    );
    return (response as any).data;
  }

  async getHistoricalData(
    instrumentKey: string,
    interval: string,
    toDate: string,
    fromDate?: string
  ): Promise<any> {
    if (!this.accessToken) {
      throw new Error("Access token not set. Call setAccessToken() first.");
    }

    const to = toDate;
    const from =
      fromDate ||
      new Date(new Date(to).getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(
      instrumentKey
    )}/${encodeURIComponent(interval)}/${encodeURIComponent(
      to
    )}/${encodeURIComponent(from)}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "Api-Version": "2.0",
      },
    });

    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      let message = "Failed to fetch historical data";
      if (
        data?.errors &&
        Array.isArray(data.errors) &&
        data.errors.length > 0
      ) {
        message = data.errors[0].message || message;
      } else if (data?.message) {
        message = data.message;
      } else if (data?.error) {
        message = data.error;
      }

      if (resp.status === 401) {
        const err: any = new Error(
          `Authentication failed: ${message}. Please re-authenticate your Upstox account.`
        );
        err.code = "TOKEN_EXPIRED";
        err.statusCode = 401;
        throw err;
      }

      throw new Error(`Upstox API error: ${resp.status} - ${message}`);
    }

    return data?.data?.candles || [];
  }

  async convertPosition(params: any): Promise<boolean> {
    const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
    const apiVersion = "2.0";

    const response = await limiter.schedule(() =>
      portfolioApi.convertPosition(apiVersion, params)
    );
    return (response as any).data;
  }
}

const upstoxService = UpstoxService.getInstance();
export default upstoxService;








