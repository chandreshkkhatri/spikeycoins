"use client";

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { safeLocalStorage, safeSessionStorage } from './browser-storage';

// API Base URL
// Prefer relative URLs ("/api") so Next.js can proxy via rewrites.
// Only use NEXT_PUBLIC_API_URL when it points to a non-local backend.
const ENV_API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim();
const IS_LOCALHOST_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(ENV_API_URL);
const API_BASE_URL = ENV_API_URL && !IS_LOCALHOST_URL ? ENV_API_URL : '';

// Storage keys (must match auth-context.tsx)
const ACCESS_TOKEN_KEY = "spikeyCoins_accessToken";
const REFRESH_TOKEN_KEY = "spikeyCoins_refreshToken";
const USER_KEY = "spikeyCoins_user";

// Create axios instance with base URL
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
});

// All callers, including AuthProvider, share the same refresh operation.
let refreshPromise: Promise<boolean> | null = null;
export const AUTH_CLEARED_EVENT = "spikeycoins:auth-cleared";

export const isAuthenticationError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 401;

// Clear all auth data
const clearAuth = () => {
  if (typeof window === 'undefined') return;
  safeLocalStorage.removeItem(ACCESS_TOKEN_KEY);
  safeLocalStorage.removeItem(REFRESH_TOKEN_KEY);
  safeLocalStorage.removeItem(USER_KEY);
  safeSessionStorage.removeItem("authStatusCache");
  safeSessionStorage.removeItem("authStatusCacheTime");
  safeLocalStorage.removeItem("accountsCache");
  safeLocalStorage.removeItem("accountsCacheTime");
  safeLocalStorage.removeItem("selectedAccountId");
  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
};

// Refresh tokens
const refreshTokens = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  // If already refreshing, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = safeLocalStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      // Use fetch to avoid interceptor loop
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const status = response.status;
        // Only clear auth for definitive auth failures
        if (status === 400 || status === 401) {
          clearAuth();
        }
        return false;
      }

      const data = await response.json();
      const { accessToken, refreshToken: newRefreshToken } = data;

      if (!accessToken || !newRefreshToken) {
        throw new Error("Malformed refresh response");
      }

      safeLocalStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      safeLocalStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Add access token to requests and normalize /api prefix to avoid duplicate /api/api/...
api.interceptors.request.use((config) => {
  if (config.url) {
    if (config.url.startsWith('/api/')) {
      config.url = config.url.substring(4);
    } else if (config.url === '/api') {
      config.url = '';
    }
  }

  if (typeof window === 'undefined') return config;
  const token = safeLocalStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses and refresh token
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Invalid credentials at sign-in are not an expired authenticated session.
    if (/\/auth\/(login|register|refresh)(?:[/?]|$)/.test(originalRequest.url ?? "")) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    // A late 401 may belong to the old token after another request refreshed it.
    const currentToken = getAccessToken();
    if (currentToken && originalRequest.headers.Authorization !== `Bearer ${currentToken}`) {
      originalRequest.headers.Authorization = `Bearer ${currentToken}`;
      return api(originalRequest);
    }

    if (!getRefreshToken()) {
      clearAuth();
      return Promise.reject(error);
    }

    // Await the shared promise even when AuthProvider initiated the refresh.
    // Every waiter settles on failure; no independent queue can be stranded.
    if (await refreshTokens()) {
      const newToken = getAccessToken();
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    }
    return Promise.reject(error);
  }
);

// Helper to get full URL for redirects (e.g., OAuth)
export const getApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

// Helper to get API path (for axios calls using this instance)
export const getApiPath = (path: string): string => {
  // Remove /api prefix if present since baseURL already has it
  if (path.startsWith('/api/')) {
    return path.substring(4);
  }
  if (path === '/api') {
    return '';
  }
  return path;
};

// Export for use in auth-context to manually trigger refresh
export const manualRefreshTokens = refreshTokens;
export const manualClearAuth = clearAuth;
export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return safeLocalStorage.getItem(ACCESS_TOKEN_KEY);
};
export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return safeLocalStorage.getItem(REFRESH_TOKEN_KEY);
};
export const setTokens = (accessToken: string, refreshToken: string): boolean => {
  if (typeof window === 'undefined') return false;
  const accessPersisted = safeLocalStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  const refreshPersisted = safeLocalStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  return accessPersisted && refreshPersisted;
};

export default api;
