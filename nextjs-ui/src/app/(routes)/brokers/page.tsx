"use client";

import EnhancedCard from "@/components/enhanced-card";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/contexts/account-context";
import { useAuth } from "@/contexts/auth-context";

export default function AccountsPage() {
  const { accounts: contextAccounts, loadingAccounts, error } = useAccount();
  const { isLoggedIn, user } = useAuth();

  const accounts = contextAccounts;
  const loading = loadingAccounts;
  const userId = user?._id;

  if (loading) {
    return <LoadingSpinner message="Loading accounts..." />;
  }

  // Require authentication
  if (!isLoggedIn || !userId) {
    return (
      <div>
        <EnhancedCard>
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "4rem", marginBottom: "20px" }}>🔐</div>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px 0" }}>
              Login Required
            </h3>
            <p style={{ fontSize: "1rem", color: "#666", margin: "0 0 24px 0" }}>
              Please log in to view and manage your trading accounts.
            </p>
            <Button onClick={() => window.location.href = "/login"} variant="trading" size="lg">
              Go to Login
            </Button>
          </div>
        </EnhancedCard>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1
            style={{ fontSize: "2.5rem", fontWeight: 700, margin: "0 0 8px 0" }}
          >
            Trading Accounts
          </h1>
          <p style={{ fontSize: "1.1rem", color: "#666", margin: 0 }}>
            Manage your connected trading accounts and credentials
          </p>
        </div>
        <Button variant="trading" size="lg">
          + Add Account
        </Button>
      </div>

      {error && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffeaa7",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "24px",
            color: "#856404",
          }}
        >
          <p>⚠️ {error}</p>
        </div>
      )}

      {accounts.length === 0 ? (
        <EnhancedCard>
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "4rem", marginBottom: "20px" }}>📱</div>
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                margin: "0 0 12px 0",
              }}
            >
              No Trading Accounts
            </h3>
            <p
              style={{ fontSize: "1rem", color: "#666", margin: "0 0 24px 0" }}
            >
              Connect your first trading account to start managing your
              portfolio across multiple brokers.
            </p>
            <Button variant="success" size="lg">
              Add Your First Account
            </Button>
          </div>
        </EnhancedCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          {accounts.map((account, index) => (
            <EnhancedCard key={account._id || `account-${index}`} hoverable>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl">
                  {account.accountType === "binance" ? "🟡" :
                    account.accountType === "kite" ? "🟠" :
                      account.accountType === "upstox" ? "🔵" : "🔗"}
                </div>
                <div>
                  <h3 className="font-bold">{account.accountName}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{account.accountType}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Edit</Button>
                <Button variant="outline" size="sm">
                  {account.accessToken ? "Reconnect" : "Connect"}
                </Button>
              </div>
            </EnhancedCard>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <EnhancedCard title="Account Overview">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "20px",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#2196f3",
                    marginBottom: "4px",
                  }}
                >
                  {accounts.length}
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "#666", fontWeight: 500 }}
                >
                  Total Accounts
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#2196f3",
                    marginBottom: "4px",
                  }}
                >
                  {accounts.filter((acc) => acc.accessToken).length}
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "#666", fontWeight: 500 }}
                >
                  Connected
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#2196f3",
                    marginBottom: "4px",
                  }}
                >
                  {accounts.filter((acc) => acc.accountType === "upstox").length}
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "#666", fontWeight: 500 }}
                >
                  Upstox
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#2196f3",
                    marginBottom: "4px",
                  }}
                >
                  {accounts.filter((acc) => acc.accountType === "kite").length}
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "#666", fontWeight: 500 }}
                >
                  Kite
                </div>
              </div>
            </div>
          </EnhancedCard>
        </div>
      )}
    </div>
  );
}
