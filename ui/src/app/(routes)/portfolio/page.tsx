"use client";

import FundsCard from "@/components/funds/FundsCard";
import HoldingsCard from "@/components/holdings/HoldingsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/contexts/account-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function AssetsPage() {
  const { accounts: contextAccounts, loadingAccounts, selectedAccount } = useAccount();
  const [activeTab, setActiveTab] = useState("funds");

  if (loadingAccounts) {
    return <LoadingSpinner message="Loading assets..." />;
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="funds">Funds</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
        </TabsList>

        <TabsContent value="funds" className="mt-0">
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                marginBottom: "8px",
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Account Funds
            </h1>
            <p style={{ fontSize: "1rem", color: "#666" }}>
              View and manage your trading account balances
            </p>
          </div>
          <FundsCard
            accounts={contextAccounts}
            selectedAccountId={selectedAccount?._id}
          />
        </TabsContent>

        <TabsContent value="holdings" className="mt-0">
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1
              style={{
                fontSize: "2.25rem",
                fontWeight: 700,
                marginBottom: "8px",
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Portfolio Holdings
            </h1>
            <p style={{ fontSize: "1rem", color: "#666" }}>
              View your stocks and securities across all accounts
            </p>
          </div>
          <HoldingsCard
            accounts={contextAccounts}
            selectedAccountId={selectedAccount?._id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
