'use client';

import EnhancedCard from '@/components/enhanced-card';
import FundsCard from '@/components/funds/FundsCard';
import PageLayout from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/lib/auth-context';
import { API_ROUTES } from '@/lib/constants';
import { IAccount } from '@/models/account';
import axios from 'axios';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [loading, setLoading] = useState(false); // Start as false for immediate rendering
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const { isLoggedIn, allowOfflineAccess, checkedLoginStatus, runOfflineMode } = useAuth();

  // Simplified loading logic - no artificial delays
  useEffect(() => {
    // Show loading only if auth status is still being checked and we don't have cached data
    if (!checkedLoginStatus) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [checkedLoginStatus]);

  const fetchAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const userId = 'default_user';
      const response = await axios.get(`${API_ROUTES.accounts.getAccounts}?userId=${userId}`);

      if (response.data?.success) {
        setAccounts(response.data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    // Allow offline access by default for the dashboard
    if (checkedLoginStatus && !isLoggedIn && !allowOfflineAccess) {
      // Auto-enable offline mode instead of redirecting to login
      runOfflineMode();
    }
  }, [isLoggedIn, allowOfflineAccess, checkedLoginStatus, runOfflineMode]);

  useEffect(() => {
    // Fetch accounts immediately when auth status is checked
    // Don't wait for specific auth states since we support offline mode
    if (checkedLoginStatus) {
      fetchAccounts();
    }
  }, [checkedLoginStatus]);

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <>
      <PageLayout title="Flip Safe">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Trading Dashboard</h1>
          <p className="dashboard-subtitle">Welcome to Flip Safe - Your Unified Trading Platform</p>
        </div>

        {/* Funds Overview */}
        {accounts.length > 0 && <FundsCard accounts={accounts} className="funds-overview" />}

        {/* Feature Cards */}
        <div className="feature-grid">
          <EnhancedCard
            title="Market Watch"
            description="Monitor your favorite instruments in real-time"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/market-watch">View Market</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Orders"
            description="View and manage your trading orders"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/orders">View Orders</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Positions"
            description="Track your current trading positions"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/positions">View Positions</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Holdings"
            description="Manage your investment portfolio"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/holdings">View Holdings</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Alerts"
            description="Set up price alerts and notifications"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/alerts">Manage Alerts</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Simulator"
            description="Practice trading with historical data"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/simulator">Open Simulator</Link>
              </Button>
            }
          />

          <EnhancedCard
            title="Account Management"
            description="Connect and manage multiple trading accounts"
            hoverable
            action={
              <Button asChild size="sm" variant="trading">
                <Link href="/accounts">Manage Accounts</Link>
              </Button>
            }
          />
        </div>

        {/* Status Information */}
        <EnhancedCard title="Connection Status">
          <div className="status-info">
            <div className="status-item">
              <strong>Mode:</strong>{' '}
              <Badge variant={isLoggedIn ? 'success' : 'warning'} tone="soft">
                {isLoggedIn ? 'Live Trading' : 'Offline Mode'}
              </Badge>
            </div>
            {!isLoggedIn && allowOfflineAccess && (
              <div className="status-warning">
                ⚠️ You are in offline mode. Some features may be limited.
              </div>
            )}
          </div>
        </EnhancedCard>
      </PageLayout>

      <style jsx>{`
        .dashboard-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .dashboard-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #2196f3, #1976d2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .dashboard-subtitle {
          font-size: 1.1rem;
          color: #666;
          margin: 0;
        }

        .funds-overview {
          margin-top: 24px;
          margin-bottom: 64px;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
          padding-top: 32px;
        }

        .status-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Status badge styles migrated to shared Badge component */

        .status-warning {
          padding: 12px;
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 6px;
          color: #856404;
        }

        @media only screen and (max-width: 768px) {
          .dashboard-title {
            font-size: 2rem;
          }

          .feature-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
      `}</style>
    </>
  );
}
