export interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: "binance" | "upstox";
  isActive?: boolean;
  accessToken?: string;
}

export interface AccountError {
  accountId: string;
  accountName: string;
  requiresReauth: boolean;
  message: string;
}
