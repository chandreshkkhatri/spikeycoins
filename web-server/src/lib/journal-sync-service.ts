import { BinanceService } from "./binance-service";
import JournalTrade, { IJournalTrade } from "../models/journal-trade";
import JournalSync, { IJournalSync } from "../models/journal-sync";

// ── Types ──────────────────────────────────────────────

export interface BinanceFill {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  positionSide: "BOTH" | "LONG" | "SHORT";
  price: string;
  qty: string;
  quoteQty: string;
  realizedPnl: string;
  commission: string;
  commissionAsset: string;
  time: number;
  orderId: number;
  buyer: boolean;
  maker: boolean;
}

interface PositionState {
  symbol: string;
  positionSide: "BOTH" | "LONG" | "SHORT";
  netQty: number;
  fills: BinanceFill[];
  weightedEntryNumerator: number;
  entryQty: number;
}

interface GroupingResult {
  completedTrades: Partial<IJournalTrade>[];
  openStates: Map<string, PositionState>;
}

export interface SyncResult {
  newTradesClosed: number;
  openTradesUpdated: number;
  fillsProcessed: number;
  syncDurationMs: number;
}

export type SyncProgressEvent =
  | { stage: "discovering" }
  | { stage: "fetching"; symbol: string; symbolIndex: number; totalSymbols: number }
  | { stage: "processing"; totalFills: number }
  | { stage: "persisting" }
  | { stage: "done"; result: SyncResult }
  | { stage: "error"; error: string };

// ── Constants ──────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const INCOME_CHUNK_MS = 90 * 24 * 60 * 60 * 1000; // Income history ~3 month limit per call
const SYNC_OVERLAP_MS = 60_000; // 60s overlap for clock skew
const MAX_FILLS_PER_REQUEST = 1000;
const MAX_SYMBOLS = 20;
const STALE_SYNC_MS = 5 * 60 * 1000; // 5 min — assume crashed if stuck longer

// ── Helpers ────────────────────────────────────────────

function stateKey(symbol: string, positionSide: string): string {
  return `${symbol}:${positionSide}`;
}

/**
 * Returns signed quantity based on fill side and positionSide.
 * Positive = increases long exposure, Negative = increases short exposure.
 */
function getSignedQty(fill: BinanceFill): number {
  const qty = parseFloat(fill.qty);
  // For all positionSide modes: BUY = +qty, SELL = -qty
  // This works because:
  // - BOTH: BUY adds long, SELL adds short (or closes long)
  // - LONG: BUY opens, SELL closes
  // - SHORT: SELL opens (we track as negative), BUY closes (positive)
  return fill.side === "BUY" ? qty : -qty;
}

/**
 * Returns true if this fill is an entry fill (increases absolute position).
 */
function isEntryFill(prevQty: number, signedQty: number): boolean {
  if (prevQty === 0) return true;
  return Math.abs(prevQty + signedQty) > Math.abs(prevQty);
}

function newPositionState(
  symbol: string,
  positionSide: "BOTH" | "LONG" | "SHORT",
): PositionState {
  return {
    symbol,
    positionSide,
    netQty: 0,
    fills: [],
    weightedEntryNumerator: 0,
    entryQty: 0,
  };
}

/**
 * Generate 7-day windows covering [start, end].
 */
function generateWindows(
  start: number,
  end: number,
): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  let windowStart = start;
  while (windowStart < end) {
    const windowEnd = Math.min(windowStart + SEVEN_DAYS_MS, end);
    windows.push({ start: windowStart, end: windowEnd });
    windowStart = windowEnd;
  }
  return windows;
}

/**
 * Discover symbols with trading activity from Binance.
 * Income history has a ~3-month retention per call, so we chunk the full
 * range into 90-day slices to cover up to 6 months of symbol history.
 */
