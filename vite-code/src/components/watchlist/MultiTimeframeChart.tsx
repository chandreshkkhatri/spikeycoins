import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import {
  AlertCircle,
  Maximize2,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

interface MultiTimeframeChartProps {
  symbol: string;
  accountId?: string;
  accountType?: "binance" | "kite" | "upstox";
}

const DEFAULT_TIMEFRAMES = [{ interval: "1h", label: "1 Hour", index: 0 }];

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

const MultiTimeframeChart = memo<MultiTimeframeChartProps>(
  ({ symbol, accountId, accountType }) => {
    // Use default symbol (BTCUSDT) if none provided
    const displaySymbol = symbol || "BTCUSDT";
    const isDefaultSymbol = !symbol;

    const [selectedTimeframes, setSelectedTimeframes] =
      useState(DEFAULT_TIMEFRAMES);
    const [showTimeframeSelector, setShowTimeframeSelector] = useState(false);
    const containerRefs = useRef<(HTMLDivElement | null)[]>(
      new Array(selectedTimeframes.length).fill(null)
    );
    const chartRefs = useRef<{
      chart: IChartApi;
      series: ISeriesApi<"Candlestick"> | null;
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [chartTimeframes, setChartTimeframes] = useState<{
      [index: number]: string;
    }>({});
    const [autoScale, setAutoScale] = useState(false);
    const [isLogScale, setIsLogScale] = useState(false);
    const runIdRef = useRef(0);

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

    const addTimeframe = (interval: string) => {
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
    };

    const removeTimeframe = (index: number) => {
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
    };

    const changeChartTimeframe = (chartIndex: number, newTimeframe: string) => {
      setChartTimeframes((prev) => ({
        ...prev,
        [chartIndex]: newTimeframe,
      }));
    };

    const createSingleChart = useCallback(
      (container: HTMLDivElement) => {
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

        console.log(
          `Creating chart with dimensions: ${containerWidth}x${chartHeight} (autoScale: ${autoScale})`
        );

        const chart = createChart(container, {
          width: containerWidth,
          height: chartHeight,
          autoSize: autoScale, // Enable auto-sizing when auto-scale is on
          layout: {
            background: {
              type: ColorType.Solid,
              color: isDarkMode ? "#18181b" : "#ffffff",
            },
            textColor: isDarkMode ? "#e4e4e7" : "#333",
          },
          grid: {
            vertLines: { color: isDarkMode ? "#27272a" : "#f0f0f0" },
            horzLines: { color: isDarkMode ? "#27272a" : "#f0f0f0" },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: isDarkMode ? "#3f3f46" : "#e0e0e0",
            scaleMargins: { top: 0.1, bottom: 0.1 },
            mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
          },
          timeScale: {
            borderColor: isDarkMode ? "#3f3f46" : "#e0e0e0",
            rightOffset: isMobile ? 3 : 8,
            barSpacing: isMobile ? 2 : 4,
          },
        });

        // Force resize after creation to ensure dimensions are applied
        setTimeout(() => {
          chart.resize(containerWidth, chartHeight);
        }, 100);

        // Use the correct v5 API: addSeries(CandlestickSeries, options)
        const candlestickOptions = {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderDownColor: "#ef5350",
          borderUpColor: "#26a69a",
          wickDownColor: "#ef5350",
          wickUpColor: "#26a69a",
        };

        const series = chart.addSeries(CandlestickSeries, candlestickOptions);

        return { chart, series };
      },
      [autoScale, isLogScale]
    );

    const fetchChartData = useCallback(
      async (interval: string): Promise<CandlestickData[]> => {
        try {
          // Use accountType if provided, otherwise try to detect from symbol
          const vendor =
            accountType ||
            (displaySymbol.endsWith("USDT") ||
            displaySymbol.endsWith("BUSD") ||
            displaySymbol.endsWith("BTC")
              ? "binance"
              : "upstox");

          // Build URL with required parameters - accountId is ALWAYS required
          const url = `/api/historical-data?vendor=${vendor}&symbol=${displaySymbol}&interval=${interval}&accountId=${accountId}`;

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
        } catch (error) {
          console.error(`Error fetching chart data for ${interval}:`, error);
          throw error;
        }
      },
      [displaySymbol, accountId, accountType]
    );

    useEffect(() => {
      // Increment run id to invalidate any in-flight async work from the previous render
      const thisRun = runIdRef.current + 1;
      runIdRef.current = thisRun;

      const initializeCharts = async () => {
        try {
          setLoading(true);
          setError(null);

          // Clear existing charts
          chartRefs.current.forEach(({ chart }) => {
            if (chart) {
              try {
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
              const { chart, series } = createSingleChart(container);
              chartRefs.current[index] = { chart, series };

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
                chart.timeScale().fitContent();
              }

              return { chart, series };
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
        chartRefs.current.forEach(({ chart }) => {
          if (chart) {
            try {
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
      chartTimeframes,
      createSingleChart,
      fetchChartData,
    ]);

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

          if (chartRef && chartRef.series) {
            try {
              const data = await fetchChartData(timeframe);
              if (runIdRef.current !== thisRun) return;
              if (
                data.length > 0 &&
                typeof chartRef.series.setData === "function"
              ) {
                chartRef.series.setData(data);
                chartRef.chart.timeScale().fitContent();
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
    }, [chartTimeframes, fetchChartData]);

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
              const priceScale = chart.priceScale("right");
              if (priceScale) {
                priceScale.applyOptions({
                  mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
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
      <div className="flex w-full flex-col gap-4 overflow-y-auto p-1">
        {/* Default Symbol Notice */}
        {isDefaultSymbol && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
            <AlertCircle size={16} />
            <span>
              No symbol selected. Showing default chart for{" "}
              <strong>BTC/USDT</strong>
            </span>
          </div>
        )}

        {/* Timeframe Controls */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Chart Timeframes
              </h3>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 p-1">
                <Button
                  variant={autoScale ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setAutoScale(!autoScale)}
                  title="Auto-scale height"
                >
                  {autoScale ? (
                    <Minimize2 size={14} />
                  ) : (
                    <Maximize2 size={14} />
                  )}
                </Button>
                <Button
                  variant={isLogScale ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7 font-mono text-xs font-bold"
                  onClick={() => setIsLogScale(!isLogScale)}
                  title="Toggle logarithmic scale"
                >
                  L
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTimeframeSelector(!showTimeframeSelector)}
                className="gap-1"
              >
                <Plus size={14} /> Add Timeframe
              </Button>
            </div>
          </div>

          {showTimeframeSelector && (
            <div className="mt-4 border-t border-border pt-4 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
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
                    className="w-full justify-center"
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {selectedTimeframes.map((timeframe) => {
            return (
              <div
                key={timeframe.interval}
                className={`flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all ${
                  autoScale ? "h-[400px]" : "h-auto"
                }`}
              >
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">
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
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_TIMEFRAMES.map((tf) => (
                          <SelectItem key={tf.interval} value={tf.interval}>
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedTimeframes.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTimeframe(timeframe.index)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                
                <div className="relative flex-1 min-h-[300px] w-full bg-background">
                  <div
                    ref={setContainerRef(timeframe.index)}
                    className="absolute inset-0 h-full w-full"
                  />
                  
                  {loading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <p className="mt-2 text-xs text-muted-foreground">Loading data...</p>
                    </div>
                  )}
                  
                  {error && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-4">
                      <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertCircle size={16} />
                        <p>{error}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

MultiTimeframeChart.displayName = "MultiTimeframeChart";

export default MultiTimeframeChart;
