"use client";

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAccount, TradingAccount } from './account-context';
import { useAuth } from './auth-context';
import api from '@/lib/api';
import { toSafeNumber } from '@/lib/number-utils';

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: string;
  symbol: string;
  size: number;
  entryPrice: number;
  pnl: number;
  leverage: number;
  liquidationPrice?: number;
  breakEvenPrice?: number;
  margin?: number;
  marginType?: string;
}

interface Order {
  id: string;
  symbol: string;
  price: number;
  stopPrice?: number;
  orderType: string;
  transactionType: string;
  quantity: number;
  status: string;
  filledQuantity?: number;
  timestamp?: string | number;
  orderCategory?: 'basic' | 'conditional';
  closePosition?: boolean;
}

interface AccountDetails {
  equity: number;
  availableBalance: number;
  totalMargin?: number;
}

interface SymbolInfo {
  tickSize: string;
  stepSize: string;
  minQty: number;
  minNotional: number;
  maxLeverage: number;
}

interface TradingDataContextType {
  // Data
  positions: Position[];
  orders: Order[];
  accountDetails: AccountDetails | null;
  symbolInfo: SymbolInfo;
  existingPosition: Position | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  lastRefresh: number | null;
  
  // Actions
  refreshAll: () => Promise<void>;
  setActiveSymbol: (symbol: string) => void;
  activeSymbol: string;
}

const TradingDataContext = createContext<TradingDataContextType | undefined>(undefined);

// ============================================================================
// Hook
// ============================================================================

export const useTradingData = () => {
  const context = useContext(TradingDataContext);
  if (context === undefined) {
    throw new Error('useTradingData must be used within a TradingDataProvider');
  }
  return context;
};

// ============================================================================
// Provider
// ============================================================================

interface TradingDataProviderProps {
  children: ReactNode;
}

// Global promise cache to deduplicate simultaneous fetches
const DATA_PROMISE_CACHE = new Map<string, Promise<unknown>>();

// Stale-while-revalidate cache for account details (longer TTL)
interface CachedData<T> {
  data: T;
  timestamp: number;
}
const ACCOUNT_DETAILS_CACHE = new Map<string, CachedData<AccountDetails>>();
const ACCOUNT_CACHE_TTL = 30000; // 30 seconds - account balance doesn't change every second
const ACCOUNT_CACHE_STALE_TTL = 60000; // 60 seconds - serve stale data while refreshing

// Cache for aggregated summary data
interface SummaryCache {
  positions: Position[];
  orders: Order[];
  accountDetails: AccountDetails | null;
  symbolInfo: SymbolInfo;
  timestamp: number;
}
const SUMMARY_CACHE = new Map<string, SummaryCache>();
const SUMMARY_CACHE_TTL = 5000; // 5 seconds for summary data

const DEFAULT_SYMBOL_INFO: SymbolInfo = {
  tickSize: '0.01',
  stepSize: '0.001',
  minQty: 0,
  minNotional: 0,
  maxLeverage: 125,
};

// ============================================================================
// Local Storage Cache
// ============================================================================

const localCache = {
  get: <T,>(key: string): T | null => {
    try {
      if (typeof window === 'undefined') return null;
      const item = window.localStorage.getItem(key);
      if (!item) return null;
      
      const parsed = JSON.parse(item);
      if (!parsed || !parsed.timestamp) return null;
      
      // Check TTL if specified in the stored object (optional)
      if (parsed.expiry && Date.now() > parsed.expiry) {
        window.localStorage.removeItem(key);
        return null;
      }
      
      return parsed.data as T;
    } catch (e) {
      console.warn('Failed to read from local storage:', e);
      return null;
    }
  },
  
  set: <T,>(key: string, data: T, ttlMs?: number) => {
    try {
      if (typeof window === 'undefined') return;
      const payload: { data: T; timestamp: number; expiry?: number } = {
        data,
        timestamp: Date.now(),
      };
      
      if (ttlMs) {
        payload.expiry = Date.now() + ttlMs;
      }
      
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to write to local storage:', e);
    }
  }
};

