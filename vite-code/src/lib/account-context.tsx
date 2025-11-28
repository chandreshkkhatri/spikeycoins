import axios from 'axios';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './auth-context';
import { API_ROUTES } from './constants';

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: 'binance' | 'kite' | 'upstox';
  isActive: boolean;
  accessToken?: string;
}

interface AccountContextType {
  selectedAccount: TradingAccount | null;
  setSelectedAccount: (account: TradingAccount | null) => void;
  accounts: TradingAccount[];
  loadingAccounts: boolean;
  fetchAccounts: () => Promise<void>;
  error: string | null;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
};

interface AccountProviderProps {
  children: ReactNode;
}

export const AccountProvider: React.FC<AccountProviderProps> = ({ children }) => {
  const [selectedAccount, setSelectedAccountState] = useState<TradingAccount | null>(null);
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isLoggedIn, user, getAccessToken } = useAuth();
  
  // Allow the app to work without authentication (using default_user fallback)
  const allowOfflineAccess = true;

  const fetchAccounts = useCallback(
    async (isBackground = false) => {
      // Use authenticated user ID if logged in, otherwise fall back to default_user
      const userId = user?._id || 'default_user';

      const cacheKey = 'accountsCache';
      const cacheTimeKey = 'accountsCacheTime';
      const cacheTime = 120000; // 2 minutes

      const cachedData = sessionStorage.getItem(cacheKey);
      const cacheTimestamp = sessionStorage.getItem(cacheTimeKey);

      if (cachedData && cacheTimestamp && !isBackground) {
        const now = Date.now();
        if (now - parseInt(cacheTimestamp) < cacheTime) {
          const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
          setAccounts(cachedAccounts);
          setLoadingAccounts(false);

          const savedAccountId = sessionStorage.getItem('selectedAccountId');
          if (savedAccountId && cachedAccounts.length > 0) {
            const savedAccount = cachedAccounts.find(acc => acc._id === savedAccountId);
            if (savedAccount) {
              setSelectedAccountState(savedAccount);
            }
          }

          setTimeout(() => fetchAccounts(true), 100);
          return;
        }
      }

      try {
        if (!isBackground) setLoadingAccounts(true);
        setError(null);

        const maxRetries = 2;
        let attempt = 0;
        let lastError: any = null;
        let response: any = null;

        // Build headers with auth token if available
        const headers: Record<string, string> = {};
        const token = getAccessToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        while (attempt <= maxRetries) {
          try {
            response = await axios.get(`${API_ROUTES.accounts.getAccounts}?userId=${userId}`, {
              timeout: 12000,
              headers,
            });
            break;
          } catch (err: any) {
            lastError = err;
            const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
            if (!isTimeout || attempt === maxRetries) break;
            const delay = 500 * Math.pow(2, attempt);
            await new Promise(res => setTimeout(res, delay));
            attempt += 1;
          }
        }

        if (!response) {
          throw lastError || new Error('Failed to fetch accounts');
        }

        if (response.data?.success) {
          const allAccounts = response.data.accounts as TradingAccount[];

          sessionStorage.setItem(cacheKey, JSON.stringify(allAccounts));
          sessionStorage.setItem(cacheTimeKey, Date.now().toString());

          setAccounts(allAccounts);

          if (!selectedAccount) {
            const savedAccountId = sessionStorage.getItem('selectedAccountId');

            if (savedAccountId && allAccounts.length > 0) {
              const savedAccount = allAccounts.find(acc => acc._id === savedAccountId);
              if (savedAccount) {
                setSelectedAccountState(savedAccount);
              } else {
                const defaultAccount = allAccounts.find(acc => acc.isActive) || allAccounts[0];
                setSelectedAccountState(defaultAccount);
                sessionStorage.setItem('selectedAccountId', defaultAccount._id);
              }
            } else if (allAccounts.length > 0) {
              const defaultAccount = allAccounts.find(acc => acc.isActive) || allAccounts[0];
              setSelectedAccountState(defaultAccount);
              sessionStorage.setItem('selectedAccountId', defaultAccount._id);
            }
          }
        }
      } catch (error: any) {
        console.error('Error fetching accounts:', error);
        if (!isBackground) {
          const errorMessage =
            error.response?.data?.error || error.message || 'Failed to fetch accounts';
          setError(errorMessage);
        }
      } finally {
        if (!isBackground) setLoadingAccounts(false);
      }
    },
    [selectedAccount, isLoggedIn, user, getAccessToken]
  );

  const setSelectedAccount = useCallback((account: TradingAccount | null) => {
    setSelectedAccountState(account);
    if (account) {
      sessionStorage.setItem('selectedAccountId', account._id);
    } else {
      sessionStorage.removeItem('selectedAccountId');
    }
  }, []);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const cacheKey = 'accountsCache';
    const cachedData = sessionStorage.getItem(cacheKey);
    const savedAccountId = sessionStorage.getItem('selectedAccountId');

    let hasCachedData = false;
    if (cachedData) {
      try {
        const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
        setAccounts(cachedAccounts);
        hasCachedData = true;
        setLoadingAccounts(false);

        if (savedAccountId && cachedAccounts.length > 0) {
          const savedAccount = cachedAccounts.find(acc => acc._id === savedAccountId);
          if (savedAccount) {
            setSelectedAccountState(savedAccount);
          }
        }
      } catch (error) {
        console.error('Error parsing cached accounts:', error);
      }
    }

    if (isLoggedIn || allowOfflineAccess) {
      const delay = hasCachedData ? 50 : 0;
      setTimeout(() => fetchAccounts(), delay);
    } else {
      if (!hasCachedData) {
        setLoadingAccounts(false);
      }
    }
  }, [isLoggedIn, allowOfflineAccess, fetchAccounts]);

  useEffect(() => {
    if (isLoggedIn || allowOfflineAccess) {
      fetchAccounts(true);
    }
  }, [isLoggedIn, allowOfflineAccess, fetchAccounts]);

  const value: AccountContextType = {
    selectedAccount,
    setSelectedAccount,
    accounts,
    loadingAccounts,
    fetchAccounts,
    error,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};

export type { TradingAccount };
