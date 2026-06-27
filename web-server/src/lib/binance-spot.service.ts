import { BinanceClientBase } from "./binance-client-base";

/**
 * Binance Spot Service - Handles Spot-specific API calls
 */
export class BinanceSpotService {
  constructor(private client: BinanceClientBase) {}

  /**
   * Get Spot account information (balances, permissions)
   */
  async getSpotAccount() {
    try {
      const response = await BinanceClientBase.scheduleRequest(() => this.client.spotClient.get(`/api/v3/account?${this.client.signRequest()}`), "/api/v3/account");
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
      const response = await BinanceClientBase.scheduleRequest(() => this.client.spotClient.get(`/api/v3/openOrders?${this.client.signRequest(params)}`), "/api/v3/openOrders");
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
      const response = await BinanceClientBase.scheduleRequest(() => this.client.spotClient.get(`/api/v3/allOrders?${this.client.signRequest({ symbol, limit })}`), "/api/v3/allOrders");
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
      const response = await BinanceClientBase.scheduleRequest(() => this.client.spotClient.post(`/api/v3/order?${this.client.signRequest(params)}`), "/api/v3/order");
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
      const response = await BinanceClientBase.scheduleRequest(() => this.client.spotClient.delete(`/api/v3/order?${this.client.signRequest({ symbol, orderId })}`), "/api/v3/order");
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

  /**
   * Test connectivity to Spot API
   */
  async testSpotConnectivity() {
    try {
      await BinanceClientBase.scheduleRequest(() => this.client.spotClient.get("/api/v3/ping"), "/api/v3/ping");
      return { status: "ok", latency: "unknown" };
    } catch (error: any) {
      throw new Error(`Spot connectivity failed: ${error.message}`);
    }
  }
}
