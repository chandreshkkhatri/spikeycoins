import "./AccountCard.css";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import { IAccount } from "@/models/account";
import { useState } from "react";

interface AccountCardProps {
  account: IAccount;
  onEdit: (account: IAccount) => void;
  onDelete: (accountId: string) => void;
  onAuth: (accountId: string) => void;
}

const accountTypeLabels = {
  kite: "Zerodha Kite",
  upstox: "Upstox",
  binance: "Binance",
};

const accountTypeColors = {
  kite: "#4CAF50",
  upstox: "#FF9800",
  binance: "#FFC107",
};

const getConnectButtonText = (accountType: string, account?: IAccount) => {
  switch (accountType) {
    case "binance":
      return "Validate API";
    case "upstox":
      // Different text for sandbox vs production Upstox accounts
      return account?.metadata?.sandbox === true ? "Add Token" : "Authorize";
    case "kite":
      return "Login";
    default:
      return "Connect";
  }
};

export default function AccountCard({
  account,
  onEdit,
  onDelete,
  onAuth,
}: AccountCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);

  const handleAuth = async () => {
    setIsLoading(true);
    try {
      await onAuth(account._id!);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDebugUpstox = async () => {
    if (account.accountType !== "upstox") return;

    setIsDebugging(true);
    try {
      const response = await fetch(getApiUrl("/api/debug/upstox"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: account._id }),
      });

      const data = await response.json();

      if (data.success) {
        alert(
          `Debug completed! Check console for detailed results.\n\nEnvironment: ${data.debugInfo.environment}\nAPI Key Valid: ${data.debugInfo.apiKeyValid}\nRedirect URI Valid: ${data.debugInfo.redirectUriValid}`
        );
      } else {
        alert(`Debug failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error("Debug error:", error);
      alert(`Debug failed: ${error.message}`);
    } finally {
      setIsDebugging(false);
    }
  };

  // For Binance accounts, check if we have API credentials and they're working
  // For other accounts, check if we have access token
  const isAuthenticated =
    account.accountType === "binance"
      ? !!(account.apiKey && account.apiSecret && account.lastSyncAt)
      : !!account.accessToken;

  const lastSync = account.lastSyncAt
    ? new Date(account.lastSyncAt).toLocaleString()
    : "Never";

  return (
    <div className="account-card">
      <div className="account-header">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            className="account-type-badge"
            style={{ backgroundColor: accountTypeColors[account.accountType] }}
          >
            {accountTypeLabels[account.accountType]}
          </div>
          {account.metadata?.testnet && (
            <div className="testnet-badge">TESTNET</div>
          )}
        </div>
        <div className="account-status">
          <span
            className={`status-indicator ${isAuthenticated ? "active" : "inactive"
              }`}
          >
            {isAuthenticated ? "●" : "○"}
          </span>
          <span className="status-text">
            {isAuthenticated ? "Connected" : "Not Connected"}
          </span>
        </div>
      </div>

      <div className="account-info">
        <h3 className="account-name">{account.accountName}</h3>
        <div className="account-details">
          <div className="detail-item">
            <span className="detail-label">API Key:</span>
            <span className="detail-value">
              {account.apiKey.substring(0, 8)}...
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Last Sync:</span>
            <span className="detail-value">{lastSync}</span>
          </div>
        </div>
      </div>

      <div className="account-actions">
        {!isAuthenticated && (
          <Button
            variant="trading"
            size="sm"
            onClick={handleAuth}
            disabled={isLoading}
          >
            {isLoading
              ? "Connecting..."
              : getConnectButtonText(account.accountType, account)}
          </Button>
        )}

        {isAuthenticated && account.accountType === "binance" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAuth}
            disabled={isLoading}
          >
            {isLoading ? "Validating..." : "Validate API"}
          </Button>
        )}

        {isAuthenticated &&
          account.accountType === "upstox" &&
          !account.metadata?.sandbox && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAuth}
              disabled={isLoading}
            >
              {isLoading ? "Re-authenticating..." : "Re-authenticate"}
            </Button>
          )}

        {account.accountType === "upstox" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDebugUpstox}
            disabled={isDebugging}
          >
            {isDebugging ? "Debugging..." : "🔍 Debug Config"}
          </Button>
        )}

        <div className="action-buttons">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => onEdit(account)}
          >
            ✎
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={() => onDelete(account._id!)}
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  );
}
