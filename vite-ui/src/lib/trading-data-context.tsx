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
import api from './api';

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
  maxLeverage: 125,
};

export const TradingDataProvider: React.FC<TradingDataProviderProps> = ({ children }) => {
  const { selectedAccount } = useAccount();
  
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
              size: p.quantity,
              entryPrice: p.entryPrice || p.averagePrice || 0,
              pnl: p.pnl || p.unrealizedPnl || 0,
              leverage: p.leverage || 1,
              liquidationPrice: p.liquidationPrice,
              breakEvenPrice: p.breakEvenPrice,
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
            maxLeverage: symInfo.maxLeverage || posData?.maxLeverage || DEFAULT_SYMBOL_INFO.maxLeverage,
          } : DEFAULT_SYMBOL_INFO,
          position: posData && posData.size !== 0 ? {
            id: posData.symbol,
            symbol: posData.symbol,
            size: posData.size,
            entryPrice: posData.entryPrice,
            pnl: posData.pnl,
            leverage: posData.leverage,
            liquidationPrice: posData.liquidationPrice,
            breakEvenPrice: posData.breakEvenPrice,
            margin: posData.margin,
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
          size: p.quantity,
          entryPrice: p.averagePrice || 0,
          pnl: p.pnl || 0,
          leverage: p.leverage || 1,
          liquidationPrice: p.liquidationPrice,
          breakEvenPrice: p.breakEvenPrice,
          margin: p.margin,
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
  }, [selectedAccount, activeSymbol, fetchPositions, fetchOrders, fetchAccountDetails, fetchTradingSummary]);
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // Refresh when account or symbol changes
  useEffect(() => {
    if (selectedAccount) {
      refreshAll();
    }
  }, [selectedAccount?._id, activeSymbol]); // eslint-disable-line react-hooks/exhaustive-deps
  
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
