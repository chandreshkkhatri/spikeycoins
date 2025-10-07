'use client';

import EnhancedCard from '@/components/enhanced-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import axios from 'axios';
import { AlertTriangle, Receipt, RefreshCw, ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TradingAccount {
  _id?: string;
  accountName: string;
  accountType: 'binance' | 'kite' | 'upstox';
  isActive: boolean;
  accessToken?: string;
}

interface UnifiedOrderResponse {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  price: number;
  averagePrice: number;
  orderType: string;
  transactionType: string;
  status: string;
  product: string;
  validity: string;
  filledQuantity: number;
  pendingQuantity: number;
  timestamp: string;
  vendor: string;
  accountId: string;
  accountName: string;
  details: any;
}

interface OrdersCardProps {
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

export default function OrdersCard({ accounts, selectedAccountId, className }: OrdersCardProps) {
  const [ordersData, setOrdersData] = useState<UnifiedOrderResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountErrors, setAccountErrors] = useState<AccountError[]>([]);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  // Filter accounts to show - if selectedAccountId is provided, show only that account
  const accountsToShow = selectedAccountId
    ? accounts.filter(acc => acc._id === selectedAccountId)
    : accounts;

  const fetchOrdersForAccount = async (account: TradingAccount, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(account._id!);
    }

    try {
      const response = await axios.get(
        `/api/orders?vendor=${account.accountType}&accountId=${account._id}`
      );

      if (response.data?.success) {
        setOrdersData(prev => {
          const filtered = prev.filter(o => o.accountId !== account._id);
          return [...filtered, ...response.data.data];
        });

        // Clear any previous errors for this account
        setAccountErrors(prev => prev.filter(e => e.accountId !== account._id));
        setError(null);
      } else {
        throw new Error(response.data?.error || 'Failed to fetch orders');
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
        const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch orders';
        setError(`${account.accountName}: ${errorMessage}`);
      }
    } finally {
      if (isRefresh) {
        setRefreshing(null);
      }
    }
  };

  const fetchAllOrders = async () => {
    if (accountsToShow.length === 0) return;

    setLoading(true);
    setError(null);
    setAccountErrors([]);
    setOrdersData([]);

    try {
      // Fetch orders for all accounts in parallel
      await Promise.allSettled(accountsToShow.map(account => fetchOrdersForAccount(account)));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (account: TradingAccount) => {
    await fetchOrdersForAccount(account, true);
  };

  useEffect(() => {
    // Only fetch if we have accounts to show
    if (accountsToShow.length > 0) {
      fetchAllOrders();
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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'complete':
      case 'executed':
      case 'filled':
        return 'success';
      case 'open':
      case 'pending':
      case 'placed':
      case 'trigger_pending':
        return 'info';
      case 'cancelled':
      case 'rejected':
      case 'canceled': // Alternative spelling
        return 'danger';
      case 'partial':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const totalOrders = ordersData.length;
  const completedOrders = ordersData.filter(order => {
    const status = order.status.toLowerCase();
    return status === 'complete' || status === 'executed' || status === 'filled';
  }).length;
  const openOrders = ordersData.filter(order => {
    const status = order.status.toLowerCase();
    return (
      status === 'open' ||
      status === 'pending' ||
      status === 'placed' ||
      status === 'trigger_pending'
    );
  }).length;

  if (accountsToShow.length === 0) {
    return (
      <EnhancedCard title="Orders" className={className}>
        <div className="empty-state">
          <ShoppingCart className="empty-icon" size={48} />
          <h3>No Accounts Available</h3>
          <p>Add trading accounts to view your orders.</p>
          <Button onClick={() => (window.location.href = '/accounts')} className="mt-4">
            Add Account
          </Button>
        </div>
      </EnhancedCard>
    );
  }

  if (loading) {
    return (
      <EnhancedCard title="Orders" className={className}>
        <LoadingSpinner message="Loading orders..." />
      </EnhancedCard>
    );
  }

  return (
    <EnhancedCard title="Orders" className={className}>
      {/* Summary when orders exist */}
      {ordersData.length > 0 && (
        <div className="orders-summary">
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-label">Total Orders</div>
              <div className="summary-value">{totalOrders}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Completed</div>
              <div className="summary-value">{completedOrders}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Open</div>
              <div className="summary-value">{openOrders}</div>
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

      {/* Orders List */}
      {ordersData.length === 0 && accountErrors.length === 0 && !error ? (
        <div className="empty-orders">
          <Receipt size={32} className="text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No orders placed yet</p>
        </div>
      ) : (
        <div className="orders-list">
          {ordersData.map(order => {
            const isRefreshing = refreshing === order.accountId;

            return (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div className="order-info">
                    <div className="order-symbol-row">
                      <span className="order-symbol">{order.symbol}</span>
                      <Badge
                        variant="default"
                        style={{
                          borderColor: getVendorColor(order.vendor),
                          color: getVendorColor(order.vendor),
                        }}
                      >
                        {order.vendor.toUpperCase()}
                      </Badge>
                      <span className="order-exchange">{order.exchange}</span>
                      <Badge
                        variant={getStatusColor(order.status)}
                        tone="soft"
                        className="uppercase"
                      >
                        {order.status}
                      </Badge>
                    </div>
                    <div className="order-account">{order.accountName}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const account = accountsToShow.find(a => a._id === order.accountId);
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

                <div className="order-details">
                  <div className="detail-row">
                    <span className="detail-label">Type:</span>
                    <span
                      className={`detail-value ${order.transactionType.toLowerCase() === 'buy' ? 'buy-text' : 'sell-text'}`}
                    >
                      {order.transactionType} {order.orderType}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Qty:</span>
                    <span className="detail-value">{order.quantity}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Price:</span>
                    <span className="detail-value">
                      {order.price > 0 ? formatCurrency(order.price) : 'Market'}
                    </span>
                  </div>
                  {order.averagePrice > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">Avg:</span>
                      <span className="detail-value">{formatCurrency(order.averagePrice)}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Filled:</span>
                    <span className="detail-value">
                      {order.filledQuantity}/{order.quantity}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status:</span>
                    <span className="detail-value">
                      <Badge
                        variant={getStatusColor(order.status)}
                        tone="soft"
                        className="uppercase"
                      >
                        {order.status}
                      </Badge>
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
