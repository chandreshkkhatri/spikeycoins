import WebSocket from "ws";
import Account from "../models/account";
import connectDB from "./mongodb";
import { sendOrderNotification } from "./push-notification-service";

/**
 * Binance Order Monitor Service
 *
 * Monitors order fills via User Data Stream WebSocket and polling.
 * When a SL or TP order is filled, automatically cancels the remaining one.
 *
 * Features:
 * - WebSocket connection per Binance Futures account
 * - Automatic listenKey renewal every 30 minutes
 * - Polling fallback every 30 seconds for orphaned orders
 * - Reconnection handling
 */

interface AccountConnection {
  accountId: string;
  userId: string; // User ID for push notifications
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  listenKey: string | null;
  ws: WebSocket | null;
  keepAliveInterval: NodeJS.Timeout | null;
  reconnectTimeout: NodeJS.Timeout | null;
  lastPositions: Map<string, number>; // symbol -> positionAmt
}

interface OrderTradeUpdate {
  e: "ORDER_TRADE_UPDATE";
  E: number; // Event time
  T: number; // Transaction time
  o: {
    s: string; // Symbol
    c: string; // Client order ID
    S: string; // Side
    o: string; // Order type (e.g., STOP_MARKET, TAKE_PROFIT_MARKET)
    f: string; // Time in force
    q: string; // Quantity
    p: string; // Price
    ap: string; // Average price
    sp: string; // Stop price
    x: string; // Execution type (NEW, CANCELED, TRADE, EXPIRED)
    X: string; // Order status (NEW, FILLED, CANCELED, etc.)
    i: number; // Order ID
    l: string; // Last filled quantity
    z: string; // Cumulative filled quantity
    L: string; // Last filled price
    n: string; // Commission
    N: string; // Commission asset
    T: number; // Order trade time
    t: number; // Trade ID
    rp: string; // Realized profit
    ot: string; // Original order type
    ps: string; // Position side
  };
}

interface AccountUpdate {
  e: "ACCOUNT_UPDATE";
  E: number; // Event time
  T: number; // Transaction time
  a: {
    m: string; // Event reason type
    P: {
      s: string; // Symbol
      pa: string; // Position Amount
      ep: string; // Entry Price
      cr: string; // (Accumulated) Realized PnL
      up: string; // Unrealized PnL
      mt: string; // Margin Type
      iw: string; // Isolated Wallet (if isolated position)
      ps: string; // Position Side
    }[];
  };
}

class BinanceOrderMonitor {
  private connections: Map<string, AccountConnection> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Constants
  private readonly LISTEN_KEY_RENEWAL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly POLLING_INTERVAL_MS = 30 * 1000; // 30 seconds
  private readonly RECONNECT_DELAY_MS = 5000; // 5 seconds
  private readonly WS_BASE_URL = "wss://fstream.binance.com";
  private readonly WS_TESTNET_URL = "wss://stream.binancefuture.com";

  /**
   * Start monitoring all active Binance Futures accounts
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[OrderMonitor] Already running");
      return;
    }

    this.isRunning = true;
    console.log("[OrderMonitor] Starting Binance order monitor service...");

    try {
      await this.loadAccountsAndConnect();
      this.startPolling();
      console.log("[OrderMonitor] Service started successfully");
    } catch (error) {
      console.error("[OrderMonitor] Failed to start:", error);
      this.isRunning = false;
    }
  }

  /**
   * Stop all monitoring
   */
  async stop(): Promise<void> {
    console.log("[OrderMonitor] Stopping...");
    this.isRunning = false;

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Close all WebSocket connections
    for (const [accountId, conn] of this.connections) {
      await this.disconnectAccount(accountId);
    }

    this.connections.clear();
    console.log("[OrderMonitor] Stopped");
  }

  /**
   * Load all active Binance Futures accounts and connect
   */
  private async loadAccountsAndConnect(): Promise<void> {
    await connectDB();

    const accounts = await Account.find({
      accountType: "binance",
      isActive: true,
      "metadata.tradingSegment": "usdm",
    });

    console.log(
      `[OrderMonitor] Found ${accounts.length} active Binance Futures accounts`,
    );

    for (const account of accounts) {
      try {
        await this.connectAccount(account);
      } catch (error) {
        console.error(
          `[OrderMonitor] Failed to connect account ${account._id}:`,
          error,
        );
      }
    }
  }

