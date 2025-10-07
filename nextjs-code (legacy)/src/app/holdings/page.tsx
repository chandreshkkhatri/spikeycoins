'use client';

import HoldingsCard from '@/components/holdings/HoldingsCard';
import PageLayout from '@/components/layout/PageLayout';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';

export default function HoldingsPage() {
  const { isLoggedIn, allowOfflineAccess, runOfflineMode } = useAuth();
  const { accounts, selectedAccount, loadingAccounts, fetchAccounts } = useAccount();

  useEffect(() => {
    if (!isLoggedIn && !allowOfflineAccess) {
      runOfflineMode();
    }
    // Fetch accounts if not already loaded
    if (accounts.length === 0 && !loadingAccounts) {
      fetchAccounts();
    }
  }, [isLoggedIn, allowOfflineAccess, runOfflineMode, accounts, loadingAccounts, fetchAccounts]);

  // Filter only Upstox and Kite accounts
  const tradingAccounts = accounts.filter(
    acc => acc.isActive && (acc.accountType === 'upstox' || acc.accountType === 'kite')
  );

  if (loadingAccounts) {
    return (
      <PageLayout title="Holdings">
        <div className="page-header">
          <h1>Portfolio Holdings</h1>
          <p>Manage your investment portfolio</p>
        </div>
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading accounts...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <>
      <PageLayout title="Holdings">
        <div className="page-header">
          <h1>Portfolio Holdings</h1>
          <p>Manage your investment portfolio</p>
        </div>

        {/* Show holdings card with the selected account from context */}
        <HoldingsCard
          accounts={selectedAccount ? [selectedAccount] : tradingAccounts}
          selectedAccountId={selectedAccount?._id}
          className="mt-6"
        />
      </PageLayout>

      <style jsx>{`
        .page-header {
          margin-bottom: 16px;
          text-align: center;
        }

        .page-header h1 {
          font-size: 1.8rem;
          font-weight: 600;
          margin-bottom: 4px;
          color: #333;
        }

        :global(.dark) .page-header h1 {
          color: #ffffff !important;
        }

        .page-header p {
          font-size: 0.9rem;
          color: #666;
          margin: 0;
        }

        :global(.dark) .page-header p {
          color: #a1a1aa !important;
        }

        .empty-state-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 40px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid #e5e5e5;
          margin: 20px 0;
        }

        :global(.dark) .empty-state-container {
          background: #18181b !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          border: 1px solid #3f3f46 !important;
        }

        .empty-state {
          text-align: center;
          max-width: 500px;
        }

        .empty-state h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #333;
          margin: 0 0 12px 0;
        }

        :global(.dark) .empty-state h2 {
          color: #ffffff !important;
        }

        .empty-description {
          font-size: 1rem;
          color: #666;
          margin: 0 0 20px 0;
          line-height: 1.5;
        }

        :global(.dark) .empty-description {
          color: #a1a1aa !important;
        }

        .empty-state-features {
          display: flex;
          gap: 24px;
          justify-content: center;
          margin: 20px 0;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
          font-size: 0.9rem;
        }

        :global(.dark) .feature-item {
          color: #a1a1aa !important;
        }

        .feature-icon {
          color: #3b82f6;
        }

        .binance-summary {
          margin-bottom: 32px;
          padding: 24px;
          background: var(--card);
          border-radius: 12px;
          border: 1px solid var(--border);
        }

        .binance-summary h2 {
          margin: 0 0 16px 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .binance-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .assets-breakdown h3 {
          margin: 0 0 12px 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .assets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }

        .asset-item {
          padding: 12px;
          background: var(--muted);
          border-radius: 8px;
          text-align: center;
        }

        .asset-symbol {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--foreground);
          margin-bottom: 4px;
        }

        .asset-balance {
          font-size: 0.8rem;
          color: var(--muted-foreground);
          margin-bottom: 2px;
        }

        .asset-usd {
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--foreground);
        }

        .funds-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--muted-foreground);
          font-size: 0.9rem;
        }

        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--muted);
          border-top: 2px solid var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .portfolio-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .summary-card {
          text-align: center;
        }

        .summary-item {
          color: white;
          padding: 6px;
        }

        .summary-label {
          font-size: 0.75rem;
          opacity: 0.9;
          margin-bottom: 4px;
        }

        .summary-value {
          font-size: 1.2rem;
          font-weight: 600;
        }

        .error-message {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          padding: 10px;
          margin-bottom: 12px;
          color: #856404;
          font-size: 0.85rem;
        }

        .symbol-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .symbol-name {
          font-weight: 600;
          font-size: 0.85rem;
        }

        .exchange {
          font-size: 0.7rem;
          color: #666;
        }

        .pnl-value {
          font-weight: 600;
          font-size: 0.85rem;
        }

        .pnl-value.positive {
          color: #4caf50;
        }

        .pnl-value.negative {
          color: #f44336;
        }

        .account-badge {
          background: #e3f2fd;
          color: #1976d2;
          padding: 1px 4px;
          border-radius: 6px;
          font-size: 0.65rem;
          font-weight: 600;
          text-align: center;
          width: fit-content;
          margin: 1px 0;
        }

        @media only screen and (max-width: 768px) {
          .portfolio-summary {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .summary-value {
            font-size: 1rem;
          }
        }
      `}</style>
    </>
  );
}
