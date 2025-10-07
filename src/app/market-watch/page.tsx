'use client';

import PageLayout from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import Watchlist from '@/components/watchlist/Watchlist';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { Activity, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Funds data interface (migrated from funds-service)
interface FundsData {
  totalWalletBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  availableBalance: number;
  maxWithdrawAmount: number;
  assets: Array<{
    asset: string;
    walletBalance: number;
    unrealizedProfit: number;
    marginBalance: number;
    availableBalance: number;
    usdValue?: number;
  }>;
  totalUsdValue: number;
}

// Tip banner removed

export default function MarketWatchPage() {
  const router = useRouter();
  // Tip banner removed
  const [fundsData, setFundsData] = useState<FundsData | null>(null);
  const [fundsLoading, setFundsLoading] = useState(true);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [marketType, setMarketType] = useState('binance-futures');
  const { isLoggedIn, allowOfflineAccess, runOfflineMode } = useAuth();
  const {
    selectedAccount,
    setSelectedAccount,
    accounts,
    loadingAccounts: accountsLoading,
  } = useAccount();

  // Update market type based on selected account
  useEffect(() => {
    if (selectedAccount) {
      switch (selectedAccount.accountType) {
        case 'binance':
          setMarketType('binance-futures');
          break;
        case 'upstox':
          setMarketType('upstox-equity');
          break;
        case 'kite':
          setMarketType('kite-equity');
          break;
        default:
          setMarketType('binance-futures');
      }
    }
  }, [selectedAccount]);

  // Tip banner removed

  // Handle offline mode
  useEffect(() => {
    if (!isLoggedIn && !allowOfflineAccess) {
      runOfflineMode();
    }
  }, [isLoggedIn, allowOfflineAccess, runOfflineMode]);

  // Fetch funds when selected account changes
  useEffect(() => {
    const fetchFunds = async () => {
      if (selectedAccount) {
        try {
          setFundsLoading(true);
          setFundsError(null);

          // Use the new unified funds API with correct vendor
          const vendor = selectedAccount.accountType;
          const response = await fetch(
            `/api/funds?vendor=${vendor}&accountId=${selectedAccount._id}`
          );
          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.error || result.details || 'Failed to fetch funds');
          }

          // Extract and process the funds data based on vendor
          const rawData = result.data.details;
          let fundsData: FundsData;

          if (vendor === 'binance') {
            // Binance-specific processing
            const assetSymbols = rawData.assets?.map((asset: any) => asset.asset).join(',') || '';
            const priceResponse = await fetch(`/api/binance/prices?symbols=${assetSymbols}`);
            const priceData = await priceResponse.json();
            const prices = priceData.success ? priceData.prices : {};

            const assetsWithUsdValue =
              rawData.assets?.map((asset: any) => {
                const price = prices[asset.asset] || 0;
                const walletBalance = parseFloat(asset.walletBalance || 0);
                const usdValue = walletBalance * price;

                return {
                  asset: asset.asset,
                  walletBalance: walletBalance,
                  unrealizedProfit: parseFloat(asset.unrealizedProfit || 0),
                  marginBalance: parseFloat(asset.marginBalance || 0),
                  availableBalance: parseFloat(asset.availableBalance || 0),
                  usdValue,
                };
              }) || [];

            const totalUsdValue = assetsWithUsdValue.reduce(
              (total: number, asset: any) => total + asset.usdValue,
              0
            );

            fundsData = {
              totalWalletBalance: parseFloat(rawData.totalWalletBalance || 0),
              totalMarginBalance: parseFloat(rawData.totalMarginBalance || 0),
              totalUnrealizedProfit: parseFloat(rawData.totalUnrealizedProfit || 0),
              availableBalance: parseFloat(rawData.availableBalance || 0),
              maxWithdrawAmount: parseFloat(rawData.maxWithdrawAmount || 0),
              assets: assetsWithUsdValue,
              totalUsdValue,
            };
          } else {
            // For Upstox/Kite - use direct values from result.data
            const totalBalance = parseFloat(result.data.totalBalance || 0);
            const availableBalance = parseFloat(result.data.availableBalance || 0);
            const unrealizedPnl = parseFloat(result.data.unrealizedPnl || 0);

            fundsData = {
              totalWalletBalance: totalBalance,
              totalMarginBalance: 0,
              totalUnrealizedProfit: unrealizedPnl,
              availableBalance: availableBalance,
              maxWithdrawAmount: availableBalance,
              assets: [],
              totalUsdValue: totalBalance, // For Indian markets, assume INR is the base
            };
          }

          setFundsData(fundsData);
        } catch (error: any) {
          console.error('Error fetching funds:', error);
          // Provide more specific error messages
          if (error.message?.includes('Invalid API')) {
            setFundsError(
              'Invalid API credentials. Please check your Binance API keys in the Accounts page.'
            );
          } else if (error.message?.includes('IP not whitelisted')) {
            setFundsError(
              'IP not whitelisted. Please add your IP to the API key whitelist in Binance.'
            );
          } else if (error.message?.includes('permissions')) {
            setFundsError(
              'Insufficient API permissions. Please enable Futures trading for your API key.'
            );
          } else {
            setFundsError(error.message || 'Failed to fetch account balance');
          }
        } finally {
          setFundsLoading(false);
        }
      } else if (accounts.length === 0) {
        // No accounts found
        setFundsLoading(false);
        setFundsError('No trading accounts found. Please add an account in the Accounts page.');
      } else {
        // Accounts exist but none selected
        setFundsLoading(false);
        setFundsData(null);
        setFundsError(null);
      }
    };

    fetchFunds();
  }, [selectedAccount, accounts]);

  // Helper function to get currency symbol based on account type
  const getCurrencySymbol = (accountType?: string) => {
    switch (accountType) {
      case 'binance':
        return '$';
      case 'upstox':
      case 'kite':
        return '₹';
      default:
        return '$';
    }
  };

  return (
    <PageLayout>
      <div className="market-watch-container">
        {/* Tip banner removed */}

        <div className="main-content">
          {/* Watchlist Section or Market Overview */}
          <div className="watchlist-section">
            {selectedAccount ? (
              <Watchlist
                accounts={accounts}
                selectedAccount={selectedAccount}
                marketType={marketType}
              />
            ) : (
              <div className="no-account-view">
                {accounts.length === 0 ? (
                  /* No Accounts Available */
                  <div className="empty-state">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Activity className="w-10 h-10 text-blue-600" />
                    </div>
                    <h2>Welcome to Market Watch</h2>
                    <p className="empty-description">
                      Connect your trading account to start monitoring your personalized watchlist
                      with real-time market data.
                    </p>

                    <div className="features-grid">
                      <div className="feature-card">
                        <TrendingUp className="feature-icon" size={24} />
                        <h3>Real-time Data</h3>
                        <p>Live price updates and market movements for your selected symbols</p>
                      </div>
                      <div className="feature-card">
                        <Users className="feature-icon" size={24} />
                        <h3>Personalized Watchlist</h3>
                        <p>Create custom watchlists for each of your trading accounts</p>
                      </div>
                      <div className="feature-card">
                        <ShieldCheck className="feature-icon" size={24} />
                        <h3>Secure Trading</h3>
                        <p>Your API keys are encrypted and secure</p>
                      </div>
                    </div>

                    <Button
                      size="lg"
                      variant="default"
                      onClick={() => router.push('/accounts')}
                      className="cta-button mt-6"
                    >
                      Add Trading Account
                    </Button>
                  </div>
                ) : (
                  /* Accounts Available but None Selected */
                  <div className="empty-state">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Users className="w-10 h-10 text-gray-600" />
                    </div>
                    <h2>Select Your Account</h2>
                    <p className="empty-description">
                      Choose an account from the dropdown above to view your personalized watchlist
                      and start trading.
                    </p>

                    <div className="select-account-prompt">
                      <p>👆 Select an account from the dropdown above to get started</p>
                    </div>

                    <div className="mt-6 text-sm text-gray-500">
                      Found {accounts.length} connected account
                      {accounts.length > 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .market-watch-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
            height: 100%;
            padding-top: 0;
          }

          /* Make the page content fill the viewport and remove bottom padding */
          :global(.page-layout .main-content) {
            margin-top: 4px; /* very small gap */
            padding-bottom: 0;
            height: calc(100vh - 60px); /* 56px navbar + 4px gap */
            display: flex;
            align-items: stretch;
          }

          /* Use full width for this page (override default max-width) */
          :global(.page-layout .container) {
            max-width: none;
            width: 100%;
            height: 100%;
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            min-height: 0; /* allow children to flex */
          }

          /* Tip banner removed */

          .main-content {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0; /* enable child to stretch */
          }

          .watchlist-section {
            flex: 1;
            min-height: 0;
          }

          .no-account-view {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 360px;
            padding: 28px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }

          :global(.dark) .no-account-view {
            background: #18181b !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }

          .empty-state {
            text-align: center;
            max-width: 600px;
          }

          .empty-icon {
            color: #3b82f6;
            margin-bottom: 24px;
          }

          .empty-state h2 {
            font-size: 2rem;
            font-weight: 600;
            color: #333;
            margin: 0 0 16px 0;
          }

          :global(.dark) .empty-state h2 {
            color: #ffffff !important;
          }

          .empty-description {
            font-size: 1.1rem;
            color: #666;
            margin: 0 0 40px 0;
            line-height: 1.6;
          }

          :global(.dark) .empty-description {
            color: #a1a1aa !important;
          }

          .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
          }

          .feature-card {
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
            border: 1px solid #e5e5e5;
          }

          :global(.dark) .feature-card {
            background: #27272a !important;
            border: 1px solid #3f3f46 !important;
          }

          .feature-icon {
            color: #3b82f6;
            margin-bottom: 12px;
          }

          .feature-card h3 {
            font-size: 1rem;
            font-weight: 600;
            color: #333;
            margin: 0 0 8px 0;
          }

          :global(.dark) .feature-card h3 {
            color: #ffffff !important;
          }

          .feature-card p {
            font-size: 0.9rem;
            color: #666;
            margin: 0;
            line-height: 1.4;
          }

          :global(.dark) .feature-card p {
            color: #a1a1aa !important;
          }

          .cta-button {
            margin-top: 20px;
          }

          .select-account-prompt {
            padding: 16px;
            background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
            border-radius: 12px;
            margin-top: 20px;
          }

          :global(.dark) .select-account-prompt {
            background: linear-gradient(135deg, #1e3a8a, #1e40af) !important;
          }

          .select-account-prompt p {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 500;
            color: #1e40af;
          }

          :global(.dark) .select-account-prompt p {
            color: #93c5fd !important;
          }

          /* Mobile Responsive */
          @media (max-width: 1024px) {
            .features-grid {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 768px) {
            /* Override PageLayout spacing for mobile market watch */
            :global(.page-layout .main-content) {
              margin-top: 4px;
              padding-bottom: 0;
              height: calc(100vh - 60px); /* 56px navbar + 4px gap */
            }

            :global(.page-layout .container) {
              padding: 0 0.75rem;
            }

            /* Tip banner removed */

            .no-account-view {
              padding: 20px;
              min-height: 320px;
            }

            .empty-state h2 {
              font-size: 1.5rem;
            }

            .empty-description {
              font-size: 1rem;
            }

            .features-grid {
              gap: 16px;
            }
          }
        `}</style>
      </div>
    </PageLayout>
  );
}
