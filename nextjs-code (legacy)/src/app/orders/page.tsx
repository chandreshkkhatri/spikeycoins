'use client';

import PageLayout from '@/components/layout/PageLayout';
import OrdersCard from '@/components/orders/OrdersCard';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { Users } from 'lucide-react';

export default function OrdersPage() {
  const { isLoggedIn, allowOfflineAccess, runOfflineMode } = useAuth();
  const { selectedAccount, accounts } = useAccount();

  if (!isLoggedIn && !allowOfflineAccess) {
    runOfflineMode();
  }

  return (
    <>
      <PageLayout title="Orders">
        <div className="page-header">
          <h1>Orders</h1>
          <p>View and manage your trading orders</p>
        </div>

        {!selectedAccount ? (
          /* No Account Selected State */
          <div className="empty-state-container">
            <div className="empty-state">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-10 h-10 text-gray-600" />
              </div>
              <h2>Select Your Account</h2>
              <p className="empty-description">
                Choose a trading account from the header dropdown to view your order history and
                manage active orders.
              </p>
              <div className="mt-4 text-sm text-gray-500">
                {accounts.length > 0
                  ? `Found ${accounts.length} connected account${accounts.length > 1 ? 's' : ''}`
                  : 'No accounts found. Add an account to get started.'}
              </div>
            </div>
          </div>
        ) : (
          /* Account Selected - Show Orders Card */
          <OrdersCard accounts={accounts} selectedAccountId={selectedAccount._id} />
        )}
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
      `}</style>
    </>
  );
}
