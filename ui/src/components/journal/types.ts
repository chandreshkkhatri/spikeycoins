export interface JournalTrade {
  _id: string;
  accountId: string;
  userId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  positionSide: "BOTH" | "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  entryTime: string;
  exitTime: string | null;
  duration: number | null;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  maxQty: number;
  realizedPnl: number;
  commission: number;
  netPnl: number;
  fillCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  winRate: number;
  totalNetPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgDuration: number;
  totalCommission: number;
  expectancy: number;
}

export interface SyncStatus {
  lastSyncTime: number;
  syncStatus: "idle" | "syncing" | "error";
  initialSyncCompleted: boolean;
  totalFillsSynced: number;
  lastError: string | null;
  symbolsSynced?: string[];
}

export interface SyncResult {
  newTradesClosed: number;
  openTradesUpdated: number;
  fillsProcessed: number;
  syncDurationMs: number;
}

export interface ChartDataPoint {
  time: number;
  value: number;
  color?: string;
}

export type JournalPeriod = "7d" | "30d" | "90d" | "all";
