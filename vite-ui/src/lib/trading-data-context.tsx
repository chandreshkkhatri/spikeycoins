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
      // For non-Binance, fetch funds endpoint
      const cacheKey = `funds-${account._id}`;
      let promise = DATA_PROMISE_CACHE.get(cacheKey) as Promise<{ accountDetails: AccountDetails | null; symbolInfo: SymbolInfo; position: Position | null }> | undefined;
      if (promise) return promise;
      
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
          
          return {
            accountDetails: { equity: availableBalance, availableBalance },
            symbolInfo: DEFAULT_SYMBOL_INFO,
            position: null,
          };
        } finally {
          setTimeout(() => DATA_PROMISE_CACHE.delete(cacheKey), 2000);
        }
      })();
      
      DATA_PROMISE_CACHE.set(cacheKey, promise);
      return promise;
    }
    
    // Binance: fetch position-details
    const cacheKey = `binance-details-${account._id}-${symbol}`;
    let promise = DATA_PROMISE_CACHE.get(cacheKey) as Promise<{ accountDetails: AccountDetails | null; symbolInfo: SymbolInfo; position: Position | null }> | undefined;
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
          return { accountDetails: null, symbolInfo: DEFAULT_SYMBOL_INFO, position: null };
        }
        
        const acctData = data.account;
        const symInfo = data.symbolInfo;
        const posData = data.position;
        
        return {
          accountDetails: acctData ? {
            equity: acctData.equity || 0,
            availableBalance: acctData.availableBalance || acctData.equity || 0,
            totalMargin: acctData.totalMargin,
          } : null,
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
        setTimeout(() => DATA_PROMISE_CACHE.delete(cacheKey), 2000);
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
      // Fetch all data in parallel
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
      
      setLastRefresh(Date.now());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch trading data';
      setError(errorMessage);
      console.error('TradingDataContext refresh error:', err);
    } finally {
      fetchInProgress.current = false;
      setLoading(false);
    }
  }, [selectedAccount, activeSymbol, fetchPositions, fetchOrders, fetchAccountDetails]);
  
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
