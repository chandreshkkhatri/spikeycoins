import { IAccount } from '@/models/account';
import { BinanceAPI, createBinanceClient } from './binance';
import kiteConnectService from './kiteconnect-service';
import upstoxService from './upstox-service';

export interface UnifiedOrder {
  id: string;
  accountId: string;
  accountType: 'kite' | 'upstox' | 'binance';
  symbol: string;
  exchange: string;
  quantity: number;
  price?: number;
  averagePrice?: number;
  orderType: string;
  transactionType: 'BUY' | 'SELL';
  status: string;
  product?: string;
  validity?: string;
  timestamp: string;
  rawData?: any;
}

export interface UnifiedPosition {
  id: string;
  accountId: string;
  accountType: 'kite' | 'upstox' | 'binance';
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  pnlPercentage: number;
  product?: string;
  rawData?: any;
}

export interface UnifiedHolding {
  id: string;
  accountId: string;
  accountType: 'kite' | 'upstox' | 'binance';
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  isin?: string;
  companyName?: string;
  rawData?: any;
}

export class TradingService {
  private kiteClients: Map<string, any> = new Map();
  private upstoxClients: Map<string, any> = new Map();
  private binanceClients: Map<string, BinanceAPI> = new Map();

  // Initialize client for account
  private async initializeClient(account: IAccount): Promise<void> {
    try {
      switch (account.accountType) {
        case 'kite':
          if (!this.kiteClients.has(account._id!)) {
            // For KiteConnect, we use the singleton service
            // Set the access token if available
            if (account.accessToken) {
              kiteConnectService.setAccessToken(account.accessToken);
              this.kiteClients.set(account._id!, kiteConnectService);
            } else {
              throw new Error('KiteConnect requires access token');
            }
          }
          break;

        case 'upstox':
          if (!this.upstoxClients.has(account._id!)) {
            // Initialize upstox service with account credentials
            const isSandbox = account.metadata?.sandbox === true;
            upstoxService.initializeWithCredentials(account.apiKey, account.apiSecret, isSandbox);
            if (account.accessToken) {
              upstoxService.setAccessToken(account.accessToken);
            }
            this.upstoxClients.set(account._id!, upstoxService);
          }
          break;

        case 'binance':
          if (!this.binanceClients.has(account._id!)) {
            const binanceClient = createBinanceClient({
              apiKey: account.apiKey,
              apiSecret: account.apiSecret,
              testnet: account.metadata?.testnet || false,
            });
            this.binanceClients.set(account._id!, binanceClient);
          }
          break;

        default:
          throw new Error(`Unsupported account type: ${account.accountType}`);
      }
    } catch (error) {
      throw error;
    }
  }

