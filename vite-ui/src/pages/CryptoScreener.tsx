import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import PageLayout from "@/components/layout/PageLayout";
import Ticker, { type TickerData } from "@/components/crypto/Ticker";
import { cryptoApi } from "@/lib/crypto-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, ChevronLeft } from "lucide-react";
import { PAGE_ROUTES } from "@/lib/constants";

export default function CryptoScreenerPage() {
  const [tickerArray, setTickerArray] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTickerData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await cryptoApi.get24hrTicker();
      const data = response.data?.data || response.data || [];
      setTickerArray(data);
    } catch {
      setError("Failed to load ticker data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickerData();
  }, [fetchTickerData]);

  return (
    <PageLayout title="Market Watch">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to={PAGE_ROUTES.CRYPTO}>
              <Button variant="ghost" size="sm">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Market Watch</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tickerArray.length} USDT trading pairs available
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search pairs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            <Button
              variant="outline"
              onClick={fetchTickerData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        <Ticker
          tickerArray={tickerArray}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
        />
      </div>
    </PageLayout>
  );
}
