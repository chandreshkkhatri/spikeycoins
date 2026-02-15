"use client";

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

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

// Track if we're currently refreshing to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Queue of failed requests to retry after token refresh
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  config: InternalAxiosRequestConfig;
}> = [];

// Process the queue of failed requests
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      resolve(api(config));
    }
  });
  failedQueue = [];
};

// Clear all auth data
const clearAuth = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem("authStatusCache");
  sessionStorage.removeItem("authStatusCacheTime");
  localStorage.removeItem("accountsCache");
  localStorage.removeItem("accountsCacheTime");
  localStorage.removeItem("selectedAccountId");
};

// Refresh tokens
const refreshTokens = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  // If already refreshing, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  isRefreshing = true;
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

      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Add access token to requests
api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
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

    // If no config or already retried, reject
    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Only handle 401 errors
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Don't retry refresh endpoint itself
    if (originalRequest.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If currently refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    // Try to refresh
    const refreshed = await refreshTokens();
    if (refreshed) {
      const newToken = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } else {
      processQueue(new Error('Token refresh failed'), null);
      return Promise.reject(error);
    }
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
  return path.startsWith('/api/') ? path.substring(4) : path;
};

// Export for use in auth-context to manually trigger refresh
export const manualRefreshTokens = refreshTokens;
export const manualClearAuth = clearAuth;
export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};
export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};
export const setTokens = (accessToken: string, refreshToken: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export default api;
