import { IAccount } from "../models/account";
import kiteConnectService from "./kiteconnect-service";
import upstoxService from "./upstox-service";
import { BinanceService } from "./binance-service";

/**
 * BrokerFactory handles instantiation and credential mapping
 * for broker-specific SDK services.
 */
export class BrokerFactory {
  static getKiteClient(account: IAccount): any {
    if (account.accountType !== "kite") {
      throw new Error("Invalid account type for Kite client");
    }
    kiteConnectService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret
    );
    if (account.accessToken) {
      kiteConnectService.setAccessToken(account.accessToken);
    }
    return kiteConnectService;
  }

  static getUpstoxClient(account: IAccount): any {
    if (account.accountType !== "upstox") {
      throw new Error("Invalid account type for Upstox client");
    }
    const isSandbox = account.metadata?.sandbox || false;
    upstoxService.initializeWithCredentials(
      account.apiKey,
      account.apiSecret,
      isSandbox
    );
    if (account.accessToken) {
      upstoxService.setAccessToken(account.accessToken);
    }
    return upstoxService;
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
