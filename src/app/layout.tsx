import { AccountProvider } from '@/lib/account-context';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import React from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Flip Safe - Unified Trading Platform',
  description: 'Advanced trading platform with real-time market data and analytics',
  keywords: 'trading, stocks, market watch, portfolio management',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  icons: {
    icon: '/flip-safe-logo-without-name.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        {/* Inline script to avoid flash of incorrect theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const k='flip-safe-theme'; const s=localStorage.getItem(k); const m=window.matchMedia('(prefers-color-scheme: dark)').matches; const t=s|| (m?'dark':'light'); if(t==='dark'){ document.documentElement.classList.add('dark'); } } catch(_) {} })();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <AccountProvider>
              <div id="root">{children}</div>
            </AccountProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
