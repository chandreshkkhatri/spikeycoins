"use client";

import EnhancedCard from "@/components/enhanced-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  AlertTriangle,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getVendorColor, formatBrokerAmount } from "@/lib/format-utils";
import { useAccountCardData } from "@/hooks/useAccountCardData";
import { TradingAccount } from "@/hooks/account-card-types";

interface UnifiedPositionResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  pnl: number;
  pnlPercentage: number;
  product: string;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  details: unknown;
}

interface PositionsCardProps {
  accounts: TradingAccount[];
  selectedAccountId?: string;
  className?: string;
}

export default function PositionsCard({
  accounts,
  selectedAccountId,
  className,
}: PositionsCardProps) {
  const router = useRouter();

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter((acc) => acc._id === selectedAccountId)
    : accounts;

  const {
    data: positionsData,
    loading,
    error,
    accountErrors,
    refreshing,
    refresh,
  } = useAccountCardData<UnifiedPositionResponse>({
    endpoint: "/positions",
    accounts,
    selectedAccountId,
    extractItems: (responseData) =>
      Array.isArray(responseData?.data) ? responseData.data : [],
    buildRequestUrl: (account) => {
      const cacheBust = Date.now();
      return `/positions?vendor=${account.accountType}&accountId=${account._id}&_=${cacheBust}`;
    },
    requestConfig: {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    },
    dedupeInFlight: true,
  });

  const handleRefresh = refresh;



  const totalPnl = positionsData.reduce(
    (sum, position) => sum + (position.pnl || 0),
    0
  );

  const totalValue = positionsData.reduce(
    (sum, position) =>
      sum + (position.lastPrice || 0) * Math.abs(position.quantity || 0),
    0
  );

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Positions" className={className}>
        <div className="empty-state">
          <Package className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your positions.</p>
          <Button onClick={() => router.push("/brokers")} className="mt-4">
            Add Account
          </Button>
        </div>
      </EnhancedCard>
    );
  }

  if (loading) {
    return (
      <EnhancedCard title="Positions" className={className}>
        <LoadingSpinner message="Loading positions..." />
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard title="Positions" className={className}>
      {/* Summary when multiple positions */}
      {positionsData.length > 0 && (
        <div className="positions-summary">
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">Total Positions</div>
              <div className="summary-value">{positionsData.length}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total Value</div>
              <div className="summary-value">
                {formatBrokerAmount(totalValue, accountsToShow.length === 1 ? accountsToShow[0].accountType : "upstox")}
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
                      window.location.href = `/api/auth/upstox/login?accountId=${account._id}`;
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

      {/* Positions List */}
      {positionsData.length === 0 && accountErrors.length === 0 && !error ? (
        <div className="empty-positions">
          <Package size={32} className="text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No open positions</p>
        </div>
      ) : (
        <div className="positions-list">
          {positionsData.map((position) => {
            const isRefreshing = refreshing === position.accountId;

            return (
              <div
                key={`${position.accountId}-${position.symbol}-${position.product}`}
                className="position-card"
              >
                <div className="position-header">
                  <div className="position-info">
                    <div className="position-symbol-row">
                      <span className="position-symbol">{position.symbol}</span>
                      <Badge
                        variant="default"
                        style={{
                          borderColor: getVendorColor(position.vendor),
                          color: getVendorColor(position.vendor),
                        }}
                      >
                        {position.vendor.toUpperCase()}
                      </Badge>
                      <span className="position-exchange">
                        {position.exchange}
                      </span>
                      <span className="position-product">{position.product}</span>
                    </div>
                    <div className="position-account">{position.accountName}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const account = accountsToShow.find(
                        (a) => a._id === position.accountId
                      );
                      if (account) handleRefresh(account);
                    }}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </Button>
                </div>

                <div className="position-details">
                  <div className="detail-row">
                    <span className="detail-label">Qty:</span>
                    <span className="detail-value">{position.quantity}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Avg:</span>
                    <span className="detail-value">
                      {formatBrokerAmount(position.averagePrice, position.vendor)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">LTP:</span>
                    <span className="detail-value">
                      {formatBrokerAmount(position.lastPrice, position.vendor)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">P&L:</span>
                    <span
                      className={`detail-value pnl ${
                        position.pnl >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {formatBrokerAmount(position.pnl, position.vendor)}
                      <span className="pnl-percentage">
                        ({position.pnlPercentage?.toFixed(2) ?? "0.00"}%)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </EnhancedCard>
  );
}
