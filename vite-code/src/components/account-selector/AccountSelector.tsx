import "./AccountSelector.css";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TradingAccount {
  _id: string;
  accountName: string;
  accountType: "binance" | "kite" | "upstox";
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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => (window.location.href = "/accounts")}
        >
          Add Account
        </Button>
      </div>
    );
  }

  return (
    <div className="account-selector" ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="selector-button"
      >
        <div className="selected-account">
          <span className="account-type">
            {selectedAccount
              ? selectedAccount.accountType === "binance"
                ? "🟡"
                : selectedAccount.accountType === "kite"
                ? "🟠"
                : selectedAccount.accountType === "upstox"
                ? "🔵"
                : "🔗"
              : "🔗"}
          </span>
          <span className="account-name">
            {selectedAccount ? selectedAccount.accountName : "Select Account"}
          </span>
        </div>
        <ChevronDown className={`chevron ${isOpen ? "open" : ""}`} size={16} />
      </Button>

      {isOpen && (
        <div className="dropdown-menu">
          {accounts.map((account) => (
            <div
              key={account._id}
              className={`dropdown-item ${
                selectedAccount?._id === account._id ? "selected" : ""
              }`}
              onClick={() => handleAccountSelect(account)}
            >
              <div className="account-info">
                <span className="account-type">
                  {account.accountType === "binance"
                    ? "🟡"
                    : account.accountType === "kite"
                    ? "🟠"
                    : account.accountType === "upstox"
                    ? "🔵"
                    : "🔗"}
                </span>
                <div className="account-details">
                  <span className="account-name">{account.accountName}</span>
                  <span className="account-type-text">
                    {account.accountType.charAt(0).toUpperCase() +
                      account.accountType.slice(1)}
                  </span>
                </div>
              </div>
              {selectedAccount?._id === account._id && (
                <Check size={16} className="check-icon" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
