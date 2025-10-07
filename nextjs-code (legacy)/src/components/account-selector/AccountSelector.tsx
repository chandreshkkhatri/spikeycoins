'use client';

import { Button } from '@/components/ui/button';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: 'binance' | 'kite' | 'upstox';
  isActive: boolean;
  accessToken?: string;
}

interface AccountSelectorProps {
  accounts: TradingAccount[];
  selectedAccount: TradingAccount | null;
  onAccountSelect: (account: TradingAccount) => void;
  loading?: boolean;
}

export default function AccountSelector({
  accounts,
  selectedAccount,
  onAccountSelect,
  loading = false,
}: AccountSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAccountSelect = (account: TradingAccount) => {
    onAccountSelect(account);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="account-selector-loading">
        <div className="loading-spinner"></div>
        <span>Loading accounts...</span>
      </div>
    );
  }

  // Only show "no accounts" state when we're definitely not loading and have no accounts
  if (accounts.length === 0) {
    return (
      <div className="no-accounts">
        <span>No accounts found</span>
        <Button size="sm" variant="outline" onClick={() => (window.location.href = '/accounts')}>
          Add Account
        </Button>
      </div>
    );
  }

  return (
    <div className="account-selector" ref={dropdownRef}>
      <Button variant="outline" onClick={() => setIsOpen(!isOpen)} className="selector-button">
        <div className="selected-account">
          <span className="account-type">
            {selectedAccount
              ? selectedAccount.accountType === 'binance'
                ? '🟡'
                : selectedAccount.accountType === 'kite'
                  ? '🟠'
                  : selectedAccount.accountType === 'upstox'
                    ? '🔵'
                    : '🔗'
              : '🔗'}
          </span>
          <span className="account-name">
            {selectedAccount ? selectedAccount.accountName : 'Select Account'}
          </span>
        </div>
        <ChevronDown className={`chevron ${isOpen ? 'open' : ''}`} size={16} />
      </Button>

      {isOpen && (
        <div className="dropdown-menu">
          {accounts.map(account => (
            <div
              key={account._id}
              className={`dropdown-item ${selectedAccount?._id === account._id ? 'selected' : ''}`}
              onClick={() => handleAccountSelect(account)}
            >
              <div className="account-info">
                <span className="account-type">
                  {account.accountType === 'binance'
                    ? '🟡'
                    : account.accountType === 'kite'
                      ? '🟠'
                      : account.accountType === 'upstox'
                        ? '🔵'
                        : '🔗'}
                </span>
                <div className="account-details">
                  <span className="account-name">{account.accountName}</span>
                  <span className="account-type-text">
                    {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1)}
                  </span>
                </div>
              </div>
              {selectedAccount?._id === account._id && <Check size={16} className="check-icon" />}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .account-selector {
          position: relative;
          display: inline-block;
        }

        .account-selector-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          color: #666;
          font-size: 0.9rem;
        }

        :global(.dark) .account-selector-loading {
          color: #a1a1aa;
        }

        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e5e5e5;
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        :global(.dark) .loading-spinner {
          border: 2px solid #3f3f46;
          border-top: 2px solid #3b82f6;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .no-accounts {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          color: #666;
          font-size: 0.9rem;
        }

        :global(.dark) .no-accounts {
          color: #a1a1aa;
        }

        .selector-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 200px;
          padding: 8px 12px;
          gap: 8px;
        }

        .selected-account {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .account-type {
          font-size: 16px;
        }

        .account-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }

        .chevron {
          transition: transform 0.2s ease;
          color: #666;
        }

        :global(.dark) .chevron {
          color: #a1a1aa;
        }

        .chevron.open {
          transform: rotate(180deg);
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 50;
          overflow: hidden;
          margin-top: 4px;
        }

        :global(.dark) .dropdown-menu {
          background: #18181b;
          border: 1px solid #3f3f46;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .dropdown-item:hover {
          background: #f8f9fa;
        }

        :global(.dark) .dropdown-item:hover {
          background: #27272a;
        }

        .dropdown-item.selected {
          background: #f0f9ff;
        }

        :global(.dark) .dropdown-item.selected {
          background: #1e3a8a;
        }

        .account-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .account-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .account-details .account-name {
          font-weight: 500;
          color: #333;
          font-size: 0.9rem;
        }

        :global(.dark) .account-details .account-name {
          color: #ffffff;
        }

        .account-type-text {
          font-size: 0.8rem;
          color: #666;
        }

        :global(.dark) .account-type-text {
          color: #a1a1aa;
        }

        .check-icon {
          color: #3b82f6;
        }
      `}</style>
    </div>
  );
}