async function discoverSymbols(
  service: BinanceService,
  startTime: number,
  endTime: number,
): Promise<string[]> {
  const symbols = new Set<string>();

  // Chunk into 90-day slices to cover the full range
  let chunkStart = startTime;
  while (chunkStart < endTime) {
    const chunkEnd = Math.min(chunkStart + INCOME_CHUNK_MS, endTime);
    try {
      const income = await service.getFuturesIncomeHistory(
        "REALIZED_PNL",
        1000,
        chunkStart,
        chunkEnd,
      );
      if (Array.isArray(income)) {
        for (const i of income) {
          if (i.symbol) symbols.add(i.symbol as string);
        }
      }
    } catch (err) {
      console.warn(
        `Journal: Failed to derive symbols from income [${new Date(chunkStart).toISOString()} - ${new Date(chunkEnd).toISOString()}]:`,
        err,
      );
    }
    chunkStart = chunkEnd;
  }

  if (symbols.size > 0) {
    console.log(`Journal: Discovered ${symbols.size} symbols from income history: ${[...symbols].join(", ")}`);
    return [...symbols].slice(0, MAX_SYMBOLS);
  }

  // Fallback to current positions
  try {
    const positions = await service.getFuturesPositions();
    if (Array.isArray(positions)) {
      const posSymbols = positions
        .filter((p: any) => parseFloat(p.positionAmt) !== 0)
        .map((p: any) => p.symbol as string);
      for (const s of posSymbols) symbols.add(s);
      if (symbols.size > 0) {
        console.log(`Journal: Discovered ${symbols.size} symbols from positions: ${[...symbols].join(", ")}`);
        return [...symbols].slice(0, MAX_SYMBOLS);
      }
    }
  } catch (err) {
    console.warn("Journal: Failed to derive symbols from positions:", err);
  }

  console.log("Journal: No symbols with trading activity found");
  return [];
}

/**
 * Fetch fills for a symbol within a time window.
 * Recursively subdivides if we hit the 1000-fill limit.
 */
async function fetchFillsForWindow(
  service: BinanceService,
  symbol: string,
  start: number,
  end: number,
): Promise<BinanceFill[]> {
  const fills: BinanceFill[] = await service.getFuturesUserTrades(
    symbol,
    MAX_FILLS_PER_REQUEST,
    start,
    end,
  );

  if (fills.length >= MAX_FILLS_PER_REQUEST && end - start > 1000) {
    // Might have missed fills — subdivide (sequential to avoid deep queue fan-out)
    const mid = Math.floor((start + end) / 2);
    const first = await fetchFillsForWindow(service, symbol, start, mid);
    const second = await fetchFillsForWindow(service, symbol, mid, end);
    // Deduplicate by id
    const seen = new Set<number>();
    const combined: BinanceFill[] = [];
    for (const f of [...first, ...second]) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        combined.push(f);
      }
    }
    return combined;
  }

  return fills;
}

// ── Round-Trip Grouping Algorithm ──────────────────────

/**
 * Build a JournalTrade record from a completed position state.
 */
