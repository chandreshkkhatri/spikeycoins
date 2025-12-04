import { useState } from "react";
import AccountCard from "@/components/accounts/AccountCard";
import EditAccountModal from "@/components/accounts/EditAccountModal";
import RadixAccountModal from "@/components/accounts/RadixAccountModal";
import EnhancedCard from "@/components/enhanced-card";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/lib/account-context";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/constants";
import { IAccount } from "@/models/account";

export default function AccountsPage() {
  // Use the shared account context - this keeps Header and Accounts page in sync
  const { accounts: contextAccounts, loadingAccounts, fetchAccounts: refreshContextAccounts, error } = useAccount();
  
  // Convert TradingAccount[] to IAccount[] for display (they have compatible shapes)
  const accounts = contextAccounts as unknown as IAccount[];
  const loading = loadingAccounts;
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<IAccount | null>(null);

  const { isLoggedIn, user, getAccessToken } = useAuth();
  
  // Require authentication - no more default_user fallback
  const userId = user?._id;

  // Helper to get auth headers
  const getAuthHeaders = (): HeadersInit => {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  // Clear session cache and refresh accounts from server
  const refreshAccounts = async () => {
    // Clear the session cache so we get fresh data
    sessionStorage.removeItem('accountsCache');
    sessionStorage.removeItem('accountsCacheTime');
    await refreshContextAccounts();
  };

  const handleAddAccount = async (accountData: any) => {
    try {
      // Prepare metadata for different account types
      const metadata: any = {};

      if (accountData.accountType === "binance") {
        metadata.tradingSegment = accountData.tradingSegment || "spot";
        metadata.testnet = accountData.redirectUri === "testnet";
      } else if (accountData.accountType === "upstox") {
        metadata.sandbox = accountData.redirectUri === "sandbox";
      }

      const response = await fetch(getApiUrl("/api/accounts"), {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId,
          accountType: accountData.accountType,
          accountName: accountData.accountName,
          apiKey: accountData.apiKey,
          apiSecret: accountData.apiSecret,
          metadata,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await refreshAccounts();
        setShowAddModal(false);
      } else {
        throw new Error(data.error || "Failed to create account");
      }
    } catch (error: any) {
      console.error("Error creating account:", error);
      alert(error.message || "Failed to create account");
    }
  };

  const handleEditAccount = (account: IAccount) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleSaveAccount = async (
    accountId: string,
    updates: Partial<IAccount>
  ) => {
    try {
      const response = await fetch(getApiUrl(`/api/accounts/${accountId}`), {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (data.success) {
        await refreshAccounts();
        setShowEditModal(false);
        setEditingAccount(null);
      } else {
        throw new Error(data.error || "Failed to update account");
      }
    } catch (error: any) {
      console.error("Error updating account:", error);
      alert(error.message || "Failed to update account");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this account?")) {
      return;
    }

    try {
      const response = await fetch(getApiUrl(`/api/accounts/${accountId}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (data.success) {
        await refreshAccounts();
      } else {
        throw new Error(data.error || "Failed to delete account");
      }
    } catch (error: any) {
      console.error("Error deleting account:", error);
      alert(error.message || "Failed to delete account");
    }
  };

  const handleAuthAccount = async (accountId: string) => {
    try {
      const account = accounts.find((acc) => acc._id === accountId);
      if (!account) {
        throw new Error("Account not found");
      }

      let authEndpoint = "";

      switch (account.accountType) {
        case "upstox":
          authEndpoint = account.metadata?.sandbox
            ? "/api/auth/upstox/sandbox-token"
            : "/api/auth/upstox/login";
          break;
        case "binance":
          authEndpoint = "/api/auth/binance/validate";
          break;
        case "kite":
          authEndpoint = "/api/auth/kite/login";
          break;
        default:
          throw new Error(`Unsupported account type: ${account.accountType}`);
      }

      const requestBody: any = { accountId };

      if (
        account.accountType === "upstox" &&
        account.metadata?.sandbox &&
        authEndpoint.includes("sandbox-token")
      ) {
        const token = prompt("Enter your Upstox sandbox access token:");
        if (!token || !token.trim()) {
          throw new Error(
            "Access token is required for sandbox authentication"
          );
        }
        requestBody.accessToken = token.trim();
      }

      const response = await fetch(getApiUrl(authEndpoint), {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        if (data.loginUrl && account.accountType !== "binance") {
          window.location.href = data.loginUrl;
        } else {
          await refreshAccounts();
          alert(`${account.accountType} account authenticated successfully!`);
        }
      } else {
        throw new Error(data.error || "Failed to initiate authentication");
      }
    } catch (error: any) {
      console.error("Error authenticating account:", error);
      alert(error.message || "Failed to authenticate account");
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading accounts..." />;
  }

  // Require authentication
  if (!isLoggedIn || !userId) {
    return (
      <PageLayout title="Account Management">
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
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Account Management">
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
        <Button
          onClick={() => setShowAddModal(true)}
          variant="trading"
          size="lg"
        >
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
            <Button
              onClick={() => setShowAddModal(true)}
              variant="success"
              size="lg"
            >
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
            <AccountCard
              key={account._id || `account-${index}`}
              account={account}
              onEdit={handleEditAccount}
              onDelete={handleDeleteAccount}
              onAuth={handleAuthAccount}
            />
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
                  {
                    accounts.filter((acc) => acc.accountType === "upstox")
                      .length
                  }
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

      <RadixAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddAccount}
      />

      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAccount(null);
        }}
        account={editingAccount}
        onSave={handleSaveAccount}
      />
    </PageLayout>
  );
}
