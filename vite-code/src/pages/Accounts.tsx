import { useEffect, useState } from "react";
import AccountCard from "@/components/accounts/AccountCard";
import EditAccountModal from "@/components/accounts/EditAccountModal";
import RadixAccountModal from "@/components/accounts/RadixAccountModal";
import EnhancedCard from "@/components/enhanced-card";
import PageLayout from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { IAccount } from "@/models/account";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<IAccount | null>(null);

  const { user } = useAuth();
  // Use authenticated user ID if logged in, otherwise fall back to default_user
  const userId = user?._id || "default_user";

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounts?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setAccounts(data.accounts);
      } else {
        setError(data.error || "Failed to fetch accounts");
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      setError("Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
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

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        await fetchAccounts();
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
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (data.success) {
        await fetchAccounts();
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
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        await fetchAccounts();
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

      const response = await fetch(authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        if (data.loginUrl && account.accountType !== "binance") {
          window.location.href = data.loginUrl;
        } else {
          await fetchAccounts();
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
