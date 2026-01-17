export interface IAccount {
  _id?: string;
  userId: string;
  accountType: "kite" | "upstox" | "binance";
  accountName: string;
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  refreshToken?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  metadata?: {
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    testnet?: boolean;
    sandbox?: boolean;
    tradingSegment?: "spot" | "usdm"; // Binance: spot or USD(S)-M Futures
    [key: string]: any;
  };
  createdAt?: Date;
  updatedAt?: Date;
}
