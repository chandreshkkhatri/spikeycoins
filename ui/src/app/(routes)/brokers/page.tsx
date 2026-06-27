"use client";

import AccountCard, { AccountCardAccount } from "@/components/accounts/AccountCard";
import AddAccountModal from "@/components/accounts/AddAccountModal";
import EditAccountModal from "@/components/accounts/EditAccountModal";
import EnhancedCard from "@/components/enhanced-card";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/contexts/account-context";
import { useAuth } from "@/contexts/auth-context";
import { IAccount } from "@/models/account";
import { useState } from "react";
import api from "@/lib/api";

export default function AccountsPage() {
  const { accounts: contextAccounts, loadingAccounts, error, fetchAccounts } = useAccount();
  const { isLoggedIn, user } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<IAccount | null>(null);

  const accounts = contextAccounts;
  const loading = loadingAccounts;
  const userId = user?._id;

  const handleEdit = (account: AccountCardAccount) => {
    setEditingAccount(account as IAccount);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    try {
      await api.delete(`/accounts/${accountId}`);
      fetchAccounts();
    } catch (err: unknown) {
      console.error("Delete error:", err);
      const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = axiosError.response?.data?.error || axiosError.message || "Failed to delete account";
      alert(`Failed to delete account: ${errorMessage}`);
    }
  };

  const handleAuth = async (accountId: string) => {
    const account = accounts.find((a) => a._id === accountId);
    if (!account) return;

    if (account.accountType === "binance") {
      // For Binance, validate API keys
      try {
        const response = await api.post(`/auth/binance/validate`, { accountId });
        if (response.data?.success) {
          alert("API credentials validated successfully!");
          fetchAccounts();
        } else {
          alert(`Validation failed: ${response.data?.error || "Unknown error"}`);
        }
      } catch (err: unknown) {
        console.error("Validation error:", err);
        const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
        const errorMessage = axiosError.response?.data?.error || axiosError.message || "Failed to validate API credentials";
        alert(`Failed to validate API credentials: ${errorMessage}`);
      }
    } else if (account.accountType === "upstox") {
      // For Upstox, redirect to OAuth
      if (account.metadata?.sandbox) {
        // For sandbox, prompt for manual token
        const token = prompt("Enter your Upstox sandbox access token:");
        if (token) {
          try {
            const response = await api.post(`/auth/upstox/sandbox-token`, { accountId, accessToken: token });
            if (response.data?.success) {
              alert("Token saved successfully!");
              fetchAccounts();
            } else {
              alert(`Failed to save token: ${response.data?.error || "Unknown error"}`);
            }
          } catch (err: unknown) {
            console.error("Token save error:", err);
            const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
            const errorMessage = axiosError.response?.data?.error || axiosError.message || "Failed to save token";
            alert(`Failed to save token: ${errorMessage}`);
          }
        }
      } else {
        // Redirect to Upstox OAuth
        window.location.href = `/api/auth/upstox/login?accountId=${accountId}`;
      }
    }
  };

  const handleAddAccount = () => {
    setIsAddModalOpen(true);
  };

  const handleAddAccountSubmit = async (accountData: {
    accountType: "upstox" | "binance";
    accountName: string;
    apiKey: string;
    apiSecret: string;
    redirectUri?: string;
    tradingSegment?: "spot" | "usdm";
  }) => {
    try {
      await api.post("/accounts", {
        ...accountData,
        userId: user?._id,
        metadata: {
          sandbox: accountData.redirectUri === "sandbox",
          testnet: accountData.redirectUri === "testnet",
          tradingSegment: accountData.tradingSegment,
        },
      });

      fetchAccounts();
      setIsAddModalOpen(false);
    } catch (err: unknown) {
      console.error("Add account error:", err);
      const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = axiosError.response?.data?.error || axiosError.message || "Failed to add account";
      alert(`Failed to add account: ${errorMessage}`);
    }
  };

  const handleEditAccountSave = async (accountId: string, updates: Partial<IAccount>) => {
    try {
      await api.put(`/accounts/${accountId}`, updates);
      fetchAccounts();
    } catch (err: unknown) {
      console.error("Update account error:", err);
      const axiosError = err as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = axiosError.response?.data?.error || axiosError.message || "Failed to update account";
      alert(`Failed to update account: ${errorMessage}`);
    }
  };

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
            <h3
              style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 12px 0" }}
            >
              Login Required
            </h3>
            <p style={{ fontSize: "1rem", color: "#666", margin: "0 0 24px 0" }}>
              Please log in to view and manage your trading accounts.
            </p>
            <Button
              onClick={() => (window.location.href = "/login")}
              variant="default"
              size="lg"
            >
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
        <Button
          variant="default"
          size="lg"
          onClick={handleAddAccount}
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
              variant="default"
              size="lg"
              onClick={handleAddAccount}
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
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAuth={handleAuth}
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
                  {accounts.filter((acc) => acc.accountType === "upstox").length}
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "#666", fontWeight: 500 }}
                >
                  Upstox
                </div>
              </div>
            </div>
          </EnhancedCard>
        </div>
      )}

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddAccountSubmit}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingAccount(null);
        }}
        account={editingAccount}
        onSave={handleEditAccountSave}
      />
    </div>
  );
}
