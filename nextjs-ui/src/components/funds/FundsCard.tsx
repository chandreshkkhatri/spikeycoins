"use client";

import "./FundsCard.css";
import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { API_ROUTES } from "@/lib/constants";
import axios from "axios";
import {
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

// Use a flexible account type that works with both IAccount and TradingAccount from context
interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: "binance" | "kite" | "upstox";
  isActive?: boolean;
  accessToken?: string;
}

interface UnifiedFundsResponse {
  totalBalance: string;
  availableBalance: string;
  usedMargin?: string;
  unrealizedPnl?: string;
  details: unknown;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
}

interface FundsCardProps {
  accounts: TradingAccount[];
  selectedAccountId?: string;
  className?: string;
}

interface AccountError {
  accountId: string;
  accountName: string;
  requiresReauth: boolean;
  message: string;
}

export default function FundsCard({
  accounts,
  selectedAccountId,
  className,
}: FundsCardProps) {
  const router = useRouter();
  const [fundsData, setFundsData] = useState<UnifiedFundsResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = useMemo(
    () =>
      selectedAccountId
        ? accounts.filter((acc) => acc._id === selectedAccountId)
        : accounts,
    [accounts, selectedAccountId]
  );

  const fetchFundsForAccount = async (account: TradingAccount, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(account._id);
    }

    try {
      const response = await axios.get(
        `${API_ROUTES.funds}?vendor=${account.accountType}&accountId=${account._id}`
      );

      if (response.data?.success && response.data.funds) {
        const fundsResponse = {
          ...response.data.funds,
          accountId: account._id,
          accountName: account.accountName,
          vendor: account.accountType,
          timestamp: new Date().toISOString(),
        };

        setFundsData((prev) => {
          const filtered = prev.filter((f) => f && f.accountId !== account._id);
          return [...filtered, fundsResponse];
        });
        setError(null);
      } else {
        throw new Error(response.data?.error || "Failed to fetch funds");
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { requiresReauth?: boolean; error?: string } }; message?: string };
      // Check if it's a 401 error (authentication failure)
      if (axiosError.response?.status === 401) {
        const errorData = axiosError.response?.data;
        setAccountErrors((prev) => {
          const filtered = prev.filter((e) => e.accountId !== account._id);
          return [
            ...filtered,
            {
              accountId: account._id,
              accountName: account.accountName,
              requiresReauth: errorData?.requiresReauth || true,
              message:
                errorData?.error ||
                "Authentication failed. Please re-authenticate your account.",
            },
          ];
        });
      } else {
        const errorMessage =
          axiosError.response?.data?.error || axiosError.message || "Failed to fetch funds";
        setError(`${account.accountName}: ${errorMessage}`);
      }
    } finally {
      if (isRefresh) {
        setRefreshing(null);
      }
    }
  };

  const fetchAllFunds = async () => {
    if (accountsToShow.length === 0) return;

    setLoading(true);
    setError(null);
    setAccountErrors([]);
    setFundsData([]);

    try {
      // Fetch funds for all accounts in parallel
      await Promise.allSettled(
        accountsToShow.map((account) => fetchFundsForAccount(account))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (account: TradingAccount) => {
    await fetchFundsForAccount(account, true);
  };

  useEffect(() => {
    fetchAllFunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(accountsToShow.map((a) => a._id))]);

  const formatCurrency = (amount: string, vendor: string) => {
    const num = parseFloat(amount || "0");
    if (vendor === "binance") {
      return `$${num.toFixed(2)}`;
    }
    return `₹${num.toFixed(2)}`;
  };

  const getVendorColor = (vendor: string) => {
    switch (vendor.toLowerCase()) {
      case "kite":
        return "#ff6600";
      case "upstox":
        return "#387ed1";
      case "binance":
        return "#f3ba2f";
      default:
        return "#666";
    }
  };

  const totalBalance = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund?.totalBalance || "0"),
    0
  );
  const totalAvailable = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund?.availableBalance || "0"),
    0
  );
  const totalUnrealized = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund?.unrealizedPnl || "0"),
    0
  );

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Account Funds" className={className}>
        <div className="empty-state">
          <Wallet className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your funds and balances.</p>
          <Button onClick={() => router.push("/brokers")} className="mt-4">
            Add Account
          </Button>
        </div>
      </EnhancedCard>
    );
  }

  if (loading) {
    return (
      <EnhancedCard title="Account Funds" className={className}>
        <LoadingSpinner message="Loading funds..." />
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard title="Account Funds" className={className}>
      {/* Summary when multiple accounts */}
      {accountsToShow.length > 1 && fundsData.length > 0 && (
        <div className="funds-summary">
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">Total Balance</div>
              <div className="summary-value">₹{totalBalance.toFixed(2)}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Available</div>
              <div className="summary-value available">
                ₹{totalAvailable.toFixed(2)}
              </div>
            </div>
            {totalUnrealized !== 0 && (
              <div className="summary-item">
                <div className="summary-label">Unrealized P&L</div>
                <div
                  className={`summary-value ${
                    totalUnrealized >= 0 ? "positive" : "negative"
                  }`}
                >
                  {totalUnrealized >= 0 ? (
                    <TrendingUp size={16} />
                  ) : (
                    <TrendingDown size={16} />
                  )}
                  ₹{totalUnrealized.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Authentication Errors */}
      {accountErrors.length > 0 && (
        <div className="auth-errors-container">
          {accountErrors.map((error) => {
            const account = accountsToShow.find(
              (a) => a._id === error.accountId
            );
            if (!account) return null;

            return (
              <div key={error.accountId} className="auth-error-alert">
                <div className="auth-error-content">
                  <AlertTriangle className="auth-error-icon" size={20} />
                  <div className="auth-error-details">
                    <div className="auth-error-title">
                      {error.accountName} - Authentication Required
                    </div>
                    <div className="auth-error-message">{error.message}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Handle re-authentication based on account type
                    if (account.accountType === "upstox") {
                      window.location.href = `/api/auth/upstox/login?accountId=${account._id}`;
                    } else if (account.accountType === "kite") {
                      window.location.href = `/api/auth/kite/login?accountId=${account._id}`;
                    }
                  }}
                >
                  Re-authenticate
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Individual Account Cards */}
      <div className="accounts-grid">
        {accountsToShow.map((account) => {
          const accountFunds = fundsData.find(
            (f) => f.accountId === account._id
          );
          const isRefreshing = refreshing === account._id;
          const hasAuthError = accountErrors.some(
            (e) => e.accountId === account._id
          );

          // Skip rendering if account has auth error
          if (hasAuthError) return null;

          return (
            <div key={account._id} className="account-funds-card">
              <div className="account-header">
                <div className="account-info">
                  <div className="account-name-row">
                    <div className="account-name">{account.accountName}</div>
                    <div className="account-status">
                      {account.isActive ? (
                        <span
                          className="status-dot active"
                          title="Account is active and connected"
                        ></span>
                      ) : (
                        <span
                          className="status-dot inactive"
                          title="Account is inactive or disconnected"
                        ></span>
                      )}
                    </div>
                  </div>
                  <div className="account-type-row">
                    <Badge
                      variant="default"
                      style={{
                        backgroundColor: `${getVendorColor(
                          account.accountType
                        )}15`,
                        borderColor: getVendorColor(account.accountType),
                        color: getVendorColor(account.accountType),
                        fontWeight: "500",
                        fontSize: "0.75rem",
                        border: `1px solid ${getVendorColor(
                          account.accountType
                        )}`,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 12px 6px 8px",
                      }}
                    >
                      <span className="account-type-icon">
                        {account.accountType === "kite"
                          ? "🟠"
                          : account.accountType === "upstox"
                          ? "🔵"
                          : account.accountType === "binance"
                          ? "🟡"
                          : "🔗"}
                      </span>
                      {account.accountType.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRefresh(account)}
                  disabled={isRefreshing}
                  className="refresh-button"
                >
                  <RefreshCw
                    size={16}
                    className={isRefreshing ? "spinning" : ""}
                  />
                </Button>
              </div>

              {accountFunds ? (
                <div className="funds-details">
                  <div className="funds-row">
                    <span className="label">Total Balance:</span>
                    <span className="value">
                      {formatCurrency(
                        accountFunds.totalBalance,
                        account.accountType
                      )}
                    </span>
                  </div>
                  <div className="funds-row">
                    <span className="label">Available:</span>
                    <span className="value available">
                      {formatCurrency(
                        accountFunds.availableBalance,
                        account.accountType
                      )}
                    </span>
                  </div>
                  {accountFunds.usedMargin && (
                    <div className="funds-row">
                      <span className="label">Used Margin:</span>
                      <span className="value used">
                        {formatCurrency(
                          accountFunds.usedMargin,
                          account.accountType
                        )}
                      </span>
                    </div>
                  )}
                  {accountFunds.unrealizedPnl &&
                    parseFloat(accountFunds.unrealizedPnl) !== 0 && (
                      <div className="funds-row">
                        <span className="label">Unrealized P&L:</span>
                        <span
                          className={`value ${
                            parseFloat(accountFunds.unrealizedPnl) >= 0
                              ? "positive"
                              : "negative"
                          }`}
                        >
                          {parseFloat(accountFunds.unrealizedPnl) >= 0 ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          {formatCurrency(
                            accountFunds.unrealizedPnl,
                            account.accountType
                          )}
                        </span>
                      </div>
                    )}
                  <div className="timestamp">
                    Last updated:{" "}
                    {new Date(accountFunds.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ) : (
                <div className="funds-error">
                  <AlertTriangle size={20} />
                  <span>Failed to load funds</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No funds loaded state */}
      {fundsData.length === 0 && !loading && !error && (
        <div className="empty-state">
          <Wallet className="empty-icon" size={48} />
          <h3>No Funds Data</h3>
          <p>Unable to fetch funds information for your accounts.</p>
          <Button onClick={fetchAllFunds} className="mt-4">
            Try Again
          </Button>
        </div>
      )}
    </EnhancedCard>
  );
}
