import PageLayout from "@/components/layout/PageLayout";
import HoldingsCard from "@/components/holdings/HoldingsCard";
import FundsCard from "@/components/funds/FundsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/lib/account-context";
import { IAccount } from "@/models/account";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function AssetsPage() {
  const { accounts: contextAccounts, loadingAccounts, selectedAccount } = useAccount();
  const [activeTab, setActiveTab] = useState("funds");

  // Cast to IAccount[] for compatibility with FundsCard
  const accounts = contextAccounts as unknown as IAccount[];

  if (loadingAccounts) {
    return <LoadingSpinner message="Loading assets..." />;
  }

  return (
    <PageLayout title="Assets">
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
          <FundsCard accounts={accounts} selectedAccountId={selectedAccount?._id} />
        </TabsContent>

        <TabsContent value="holdings" className="mt-0">
          <HoldingsCard accounts={contextAccounts} selectedAccountId={selectedAccount?._id} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
