import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiUrl } from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import {
  CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
  LineWidth,
  LogicalRange,
  LogicalRangeChangeEventHandler,
  UTCTimestamp,
} from "lightweight-charts";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// Global promise cache to deduplicate simultaneous fetches
const CHART_PROMISE_CACHE = new Map<string, Promise<CandlestickData[]>>();

interface PriceLine {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number; // 0 = Solid, 1 = Dotted, 2 = Dashed, 3 = LargeDashed
  title?: string;
  axisLabelVisible?: boolean;
}

interface MultiTimeframeChartProps {
  symbol: string;
  accountId?: string;
  accountType?: "binance" | "kite" | "upstox";
  marketType?: "spot" | "futures";
  priceLines?: PriceLine[];
  legend?: { label: string; color: string }[];
  currentPrice?: number; // LTP for live candle updates
}

const DEFAULT_TIMEFRAMES = [
  { interval: "1d", label: "1 Day", index: 0 },
  { interval: "4h", label: "4 Hours", index: 1 },
  { interval: "1h", label: "1 Hour", index: 2 },
  { interval: "5m", label: "5 Minutes", index: 3 },
];

const CHART_SETTINGS_KEY = "openMandi_chartSettings";

interface ChartSettings {
  selectedTimeframes: typeof DEFAULT_TIMEFRAMES;
  chartTimeframes: { [index: number]: string };
  autoScale: boolean;
  isLogScale: boolean;
  isCollapsed: boolean;
  collapsedCharts: { [interval: string]: boolean };
  zoomLevels: { [index: number]: number }; // Per-chart slot bar spacing
}

// Removed constant PRICE_SCALE_ID as we use both

