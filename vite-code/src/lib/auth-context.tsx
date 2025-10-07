import axios from 'axios';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { API_ROUTES } from './constants';

interface AuthContextType {
  isLoggedIn: boolean;
  allowOfflineAccess: boolean;
  loading: boolean;
  error: string | null;
  checkAuthStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [allowOfflineAccess, setAllowOfflineAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuthStatus = useCallback(async () => {
    const cacheKey = 'authStatusCache';
    const cacheTimeKey = 'authStatusCacheTime';
    const cacheTime = 60000; // 1 minute cache

    // Check cache first
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTimestamp = sessionStorage.getItem(cacheTimeKey);

    if (cachedData && cacheTimestamp) {
      const now = Date.now();
      if (now - parseInt(cacheTimestamp) < cacheTime) {
        const cached = JSON.parse(cachedData);
        setIsLoggedIn(cached.isLoggedIn);
        setAllowOfflineAccess(cached.allowOfflineAccess);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(API_ROUTES.auth.checkStatus, {
        timeout: 8000,
      });

      const { isAuthenticated, offlineMode } = response.data;
      setIsLoggedIn(isAuthenticated);
      setAllowOfflineAccess(offlineMode);

      // Update cache
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ isLoggedIn: isAuthenticated, allowOfflineAccess: offlineMode })
      );
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());
    } catch (error: any) {
      console.error('Error checking auth status:', error);
      setError(error.response?.data?.error || 'Failed to check authentication');
      setIsLoggedIn(false);
      setAllowOfflineAccess(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(API_ROUTES.auth.logout);
      setIsLoggedIn(false);
      sessionStorage.removeItem('authStatusCache');
      sessionStorage.removeItem('authStatusCacheTime');
      sessionStorage.removeItem('accountsCache');
      sessionStorage.removeItem('accountsCacheTime');
      sessionStorage.removeItem('selectedAccountId');
      window.location.href = '/';
    } catch (error: any) {
      console.error('Logout error:', error);
      setError(error.response?.data?.error || 'Logout failed');
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const value: AuthContextType = {
    isLoggedIn,
    allowOfflineAccess,
    loading,
    error,
    checkAuthStatus,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
