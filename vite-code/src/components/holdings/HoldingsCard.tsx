import "./HoldingsCard.css";
import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import axios from "axios";
import {
  AlertTriangle,
  Briefcase,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";

interface TradingAccount {
  _id?: string;
  accountName: string;
  accountType: "binance" | "kite" | "upstox";
  isActive: boolean;
  accessToken?: string;
}

interface UnifiedHoldingResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercentage: number;
  isin?: string;
  companyName?: string;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  details: any;
}

interface HoldingsCardProps {
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

export default function HoldingsCard({
  accounts,
  selectedAccountId,
  className,
}: HoldingsCardProps) {
  const [holdingsData, setHoldingsData] = useState<UnifiedHoldingResponse[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter((acc) => acc._id === selectedAccountId)
    : accounts;

  const fetchHoldingsForAccount = async (
    account: TradingAccount,
    isRefresh = false
  ) => {
    if (isRefresh) {
      setRefreshing(account._id!);
    }

    try {
      const response = await axios.get(
        `/api/holdings?vendor=${account.accountType}&accountId=${account._id}`
      );

      if (response.data?.success) {
        // Ensure data is an array before spreading
        const holdingsArray = Array.isArray(response.data.data)
          ? response.data.data
          : [];

        setHoldingsData((prev) => {
          const filtered = prev.filter((h) => h.accountId !== account._id);
          return [...filtered, ...holdingsArray];
        });

        // Clear any previous errors for this account
        setAccountErrors((prev) =>
          prev.filter((e) => e.accountId !== account._id)
        );
        setError(null);
      } else {
        throw new Error(response.data?.error || "Failed to fetch holdings");
      }
    } catch (err: any) {
      // Check if it's a 401 error (authentication failure)
      if (err.response?.status === 401) {
        const errorData = err.response?.data;
        setAccountErrors((prev) => {
          const filtered = prev.filter((e) => e.accountId !== account._id);
          return [
            ...filtered,
            {
              accountId: account._id!,
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
          err.response?.data?.error ||
          err.message ||
          "Failed to fetch holdings";
        setError(`${account.accountName}: ${errorMessage}`);
      }
    } finally {
      if (isRefresh) {
        setRefreshing(null);
      }
    }
  };

  const fetchAllHoldings = async () => {
    if (accountsToShow.length === 0) return;

    setLoading(true);
    setError(null);
    setAccountErrors([]);
    setHoldingsData([]);

    try {
      // Fetch holdings for all accounts in parallel
      await Promise.allSettled(
        accountsToShow.map((account) => fetchHoldingsForAccount(account))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (account: TradingAccount) => {
    await fetchHoldingsForAccount(account, true);
  };

  useEffect(() => {
    // Only fetch if we have accounts to show
    if (accountsToShow.length > 0) {
      fetchAllHoldings();
    }
  }, [JSON.stringify(accounts.map((a) => a._id)), selectedAccountId]); // Use stable stringified IDs

  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return "₹0.00";
    }
    return `₹${amount.toFixed(2)}`;
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

  const totalValue = holdingsData.reduce(
    (sum, holding) => sum + (holding.currentValue || 0),
    0
  );

  const totalInvestment = holdingsData.reduce(
    (sum, holding) =>
      sum + (holding.averagePrice || 0) * (holding.quantity || 0),
    0
  );

  const totalPnl = holdingsData.reduce(
    (sum, holding) => sum + (holding.pnl || 0),
    0
  );

  const totalPnlPercentage =
    totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Portfolio Holdings" className={className}>
        <div className="empty-state">
          <Briefcase className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your holdings.</p>
          <Button
            onClick={() => (window.location.href = "/accounts")}
            className="mt-4"
          >
            Add Account
          </Button>
        </div>
      </EnhancedCard>
    );
  }

  if (loading) {
    return (
      <EnhancedCard title="Portfolio Holdings" className={className}>
        <LoadingSpinner message="Loading holdings..." />
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard title="Portfolio Holdings" className={className}>
      {/* Portfolio Summary */}
      {holdingsData.length > 0 && (
        <div className="holdings-summary">
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">Current Value</div>
              <div className="summary-value">{formatCurrency(totalValue)}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Investment</div>
              <div className="summary-value">
                {formatCurrency(totalInvestment)}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total P&L</div>
              <div
                className={`summary-value ${
                  totalPnl >= 0 ? "positive" : "negative"
                }`}
              >
                {totalPnl >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )}
                {formatCurrency(totalPnl)}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Returns</div>
              <div
                className={`summary-value ${
                  totalPnlPercentage >= 0 ? "positive" : "negative"
                }`}
              >
                {totalPnlPercentage.toFixed(2)}%
              </div>
            </div>
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
                  variant="default"
                  onClick={() => {
                    // Handle re-authentication based on account type
                    if (account.accountType === "upstox") {
                      window.location.href = `/api/auth/upstox?accountId=${account._id}`;
                    } else if (account.accountType === "kite") {
                      window.location.href = `/api/auth/kite?accountId=${account._id}`;
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

      {/* Holdings Table */}
      {holdingsData.length === 0 && accountErrors.length === 0 && !error ? (
        <div className="empty-holdings">
          <Briefcase size={32} className="text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No holdings in your portfolio</p>
        </div>
      ) : (
        <div className="holdings-table-container">
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Vendor</th>
                <th>Exchange</th>
                <th>Account</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">Avg Price</th>
                <th className="text-right">LTP</th>
                <th className="text-right">Value</th>
                <th className="text-right">P&L</th>
                <th className="text-right">Returns %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdingsData.map((holding, index) => {
                const isRefreshing = refreshing === holding.accountId;
                // Create a unique key using id if available, otherwise use a combination of fields with index as fallback
                const uniqueKey =
                  holding.id ||
                  `${holding.accountId}-${holding.symbol || "unknown"}-${
                    holding.exchange || "unknown"
                  }-${index}`;

                // Try to extract symbol from various possible locations in the data
                const displaySymbol =
                  holding.symbol ||
                  holding.details?.symbol ||
                  holding.details?.tradingSymbol ||
                  holding.details?.asset ||
                  holding.companyName ||
                  (holding.isin ? `ISIN: ${holding.isin}` : null);

                return (
                  <tr key={uniqueKey} className="holding-row">
                    <td className="symbol-cell">
                      <div className="symbol-content">
                        <span className="symbol-name">
                          {displaySymbol || (
                            <span className="text-muted">Unknown</span>
                          )}
                        </span>
                        {holding.companyName && holding.symbol && (
                          <span className="company-name">
                            {holding.companyName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge
                        variant="default"
                        className="vendor-badge"
                        style={{
                          borderColor: getVendorColor(holding.vendor),
                          color: getVendorColor(holding.vendor),
                        }}
                      >
                        {holding.vendor.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      {holding.exchange && (
                        <span className="exchange-badge">
                          {holding.exchange}
                        </span>
                      )}
                    </td>
                    <td className="account-cell">{holding.accountName}</td>
                    <td className="text-right">{holding.quantity}</td>
                    <td className="text-right">
                      {formatCurrency(holding.averagePrice)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(holding.lastPrice)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(holding.currentValue)}
                    </td>
                    <td
                      className={`text-right ${
                        holding.pnl >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {formatCurrency(holding.pnl)}
                    </td>
                    <td
                      className={`text-right ${
                        holding.pnlPercentage >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {holding.pnlPercentage?.toFixed(2) ?? "0.00"}%
                    </td>
                    <td className="action-cell">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const account = accountsToShow.find(
                            (a) => a._id === holding.accountId
                          );
                          if (account) handleRefresh(account);
                        }}
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? (
                          <RefreshCw className="animate-spin" size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </EnhancedCard>
  );
}
