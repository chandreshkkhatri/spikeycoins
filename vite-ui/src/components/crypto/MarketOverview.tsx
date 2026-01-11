import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { cryptoApi } from "@/lib/crypto-api";

interface CryptoIndex {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  volume_usd: number;
}

interface BitcoinDominance {
  dominance: number;
  change_24h: number;
  last_updated: string;
}

interface MarketOverviewResponse {
  cryptocurrencies: CryptoIndex[];
  bitcoin_dominance: BitcoinDominance;
}

interface LegacyTickerData {
  s?: string;
  symbol?: string;
  price?: string;
  c?: string;
  change_24h?: string;
  P?: string;
  volume_usd?: string;
  q?: string;
}

export default function MarketOverview() {
  const [marketData, setMarketData] = useState<MarketOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number): string => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(2)}M`;
    } else if (price >= 1000) {
      return `$${(price / 1000).toFixed(1)}K`;
    } else if (price >= 1) {
      return `$${price.toFixed(2)}`;
    } else {
      return `$${price.toFixed(4)}`;
    }
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000) {
      return `$${(volume / 1000000000).toFixed(1)}B`;
    } else if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(0)}M`;
    } else {
      return `$${(volume / 1000).toFixed(0)}K`;
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await cryptoApi.getMarketOverview();
        const responseData = response.data?.data;

        if (!responseData) {
          throw new Error('No data received from API');
        }

        let marketOverviewData;

        if (responseData.cryptocurrencies && responseData.bitcoin_dominance) {
          marketOverviewData = {
            cryptocurrencies: responseData.cryptocurrencies || [],
            bitcoin_dominance: responseData.bitcoin_dominance
          };
        } else if (Array.isArray(responseData)) {
          marketOverviewData = {
            cryptocurrencies: responseData.slice(0, 8).map((item: LegacyTickerData) => ({
              symbol: item.s?.replace('USDT', '') || item.symbol?.replace('USDT', '') || 'Unknown',
              name: item.s?.replace('USDT', '') || item.symbol?.replace('USDT', '') || 'Unknown',
              price: parseFloat(item.price || item.c || '0'),
              change_24h: parseFloat(item.change_24h || item.P || '0'),
              volume_usd: parseFloat(item.volume_usd || item.q || '0'),
            })),
            bitcoin_dominance: {
              dominance: 52.5,
              change_24h: 0.2,
              last_updated: new Date().toISOString()
            }
          };
        } else {
          throw new Error('Unexpected API response format');
        }

        setMarketData(marketOverviewData);
      } catch {
        setError("Failed to load market data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Market Overview</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 bg-muted rounded-lg p-3 min-w-[140px] animate-pulse">
              <div className="h-4 bg-muted-foreground/20 rounded mb-2"></div>
              <div className="h-6 bg-muted-foreground/20 rounded mb-1"></div>
              <div className="h-3 bg-muted-foreground/20 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !marketData) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold mb-3 text-foreground">Market Overview</h2>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm">{error || "No market data available yet"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { cryptocurrencies = [], bitcoin_dominance } = marketData;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h2 className="text-lg font-semibold mb-3 text-foreground">Market Overview</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {bitcoin_dominance && (
          <div className="flex-shrink-0 bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 min-w-[140px] hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors cursor-pointer border border-orange-200 dark:border-orange-800">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm text-orange-900 dark:text-orange-200">BTC DOM</span>
              {bitcoin_dominance.change_24h > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="text-lg font-semibold text-orange-900 dark:text-orange-100">{bitcoin_dominance.dominance.toFixed(1)}%</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-medium ${
                  bitcoin_dominance.change_24h > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {bitcoin_dominance.change_24h > 0 ? "+" : ""}{bitcoin_dominance.change_24h.toFixed(2)}%
              </span>
              <span className="text-xs text-orange-600 dark:text-orange-400">Dominance</span>
            </div>
          </div>
        )}
        {cryptocurrencies.map((crypto) => (
          <div
            key={crypto.symbol}
            className="flex-shrink-0 bg-muted/50 rounded-lg p-3 min-w-[140px] hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm text-foreground">{crypto.symbol}</span>
              {crypto.change_24h > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="text-lg font-semibold text-foreground">{formatPrice(crypto.price)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-medium ${
                  crypto.change_24h > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {crypto.change_24h > 0 ? "+" : ""}{crypto.change_24h.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">Vol: {formatVolume(crypto.volume_usd)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