  /**
   * Connect to User Data Stream for a specific account
   */
  private async connectAccount(account: any): Promise<void> {
    const accountId = account._id.toString();

    // Skip if already connected
    if (this.connections.has(accountId)) {
      console.log(`[OrderMonitor] Account ${accountId} already connected`);
      return;
    }

    const isTestnet = account.metadata?.testnet || false;

    const userId: string | undefined = account.userId;
    if (!userId) {
      console.warn(
        `[OrderMonitor] Missing userId for account ${accountId}; push notifications will be disabled for this account.`,
      );
    }

    // Create connection record
    const conn: AccountConnection = {
      accountId,
      userId: userId || "", // User ID for notifications
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      testnet: isTestnet,
      listenKey: null,
      ws: null,
      keepAliveInterval: null,
      reconnectTimeout: null,
      lastPositions: new Map(),
    };

    this.connections.set(accountId, conn);

    // Get listenKey and connect WebSocket
    await this.establishWebSocket(conn);
  }

  /**
   * Establish WebSocket connection for an account
   */
  private async establishWebSocket(conn: AccountConnection): Promise<void> {
    try {
      // Create axios instance for this account
      const axios = (await import("axios")).default;
      const baseUrl = conn.testnet
        ? "https://testnet.binancefuture.com"
        : "https://fapi.binance.com";

      const client = axios.create({
        baseURL: baseUrl,
        headers: { "X-MBX-APIKEY": conn.apiKey },
      });

      // Get listenKey
      const response = await client.post("/fapi/v1/listenKey");
      conn.listenKey = response.data.listenKey;

      console.log(`[OrderMonitor] Got listenKey for account ${conn.accountId}`);

      // Connect WebSocket
      const wsUrl = conn.testnet
        ? `${this.WS_TESTNET_URL}/ws/${conn.listenKey}`
        : `${this.WS_BASE_URL}/ws/${conn.listenKey}`;

      conn.ws = new WebSocket(wsUrl);

      conn.ws.on("open", () => {
        console.log(
          `[OrderMonitor] WebSocket connected for account ${conn.accountId}`,
        );
      });

      conn.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(conn, data.toString());
      });

      conn.ws.on("error", (error: Error) => {
        console.error(
          `[OrderMonitor] WebSocket error for account ${conn.accountId}:`,
          error.message,
        );
      });

      conn.ws.on("close", () => {
        console.log(
          `[OrderMonitor] WebSocket closed for account ${conn.accountId}`,
        );
        this.scheduleReconnect(conn);
      });

