import { BinanceClientBase } from "./binance-client-base";
import { BinanceSpotService } from "./binance-spot.service";
import { BinanceFuturesService } from "./binance-futures.service";

/**
 * Binance Service - Facade routing to Spot and Futures services
 */
export class BinanceService extends BinanceClientBase {
  private spotService: BinanceSpotService;
  private futuresService: BinanceFuturesService;

  constructor() {
    super();
    this.spotService = new BinanceSpotService(this);
    this.futuresService = new BinanceFuturesService(this);
  }

  // ==================== SPOT API METHODS ====================

  async getSpotAccount() {
    return this.spotService.getSpotAccount();
  }

  async getSpotBalances() {
    return this.spotService.getSpotBalances();
  }

  async getSpotOpenOrders(symbol?: string) {
    return this.spotService.getSpotOpenOrders(symbol);
  }

  async getSpotAllOrders(symbol: string, limit: number = 500) {
    return this.spotService.getSpotAllOrders(symbol, limit);
  }

  async placeSpotOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    type: "LIMIT" | "MARKET" | "STOP_LOSS_LIMIT" | "TAKE_PROFIT_LIMIT";
    quantity: number;
    price?: number;
    timeInForce?: "GTC" | "IOC" | "FOK";
  }) {
    return this.spotService.placeSpotOrder(params);
  }

  async cancelSpotOrder(symbol: string, orderId: number) {
    return this.spotService.cancelSpotOrder(symbol, orderId);
  }

  async testSpotConnectivity() {
    return this.spotService.testSpotConnectivity();
  }

  // ==================== USD(S)-M FUTURES API METHODS ====================

  async getFuturesAccount() {
    return this.futuresService.getFuturesAccount();
  }

  async getFuturesBalance() {
    return this.futuresService.getFuturesBalance();
  }

  async getFuturesPositions() {
    return this.futuresService.getFuturesPositions();
  }

  async getFuturesOpenOrders(symbol?: string) {
    return this.futuresService.getFuturesOpenOrders(symbol);
  }

  async getFuturesOpenAlgoOrders(symbol?: string) {
    return this.futuresService.getFuturesOpenAlgoOrders(symbol);
  }

  async getFuturesAllOrders(
    symbol?: string,
    limit: number = 100,
    startTime?: number,
    endTime?: number,
  ) {
    return this.futuresService.getFuturesAllOrders(symbol, limit, startTime, endTime);
  }

  async getFuturesUserTrades(
    symbol?: string,
    limit: number = 50,
    startTime?: number,
    endTime?: number,
  ) {
    return this.futuresService.getFuturesUserTrades(symbol, limit, startTime, endTime);
  }

  async getFuturesIncomeHistory(
    incomeType?: string,
    limit: number = 100,
    startTime?: number,
    endTime?: number,
  ) {
    return this.futuresService.getFuturesIncomeHistory(incomeType, limit, startTime, endTime);
  }

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
    return this.futuresService.placeFuturesOrder(params);
  }

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
    return this.futuresService.placeFuturesAlgoOrder(params);
  }

  async cancelFuturesOrder(symbol: string, orderId: number) {
    return this.futuresService.cancelFuturesOrder(symbol, orderId);
  }

  async cancelFuturesAlgoOrder(symbol: string, algoId: number) {
    return this.futuresService.cancelFuturesAlgoOrder(symbol, algoId);
  }

  async createFuturesListenKey(): Promise<string> {
    return this.futuresService.createFuturesListenKey();
  }

  async keepAliveFuturesListenKey(listenKey: string): Promise<void> {
    return this.futuresService.keepAliveFuturesListenKey(listenKey);
  }

  async closeFuturesListenKey(listenKey: string): Promise<void> {
    return this.futuresService.closeFuturesListenKey(listenKey);
  }

  async cancelAllFuturesOrders(symbol: string) {
    return this.futuresService.cancelAllFuturesOrders(symbol);
  }

  async getFuturesSlTpOrders(symbol: string) {
    return this.futuresService.getFuturesSlTpOrders(symbol);
  }

  async cancelFuturesSlTpOrders(symbol: string, side?: "BUY" | "SELL") {
    return this.futuresService.cancelFuturesSlTpOrders(symbol, side);
  }

  async getFuturesMarkPrice(symbol: string): Promise<number> {
    return this.futuresService.getFuturesMarkPrice(symbol);
  }

  async changeFuturesLeverage(symbol: string, leverage: number) {
    return this.futuresService.changeFuturesLeverage(symbol, leverage);
  }

  async changeFuturesMarginType(
    symbol: string,
    marginType: "ISOLATED" | "CROSSED",
  ) {
    return this.futuresService.changeFuturesMarginType(symbol, marginType);
  }

  async getFuturesLeverageBrackets(symbol?: string) {
    return this.futuresService.getFuturesLeverageBrackets(symbol);
  }

  async getFuturesExchangeInfo() {
    return this.futuresService.getFuturesExchangeInfo();
  }

  async getFuturesPremiumIndex(symbol?: string) {
    return this.futuresService.getFuturesPremiumIndex(symbol);
  }

  async testFuturesConnectivity() {
    return this.futuresService.testFuturesConnectivity();
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

// Export singleton instance - DEPRECATED: Do not use for authenticated concurrent requests
const binanceService = new BinanceService();
export default binanceService;
