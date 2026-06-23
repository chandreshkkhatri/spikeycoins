import React from "react";
import { render, renderHook, RenderOptions } from "@testing-library/react";
import { AuthContext } from "@/contexts/auth-context";
import { AccountContext } from "@/contexts/account-context";
import { ThemeContext } from "@/contexts/theme-context";

const defaultAuthValue = {
  user: {
    _id: "test-user-id",
    email: "test@spikeycoins.com",
    name: "Test User",
    isEmailVerified: true,
    createdAt: "2026-06-23T04:00:00Z",
    updatedAt: "2026-06-23T04:00:00Z",
  },
  isLoggedIn: true,
  isLoading: false,
  error: null,
  login: async () => {},
  register: async () => {},
  loginWithGoogle: () => {},
  logout: async () => {},
  getAccessToken: () => localStorage.getItem("spikeyCoins_accessToken") || "mock-token",
  refreshTokens: async () => true,
};

const defaultAccountValue = {
  selectedAccount: {
    _id: "acc-binance",
    accountName: "My Binance",
    accountType: "binance" as const,
    isActive: true,
  },
  setSelectedAccount: () => {},
  accounts: [
    {
      _id: "acc-binance",
      accountName: "My Binance",
      accountType: "binance" as const,
      isActive: true,
    },
    {
      _id: "acc-upstox",
      accountName: "My Upstox",
      accountType: "upstox" as const,
      isActive: true,
    }
  ],
  loadingAccounts: false,
  fetchAccounts: async () => {},
  error: null,
};

const defaultThemeValue = {
  theme: "dark" as const,
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
};

interface RenderOptionsWithProviders extends Omit<RenderOptions, "queries"> {
  authState?: Partial<typeof defaultAuthValue>;
  accountState?: Partial<typeof defaultAccountValue>;
  themeState?: Partial<typeof defaultThemeValue>;
}

function renderWithProviders(
  ui: React.ReactElement,
  {
    authState = {},
    accountState = {},
    themeState = {},
    ...renderOptions
  }: RenderOptionsWithProviders = {}
) {
  const mergedAuth = { ...defaultAuthValue, ...authState };
  const mergedAccount = { ...defaultAccountValue, ...accountState };
  const mergedTheme = { ...defaultThemeValue, ...themeState };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider value={mergedAuth}>
        <AccountContext.Provider value={mergedAccount}>
          <ThemeContext.Provider value={mergedTheme}>
            {children}
          </ThemeContext.Provider>
        </AccountContext.Provider>
      </AuthContext.Provider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

function renderHookWithProviders<Result, Props>(
  renderCallback: (initialProps: Props) => Result,
  options?: {
    initialProps?: Props;
    authState?: Partial<typeof defaultAuthValue>;
    accountState?: Partial<typeof defaultAccountValue>;
    themeState?: Partial<typeof defaultThemeValue>;
  }
) {
  const mergedAuth = { ...defaultAuthValue, ...options?.authState };
  const mergedAccount = { ...defaultAccountValue, ...options?.accountState };
  const mergedTheme = { ...defaultThemeValue, ...options?.themeState };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider value={mergedAuth}>
        <AccountContext.Provider value={mergedAccount}>
          <ThemeContext.Provider value={mergedTheme}>
            {children}
          </ThemeContext.Provider>
        </AccountContext.Provider>
      </AuthContext.Provider>
    );
  }

  return renderHook(renderCallback, {
    wrapper: Wrapper,
    initialProps: options?.initialProps,
  });
}

function seedAccessToken(token: string) {
  localStorage.setItem("spikeyCoins_accessToken", token);
}

// Re-export everything from React Testing Library
export * from "@testing-library/react";

// Override render method
export { renderWithProviders, renderHookWithProviders, seedAccessToken };
export type { RenderOptionsWithProviders };
