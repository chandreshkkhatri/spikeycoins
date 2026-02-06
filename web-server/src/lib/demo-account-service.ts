/**
 * Demo Account Service
 *
 * Provides a virtual demo Binance testnet account for all users.
 * - Non-authenticated users can view market data but cannot trade
 * - Authenticated users can trade on the demo account
 * - Demo credentials are loaded from DB (app_config collection), with env vars as fallback
 */

import { getConfigByKey } from "../models/app-config";

// Constant ID for the demo account - never changes
export const DEMO_ACCOUNT_ID = "system:demo:binance";

class DemoAccountService {
  private enabled: boolean;
  private apiKey: string | null;
  private apiSecret: string | null;
  private accountName: string;
  private isTestnet: boolean;
  private initialized: boolean;

  constructor() {
    // Load from env vars as initial/fallback values
    this.apiKey = process.env.DEMO_BINANCE_API_KEY || null;
    this.apiSecret = process.env.DEMO_BINANCE_API_SECRET || null;
    this.accountName =
      process.env.DEMO_ACCOUNT_NAME || "Binance Demo (Testnet)";
    this.isTestnet = process.env.DEMO_BINANCE_TESTNET === "true";
    this.enabled = !!(this.apiKey && this.apiSecret);
    this.initialized = false;

    if (this.enabled) {
      console.log(
        `[DemoAccount] Demo account enabled from env: ${this.accountName} (testnet: ${this.isTestnet})`
      );
    }
  }

  /**
   * Load demo account config from DB. Call after DB connection is ready.
   * Overrides env var values if DB config exists.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const config = await getConfigByKey("demo_account");
      if (config?.value) {
        const { apiKey, apiSecret, accountName, isTestnet } = config.value;
        if (apiKey && apiSecret) {
          this.apiKey = apiKey;
          this.apiSecret = apiSecret;
          if (accountName) this.accountName = accountName;
          if (isTestnet !== undefined) this.isTestnet = isTestnet;
          this.enabled = true;
          this.initialized = true;
          console.log(
            `[DemoAccount] Demo account loaded from DB: ${this.accountName} (testnet: ${this.isTestnet})`
          );
          return;
        }
      }
    } catch (err) {
      console.warn("[DemoAccount] Failed to load from DB, using env fallback:", err);
    }

    this.initialized = true;

    if (this.enabled) {
      console.log(
        `[DemoAccount] Using env var fallback: ${this.accountName} (testnet: ${this.isTestnet})`
      );
    } else {
      console.log("[DemoAccount] Demo account not configured (no DB config or env vars)");
    }
  }

  /**
   * Check if demo account is enabled via environment variables
   */
  isDemoAccountEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get demo account object
   * @param includeCredentials - If true, includes API key and secret (backend only!)
   */
  getDemoAccount(includeCredentials = false): any | null {
    if (!this.enabled) return null;

    const account: any = {
      _id: DEMO_ACCOUNT_ID,
      userId: "system",
      accountType: "binance",
      accountName: this.accountName,
      isActive: true,
      isDemo: true,
      metadata: {
        testnet: this.isTestnet,
        tradingSegment: "usdm",
      },
    };

    // Only include credentials for backend operations
    if (includeCredentials) {
      account.apiKey = this.apiKey;
      account.apiSecret = this.apiSecret;
    }

    return account;
  }

  /**
   * Check if an accountId is the demo account
   */
  isDemoAccountId(accountId: string): boolean {
    return accountId === DEMO_ACCOUNT_ID;
  }

  /**
   * Get demo API credentials (backend only)
   */
  getCredentials(): { apiKey: string; apiSecret: string } | null {
    if (!this.enabled || !this.apiKey || !this.apiSecret) return null;
    return { apiKey: this.apiKey, apiSecret: this.apiSecret };
  }
}

// Export singleton instance
export const demoAccountService = new DemoAccountService();
