"use client";

import { useEffect, useState } from "react";
import { Clock, ExternalLink, TrendingUp, AlertCircle } from "lucide-react";
import { cryptoApi } from "@/lib/crypto-api";

interface TrendingStory {
  _id?: string;
  id?: string;
  title: string;
  summary: string;
  source: string;
  time?: string;
  timestamp?: string;
  createdAt?: string;
  impact: "high" | "medium" | "low";
  category: string;
  url?: string;
  coinSymbol?: string;
  priceChange?: number;
  timeframe?: string;
}

interface SummaryData {
  _id?: string;
  id?: string;
  title?: string;
  summary?: string;
  source?: string;
  time?: string;
  timestamp?: string;
  createdAt?: string;
  impact?: string;
  category?: string;
  url?: string;
  coinSymbol?: string;
  priceChange?: number;
  timeframe?: string;
}

export default function MarketSummary() {
  const [stories, setStories] = useState<TrendingStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<TrendingStory | null>(null);
  const [showModal, setShowModal] = useState(false);

  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days} day${days > 1 ? "s" : ""} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    } else {
      return "Just now";
    }
  };

  useEffect(() => {
    const fetchSummaries = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await cryptoApi.getSummaries();
        const summariesData = response.data?.data || response.data || [];

        const formattedStories = summariesData.slice(0, 10).map((story: SummaryData): TrendingStory => ({
          _id: story._id,
          id: story._id || story.id || Math.random().toString(36).substring(2, 11),
          title: story.title || "Untitled",
          summary: story.summary || "No summary available",
          source: story.source || "Research",
          time: story.time || (story.timestamp || story.createdAt ? formatTimeAgo(story.timestamp || story.createdAt || "") : "Recently"),
          timestamp: story.timestamp,
          createdAt: story.createdAt,
          impact: (story.impact as "high" | "medium" | "low") || "medium",
          category: story.category || "General",
          url: story.url,
          coinSymbol: story.coinSymbol,
          priceChange: story.priceChange,
          timeframe: story.timeframe,
        }));

        setStories(formattedStories);
      } catch {
        setError("Failed to load market summaries");
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();

    // Auto-refresh every 5 minutes (research runs every 2 hours, so 5m is fine)
    const interval = setInterval(fetchSummaries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Market Summary</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Top Stories</span>
          </div>
        </div>

        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="p-3 bg-muted/50 rounded-lg animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 bg-muted-foreground/20 rounded w-16"></div>
                <div className="h-4 bg-muted-foreground/20 rounded w-12"></div>
              </div>
              <div className="h-5 bg-muted-foreground/20 rounded mb-2"></div>
              <div className="h-4 bg-muted-foreground/20 rounded mb-2"></div>
              <div className="flex items-center gap-3">
                <div className="h-3 bg-muted-foreground/20 rounded w-16"></div>
                <div className="h-3 bg-muted-foreground/20 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || stories.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Market Summary</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Top Stories</span>
          </div>
        </div>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm">{error || "No market summaries available yet"}</p>
          </div>
        </div>
      </div>
    );
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800";
      case "low":
        return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Market Summary</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>Top Stories</span>
        </div>
      </div>

      <div className="space-y-3">
        {stories.map((story) => (
          <div
            key={story.id || story._id}
            className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {story.coinSymbol && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded">
                      {story.coinSymbol}
                    </span>
                  )}
                  {story.priceChange !== undefined && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      story.priceChange > 0 ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/50" : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50"
                    }`}>
                      {story.priceChange > 0 ? "+" : ""}{story.priceChange.toFixed(2)}%
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getImpactColor(story.impact)}`}>
                    {story.impact.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {story.category}
                  </span>
                </div>
                <h3 className="font-medium text-foreground mb-1">
                  {story.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                  {story.summary}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {story.time}
                  </span>
                  {story.timeframe && (
                    <span className="font-medium text-muted-foreground">{story.timeframe} change</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStory(story);
                      setShowModal(true);
                    }}
                    className="ml-auto text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline"
                  >
                    See more
                  </button>
                  {story.url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(story.url, "_blank");
                      }}
                      className="text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Open source"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>



      {showModal && selectedStory && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-card rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {selectedStory.coinSymbol && (
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1 rounded">
                      {selectedStory.coinSymbol}
                    </span>
                  )}
                  {selectedStory.priceChange !== undefined && (
                    <span className={`text-sm font-semibold px-3 py-1 rounded ${
                      selectedStory.priceChange > 0 ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/50" : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50"
                    }`}>
                      {selectedStory.priceChange > 0 ? "+" : ""}{selectedStory.priceChange.toFixed(2)}%
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full border ${getImpactColor(selectedStory.impact)}`}>
                    {selectedStory.impact.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    {selectedStory.category}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  {selectedStory.title}
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedStory.summary}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {selectedStory.time}
                  </span>
                  {selectedStory.timeframe && (
                    <span className="font-medium">{selectedStory.timeframe} change</span>
                  )}
                  <span>Source: {selectedStory.source}</span>
                </div>
                {selectedStory.url && (
                  <button
                    onClick={() => window.open(selectedStory.url, "_blank")}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                  >
                    <span>View Source</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
