import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';
import EnhancedCard from '@/components/enhanced-card';
import FundsCard from '@/components/funds/FundsCard';
import PageLayout from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/lib/auth-context';
import { API_ROUTES } from '@/lib/constants';

interface IAccount {
  _id: string;
  accountName: string;
  accountType: string;
  isActive: boolean;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const { isLoggedIn, allowOfflineAccess, loading: authLoading } = useAuth();

  const fetchAccounts = async () => {
    try {
      const userId = 'default_user';
      const response = await axios.get(`${API_ROUTES.accounts.getAccounts}?userId=${userId}`);

      if (response.data?.success) {
        setAccounts(response.data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      setLoading(false);
      fetchAccounts();
    }
  }, [authLoading]);

  if (loading || authLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <PageLayout title="Flip Safe">
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 700, 
          marginBottom: '8px',
          background: 'linear-gradient(135deg, #2196f3, #1976d2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Trading Dashboard
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#666' }}>
          Welcome to Flip Safe - Your Unified Trading Platform
        </p>
      </div>

      {accounts.length > 0 && <FundsCard accounts={accounts} className="mb-16" />}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        marginBottom: '32px',
        paddingTop: '32px'
      }}>
        <EnhancedCard
          title="Market Watch"
          description="Monitor your favorite instruments in real-time"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/market-watch">View Market</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Orders"
          description="View and manage your trading orders"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/orders">View Orders</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Positions"
          description="Track your current trading positions"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/positions">View Positions</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Holdings"
          description="Manage your investment portfolio"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/holdings">View Holdings</Link>
            </Button>
          }
        />

        <EnhancedCard
          title="Account Management"
          description="Connect and manage multiple trading accounts"
          hoverable
          action={
            <Button asChild size="sm" variant="trading">
              <Link to="/accounts">Manage Accounts</Link>
            </Button>
          }
        />
      </div>

      <EnhancedCard title="Connection Status">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong>Mode:</strong>
            <Badge variant={isLoggedIn ? 'success' : 'warning'} tone="soft">
              {isLoggedIn ? 'Live Trading' : 'Offline Mode'}
            </Badge>
          </div>
          {!isLoggedIn && allowOfflineAccess && (
            <div style={{
              padding: '12px',
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '6px',
              color: '#856404'
            }}>
              ⚠️ You are in offline mode. Some features may be limited.
            </div>
          )}
        </div>
      </EnhancedCard>
    </PageLayout>
  );
}
