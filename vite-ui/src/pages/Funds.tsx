import PageLayout from "@/components/layout/PageLayout";
import FundsCard from "@/components/funds/FundsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAccount } from "@/lib/account-context";
import { IAccount } from "@/models/account";

export default function FundsPage() {
  // Use the shared account context instead of making separate API calls
  const { accounts: contextAccounts, loadingAccounts } = useAccount();
  
  // Cast to IAccount[] for compatibility with FundsCard
  const accounts = contextAccounts as unknown as IAccount[];

  if (loadingAccounts) {
    return <LoadingSpinner message="Loading funds..." />;
  }

  return (
    <PageLayout title="Funds">
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

      <FundsCard accounts={accounts} />
    </PageLayout>
  );
}
