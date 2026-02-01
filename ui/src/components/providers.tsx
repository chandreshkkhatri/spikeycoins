"use client";

import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider } from "@/contexts/auth-context";
import { AccountProvider } from "@/contexts/account-context";
import { TradingDataProvider } from "@/contexts/trading-data-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AccountProvider>
          <TradingDataProvider>
            {children}
          </TradingDataProvider>
        </AccountProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
