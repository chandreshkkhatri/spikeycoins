'use client';

import AccountCard from '@/components/accounts/AccountCard';
import EditAccountModal from '@/components/accounts/EditAccountModal';
import RadixAccountModal from '@/components/accounts/RadixAccountModal';
import EnhancedCard from '@/components/enhanced-card';
import PageLayout from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { IAccount } from '@/models/account';
import { useEffect, useState } from 'react';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<IAccount | null>(null);

  // Mock user ID - in a real app, this would come from auth context
  const userId = 'default_user';

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounts?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      } else {
        setError(data.error || 'Failed to fetch accounts');
      }
    } catch (error) {
      // eslint-disable-next-line no-console -- temporary surface
      console.error('Error fetching accounts:', error);
      setError('Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (accountData: {
    accountType: 'kite' | 'upstox' | 'binance';
    accountName: string;
    apiKey: string;
    apiSecret: string;
    redirectUri?: string;
  }) => {
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          ...accountData,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await fetchAccounts(); // Refresh accounts list
        setShowAddModal(false);
      } else {
        throw new Error(data.error || 'Failed to create account');
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error creating account:', error);
      // eslint-disable-next-line no-alert
      alert(error.message || 'Failed to create account');
    }
  };

  const handleEditAccount = (account: IAccount) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleSaveAccount = async (accountId: string, updates: Partial<IAccount>) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (data.success) {
        await fetchAccounts(); // Refresh accounts list
        setShowEditModal(false);
        setEditingAccount(null);
      } else {
        throw new Error(data.error || 'Failed to update account');
      }
    } catch (error: any) {
      console.error('Error updating account:', error);
      alert(error.message || 'Failed to update account');
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    // eslint-disable-next-line no-alert -- replace with modal confirm
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }

    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        await fetchAccounts(); // Refresh accounts list
      } else {
        throw new Error(data.error || 'Failed to delete account');
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error deleting account:', error);
      // eslint-disable-next-line no-alert
      alert(error.message || 'Failed to delete account');
    }
  };

  const handleAuthAccount = async (accountId: string) => {
    try {
      // Find the account to determine its type
      const account = accounts.find(acc => acc._id === accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      let authEndpoint = '';

      // Route to correct authentication endpoint based on account type
      switch (account.accountType) {
        case 'upstox':
          // Check if this is a sandbox account
          if (account.metadata?.sandbox === true) {
            authEndpoint = '/api/auth/upstox/sandbox-token';
          } else {
            authEndpoint = '/api/auth/upstox/login';
          }
          break;
        case 'binance':
          authEndpoint = '/api/auth/binance/validate';
          break;
        case 'kite':
          authEndpoint = '/api/auth/kite/login';
          break;
        default:
          throw new Error(`Unsupported account type: ${account.accountType}`);
      }

      const requestBody: any = { accountId };

      // For sandbox token authentication, include the token
      if (
        account.accountType === 'upstox' &&
        account.metadata?.sandbox === true &&
        authEndpoint.includes('sandbox-token')
      ) {
        const token = prompt(
          'Upstox Sandbox Authentication:\n\n' +
            'For sandbox accounts, please generate an access token directly from your Upstox Developer Portal:\n' +
            '1. Go to your Upstox Developer Apps page\n' +
            '2. Navigate to your sandbox app\n' +
            '3. Click "Generate" to create a new access token\n' +
            '4. Copy the generated token and paste it below:\n\n' +
            'Enter your sandbox access token:'
        );

        if (!token || !token.trim()) {
          throw new Error('Access token is required for sandbox authentication');
        }

        requestBody.accessToken = token.trim();
      }

      const response = await fetch(authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        if (data.loginUrl && account.accountType !== 'binance') {
          // Redirect to broker's OAuth page (for Upstox/Kite only)
          window.location.href = data.loginUrl;
        } else {
          // Direct validation successful (for Binance) or OAuth success
          await fetchAccounts();

          // Use a more user-friendly notification instead of alert
          const accountTypeName =
            account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1);

          // For Binance, show validation success message
          if (account.accountType === 'binance') {
            console.log(`✅ ${accountTypeName} API credentials validated successfully!`);
            // You could replace this with a toast notification or inline message
            alert(`✅ ${accountTypeName} API credentials validated successfully!`);
          } else {
            alert(`${accountTypeName} account authenticated successfully!`);
          }
        }
      } else {
        throw new Error(data.error || 'Failed to initiate authentication');
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Error authenticating account:', error);
      // eslint-disable-next-line no-alert
      const accountType = accounts.find(acc => acc._id === accountId)?.accountType;
      alert(error.message || `Failed to authenticate ${accountType || 'account'}`);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading accounts..." />;
  }

  return (
    <PageLayout title="Account Management">
      <div className="accounts-page">
        <div className="page-header">
          <div className="header-content">
            <h1>Trading Accounts</h1>
            <p>Manage your connected trading accounts and credentials</p>
          </div>
          <Button onClick={() => setShowAddModal(true)} variant="trading" size="lg">
            + Add Account
          </Button>
        </div>

        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}

        {accounts.length === 0 ? (
          <EnhancedCard>
            <div className="empty-state">
              <div className="empty-icon">📱</div>
              <h3>No Trading Accounts</h3>
              <p>
                Connect your first trading account to start managing your portfolio across multiple
                brokers.
              </p>
              <Button onClick={() => setShowAddModal(true)} variant="success" size="lg">
                Add Your First Account
              </Button>
            </div>
          </EnhancedCard>
        ) : (
          <div className="accounts-grid">
            {accounts.map(account => (
              <AccountCard
                key={account._id}
                account={account}
                onEdit={handleEditAccount}
                onDelete={handleDeleteAccount}
                onAuth={handleAuthAccount}
              />
            ))}
          </div>
        )}

        {/* Account Statistics */}
        {accounts.length > 0 && (
          <div className="account-stats">
            <EnhancedCard title="Account Overview">
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{accounts.length}</div>
                  <div className="stat-label">Total Accounts</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{accounts.filter(acc => acc.accessToken).length}</div>
                  <div className="stat-label">Connected</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {accounts.filter(acc => acc.accountType === 'upstox').length}
                  </div>
                  <div className="stat-label">Upstox</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {accounts.filter(acc => acc.accountType === 'kite').length}
                  </div>
                  <div className="stat-label">Kite</div>
                </div>
              </div>
            </EnhancedCard>
          </div>
        )}

        <RadixAccountModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddAccount}
        />

        <EditAccountModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingAccount(null);
          }}
          account={editingAccount}
          onSave={handleSaveAccount}
        />
      </div>

      <style jsx>{`
        .accounts-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
        }

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #333;
        }

        :global(.dark) .header-content h1 {
          color: #ffffff !important;
        }

        .header-content p {
          font-size: 1.1rem;
          color: #666;
          margin: 0;
        }

        :global(.dark) .header-content p {
          color: #a1a1aa !important;
        }

        /* Removed legacy .btn-add-account styles (using shared Button) */

        .error-message {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          color: #856404;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }

        .empty-state h3 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #333;
          margin: 0 0 12px 0;
        }

        :global(.dark) .empty-state h3 {
          color: #ffffff !important;
        }

        .empty-state p {
          font-size: 1rem;
          color: #666;
          margin: 0 0 24px 0;
          max-width: 400px;
          margin-left: auto;
          margin-right: auto;
        }

        :global(.dark) .empty-state p {
          color: #a1a1aa !important;
        }

        /* Removed legacy .btn-get-started styles (using shared Button) */

        .accounts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }

        .account-stats {
          margin-top: 32px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 20px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: #2196f3;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #666;
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 20px;
          }

          .header-content h1 {
            font-size: 2rem;
          }

          .accounts-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
        }
      `}</style>
    </PageLayout>
  );
}