export const TradingDataProvider: React.FC<TradingDataProviderProps> = ({ children }) => {
  const { selectedAccount } = useAccount();
  const { isLoggedIn } = useAuth();
  
  // Active symbol for position/order filtering
  const [activeSymbol, setActiveSymbol] = useState<string>('');
  
  // Core data
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [symbolInfo, setSymbolInfo] = useState<SymbolInfo>(DEFAULT_SYMBOL_INFO);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  
  // Refs for deduplication
  const fetchInProgress = useRef(false);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 1000; // 1 second between fetches
  
  // Derived: existing position for active symbol
  const existingPosition = positions.find(p => p.symbol === activeSymbol) || null;
  
  // ============================================================================
  // Fetch Functions
  // ============================================================================
  
  const fetchPositions = useCallback(async (account: TradingAccount): Promise<Position[]> => {
    const cacheKey = `positions-${account._id}`;
    
    let promise = DATA_PROMISE_CACHE.get(cacheKey) as Promise<Position[]> | undefined;
    if (promise) return promise;
    
    promise = (async () => {
      try {
        const response = await api.get('/positions', {
          params: {
            vendor: account.accountType,
            accountId: account._id,
          },
        });
        
        if (response.data?.success) {
          const posData = response.data.data || response.data.positions || [];
          return posData
            .filter((p: { quantity: number }) => Math.abs(p.quantity) > 0)
            .map((p: {
              id?: string;
              symbol: string;
              quantity: number;
              entryPrice?: number;
              averagePrice?: number;
              pnl?: number;
              unrealizedPnl?: number;
              leverage?: number;
              liquidationPrice?: number;
              breakEvenPrice?: number;
              margin?: number;
              marginType?: string;
            }) => ({
              id: p.id || p.symbol,
              symbol: p.symbol,
              size: toSafeNumber(p.quantity, 0),
              entryPrice: toSafeNumber(p.entryPrice || p.averagePrice, 0),
              pnl: toSafeNumber(p.pnl || p.unrealizedPnl, 0),
              leverage: toSafeNumber(p.leverage, 1),
              liquidationPrice: toSafeNumber(p.liquidationPrice),
              breakEvenPrice: toSafeNumber(p.breakEvenPrice),
              margin: p.margin,
              marginType: p.marginType,
            }));
        }
        return [];
      } finally {
        setTimeout(() => DATA_PROMISE_CACHE.delete(cacheKey), 2000);
      }
    })();
    
    DATA_PROMISE_CACHE.set(cacheKey, promise);
    return promise;
  }, []);
  
  const fetchOrders = useCallback(async (account: TradingAccount): Promise<Order[]> => {
    const cacheKey = `orders-${account._id}`;
    
    let promise = DATA_PROMISE_CACHE.get(cacheKey) as Promise<Order[]> | undefined;
    if (promise) return promise;
    
    promise = (async () => {
      try {
        const response = await api.get('/orders', {
          params: {
            vendor: account.accountType,
            accountId: account._id,
          },
        });
        
        if (response.data?.success) {
          const ordersData = response.data.orders || response.data.data || [];
          return ordersData.map((o: {
            id?: string;
            orderId?: string;
            symbol: string;
            price?: string | number;
            stopPrice?: string | number;
            orderType?: string;
            type?: string;
            transactionType?: string;
            side?: string;
            quantity?: string | number;
            origQty?: string | number;
            status: string;
            filledQuantity?: string | number;
            executedQty?: string | number;
            timestamp?: string | number;
            time?: string | number;
            orderCategory?: 'basic' | 'conditional';
            closePosition?: boolean;
          }) => ({
            id: o.id || o.orderId || '',
            symbol: o.symbol,
            price: parseFloat(String(o.price)) || 0,
            stopPrice: parseFloat(String(o.stopPrice)) || 0,
            orderType: o.orderType || o.type || '',
            transactionType: o.transactionType || o.side || '',
            quantity: parseFloat(String(o.quantity || o.origQty)) || 0,
            status: o.status,
            filledQuantity: parseFloat(String(o.filledQuantity || o.executedQty)) || 0,
            timestamp: o.timestamp || o.time,
            orderCategory: o.orderCategory,
            closePosition: o.closePosition,
          }));
        }
        return [];
      } finally {
        setTimeout(() => DATA_PROMISE_CACHE.delete(cacheKey), 2000);
      }
    })();
    
    DATA_PROMISE_CACHE.set(cacheKey, promise);
    return promise;
  }, []);
  
  const fetchAccountDetails = useCallback(async (account: TradingAccount, symbol: string): Promise<{
    accountDetails: AccountDetails | null;
    symbolInfo: SymbolInfo;
    position: Position | null;
  }> => {
    if (account.accountType !== 'binance') {
      // For non-Binance, fetch funds endpoint with longer cache
      const accountCacheKey = `funds-${account._id}`;
      const now = Date.now();

      // Check stale-while-revalidate cache first
      const cached = ACCOUNT_DETAILS_CACHE.get(accountCacheKey);
      if (cached && (now - cached.timestamp) < ACCOUNT_CACHE_TTL) {
        // Fresh cache - return immediately
        return {
          accountDetails: cached.data,
          symbolInfo: DEFAULT_SYMBOL_INFO,
          position: null,
        };
      }

      // Check if we have stale data to return while refreshing
      const hasStaleData = cached && (now - cached.timestamp) < ACCOUNT_CACHE_STALE_TTL;

      let promise = DATA_PROMISE_CACHE.get(accountCacheKey) as Promise<{ accountDetails: AccountDetails | null; symbolInfo: SymbolInfo; position: Position | null }> | undefined;
      if (promise) {
        // Already fetching - return stale data if available, otherwise wait
        if (hasStaleData) {
          return { accountDetails: cached.data, symbolInfo: DEFAULT_SYMBOL_INFO, position: null };
        }
        return promise;
      }

      promise = (async () => {
        try {
          const response = await api.get(`/funds?accountId=${account._id}`);
          const data = response.data;

          let availableBalance = 0;
          if (data?.available) {
            availableBalance = parseFloat(data.available) || 0;
          } else if (data?.data) {
            availableBalance = parseFloat(data.data.availableCash || data.data.net) || 0;
          }

          const accountDetails = { equity: availableBalance, availableBalance };
          // Cache account details with longer TTL
          ACCOUNT_DETAILS_CACHE.set(accountCacheKey, { data: accountDetails, timestamp: Date.now() });

          return {
            accountDetails,
            symbolInfo: DEFAULT_SYMBOL_INFO,
            position: null,
          };
        } finally {
          setTimeout(() => DATA_PROMISE_CACHE.delete(accountCacheKey), 2000);
        }
      })();

      DATA_PROMISE_CACHE.set(accountCacheKey, promise);

      // Return stale data immediately while refresh happens in background
      if (hasStaleData) {
        promise.catch(() => {}); // Suppress unhandled rejection
        return { accountDetails: cached.data, symbolInfo: DEFAULT_SYMBOL_INFO, position: null };
      }
      return promise;
    }

    // Binance: Check account cache first (account details don't change with symbol)
    const accountCacheKey = `binance-account-${account._id}`;
    const now = Date.now();
    const cachedAccount = ACCOUNT_DETAILS_CACHE.get(accountCacheKey);
    const hasValidAccountCache = cachedAccount && (now - cachedAccount.timestamp) < ACCOUNT_CACHE_TTL;
    const hasStaleAccountCache = cachedAccount && (now - cachedAccount.timestamp) < ACCOUNT_CACHE_STALE_TTL;

    // Symbol-specific cache (shorter TTL since position/leverage can change)
    const symbolCacheKey = `binance-details-${account._id}-${symbol}`;
    let promise = DATA_PROMISE_CACHE.get(symbolCacheKey) as Promise<{ accountDetails: AccountDetails | null; symbolInfo: SymbolInfo; position: Position | null }> | undefined;

    // If we have fresh account cache and are already fetching, return cached account data
    if (promise && hasValidAccountCache) {
      // Return immediately with cached account, let symbol fetch complete in background
      return promise;
    }

    if (promise) return promise;

    promise = (async () => {
      try {
        const response = await api.get('/binance/position-details', {
          params: {
            accountId: account._id,
            symbol,
          },
        });

        const data = response.data;
        if (!data?.success) {
          // Return cached account data if available
          if (hasStaleAccountCache) {
            return { accountDetails: cachedAccount.data, symbolInfo: DEFAULT_SYMBOL_INFO, position: null };
          }
          return { accountDetails: null, symbolInfo: DEFAULT_SYMBOL_INFO, position: null };
        }

        const acctData = data.account;
        const symInfo = data.symbolInfo;
        const posData = data.position;

        const accountDetails = acctData ? {
          equity: acctData.equity || 0,
          availableBalance: acctData.availableBalance || acctData.equity || 0,
          totalMargin: acctData.totalMargin,
        } : null;

        // Cache account details separately with longer TTL
        if (accountDetails) {
          ACCOUNT_DETAILS_CACHE.set(accountCacheKey, { data: accountDetails, timestamp: Date.now() });
        }

        return {
          accountDetails,
          symbolInfo: symInfo ? {
            tickSize: symInfo.tickSize || DEFAULT_SYMBOL_INFO.tickSize,
            stepSize: symInfo.stepSize || DEFAULT_SYMBOL_INFO.stepSize,
            minQty: symInfo.minQty || DEFAULT_SYMBOL_INFO.minQty,
            minNotional: symInfo.minNotional || DEFAULT_SYMBOL_INFO.minNotional,
            maxLeverage: symInfo.maxLeverage || posData?.maxLeverage || DEFAULT_SYMBOL_INFO.maxLeverage,
          } : DEFAULT_SYMBOL_INFO,
          position: posData && toSafeNumber(posData.size, 0) !== 0 ? {
            id: posData.symbol,
            symbol: posData.symbol,
            size: toSafeNumber(posData.size, 0),
            entryPrice: toSafeNumber(posData.entryPrice, 0),
            pnl: toSafeNumber(posData.pnl, 0),
            leverage: toSafeNumber(posData.leverage, 1),
            liquidationPrice: toSafeNumber(posData.liquidationPrice),
            breakEvenPrice: toSafeNumber(posData.breakEvenPrice),
            margin: toSafeNumber(posData.margin, 0),
            marginType: posData.marginType,
          } : null,
        };
      } finally {
        // Symbol-specific cache expires faster
        setTimeout(() => DATA_PROMISE_CACHE.delete(symbolCacheKey), 5000);
      }
    })();

    DATA_PROMISE_CACHE.set(symbolCacheKey, promise);

    // Stale-while-revalidate: Return cached account data immediately while refresh happens
    if (hasStaleAccountCache) {
      // Let the fetch complete in background, return stale account data now
      promise.then(() => {}).catch(() => {}); // Suppress unhandled rejection
      return {
        accountDetails: cachedAccount.data,
        symbolInfo: DEFAULT_SYMBOL_INFO, // Will be updated when promise resolves
        position: null,
      };
    }

    return promise;
  }, []);

  // Fetch all trading data in a single aggregated call (for Binance)
  const fetchTradingSummary = useCallback(async (
    account: TradingAccount,
    symbol: string
  ): Promise<{
    positions: Position[];
    orders: Order[];
    accountDetails: AccountDetails | null;
    symbolInfo: SymbolInfo;
  }> => {
    const cacheKey = `summary-${account._id}-${symbol}`;
    const now = Date.now();

    // Check cache first
    const cached = SUMMARY_CACHE.get(cacheKey);
    if (cached && (now - cached.timestamp) < SUMMARY_CACHE_TTL) {
      return {
        positions: cached.positions,
        orders: cached.orders,
        accountDetails: cached.accountDetails,
        symbolInfo: cached.symbolInfo,
      };
    }

    // Check if already fetching
    let promise = DATA_PROMISE_CACHE.get(cacheKey) as Promise<{
      positions: Position[];
      orders: Order[];
      accountDetails: AccountDetails | null;
      symbolInfo: SymbolInfo;
    }> | undefined;

    if (promise) {
      // Return cached data while waiting if available
      if (cached) {
        return {
          positions: cached.positions,
          orders: cached.orders,
          accountDetails: cached.accountDetails,
          symbolInfo: cached.symbolInfo,
        };
      }
      return promise;
    }

    promise = (async () => {
      try {
        const response = await api.get('/trading/summary', {
          params: {
            accountId: account._id,
            symbol,
          },
        });

        const data = response.data;
        if (!data?.success) {
          return {
            positions: [],
            orders: [],
            accountDetails: null,
            symbolInfo: DEFAULT_SYMBOL_INFO,
          };
        }

        // Transform positions
        const positions: Position[] = (data.positions || []).map((p: {
          id?: string;
          symbol: string;
          quantity: number;
          averagePrice?: number;
          lastPrice?: number;
          pnl?: number;
          leverage?: number;
          liquidationPrice?: number;
          breakEvenPrice?: number;
          margin?: number;
          marginType?: string;
        }) => ({
          id: p.id || p.symbol,
          symbol: p.symbol,
          size: toSafeNumber(p.quantity, 0),
          entryPrice: toSafeNumber(p.averagePrice, 0),
          pnl: toSafeNumber(p.pnl, 0),
          leverage: toSafeNumber(p.leverage, 1),
          liquidationPrice: toSafeNumber(p.liquidationPrice),
          breakEvenPrice: toSafeNumber(p.breakEvenPrice),
          margin: toSafeNumber(p.margin, 0),
          marginType: p.marginType,
        }));

        // Transform orders
        const orders: Order[] = (data.orders || []).map((o: {
          id?: string;
          orderId?: string;
          symbol: string;
          price?: string | number;
          stopPrice?: string | number;
          type?: string;
          side?: string;
          origQty?: string | number;
          status: string;
          executedQty?: string | number;
          time?: string | number;
          orderCategory?: 'basic' | 'conditional';
          closePosition?: boolean;
        }) => ({
          id: o.id || String(o.orderId) || '',
          symbol: o.symbol,
          price: parseFloat(String(o.price)) || 0,
          stopPrice: parseFloat(String(o.stopPrice)) || 0,
          orderType: o.type || '',
          transactionType: o.side || '',
          quantity: parseFloat(String(o.origQty)) || 0,
          status: o.status,
          filledQuantity: parseFloat(String(o.executedQty)) || 0,
          timestamp: o.time,
          orderCategory: o.orderCategory,
          closePosition: o.closePosition,
        }));

        // Transform account details
        const accountDetails: AccountDetails | null = data.accountDetails ? {
          equity: data.accountDetails.equity || 0,
          availableBalance: data.accountDetails.availableBalance || 0,
          totalMargin: data.accountDetails.totalMargin,
        } : null;

        // Transform symbol info
        const symbolInfo: SymbolInfo = data.symbolInfo ? {
          tickSize: data.symbolInfo.tickSize || DEFAULT_SYMBOL_INFO.tickSize,
          stepSize: data.symbolInfo.stepSize || DEFAULT_SYMBOL_INFO.stepSize,
          minQty: data.symbolInfo.minQty || DEFAULT_SYMBOL_INFO.minQty,
          minNotional: data.symbolInfo.minNotional || DEFAULT_SYMBOL_INFO.minNotional,
          maxLeverage: data.symbolInfo.maxLeverage || DEFAULT_SYMBOL_INFO.maxLeverage,
        } : DEFAULT_SYMBOL_INFO;

        // Cache the result
        SUMMARY_CACHE.set(cacheKey, {
          positions,
          orders,
          accountDetails,
          symbolInfo,
          timestamp: Date.now(),
        });

        // Also update account details cache
        if (accountDetails) {
          ACCOUNT_DETAILS_CACHE.set(`binance-account-${account._id}`, {
            data: accountDetails,
            timestamp: Date.now(),
          });
        }

        return { positions, orders, accountDetails, symbolInfo };
      } finally {
        setTimeout(() => DATA_PROMISE_CACHE.delete(cacheKey), SUMMARY_CACHE_TTL);
      }
    })();

    DATA_PROMISE_CACHE.set(cacheKey, promise);
    return promise;
  }, []);



  // ============================================================================
  // Local Storage Persistence
  // ============================================================================

  // Hydrate from local storage on mount or account/symbol change
  useEffect(() => {
    if (!selectedAccount) return;

    const accountId = selectedAccount._id;
    const cacheKey = `spikeyCoins_tradingData_${accountId}`;
    
    // Load cached data immediately
    const cachedData = localCache.get<{
      positions: Position[];
      orders: Order[];
      accountDetails: AccountDetails | null;
      symbolInfo: SymbolInfo;
    }>(cacheKey);

    if (cachedData) {
      setPositions(cachedData.positions || []);
      setOrders(cachedData.orders || []);
      setAccountDetails(cachedData.accountDetails);
      // Only restore symbolInfo if it matches the active symbol (since it's symbol-specific)
      // Actually, symbolInfo is per-symbol, so we might want to cache it separately or just use defaults until fetch
      // For now, let's trust the cache if we just loaded the page and activeSymbol matches what was cached? 
      // Simpler: Just rely on the separate symbolInfo cache we'll build in Phase 3. 
      // For this phase, let's persist the basic account data.
    }
    
    // Also try to load symbol-specific info if available
    if (activeSymbol) {
      const symbolCacheKey = `spikeyCoins_symbolInfo_${activeSymbol}`;
      const cachedSymbolInfo = localCache.get<SymbolInfo>(symbolCacheKey);
      if (cachedSymbolInfo) {
        setSymbolInfo(cachedSymbolInfo);
      }
    }
  }, [selectedAccount, selectedAccount?._id, activeSymbol]);

  // Save to local storage whenever data changes
  useEffect(() => {
    if (!selectedAccount) return;

    const accountId = selectedAccount._id;
    const cacheKey = `spikeyCoins_tradingData_${accountId}`;
    
    // Debounce save slightly to avoid thrashing
    const timeoutId = setTimeout(() => {
      localCache.set(cacheKey, {
        positions,
        orders,
        accountDetails, // accountDetails is global for the account
        // We don't save symbolInfo here as it's specific to activeSymbol, saved separately below
      }, 5 * 60 * 1000); // 5 minute TTL for trading data
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [positions, orders, accountDetails, selectedAccount, selectedAccount?._id]);

  // Save symbol info separately
  useEffect(() => {
    if (activeSymbol && symbolInfo && symbolInfo.tickSize !== DEFAULT_SYMBOL_INFO.tickSize) {
      const symbolCacheKey = `spikeyCoins_symbolInfo_${activeSymbol}`;
      localCache.set(symbolCacheKey, symbolInfo, 24 * 60 * 60 * 1000); // 24h TTL for symbol info
    }
  }, [activeSymbol, symbolInfo]);

  // ============================================================================
  // Background Sync
  // ============================================================================

  const prefetchSymbolInfo = useCallback(async () => {
    // Check if we've already prefetched recently (24h cache for this check)
    if (localCache.get('spikeyCoins_lastSymbolInfoPrefetch')) {
      return;
    }

    try {
      const response = await api.get('/binance/exchange-info');
      if (response.data.success && response.data.data.symbols) {
        const symbols = response.data.data.symbols;
        let count = 0;
        
        symbols.forEach((s: any) => {
          const priceFilter = s.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
          const lotSizeFilter = s.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
          const minNotionalFilter = s.filters?.find((f: any) => f.filterType === 'MIN_NOTIONAL');
          
          const info: SymbolInfo = {
            tickSize: priceFilter?.tickSize || '0.01',
            stepSize: lotSizeFilter?.stepSize || '0.001',
            minQty: lotSizeFilter?.minQty ? parseFloat(lotSizeFilter.minQty) : 0,
            minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.notional || '5') : 5,
            maxLeverage: 20 // Default safe value
          };
          
          // Cache individual symbol info
          localCache.set(`spikeyCoins_symbolInfo_${s.symbol}`, info, 24 * 60 * 60 * 1000);
          count++;
        });
        
        // Mark prefetch as done
        localCache.set('spikeyCoins_lastSymbolInfoPrefetch', { timestamp: Date.now() }, 24 * 60 * 60 * 1000);
        console.log(`[TradingDataContext] Pre-warmed cache for ${count} symbols`);
      }
    } catch (e) {
      console.warn('Failed to prefetch symbol info', e);
    }
  }, []);

  // Run prefetch on mount
  useEffect(() => {
    prefetchSymbolInfo();
  }, [prefetchSymbolInfo]);

  // ============================================================================
  // Main Refresh
  // ============================================================================

  const refreshAll = useCallback(async () => {
    if (!selectedAccount) {
      setPositions([]);
      setOrders([]);
      setAccountDetails(null);
      setSymbolInfo(DEFAULT_SYMBOL_INFO);
      return;
    }

    // Skip trading data API calls for demo accounts when user is not signed in
    if (selectedAccount.isDemo && !isLoggedIn) {
      setPositions([]);
      setOrders([]);
      setAccountDetails(null);
      setSymbolInfo(DEFAULT_SYMBOL_INFO);
      return;
    }

    // Prevent duplicate fetches
    const now = Date.now();
    if (fetchInProgress.current) return;
    if (now - lastFetchTime.current < MIN_FETCH_INTERVAL) return;

    fetchInProgress.current = true;
    lastFetchTime.current = now;
    setLoading(true);
    setError(null);

    try {
      // Use aggregated endpoint for Binance accounts (single API call instead of 3)
      if (selectedAccount.accountType === 'binance' && activeSymbol) {
        const summaryData = await fetchTradingSummary(selectedAccount, activeSymbol);

        setPositions(summaryData.positions);
        setOrders(summaryData.orders);
        if (summaryData.accountDetails) {
          setAccountDetails(summaryData.accountDetails);
        }
        setSymbolInfo(summaryData.symbolInfo);
      } else {
        // Fallback to separate calls for non-Binance accounts or when no symbol
        const [positionsData, ordersData, detailsData] = await Promise.all([
          fetchPositions(selectedAccount),
          fetchOrders(selectedAccount),
          activeSymbol ? fetchAccountDetails(selectedAccount, activeSymbol) : Promise.resolve({ accountDetails: null, symbolInfo: DEFAULT_SYMBOL_INFO, position: null }),
        ]);

        setPositions(positionsData);
        setOrders(ordersData);

        if (detailsData.accountDetails) {
          setAccountDetails(detailsData.accountDetails);
        }
        if (detailsData.symbolInfo) {
          setSymbolInfo(detailsData.symbolInfo);
        }
      }

      setLastRefresh(Date.now());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch trading data';
      setError(errorMessage);
      console.error('TradingDataContext refresh error:', err);
    } finally {
      fetchInProgress.current = false;
      setLoading(false);
    }
  }, [selectedAccount, activeSymbol, isLoggedIn, fetchPositions, fetchOrders, fetchAccountDetails, fetchTradingSummary]);
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // Refresh when account or symbol changes
  useEffect(() => {
    if (selectedAccount) {
      refreshAll();
    }
  }, [selectedAccount?._id, activeSymbol, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // ============================================================================
  // Context Value
  // ============================================================================
  
  const value: TradingDataContextType = {
    positions,
    orders,
    accountDetails,
    symbolInfo,
    existingPosition,
    loading,
    error,
    lastRefresh,
    refreshAll,
    setActiveSymbol,
    activeSymbol,
  };
  
  return (
    <TradingDataContext.Provider value={value}>
      {children}
    </TradingDataContext.Provider>
  );
};

export type { Position, Order, AccountDetails, SymbolInfo };