function buildRoundTrip(
  state: PositionState,
  accountId: string,
  userId: string,
  closed: boolean,
): Partial<IJournalTrade> {
  const fills = state.fills;
  const firstFill = fills[0];
  const lastFill = fills[fills.length - 1];

  // Compute weighted avg exit price from exit fills
  let exitNumerator = 0;
  let exitQty = 0;
  let runningQty = 0;
  for (const fill of fills) {
    const sq = getSignedQty(fill);
    const isEntry = isEntryFill(runningQty, sq);
    if (!isEntry) {
      const q = parseFloat(fill.qty);
      exitNumerator += parseFloat(fill.price) * q;
      exitQty += q;
    }
    runningQty += sq;
  }

  const avgEntryPrice =
    state.entryQty > 0 ? state.weightedEntryNumerator / state.entryQty : 0;
  const avgExitPrice = exitQty > 0 ? exitNumerator / exitQty : null;

  const realizedPnl = fills.reduce(
    (sum, f) => sum + parseFloat(f.realizedPnl),
    0,
  );
  const totalCommission = fills.reduce(
    (sum, f) => sum + parseFloat(f.commission),
    0,
  );
  const netPnl = realizedPnl - totalCommission;

  // Determine direction from first fill
  const firstSignedQty = getSignedQty(firstFill);
  const direction: "LONG" | "SHORT" =
    state.positionSide === "SHORT"
      ? "SHORT"
      : state.positionSide === "LONG"
        ? "LONG"
        : firstSignedQty > 0
          ? "LONG"
          : "SHORT";

  const entryTime = new Date(firstFill.time);
  const exitTime = closed ? new Date(lastFill.time) : null;
  const duration = closed ? lastFill.time - firstFill.time : null;

  return {
    accountId,
    userId,
    symbol: state.symbol,
    direction,
    positionSide: state.positionSide,
    status: closed ? "CLOSED" : "OPEN",
    entryTime,
    exitTime,
    duration,
    avgEntryPrice,
    avgExitPrice,
    maxQty: state.entryQty,
    realizedPnl,
    commission: totalCommission,
    netPnl,
    currentQty: state.netQty,
    weightedEntryNumerator: state.weightedEntryNumerator,
    entryQty: state.entryQty,
    fillIds: fills.map((f) => f.id),
    fillCount: fills.length,
  };
}

/**
 * Process fills into round-trip trades.
 */
function processFilsIntoRoundTrips(
  fills: BinanceFill[],
  existingStates: Map<string, PositionState>,
  accountId: string,
  userId: string,
): GroupingResult {
  const completedTrades: Partial<IJournalTrade>[] = [];
  const states = new Map(existingStates);

  for (const fill of fills) {
    const key = stateKey(fill.symbol, fill.positionSide);
    let state = states.get(key) || newPositionState(fill.symbol, fill.positionSide);

    const prevQty = state.netQty;
    const signedQty = getSignedQty(fill);
    const newQty = prevQty + signedQty;

    // Track entry fills for weighted avg price
    if (isEntryFill(prevQty, signedQty)) {
      state.weightedEntryNumerator +=
        Math.abs(signedQty) * parseFloat(fill.price);
      state.entryQty += Math.abs(signedQty);
    }

    state.fills.push(fill);
    state.netQty = newQty;

    // Round to 8 decimal places to avoid floating-point dust
    const roundedNewQty = Math.round(newQty * 1e8) / 1e8;

    // Position closed (back to zero)
    if (roundedNewQty === 0) {
      state.netQty = 0;
      completedTrades.push(buildRoundTrip(state, accountId, userId, true));
      states.delete(key);
      continue;
    }

    // Position flipped (one-way mode: crossed zero to opposite side)
    if (
      prevQty !== 0 &&
      Math.sign(roundedNewQty) !== Math.sign(prevQty)
    ) {
      const closeQty = Math.abs(prevQty);
      const openQty = Math.abs(roundedNewQty);

      // Close old trade with a synthetic partial fill
      const closeFill: BinanceFill = {
        ...fill,
        qty: closeQty.toString(),
      };
      state.fills[state.fills.length - 1] = closeFill;
      state.netQty = 0;
      completedTrades.push(buildRoundTrip(state, accountId, userId, true));

      // Start new trade with remaining qty
      const openFill: BinanceFill = {
        ...fill,
        qty: openQty.toString(),
        realizedPnl: "0", // opening fill has no realized PnL
      };
      const freshState = newPositionState(fill.symbol, fill.positionSide);
      freshState.netQty = roundedNewQty;
      freshState.fills = [openFill];
      freshState.weightedEntryNumerator = parseFloat(fill.price) * openQty;
      freshState.entryQty = openQty;
      states.set(key, freshState);
      continue;
    }

    // Update max qty
    state.netQty = roundedNewQty;
    states.set(key, state);
  }

  return { completedTrades, openStates: states };
}

// ── Sync Orchestration ─────────────────────────────────

/**
 * Fetch all fills for given symbols within a time range.
 */
