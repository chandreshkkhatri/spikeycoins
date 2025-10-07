'use client';

import { Button } from '@/components/ui/button';
import { binanceWebSocket } from '@/lib/binance-websocket';
import { upstoxWebSocket } from '@/lib/upstox-websocket';
import { ChevronDown, Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import SymbolSearchModal from './SymbolSearchModal';
import TradingWindow from './TradingWindow';

export interface WatchlistItem {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
}

interface WatchlistProps {
  accounts: Array<{
    _id: string;
    accountName: string;
    accountType: 'binance' | 'kite' | 'upstox';
    isActive: boolean;
  }>;
  selectedAccount?: {
    _id: string;
    accountName: string;
    accountType: 'binance' | 'kite' | 'upstox';
    isActive: boolean;
  } | null;
  marketType?: string;
}

const Watchlist = memo(function Watchlist({
  accounts,
  selectedAccount,
  marketType = 'binance-futures',
}: WatchlistProps) {
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistItemsData, setWatchlistItemsData] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [watchlists, setWatchlists] = useState<
    Array<{ id: string; name: string; isDefault: boolean }>
  >([]);
  const [currentWatchlistId, setCurrentWatchlistId] = useState<string | null>(null);
  const [currentWatchlistName, setCurrentWatchlistName] = useState<string>('Default Watchlist');
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [showSymbolSearchModal, setShowSymbolSearchModal] = useState(false);
  const [addAnchorRect, setAddAnchorRect] = useState<{
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
  } | null>(null);

  const currentPrice = watchlistItems.find(item => item.symbol === selectedSymbol)?.lastPrice || 0;

  // Track previous account to avoid unnecessary disconnects on watchlist changes
  const prevAccountIdRef = useRef<string | null>(null);
  const prevAccountTypeRef = useRef<'binance' | 'kite' | 'upstox' | null>(null);
  const shouldDisconnectRef = useRef<boolean>(false);

  // Fetch watchlist symbols from database when account changes
  useEffect(() => {
    // Determine if the trading account actually changed
    const prevId = prevAccountIdRef.current;
    const prevType = prevAccountTypeRef.current;
    const currId = selectedAccount?._id || null;
    const currType = selectedAccount?.accountType || null;
    const accountChanged = prevId !== currId || prevType !== currType;
    shouldDisconnectRef.current = accountChanged;

    const fetchWatchlistSymbols = async () => {
      if (!selectedAccount) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch symbols from API based on selected account and market
        const url = currentWatchlistId
          ? `/api/watchlist/symbols?accountId=${selectedAccount._id}&marketType=${marketType}&watchlistId=${currentWatchlistId}`
          : `/api/watchlist/symbols?accountId=${selectedAccount._id}&marketType=${marketType}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
          // Update watchlists
          if (data.watchlists) {
            setWatchlists(data.watchlists);
          }

          // Update current watchlist info
          if (data.watchlist) {
            setCurrentWatchlistId(data.watchlist.id);
            setCurrentWatchlistName(data.watchlist.name);
          }

          // Use items if available (new format), fallback to symbols
          const items = data.items || [];
          const symbols = data.symbols || [];

          if (symbols.length > 0) {
            setWatchlistSymbols(symbols);
            setWatchlistItemsData(items); // Store full item data

            // Initialize watchlist items
            const initialData: WatchlistItem[] = symbols.map((symbol: string) => ({
              symbol,
              lastPrice: 0,
              priceChange: 0,
              priceChangePercent: 0,
              volume: 0,
              high24h: 0,
              low24h: 0,
            }));

            setWatchlistItems(initialData);
            if (symbols.length > 0 && !selectedSymbol) {
              setSelectedSymbol(symbols[0]);
            }

            // Start WebSocket connection for real-time updates
            if (selectedAccount?.accountType === 'binance') {
              binanceWebSocket.connect(symbols, priceUpdate => {
                setWatchlistItems(prev =>
                  prev.map(item => {
                    if (item.symbol === priceUpdate.symbol) {
                      return {
                        ...item,
                        lastPrice: parseFloat(priceUpdate.price),
                        priceChange:
                          parseFloat(priceUpdate.price) *
                          (parseFloat(priceUpdate.priceChangePercent) / 100),
                        priceChangePercent: parseFloat(priceUpdate.priceChangePercent),
                        volume: parseFloat(priceUpdate.volume),
                        high24h: parseFloat(priceUpdate.high),
                        low24h: parseFloat(priceUpdate.low),
                      };
                    }
                    return item;
                  })
                );
              });
            } else if (selectedAccount?.accountType === 'upstox') {
              // Upstox: connect via v3 websocket using accountId and 'ltpc' for light feed in watchlist
              upstoxWebSocket.connect(
                symbols,
                priceUpdate => {
                  setWatchlistItems(prev =>
                    prev.map(item => {
                      if (item.symbol === priceUpdate.symbol) {
                        return {
                          ...item,
                          lastPrice: priceUpdate.lastPrice,
                          priceChange: priceUpdate.priceChange,
                          priceChangePercent: priceUpdate.priceChangePercent,
                          volume: priceUpdate.volume,
                          high24h: priceUpdate.high24h,
                          low24h: priceUpdate.low24h,
                        };
                      }
                      return item;
                    })
                  );
                },
                { accountId: selectedAccount._id, mode: 'ltpc' }
              );
            }
          } else {
            // No symbols in watchlist
            setWatchlistItems([]);
            setWatchlistSymbols([]);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch watchlist symbols:', err);
        setError('Failed to load watchlist data');
        setWatchlistItems([]);
        setLoading(false);
      }
    };

    fetchWatchlistSymbols();

    // Cleanup WebSocket on component unmount or account change
    return () => {
      if (!shouldDisconnectRef.current) return;
      if (prevAccountTypeRef.current === 'binance') {
        binanceWebSocket.disconnect();
      } else if (prevAccountTypeRef.current === 'upstox') {
        upstoxWebSocket.disconnect();
      }
    };
    // We intentionally exclude selectedSymbol to avoid reconnecting the feed on selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, marketType, currentWatchlistId]);

  // After each effect run, update previous account refs
  useEffect(() => {
    prevAccountIdRef.current = selectedAccount?._id || null;
    prevAccountTypeRef.current = selectedAccount?.accountType || null;
  }, [selectedAccount]);

  const addSymbol = async (item: { symbol: string; name?: string; exchange?: string; token?: string; segment?: string; instrument_type?: string; isin?: string }) => {
    // Check if symbol already exists
    if (watchlistSymbols.includes(item.symbol)) {
      setError(`${item.symbol} is already in your watchlist`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Add to local state
    const newSymbols = [...watchlistSymbols, item.symbol];
    setWatchlistSymbols(newSymbols);

    // Add to watchlist items with initial values
    setWatchlistItems(prev => [
      ...prev,
      {
        symbol: item.symbol,
        lastPrice: 0,
        priceChange: 0,
        priceChangePercent: 0,
        volume: 0,
        high24h: 0,
        low24h: 0,
      },
    ]);

    // If no symbol selected, select the new one
    if (!selectedSymbol) {
      setSelectedSymbol(item.symbol);
    }

    // Save to database with full item data
    if (selectedAccount) {
      try {
        // Use existing items data if available, or create minimal items
        const currentItems = watchlistItemsData.length > 0
          ? watchlistItemsData
          : watchlistItems.map(wi => ({
              symbol: wi.symbol,
            }));

        // Add new item with full details
        const newItems = [
          ...currentItems,
          {
            symbol: item.symbol,
            name: item.name,
            exchange: item.exchange,
            token: item.token,
            segment: item.segment,
            instrument_type: item.instrument_type,
            isin: item.isin,
          },
        ];

        // Update local state with new items data
        setWatchlistItemsData(newItems);

        const body: any = {
          accountId: selectedAccount._id,
          marketType,
          items: newItems, // Changed from symbols to items
        };

        if (currentWatchlistId) {
          body.watchlistId = currentWatchlistId;
        }

        await fetch('/api/watchlist/symbols', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // Add to WebSocket subscription
        if (selectedAccount.accountType === 'binance') {
          binanceWebSocket.addSymbol(item.symbol);
        } else if (selectedAccount.accountType === 'upstox') {
          upstoxWebSocket.addSymbol(item.symbol);
        }
      } catch (err) {
        console.error('Failed to add symbol to watchlist:', err);
        setError('Failed to add symbol to watchlist');
        // Revert on error
        setWatchlistSymbols(prev => prev.filter(s => s !== item.symbol));
        setWatchlistItems(prev => prev.filter(wi => wi.symbol !== item.symbol));
      }
    }
  };

  const removeSymbol = async (symbol: string) => {
    setWatchlistItems(prev => prev.filter(item => item.symbol !== symbol));
    setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
    // Remove from WebSocket subscription
    if (selectedAccount?.accountType === 'binance') {
      binanceWebSocket.removeSymbol(symbol);
    } else if (selectedAccount?.accountType === 'upstox') {
      upstoxWebSocket.removeSymbol(symbol);
    }
    if (selectedSymbol === symbol && watchlistItems.length > 1) {
      setSelectedSymbol(watchlistItems.find(item => item.symbol !== symbol)?.symbol || '');
    }

    // Save to database with items
    if (selectedAccount) {
      try {
        // Filter out the removed symbol from items data
        const remainingItems = watchlistItemsData.filter(item => item.symbol !== symbol);

        // Update local state
        setWatchlistItemsData(remainingItems);

        const body: any = {
          accountId: selectedAccount._id,
          marketType,
          items: remainingItems, // Changed from symbols to items
        };

        if (currentWatchlistId) {
          body.watchlistId = currentWatchlistId;
        }

        await fetch('/api/watchlist/symbols', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error('Failed to remove symbol from watchlist:', err);
      }
    }
  };

  const switchWatchlist = useCallback((watchlistId: string, watchlistName: string) => {
    setCurrentWatchlistId(watchlistId);
    setCurrentWatchlistName(watchlistName);
    setShowWatchlistDropdown(false);
  }, []);

  const handleOrderPlaced = useCallback(() => {
    // Handle order placed event - could refresh data, show notification, etc.
    console.log('Order placed successfully');
  }, []);

  if (loading) {
    return (
      <div className="watchlist-container">
        <div className="loading-state">Loading market data...</div>
      </div>
    );
  }

  if (accounts.length === 0 || !selectedAccount) {
    return (
      <div className="watchlist-container">
        <div className="no-accounts">
          <h3>Market Watch</h3>
          <p>Select an account to view your watchlist</p>
          {accounts.length === 0 && (
            <Button
              variant="trading"
              size="sm"
              onClick={() => (window.location.href = '/accounts')}
            >
              Add Trading Account
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-container">
      <div className="watchlist-panel">
        <div className="watchlist-header">
          <div className="watchlist-title-row">
            <div
              className="watchlist-selector"
              onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
            >
              <span className="watchlist-name">{currentWatchlistName}</span>
              <ChevronDown size={16} />
            </div>
            {showWatchlistDropdown && (
              <div className="watchlist-dropdown">
                {watchlists.map(wl => (
                  <div
                    key={wl.id}
                    className={`dropdown-item ${wl.id === currentWatchlistId ? 'active' : ''}`}
                    onClick={() => switchWatchlist(wl.id, wl.name)}
                  >
                    {wl.name}
                    {wl.isDefault && <span className="default-badge">Default</span>}
                  </div>
                ))}
                <div className="dropdown-divider"></div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAddAnchorRect({
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              });
              setShowSymbolSearchModal(true);
            }}
            title="Add Symbol"
          >
            <Plus size={18} />
          </Button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {watchlistItems.length === 0 && !loading && (
          <div className="empty-watchlist">
            <p>No symbols in your watchlist</p>
            <p className="hint">Click "+ Add" to add symbols</p>
          </div>
        )}

        <div className="watchlist-items">
          {watchlistItems.map(item => (
            <div
              key={item.symbol}
              className={`watchlist-item ${selectedSymbol === item.symbol ? 'selected' : ''}`}
              onClick={() => setSelectedSymbol(item.symbol)}
            >
              <div className="symbol-row">
                <div className="symbol-info">
                  <span className="symbol-name">{item.symbol}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={e => {
                      e.stopPropagation();
                      removeSymbol(item.symbol);
                    }}
                  >
                    ×
                  </Button>
                </div>
                <div className="price-info">
                  <span className="last-price">
                    {selectedAccount?.accountType === 'binance'
                      ? `$${item.lastPrice.toFixed(2)}`
                      : selectedAccount?.accountType === 'upstox' ||
                          selectedAccount?.accountType === 'kite'
                        ? `₹${item.lastPrice.toFixed(2)}`
                        : item.lastPrice.toFixed(2)}
                  </span>
                  <span
                    className={`price-change ${item.priceChange >= 0 ? 'positive' : 'negative'}`}
                  >
                    {item.priceChange >= 0 ? '+' : ''}
                    {item.priceChangePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="volume-info">Vol: {(item.volume / 1000000).toFixed(2)}M</div>
            </div>
          ))}
        </div>
      </div>

      <div className="trading-panel">
        <TradingWindow
          symbol={selectedSymbol}
          currentPrice={currentPrice}
          accounts={accounts}
          onOrderPlaced={handleOrderPlaced}
        />
      </div>

      {/* Symbol Search Modal */}
      {showSymbolSearchModal && selectedAccount && (
        <SymbolSearchModal
          isOpen={showSymbolSearchModal}
          onClose={() => setShowSymbolSearchModal(false)}
          onSelectSymbol={addSymbol}
          accountType={selectedAccount.accountType}
          anchorRect={addAnchorRect || undefined}
        />
      )}

      <style jsx>{`
        .watchlist-container {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 16px;
          height: 100%;
          min-height: 0;
          background: #ffffff;
          color: #000000;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        :global(.dark) .watchlist-container {
          background: #18181b !important;
          color: #ffffff !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #666;
          font-size: 0.9rem;
        }

        .no-accounts {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 32px;
          text-align: center;
        }

        .no-accounts h3 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 1.2rem;
        }

        .no-accounts p {
          margin: 0 0 16px 0;
          color: #666;
          font-size: 0.9rem;
        }

        .watchlist-panel {
          border-right: 1px solid #e9ecef;
          display: flex;
          flex-direction: column;
          background: #ffffff;
        }

        :global(.dark) .watchlist-panel {
          border-right: 1px solid #27272a !important;
          background: #18181b !important;
        }

        .watchlist-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
          background: #f8f9fa;
          color: #333;
          gap: 8px;
        }

        :global(.dark) .watchlist-header {
          border-bottom: 1px solid #27272a !important;
          background: #09090b !important;
          color: #ffffff !important;
        }

        .watchlist-title-row {
          position: relative;
          flex: 1;
        }

        .watchlist-selector {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .watchlist-selector:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        :global(.dark) .watchlist-selector:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .watchlist-name {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--foreground);
        }

        .watchlist-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          min-width: 200px;
          z-index: 100;
        }

        :global(.dark) .watchlist-dropdown {
          background: #27272a;
          border-color: #3f3f46;
        }

        .dropdown-item {
          padding: 10px 16px;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
        }

        .dropdown-item:hover {
          background: #f3f4f6;
        }

        :global(.dark) .dropdown-item:hover {
          background: #3f3f46;
        }

        .dropdown-item.active {
          background: #e0f2fe;
          font-weight: 500;
        }

        :global(.dark) .dropdown-item.active {
          background: #1e3a8a;
        }

        .dropdown-divider {
          height: 1px;
          background: #e5e5e5;
          margin: 4px 0;
        }

        :global(.dark) .dropdown-divider {
          background: #3f3f46;
        }

        .default-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          background: #3b82f6;
          color: white;
          border-radius: 4px;
          margin-left: auto;
        }

        .error-message {
          background: #fff3cd;
          color: #856404;
          padding: 8px 16px;
          border-bottom: 1px solid #ffeaa7;
          font-size: 0.8rem;
        }

        .empty-watchlist {
          padding: 32px 16px;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        }

        :global(.dark) .empty-watchlist {
          color: #a1a1aa;
        }

        .empty-watchlist .hint {
          margin-top: 8px;
          font-size: 0.85rem;
          color: #999;
        }

        :global(.dark) .empty-watchlist .hint {
          color: #71717a;
        }

        .watchlist-items {
          flex: 1;
          overflow-y: auto;
        }

        .watchlist-item {
          padding: 8px 16px;
          border-bottom: 1px solid #f1f3f4;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .watchlist-item:hover {
          background: #f8f9fa;
        }

        .watchlist-item.selected {
          background: #e3f2fd;
          border-left: 3px solid #2196f3;
        }

        .symbol-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .symbol-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .symbol-name {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--foreground);
        }

        .price-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .last-price {
          font-weight: 600;
          font-size: 0.8rem;
          color: var(--foreground);
        }

        .price-change {
          font-size: 0.7rem;
          font-weight: 500;
        }

        .price-change.positive {
          color: #4caf50;
        }

        .price-change.negative {
          color: #f44336;
        }

        .volume-info {
          font-size: 0.7rem;
          color: var(--muted-foreground);
        }

        .trading-panel {
          background: #fafafa;
          color: #333;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          height: 100%;
        }

        :global(.dark) .trading-panel {
          background: #09090b !important;
          color: #ffffff !important;
        }

        /* Tablet view */
        @media (max-width: 1024px) {
          .watchlist-container {
            grid-template-columns: 250px 1fr;
          }
        }

        /* Mobile view */
        @media (max-width: 768px) {
          .watchlist-container {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
            height: 100%;
            min-height: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .watchlist-panel {
            border-right: none;
            border-bottom: 2px solid #e9ecef;
            max-height: 40vh;
            position: sticky;
            top: 0;
            z-index: 10;
            background: white;
          }

          .watchlist-items {
            max-height: 30vh;
            overflow-y: auto;
          }

          .trading-panel {
            min-height: 0;
            max-height: none;
          }

          .watchlist-header {
            padding: 10px 12px;
            position: sticky;
            top: 0;
            z-index: 1;
          }

          .watchlist-header h3 {
            font-size: 0.95rem;
          }

          .watchlist-item {
            padding: 10px 12px;
          }

          .symbol-name {
            font-size: 0.9rem;
          }

          .last-price {
            font-size: 0.85rem;
          }

          .price-change {
            font-size: 0.75rem;
          }

          .volume-info {
            font-size: 0.75rem;
          }
        }

        /* Small mobile view */
        @media (max-width: 480px) {
          .watchlist-container {
            gap: 0;
          }

          .watchlist-panel {
            max-height: 35vh;
          }

          .watchlist-items {
            max-height: 25vh;
          }

          .watchlist-header {
            padding: 8px 10px;
          }

          .watchlist-item {
            padding: 8px 10px;
          }

          .symbol-info {
            gap: 4px;
          }

          .price-info {
            gap: 2px;
          }
        }
      `}</style>
    </div>
  );
});

export default Watchlist;
