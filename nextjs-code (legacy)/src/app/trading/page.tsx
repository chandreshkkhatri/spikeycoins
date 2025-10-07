'use client';

import PageLayout from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import TradingWindow from '@/components/watchlist/TradingWindow';
import { useAccount } from '@/lib/account-context';
import { useAuth } from '@/lib/auth-context';
import { binanceWebSocket } from '@/lib/binance-websocket';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface WatchlistItem {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export default function TradingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const symbol = searchParams.get('symbol') || 'BTCUSDT';

  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceData, setPriceData] = useState<WatchlistItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn, allowOfflineAccess, runOfflineMode } = useAuth();
  const { selectedAccount, accounts: binanceAccounts } = useAccount();

  // Handle offline mode
  useEffect(() => {
    if (!isLoggedIn && !allowOfflineAccess) {
      runOfflineMode();
    }
  }, [isLoggedIn, allowOfflineAccess]);

  // Set up WebSocket for real-time price updates
  useEffect(() => {
    const initializePriceData = async () => {
      try {
        setLoading(true);

        // Initialize with default data
        const initialData: WatchlistItem = {
          symbol,
          lastPrice: 0,
          priceChange: 0,
          priceChangePercent: 0,
          volume: 0,
          high24h: 0,
          low24h: 0,
        };

        setPriceData(initialData);
        setCurrentPrice(0);

        // Start WebSocket connection for real-time updates
        binanceWebSocket.connect([symbol], priceUpdate => {
          if (priceUpdate.symbol === symbol) {
            const newPrice = parseFloat(priceUpdate.price);
            setCurrentPrice(newPrice);

            setPriceData(prev => {
              if (!prev) return null;
              return {
                ...prev,
                lastPrice: newPrice,
                priceChange: newPrice * (parseFloat(priceUpdate.priceChangePercent) / 100),
                priceChangePercent: parseFloat(priceUpdate.priceChangePercent),
                volume: parseFloat(priceUpdate.volume),
                high24h: parseFloat(priceUpdate.high),
                low24h: parseFloat(priceUpdate.low),
              };
            });
          }
        });

        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize trading page:', error);
        setLoading(false);
      }
    };

    initializePriceData();

    return () => {
      binanceWebSocket.disconnect();
    };
  }, [symbol]);

  const handleOrderPlaced = () => {
    // Could show success notification here
    console.log('Order placed successfully');
  };

  const handleBackToMarketWatch = () => {
    router.push('/market-watch');
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading trading interface...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (binanceAccounts.length === 0) {
    return (
      <PageLayout>
        <div className="trading-page-container">
          <div className="trading-header">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToMarketWatch}
              className="back-button"
            >
              ← Back to Market Watch
            </Button>
            <h1>Trading - {symbol}</h1>
          </div>

          <div className="no-accounts-message">
            <div className="message-content">
              <h2>No Binance Accounts Found</h2>
              <p>You need to connect a Binance account to start trading.</p>
              <Button variant="default" onClick={() => router.push('/accounts')}>
                Add Binance Account
              </Button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="trading-page-container">
        <div className="trading-header">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToMarketWatch}
            className="back-button"
          >
            ← Back to Market Watch
          </Button>
          <div className="header-info">
            <h1>Trading - {symbol}</h1>
            {priceData && (
              <div className="price-info">
                <span className="current-price">${currentPrice.toFixed(4)}</span>
                <span
                  className={`price-change ${priceData.priceChangePercent >= 0 ? 'positive' : 'negative'}`}
                >
                  {priceData.priceChangePercent >= 0 ? '+' : ''}
                  {priceData.priceChangePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="trading-content">
          <TradingWindow
            symbol={symbol}
            currentPrice={currentPrice}
            binanceAccounts={selectedAccount ? [selectedAccount] : binanceAccounts}
            onOrderPlaced={handleOrderPlaced}
          />
        </div>
      </div>

      <style jsx>{`
        .trading-page-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .trading-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding: 16px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        :global(.dark) .trading-header {
          background: #18181b !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .back-button {
          font-size: 0.9rem;
          color: #666;
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 6px;
          transition: background-color 0.2s ease;
        }

        .back-button:hover {
          background-color: #f5f5f5;
          color: #333;
        }

        :global(.dark) .back-button {
          color: #a1a1aa !important;
        }

        :global(.dark) .back-button:hover {
          background-color: #27272a !important;
          color: #ffffff !important;
        }

        .header-info {
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .trading-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #333;
          margin: 0;
        }

        :global(.dark) .trading-header h1 {
          color: #ffffff !important;
        }

        .price-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .current-price {
          font-size: 1.2rem;
          font-weight: 600;
          color: #333;
        }

        :global(.dark) .current-price {
          color: #ffffff !important;
        }

        .price-change {
          font-size: 0.9rem;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .price-change.positive {
          color: #16a34a;
          background: rgba(22, 163, 74, 0.1);
        }

        .price-change.negative {
          color: #dc2626;
          background: rgba(220, 38, 38, 0.1);
        }

        .trading-content {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        :global(.dark) .trading-content {
          background: #18181b !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .no-accounts-message {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        :global(.dark) .no-accounts-message {
          background: #18181b !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .message-content {
          text-align: center;
          padding: 32px;
        }

        .message-content h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        :global(.dark) .message-content h2 {
          color: #ffffff !important;
        }

        .message-content p {
          color: #666;
          margin-bottom: 16px;
          font-size: 1rem;
        }

        :global(.dark) .message-content p {
          color: #a1a1aa !important;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .trading-page-container {
            padding: 12px;
          }

          .trading-header {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
            padding: 12px;
          }

          .header-info {
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
          }

          .price-info {
            justify-content: center;
          }

          .trading-header h1 {
            font-size: 1.3rem;
            text-align: center;
          }

          .back-button {
            align-self: flex-start;
          }

          .account-selection {
            margin-left: 0;
            align-self: stretch;
          }

          .account-selector-wrapper {
            justify-content: center;
          }
        }
      `}</style>
    </PageLayout>
  );
}