const getStoredSettings = (): ChartSettings | null => {
  try {
    const stored = localStorage.getItem(CHART_SETTINGS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const saveSettings = (settings: ChartSettings) => {
  try {
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
};

const AVAILABLE_TIMEFRAMES = [
  { interval: "1m", label: "1 Minute" },
  { interval: "5m", label: "5 Minutes" },
  { interval: "15m", label: "15 Minutes" },
  { interval: "30m", label: "30 Minutes" },
  { interval: "1h", label: "1 Hour" },
  { interval: "2h", label: "2 Hours" },
  { interval: "4h", label: "4 Hours" },
  { interval: "6h", label: "6 Hours" },
  { interval: "8h", label: "8 Hours" },
  { interval: "12h", label: "12 Hours" },
  { interval: "1d", label: "1 Day" },
  { interval: "3d", label: "3 Days" },
  { interval: "1w", label: "1 Week" },
  { interval: "1M", label: "1 Month" },
];

// Historical data loading configuration
const HISTORY_FETCH_THRESHOLD = 30; // Bars before left edge to trigger fetch
const HISTORY_FETCH_DEBOUNCE = 200; // Debounce time in ms
const MAX_CANDLES_IN_MEMORY = 2000; // Maximum candles to keep loaded per chart

// Parse interval string to milliseconds
const parseIntervalToMs = (interval: string): number => {
  const match = interval.match(/^(\d+)([mhHdwM])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "m": return value * 60 * 1000;
    case "h":
    case "H": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    case "w": return value * 7 * 24 * 60 * 60 * 1000;
    case "M": return value * 30 * 24 * 60 * 60 * 1000; // Approximate
    default: return 0;
  }
};

// Format remaining time as HH:MM:SS or MM:SS
const formatCountdown = (ms: number): string => {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

// Calculate time remaining for current candle
const getTimeRemaining = (interval: string): number => {
  const intervalMs = parseIntervalToMs(interval);
  if (intervalMs === 0) return 0;
  const now = Date.now();
  const currentPeriodStart = Math.floor(now / intervalMs) * intervalMs;
  const nextPeriodStart = currentPeriodStart + intervalMs;
  return nextPeriodStart - now;
};

const MultiTimeframeChart = memo<MultiTimeframeChartProps>(
  ({ symbol, accountId, accountType, marketType, priceLines, legend, currentPrice }) => {
    // Use default symbol (BTCUSDT) if none provided
    const displaySymbol = symbol || "BTCUSDT";
    const isDefaultSymbol = !symbol;

    // Load stored settings on mount
    const storedSettings = useRef(getStoredSettings());

    const [selectedTimeframes, setSelectedTimeframes] = useState(
      storedSettings.current?.selectedTimeframes || DEFAULT_TIMEFRAMES
    );
    const [showTimeframeSelector, setShowTimeframeSelector] = useState(false);
    const containerRefs = useRef<(HTMLDivElement | null)[]>(
      new Array(selectedTimeframes.length).fill(null)
    );
    const chartRefs = useRef<{
      chart: IChartApi | null;
      series: ISeriesApi<"Candlestick"> | null;
      secondarySeries: ISeriesApi<"Candlestick"> | null;
      wheelHandler?: (e: WheelEvent) => void;
      container?: HTMLDivElement;
      priceLineRefs?: any[];
      secondaryPriceLineRefs?: any[];
      // Historical data tracking
      oldestTimestamp?: number;
      isLoadingHistory?: boolean;
      hasMoreHistory?: boolean;
      visibleRangeHandler?: LogicalRangeChangeEventHandler;
      // Disposal tracking to prevent accessing removed charts
      disposed?: boolean;
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshingCharts, setRefreshingCharts] = useState(false);
    const [loadingHistoryCharts, setLoadingHistoryCharts] = useState<{ [index: number]: boolean }>({});
    const [error, setError] = useState<string | null>(null);
    const [chartTimeframes, setChartTimeframes] = useState<{
      [index: number]: string;
    }>(storedSettings.current?.chartTimeframes || {});
    const [autoScale, setAutoScale] = useState(
      storedSettings.current?.autoScale ?? false
    );
    const [isLogScale, setIsLogScale] = useState(
      storedSettings.current?.isLogScale ?? false
    );
    const [isCollapsed, setIsCollapsed] = useState(
      storedSettings.current?.isCollapsed ?? false
    );
    const [collapsedCharts, setCollapsedCharts] = useState<{
      [interval: string]: boolean;
    }>(storedSettings.current?.collapsedCharts || {});
    
    // Per-chart zoom levels (bar spacing), keyed by chart slot index
    const [zoomLevels, setZoomLevels] = useState<{ [index: number]: number }>(
      storedSettings.current?.zoomLevels || {}
    );
    // Use ref to access zoom levels in createSingleChart without triggering recreation
    const zoomLevelsRef = useRef(zoomLevels);
    
    // Sync ref with state
    useEffect(() => {
      zoomLevelsRef.current = zoomLevels;
    }, [zoomLevels]);

    const runIdRef = useRef(0);

    // Countdown timers for each chart's current candle
    const [countdowns, setCountdowns] = useState<{ [key: string]: string }>({});
    // Track the last known candle period to detect new candle
    const lastPeriodRef = useRef<{ [key: string]: number }>({});
    // Flag to trigger refresh when candle closes
    const [candleCloseRefresh, setCandleCloseRefresh] = useState(0);
    // Track current candle OHLC data for each chart
    const currentCandleRef = useRef<{ [key: string]: { open: number; high: number; low: number; close: number } }>({});
    // Track the symbol that charts are currently loaded for (to prevent cross-symbol updates)
    const loadedSymbolRef = useRef<string | null>(null);

    // Clear candle tracking refs and reset historical data tracking when symbol changes
    useEffect(() => {
      currentCandleRef.current = {};
      lastPeriodRef.current = {};
      // Mark charts as not ready for updates until new data is loaded
      loadedSymbolRef.current = null;
      // Reset historical data tracking for all charts
      chartRefs.current.forEach(ref => {
        if (ref) {
          ref.oldestTimestamp = undefined;
          ref.hasMoreHistory = true;
          ref.isLoadingHistory = false;
        }
      });
      setLoadingHistoryCharts({});
    }, [displaySymbol]);

    // Update countdown timers every second + detect new candle periods
    useEffect(() => {
      const updateCountdowns = () => {
        const newCountdowns: { [key: string]: string } = {};
        const currentTime = Date.now();
        let shouldRefresh = false;

        selectedTimeframes.forEach((tf, index) => {
          const actualInterval = chartTimeframes[index] || tf.interval;
          const intervalMs = parseIntervalToMs(actualInterval);
          const remaining = getTimeRemaining(actualInterval);
          newCountdowns[`${index}-${actualInterval}`] = formatCountdown(remaining);

          if (intervalMs === 0) return;

          // Calculate current period start time
          const currentPeriodStart = Math.floor(currentTime / intervalMs) * intervalMs;
          const periodKey = `${index}-${actualInterval}`;
          const lastPeriod = lastPeriodRef.current[periodKey];

          // Check if we've entered a new candle period
          if (lastPeriod !== undefined && lastPeriod !== currentPeriodStart) {
            shouldRefresh = true;
            // Reset current candle data for this chart
            delete currentCandleRef.current[periodKey];
          }
          lastPeriodRef.current[periodKey] = currentPeriodStart;

          // Update last candle close price with current LTP
          // Skip if charts haven't loaded data for the current symbol yet
          if (currentPrice && currentPrice > 0 && loadedSymbolRef.current === displaySymbol) {
            const chartRef = chartRefs.current[index];
            // Skip if chart is disposed or series is not available
            if (chartRef?.series && !chartRef.disposed) {
              try {
                // Get the current time as UTCTimestamp for the update
                const candleTime = Math.floor(currentPeriodStart / 1000) as UTCTimestamp;

                // Get or initialize current candle OHLC
                let candleData = currentCandleRef.current[periodKey];
                if (!candleData) {
                  // Try to get the last bar data from the series
                  const seriesData = chartRef.series.data();
                  const lastBar = seriesData.length > 0 ? seriesData[seriesData.length - 1] : null;

                  if (lastBar && 'open' in lastBar && 'high' in lastBar && 'low' in lastBar) {
                    // Use the actual last candle data - double cast to access OHLC properties
                    const ohlcBar = lastBar as unknown as { open: number; high: number; low: number; close: number };
                    candleData = {
                      open: ohlcBar.open,
                      high: Math.max(ohlcBar.high, currentPrice),
                      low: Math.min(ohlcBar.low, currentPrice),
                      close: currentPrice,
                    };
                  } else {
                    // Fallback: Initialize with current price
                    candleData = {
                      open: currentPrice,
                      high: currentPrice,
                      low: currentPrice,
                      close: currentPrice,
                    };
                  }
                  currentCandleRef.current[periodKey] = candleData;
                } else {
                  // Update existing candle data
                  candleData.close = currentPrice;
                  candleData.high = Math.max(candleData.high, currentPrice);
                  candleData.low = Math.min(candleData.low, currentPrice);
                }

                // Update the current candle
                chartRef.series.update({
                  time: candleTime,
                  open: candleData.open,
                  high: candleData.high,
                  low: candleData.low,
                  close: candleData.close,
                });
              } catch (err) {
                // Series might not be ready or chart disposed
              }
            }
          }
        });
        setCountdowns(newCountdowns);
        if (shouldRefresh) {
          setCandleCloseRefresh(prev => prev + 1);
        }
      };

      updateCountdowns(); // Initial update
      const intervalId = setInterval(updateCountdowns, 1000);
      return () => clearInterval(intervalId);
    }, [selectedTimeframes, chartTimeframes, currentPrice, displaySymbol]);

    // Persist settings to localStorage whenever they change
    useEffect(() => {
      saveSettings({
        selectedTimeframes,
        chartTimeframes,
        autoScale,
        isLogScale,
        isCollapsed,
        collapsedCharts,
        zoomLevels,
      });
    }, [selectedTimeframes, chartTimeframes, autoScale, isLogScale, isCollapsed, collapsedCharts, zoomLevels]);

    useEffect(() => {
      chartRefs.current.forEach((chartRef) => {
        // Skip if chart is disposed or series is not available
        if (!chartRef?.series || chartRef.disposed) return;

        // Remove existing price lines
        if (chartRef.priceLineRefs) {
          chartRef.priceLineRefs.forEach((line) => {
            try {
              chartRef.series?.removePriceLine(line);
            } catch {
              // Line might already be removed
            }
          });
          chartRef.priceLineRefs = [];
        }

        // Add new price lines (all on the main/right axis)
        if (priceLines && priceLines.length > 0) {
          chartRef.priceLineRefs = priceLines
            .filter((pl) => pl.price > 0)
            .map((pl) => {
              try {
                return chartRef.series?.createPriceLine({
                  price: pl.price,
                  color: pl.color,
                  lineWidth: (pl.lineWidth || 1) as LineWidth,
                  lineStyle: pl.lineStyle ?? 2, // Default to dashed
                  axisLabelVisible: pl.axisLabelVisible ?? true,
                  title: pl.title || "",
                });
              } catch (e) {
                // Ignore errors if chart is disposed during creation
                return null;
              }
            })
            .filter(Boolean); // Filter out nulls
        }
      });
    }, [priceLines, collapsedCharts]);

    const resetToDefaults = () => {
      setSelectedTimeframes(DEFAULT_TIMEFRAMES);
      setChartTimeframes({});
      setAutoScale(false);
      setIsLogScale(false);
      setIsCollapsed(false);
    };

    // Refresh all charts by re-fetching data without destroying existing charts
    const refreshAllCharts = async () => {
      if (refreshingCharts) return;
      setRefreshingCharts(true);
      setError(null);

      const thisRun = runIdRef.current + 1;
      runIdRef.current = thisRun;

      try {
        // Clear the promise cache to force fresh fetches
        CHART_PROMISE_CACHE.clear();

        await Promise.all(
          selectedTimeframes.map(async (timeframe, index) => {
            const chartRef = chartRefs.current[index];
            if (!chartRef?.series) return;

            const actualTimeframe = chartTimeframes[index] || timeframe.interval;
            try {
              const data = await fetchChartData(actualTimeframe);
              if (runIdRef.current !== thisRun) return;
              // Check if chart keys exist and chart is not disposed
              if (data.length > 0 && chartRef.series && !chartRef.disposed && typeof chartRef.series.setData === "function") {
                chartRef.series.setData(data);
                // Reset historical data tracking after refresh
                chartRef.oldestTimestamp = (data[0].time as number) * 1000;
                chartRef.hasMoreHistory = true;
                chartRef.isLoadingHistory = false;
              }
            } catch (err) {
              if (runIdRef.current !== thisRun) return;
              const msg = err instanceof Error ? err.message : "Failed to refresh";
              setError(msg);
            }
          })
        );
      } finally {
        if (runIdRef.current === thisRun) {
          setRefreshingCharts(false);
        }
      }
      setCollapsedCharts({});
      localStorage.removeItem(CHART_SETTINGS_KEY);
    };

    const toggleChartCollapse = useCallback((interval: string) => {
      setCollapsedCharts((prev) => {
        const currentlyCollapsed = prev[interval] ?? false;
        const nextState = !currentlyCollapsed;

        // When collapsing, dispose the existing chart so it can be recreated on expand
        if (!currentlyCollapsed) {
          const chartIndex = selectedTimeframes.findIndex(
            (tf) => tf.interval === interval
          );
          if (chartIndex !== -1) {
            const chartRef = chartRefs.current[chartIndex];
            if (chartRef?.chart) {
              // Mark as disposed FIRST to prevent concurrent access
              chartRef.disposed = true;
              try {
                // Remove wheel handler before removing chart
                if (chartRef.wheelHandler && chartRef.container) {
                  chartRef.container.removeEventListener('wheel', chartRef.wheelHandler);
                }
                chartRef.chart.remove();
              } catch {
                // Ignore chart removal errors
              }
            }
            chartRefs.current[chartIndex] = {
              chart: null,
              series: null,
              secondarySeries: null,
              disposed: true,
            };
          }
        }

        return {
          ...prev,
          [interval]: nextState,
        };
      });
    }, [selectedTimeframes]);

    const setContainerRef = useCallback(
      (index: number) => (el: HTMLDivElement | null) => {
        containerRefs.current[index] = el;
      },
      []
    );

    // Update container refs when timeframes change
    useEffect(() => {
      containerRefs.current = new Array(selectedTimeframes.length).fill(null);
    }, [selectedTimeframes.length]);

    const addTimeframe = useCallback((interval: string) => {
      const timeframe = AVAILABLE_TIMEFRAMES.find(
        (tf) => tf.interval === interval
      );
      if (
        timeframe &&
        !selectedTimeframes.find((tf) => tf.interval === interval)
      ) {
        const newTimeframe = {
          ...timeframe,
          index: selectedTimeframes.length,
        };
        setSelectedTimeframes((prev) => [...prev, newTimeframe]);
      }
    }, [selectedTimeframes]);

    const removeTimeframe = useCallback((index: number) => {
      if (selectedTimeframes.length > 1) {
        setSelectedTimeframes((prev) =>
          prev
            .filter((_, i) => i !== index)
            .map((tf, i) => ({ ...tf, index: i }))
        );
        // Clean up chart timeframe override for removed chart
        setChartTimeframes((prev) => {
          const newTimeframes = { ...prev };
          delete newTimeframes[index];
          // Reindex remaining timeframes
          const reindexed: { [index: number]: string } = {};
          Object.entries(newTimeframes).forEach(([oldIndex, timeframe]) => {
            const newIndex =
              parseInt(oldIndex) > index
                ? parseInt(oldIndex) - 1
                : parseInt(oldIndex);
            reindexed[newIndex] = timeframe;
          });
          return reindexed;
        });
      }
    }, [selectedTimeframes.length]);

    const changeChartTimeframe = useCallback((chartIndex: number, newTimeframe: string) => {
      setChartTimeframes((prev) => ({
        ...prev,
        [chartIndex]: newTimeframe,
      }));
    }, []);

    const createSingleChart = useCallback(
      (container: HTMLDivElement, index: number) => {
        const isDarkMode = document.documentElement.classList.contains("dark");
        const isMobile = window.innerWidth <= 768;

        // Calculate chart height based on auto-scale setting
        let chartHeight;
        if (autoScale) {
          // Use container height minus some padding for header
          chartHeight = Math.max(
            (container.parentElement?.clientHeight || 400) - 60,
            200
          );
        } else {
          chartHeight = isMobile ? 225 : 300;
        }

        const containerWidth = Math.max(container.clientWidth || 300, 300);

        // Get stored zoom for this slot, fallback to a zoomed-in default (fitting ~30 candles)
        const defaultSpacing = containerWidth / 30;
        const initialBarSpacing = zoomLevelsRef.current[index] ?? defaultSpacing;

        const chart = createChart(container, {
          width: containerWidth,
          height: chartHeight,
          autoSize: autoScale, // Enable auto-sizing when auto-scale is on
          layout: {
            background: {
              type: ColorType.Solid,
              color: isDarkMode ? "#0a0a0b" : "#ffffff",
            },
            textColor: isDarkMode ? "#a1a1aa" : "#52525b",
            fontSize: 11,
          },
          grid: {
            vertLines: {
              color: isDarkMode ? "#1f1f23" : "#f4f4f5",
              style: 1,
            },
            horzLines: {
              color: isDarkMode ? "#1f1f23" : "#f4f4f5",
              style: 1,
            },
          },
          crosshair: {
            mode: 0,
            vertLine: {
              color: isDarkMode ? "#3f3f46" : "#d4d4d8",
              width: 1,
              style: 2,
              labelBackgroundColor: isDarkMode ? "#27272a" : "#f4f4f5",
            },
            horzLine: {
              color: isDarkMode ? "#3f3f46" : "#d4d4d8",
              width: 1,
              style: 2,
              labelBackgroundColor: isDarkMode ? "#27272a" : "#f4f4f5",
            },
          },
          localization: {
            priceFormatter: (price: number) => formatPrice(price ?? 0),
          },
          leftPriceScale: {
            borderColor: isDarkMode ? "#27272a" : "#e4e4e7",
            scaleMargins: { top: 0.08, bottom: 0.08 },
            mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
            borderVisible: false,
            visible: false, // Hidden - using only right axis
          },
          rightPriceScale: {
            borderColor: isDarkMode ? "#27272a" : "#e4e4e7",
            scaleMargins: { top: 0.08, bottom: 0.08 },
            mode: isLogScale ? 1 : 0,
            borderVisible: false,
            visible: true,
          },
          timeScale: {
            borderColor: isDarkMode ? "#27272a" : "#e4e4e7",
            rightOffset: isMobile ? 3 : 8,
            barSpacing: initialBarSpacing,
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false,
          },
          handleScale: {
            mouseWheel: false, // Disabled - we handle wheel manually to require Ctrl key
            pinch: true,
            axisPressedMouseMove: {
              time: true,
              price: true,
            },
          },
        });

        // Add custom wheel handler that requires Ctrl/Cmd key for zoom
        const handleWheel = (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            // Apply zoom using timeScale
            const timeScale = chart.timeScale();
            const currentBarSpacing = timeScale.options().barSpacing || 5;
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Scroll down = zoom out, scroll up = zoom in
            const newBarSpacing = Math.max(1, Math.min(50, currentBarSpacing * zoomFactor));

            timeScale.applyOptions({ barSpacing: newBarSpacing });
            
            // Persist the new zoom level for this slot
            setZoomLevels(prev => ({ ...prev, [index]: newBarSpacing }));
          }
          // If Ctrl/Cmd is not pressed, let the event bubble up for normal page scroll
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        // Debounced internal zoom change listener (pinch-to-zoom)
        let zoomTimeout: ReturnType<typeof setTimeout>;
        const handleZoomChange = () => {
          const currentSpacing = chart.timeScale().options().barSpacing;
          if (currentSpacing && Math.abs(currentSpacing - (zoomLevelsRef.current[index] || 0)) > 0.05) {
            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
              setZoomLevels(prev => ({ ...prev, [index]: currentSpacing }));
            }, 500);
          }
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(handleZoomChange);

        // Force resize after creation to ensure dimensions are applied
        setTimeout(() => {
          chart.resize(containerWidth, chartHeight);
        }, 100);

        // Use the correct v5 API: addSeries(CandlestickSeries, options)
        const candlestickOptions = {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderDownColor: "#ef4444",
          borderUpColor: "#22c55e",
          wickDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          priceScaleId: "right", // Using right axis for all price display
          priceLineVisible: true,
          lastValueVisible: true,
        };

        const series = chart.addSeries(CandlestickSeries, candlestickOptions);

        return { chart, series, secondarySeries: null, wheelHandler: handleWheel };
      },
      [autoScale, isLogScale]
    );

    const fetchChartData = useCallback(
      async (interval: string): Promise<CandlestickData[]> => {
        const cacheKey = `${displaySymbol}-${accountId || ''}-${accountType || ''}-${marketType || ''}-${interval}`;

        if (CHART_PROMISE_CACHE.has(cacheKey)) {
          return CHART_PROMISE_CACHE.get(cacheKey)!;
        }

        const promise = (async () => {
          try {
            // Use accountType if provided, otherwise try to detect from symbol
            // Include USDC for Binance symbols like 1000BONKUSDC
            const vendor =
              accountType ||
              (displaySymbol.endsWith("USDT") ||
                displaySymbol.endsWith("USDC") ||
                displaySymbol.endsWith("BUSD") ||
                displaySymbol.endsWith("BTC")
                ? "binance"
                : "upstox");

            const params = new URLSearchParams({
              vendor,
              symbol: displaySymbol,
              interval,
            });

            if (accountId) {
              params.append("accountId", accountId);
            }

            if (marketType) {
              params.append("marketType", marketType);
            }

            const url = getApiUrl(`/api/historical-data?${params.toString()}`);

            const response = await fetch(url);

            if (!response.ok) {
              const errorText = await response.text().catch(() => "");
              let errorMessage = `Failed to fetch ${interval} data: ${response.status}`;

              try {
                const errorData = JSON.parse(errorText);
                if (errorData.error) {
                  errorMessage = errorData.error;
                }
              } catch {
                if (errorText) {
                  errorMessage += ` - ${errorText}`;
                }
              }

              throw new Error(errorMessage);
            }

            const result = await response.json();

            // Handle API response format - check if data is in result.data or directly in result
            const data = result.data || result;

            if (!Array.isArray(data) || data.length === 0) {
              return [];
            }

            return data.map(
              (d: {
                date: string | number;
                open: number;
                high: number;
                low: number;
                close: number;
              }) => ({
                time: (new Date(d.date).getTime() / 1000) as UTCTimestamp,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
              })
            );
          } finally {
            // Clear cache after 2 seconds to allow refetching
            setTimeout(() => {
              CHART_PROMISE_CACHE.delete(cacheKey);
            }, 2000);
          }
        })();

        CHART_PROMISE_CACHE.set(cacheKey, promise);
        return promise;
      },
      [displaySymbol, accountId, accountType, marketType]
    );

    // Fetch historical data for a specific date range
    const fetchHistoricalData = useCallback(
      async (interval: string, toDate: Date): Promise<CandlestickData[]> => {
        const vendor =
          accountType ||
          (displaySymbol.endsWith("USDT") ||
            displaySymbol.endsWith("USDC") ||
            displaySymbol.endsWith("BUSD") ||
            displaySymbol.endsWith("BTC")
            ? "binance"
            : "upstox");

        const params = new URLSearchParams({
          vendor,
          symbol: displaySymbol,
          interval,
          toDate: toDate.toISOString(),
        });

        if (accountId) {
          params.append("accountId", accountId);
        }

        if (marketType) {
          params.append("marketType", marketType);
        }

        const url = getApiUrl(`/api/historical-data?${params.toString()}`);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch historical data: ${response.status}`);
        }

        const result = await response.json();
        const data = result.data || result;

        if (!Array.isArray(data) || data.length === 0) {
          return [];
        }

        return data.map(
          (d: {
            date: string | number;
            open: number;
            high: number;
            low: number;
            close: number;
          }) => ({
            time: (new Date(d.date).getTime() / 1000) as UTCTimestamp,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          })
        );
      },
      [displaySymbol, accountId, accountType, marketType]
    );

    // Load more historical data when scrolling to the left edge
    const loadMoreHistory = useCallback(
      async (chartIndex: number, interval: string) => {
        const chartRef = chartRefs.current[chartIndex];
        if (!chartRef?.series || !chartRef?.chart) return;
        if (chartRef.isLoadingHistory || chartRef.hasMoreHistory === false) return;

        // Mark as loading
        chartRef.isLoadingHistory = true;
        setLoadingHistoryCharts(prev => ({ ...prev, [chartIndex]: true }));

        try {
          // Get current data from the series
          const currentData = chartRef.series.data() as CandlestickData[];
          if (currentData.length === 0) {
            chartRef.hasMoreHistory = false;
            return;
          }

          const oldestCandle = currentData[0];
          const oldestTime = (oldestCandle.time as number) * 1000;
          const toDate = new Date(oldestTime - 1000); // 1 second before oldest

          // Fetch historical data
          const historicalData = await fetchHistoricalData(interval, toDate);

          if (historicalData.length === 0) {
            chartRef.hasMoreHistory = false;
            return;
          }

          // Save current visible range to restore after update
          const visibleRange = chartRef.chart.timeScale().getVisibleLogicalRange();

          // Filter out any overlapping candles
          const existingTimes = new Set(currentData.map(c => c.time));
          const newCandles = historicalData.filter(c => !existingTimes.has(c.time));

          if (newCandles.length === 0) {
            chartRef.hasMoreHistory = false;
            return;
          }

          // Combine and sort by time
          let mergedData = [...newCandles, ...currentData].sort(
            (a, b) => (a.time as number) - (b.time as number)
          );

          // Memory management: trim if too many candles
          if (mergedData.length > MAX_CANDLES_IN_MEMORY) {
            mergedData = mergedData.slice(-MAX_CANDLES_IN_MEMORY);
          }

          // Check if chart is still valid before updating
          if (chartRef.disposed || !chartRef.series) return;

          // Update series data
          chartRef.series.setData(mergedData);

          // Update oldest timestamp
          chartRef.oldestTimestamp = (mergedData[0].time as number) * 1000;

          // Restore visible range (adjusted for new data count)
          if (visibleRange) {
            const adjustment = newCandles.length;
            chartRef.chart.timeScale().setVisibleLogicalRange({
              from: visibleRange.from + adjustment,
              to: visibleRange.to + adjustment,
            });
          }

          // Check if this was a partial response (indicates end of history)
          if (historicalData.length < 50) {
            chartRef.hasMoreHistory = false;
          }
        } catch (error) {
          console.error(`Failed to load historical data for chart ${chartIndex}:`, error);
        } finally {
          chartRef.isLoadingHistory = false;
          setLoadingHistoryCharts(prev => ({ ...prev, [chartIndex]: false }));
        }
      },
      [fetchHistoricalData]
    );

    // Set up scroll handler to detect when user scrolls near the left edge
    const setupHistoricalScrollHandler = useCallback(
      (chart: IChartApi, series: ISeriesApi<"Candlestick">, chartIndex: number, interval: string) => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const handleVisibleLogicalRangeChange = (logicalRange: LogicalRange | null) => {
          if (!logicalRange || !series) return;

          const chartRef = chartRefs.current[chartIndex];
          if (!chartRef || chartRef.isLoadingHistory || chartRef.hasMoreHistory === false) {
            return;
          }

          // Get bars info to check if near left edge
          const barsInfo = series.barsInLogicalRange(logicalRange);
          if (!barsInfo) return;

          // Check if we're within threshold of left edge
          if (barsInfo.barsBefore !== null && barsInfo.barsBefore < HISTORY_FETCH_THRESHOLD) {
            // Debounce the fetch
            if (debounceTimer) clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
              loadMoreHistory(chartIndex, interval);
            }, HISTORY_FETCH_DEBOUNCE);
          }
        };

        // Subscribe to visible range changes
        chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

        // Return handler for cleanup
        return handleVisibleLogicalRangeChange;
      },
      [loadMoreHistory]
    );

    // Refresh all charts when a candle closes
    useEffect(() => {
      if (candleCloseRefresh === 0) return; // Skip initial render

      selectedTimeframes.forEach((tf, index) => {
        const actualInterval = chartTimeframes[index] || tf.interval;
        const chartRef = chartRefs.current[index];
        // Skip if chart is disposed or series is not available
        if (chartRef?.series && !chartRef.disposed) {
          fetchChartData(actualInterval).then((data) => {
            // Double-check disposed state after async fetch
            if (data.length > 0 && chartRef.series && !chartRef.disposed && typeof chartRef.series.setData === "function") {
              try {
                chartRef.series.setData(data);
                chartRef.chart?.timeScale().scrollToRealTime();
              } catch {
                // Chart might be disposed
              }
            }
          }).catch(() => {
            // Ignore fetch errors silently
          });
        }
      });
    }, [candleCloseRefresh, selectedTimeframes, chartTimeframes, fetchChartData]);

    useEffect(() => {
      // Increment run id to invalidate any in-flight async work from the previous render
      const thisRun = runIdRef.current + 1;
      runIdRef.current = thisRun;

      const initializeCharts = async () => {
        try {
          setLoading(true);
          setError(null);

          // Clear existing charts
          chartRefs.current.forEach((chartRef) => {
            // Mark as disposed FIRST to prevent concurrent access
            chartRef.disposed = true;
            const { chart, wheelHandler, container } = chartRef;
            if (chart) {
              try {
                // Remove wheel handler before removing chart
                if (wheelHandler && container) {
                  container.removeEventListener('wheel', wheelHandler);
                }
                chart.remove();
              } catch (e) {
                // Silently handle chart removal errors
              }
            }
          });
          chartRefs.current = [];

          // Wait for container refs to be available
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Create charts for all selected timeframes
          const promises = selectedTimeframes.map(async (timeframe, index) => {
            const container = containerRefs.current[index];
            if (!container) {
              return null;
            }

            try {
              const { chart, series, secondarySeries, wheelHandler } = createSingleChart(
                container,
                index
              );
              chartRefs.current[index] = {
                chart,
                series,
                secondarySeries,
                wheelHandler,
                container,
                // Initialize historical data tracking
                oldestTimestamp: undefined,
                isLoadingHistory: false,
                hasMoreHistory: true,
                visibleRangeHandler: undefined,
              };

              // Use individual chart timeframe if set, otherwise use default
              const actualTimeframe =
                chartTimeframes[index] || timeframe.interval;
              const data = await fetchChartData(actualTimeframe);

              // Bail out if a new run has started (unmounted or symbol changed)
              if (runIdRef.current !== thisRun) return null;

              if (
                data.length > 0 &&
                series &&
                typeof series.setData === "function"
              ) {
                series.setData(data);

                // Track oldest timestamp and set up scroll handler for historical loading
                chartRefs.current[index].oldestTimestamp = (data[0].time as number) * 1000;
                const handler = setupHistoricalScrollHandler(chart, series, index, actualTimeframe);
                chartRefs.current[index].visibleRangeHandler = handler;
              }

              return { chart, series, secondarySeries };
            } catch (chartError) {
              const errorMessage =
                chartError instanceof Error
                  ? chartError.message
                  : "Unknown error";
              setError(`Failed to load ${timeframe.label}: ${errorMessage}`);
              return null;
            }
          });

          await Promise.all(promises);
          if (runIdRef.current !== thisRun) return;
          // Mark charts as ready for live updates for this symbol
          loadedSymbolRef.current = displaySymbol;
          setLoading(false);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          if (runIdRef.current !== thisRun) return;
          setError(`Failed to load charts: ${errorMessage}`);
          setLoading(false);
        }
      };

      const timeoutId = window.setTimeout(() => {
        // Bail out if a new run has started (unmounted or symbol changed)
        if (runIdRef.current !== thisRun) return;
        initializeCharts();
      }, 500);

      return () => {
        clearTimeout(timeoutId);
        // Invalidate this run to prevent any pending async work from touching disposed charts
        runIdRef.current = thisRun + 1;
        chartRefs.current.forEach((chartRef) => {
          // Mark as disposed FIRST to prevent any concurrent access
          chartRef.disposed = true;
          const { chart, wheelHandler, container, visibleRangeHandler } = chartRef;
          if (chart) {
            try {
              // Remove wheel handler before removing chart
              if (wheelHandler && container) {
                container.removeEventListener('wheel', wheelHandler);
              }
              // Unsubscribe from visible range changes
              if (visibleRangeHandler) {
                chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleRangeHandler);
              }
              chart.remove();
            } catch (e) {
              // Silently handle chart removal errors
            }
          }
        });
      };
    }, [
      displaySymbol,
      selectedTimeframes,
      createSingleChart,
      fetchChartData,
      setupHistoricalScrollHandler,
      // NOTE: chartTimeframes is intentionally excluded. A dedicated effect below
      // handles reloading individual charts when their timeframe changes.
    ]);

    // Effect to handle individual chart expand - recreate chart when a collapsed chart is expanded
    useEffect(() => {
      const initializeExpandedChart = async (index: number, timeframe: typeof selectedTimeframes[0]) => {
        // Wait a bit for the container to be rendered
        await new Promise((resolve) => setTimeout(resolve, 100));

        const container = containerRefs.current[index];
        if (!container) return;

        // Check if chart already exists and is valid
        const existingChart = chartRefs.current[index];
        if (existingChart?.chart && existingChart?.series) {
          // Chart exists, just need to resize it
          try {
            existingChart.chart.resize(container.clientWidth, container.clientHeight);
          } catch {
            // Chart might be invalid, recreate it
          }
          return;
        }

        try {
          const { chart, series, secondarySeries, wheelHandler } = createSingleChart(
            container,
            index
          );
          chartRefs.current[index] = {
            chart,
            series,
            secondarySeries,
            wheelHandler,
            container,
          };

          const actualTimeframe = chartTimeframes[index] || timeframe.interval;
          const data = await fetchChartData(actualTimeframe);

          if (data.length > 0 && series && typeof series.setData === "function") {
            series.setData(data);
          }
        } catch (error) {
          // Ignore error initializing expanded chart
        }
      };

      // Check each timeframe and initialize any that were just expanded
      selectedTimeframes.forEach((timeframe, index) => {
        const isChartCollapsed = collapsedCharts[timeframe.interval] ?? false;
        if (!isChartCollapsed) {
          // Chart is expanded - check if it needs initialization
          const chartRef = chartRefs.current[index];
          if (!chartRef?.chart || !chartRef?.series) {
            initializeExpandedChart(index, timeframe);
          }
        }
      });
    }, [collapsedCharts, selectedTimeframes, chartTimeframes, createSingleChart, fetchChartData]);

    // Effect to reload data when individual chart timeframes change
    useEffect(() => {
      if (Object.keys(chartTimeframes).length === 0) return;

      const reloadChartData = async () => {
        const thisRun = runIdRef.current + 1;
        runIdRef.current = thisRun;
        setError(null); // Clear any previous errors

        for (const [indexStr, timeframe] of Object.entries(chartTimeframes)) {
          const index = parseInt(indexStr);
          const chartRef = chartRefs.current[index];

          if (chartRef && chartRef.series && chartRef.chart) {
            try {
              // Reset historical data tracking for this chart
              chartRef.oldestTimestamp = undefined;
              chartRef.hasMoreHistory = true;
              chartRef.isLoadingHistory = false;

              // Unsubscribe old handler if exists
              if (chartRef.visibleRangeHandler) {
                chartRef.chart.timeScale().unsubscribeVisibleLogicalRangeChange(chartRef.visibleRangeHandler);
              }

              const data = await fetchChartData(timeframe);
              if (runIdRef.current !== thisRun) return;
              if (
                data.length > 0 &&
                typeof chartRef.series.setData === "function"
              ) {
                chartRef.series.setData(data);

                // Set up new scroll handler with new timeframe
                chartRef.oldestTimestamp = (data[0].time as number) * 1000;
                const handler = setupHistoricalScrollHandler(chartRef.chart, chartRef.series, index, timeframe);
                chartRef.visibleRangeHandler = handler;
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : "Failed to load chart data";
              setError(errorMessage);
            }
          }
        }
      };

      reloadChartData();
    }, [chartTimeframes, fetchChartData, setupHistoricalScrollHandler]);

    // Effect to handle auto-scale and log-scale changes
    useEffect(() => {
      const updateChartSettings = async () => {
        if (chartRefs.current.length === 0) return;

        chartRefs.current.forEach(({ chart }, index) => {
          if (chart) {
            try {
              const container = containerRefs.current[index];
              if (!container) return;

              // Update scale mode
              // Update scale mode
              const leftScale = chart.priceScale("left");
              const rightScale = chart.priceScale("right");
              if (leftScale) {
                leftScale.applyOptions({
                  mode: isLogScale ? 1 : 0,
                  autoScale: true, // Always autoScale
                });
              }
              if (rightScale) {
                rightScale.applyOptions({
                  mode: isLogScale ? 1 : 0,
                  autoScale: true,
                });
              }

              // Update chart size for auto-scale
              const isMobile = window.innerWidth <= 768;
              let chartHeight;
              if (autoScale) {
                chartHeight = Math.max(
                  (container.parentElement?.clientHeight || 400) - 60,
                  200
                );
              } else {
                chartHeight = isMobile ? 225 : 300;
              }

              chart.resize(
                Math.max(container.clientWidth || 300, 300),
                chartHeight
              );
            } catch (error) {
              // Silently handle chart settings update errors
            }
          }
        });
      };

      updateChartSettings();
    }, [autoScale, isLogScale]);

    return (
      <div className="flex w-full flex-col gap-3 p-3">
        {/* Default Symbol Notice */}
        {isDefaultSymbol && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200/50 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>
              No symbol selected. Showing default chart for{" "}
              <strong className="font-semibold">BTC/USDT</strong>
            </span>
          </div>
        )}

        {/* Timeframe Controls */}
        <div className="rounded-xl border border-border/50 bg-card/80 p-3 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-transparent"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </Button>
              <h3
                className="text-sm font-semibold text-foreground cursor-pointer select-none"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                Charts
              </h3>
              {!isCollapsed && (
                <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 p-0.5 animate-in fade-in duration-200">
                  <Button
                    variant={autoScale ? "secondary" : "ghost"}
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setAutoScale(!autoScale)}
                    title="Auto-scale height"
                  >
                    {autoScale ? (
                      <Minimize2 size={12} />
                    ) : (
                      <Maximize2 size={12} />
                    )}
                  </Button>
                  <Button
                    variant={isLogScale ? "secondary" : "ghost"}
                    size="icon"
                    className="h-6 w-6 font-mono text-[10px] font-bold"
                    onClick={() => setIsLogScale(!isLogScale)}
                    title="Toggle logarithmic scale"
                  >
                    L
                  </Button>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTimeframeSelector(!showTimeframeSelector)}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Plus size={12} /> Add Chart
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Reset to defaults"
                >
                  <RotateCcw size={12} /> Reset
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshAllCharts}
                  disabled={refreshingCharts}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Refresh all charts"
                >
                  <RefreshCw size={12} className={refreshingCharts ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
            )}
          </div>

          {/* Legend */}
          {!isCollapsed && legend && legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 border-t border-border/50 pt-2 px-1">
              {legend.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] font-medium text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {!isCollapsed && showTimeframeSelector && (
            <div className="mt-3 border-t border-border/50 pt-3 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                {AVAILABLE_TIMEFRAMES.filter(
                  (tf) =>
                    !selectedTimeframes.find(
                      (selected) => selected.interval === tf.interval
                    )
                ).map((timeframe) => (
                  <Button
                    key={timeframe.interval}
                    variant="outline"
                    size="sm"
                    className="h-7 w-full justify-center text-xs"
                    onClick={() => {
                      addTimeframe(timeframe.interval);
                      setShowTimeframeSelector(false);
                    }}
                  >
                    {timeframe.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Charts Grid */}
        {!isCollapsed && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {selectedTimeframes.map((timeframe) => {
              const isChartCollapsed = collapsedCharts[timeframe.interval] ?? false;
              return (
                <div
                  key={timeframe.interval}
                  className={`flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all hover:border-border hover:shadow-md ${autoScale && !isChartCollapsed ? "h-[350px]" : "h-auto"
                    }`}
                >
                  <div
                    className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-3 py-1.5 cursor-pointer"
                    onClick={() => toggleChartCollapse(timeframe.interval)}
                  >
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0 hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChartCollapse(timeframe.interval);
                        }}
                      >
                        {isChartCollapsed ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronUp size={12} />
                        )}
                      </Button>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {displaySymbol}
                      </span>
                      <Select
                        value={
                          chartTimeframes[timeframe.index] || timeframe.interval
                        }
                        onValueChange={(value) =>
                          changeChartTimeframe(timeframe.index, value)
                        }
                      >
                        <SelectTrigger
                          className="h-6 w-[90px] text-[11px] border-border/50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue placeholder="Timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_TIMEFRAMES.map((tf) => (
                            <SelectItem key={tf.interval} value={tf.interval} className="text-xs">
                              {tf.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Countdown timer */}
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        {countdowns[`${timeframe.index}-${chartTimeframes[timeframe.index] || timeframe.interval}`] || "--:--"}
                      </span>
                    </div>

                    {selectedTimeframes.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTimeframe(timeframe.index);
                        }}
                      >
                        <X size={12} />
                      </Button>
                    )}
                  </div>

                  {!isChartCollapsed && (
                    <div className="group relative flex-1 min-h-[250px] w-full bg-background">
                      <div
                        ref={setContainerRef(timeframe.index)}
                        className="absolute inset-0 h-full w-full"
                      />

                      {/* Zoom hint - shown on hover */}
                      <div className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                        <span className="text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
                          Ctrl + scroll to zoom
                        </span>
                      </div>

                      {/* Historical data loading indicator */}
                      {loadingHistoryCharts[timeframe.index] && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 bg-background/90 px-2 py-1 rounded shadow-sm pointer-events-none">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                          <span className="text-[10px] text-muted-foreground">Loading history...</span>
                        </div>
                      )}

                      {(loading || refreshingCharts) && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px] pointer-events-none">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                          <p className="mt-2 text-[10px] font-medium text-muted-foreground">
                            {loading ? "Loading..." : "Refreshing..."}
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 p-3">
                          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <AlertCircle size={14} />
                            <p className="line-clamp-2">{error}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

MultiTimeframeChart.displayName = "MultiTimeframeChart";

export default MultiTimeframeChart;
