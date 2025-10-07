import limiter from './limiter';

// Import Upstox SDK components
const UpstoxClient = require('upstox-js-sdk');

// Define types for Upstox responses
export interface UpstoxOrder {
  order_id: string;
  exchange_order_id: string;
  placed_by: string;
  variety: string;
  status: string;
  tag: string;
  exchange: string;
  instrument_token: string;
  trading_symbol: string;
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
  order_timestamp: string;
  exchange_timestamp: string;
  status_message: string;
}

export interface UpstoxPosition {
  exchange: string;
  multiplier: number;
  value: number;
  pnl: number;
  product: string;
  instrument_token: string;
  average_price: number;
  buy_value: number;
  overnight_quantity: number;
  day_buy_value: number;
  day_buy_price: number;
  overnight_buy_amount: number;
  overnight_buy_quantity: number;
  day_buy_quantity: number;
  day_sell_value: number;
  day_sell_price: number;
  overnight_sell_amount: number;
  overnight_sell_quantity: number;
  day_sell_quantity: number;
  quantity: number;
  last_price: number;
  unrealised: number;
  realised: number;
  sell_value: number;
  tradingsymbol: string;
  trading_symbol: string;
  close_price: number;
  buy_price: number;
  sell_price: number;
}

export interface UpstoxHolding {
  isin: string;
  cnc_used_quantity: number;
  collateral_type: string;
  company_name: string;
  haircut: number;
  product: string;
  quantity: number;
  tradingsymbol: string;
  trading_symbol: string;
  last_price: number;
  close_price: number;
  average_price: number;
  collateral_quantity: number;
  collateral_update_quantity: number;
  t1_quantity: number;
  exchange: string;
  instrument_token: string;
  pnl: number;
}

export interface UpstoxFunds {
  equity: {
    used_margin: number;
    payin_amount: number;
    span_margin: number;
    adhoc_margin: number;
    notional_cash: number;
    available_margin: number;
    exposure_margin: number;
    option_premium: number;
    collateral_amount: number;
    coverage_margin: number;
    liquidity_before: number;
    cash_deposit: number;
    liquid_collateral: number;
    stock_collateral: number;
    unrealized_mtm: number;
    realized_mtm: number;
    opening_balance: number;
    payin_amount_t1: number;
    payin_amount_t0: number;
    additional_leverage_amount: number;
    utilized_amount: number;
    available_credits: number;
  };
  _serviceHoursError?: boolean;
  _errorMessage?: string;
}

