'use client';

import { Button } from '@/components/ui/button';
import { ChevronDown, Search, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  instrument_type?: string;
  segment?: string;
  token?: string;
  isin?: string;
}

interface SymbolSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (item: SymbolSearchResult) => void;
  accountType: string;
  anchorRect?: {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
  };
}

const SymbolSearchModal = memo(function SymbolSearchModal({
  isOpen,
  onClose,
  onSelectSymbol,
  accountType,
  anchorRect,
}: SymbolSearchModalProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<string>('ALL');
  const [selectedSegment, setSelectedSegment] = useState<string>('ALL');
  const [showExchangeDropdown, setShowExchangeDropdown] = useState(false);
  const [showSegmentDropdown, setShowSegmentDropdown] = useState(false);

  const exchanges = ['ALL', 'NSE', 'BSE', 'MCX'];
  const segments = [
    'ALL',
    'NSE_EQ',
    'BSE_EQ',
    'NSE_FO',
    'BSE_FO',
    'MCX_FO',
    'BCD_FO',
    'NCD_FO',
    'NSE_INDEX',
    'BSE_INDEX',
    'NSE_COM',
  ];

  const searchSymbols = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let queryParams = `query=${encodeURIComponent(searchQuery)}&vendor=${accountType}`;
      if (selectedExchange !== 'ALL') queryParams += `&exchange=${selectedExchange}`;
      if (selectedSegment !== 'ALL')
        queryParams += `&segment=${encodeURIComponent(selectedSegment)}`;

      const response = await fetch(`/api/search/symbols?${queryParams}`);
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results);
      } else {
        setError(data.error || 'Failed to search symbols');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Error searching symbols:', err);
      setError('Failed to search symbols');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [accountType, searchQuery, selectedExchange, selectedSegment]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => searchSymbols(), 500);
    return () => clearTimeout(t);
  }, [searchQuery, selectedExchange, selectedSegment, searchSymbols]);

  const handleSelectSymbol = (item: SymbolSearchResult) => {
    onSelectSymbol(item);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  if (!isOpen || !isClient) return null;

  const anchoredStyle: React.CSSProperties | undefined = anchorRect
    ? (() => {
        const margin = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const maxWidth = 650;
        const contentWidth = Math.min(maxWidth, vw - margin * 2);
        const estH = Math.min(0.85 * vh, 600);

        let top = anchorRect.bottom + margin + window.scrollY;
        let left = anchorRect.left + window.scrollX;

        // Clamp horizontally using computed content width
        if (left + contentWidth > vw - margin) {
          left = Math.max(margin, vw - contentWidth - margin) + window.scrollX;
        }

        // If not enough space below, open above
        if (top + estH > window.scrollY + vh - margin) {
          top = anchorRect.top - estH - margin + window.scrollY;
          if (top < window.scrollY + margin) {
            top = window.scrollY + margin;
          }
        }

        return { position: 'absolute', top, left, width: contentWidth } as React.CSSProperties;
      })()
    : undefined;

  const modal = (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 2147483647 }}
    >
      <div className="modal-content" style={anchoredStyle} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Symbol to Watchlist</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="search-container">
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              placeholder={`Search ${accountType} symbols...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>

          {(accountType === 'upstox' || accountType === 'kite') && (
            <div className="filter-container">
              <div className="filter-dropdown">
                <button
                  className="filter-button"
                  onClick={() => {
                    setShowExchangeDropdown(!showExchangeDropdown);
                    setShowSegmentDropdown(false);
                  }}
                >
                  <span>Exchange: {selectedExchange}</span>
                  <ChevronDown size={16} />
                </button>
                {showExchangeDropdown && (
                  <div className="dropdown-menu">
                    {exchanges.map(exchange => (
                      <div
                        key={exchange}
                        className={`dropdown-item ${selectedExchange === exchange ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedExchange(exchange);
                          setShowExchangeDropdown(false);
                        }}
                      >
                        {exchange}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="filter-dropdown">
                <button
                  className="filter-button"
                  onClick={() => {
                    setShowSegmentDropdown(!showSegmentDropdown);
                    setShowExchangeDropdown(false);
                  }}
                >
                  <span>Segment: {selectedSegment}</span>
                  <ChevronDown size={16} />
                </button>
                {showSegmentDropdown && (
                  <div className="dropdown-menu">
                    {segments.map(segment => (
                      <div
                        key={segment}
                        className={`dropdown-item ${selectedSegment === segment ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSegment(segment);
                          setShowSegmentDropdown(false);
                        }}
                      >
                        {segment}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}
        {loading && <div className="loading-state">Searching symbols...</div>}

        {!loading && searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map(result => (
              <div
                key={result.symbol}
                className="search-result-item"
                onClick={() => handleSelectSymbol(result)}
              >
                <div className="symbol-info">
                  <div className="symbol-name">{result.symbol}</div>
                  <div className="symbol-details">{result.name}</div>
                  <div className="symbol-meta">
                    {result.exchange}
                    {result.segment && ` • ${result.segment}`}
                    {result.instrument_type && ` • ${result.instrument_type}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && searchQuery.length >= 2 && searchResults.length === 0 && (
          <div className="no-results">No symbols found matching "{searchQuery}"</div>
        )}

        {searchQuery.length < 2 && <div className="hint">Type at least 2 characters to search</div>}

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            z-index: 2147483647; /* max */
          }

          .modal-content {
            background: white;
            border-radius: 10px;
            width: ${anchorRect ? 'auto' : '90%'};
            max-width: 650px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            animation: slideIn 0.2s ease;
            margin: 0 auto; /* when not anchored */
            position: ${anchorRect ? 'absolute' : 'relative'};
            top: ${anchorRect ? 'auto' : '3vh'};
            z-index: 2147483646;
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          :global(.dark) .modal-content {
            background: #18181b;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 18px;
            border-bottom: 1px solid #e5e5e5;
            background: #fafafa;
            border-radius: 10px 10px 0 0;
          }

          :global(.dark) .modal-header {
            border-bottom-color: #3f3f46;
            background: #09090b;
          }
          .modal-header h2 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: #111;
          }
          :global(.dark) .modal-header h2 {
            color: #ffffff;
          }

          .search-container {
            padding: 14px 18px;
            border-bottom: 1px solid #f0f0f0;
          }
          :global(.dark) .search-container {
            border-bottom-color: #27272a;
          }

          .search-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
          }
          .search-icon {
            position: absolute;
            left: 10px;
            color: #9ca3af;
          }
          .search-input {
            width: 100%;
            padding: 10px 10px 10px 36px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            font-size: 0.9rem;
            background: #ffffff;
            color: #111;
            outline: none;
            transition: all 0.2s;
          }
          :global(.dark) .search-input {
            background: #27272a;
            border-color: #3f3f46;
            color: #ffffff;
          }
          .search-input:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
          }
          :global(.dark) .search-input:focus {
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
          }

          .filter-container {
            display: flex;
            gap: 8px;
            margin-top: 10px;
          }
          .filter-dropdown {
            position: relative;
            flex: 1;
          }
          .filter-button {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            font-size: 0.8rem;
            color: #374151;
            cursor: pointer;
            transition: all 0.2s;
          }
          :global(.dark) .filter-button {
            background: #27272a;
            border-color: #3f3f46;
            color: #d1d5db;
          }
          .filter-button:hover {
            background: #e5e7eb;
            border-color: #d1d5db;
          }
          :global(.dark) .filter-button:hover {
            background: #3f3f46;
            border-color: #52525b;
          }

          .dropdown-menu {
            position: absolute;
            top: calc(100% + 2px);
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 100;
            max-height: 150px;
            overflow-y: auto;
          }
          :global(.dark) .dropdown-menu {
            background: #27272a;
            border-color: #3f3f46;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          .dropdown-item {
            padding: 6px 10px;
            cursor: pointer;
            transition: background-color 0.15s;
            font-size: 0.8rem;
          }
          .dropdown-item:hover {
            background: #f9fafb;
          }
          :global(.dark) .dropdown-item:hover {
            background: #3f3f46;
          }
          .dropdown-item.selected {
            background: #dbeafe;
            font-weight: 600;
            color: #1e40af;
          }
          :global(.dark) .dropdown-item.selected {
            background: #1e3a8a;
            color: #93c5fd;
          }

          .error-message {
            margin: 0 18px;
            padding: 8px 12px;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            color: #dc2626;
            font-size: 0.8rem;
            font-weight: 500;
          }
          :global(.dark) .error-message {
            background: rgba(220, 38, 38, 0.1);
            border-color: rgba(220, 38, 38, 0.3);
            color: #fca5a5;
          }

          .loading-state {
            padding: 30px;
            text-align: center;
            color: #6b7280;
            font-size: 0.85rem;
          }
          :global(.dark) .loading-state {
            color: #9ca3af;
          }

          .search-results {
            flex: 1;
            overflow-y: auto;
            max-height: calc(85vh - 150px);
            scrollbar-width: thin;
            scrollbar-color: #e5e7eb transparent;
          }
          :global(.dark) .search-results {
            scrollbar-color: #3f3f46 transparent;
          }
          .search-results::-webkit-scrollbar {
            width: 6px;
          }
          .search-results::-webkit-scrollbar-track {
            background: transparent;
          }
          .search-results::-webkit-scrollbar-thumb {
            background: #e5e7eb;
            border-radius: 3px;
          }
          :global(.dark) .search-results::-webkit-scrollbar-thumb {
            background: #3f3f46;
          }

          .search-result-item {
            padding: 10px 18px;
            border-bottom: 1px solid #f3f4f6;
            cursor: pointer;
            transition: all 0.15s;
          }
          :global(.dark) .search-result-item {
            border-bottom-color: #27272a;
          }
          .search-result-item:hover {
            background: #f9fafb;
            padding-left: 22px;
          }
          :global(.dark) .search-result-item:hover {
            background: #27272a;
          }

          .symbol-info {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }
          .symbol-name {
            font-weight: 600;
            color: #111827;
            font-size: 0.9rem;
          }
          :global(.dark) .symbol-name {
            color: #f9fafb;
          }
          .symbol-details {
            font-size: 0.8rem;
            color: #4b5563;
            line-height: 1.3;
          }
          :global(.dark) .symbol-details {
            color: #9ca3af;
          }
          .symbol-meta {
            font-size: 0.7rem;
            color: #9ca3af;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          :global(.dark) .symbol-meta {
            color: #6b7280;
          }

          .no-results,
          .hint {
            padding: 24px;
            text-align: center;
            color: #666;
            font-size: 0.8rem;
          }
          :global(.dark) .no-results,
          :global(.dark) .hint {
            color: #a1a1aa;
          }

          @media (max-width: 768px) {
            .modal-content {
              width: 92%;
              max-height: 80vh;
            }
            .modal-header {
              padding: 12px 16px;
            }
            .search-container {
              padding: 12px 16px;
            }
            .filter-container {
              gap: 6px;
              margin-top: 8px;
            }
            .filter-button {
              padding: 5px 8px;
              font-size: 0.75rem;
            }
            .search-result-item {
              padding: 8px 16px;
            }
            .symbol-name {
              font-size: 0.85rem;
            }
            .symbol-details {
              font-size: 0.75rem;
            }
            .symbol-meta {
              font-size: 0.65rem;
            }
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
});

export default SymbolSearchModal;
