"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cryptoApi } from "@/lib/crypto-api";
import { PAGE_ROUTES } from "@/lib/constants";

interface CryptoIndex {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  volume_usd: number;
}

interface BitcoinDominance {
  dominance: number;
  change_24h: number | null;
  last_updated: string;
}

type SourceStatus = "current" | "stale" | "unavailable";
type OverviewStatus = SourceStatus | "partial";

interface SourceState {
  status: SourceStatus;
  observed_at: string | null;
  last_attempted_at: string;
}

interface MarketOverviewResponse {
  cryptocurrencies: CryptoIndex[];
  bitcoin_dominance: BitcoinDominance | null;
  meta: {
    status: OverviewStatus;
    sources: {
      binance: SourceState;
      coingecko: SourceState;
    };
  };
}

const statusStyles: Record<SourceStatus, string> = {
  current: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
  stale: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  unavailable: "bg-muted text-muted-foreground",
};

function formatObservedAt(timestamp: string | null): string {
  if (!timestamp) return "No verified observation";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Observation time unavailable";
  return `Updated ${date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function SourceBadge({ name, source }: { name: string; source: SourceState }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`rounded-full px-2 py-1 font-medium ${statusStyles[source.status]}`}>
        {name}: {source.status === "current" ? "Current" : source.status === "stale" ? "Stale" : "Unavailable"}
      </span>
      <span className="text-muted-foreground">{formatObservedAt(source.observed_at)}</span>
    </div>
  );
}

export default function MarketOverview() {
  const router = useRouter();
  const [marketData, setMarketData] = useState<MarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  const fetchData = useCallback(async () => {
    if (hasData.current) setRefreshing(true);

    try {
      const response = await cryptoApi.getMarketOverview();
      const responseData = response.data?.data;
      const meta = response.data?.meta;

      if (!responseData || !Array.isArray(responseData.cryptocurrencies) || !meta?.sources) {
        throw new Error("Unexpected market overview response");
      }

      setMarketData({
        cryptocurrencies: responseData.cryptocurrencies,
        bitcoin_dominance: responseData.bitcoin_dominance || null,
        meta: {
          status: meta.status,
          sources: meta.sources,
        },
      });
      hasData.current = true;
      setError(null);
    } catch {
      setError(
        hasData.current
          ? "Update failed. Showing the last verified observations."
          : "Verified market data is unavailable."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void fetchData(), 0);
    const interval = setInterval(() => void fetchData(), 30000);
    return () => {
      window.clearTimeout(initialRequest);
      clearInterval(interval);
    };
  }, [fetchData]);

  const formatPrice = (price: number): string => {
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`;
    if (price >= 1000) return `$${(price / 1000).toFixed(1)}K`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(4)}`;
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000) return `$${(volume / 1000000000).toFixed(1)}B`;
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(0)}M`;
    return `$${(volume / 1000).toFixed(0)}K`;
  };

  if (loading && !marketData) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Market Overview</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex-shrink-0 bg-muted rounded-lg p-3 min-w-[140px] animate-pulse">
              <div className="h-4 bg-muted-foreground/20 rounded mb-2" />
              <div className="h-6 bg-muted-foreground/20 rounded mb-1" />
              <div className="h-3 bg-muted-foreground/20 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!marketData) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Market Overview</h2>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm">{error || "No verified market data is available yet."}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setLoading(true);
                void fetchData();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { cryptocurrencies, bitcoin_dominance, meta } = marketData;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Market Overview</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            <SourceBadge name="Binance Spot" source={meta.sources.binance} />
            <SourceBadge name="CoinGecko" source={meta.sources.coingecko} />
          </div>
        </div>
        {refreshing && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Checking
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {bitcoin_dominance ? (
          <div className="flex-shrink-0 bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 min-w-[160px] border border-orange-200 dark:border-orange-800">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm text-orange-900 dark:text-orange-200">BTC DOM</span>
              {bitcoin_dominance.change_24h !== null && (
                bitcoin_dominance.change_24h >= 0
                  ? <TrendingUp className="h-4 w-4 text-green-500" />
                  : <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">
              {bitcoin_dominance.dominance.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-orange-700 dark:text-orange-300">
              {bitcoin_dominance.change_24h === null
                ? "24h change unavailable"
                : `${bitcoin_dominance.change_24h >= 0 ? "+" : ""}${bitcoin_dominance.change_24h.toFixed(2)} pp`}
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 rounded-lg border border-dashed border-border p-3 min-w-[180px] text-muted-foreground">
            <div className="font-medium text-sm">BTC dominance</div>
            <div className="mt-2 text-xs">Verified data unavailable</div>
          </div>
        )}

        {cryptocurrencies.map((crypto) => (
          <button
            type="button"
            key={crypto.symbol}
            onClick={() => router.push(`${PAGE_ROUTES.CRYPTO_SCREENER}?symbol=${crypto.symbol}USDT&timeframe=24h`)}
            className="text-left flex-shrink-0 bg-muted/50 rounded-lg p-3 min-w-[140px] hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm text-foreground">{crypto.symbol}</span>
              {crypto.change_24h >= 0
                ? <TrendingUp className="h-4 w-4 text-green-500" />
                : <TrendingDown className="h-4 w-4 text-red-500" />}
            </div>
            <div className="text-lg font-semibold text-foreground">{formatPrice(crypto.price)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-medium ${crypto.change_24h >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {crypto.change_24h >= 0 ? "+" : ""}{crypto.change_24h.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">Vol: {formatVolume(crypto.volume_usd)}</span>
            </div>
          </button>
        ))}

        {cryptocurrencies.length === 0 && (
          <div className="flex-shrink-0 rounded-lg border border-dashed border-border p-3 min-w-[220px] text-muted-foreground">
            <div className="font-medium text-sm">Major-coin prices</div>
            <div className="mt-2 text-xs">Verified Binance data unavailable</div>
          </div>
        )}
      </div>
    </div>
  );
}
