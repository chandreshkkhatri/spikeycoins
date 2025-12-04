import axios from 'axios';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState, useRef } from 'react';

// API Base URL - use env var in production, relative path in development
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Storage keys
const ACCESS_TOKEN_KEY = 'flipSafe_accessToken';
const REFRESH_TOKEN_KEY = 'flipSafe_refreshToken';
const USER_KEY = 'flipSafe_user';

export interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  isEmailVerified: boolean;
  googleId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Auth methods
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  
  // Token methods
  getAccessToken: () => string | null;
  refreshTokens: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Create axios instance with auth interceptor
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});

// Add access token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef(false);

  const isLoggedIn = !!user;

  // Save tokens and user to storage
  const saveAuth = useCallback((accessToken: string, refreshToken: string, userData: User) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  }, []);

  // Clear auth data
  const clearAuth = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem('authStatusCache');
    sessionStorage.removeItem('authStatusCacheTime');
    localStorage.removeItem('accountsCache');
    localStorage.removeItem('accountsCacheTime');
    localStorage.removeItem('selectedAccountId');
    setUser(null);
  }, []);

  // Get access token
  const getAccessToken = useCallback((): string | null => {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  // Refresh tokens
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) return false;
    
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    refreshingRef.current = true;
    
    try {
      const response = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearAuth();
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }, [clearAuth]);

  // Check current auth status on mount
  useEffect(() => {
    const isTokenExpired = (token: string) => {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        return payload.exp * 1000 < Date.now();
      } catch {
        return true;
      }
    };

    const checkAuth = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Check if token is expired locally to avoid 401 error
      if (isTokenExpired(token)) {
        const refreshed = await refreshTokens();
        if (!refreshed) {
          clearAuth();
          setIsLoading(false);
          return;
        }
        // If refreshed, the new token is in localStorage and will be used by api interceptor
      }

      try {
        const response = await api.get('/auth/me');
        if (response.data.success && response.data.user) {
          setUser(response.data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
        }
      } catch (error: any) {
        // Token might be expired (if local check failed or clock skew), try refresh
        if (error.response?.status === 401) {
          const refreshed = await refreshTokens();
          if (refreshed) {
            // Retry the request
            try {
              const retryResponse = await api.get('/auth/me');
              if (retryResponse.data.success && retryResponse.data.user) {
                setUser(retryResponse.data.user);
                localStorage.setItem(USER_KEY, JSON.stringify(retryResponse.data.user));
              }
            } catch {
              clearAuth();
            }
          }
        } else {
          clearAuth();
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [refreshTokens, clearAuth]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (accessToken && refreshToken) {
      // Store tokens
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);

      // Fetch user data
      api.get('/auth/me').then((response) => {
        if (response.data.success && response.data.user) {
          saveAuth(accessToken, refreshToken, response.data.user);
        }
        setIsLoading(false);
      }).catch(() => {
        clearAuth();
        setIsLoading(false);
      });
    }
  }, [saveAuth, clearAuth]);

  // Login with email/password
  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const { accessToken, refreshToken, user: userData } = response.data;
      saveAuth(accessToken, refreshToken, userData);
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  // Register new account
  const register = useCallback(async (email: string, password: string, name: string) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const response = await axios.post('/api/auth/register', { email, password, name });
      const { accessToken, refreshToken, user: userData } = response.data;
      saveAuth(accessToken, refreshToken, userData);
    } catch (error: any) {
      const message = error.response?.data?.error || 'Registration failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  // Redirect to Google OAuth
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  }, []);

  // Logout
  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    
    try {
      await axios.post('/api/auth/logout', { refreshToken });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      window.location.href = '/login';
    }
  }, [clearAuth]);

  // Setup axios response interceptor for token refresh
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          const refreshed = await refreshTokens();
          if (refreshed) {
            const newToken = localStorage.getItem(ACCESS_TOKEN_KEY);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        }
        
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [refreshTokens]);

  const value: AuthContextType = {
    user,
    isLoggedIn,
    isLoading,
    error,
    login,
    register,
    loginWithGoogle,
    logout,
    getAccessToken,
    refreshTokens,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Export the api instance for use in other files
export { api };

// Helper hook to get auth headers
export const useAuthHeaders = () => {
  const { getAccessToken } = useAuth();
  
  return useCallback(() => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);
};
