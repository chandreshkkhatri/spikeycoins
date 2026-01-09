import AccountSelector from "@/components/account-selector/AccountSelector";
import NotificationToggle from "@/components/notifications/NotificationToggle";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account-context";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { PAGE_ROUTES } from "@/lib/constants";
import { LogOut, User, LogIn, Settings } from "lucide-react";
import { HeaderFundsDisplay } from "./HeaderFundsDisplay";

const navItems = [
  { href: PAGE_ROUTES.DASHBOARD, label: "Dashboard" },
  { href: PAGE_ROUTES.TRADING_PANEL, label: "Trading Panel" },
  { href: PAGE_ROUTES.TRADING_GYM, label: "Trading Gym" },
  { href: PAGE_ROUTES.ASSETS, label: "Assets" },
  { href: PAGE_ROUTES.ACCOUNTS, label: "Accounts" },
];

export function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { isLoggedIn, user, logout } = useAuth();
  const {
    selectedAccount,
    setSelectedAccount,
    accounts: tradingAccounts,
    loadingAccounts: accountsLoading,
  } = useAccount();
  const [open, setOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2">
              <img
                src="/logo.png"
                alt="Open Mandi"
                className="h-8 w-8 rounded-md object-contain"
              />
              <span className="hidden md:block font-bold text-lg">
                Open Mandi
              </span>
            </div>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`px-3 py-2 rounded-md transition-colors hover:bg-muted/60 hover:text-foreground ${pathname === item.href
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "text-muted-foreground"
                }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Header Funds Display - Show if logged in and account selected */}
          {isLoggedIn && selectedAccount && (
            <HeaderFundsDisplay />
          )}

          {/* Account Selector - Show on dashboard, trading pages, and assets */}
          {(pathname.startsWith(PAGE_ROUTES.DASHBOARD) ||
            pathname.startsWith(PAGE_ROUTES.TRADING_PANEL) ||
            pathname.startsWith(PAGE_ROUTES.ASSETS) ||
            pathname.startsWith(PAGE_ROUTES.TRADING) ||
            pathname.startsWith(PAGE_ROUTES.POSITIONS) ||
            pathname.startsWith(PAGE_ROUTES.ORDERS)) && (
              <div className="hidden md:block mr-2">
                <AccountSelector
                  accounts={tradingAccounts}
                  selectedAccount={selectedAccount}
                  onAccountSelect={setSelectedAccount}
                  loading={accountsLoading}
                />
              </div>
            )}

          {/* Notification Toggle - Only show when logged in */}
          {isLoggedIn && <NotificationToggle />}

          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span className="text-lg leading-none">
              {isDark ? "☀️" : "🌙"}
            </span>
          </button>

          {/* User Menu */}
          {isLoggedIn && user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background hover:bg-accent transition-colors"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                )}
                <span className="text-sm font-medium max-w-[100px] truncate">
                  {user.name}
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-lg z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(PAGE_ROUTES.SETTINGS);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-sm transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-sm transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/login")}
              className="hidden md:flex gap-2"
            >
              <LogIn className="h-4 w-4" />
              Sign in
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
        className={`md:hidden fixed left-0 top-14 h-[calc(100vh-56px)] w-64 transform border-r border-border bg-background px-3 py-4 transition-transform duration-300 ease-out z-50 shadow-xl ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex flex-col gap-0.5 text-sm">
          {/* Mobile Account Selector */}
          {(pathname.startsWith(PAGE_ROUTES.DASHBOARD) ||
            pathname.startsWith(PAGE_ROUTES.TRADING_PANEL) ||
            pathname.startsWith(PAGE_ROUTES.ASSETS) ||
            pathname.startsWith(PAGE_ROUTES.TRADING) ||
            pathname.startsWith(PAGE_ROUTES.POSITIONS) ||
            pathname.startsWith(PAGE_ROUTES.ORDERS)) && (
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

          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2 transition-colors hover:bg-muted/60 hover:text-foreground ${pathname === item.href
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "text-muted-foreground"
                }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 rounded-md border border-blue-900 bg-blue-800 px-3 py-2 text-sm font-medium text-white transition-colors dark:border-amber-500 dark:bg-amber-400 dark:text-black"
            >
              {isDark ? "☀️ Light" : "🌙 Dark"} Mode
            </button>
          </div>

          {/* Mobile User Section */}
          <div className="mt-4 pt-4 border-t border-border">
            {isLoggedIn && user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-3">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    navigate(PAGE_ROUTES.SETTINGS);
                  }}
                  className="w-full"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setOpen(false);
                  navigate("/login");
                }}
                className="w-full"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
