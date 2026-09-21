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
import { useAuth } from './auth-context';
import { API_ROUTES } from '@/lib/constants';
import api, { getApiPath } from '@/lib/api';
import { safeLocalStorage } from '@/lib/browser-storage';

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: 'binance' | 'upstox';
  isActive: boolean;
  isDemo?: boolean;
  accessToken?: string;
  apiKey?: string;
  apiSecret?: string;
  lastSyncAt?: string | Date;
  metadata?: {
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    testnet?: boolean;
    sandbox?: boolean;
    tradingSegment?: 'spot' | 'usdm';
    [key: string]: unknown;
  };
}

interface AccountContextType {
  selectedAccount: TradingAccount | null;
  setSelectedAccount: (account: TradingAccount | null) => void;
  accounts: TradingAccount[];
  loadingAccounts: boolean;
  fetchAccounts: () => Promise<void>;
  error: string | null;
}

export const AccountContext = createContext<AccountContextType | undefined>(undefined);

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
  const { isLoggedIn, user, isLoading: authLoading } = useAuth();

  // Track in-flight requests to prevent duplicates
  const fetchInProgress = useRef(false);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 2000; // Minimum 2 seconds between fetches

  // Clear cache when user logs out
  const prevIsLoggedIn = useRef(isLoggedIn);
  useEffect(() => {
    if (prevIsLoggedIn.current && !isLoggedIn) {
      // User logged out - clear all cached data
      safeLocalStorage.removeItem('accountsCache');
      safeLocalStorage.removeItem('accountsCacheTime');
      safeLocalStorage.removeItem('demoAccountsCache');
      safeLocalStorage.removeItem('demoAccountsCacheTime');
      safeLocalStorage.removeItem('selectedAccountId');
      setAccounts([]);
      setSelectedAccountState(null);
      setError(null);
    }
    prevIsLoggedIn.current = isLoggedIn;
  }, [isLoggedIn]);

  const fetchAccounts = useCallback(
    async (isBackground = false) => {
      // Allow fetching without auth for demo account
      // Backend will return only demo account if not authenticated

      // Prevent duplicate fetches
      const now = Date.now();
      if (fetchInProgress.current) {
        return;
      }

      // Rate limit: don't fetch more than once every 2 seconds
      if (now - lastFetchTime.current < MIN_FETCH_INTERVAL && !isBackground) {
        return;
      }

      // Use authenticated user ID if available
      const userId = user?._id;

      // Use different cache keys for demo vs authenticated
      const cacheKey = isLoggedIn ? 'accountsCache' : 'demoAccountsCache';
      const cacheTimeKey = isLoggedIn ? 'accountsCacheTime' : 'demoAccountsCacheTime';
      const cacheTime = 120000; // 2 minutes

      const cachedData = safeLocalStorage.getItem(cacheKey);
      const cacheTimestamp = safeLocalStorage.getItem(cacheTimeKey);

      // Use cache if valid and not a background refresh
      if (cachedData && cacheTimestamp && !isBackground) {
        const cacheAge = now - parseInt(cacheTimestamp);
        if (cacheAge < cacheTime) {
          const cachedAccounts = JSON.parse(cachedData) as TradingAccount[];
          setAccounts(cachedAccounts);
          setLoadingAccounts(false);

          const savedAccountId = safeLocalStorage.getItem('selectedAccountId');
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

        while (attempt <= maxRetries) {
          try {
            response = await api.get(getApiPath(API_ROUTES.accounts.getAccounts), {
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

          safeLocalStorage.setItem(cacheKey, JSON.stringify(allAccounts));
          safeLocalStorage.setItem(cacheTimeKey, Date.now().toString());

          setAccounts(allAccounts);

          // Use a ref to check selected account to avoid dependency issues
          setSelectedAccountState(prev => {
            // Helper to check if account data actually changed (avoid unnecessary re-renders)
            const accountChanged = (a: TradingAccount | null, b: TradingAccount | null): boolean => {
              if (!a || !b) return a !== b;
              // Compare relevant fields that would affect dependent components
              return a._id !== b._id || a.isActive !== b.isActive ||
                a.apiKey !== b.apiKey || a.accountName !== b.accountName ||
                JSON.stringify(a.metadata) !== JSON.stringify(b.metadata);
            };

            // ALWAYS check localStorage first for the saved selection
            const savedAccountId = safeLocalStorage.getItem('selectedAccountId');

            // If we have a saved account ID, try to find it in the fresh list
            if (savedAccountId) {
              const savedAccount = allAccounts.find(acc => acc._id === savedAccountId);
              if (savedAccount) {
                // Keep prev reference if data hasn't changed to avoid re-renders
                if (prev && prev._id === savedAccount._id && !accountChanged(prev, savedAccount)) {
                  return prev;
                }
                return savedAccount;
              }
            }

            // If prev exists and matches an account in the new list, keep it
            if (prev) {
              const prevMatch = allAccounts.find(acc => acc._id === prev._id);
              if (prevMatch) {
                safeLocalStorage.setItem('selectedAccountId', prevMatch._id);
                // Keep prev reference if data hasn't changed
                if (!accountChanged(prev, prevMatch)) return prev;
                return prevMatch;
              }
            }

            // Fallback to an active account or the first available
            if (allAccounts.length > 0) {
              const defaultAccount = allAccounts.find(acc => acc.isActive) || allAccounts[0];
              safeLocalStorage.setItem('selectedAccountId', defaultAccount._id);
              return defaultAccount;
            }

            safeLocalStorage.removeItem('selectedAccountId');
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
    [isLoggedIn, user]
  );

  const setSelectedAccount = useCallback((account: TradingAccount | null) => {
    setSelectedAccountState(account);
    if (account) {
      safeLocalStorage.setItem('selectedAccountId', account._id);
    } else {
      safeLocalStorage.removeItem('selectedAccountId');
    }
  }, []);

  // Single initialization effect — waits for auth to settle before fetching
  const lastAuthKey = useRef<string | null>(null);

  useEffect(() => {
    // Don't initialize until auth is settled
    if (authLoading) return;

    // Only re-run when auth state actually changes
    const authKey = `${isLoggedIn}:${user?._id || 'none'}`;
    if (authKey === lastAuthKey.current) return;
    lastAuthKey.current = authKey;

    // Use different cache keys for demo vs authenticated
    const cacheKey = isLoggedIn ? 'accountsCache' : 'demoAccountsCache';
    const cachedData = safeLocalStorage.getItem(cacheKey);
    const savedAccountId = safeLocalStorage.getItem('selectedAccountId');

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
  }, [authLoading, isLoggedIn, user?._id, fetchAccounts]);

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
