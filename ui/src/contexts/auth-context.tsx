"use client";

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import api, {
  getAccessToken as getStoredAccessToken,
  getRefreshToken,
  setTokens,
  manualRefreshTokens,
  manualClearAuth,
  getApiUrl,
} from "@/lib/api";

// Storage keys (must match api.ts)
const USER_KEY = "spikeyCoins_user";

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
  register: (email: string, password: string, name: string, inviteCode: string) => Promise<void>;
  loginWithGoogle: (inviteCode?: string) => void;
  logout: () => Promise<void>;

  // Token methods
  getAccessToken: () => string | null;
  refreshTokens: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = !!user;

  // Save tokens and user to storage
  const saveAuth = useCallback(
    (accessToken: string, refreshToken: string, userData: User) => {
      setTokens(accessToken, refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
    },
    []
  );

  // Clear auth data (also clears user state)
  const clearAuth = useCallback(() => {
    manualClearAuth();
    setUser(null);
  }, []);

  // Get access token (delegate to api.ts)
  const getAccessToken = useCallback((): string | null => {
    return getStoredAccessToken();
  }, []);

  // Refresh tokens (delegate to api.ts shared implementation)
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    const result = await manualRefreshTokens();
    if (!result) {
      // If refresh failed due to auth error, clear user state
      if (!getRefreshToken()) {
        setUser(null);
      }
    }
    return result;
  }, []);

  // Check current auth status on mount
  useEffect(() => {
    const isTokenExpired = (token: string) => {
      try {
        const base64Url = token.split(".")[1];
        if (!base64Url) return true;
        let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) base64 += "=";
        const payload = JSON.parse(window.atob(base64));
        return payload.exp * 1000 < Date.now();
      } catch {
        return true;
      }
    };

    const checkAuth = async () => {
      // Load user from localStorage immediately
      try {
        const stored = localStorage.getItem(USER_KEY);
        if (stored) {
          setUser(JSON.parse(stored));
        }
      } catch {
        // Ignore parse errors
      }

      const token = getStoredAccessToken();

      if (!token) {
        setIsLoading(false);
        return;
      }

      // Check if token is expired locally to avoid 401 error
      if (isTokenExpired(token)) {
        const refreshed = await refreshTokens();
        if (!refreshed) {
          setIsLoading(false);
          return;
        }
        // If refreshed, the new token is in localStorage and will be used by api interceptor
      }

      try {
        const response = await api.get("/auth/me");
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
              const retryResponse = await api.get("/auth/me");
              if (retryResponse.data.success && retryResponse.data.user) {
                setUser(retryResponse.data.user);
                localStorage.setItem(
                  USER_KEY,
                  JSON.stringify(retryResponse.data.user)
                );
              }
            } catch {
              // Ignore retry failure; auth will be cleared only on definitive refresh failure.
            }
          }
        } else if (!getRefreshToken()) {
          // Auth was already cleared due to invalid refresh token.
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
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");

    if (accessToken && refreshToken) {
      // Store tokens using shared function
      setTokens(accessToken, refreshToken);

      // Clear URL params
      window.history.replaceState({}, "", window.location.pathname);

      // Fetch user data
      api
        .get("/auth/me")
        .then((response) => {
          if (response.data.success && response.data.user) {
            saveAuth(accessToken, refreshToken, response.data.user);
          }
          setIsLoading(false);
        })
        .catch(() => {
          clearAuth();
          setIsLoading(false);
        });
    }
  }, [saveAuth, clearAuth]);

  // Login with email/password
  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsLoading(true);

      try {
        const response = await api.post("/auth/login", { email, password });
        const { accessToken, refreshToken, user: userData } = response.data;
        saveAuth(accessToken, refreshToken, userData);
      } catch (error: any) {
        const message = error.response?.data?.error || "Login failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [saveAuth]
  );

  // Register new account
  const register = useCallback(
    async (email: string, password: string, name: string, inviteCode: string) => {
      setError(null);
      setIsLoading(true);

      try {
        const response = await api.post("/auth/register", {
          email,
          password,
          name,
          inviteCode,
        });
        const { accessToken, refreshToken, user: userData } = response.data;
        saveAuth(accessToken, refreshToken, userData);
      } catch (error: any) {
        const message = error.response?.data?.error || "Registration failed";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [saveAuth]
  );

  // Redirect to Google OAuth (with optional invite code for new signups)
  const loginWithGoogle = useCallback((inviteCode?: string) => {
    const apiUrl = getApiUrl("/api/auth/google");
    const url = new URL(apiUrl, window.location.origin);
    if (inviteCode) {
      url.searchParams.set("invite", inviteCode);
    }
    // Pass current origin so the server redirects back to this client
    url.searchParams.set("redirect", window.location.origin);
    window.location.href = url.toString();
  }, []);

  // Logout
  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();

    try {
      await api.post("/auth/logout", { refreshToken });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearAuth();
      window.location.href = "/login";
    }
  }, [clearAuth]);

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

// Re-export the api instance for backward compatibility
export { api };

// Helper hook to get auth headers
export const useAuthHeaders = () => {
  const { getAccessToken } = useAuth();

  return useCallback(() => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);
};