      // Start keepAlive interval
      conn.keepAliveInterval = setInterval(async () => {
        await this.keepAlive(conn);
      }, this.LISTEN_KEY_RENEWAL_MS);
    } catch (error) {
      console.error(
        `[OrderMonitor] Failed to establish WebSocket for ${conn.accountId}:`,
        error,
      );
      this.scheduleReconnect(conn);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(conn: AccountConnection, rawData: string): void {
    try {
      const data = JSON.parse(rawData);

      // Handle ORDER_TRADE_UPDATE events
      if (data.e === "ORDER_TRADE_UPDATE") {
        this.handleOrderUpdate(conn, data as OrderTradeUpdate);
      } else if (data.e === "ACCOUNT_UPDATE") {
        this.handleAccountUpdate(conn, data as AccountUpdate);
      }
    } catch (error) {
      console.error(`[OrderMonitor] Error parsing message:`, error);
    }
  }

  /**
   * Handle order update event - send notifications and cancel remaining SL/TP if one is filled
   */
  private async handleOrderUpdate(
    conn: AccountConnection,
    event: OrderTradeUpdate,
  ): Promise<void> {
    const order = event.o;
    const symbol = order.s;
    const realizedPnl = parseFloat(order.rp) || 0;
    const price = parseFloat(order.L) || parseFloat(order.ap) || 0;
    const quantity = parseFloat(order.z) || parseFloat(order.q) || 0;

    // Send notifications based on order status
    if (conn.userId) {
      try {
        // Handle FILLED orders
        if (order.X === "FILLED") {
          if (order.ot === "STOP_MARKET") {
            // Stop Loss triggered
            console.log(
              `[OrderMonitor] SL triggered for ${symbol}, sending notification`,
            );
            await sendOrderNotification(conn.userId, "sl_triggered", {
              symbol,
              price,
              quantity,
              realizedPnl,
              side: order.S,
            });
          } else if (order.ot === "TAKE_PROFIT_MARKET") {
            // Take Profit triggered
            console.log(
              `[OrderMonitor] TP triggered for ${symbol}, sending notification`,
            );
            await sendOrderNotification(conn.userId, "tp_triggered", {
              symbol,
              price,
              quantity,
              realizedPnl,
              side: order.S,
            });
          } else {
            // Regular order filled (MARKET, LIMIT, etc.)
            console.log(
              `[OrderMonitor] Order filled for ${symbol}, sending notification`,
            );
            await sendOrderNotification(conn.userId, "order_filled", {
              symbol,
              price,
              quantity,
              side: order.S,
            });
          }
        }
      } catch (notifError) {
        console.error(
          `[OrderMonitor] Failed to send notification:`,
          notifError,
        );
      }
    }

    // Only cancel remaining SL/TP for STOP_MARKET or TAKE_PROFIT_MARKET orders that are FILLED
    if (order.X !== "FILLED") return;
    if (order.ot !== "STOP_MARKET" && order.ot !== "TAKE_PROFIT_MARKET") return;

    const orderType = order.ot === "STOP_MARKET" ? "SL" : "TP";
    console.log(
      `[OrderMonitor] ${orderType} order FILLED for ${symbol} on account ${conn.accountId}`,
    );

    // Cancel the other SL/TP order for this symbol
    await this.cancelRemainingSlTp(conn, symbol, orderType);
  }

  /**
   * Handle ACCOUNT_UPDATE event - check for closed positions
   */
  private async handleAccountUpdate(
    conn: AccountConnection,
    event: AccountUpdate,
  ): Promise<void> {
    const positions = event.a.P;

    for (const pos of positions) {
      const symbol = pos.s;
      const positionAmt = parseFloat(pos.pa);

      // If position amount is 0, it means position is closed
      if (positionAmt === 0) {
        console.log(
          `[OrderMonitor] Position closed for ${symbol} on account ${conn.accountId} (via ACCOUNT_UPDATE). Checking for orphaned orders...`,
        );
        // We use a small delay to ensure order status updates have propagated if this was a market close
        // But for safety against race conditions where a NEW position might open immediately,
        // we should ideally check if we truly have no position.
        // For now, proceeding to cleanup.
        await this.cleanupOrdersForSymbol(conn, symbol);
      }
    }
  }

  /**
   * Cancel remaining SL or TP order after one is filled
   */
  private async cancelRemainingSlTp(
    conn: AccountConnection,
    symbol: string,
    filledType: "SL" | "TP",
  ): Promise<void> {
    try {
      const axios = (await import("axios")).default;
      const crypto = (await import("crypto")).default;

      const baseUrl = conn.testnet
        ? "https://testnet.binancefuture.com"
        : "https://fapi.binance.com";

      const client = axios.create({
        baseURL: baseUrl,
        headers: { "X-MBX-APIKEY": conn.apiKey },
      });

      // Helper to sign requests
      const signRequest = (params: Record<string, any>) => {
        const timestamp = Date.now();
        params.timestamp = timestamp;
        const queryString = new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString();
        const signature = crypto
          .createHmac("sha256", conn.apiSecret)
          .update(queryString)
          .digest("hex");
        return `${queryString}&signature=${signature}`;
      };

      // Get open orders for the symbol
      const openOrdersParams = signRequest({ symbol });
      const ordersResponse = await client.get(
        `/fapi/v1/openOrders?${openOrdersParams}`,
      );
      const openOrders = ordersResponse.data;

      // Also check Algo orders
      const algoOrdersParams = signRequest({ symbol });
      let algoOrders: any[] = [];
      try {
        const algoResponse = await client.get(
          `/fapi/v1/openAlgoOrders?${algoOrdersParams}`,
        );
        algoOrders = algoResponse.data?.orders || [];
      } catch (e) {
        // Algo orders endpoint might fail, continue with regular orders
      }

      // Determine which types to cancel (opposite of what was filled)
      // When SL is filled, cancel all TP types; when TP is filled, cancel all SL types
      const typesToCancel =
        filledType === "SL"
          ? ["TAKE_PROFIT", "TAKE_PROFIT_MARKET"]
          : ["STOP", "STOP_MARKET", "TRAILING_STOP_MARKET"];

      // Cancel matching regular orders
      for (const order of openOrders) {
        if (typesToCancel.includes(order.type)) {
          try {
            const cancelParams = signRequest({
              symbol,
              orderId: order.orderId,
            });
            await client.delete(`/fapi/v1/order?${cancelParams}`);
            console.log(
              `[OrderMonitor] Cancelled ${order.type} order ${order.orderId} for ${symbol}`,
            );
          } catch (e: any) {
            console.error(
              `[OrderMonitor] Failed to cancel order ${order.orderId}:`,
              e.message,
            );
          }
        }
      }

      // Cancel matching Algo orders
      for (const order of algoOrders) {
        // Note: Algo orders use 'orderType' instead of 'type'
        const orderType = order.orderType || order.type;
        if (typesToCancel.includes(orderType)) {
          try {
            const cancelParams = signRequest({ symbol, algoId: order.algoId });
            await client.delete(`/fapi/v1/algoOrder?${cancelParams}`);
            console.log(
              `[OrderMonitor] Cancelled ${orderType} algo order ${order.algoId} for ${symbol}`,
            );
          } catch (e: any) {
            console.error(
              `[OrderMonitor] Failed to cancel algo order ${order.algoId}:`,
              e.message,
            );
          }
        }
      }
    } catch (error) {
      console.error(`[OrderMonitor] Error cancelling remaining SL/TP:`, error);
    }
  }

  /**
   * Clean up all SL/TP orders for a specific symbol (used when position is closed)
   */
  private async cleanupOrdersForSymbol(
    conn: AccountConnection,
    symbol: string,
  ): Promise<void> {
    try {
      const axios = (await import("axios")).default;
      const crypto = (await import("crypto")).default;

      const baseUrl = conn.testnet
        ? "https://testnet.binancefuture.com"
        : "https://fapi.binance.com";

      const client = axios.create({
        baseURL: baseUrl,
        headers: { "X-MBX-APIKEY": conn.apiKey },
      });

      const signRequest = (params: Record<string, any> = {}) => {
        const timestamp = Date.now();
        params.timestamp = timestamp;
        const queryString = new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString();
        const signature = crypto
          .createHmac("sha256", conn.apiSecret)
          .update(queryString)
          .digest("hex");
        return `${queryString}&signature=${signature}`;
      };

      console.log(
        `[OrderMonitor] cleanupOrdersForSymbol: Starting cleanup for ${symbol}`,
      );

      // Re-verify position is actually 0 before proceeding to cleanup
      const posParams = signRequest();
      const posResponse = await client.get(
        `/fapi/v2/positionRisk?${posParams}`,
      );
      const position = (posResponse.data || []).find(
        (p: any) => p.symbol === symbol,
      );
      const currentAmt = position ? parseFloat(position.positionAmt) : 0;

      console.log(
        `[OrderMonitor] cleanupOrdersForSymbol: ${symbol} position amount = ${currentAmt}`,
      );

      if (currentAmt !== 0) {
        console.log(
          `[OrderMonitor] Cleanup aborted for ${symbol}: Position is not 0 (${currentAmt})`,
        );
        return;
      }

      // Get all open orders
      const ordersParams = signRequest({ symbol });
      const ordersResponse = await client.get(
        `/fapi/v1/openOrders?${ordersParams}`,
      );
      const openOrders = ordersResponse.data || [];

      console.log(
        `[OrderMonitor] cleanupOrdersForSymbol: ${symbol} has ${openOrders.length} regular open orders`,
      );

      // Cancel SL/TP orders (all conditional order types)
      const conditionalTypes = [
        "STOP",
        "STOP_MARKET",
        "TAKE_PROFIT",
        "TAKE_PROFIT_MARKET",
        "TRAILING_STOP_MARKET",
      ];
      for (const order of openOrders) {
        console.log(
          `[OrderMonitor] cleanupOrdersForSymbol: Checking regular order type=${order.type}, id=${order.orderId}`,
        );
        if (conditionalTypes.includes(order.type)) {
          try {
            const cancelParams = signRequest({
              symbol: order.symbol,
              orderId: order.orderId,
            });
            await client.delete(`/fapi/v1/order?${cancelParams}`);
            console.log(
              `[OrderMonitor] Cleanup: Cancelled ${order.type} for ${order.symbol}`,
            );
          } catch (e: any) {
            console.error(
              `[OrderMonitor] Cleanup: Failed to cancel ${order.orderId}:`,
              e.message,
            );
          }
        }
      }

      // Also check and cancel Algo orders
      try {
        const algoParams = signRequest({ symbol });
        const algoResponse = await client.get(
          `/fapi/v1/openAlgoOrders?${algoParams}`,
        );
        // Binance Algo API returns Array directly
        const algoOrders = Array.isArray(algoResponse.data)
          ? algoResponse.data
          : [];

        console.log(
          `[OrderMonitor] cleanupOrdersForSymbol: ${symbol} has ${algoOrders.length} algo orders`,
        );

        for (const order of algoOrders) {
          // Note: Algo orders use 'orderType' instead of 'type'
          const orderType = order.orderType || order.type;
          console.log(
            `[OrderMonitor] cleanupOrdersForSymbol: Checking algo order orderType=${orderType}, algoId=${order.algoId}`,
          );
          if (conditionalTypes.includes(orderType)) {
            try {
              const cancelParams = signRequest({
                symbol: order.symbol,
                algoId: order.algoId,
              });
              await client.delete(`/fapi/v1/algoOrder?${cancelParams}`);
              console.log(
                `[OrderMonitor] Cleanup: Cancelled algo ${orderType} for ${order.symbol}`,
              );
            } catch (e: any) {
              console.error(
                `[OrderMonitor] Cleanup: Failed to cancel algo ${order.algoId}:`,
                e.message,
              );
            }
          }
        }
      } catch (e: any) {
        console.error(
          `[OrderMonitor] cleanupOrdersForSymbol: Error fetching algo orders for ${symbol}:`,
          e.message,
        );
      }

      console.log(
        `[OrderMonitor] cleanupOrdersForSymbol: Finished cleanup for ${symbol}`,
      );
    } catch (error) {
      console.error(
        `[OrderMonitor] Error cleaning up orders for ${symbol}:`,
        error,
      );
    }
  }

  /**
   * Keep listenKey alive
   */
  private async keepAlive(conn: AccountConnection): Promise<void> {
    if (!conn.listenKey) return;

    try {
      const axios = (await import("axios")).default;
      const baseUrl = conn.testnet
        ? "https://testnet.binancefuture.com"
        : "https://fapi.binance.com";

      const client = axios.create({
        baseURL: baseUrl,
        headers: { "X-MBX-APIKEY": conn.apiKey },
      });

      await client.put("/fapi/v1/listenKey", null, {
        params: { listenKey: conn.listenKey },
      });

      console.log(
        `[OrderMonitor] Renewed listenKey for account ${conn.accountId}`,
      );
    } catch (error) {
      console.error(
        `[OrderMonitor] Failed to renew listenKey for ${conn.accountId}:`,
        error,
      );
      // Reconnect on renewal failure
      this.scheduleReconnect(conn);
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(conn: AccountConnection): void {
    if (!this.isRunning) return;
    if (conn.reconnectTimeout) return;

    console.log(
      `[OrderMonitor] Scheduling reconnect for account ${conn.accountId}...`,
    );

    // Clear existing resources
    if (conn.keepAliveInterval) {
      clearInterval(conn.keepAliveInterval);
      conn.keepAliveInterval = null;
    }
    if (conn.ws) {
      conn.ws.removeAllListeners();
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
      }
      conn.ws = null;
    }
    conn.listenKey = null;

    // Schedule reconnect
    conn.reconnectTimeout = setTimeout(async () => {
      conn.reconnectTimeout = null;
      if (this.isRunning) {
        await this.establishWebSocket(conn);
      }
    }, this.RECONNECT_DELAY_MS);
  }

  /**
   * Disconnect a specific account
   */
  private async disconnectAccount(accountId: string): Promise<void> {
    const conn = this.connections.get(accountId);
    if (!conn) return;

    // Clear intervals/timeouts
    if (conn.keepAliveInterval) {
      clearInterval(conn.keepAliveInterval);
    }
    if (conn.reconnectTimeout) {
      clearTimeout(conn.reconnectTimeout);
    }

    // Close WebSocket
    if (conn.ws) {
      conn.ws.removeAllListeners();
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
      }
    }

    // Delete listenKey
    if (conn.listenKey) {
      try {
        const axios = (await import("axios")).default;
        const baseUrl = conn.testnet
          ? "https://testnet.binancefuture.com"
          : "https://fapi.binance.com";

        const client = axios.create({
          baseURL: baseUrl,
          headers: { "X-MBX-APIKEY": conn.apiKey },
        });

        await client.delete("/fapi/v1/listenKey", {
          params: { listenKey: conn.listenKey },
        });
      } catch (e) {
        // Ignore delete errors
      }
    }

    this.connections.delete(accountId);
  }

  /**
   * Start polling fallback for orphaned orders
   */
  private startPolling(): void {
    console.log("[OrderMonitor] Starting polling fallback...");

    this.pollingInterval = setInterval(async () => {
      await this.pollOrphanedOrders();
    }, this.POLLING_INTERVAL_MS);
  }

  /**
   * Poll for orphaned SL/TP orders (no corresponding position)
   */
  private async pollOrphanedOrders(): Promise<void> {
    console.log(
      `[OrderMonitor] Polling heartbeat - checking at ${new Date().toISOString()}`,
    );
    for (const [accountId, conn] of this.connections) {
      try {
        const axios = (await import("axios")).default;
        const crypto = (await import("crypto")).default;

        const baseUrl = conn.testnet
          ? "https://testnet.binancefuture.com"
          : "https://fapi.binance.com";

        const client = axios.create({
          baseURL: baseUrl,
          headers: { "X-MBX-APIKEY": conn.apiKey },
        });

        const signRequest = (params: Record<string, any> = {}) => {
          const timestamp = Date.now();
          params.timestamp = timestamp;
          const queryString = new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
          ).toString();
          const signature = crypto
            .createHmac("sha256", conn.apiSecret)
            .update(queryString)
            .digest("hex");
          return `${queryString}&signature=${signature}`;
        };

        // Get current positions
        const posParams = signRequest();
        const posResponse = await client.get(
          `/fapi/v2/positionRisk?${posParams}`,
        );
        const positions = posResponse.data || [];

        // Build set of symbols with open positions
        const symbolsWithPosition = new Set<string>();
        for (const pos of positions) {
          const amt = parseFloat(pos.positionAmt);
          if (amt !== 0) {
            symbolsWithPosition.add(pos.symbol);
          }
        }

        // Get all open orders (regular orders)
        const ordersParams = signRequest();
        const ordersResponse = await client.get(
          `/fapi/v1/openOrders?${ordersParams}`,
        );
        const openOrders = ordersResponse.data || [];

        // Also get Algo orders (conditional orders like STOP_MARKET, TAKE_PROFIT_MARKET)
        let algoOrders: any[] = [];
        try {
          const algoParams = signRequest();
          const algoResponse = await client.get(
            `/fapi/v1/openAlgoOrders?${algoParams}`,
          );
          // Binance Algo API returns Array directly
          algoOrders = Array.isArray(algoResponse.data)
            ? algoResponse.data
            : [];
        } catch (e) {
          // Algo orders endpoint might fail, continue with regular orders
          console.warn(
            `[OrderMonitor] Could not fetch algo orders for account ${accountId}`,
          );
        }

        // Find symbols that have open orders but no position
        const allSymbolsWithOrders = new Set<string>();
        for (const order of openOrders) {
          allSymbolsWithOrders.add(order.symbol);
        }
        // Include symbols from Algo orders as well
        for (const order of algoOrders) {
          allSymbolsWithOrders.add(order.symbol);
        }

        if (allSymbolsWithOrders.size > 0 || symbolsWithPosition.size > 0) {
          console.log(
            `[OrderMonitor] Polling account ${accountId}: ${
              symbolsWithPosition.size
            } positions [${Array.from(symbolsWithPosition).join(
              ", ",
            )}], ${allSymbolsWithOrders.size} symbols with orders [${Array.from(
              allSymbolsWithOrders,
            ).join(", ")}]`,
          );
        }

        // Clean up symbols that have orders but no position
        for (const symbol of allSymbolsWithOrders) {
          if (!symbolsWithPosition.has(symbol)) {
            console.log(
              `[OrderMonitor] Found orphaned orders for ${symbol}, cleaning up...`,
            );
            await this.cleanupOrdersForSymbol(conn, symbol);
          }
        }

        // Note: The previous implementation iterated over orders directly.
        // The cleanupOrdersForSymbol method re-fetches orders, which is slightly inefficient if we already have them.
        // However, for code consistency and since this is a fallback poller (every 30s), it is acceptable.
        // If optimization is needed, we could pass the orders list to cleanupOrdersForSymbol, but that would complicate the signature.
      } catch (error) {
        console.error(
          `[OrderMonitor] Polling error for account ${accountId}:`,
          error,
        );
      }
    }
  }

  /**
   * Refresh account connections (e.g., when new account is added)
   */
  async refreshAccounts(): Promise<void> {
    console.log("[OrderMonitor] Refreshing account connections...");
    await this.loadAccountsAndConnect();
  }
}

// Export singleton
const binanceOrderMonitor = new BinanceOrderMonitor();
export default binanceOrderMonitor;