async function fetchAllFills(
  service: BinanceService,
  symbols: string[],
  startTime: number,
  endTime: number,
  onProgress?: (event: SyncProgressEvent) => void,
): Promise<BinanceFill[]> {
  const windows = generateWindows(startTime, endTime);
  const allFills: BinanceFill[] = [];

  for (let si = 0; si < symbols.length; si++) {
    const symbol = symbols[si];
    onProgress?.({ stage: "fetching", symbol, symbolIndex: si + 1, totalSymbols: symbols.length });
    for (const window of windows) {
      try {
        const fills = await fetchFillsForWindow(
          service,
          symbol,
          window.start,
          window.end,
        );
        allFills.push(...fills);
      } catch (err: any) {
        console.warn(
          `Journal: Failed to fetch fills for ${symbol} [${new Date(window.start).toISOString()} - ${new Date(window.end).toISOString()}]:`,
          err?.message || err,
        );
      }
    }
  }

  // Deduplicate by fill id
  const seen = new Set<number>();
  const unique: BinanceFill[] = [];
  for (const f of allFills) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      unique.push(f);
    }
  }

  // Sort by time asc, then by id asc as tiebreaker
  unique.sort((a, b) => a.time - b.time || a.id - b.id);
  return unique;
}

/**
 * Rebuild position states from existing OPEN trades in DB.
 */
function rebuildStatesFromOpenTrades(
  openTrades: IJournalTrade[],
): Map<string, PositionState> {
  const states = new Map<string, PositionState>();

  for (const trade of openTrades) {
    const key = stateKey(trade.symbol, trade.positionSide);
    states.set(key, {
      symbol: trade.symbol,
      positionSide: trade.positionSide,
      netQty: trade.currentQty,
      fills: [], // We don't re-store raw fills; we resume from state
      weightedEntryNumerator: trade.weightedEntryNumerator,
      entryQty: trade.entryQty,
    });
  }

  return states;
}

/**
 * Run a full sync for an account.
 */
