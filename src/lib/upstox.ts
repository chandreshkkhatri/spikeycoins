import { IAccount } from '@/models/account';
import axios, { AxiosInstance } from 'axios';

export interface UpstoxConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  accessToken?: string;
}

export interface UpstoxOrder {
  order_id: string;
  exchange: string;
  instrument_token: string;
  trading_symbol: string;
  product: string;
  order_type: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  trigger_price: number;
  disclosed_quantity: number;
  validity: string;
  order_status: string;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  status_message: string;
  order_timestamp: string;
  exchange_timestamp: string;
  variety: string;
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
  trading_symbol: string;
  last_price: number;
  close_price: number;
  average_price: number;
  collateral_quantity: number;
  collateral_update_quantity: number;
  exchange: string;
  instrument_token: string;
  t1_quantity: number;
  used_quantity: number;
}

export class UpstoxAPI {
  private apiKey: string;
  private apiSecret: string;
  private accessToken?: string;
  private redirectUri: string;
  private client: AxiosInstance;

  private static readonly BASE_URL = 'https://api.upstox.com';
  private static readonly API_VERSION = 'v2';

  constructor(config: UpstoxConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.accessToken = config.accessToken;
    this.redirectUri = config.redirectUri;

    this.client = axios.create({
      baseURL: `${UpstoxAPI.BASE_URL}/${UpstoxAPI.API_VERSION}`,
      timeout: 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('Upstox API Error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  // Authentication methods
  generateLoginURL(state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.apiKey,
      redirect_uri: this.redirectUri,
      state: state || 'default',
    });

    return `${UpstoxAPI.BASE_URL}/v2/login/authorization/dialog?${params.toString()}`;
  }

  async exchangeCodeForToken(authCode: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }> {
    try {
      const response = await axios.post(
        `${UpstoxAPI.BASE_URL}/v2/login/authorization/token`,
        {
          code: authCode,
          client_id: this.apiKey,
          client_secret: this.apiSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.client.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

      return tokenData;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw error;
    }
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  // User profile
  async getUserProfile(): Promise<any> {
    try {
      const response = await this.client.get('/user/profile');
      return response.data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  // Orders
  async getOrders(): Promise<UpstoxOrder[]> {
    try {
      const response = await this.client.get('/order');
      return response.data?.data || [];
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  async placeOrder(orderData: {
    quantity: number;
    product: string;
    validity: string;
    price: number;
    instrument_token: string;
    order_type: string;
    transaction_type: 'BUY' | 'SELL';
    disclosed_quantity?: number;
    trigger_price?: number;
    is_amo?: boolean;
  }): Promise<any> {
    try {
      const response = await this.client.post('/order/place', orderData);
      return response.data;
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<any> {
    try {
      const response = await this.client.delete(`/order/cancel?order_id=${orderId}`);
      return response.data;
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw error;
    }
  }

  async modifyOrder(
    orderId: string,
    orderData: {
      quantity?: number;
      validity?: string;
      price?: number;
      order_type?: string;
      disclosed_quantity?: number;
      trigger_price?: number;
    }
  ): Promise<any> {
    try {
      const response = await this.client.put('/order/modify', {
        order_id: orderId,
        ...orderData,
      });
      return response.data;
    } catch (error) {
      console.error('Error modifying order:', error);
      throw error;
    }
  }

  // Positions
  async getPositions(): Promise<UpstoxPosition[]> {
    try {
      const response = await this.client.get('/portfolio/short-term-positions');
      return response.data?.data || [];
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw error;
    }
  }

  // Holdings
  async getHoldings(): Promise<UpstoxHolding[]> {
    try {
      const response = await this.client.get('/portfolio/long-term-holdings');
      return response.data?.data || [];
    } catch (error) {
      console.error('Error fetching holdings:', error);
      throw error;
    }
  }

  // Funds and margins
  async getFunds(): Promise<any> {
    try {
      const response = await this.client.get('/user/get-funds-and-margin');
      return response.data;
    } catch (error) {
      console.error('Error fetching funds:', error);
      throw error;
    }
  }

  // Market data
  async getLTP(instrumentKey: string): Promise<any> {
    try {
      const response = await this.client.get(`/market-quote/ltp?instrument_key=${instrumentKey}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching LTP:', error);
      throw error;
    }
  }

  async getQuote(instrumentKey: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/market-quote/quotes?instrument_key=${instrumentKey}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching quote:', error);
      throw error;
    }
  }

  // Historical data
  async getHistoricalData(
    instrumentKey: string,
    interval: string,
    toDate: string,
    fromDate: string
  ): Promise<any> {
    try {
      const params = new URLSearchParams({
        instrument_key: instrumentKey,
        interval,
        to_date: toDate,
        from_date: fromDate,
      });

      const response = await this.client.get(
        `/historical-candle/${instrumentKey}/${interval}/${toDate}/${fromDate}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }
}

// Factory function to create Upstox API instance from account
export const createUpstoxClient = (account: IAccount): UpstoxAPI => {
  if (account.accountType !== 'upstox') {
    throw new Error('Invalid account type for Upstox client');
  }

  return new UpstoxAPI({
    apiKey: account.apiKey,
    apiSecret: account.apiSecret,
    accessToken: account.accessToken,
    redirectUri:
      account.metadata?.redirectUri ||
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/upstox/callback`,
  });
};

export default UpstoxAPI;
