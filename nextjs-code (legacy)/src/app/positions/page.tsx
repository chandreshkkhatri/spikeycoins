'use client';

import PageLayout from '@/components/layout/PageLayout';
import PositionsCard from '@/components/positions/PositionsCard';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { useEffect } from 'react';

export default function PositionsPage() {
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
      <PageLayout title="Positions">
        <div className="page-header">
          <h1>Positions</h1>
          <p>Track your current trading positions</p>
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
      <PageLayout title="Positions">
        <div className="page-header">
          <h1>Positions</h1>
          <p>Track your current trading positions</p>
        </div>

        {/* Show positions card with the selected account from context */}
        <PositionsCard
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
          color: #f97316;
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

        .product-badge {
          background: #2196f3;
          color: white;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 500;
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
      `}</style>
    </>
  );
}
