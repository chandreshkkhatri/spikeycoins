"use client";

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
import { API_ROUTES, getApiUrl } from '@/lib/constants';

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

  // Track in-flight requests to prevent duplicates
  const fetchInProgress = useRef(false);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 2000; // Minimum 2 seconds between fetches

  // Clear cache when user logs out
  const prevIsLoggedIn = useRef(isLoggedIn);
  useEffect(() => {
    if (prevIsLoggedIn.current && !isLoggedIn) {
      // User logged out - clear all cached data
      localStorage.removeItem('accountsCache');
      localStorage.removeItem('accountsCacheTime');
      setAccounts([]);
      setSelectedAccountState(null);
      setError(null);
    }
    prevIsLoggedIn.current = isLoggedIn;
  }, [isLoggedIn]);

  const fetchAccounts = useCallback(
    async (isBackground = false) => {
      // Require authentication - don't fetch if not logged in
      if (!isLoggedIn || !user?._id) {
        setLoadingAccounts(false);
        return;
      }

      // Prevent duplicate fetches
      const now = Date.now();
      if (fetchInProgress.current) {
        return;
      }

      // Rate limit: don't fetch more than once every 2 seconds
      if (now - lastFetchTime.current < MIN_FETCH_INTERVAL && !isBackground) {
        return;
      }

      // Use authenticated user ID (no more default_user fallback)
      const userId = user._id;

      const cacheKey = 'accountsCache';
      const cacheTimeKey = 'accountsCacheTime';
      const cacheTime = 120000; // 2 minutes

      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(cacheTimeKey);

      // Use cache if valid and not a background refresh
      if (cachedData && cacheTimestamp && !isBackground) {
        const cacheAge = now - parseInt(cacheTimestamp);
        if (cacheAge < cacheTime) {
          const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
          setAccounts(cachedAccounts);
          setLoadingAccounts(false);

          const savedAccountId = localStorage.getItem('selectedAccountId');
          if (savedAccountId && cachedAccounts.length > 0) {
            const savedAccount = cachedAccounts.find(acc => acc._id === savedAccountId);
            if (savedAccount) {
              setSelectedAccountState(savedAccount);
            }
          }

          // Only do background refresh if cache is older than 30 seconds
          if (cacheAge > 30000) {
            setTimeout(() => fetchAccounts(true), 1000);
          }
          return;
        }
      }

      fetchInProgress.current = true;
      lastFetchTime.current = now;

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
            response = await axios.get(getApiUrl(`${API_ROUTES.accounts.getAccounts}?userId=${userId}`), {
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

          localStorage.setItem(cacheKey, JSON.stringify(allAccounts));
          localStorage.setItem(cacheTimeKey, Date.now().toString());

          setAccounts(allAccounts);

          // Use a ref to check selected account to avoid dependency issues
          setSelectedAccountState(prev => {
            // ALWAYS check localStorage first for the saved selection
            const savedAccountId = localStorage.getItem('selectedAccountId');

            // If we have a saved account ID, try to find it in the fresh list
            if (savedAccountId) {
              const savedAccount = allAccounts.find(acc => acc._id === savedAccountId);
              if (savedAccount) {
                return savedAccount;
              }
            }

            // If prev exists and matches an account in the new list, keep it
            if (prev) {
              const prevMatch = allAccounts.find(acc => acc._id === prev._id);
              if (prevMatch) {
                localStorage.setItem('selectedAccountId', prevMatch._id);
                return prevMatch;
              }
            }

            // Fallback to an active account or the first available
            if (allAccounts.length > 0) {
              const defaultAccount = allAccounts.find(acc => acc.isActive) || allAccounts[0];
              localStorage.setItem('selectedAccountId', defaultAccount._id);
              return defaultAccount;
            }

            localStorage.removeItem('selectedAccountId');
            return null;
          });
        }
      } catch (error: any) {
        console.error('Error fetching accounts:', error);
        if (!isBackground) {
          const errorMessage =
            error.response?.data?.error || error.message || 'Failed to fetch accounts';
          setError(errorMessage);
        }
      } finally {
        fetchInProgress.current = false;
        if (!isBackground) setLoadingAccounts(false);
      }
    },
    [isLoggedIn, user, getAccessToken]
  );

  const setSelectedAccount = useCallback((account: TradingAccount | null) => {
    setSelectedAccountState(account);
    if (account) {
      localStorage.setItem('selectedAccountId', account._id);
    } else {
      localStorage.removeItem('selectedAccountId');
    }
  }, []);

  // Single initialization effect
  const hasInitialized = useRef(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    // Reset initialization if user changes
    if (user?._id !== lastUserId.current) {
      hasInitialized.current = false;
      lastUserId.current = user?._id || null;
    }

    if (hasInitialized.current) return;

    // Require authentication - don't initialize if not logged in
    if (!isLoggedIn) {
      setLoadingAccounts(false);
      return;
    }

    hasInitialized.current = true;

    const cacheKey = 'accountsCache';
    const cachedData = localStorage.getItem(cacheKey);
    const savedAccountId = localStorage.getItem('selectedAccountId');

    // Load from cache immediately for fast UI
    if (cachedData) {
      try {
        const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
        setAccounts(cachedAccounts);
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

    // Fetch fresh data (will use cache check inside)
    fetchAccounts();
  }, [isLoggedIn, user?._id, fetchAccounts]);

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
