import { useEffect, useState } from "react";
import axios from "axios";
import PageLayout from "@/components/layout/PageLayout";
import FundsCard from "@/components/funds/FundsCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { API_ROUTES } from "@/lib/constants";
import { IAccount } from "@/models/account";

export default function FundsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<IAccount[]>([]);

  const fetchAccounts = async () => {
    try {
      const userId = "default_user";
      const response = await axios.get(
        `${API_ROUTES.accounts.getAccounts}?userId=${userId}`
      );

      if (response.data?.success) {
        setAccounts(response.data.accounts || []);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  if (loading) {
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