  // Fetch orders from all accounts
  async getAllOrders(accounts: IAccount[]): Promise<UnifiedOrder[]> {
    const allOrders: UnifiedOrder[] = [];

    for (const account of accounts.filter(acc => acc.isActive)) {
      try {
        await this.initializeClient(account);
        const orders = await this.getAccountOrders(account);
        allOrders.push(...orders);
      } catch (error) {
        // Continue with other accounts even if one fails
      }
    }

    return allOrders.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Fetch orders from specific account
  private async getAccountOrders(account: IAccount): Promise<UnifiedOrder[]> {
    switch (account.accountType) {
      case 'kite':
        return this.getKiteOrders(account);
      case 'upstox':
        return this.getUpstoxOrders(account);
      case 'binance':
        return this.getBinanceOrders(account);
      default:
        throw new Error(`Unsupported account type: ${account.accountType}`);
    }
  }

  private async getKiteOrders(account: IAccount): Promise<UnifiedOrder[]> {
    try {
      const client = this.kiteClients.get(account._id!);
      if (!client) throw new Error('Kite client not initialized');

      const orders = await client.getOrders();
      return orders.map(
        (order: any): UnifiedOrder => ({
          id: `${account._id}_${order.order_id}`,
          accountId: account._id!,
          accountType: 'kite',
          symbol: order.tradingsymbol,
          exchange: order.exchange,
          quantity: order.quantity,
          price: order.price || undefined,
          averagePrice: order.average_price || undefined,
          orderType: order.order_type,
          transactionType: order.transaction_type,
          status: order.status,
          product: order.product,
          validity: order.validity,
          timestamp: order.order_timestamp || new Date().toISOString(),
          rawData: order,
        })
      );
    } catch (error) {
      return [];
    }
  }

  private async getUpstoxOrders(account: IAccount): Promise<UnifiedOrder[]> {
    try {
      const client = this.upstoxClients.get(account._id!);
      if (!client) throw new Error('Upstox client not initialized');

      const orders = await client.getOrders();
      return orders.map(
        (order): UnifiedOrder => ({
          id: `${account._id}_${order.order_id}`,
          accountId: account._id!,
          accountType: 'upstox',
          symbol: order.trading_symbol,
          exchange: order.exchange,
          quantity: order.quantity,
          price: order.price,
          averagePrice: order.average_price,
          orderType: order.order_type,
          transactionType: order.transaction_type,
          status: order.order_status,
          product: order.product,
          validity: order.validity,
          timestamp: order.order_timestamp,
          rawData: order,
        })
      );
    } catch (error) {
      return [];
    }
  }

  private async getBinanceOrders(account: IAccount): Promise<UnifiedOrder[]> {
    try {
      const client = this.binanceClients.get(account._id!);
      if (!client) throw new Error('Binance client not initialized');

      const orders = await client.getOpenOrders();
      return orders.map(
        (order): UnifiedOrder => ({
          id: `${account._id}_${order.orderId}`,
          accountId: account._id!,
          accountType: 'binance',
          symbol: order.symbol,
          exchange: 'BINANCE-F',
          quantity: parseFloat(order.origQty),
          price: parseFloat(order.price) || undefined,
          averagePrice: parseFloat(order.avgPrice) || undefined,
          orderType: order.type,
          transactionType: order.side,
          status: order.status,
          product: order.positionSide,
          validity: order.timeInForce,
          timestamp: new Date(order.time).toISOString(),
          rawData: order,
        })
      );
    } catch (error) {
      return [];
    }
  }

  // Fetch positions from all accounts
  async getAllPositions(accounts: IAccount[]): Promise<UnifiedPosition[]> {
    const allPositions: UnifiedPosition[] = [];

    for (const account of accounts.filter(acc => acc.isActive)) {
      try {
        await this.initializeClient(account);
        const positions = await this.getAccountPositions(account);
        allPositions.push(...positions);
      } catch (error) {}
    }

    return allPositions.sort((a, b) => b.pnl - a.pnl);
  }

  private async getAccountPositions(account: IAccount): Promise<UnifiedPosition[]> {
    switch (account.accountType) {
      case 'kite':
        return this.getKitePositions(account);
      case 'upstox':
        return this.getUpstoxPositions(account);
      case 'binance':
        return this.getBinancePositions(account);
      default:
        throw new Error(`Unsupported account type: ${account.accountType}`);
    }
  }

  private async getKitePositions(account: IAccount): Promise<UnifiedPosition[]> {
    try {
      const client = this.kiteClients.get(account._id!);
      if (!client) throw new Error('Kite client not initialized');

      const positionsData = await client.getPositions();
      const positions = positionsData.net || []; // Use net positions

      return positions.map(
        (position: any): UnifiedPosition => ({
          id: `${account._id}_${position.tradingsymbol}_${position.product}`,
          accountId: account._id!,
          accountType: 'kite',
          symbol: position.tradingsymbol,
          exchange: position.exchange,
          quantity: position.quantity,
          averagePrice: position.average_price,
          lastPrice: position.last_price,
          pnl: position.pnl,
          pnlPercentage:
            position.average_price > 0
              ? (position.pnl / (position.average_price * Math.abs(position.quantity))) * 100
              : 0,
          product: position.product,
          rawData: position,
        })
      );
    } catch (error) {
      return [];
    }
  }

  private async getUpstoxPositions(account: IAccount): Promise<UnifiedPosition[]> {
    try {
      const client = this.upstoxClients.get(account._id!);
      if (!client) throw new Error('Upstox client not initialized');

      const positions = await client.getPositions();
      return positions.map(
        (position): UnifiedPosition => ({
          id: `${account._id}_${position.trading_symbol}_${position.product}`,
          accountId: account._id!,
          accountType: 'upstox',
          symbol: position.trading_symbol,
          exchange: position.exchange,
          quantity: position.quantity,
          averagePrice: position.average_price,
          lastPrice: position.last_price,
          pnl: position.pnl,
          pnlPercentage: position.pnl
            ? (position.pnl / (position.average_price * Math.abs(position.quantity))) * 100
            : 0,
          product: position.product,
          rawData: position,
        })
      );
    } catch (error) {
      return [];
    }
  }

  private async getBinancePositions(account: IAccount): Promise<UnifiedPosition[]> {
    try {
      const client = this.binanceClients.get(account._id!);
      if (!client) throw new Error('Binance client not initialized');

      const positions = await client.getPositions();
      return positions.map((position): UnifiedPosition => {
        const quantity = parseFloat(position.positionAmt);
        const entryPrice = parseFloat(position.entryPrice);
        const markPrice = parseFloat(position.markPrice);
        const pnl = parseFloat(position.unRealizedProfit);
        const notional = Math.abs(quantity * markPrice);
        const pnlPercentage = notional > 0 ? (pnl / notional) * 100 : 0;

        return {
          id: `${account._id}_${position.symbol}_${position.positionSide}`,
          accountId: account._id!,
          accountType: 'binance',
          symbol: position.symbol,
          exchange: 'BINANCE-F',
          quantity: quantity,
          averagePrice: entryPrice,
          lastPrice: markPrice,
          pnl: pnl,
          pnlPercentage: pnlPercentage,
          product: position.positionSide,
          rawData: position,
        };
      });
    } catch (error) {
      return [];
    }
  }

  // Fetch holdings from all accounts
  async getAllHoldings(accounts: IAccount[]): Promise<UnifiedHolding[]> {
    const allHoldings: UnifiedHolding[] = [];

    for (const account of accounts.filter(acc => acc.isActive)) {
      try {
        await this.initializeClient(account);
        const holdings = await this.getAccountHoldings(account);
        allHoldings.push(...holdings);
      } catch (error) {}
    }

    return allHoldings.sort((a, b) => b.currentValue - a.currentValue);
  }

  private async getAccountHoldings(account: IAccount): Promise<UnifiedHolding[]> {
    switch (account.accountType) {
      case 'kite':
        return this.getKiteHoldings(account);
      case 'upstox':
        return this.getUpstoxHoldings(account);
      case 'binance':
        // Binance futures doesn't have holdings (only positions)
        return [];
      default:
        throw new Error(`Unsupported account type: ${account.accountType}`);
    }
  }

  private async getKiteHoldings(account: IAccount): Promise<UnifiedHolding[]> {
    try {
      const client = this.kiteClients.get(account._id!);
      if (!client) throw new Error('Kite client not initialized');

      const holdings = await client.getHoldings();

      return holdings.map((holding: any): UnifiedHolding => {
        const currentValue = holding.last_price * holding.quantity;
        const investedValue = holding.average_price * holding.quantity;
        const pnl = currentValue - investedValue;
        const pnlPercentage = investedValue > 0 ? (pnl / investedValue) * 100 : 0;

        return {
          id: `${account._id}_${holding.tradingsymbol}`,
          accountId: account._id!,
          accountType: 'kite',
          symbol: holding.tradingsymbol,
          exchange: holding.exchange,
          quantity: holding.quantity,
          averagePrice: holding.average_price,
          lastPrice: holding.last_price,
          currentValue,
          pnl,
          pnlPercentage,
          isin: holding.isin,
          companyName: holding.tradingsymbol, // Kite doesn't provide company name
          rawData: holding,
        };
      });
    } catch (error) {
      return [];
    }
  }

  private async getUpstoxHoldings(account: IAccount): Promise<UnifiedHolding[]> {
    try {
      const client = this.upstoxClients.get(account._id!);
      if (!client) throw new Error('Upstox client not initialized');

      const holdings = await client.getHoldings();
      return holdings.map((holding): UnifiedHolding => {
        const currentValue = holding.last_price * holding.quantity;
        const investedValue = holding.average_price * holding.quantity;
        const pnl = currentValue - investedValue;
        const pnlPercentage = investedValue > 0 ? (pnl / investedValue) * 100 : 0;

        return {
          id: `${account._id}_${holding.trading_symbol}`,
          accountId: account._id!,
          accountType: 'upstox',
          symbol: holding.trading_symbol,
          exchange: holding.exchange,
          quantity: holding.quantity,
          averagePrice: holding.average_price,
          lastPrice: holding.last_price,
          currentValue,
          pnl,
          pnlPercentage,
          isin: holding.isin,
          companyName: holding.company_name,
          rawData: holding,
        };
      });
    } catch (error) {
      return [];
    }
  }

  // Cancel order
  async cancelOrder(accountId: string, orderId: string): Promise<any> {
    // Find account and determine type
    // This would need to be implemented based on how you store/retrieve accounts
    // For now, assuming you pass the account type or have it stored
    throw new Error('Cancel order not implemented yet');
  }

  // Place order
  async placeOrder(accountId: string, orderData: any): Promise<any> {
    // Implementation for placing orders across different brokers
    throw new Error('Place order not implemented yet');
  }
}

export const tradingService = new TradingService();
