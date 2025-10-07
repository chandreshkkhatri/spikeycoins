'use client';

import EnhancedCard from '@/components/enhanced-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import axios from 'axios';
import { AlertTriangle, Package, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TradingAccount {
  _id?: string;
  accountName: string;
  accountType: 'binance' | 'kite' | 'upstox';
  isActive: boolean;
  accessToken?: string;
}

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
  details: any;
}

interface PositionsCardProps {
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

export default function PositionsCard({
  accounts,
  selectedAccountId,
  className,
}: PositionsCardProps) {
  const [positionsData, setPositionsData] = useState<UnifiedPositionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter(acc => acc._id === selectedAccountId)
    : accounts;

  const fetchPositionsForAccount = async (account: TradingAccount, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(account._id!);
    }

    try {
      const response = await axios.get(
        `/api/positions?vendor=${account.accountType}&accountId=${account._id}`
      );

      if (response.data?.success) {
        setPositionsData(prev => {
          const filtered = prev.filter(p => p.accountId !== account._id);
          return [...filtered, ...response.data.data];
        });

        // Clear any previous errors for this account
        setAccountErrors(prev => prev.filter(e => e.accountId !== account._id));
        setError(null);
      } else {
        throw new Error(response.data?.error || 'Failed to fetch positions');
      }
    } catch (err: any) {
      // Check if it's a 401 error (authentication failure)
      if (err.response?.status === 401) {
        const errorData = err.response?.data;
        setAccountErrors(prev => {
          const filtered = prev.filter(e => e.accountId !== account._id);
          return [
            ...filtered,
            {
              accountId: account._id!,
              accountName: account.accountName,
              requiresReauth: errorData?.requiresReauth || true,
              message:
                errorData?.error || 'Authentication failed. Please re-authenticate your account.',
            },
          ];
        });
      } else {
        const errorMessage =
          err.response?.data?.error || err.message || 'Failed to fetch positions';
        setError(`${account.accountName}: ${errorMessage}`);
      }
    } finally {
      if (isRefresh) {
        setRefreshing(null);
      }
    }
  };

  const fetchAllPositions = async () => {
    if (accountsToShow.length === 0) return;

    setLoading(true);
    setError(null);
    setAccountErrors([]);
    setPositionsData([]);

    try {
      // Fetch positions for all accounts in parallel
      await Promise.allSettled(accountsToShow.map(account => fetchPositionsForAccount(account)));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (account: TradingAccount) => {
    await fetchPositionsForAccount(account, true);
  };

  useEffect(() => {
    // Only fetch if we have accounts to show
    if (accountsToShow.length > 0) {
      fetchAllPositions();
    }
  }, [JSON.stringify(accounts.map(a => a._id)), selectedAccountId]); // Use stable stringified IDs

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  const getVendorColor = (vendor: string) => {
    switch (vendor.toLowerCase()) {
      case 'kite':
        return '#ff6600';
      case 'upstox':
        return '#387ed1';
      case 'binance':
        return '#f3ba2f';
      default:
        return '#666';
    }
  };

  const totalPnl = positionsData.reduce((sum, position) => sum + position.pnl, 0);

  const totalValue = positionsData.reduce(
    (sum, position) => sum + position.lastPrice * Math.abs(position.quantity),
    0
  );

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Positions" className={className}>
        <div className="empty-state">
          <Package className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your positions.</p>
          <Button onClick={() => (window.location.href = '/accounts')} className="mt-4">
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
              <div className="summary-value">{formatCurrency(totalValue)}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Total P&L</div>
              <div className={`summary-value ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                {totalPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {formatCurrency(totalPnl)}
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
          {accountErrors.map(error => {
            const account = accountsToShow.find(a => a._id === error.accountId);
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
                    if (account.accountType === 'upstox') {
                      window.location.href = `/api/auth/upstox?accountId=${account._id}`;
                    } else if (account.accountType === 'kite') {
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

      {/* Positions List */}
      {positionsData.length === 0 && accountErrors.length === 0 && !error ? (
        <div className="empty-positions">
          <Package size={32} className="text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No open positions</p>
        </div>
      ) : (
        <div className="positions-list">
          {positionsData.map(position => {
            const isRefreshing = refreshing === position.accountId;

            return (
              <div key={position.id} className="position-card">
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
                      <span className="position-exchange">{position.exchange}</span>
                      <span className="position-product">{position.product}</span>
                    </div>
                    <div className="position-account">{position.accountName}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const account = accountsToShow.find(a => a._id === position.accountId);
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
                    <span className="detail-value">{formatCurrency(position.averagePrice)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">LTP:</span>
                    <span className="detail-value">{formatCurrency(position.lastPrice)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">P&L:</span>
                    <span
                      className={`detail-value pnl ${position.pnl >= 0 ? 'positive' : 'negative'}`}
                    >
                      {formatCurrency(position.pnl)}
                      <span className="pnl-percentage">({position.pnlPercentage.toFixed(2)}%)</span>
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
