'use client';

import EnhancedCard from '@/components/enhanced-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { API_ROUTES } from '@/lib/constants';
import { IAccount } from '@/models/account';
import axios from 'axios';
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

interface UnifiedFundsResponse {
  totalBalance: string;
  availableBalance: string;
  usedMargin?: string;
  unrealizedPnl?: string;
  details: any;
  vendor: string;
  accountId: string;
  accountName: string;
  timestamp: string;
}

interface FundsCardProps {
  accounts: IAccount[];
  selectedAccountId?: string;
  className?: string;
}

interface AccountError {
  accountId: string;
  accountName: string;
  requiresReauth: boolean;
  message: string;
}

export default function FundsCard({ accounts, selectedAccountId, className }: FundsCardProps) {
  const [fundsData, setFundsData] = useState<UnifiedFundsResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter(acc => acc._id === selectedAccountId)
    : accounts;

  const fetchFundsForAccount = async (account: IAccount, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(account._id!);
    }

    try {
      const response = await axios.get(
        `${API_ROUTES.funds}?vendor=${account.accountType}&accountId=${account._id}`
      );

      if (response.data?.success) {
        setFundsData(prev => {
          const filtered = prev.filter(f => f.accountId !== account._id);
          return [...filtered, response.data.data];
        });
        setError(null);
      } else {
        throw new Error(response.data?.error || 'Failed to fetch funds');
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
        const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch funds';
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
      await Promise.allSettled(accountsToShow.map(account => fetchFundsForAccount(account)));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (account: IAccount) => {
    await fetchFundsForAccount(account, true);
  };

  useEffect(() => {
    fetchAllFunds();
  }, [accountsToShow]);

  const formatCurrency = (amount: string, vendor: string) => {
    const num = parseFloat(amount || '0');
    if (vendor === 'binance') {
      return `$${num.toFixed(2)}`;
    }
    return `₹${num.toFixed(2)}`;
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

  const totalBalance = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund.totalBalance || '0'),
    0
  );
  const totalAvailable = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund.availableBalance || '0'),
    0
  );
  const totalUnrealized = fundsData.reduce(
    (sum, fund) => sum + parseFloat(fund.unrealizedPnl || '0'),
    0
  );

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Account Funds" className={className}>
        <div className="empty-state">
          <Wallet className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your funds and balances.</p>
          <Button onClick={() => (window.location.href = '/accounts')} className="mt-4">
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
              <div className="summary-value available">₹{totalAvailable.toFixed(2)}</div>
            </div>
            {totalUnrealized !== 0 && (
              <div className="summary-item">
                <div className="summary-label">Unrealized P&L</div>
                <div className={`summary-value ${totalUnrealized >= 0 ? 'positive' : 'negative'}`}>
                  {totalUnrealized >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}₹
                  {totalUnrealized.toFixed(2)}
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
                  variant="outline"
                  onClick={() => {
                    // Handle re-authentication based on account type
                    if (account.accountType === 'upstox') {
                      window.location.href = `/api/auth/upstox/login?accountId=${account._id}`;
                    } else if (account.accountType === 'kite') {
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
        {accountsToShow.map(account => {
          const accountFunds = fundsData.find(f => f.accountId === account._id);
          const isRefreshing = refreshing === account._id;
          const hasAuthError = accountErrors.some(e => e.accountId === account._id);

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
                        backgroundColor: `${getVendorColor(account.accountType)}15`,
                        borderColor: getVendorColor(account.accountType),
                        color: getVendorColor(account.accountType),
                        fontWeight: '500',
                        fontSize: '0.75rem',
                        border: `1px solid ${getVendorColor(account.accountType)}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px 6px 8px',
                      }}
                    >
                      <span className="account-type-icon">
                        {account.accountType === 'kite'
                          ? '🟠'
                          : account.accountType === 'upstox'
                            ? '🔵'
                            : account.accountType === 'binance'
                              ? '🟡'
                              : '🔗'}
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
                  <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
                </Button>
              </div>

              {accountFunds ? (
                <div className="funds-details">
                  <div className="funds-row">
                    <span className="label">Total Balance:</span>
                    <span className="value">
                      {formatCurrency(accountFunds.totalBalance, account.accountType)}
                    </span>
                  </div>
                  <div className="funds-row">
                    <span className="label">Available:</span>
                    <span className="value available">
                      {formatCurrency(accountFunds.availableBalance, account.accountType)}
                    </span>
                  </div>
                  {accountFunds.usedMargin && (
                    <div className="funds-row">
                      <span className="label">Used Margin:</span>
                      <span className="value used">
                        {formatCurrency(accountFunds.usedMargin, account.accountType)}
                      </span>
                    </div>
                  )}
                  {accountFunds.unrealizedPnl && parseFloat(accountFunds.unrealizedPnl) !== 0 && (
                    <div className="funds-row">
                      <span className="label">Unrealized P&L:</span>
                      <span
                        className={`value ${parseFloat(accountFunds.unrealizedPnl) >= 0 ? 'positive' : 'negative'}`}
                      >
                        {parseFloat(accountFunds.unrealizedPnl) >= 0 ? (
                          <TrendingUp size={14} />
                        ) : (
                          <TrendingDown size={14} />
                        )}
                        {formatCurrency(accountFunds.unrealizedPnl, account.accountType)}
                      </span>
                    </div>
                  )}
                  <div className="timestamp">
                    Last updated: {new Date(accountFunds.timestamp).toLocaleTimeString()}
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

      <style jsx>{`
        .funds-summary {
          margin-bottom: 20px;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          color: white;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
        }

        .summary-item {
          text-align: center;
        }

        .summary-label {
          font-size: 0.75rem;
          opacity: 0.9;
          margin-bottom: 4px;
        }

        .summary-value {
          font-size: 1.1rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .summary-value.available {
          color: #4ade80;
        }

        .summary-value.positive {
          color: #4ade80;
        }

        .summary-value.negative {
          color: #f87171;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #dc2626;
          font-size: 0.875rem;
          margin-bottom: 16px;
        }

        :global(.dark) .error-message {
          background: rgba(220, 38, 38, 0.1);
          border-color: rgba(220, 38, 38, 0.3);
          color: #fca5a5;
        }

        .accounts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 8px;
        }

        .account-funds-card {
          padding: 16px;
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          background: #ffffff;
        }

        :global(.dark) .account-funds-card {
          background: #18181b;
          border-color: #3f3f46;
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .account-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .account-name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .account-name {
          font-weight: 600;
          font-size: 1.1rem;
          color: #333;
          letter-spacing: -0.01em;
        }

        :global(.dark) .account-name {
          color: #ffffff;
        }

        .account-status {
          display: flex;
          align-items: center;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .status-dot.active {
          background-color: #22c55e;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
        }

        .status-dot.inactive {
          background-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
        }

        .account-type-row {
          display: flex;
          align-items: center;
        }

        .account-type-icon {
          font-size: 0.8rem;
          line-height: 1;
        }

        .refresh-button:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .funds-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .funds-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
        }

        .funds-row .label {
          font-size: 0.875rem;
          color: #666;
        }

        :global(.dark) .funds-row .label {
          color: #a1a1aa;
        }

        .funds-row .value {
          font-weight: 600;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .value.available {
          color: #059669;
        }

        .value.used {
          color: #dc2626;
        }

        .value.positive {
          color: #059669;
        }

        .value.negative {
          color: #dc2626;
        }

        .timestamp {
          font-size: 0.75rem;
          color: #999;
          text-align: center;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #f0f0f0;
        }

        :global(.dark) .timestamp {
          color: #71717a;
          border-top-color: #3f3f46;
        }

        .funds-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px;
          color: #dc2626;
          background: #fef2f2;
          border-radius: 8px;
          justify-content: center;
        }

        :global(.dark) .funds-error {
          background: rgba(220, 38, 38, 0.1);
          color: #fca5a5;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          text-align: center;
        }

        .empty-icon {
          color: #9ca3af;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }

        :global(.dark) .empty-state h3 {
          color: #ffffff;
        }

        .empty-state p {
          color: #666;
          margin-bottom: 16px;
        }

        :global(.dark) .empty-state p {
          color: #a1a1aa;
        }

        @media (max-width: 768px) {
          .accounts-grid {
            grid-template-columns: 1fr;
          }

          .summary-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }
      `}</style>
    </EnhancedCard>
  );
}