export interface UpstoxOrderParams {
  quantity: number;
  product: 'I' | 'D' | 'CO' | 'OCO';
  validity: 'DAY' | 'IOC';
  price: number;
  tag?: string;
  instrument_token: string;
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  transaction_type: 'BUY' | 'SELL';
  disclosed_quantity?: number;
  trigger_price?: number;
  is_amo?: boolean;
}

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
    // Initialize without credentials - will be set later
    this.client = null;
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): UpstoxService {
    if (!UpstoxService.instance) {
      UpstoxService.instance = new UpstoxService();
    }
    return UpstoxService.instance;
  }

  /**
   * Initialize with API credentials from account
   */
  public initializeWithCredentials(
    apiKey: string,
    apiSecret: string,
    isSandbox: boolean = false
  ): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isSandbox = isSandbox;

    try {
      // Initialize the API client with sandbox flag
      // According to SDK docs: new UpstoxClient.ApiClient(true) for sandbox
      this.client = new UpstoxClient.ApiClient(isSandbox);

      if (isSandbox) {
        // Using sandbox environment
      } else {
        // Using production environment
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the Upstox client instance
   */
  getUpstoxClient(): any {
    if (!this.client) {
      throw new Error('Upstox client not initialized. Call initializeWithCredentials() first.');
    }
    return this.client;
  }

  /**
   * Reset the service (logout)
   */
  reset(): void {
    this.accessToken = null;
    // Reinitialize client if credentials are available
    if (this.apiKey) {
      this.client = new UpstoxClient.ApiClient();
      this.client.basePath = 'https://api.upstox.com/v2';
    }
  }

  /**
   * Set access token after authentication
   */
  setAccessToken(accessToken: string): void {
    try {
      this.accessToken = accessToken;
      // Configure OAuth2 authentication
      const oauth = this.client.authentications['OAUTH2'];
      oauth.accessToken = accessToken;
    } catch (error) {
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
    if (!this.apiKey) {
      throw new Error('API key not set. Call initializeWithCredentials() first.');
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/upstox/callback`;

    // Sandbox apps need to use a minimal scope or specific test scope
    // According to Upstox SDK docs, sandbox might require different scope handling
    const scope = this.isSandbox ? 'NSE|BSE' : 'NSE|BSE|NFO|CDS|MCX|BFO';

    // Use sandbox OAuth domain for sandbox apps
    // This matches the client base path that the SDK automatically sets
    const authDomain = this.isSandbox ? 'https://api-sandbox.upstox.com' : 'https://api.upstox.com';

    console.log('=== Upstox Login URL Debug ===');
    console.log('Environment:', this.isSandbox ? 'SANDBOX' : 'PRODUCTION');
    console.log('Auth Domain:', authDomain);
    console.log('Base URL:', baseUrl);
    console.log('Redirect URI (raw):', redirectUri);
    console.log('Redirect URI (encoded):', encodeURIComponent(redirectUri));
    console.log('Client ID:', this.apiKey);
    console.log('Client ID length:', this.apiKey?.length);
    console.log(
      'Client ID format check (UUID-like):',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.apiKey)
    );
    console.log('Scope (raw):', scope);
    console.log('Scope (encoded):', encodeURIComponent(scope));

    // Try to validate redirect URI format
    try {
      const uri = new URL(redirectUri);
      // Valid redirect URI format
    } catch (e) {
      // Invalid redirect URI format
    }

    const fullUrl = `${authDomain}/v2/login/authorization/dialog?response_type=code&client_id=${this.apiKey}&redirect_uri=${encodeURIComponent(redirectUri)}&state=upstox_auth&scope=${encodeURIComponent(scope)}`;

    return fullUrl;
  }

  /**
   * Generate session from authorization code
   */
  async generateSession(authorizationCode: string): Promise<any> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('API credentials not set. Call initializeWithCredentials() first.');
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const redirectUri = `${baseUrl}/api/auth/upstox/callback`;

      console.log('=== Upstox Session Generation Debug ===');
      console.log('Environment:', this.isSandbox ? 'SANDBOX' : 'PRODUCTION');
      console.log('Redirect URI:', redirectUri);
      console.log('Client ID:', this.apiKey);
      console.log('Authorization Code:', authorizationCode?.substring(0, 10) + '...');

      // Use direct fetch to avoid the superagent ".end() called twice" error
      const tokenEndpoint = this.isSandbox
        ? 'https://api-sandbox.upstox.com/v2/login/authorization/token'
        : 'https://api.upstox.com/v2/login/authorization/token';

      const requestData = {
        code: authorizationCode,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      };

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(requestData).toString(),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            'Failed to exchange authorization code for token'
        );
      }

      if (responseData && responseData.access_token) {
        this.setAccessToken(responseData.access_token);
        return responseData;
      } else {
        throw new Error('Invalid response from token endpoint');
      }
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Debug function to validate Upstox app configuration
   * Call this to check if sandbox credentials and configuration are correct
   */
  debugAppConfiguration(): any {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/upstox/callback`;

    const debugInfo = {
      environment: this.isSandbox ? 'SANDBOX' : 'PRODUCTION',
      clientInitialized: !!this.client,
      clientBasePath: this.client?.basePath,
      apiKey: this.apiKey,
      apiKeyValid: !!(
        this.apiKey &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.apiKey)
      ),
      apiKeyLength: this.apiKey?.length,
      apiSecretProvided: !!this.apiSecret,
      redirectUri,
      redirectUriValid: this.isValidUrl(redirectUri),
      scope: this.isSandbox ? 'NSE|BSE' : 'NSE|BSE|NFO|CDS|MCX|BFO',
      loginUrl: this.getLoginURL(),
      recommendations: this.getConfigurationRecommendations(),
    };

    return debugInfo;
  }

  /**
   * Check if URL is valid
   */
  private isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get configuration recommendations based on current settings
   */
  private getConfigurationRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this.apiKey) {
      recommendations.push('API Key is missing');
    } else if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.apiKey)
    ) {
      recommendations.push('API Key format appears invalid (should be UUID format)');
    }

    if (!this.apiSecret) {
      recommendations.push('API Secret is missing');
    }

    if (this.isSandbox) {
      recommendations.push(
        'Using SANDBOX environment - ensure your app is configured as a sandbox app in Upstox Developer Portal'
      );
      recommendations.push(
        'Verify that the redirect URI is exactly: http://localhost:3000/api/auth/upstox/callback'
      );
      recommendations.push(
        'Sandbox apps might have limited scope access - using minimal scope NSE|BSE'
      );
    } else {
      recommendations.push(
        'Using PRODUCTION environment - ensure your app is live in Upstox Developer Portal'
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    if (baseUrl === 'http://localhost:3000' && !this.isSandbox) {
      recommendations.push('Production apps typically require HTTPS redirect URIs, not localhost');
    }

    return recommendations;
  }

  /**
   * Revoke access token (logout)
   */
  async revokeAccessToken(): Promise<any> {
    try {
      if (!this.accessToken) {
        throw new Error('No access token to revoke');
      }

      const tokenApi = new UpstoxClient.LoginApi(this.client);
      const apiVersion = '2.0';

      const response = await limiter.schedule(() => tokenApi.logout(apiVersion, this.accessToken));

      this.reset();
      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(): Promise<any> {
    const userApi = new UpstoxClient.UserApi(this.client);
    const apiVersion = '2.0';

    return limiter.schedule(() => userApi.getProfile(apiVersion));
  }

  /**
   * Get funds and margins
   */
  async getFunds(): Promise<UpstoxFunds> {
    if (!this.client) {
      throw new Error('Upstox client not initialized. Call initializeWithCredentials() first.');
    }

    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    // For sandbox mode, return mock data since many APIs are not available
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
      // Use SDK method instead of direct API call
      const userApi = new UpstoxClient.UserApi(this.client);
      const apiVersion = '2.0';

      const response = await limiter.schedule(() =>
        userApi.getUserFundMargin(apiVersion)
      );

      // SDK methods throw errors for HTTP failures, so we can directly use the response
      return (response as any).data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get positions
   */
  async getPositions(): Promise<UpstoxPosition[]> {
    if (!this.client) {
      throw new Error('Upstox client not initialized. Call initializeWithCredentials() first.');
    }

    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    // For sandbox mode, return mock data
    if (this.isSandbox) {
      return [
        {
          exchange: 'NSE',
          multiplier: 1,
          value: 250000,
          pnl: 5000,
          product: 'I',
          instrument_token: 'NSE_EQ|INE002A01018',
          average_price: 2450,
          buy_value: 245000,
          overnight_quantity: 0,
          day_buy_value: 245000,
          day_buy_price: 2450,
          overnight_buy_amount: 0,
          overnight_buy_quantity: 0,
          day_buy_quantity: 100,
          day_sell_value: 0,
          day_sell_price: 0,
          overnight_sell_amount: 0,
          overnight_sell_quantity: 0,
          day_sell_quantity: 0,
          quantity: 100,
          last_price: 2500,
          unrealised: 5000,
          realised: 0,
          sell_value: 0,
          tradingsymbol: 'RELIANCE',
          trading_symbol: 'RELIANCE',
          close_price: 2460,
          buy_price: 2450,
          sell_price: 0,
        },
      ];
    }

    try {
      // Use SDK method instead of direct API call
      const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
      const apiVersion = '2.0';

      const response = await limiter.schedule(() =>
        portfolioApi.getPositions(apiVersion)
      );

      // Return the positions array from the response
      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get holdings
   */
  async getHoldings(): Promise<UpstoxHolding[]> {
    if (!this.client) {
      throw new Error('Upstox client not initialized. Call initializeWithCredentials() first.');
    }

    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    // For sandbox mode, return mock data
    if (this.isSandbox) {
      return [
        {
          isin: 'INE002A01018',
          cnc_used_quantity: 0,
          collateral_type: null,
          company_name: 'Reliance Industries Limited',
          haircut: 0.1,
          product: 'D',
          quantity: 100,
          tradingsymbol: 'RELIANCE',
          trading_symbol: 'RELIANCE',
          last_price: 2500,
          close_price: 2480,
          average_price: 2300,
          collateral_quantity: 0,
          collateral_update_quantity: 0,
          t1_quantity: 0,
          exchange: 'NSE',
          instrument_token: 'NSE_EQ|INE002A01018',
          pnl: 20000,
        },
        {
          isin: 'INE467B01029',
          cnc_used_quantity: 0,
          collateral_type: null,
          company_name: 'Tata Consultancy Services Ltd',
          haircut: 0.1,
          product: 'D',
          quantity: 50,
          tradingsymbol: 'TCS',
          trading_symbol: 'TCS',
          last_price: 3800,
          close_price: 3750,
          average_price: 3500,
          collateral_quantity: 0,
          collateral_update_quantity: 0,
          t1_quantity: 0,
          exchange: 'NSE',
          instrument_token: 'NSE_EQ|INE467B01029',
          pnl: 15000,
        },
      ];
    }

    try {
      // Use SDK method instead of direct API call
      const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
      const apiVersion = '2.0';

      const response = await limiter.schedule(() =>
        portfolioApi.getHoldings(apiVersion)
      );

      // Return the holdings array from the response
      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get sandbox orders for testing
   */
  private getSandboxOrders(): UpstoxOrder[] {
    return [
      {
        order_id: 'MOCK_ORDER_001',
        exchange_order_id: '1000000012345678',
        placed_by: 'demo_user',
        variety: 'regular',
        status: 'COMPLETE',
        tag: '',
        exchange: 'NSE',
        instrument_token: 'NSE_EQ|INE002A01018',
        trading_symbol: 'RELIANCE',
        order_type: 'LIMIT',
        transaction_type: 'BUY',
        validity: 'DAY',
        product: 'D',
        quantity: 10,
        disclosed_quantity: 0,
        price: 2450.0,
        trigger_price: 0,
        average_price: 2448.5,
        filled_quantity: 10,
        pending_quantity: 0,
        order_timestamp: new Date().toISOString(),
        exchange_timestamp: new Date().toISOString(),
        status_message: 'Order completed successfully',
      },
      {
        order_id: 'MOCK_ORDER_002',
        exchange_order_id: '1000000012345679',
        placed_by: 'demo_user',
        variety: 'regular',
        status: 'OPEN',
        tag: '',
        exchange: 'NSE',
        instrument_token: 'NSE_EQ|INE467B01029',
        trading_symbol: 'TCS',
        order_type: 'LIMIT',
        transaction_type: 'SELL',
        validity: 'DAY',
        product: 'D',
        quantity: 5,
        disclosed_quantity: 0,
        price: 3850.0,
        trigger_price: 0,
        average_price: 0,
        filled_quantity: 0,
        pending_quantity: 5,
        order_timestamp: new Date().toISOString(),
        exchange_timestamp: new Date().toISOString(),
        status_message: 'Order is open',
      },
      {
        order_id: 'MOCK_ORDER_003',
        exchange_order_id: '1000000012345680',
        placed_by: 'demo_user',
        variety: 'regular',
        status: 'CANCELLED',
        tag: '',
        exchange: 'NSE',
        instrument_token: 'NSE_EQ|INE040A01034',
        trading_symbol: 'HDFC',
        order_type: 'MARKET',
        transaction_type: 'BUY',
        validity: 'DAY',
        product: 'D',
        quantity: 20,
        disclosed_quantity: 0,
        price: 0,
        trigger_price: 0,
        average_price: 0,
        filled_quantity: 0,
        pending_quantity: 0,
        order_timestamp: new Date().toISOString(),
        exchange_timestamp: new Date().toISOString(),
        status_message: 'Order cancelled by user',
      },
    ];
  }

  /**
   * Get orders
   */
  async getOrders(): Promise<UpstoxOrder[]> {
    if (!this.client) {
      throw new Error('Upstox client not initialized. Call initializeWithCredentials() first.');
    }

    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    if (this.isSandbox) {
      return this.getSandboxOrders();
    }

    try {
      // Use SDK method instead of direct API call
      const orderApi = new UpstoxClient.OrderApi(this.client);
      const apiVersion = '2.0';

      const response = await limiter.schedule(() =>
        orderApi.getOrderBook(apiVersion)
      );

      // Return the orders array from the response
      const responseData = (response as any).data;
      if (responseData) {
        return Array.isArray(responseData) ? responseData : [];
      }

      return [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<UpstoxOrder[]> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() => orderApi.getOrderDetails(apiVersion, orderId));
    return (response as any).data;
  }

  /**
   * Get trades
   */
  async getTrades(): Promise<any[]> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() => orderApi.getTradeBook(apiVersion));
    return (response as any).data;
  }

  /**
   * Place an order
   */
  async placeOrder(params: UpstoxOrderParams): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() => orderApi.placeOrder(apiVersion, params));
    return (response as any).data;
  }

  /**
   * Modify an order
   */
  async modifyOrder(
    orderId: string,
    params: Partial<UpstoxOrderParams>
  ): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() =>
      orderApi.modifyOrder(apiVersion, orderId, params)
    );
    return (response as any).data;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ order_id: string }> {
    const orderApi = new UpstoxClient.OrderApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() => orderApi.cancelOrder(apiVersion, orderId));
    return (response as any).data;
  }

  /**
   * Get quote for instruments (v3 API)
   */
  async getQuote(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(',');

    const response = await limiter.schedule(() =>
      marketQuoteApi.getFullMarketQuote(instrumentKey)
    );
    return (response as any).data;
  }

  /**
   * Get LTP for instruments (v3 API)
   */
  async getLTP(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(',');

    const response = await limiter.schedule(() => marketQuoteApi.getLtp(instrumentKey));
    return (response as any).data;
  }

  /**
   * Get OHLC for instruments (v3 API)
   */
  async getOHLC(instruments: string[]): Promise<any> {
    const marketQuoteApi = new UpstoxClient.MarketQuoteApi(this.client);
    const instrumentKey = instruments.join(',');

    const response = await limiter.schedule(() =>
      marketQuoteApi.getMarketQuoteOHLC(instrumentKey)
    );
    return (response as any).data;
  }

  /**
   * Get historical data
   */
  async getHistoricalData(
    instrumentKey: string,
    interval: string,
    toDate: string,
    fromDate?: string
  ): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    // Ensure fromDate exists; default to 30 days before toDate
    const to = toDate;
    const from =
      fromDate ||
      new Date(new Date(to).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(
      instrumentKey
    )}/${encodeURIComponent(interval)}/${encodeURIComponent(to)}/${encodeURIComponent(from)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        'Api-Version': '2.0',
      },
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Bubble up a meaningful error
      let message = 'Failed to fetch historical data';
      if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        message = data.errors[0].message || message;
      } else if (data?.message) {
        message = data.message;
      } else if (data?.error) {
        message = data.error;
      }

      // Map auth issues to a clearer code
      if (resp.status === 401) {
        const err: any = new Error(
          `Authentication failed: ${message}. Please re-authenticate your Upstox account.`
        );
        err.code = 'TOKEN_EXPIRED';
        err.statusCode = 401;
        throw err;
      }

      throw new Error(`Upstox API error: ${resp.status} - ${message}`);
    }

    // V2 returns { data: { candles: [...] } }
    return data?.data?.candles || [];
  }

  /**
   * Get historical data V3 (unit + interval)
   * Supports minutes(1..300), hours(1..5), days(1), weeks(1), months(1)
   */
  async getHistoricalDataV3(
    instrumentKey: string,
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months',
    interval: string | number,
    toDate: string,
    fromDate?: string
  ): Promise<any[]> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }

    const to = toDate;
    const from =
      fromDate ||
      new Date(new Date(to).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const base = this.isSandbox ? 'https://api-sandbox.upstox.com' : 'https://api.upstox.com';
    const url = `${base}/v3/historical-candle/${encodeURIComponent(
      instrumentKey
    )}/${encodeURIComponent(unit)}/${encodeURIComponent(String(interval))}/${encodeURIComponent(
      to
    )}/${encodeURIComponent(from)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    let data: any = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    if (!resp.ok) {
      let message = 'Failed to fetch historical data (v3)';
      if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
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
        err.code = 'TOKEN_EXPIRED';
        err.statusCode = 401;
        throw err;
      }

      throw new Error(`Upstox API v3 error: ${resp.status} - ${message}`);
    }

    return data?.data?.candles || [];
  }

  /**
   * Convert position
   */
  async convertPosition(params: {
    instrument_token: string;
    new_product: string;
    old_product: string;
    transaction_type: 'BUY' | 'SELL';
    quantity: number;
  }): Promise<boolean> {
    const portfolioApi = new UpstoxClient.PortfolioApi(this.client);
    const apiVersion = '2.0';

    const response = await limiter.schedule(() => portfolioApi.convertPosition(apiVersion, params));
    return (response as any).data;
  }
}

// Export singleton instance
const upstoxService = UpstoxService.getInstance();
export default upstoxService;

// Export for backward compatibility
export const {
  getProfile,
  getFunds,
  getPositions,
  getHoldings,
  getOrders,
  getTrades,
  getQuote,
  getLTP,
  getOHLC,
  getHistoricalData,
  placeOrder,
  modifyOrder,
  cancelOrder,
  checkAuth,
} = {
  getProfile: () => upstoxService.getProfile(),
  getFunds: () => upstoxService.getFunds(),
  getPositions: () => upstoxService.getPositions(),
  getHoldings: () => upstoxService.getHoldings(),
  getOrders: () => upstoxService.getOrders(),
  getTrades: () => upstoxService.getTrades(),
  getQuote: (instruments: string[]) => upstoxService.getQuote(instruments),
  getLTP: (instruments: string[]) => upstoxService.getLTP(instruments),
  getOHLC: (instruments: string[]) => upstoxService.getOHLC(instruments),
  getHistoricalData: (instrumentKey: string, interval: string, toDate: string, fromDate?: string) =>
    upstoxService.getHistoricalData(instrumentKey, interval, toDate, fromDate),
  placeOrder: (params: any) => upstoxService.placeOrder(params),
  modifyOrder: (orderId: string, params: any) => upstoxService.modifyOrder(orderId, params),
  cancelOrder: (orderId: string) => upstoxService.cancelOrder(orderId),
  checkAuth: () => upstoxService.isLoggedIn(),
};

// Export types
export type { UpstoxService };
