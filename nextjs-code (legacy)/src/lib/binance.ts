import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import crypto from 'crypto';

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface BinanceFuturesOrder {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  reduceOnly: boolean;
  closePosition: boolean;
  side: 'BUY' | 'SELL';
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  stopPrice: string;
  workingType: string;
  priceProtect: boolean;
  origType: string;
  time: number;
  updateTime: number;
}

export interface BinanceFuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  breakEvenPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: 'BOTH' | 'LONG' | 'SHORT';
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  isolated: boolean;
  adlQuantile: number;
}

export interface BinanceAccountInfo {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  updateTime: number;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: Array<{
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    maintMargin: string;
    initialMargin: string;
    positionInitialMargin: string;
    openOrderInitialMargin: string;
    maxWithdrawAmount: string;
    crossWalletBalance: string;
    crossUnPnl: string;
    availableBalance: string;
    marginAvailable: boolean;
    updateTime: number;
  }>;
  positions: BinanceFuturesPosition[];
}

export class BinanceAPI {
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;
  private client: AxiosInstance;
  private limiter: Bottleneck;

  constructor(config: BinanceConfig) {
    // Validate and clean API credentials
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('API key and secret are required');
    }

    this.apiKey = config.apiKey.trim();
    this.apiSecret = config.apiSecret.trim();

    // Basic validation of API key format (Binance API keys are typically 64 characters)
    if (this.apiKey.length < 20 || this.apiKey.length > 100) {
      console.warn(`Unusual API key length: ${this.apiKey.length} characters`);
    }

    // Use testnet or production URL
    this.baseURL = config.testnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    });

    // Rate limiting: Binance allows 2400 requests per minute for futures
    this.limiter = new Bottleneck({
      minTime: 50, // 20 requests per second max
      maxConcurrent: 10,
    });
  }

  // Generate signature for requests
  private generateSignature(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  // Build query string with signature
  private buildSignedQuery(params: Record<string, any> = {}): string {
    const timestamp = Date.now();
    const queryParams = {
      ...params,
      timestamp,
      recvWindow: 5000,
    };

    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const signature = this.generateSignature(queryString);
    return `${queryString}&signature=${signature}`;
  }

  // Make signed request
  private async makeSignedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const signedQuery = this.buildSignedQuery(params);

    try {
      const response = await this.limiter.schedule(() => {
        if (method === 'GET' || method === 'DELETE') {
          return this.client.request({
            method,
            url: `${endpoint}?${signedQuery}`,
          });
        } else {
          return this.client.request({
            method,
            url: endpoint,
            data: signedQuery,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Binance API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get account information
  async getAccountInfo(): Promise<BinanceAccountInfo> {
    try {
      return await this.makeSignedRequest('GET', '/fapi/v2/account');
    } catch (error: any) {
      // Add more detailed error information
      if (error.response?.data) {
        console.error('Binance API error details:', {
          code: error.response.data.code,
          msg: error.response.data.msg,
          status: error.response.status,
        });
      }
      throw error;
    }
  }

  // Get all open orders
  async getOpenOrders(symbol?: string): Promise<BinanceFuturesOrder[]> {
    const params: any = {};
    if (symbol) params.symbol = symbol;

    return this.makeSignedRequest('GET', '/fapi/v1/openOrders', params);
  }

  // Get all orders (including history)
  async getAllOrders(symbol: string, limit: number = 500): Promise<BinanceFuturesOrder[]> {
    return this.makeSignedRequest('GET', '/fapi/v1/allOrders', {
      symbol,
      limit,
    });
  }

  // Get current positions
  async getPositions(symbol?: string): Promise<BinanceFuturesPosition[]> {
    const accountInfo = await this.getAccountInfo();

    if (symbol) {
      return accountInfo.positions.filter(
        p => p.symbol === symbol && parseFloat(p.positionAmt) !== 0
      );
    }

    // Return only positions with non-zero amounts
    return accountInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);
  }

  // Place a new order
  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_MARKET' | 'TAKE_PROFIT' | 'TAKE_PROFIT_MARKET';
    quantity: number;
    price?: number;
    stopPrice?: number;
    reduceOnly?: boolean;
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
    timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX';
  }): Promise<BinanceFuturesOrder> {
    const orderParams: any = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };

    if (params.price) orderParams.price = params.price;
    if (params.stopPrice) orderParams.stopPrice = params.stopPrice;
    if (params.reduceOnly) orderParams.reduceOnly = params.reduceOnly;
    if (params.positionSide) orderParams.positionSide = params.positionSide;
    if (params.timeInForce) orderParams.timeInForce = params.timeInForce;

    return this.makeSignedRequest('POST', '/fapi/v1/order', orderParams);
  }

  // Cancel an order
  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    return this.makeSignedRequest('DELETE', '/fapi/v1/order', {
      symbol,
      orderId,
    });
  }

  // Cancel all open orders for a symbol
  async cancelAllOrders(symbol: string): Promise<any> {
    return this.makeSignedRequest('DELETE', '/fapi/v1/allOpenOrders', {
      symbol,
    });
  }

  // Get mark price
  async getMarkPrice(symbol?: string): Promise<any> {
    const endpoint = '/fapi/v1/premiumIndex';
    const params: any = {};
    if (symbol) params.symbol = symbol;

    const response = await this.client.get(endpoint, { params });
    return response.data;
  }

  // Get exchange info (trading rules, symbols, etc.)
  async getExchangeInfo(): Promise<any> {
    const response = await this.client.get('/fapi/v1/exchangeInfo');
    return response.data;
  }

  // Get klines/candlestick data
  async getKlines(symbol: string, interval: string, limit: number = 500): Promise<any[]> {
    const response = await this.client.get('/fapi/v1/klines', {
      params: {
        symbol,
        interval,
        limit,
      },
    });
    return response.data;
  }

  // Test connectivity
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/fapi/v1/ping');
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  // Get server time
  async getServerTime(): Promise<number> {
    const response = await this.client.get('/fapi/v1/time');
    return response.data.serverTime;
  }
}

export function createBinanceClient(config: BinanceConfig): BinanceAPI {
  return new BinanceAPI(config);
}
