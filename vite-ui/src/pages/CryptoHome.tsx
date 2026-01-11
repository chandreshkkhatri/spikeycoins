import { Link } from "react-router-dom";
import PageLayout from "@/components/layout/PageLayout";
import MarketOverview from "@/components/crypto/MarketOverview";
import MarketSummary from "@/components/crypto/MarketSummary";
import GainersLosers from "@/components/crypto/GainersLosers";
import { Button } from "@/components/ui/button";
import { PAGE_ROUTES } from "@/lib/constants";
import { BarChart2 } from "lucide-react";

export default function CryptoHomePage() {
  return (
    <PageLayout title="Crypto Markets">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Crypto Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time cryptocurrency market overview and insights
            </p>
          </div>
          <Link to={PAGE_ROUTES.CRYPTO_SCREENER}>
            <Button variant="outline">
              <BarChart2 className="h-4 w-4 mr-2" />
              Open Screener
            </Button>
          </Link>
        </div>

        <MarketOverview />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MarketSummary />
          </div>
          <div>
            <GainersLosers />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
