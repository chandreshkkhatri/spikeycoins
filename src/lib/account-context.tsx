'use client';

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
  const [loadingAccounts, setLoadingAccounts] = useState(true); // Start as true to avoid flashing "No accounts found"
  const [error, setError] = useState<string | null>(null);
  const { isLoggedIn, allowOfflineAccess } = useAuth();

  const fetchAccounts = useCallback(
    async (isBackground = false) => {
      const userId = 'default_user';

      // Check cache first
      const cacheKey = 'accountsCache';
      const cacheTimeKey = 'accountsCacheTime';
      const cacheTime = 120000; // 2 minutes cache

      const cachedData = sessionStorage.getItem(cacheKey);
      const cacheTimestamp = sessionStorage.getItem(cacheTimeKey);

      if (cachedData && cacheTimestamp && !isBackground) {
        const now = Date.now();
        if (now - parseInt(cacheTimestamp) < cacheTime) {
          // Use cached data for immediate rendering
          const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
          setAccounts(cachedAccounts);
          setLoadingAccounts(false);

          // Restore selected account from cache
          const savedAccountId = sessionStorage.getItem('selectedAccountId');
          if (savedAccountId && cachedAccounts.length > 0) {
            const savedAccount = cachedAccounts.find(acc => acc._id === savedAccountId);
            if (savedAccount) {
              setSelectedAccountState(savedAccount);
            }
          }

          // Fetch fresh data in background
          setTimeout(() => fetchAccounts(true), 100);
          return;
        }
      }

      try {
        if (!isBackground) setLoadingAccounts(true);
        setError(null);

        // Add basic retry with exponential backoff to handle slow local dev starts
        const maxRetries = 2;
        let attempt = 0;
        let lastError: any = null;
        let response: any = null;
        while (attempt <= maxRetries) {
          try {
            response = await axios.get(`${API_ROUTES.accounts.getAccounts}?userId=${userId}`, {
              timeout: 12000,
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

          // Update cache
          sessionStorage.setItem(cacheKey, JSON.stringify(allAccounts));
          sessionStorage.setItem(cacheTimeKey, Date.now().toString());

          setAccounts(allAccounts);

          // Only update selected account if not already set
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
          // More detailed error messaging
          const errorMessage =
            error.response?.data?.error || error.message || 'Failed to fetch accounts';
          setError(errorMessage);
          console.log('Account fetch failed:', errorMessage, 'Auth status:', {
            isLoggedIn,
            allowOfflineAccess,
          });

          // Don't clear accounts if it's just a network error - keep cached data
          // Keep existing accounts to avoid UI churn on transient failures
        }
      } finally {
        if (!isBackground) setLoadingAccounts(false);
      }
    },
    [selectedAccount, isLoggedIn, allowOfflineAccess]
  );

  // Custom setter that also updates sessionStorage
  const setSelectedAccount = useCallback((account: TradingAccount | null) => {
    setSelectedAccountState(account);
    if (account) {
      sessionStorage.setItem('selectedAccountId', account._id);
    } else {
      sessionStorage.removeItem('selectedAccountId');
    }
  }, []);

  // Initialize from cache immediately, then fetch fresh data in background
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    // Load from cache first for immediate rendering
    const cacheKey = 'accountsCache';
    const cachedData = sessionStorage.getItem(cacheKey);
    const savedAccountId = sessionStorage.getItem('selectedAccountId');

    let hasCachedData = false;
    if (cachedData) {
      try {
        const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
        setAccounts(cachedAccounts);
        hasCachedData = true;
        // Only set loading to false if we have cached data
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

    // Fetch fresh data only if logged in or offline access allowed
    if (isLoggedIn || allowOfflineAccess) {
      // If no cache, fetch immediately; otherwise delay for background fetch
      const delay = hasCachedData ? 50 : 0;
      setTimeout(() => fetchAccounts(), delay);
    } else {
      // If not logged in and no cache, set loading to false
      if (!hasCachedData) {
        setLoadingAccounts(false);
      }
    }
  }, [isLoggedIn, allowOfflineAccess, fetchAccounts]);

  // Only refetch when auth status actually changes (not on every auth check)
  useEffect(() => {
    if (isLoggedIn || allowOfflineAccess) {
      // Use background fetch to avoid blocking UI
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
