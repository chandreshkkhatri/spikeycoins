'use client';

import { Button } from '@/components/ui/button';
import { IAccount } from '@/models/account';
import { useState } from 'react';

interface AccountCardProps {
  account: IAccount;
  onEdit: (account: IAccount) => void;
  onDelete: (accountId: string) => void;
  onAuth: (accountId: string) => void;
}

const accountTypeLabels = {
  kite: 'Zerodha Kite',
  upstox: 'Upstox',
  binance: 'Binance',
};

const accountTypeColors = {
  kite: '#4CAF50',
  upstox: '#FF9800',
  binance: '#FFC107',
};

const getConnectButtonText = (accountType: string, account?: IAccount) => {
  switch (accountType) {
    case 'binance':
      return 'Validate API';
    case 'upstox':
      // Different text for sandbox vs production Upstox accounts
      return account?.metadata?.sandbox === true ? 'Add Token' : 'Authorize';
    case 'kite':
      return 'Login';
    default:
      return 'Connect';
  }
};

export default function AccountCard({ account, onEdit, onDelete, onAuth }: AccountCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);

  const handleAuth = async () => {
    setIsLoading(true);
    try {
      await onAuth(account._id!);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDebugUpstox = async () => {
    if (account.accountType !== 'upstox') return;

    setIsDebugging(true);
    try {
      const response = await fetch('/api/debug/upstox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: account._id }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('=== Upstox Debug Results ===');
        console.log('Account:', data.account);
        console.log('Debug Info:', data.debugInfo);
        alert(
          `Debug completed! Check console for detailed results.\n\nEnvironment: ${data.debugInfo.environment}\nAPI Key Valid: ${data.debugInfo.apiKeyValid}\nRedirect URI Valid: ${data.debugInfo.redirectUriValid}`
        );
      } else {
        alert(`Debug failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Debug error:', error);
      alert(`Debug failed: ${error.message}`);
    } finally {
      setIsDebugging(false);
    }
  };

  // For Binance accounts, check if we have API credentials and they're working
  // For other accounts, check if we have access token
  const isAuthenticated =
    account.accountType === 'binance'
      ? !!(account.apiKey && account.apiSecret && account.lastSyncAt)
      : !!account.accessToken;

  const lastSync = account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : 'Never';

  return (
    <div className="account-card">
      <div className="account-header">
        <div
          className="account-type-badge"
          style={{ backgroundColor: accountTypeColors[account.accountType] }}
        >
          {accountTypeLabels[account.accountType]}
        </div>
        <div className="account-status">
          <span className={`status-indicator ${isAuthenticated ? 'active' : 'inactive'}`}>
            {isAuthenticated ? '●' : '○'}
          </span>
          <span className="status-text">{isAuthenticated ? 'Connected' : 'Not Connected'}</span>
        </div>
      </div>

      <div className="account-info">
        <h3 className="account-name">{account.accountName}</h3>
        <div className="account-details">
          <div className="detail-item">
            <span className="detail-label">API Key:</span>
            <span className="detail-value">{account.apiKey.substring(0, 8)}...</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Last Sync:</span>
            <span className="detail-value">{lastSync}</span>
          </div>
        </div>
      </div>

      <div className="account-actions">
        {!isAuthenticated && (
          <Button variant="trading" size="sm" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Connecting...' : getConnectButtonText(account.accountType, account)}
          </Button>
        )}

        {isAuthenticated && account.accountType === 'binance' && (
          <Button variant="secondary" size="sm" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Validating...' : 'Validate API'}
          </Button>
        )}

        {isAuthenticated && account.accountType === 'upstox' && !account.metadata?.sandbox && (
          <Button variant="secondary" size="sm" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Re-authenticating...' : 'Re-authenticate'}
          </Button>
        )}

        {account.accountType === 'upstox' && (
          <Button variant="outline" size="sm" onClick={handleDebugUpstox} disabled={isDebugging}>
            {isDebugging ? 'Debugging...' : '🔍 Debug Config'}
          </Button>
        )}

        <div className="action-buttons">
          <Button variant="secondary" size="icon" onClick={() => onEdit(account)}>
            ✎
          </Button>
          <Button variant="danger" size="icon" onClick={() => onDelete(account._id!)}>
            ×
          </Button>
        </div>
      </div>

      <style jsx>{`
        .account-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          border: 2px solid #f0f0f0;
          transition: all 0.3s ease;
        }

        .account-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
          border-color: #e0e0e0;
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .account-type-badge {
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .account-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
        }

        .status-indicator {
          font-size: 1.2rem;
        }

        .status-indicator.active {
          color: #4caf50;
        }

        .status-indicator.inactive {
          color: #f44336;
        }

        .status-text {
          font-weight: 500;
          color: #666;
        }

        .account-info {
          margin-bottom: 20px;
        }

        .account-name {
          font-size: 1.3rem;
          font-weight: 700;
          color: #333;
          margin: 0 0 12px 0;
        }

        .account-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-label {
          font-size: 0.9rem;
          color: #666;
          font-weight: 500;
        }

        .detail-value {
          font-size: 0.9rem;
          color: #333;
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .account-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          border-top: 1px solid #f0f0f0;
          padding-top: 16px;
          flex-wrap: wrap;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }
        /* Legacy .btn-* styles removed (migrated to shared Button) */

        @media (max-width: 768px) {
          .account-card {
            padding: 16px;
          }

          .account-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .account-actions {
            flex-direction: column;
            gap: 12px;
          }

          /* Removed legacy .btn-auth responsive rule */
        }
      `}</style>
    </div>
  );
}