export async function syncAccount(
  accountId: string,
  userId: string,
  service: BinanceService,
  onProgress?: (event: SyncProgressEvent) => void,
): Promise<SyncResult> {
  const startMs = Date.now();

  // Check if already syncing (with stale lock recovery)
  let syncState = await JournalSync.findOne({ accountId });
  if (syncState?.syncStatus === "syncing") {
    const staleSince = Date.now() - new Date(syncState.updatedAt).getTime();
    if (staleSince < STALE_SYNC_MS) {
      throw new Error("Sync already in progress for this account");
    }
    console.warn(
      `Journal sync [${accountId}]: Resetting stale sync lock (${(staleSince / 1000).toFixed(0)}s old)`,
    );
  }

  // Create or update sync state to "syncing"
  if (!syncState) {
    syncState = await JournalSync.create({
      accountId,
      userId,
      syncStatus: "syncing",
    });
  } else {
    syncState.syncStatus = "syncing";
    syncState.lastError = null;
    await syncState.save();
  }

  try {
    const isInitial = !syncState.initialSyncCompleted;
    const now = Date.now();

    // Determine time range
    let startTime: number;
    if (isInitial) {
      startTime = now - SIX_MONTHS_MS;
    } else {
      // Incremental: fetch since last sync with overlap buffer
      startTime = Math.max(
        (syncState.lastSyncTime || now - SEVEN_DAYS_MS) - SYNC_OVERLAP_MS,
        now - SIX_MONTHS_MS,
      );
    }

    // Discover symbols
    onProgress?.({ stage: "discovering" });
    const openTrades = await JournalTrade.find({ accountId, status: "OPEN" });
    const openSymbols = [...new Set(openTrades.map((t) => t.symbol))];
    const discoveredSymbols = await discoverSymbols(service, startTime, now);
    const allSymbols = [
      ...new Set([...openSymbols, ...discoveredSymbols]),
    ].slice(0, MAX_SYMBOLS);

    console.log(
      `Journal sync [${accountId}]: ${isInitial ? "Initial" : "Incremental"} sync, ` +
      `${allSymbols.length} symbols (${openSymbols.length} from open trades, ${discoveredSymbols.length} discovered)`,
    );

    if (allSymbols.length === 0) {
      // No trading activity found
      console.log(`Journal sync [${accountId}]: No symbols found, nothing to sync`);
      syncState.syncStatus = "idle";
      syncState.lastSyncTime = now;
      syncState.initialSyncCompleted = true;
      await syncState.save();
      return {
        newTradesClosed: 0,
        openTradesUpdated: 0,
        fillsProcessed: 0,
        syncDurationMs: Date.now() - startMs,
      };
    }

    // Fetch fills
    const allFills = await fetchAllFills(service, allSymbols, startTime, now, onProgress);
    console.log(`Journal sync [${accountId}]: Fetched ${allFills.length} total fills`);

    // Filter out already-consumed fills from open trades
    const knownFillIds = new Set(openTrades.flatMap((t) => t.fillIds));
    const newFills = allFills.filter((f) => !knownFillIds.has(f.id));
    console.log(`Journal sync [${accountId}]: ${newFills.length} new fills after dedup`);

    if (newFills.length === 0 && !isInitial) {
      syncState.syncStatus = "idle";
      syncState.lastSyncTime = now;
      await syncState.save();
      return {
        newTradesClosed: 0,
        openTradesUpdated: 0,
        fillsProcessed: 0,
        syncDurationMs: Date.now() - startMs,
      };
    }

    // Rebuild states from open trades
    onProgress?.({ stage: "processing", totalFills: newFills.length });
    const existingStates = rebuildStatesFromOpenTrades(openTrades);

    // Process fills through round-trip grouper
    const { completedTrades, openStates } = processFilsIntoRoundTrips(
      newFills,
      existingStates,
      accountId,
      userId,
    );

    // Persist completed trades
    onProgress?.({ stage: "persisting" });
    if (completedTrades.length > 0) {
      await JournalTrade.insertMany(completedTrades);
    }

    // Update or create open trades
    // First, delete old OPEN trades that were resumed (they'll be replaced)
    if (openTrades.length > 0) {
      await JournalTrade.deleteMany({
        _id: { $in: openTrades.map((t) => t._id) },
      });
    }

    // Insert updated open trades
    let openTradesUpdated = 0;
    for (const [, state] of openStates) {
      const tradeData = buildRoundTrip(state, accountId, userId, false);
      await JournalTrade.create(tradeData);
      openTradesUpdated++;
    }

    // Update sync state
    const lastFillTime =
      newFills.length > 0 ? newFills[newFills.length - 1].time : syncState.lastFillTime;

    syncState.syncStatus = "idle";
    syncState.lastSyncTime = now;
    syncState.lastFillTime = lastFillTime;
    syncState.initialSyncCompleted = true;
    syncState.totalFillsSynced =
      (syncState.totalFillsSynced || 0) + newFills.length;
    syncState.symbolsSynced = allSymbols;
    await syncState.save();

    const result = {
      newTradesClosed: completedTrades.length,
      openTradesUpdated,
      fillsProcessed: newFills.length,
      syncDurationMs: Date.now() - startMs,
    };
    console.log(
      `Journal sync [${accountId}]: Complete — ${result.newTradesClosed} closed trades, ` +
      `${result.openTradesUpdated} open trades, ${result.fillsProcessed} fills processed ` +
      `in ${(result.syncDurationMs / 1000).toFixed(1)}s`,
    );
    onProgress?.({ stage: "done", result });
    return result;
  } catch (err: any) {
    // Mark sync as errored
    onProgress?.({ stage: "error", error: err?.message || "Unknown sync error" });
    syncState.syncStatus = "error";
    syncState.lastError = err?.message || "Unknown sync error";
    await syncState.save();
    throw err;
  }
}
