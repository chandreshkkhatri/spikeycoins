"use client";

import "./HoldingsCard.css";
import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  AlertTriangle,
  Briefcase,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getVendorColor, formatBrokerAmount } from "@/lib/format-utils";
import { useAccountCardData } from "@/hooks/useAccountCardData";
import { TradingAccount } from "@/hooks/account-card-types";

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
  details: unknown;
}

interface HoldingsCardProps {
  accounts: TradingAccount[];
  selectedAccountId?: string;
  className?: string;
}

export default function HoldingsCard({
  accounts,
  selectedAccountId,
  className,
}: HoldingsCardProps) {
  const router = useRouter();

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter((acc) => acc._id === selectedAccountId)
    : accounts;

  const {
    data: holdingsData,
    loading,
    error,
    accountErrors,
    refreshing,
    refresh,
  } = useAccountCardData<UnifiedHoldingResponse>({
    endpoint: "/holdings",
    accounts,
    selectedAccountId,
    extractItems: (responseData) =>
      Array.isArray(responseData?.data) ? responseData.data : [],
    classifyError: (err, account) => {
      const status = err.response?.status;
      const responseData = err.response?.data;
      if (status === 403 && responseData?.isPermissionError) {
        return {
          accountId: account._id,
          accountName: account.accountName,
          requiresReauth: false,
          message:
            responseData.suggestion ||
            responseData.error ||
            "Permission denied",
        };
      }
      return null;
    },
  });

  const handleRefresh = refresh;



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
          <Button onClick={() => router.push("/brokers")} className="mt-4">
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
              <div className="summary-value">
                {formatBrokerAmount(totalValue, accountsToShow.length === 1 ? accountsToShow[0].accountType : "upstox")}
              </div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Investment</div>
              <div className="summary-value">
                {formatBrokerAmount(totalInvestment, accountsToShow.length === 1 ? accountsToShow[0].accountType : "upstox")}
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
                {formatBrokerAmount(totalPnl, accountsToShow.length === 1 ? accountsToShow[0].accountType : "upstox")}
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

      {/* Authentication and Permission Errors */}
      {accountErrors.length > 0 && (
        <div className="auth-errors-container">
          {accountErrors.map((error) => {
            const account = accountsToShow.find(
              (a) => a._id === error.accountId
            );
            if (!account) return null;

            const isPermissionError = !error.requiresReauth;
            const errorTitle = isPermissionError
              ? `${error.accountName} - Permission Required`
              : `${error.accountName} - Authentication Required`;

            return (
              <div key={error.accountId} className="auth-error-alert">
                <div className="auth-error-content">
                  <AlertTriangle className="auth-error-icon" size={20} />
                  <div className="auth-error-details">
                    <div className="auth-error-title">{errorTitle}</div>
                    <div className="auth-error-message">{error.message}</div>
                  </div>
                </div>
                {error.requiresReauth && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      // Handle re-authentication based on account type
                      if (account.accountType === "upstox") {
                        window.location.href = `/api/auth/upstox?accountId=${account._id}`;
                      }
                    }}
                  >
                    Re-authenticate
                  </Button>
                )}
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
        <div className="holdings-table-viewport">
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
                  const details = holding.details as {
                    symbol?: string;
                    tradingSymbol?: string;
                    asset?: string;
                  } | null;
                  const displaySymbol =
                    holding.symbol ||
                    details?.symbol ||
                    details?.tradingSymbol ||
                    details?.asset ||
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
                        {formatBrokerAmount(holding.averagePrice, holding.vendor)}
                      </td>
                      <td className="text-right">
                        {formatBrokerAmount(holding.lastPrice, holding.vendor)}
                      </td>
                      <td className="text-right">
                        {formatBrokerAmount(holding.currentValue, holding.vendor)}
                      </td>
                      <td
                        className={`text-right ${
                          holding.pnl >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {formatBrokerAmount(holding.pnl, holding.vendor)}
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
        </div>
      )}
    </EnhancedCard>
  );
}
