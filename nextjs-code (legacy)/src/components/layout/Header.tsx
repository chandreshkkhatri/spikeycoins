'use client';
import AccountSelector from '@/components/account-selector/AccountSelector';
import { Button } from '@/components/ui/button';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/market-watch', label: 'Market Watch' },
  { href: '/orders', label: 'Orders' },
  { href: '/positions', label: 'Positions' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/accounts', label: 'Accounts' },
];

export function Header() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const { isLoggedIn, logout } = useAuth();
  const {
    selectedAccount,
    setSelectedAccount,
    accounts: tradingAccounts,
    loadingAccounts: accountsLoading,
  } = useAccount();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation menu"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {open ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* Logo with name for desktop */}
            <img
              src="/flip-safe-logo-with-name.png"
              alt="Flip Safe"
              className="hidden md:block h-8"
            />
            {/* Logo without name for mobile */}
            <img
              src="/flip-safe-logo-without-name.png"
              alt="Flip Safe"
              className="block md:hidden h-8 w-8"
            />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-md transition-colors hover:bg-muted/60 hover:text-foreground ${
                pathname === item.href
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  : 'text-muted-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Account Selector - Show on dashboard and trading pages */}
          {(pathname.startsWith('/dashboard') ||
            pathname.startsWith('/market-watch') ||
            pathname.startsWith('/holdings') ||
            pathname.startsWith('/trading') ||
            pathname.startsWith('/positions') ||
            pathname.startsWith('/orders')) && (
            <div className="hidden md:block mr-2">
              <AccountSelector
                accounts={tradingAccounts}
                selectedAccount={selectedAccount}
                onAccountSelect={setSelectedAccount}
                loading={accountsLoading}
              />
            </div>
          )}
          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-md transition-all text-lg shadow-md"
            style={{
              backgroundColor: isDark ? '#fbbf24' : '#1e40af',
              border: '2px solid',
              borderColor: isDark ? '#f59e0b' : '#1e3a8a',
            }}
          >
            <span style={{ filter: isDark ? 'none' : 'brightness(0) invert(1)' }}>
              {isDark ? '☀️' : '🌙'}
            </span>
          </button>
          {isLoggedIn && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout()}
              className="hidden md:flex text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Logout
            </Button>
          )}
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 top-14 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed left-0 top-14 h-[calc(100vh-56px)] w-64 transform border-r border-border bg-background px-3 py-4 transition-transform duration-300 ease-out z-50 shadow-xl ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ backgroundColor: isDark ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)' }}
      >
        <div className="flex flex-col gap-0.5 text-sm">
          {/* Mobile Account Selector */}
          {(pathname.startsWith('/dashboard') ||
            pathname.startsWith('/market-watch') ||
            pathname.startsWith('/holdings') ||
            pathname.startsWith('/trading') ||
            pathname.startsWith('/positions') ||
            pathname.startsWith('/orders')) && (
            <div className="mb-3 px-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Selected Account:
              </div>
              <AccountSelector
                accounts={tradingAccounts}
                selectedAccount={selectedAccount}
                onAccountSelect={setSelectedAccount}
                loading={accountsLoading}
              />
            </div>
          )}

          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2 transition-colors hover:bg-muted/60 hover:text-foreground ${
                pathname === item.href
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  : 'text-muted-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: isDark ? '#fbbf24' : '#1e40af',
                color: isDark ? '#000000' : '#ffffff',
                border: '1px solid',
                borderColor: isDark ? '#f59e0b' : '#1e3a8a',
              }}
            >
              {isDark ? '☀️ Light' : '🌙 Dark'} Mode
            </button>
            {isLoggedIn && (
              <Button size="sm" variant="destructive" onClick={() => logout()} className="flex-1">
                Logout
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
