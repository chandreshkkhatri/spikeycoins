import { IAccount } from "../models/account";
import { UpstoxService } from "./upstox-service";
import { BinanceService } from "./binance-service";

/**
 * BrokerFactory handles instantiation and credential mapping
 * for broker-specific SDK services.
 */
export class BrokerFactory {
  static getUpstoxClient(account: IAccount): UpstoxService {
    if (account.accountType !== "upstox") {
      throw new Error("Invalid account type for Upstox client");
    }
    const isSandbox = account.metadata?.sandbox || false;
    const service = new UpstoxService();
    service.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox
    );
    if (account.accessToken) {
      service.setAccessToken(account.accessToken);
    }
    return service;
  }

  static getBinanceClient(account: IAccount) {
    if (account.accountType !== "binance") {
      throw new Error("Invalid account type for Binance client");
    }
    const isTestnet = account.metadata?.testnet || false;
    const service = new BinanceService();
    service.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isTestnet
    );
    return service;
  }
}
