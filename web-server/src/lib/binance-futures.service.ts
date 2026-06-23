import { BinanceClientBase } from "./binance-client-base";

/**
 * Binance Futures Service - Handles Futures-specific API calls
 */
export class BinanceFuturesService {
  constructor(private client: BinanceClientBase) {}

  /**
   * Get Futures account information
   */
  async getFuturesAccount() {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v2/account?${this.client.signRequest()}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v2/balance?${this.client.signRequest()}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v2/positionRisk?${this.client.signRequest()}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/openOrders?${this.client.signRequest(params)}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/openAlgoOrders?${this.client.signRequest(params)}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/allOrders?${this.client.signRequest(params)}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/userTrades?${this.client.signRequest(params)}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/income?${this.client.signRequest(params)}`),
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
    quantity?: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
    reduceOnly?: boolean;
    closePosition?: boolean;
  }) {
    try {
      const apiParams: Record<string, unknown> = { ...params };
      if (typeof apiParams["closePosition"] === "boolean") {
        apiParams["closePosition"] = (apiParams["closePosition"] as boolean)
          ? true
          : false;
      }
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.post(`/fapi/v1/order?${this.client.signRequest(apiParams as Record<string, any>)}`),
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
    triggerPrice: number;
    timeInForce?: "GTC" | "IOC" | "FOK";
    reduceOnly?: boolean;
    closePosition?: boolean;
    workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
    priceProtect?: boolean;
  }) {
    try {
      const apiParams: Record<string, unknown> = {
        algoType: "CONDITIONAL",
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

      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.post(`/fapi/v1/algoOrder?${this.client.signRequest(apiParams as Record<string, any>)}`),
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.delete(`/fapi/v1/order?${this.client.signRequest({ symbol, orderId })}`),
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
   * Cancel Futures Algo order
   */
  async cancelFuturesAlgoOrder(symbol: string, algoId: number) {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.delete(`/fapi/v1/algoOrder?${this.client.signRequest({ symbol, algoId })}`),
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
   * Create a new user data stream listenKey for Futures
   */
  async createFuturesListenKey(): Promise<string> {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.post("/fapi/v1/listenKey"),
      );
      return response.data.listenKey;
    } catch (error: any) {
      console.error(
        "Binance Futures createListenKey error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to create Binance Futures listenKey",
      );
    }
  }

  /**
   * Keep alive user data stream listenKey for Futures
   */
  async keepAliveFuturesListenKey(listenKey: string): Promise<void> {
    try {
      await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.put("/fapi/v1/listenKey", null, {
          params: { listenKey },
        }),
      );
    } catch (error: any) {
      console.error(
        "Binance Futures keepAliveListenKey error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to keep alive Binance Futures listenKey",
      );
    }
  }

  /**
   * Close user data stream listenKey for Futures
   */
  async closeFuturesListenKey(listenKey: string): Promise<void> {
    try {
      await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.delete("/fapi/v1/listenKey", {
          params: { listenKey },
        }),
      );
    } catch (error: any) {
      console.error(
        "Binance Futures closeListenKey error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.msg || "Failed to close Binance Futures listenKey",
      );
    }
  }

  /**
   * Cancel all open Futures orders for a symbol
   */
  async cancelAllFuturesOrders(symbol: string) {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.delete(`/fapi/v1/allOpenOrders?${this.client.signRequest({ symbol })}`),
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
      isAlgo?: boolean;
      algoId?: number;
    }>
  > {
    try {
      const openOrders = await this.getFuturesOpenOrders(symbol);
      const regularSlTps = openOrders.filter(
        (order: { type: string }) =>
          order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET",
      );

      let algoSlTps: any[] = [];
      try {
        const algoOrders = await this.getFuturesOpenAlgoOrders(symbol);
        const algoArray = Array.isArray(algoOrders) ? algoOrders : [];
        algoSlTps = algoArray
          .filter(
            (order: { type: string }) =>
              order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET",
          )
          .map((order: any) => ({
            orderId: order.algoId,
            symbol: order.symbol,
            type: order.type,
            side: order.side,
            stopPrice: String(order.triggerPrice || order.price),
            isAlgo: true,
            algoId: order.algoId,
          }));
      } catch (algoErr: any) {
        console.warn("Error fetching futures open algo orders:", algoErr.message);
      }

      return [...regularSlTps, ...algoSlTps];
    } catch (error: any) {
      console.error("Error fetching SL/TP orders:", error.message);
      return [];
    }
  }

  /**
   * Cancel specific SL/TP orders for a symbol
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
          let result;
          if (order.isAlgo) {
            result = await this.cancelFuturesAlgoOrder(symbol, order.orderId);
          } else {
            result = await this.cancelFuturesOrder(symbol, order.orderId);
          }
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
   * Get current mark price for a futures symbol
   */
  async getFuturesMarkPrice(symbol: string): Promise<number> {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/premiumIndex`, {
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
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.post(`/fapi/v1/leverage?${this.client.signRequest({ symbol, leverage })}`),
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
   * Change Futures margin type
   */
  async changeFuturesMarginType(
    symbol: string,
    marginType: "ISOLATED" | "CROSSED",
  ) {
    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.post(`/fapi/v1/marginType?${this.client.signRequest({ symbol, marginType })}`),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "Binance Futures changeMarginType error:",
        error.response?.data || error.message,
      );

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
   * Get Futures leverage brackets
   */
  async getFuturesLeverageBrackets(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/leverageBracket?${this.client.signRequest(params)}`),
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
   * Get Futures Exchange Info
   */
  async getFuturesExchangeInfo() {
    const now = Date.now();
    if (
      BinanceClientBase.futuresExchangeInfoCache &&
      now - BinanceClientBase.futuresExchangeInfoCacheTime <
        BinanceClientBase.CACHE_TTL
    ) {
      return BinanceClientBase.futuresExchangeInfoCache;
    }

    try {
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get('/fapi/v1/exchangeInfo'),
      );

      BinanceClientBase.futuresExchangeInfoCache = response.data;
      BinanceClientBase.futuresExchangeInfoCacheTime = now;

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
   * Get Futures Premium Index
   */
  async getFuturesPremiumIndex(symbol?: string) {
    try {
      const params = symbol ? { symbol } : {};
      const response = await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get(`/fapi/v1/premiumIndex`, { params }),
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
   * Test connectivity to Futures API
   */
  async testFuturesConnectivity() {
    try {
      const start = Date.now();
      await BinanceClientBase.scheduleRequest(() =>
        this.client.futuresClient.get("/fapi/v1/ping"),
      );
      const latency = Date.now() - start;
      return { status: "ok", latency: `${latency}ms` };
    } catch (error: any) {
      throw new Error(`Futures connectivity failed: ${error.message}`);
    }
  }
}
