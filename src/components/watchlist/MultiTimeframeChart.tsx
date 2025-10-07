'use client';

import {
  CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  IChartApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

interface MultiTimeframeChartProps {
  symbol: string;
  accountId?: string;
}

const DEFAULT_TIMEFRAMES = [{ interval: '1h', label: '1 Hour', index: 0 }];

const AVAILABLE_TIMEFRAMES = [
  { interval: '1m', label: '1 Minute' },
  { interval: '5m', label: '5 Minutes' },
  { interval: '15m', label: '15 Minutes' },
  { interval: '30m', label: '30 Minutes' },
  { interval: '1h', label: '1 Hour' },
  { interval: '2h', label: '2 Hours' },
  { interval: '4h', label: '4 Hours' },
  { interval: '6h', label: '6 Hours' },
  { interval: '8h', label: '8 Hours' },
  { interval: '12h', label: '12 Hours' },
  { interval: '1d', label: '1 Day' },
  { interval: '3d', label: '3 Days' },
  { interval: '1w', label: '1 Week' },
  { interval: '1M', label: '1 Month' },
];

const MultiTimeframeChart = memo<MultiTimeframeChartProps>(({ symbol, accountId }) => {
  const [selectedTimeframes, setSelectedTimeframes] = useState(DEFAULT_TIMEFRAMES);
  const [showTimeframeSelector, setShowTimeframeSelector] = useState(false);
  const containerRefs = useRef<(HTMLDivElement | null)[]>(
    new Array(selectedTimeframes.length).fill(null)
  );
  const chartRefs = useRef<{ chart: IChartApi; series: any | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartTimeframes, setChartTimeframes] = useState<{ [index: number]: string }>({});
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
    const timeframe = AVAILABLE_TIMEFRAMES.find(tf => tf.interval === interval);
    if (timeframe && !selectedTimeframes.find(tf => tf.interval === interval)) {
      const newTimeframe = {
        ...timeframe,
        index: selectedTimeframes.length,
      };
      setSelectedTimeframes(prev => [...prev, newTimeframe]);
    }
  };

  const removeTimeframe = (index: number) => {
    if (selectedTimeframes.length > 1) {
      setSelectedTimeframes(prev =>
        prev.filter((_, i) => i !== index).map((tf, i) => ({ ...tf, index: i }))
      );
      // Clean up chart timeframe override for removed chart
      setChartTimeframes(prev => {
        const newTimeframes = { ...prev };
        delete newTimeframes[index];
        // Reindex remaining timeframes
        const reindexed: { [index: number]: string } = {};
        Object.entries(newTimeframes).forEach(([oldIndex, timeframe]) => {
          const newIndex = parseInt(oldIndex) > index ? parseInt(oldIndex) - 1 : parseInt(oldIndex);
          reindexed[newIndex] = timeframe;
        });
        return reindexed;
      });
    }
  };

  const changeChartTimeframe = (chartIndex: number, newTimeframe: string) => {
    setChartTimeframes(prev => ({
      ...prev,
      [chartIndex]: newTimeframe,
    }));
  };

  const createSingleChart = useCallback(
    (container: HTMLDivElement) => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      const isMobile = window.innerWidth <= 768;

      // Calculate chart height based on auto-scale setting
      let chartHeight;
      if (autoScale) {
        // Use container height minus some padding for header
        chartHeight = Math.max((container.parentElement?.clientHeight || 400) - 60, 200);
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
          background: { type: ColorType.Solid, color: isDarkMode ? '#18181b' : '#ffffff' },
          textColor: isDarkMode ? '#e4e4e7' : '#333',
        },
        grid: {
          vertLines: { color: isDarkMode ? '#27272a' : '#f0f0f0' },
          horzLines: { color: isDarkMode ? '#27272a' : '#f0f0f0' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: isDarkMode ? '#3f3f46' : '#e0e0e0',
          scaleMargins: { top: 0.1, bottom: 0.1 },
          mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
        },
        timeScale: {
          borderColor: isDarkMode ? '#3f3f46' : '#e0e0e0',
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
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderDownColor: '#ef5350',
        borderUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        wickUpColor: '#26a69a',
      };

      const series = chart.addSeries(CandlestickSeries, candlestickOptions);

      return { chart, series };
    },
    [autoScale, isLogScale]
  );

  const fetchChartData = useCallback(
    async (interval: string): Promise<CandlestickData[]> => {
      try {
        // Determine vendor based on symbol (USDT = Binance, others = Upstox/Kite)
        const vendor = symbol.endsWith('USDT') ? 'binance' : 'upstox';

        // Build URL with required parameters
        let url = `/api/historical-data?vendor=${vendor}&symbol=${symbol}&interval=${interval}`;

        // Add accountId for non-binance vendors
        if (vendor !== 'binance' && accountId) {
          url += `&accountId=${accountId}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
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

        return data.map((d: any) => ({
          time: (new Date(d.date).getTime() / 1000) as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
      } catch (error) {
        console.error(`Error fetching chart data for ${interval}:`, error);
        throw error;
      }
    },
    [symbol, accountId]
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
        await new Promise(resolve => setTimeout(resolve, 300));

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
            const actualTimeframe = chartTimeframes[index] || timeframe.interval;
            const data = await fetchChartData(actualTimeframe);

            // Bail out if a new run has started (unmounted or symbol changed)
            if (runIdRef.current !== thisRun) return null;

            if (data.length > 0 && series && typeof series.setData === 'function') {
              series.setData(data);
              chart.timeScale().fitContent();
            }

            return { chart, series };
          } catch (chartError) {
            const errorMessage = chartError instanceof Error ? chartError.message : 'Unknown error';
            setError(`Failed to load ${timeframe.label}: ${errorMessage}`);
            return null;
          }
        });

        await Promise.all(promises);
        if (runIdRef.current !== thisRun) return;
        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
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
  }, [symbol, selectedTimeframes, chartTimeframes, createSingleChart, fetchChartData]);

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
            if (data.length > 0 && typeof chartRef.series.setData === 'function') {
              chartRef.series.setData(data);
              chartRef.chart.timeScale().fitContent();
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to load chart data';
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
            const priceScale = chart.priceScale('right');
            if (priceScale) {
              priceScale.applyOptions({
                mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
              });
            }

            // Update chart size for auto-scale
            const isMobile = window.innerWidth <= 768;
            let chartHeight;
            if (autoScale) {
              chartHeight = Math.max((container.parentElement?.clientHeight || 400) - 60, 200);
            } else {
              chartHeight = isMobile ? 225 : 300;
            }

            chart.resize(Math.max(container.clientWidth || 300, 300), chartHeight);
          } catch (error) {
            // Silently handle chart settings update errors
          }
        }
      });
    };

    updateChartSettings();
  }, [autoScale, isLogScale]);

  return (
    <div className="multi-timeframe-charts">
      {/* Timeframe Controls */}
      <div className="timeframe-controls">
        <div className="controls-header">
          <h3>Chart Timeframes</h3>
          <div className="control-buttons">
            <button
              className={`control-btn ${autoScale ? 'active' : ''}`}
              onClick={() => setAutoScale(!autoScale)}
              title="Auto-scale height to fit container"
            >
              A
            </button>
            <button
              className={`control-btn ${isLogScale ? 'active' : ''}`}
              onClick={() => setIsLogScale(!isLogScale)}
              title="Toggle logarithmic scale"
            >
              L
            </button>
            <button
              className="add-timeframe-btn"
              onClick={() => setShowTimeframeSelector(!showTimeframeSelector)}
            >
              + Add Timeframe
            </button>
          </div>
        </div>

        {showTimeframeSelector && (
          <div className="timeframe-selector">
            <div className="available-timeframes">
              {AVAILABLE_TIMEFRAMES.filter(
                tf => !selectedTimeframes.find(selected => selected.interval === tf.interval)
              ).map(timeframe => (
                <button
                  key={timeframe.interval}
                  className="timeframe-option"
                  onClick={() => {
                    addTimeframe(timeframe.interval);
                    setShowTimeframeSelector(false);
                  }}
                >
                  {timeframe.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      {selectedTimeframes.map(timeframe => {
        return (
          <div key={timeframe.interval} className="chart-section">
            <div className="chart-header">
              <h4>{timeframe.label}</h4>
              <div className="header-controls">
                <span className="symbol-name">{symbol}</span>
                <select
                  value={chartTimeframes[timeframe.index] || timeframe.interval}
                  onChange={e => changeChartTimeframe(timeframe.index, e.target.value)}
                  className="timeframe-select"
                >
                  {AVAILABLE_TIMEFRAMES.map(tf => (
                    <option key={tf.interval} value={tf.interval}>
                      {tf.label}
                    </option>
                  ))}
                </select>
                {selectedTimeframes.length > 1 && (
                  <button
                    className="remove-chart-btn"
                    onClick={() => removeTimeframe(timeframe.index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div className="chart-container-wrapper">
              <div ref={setContainerRef(timeframe.index)} className="chart-container" />
              {loading && (
                <div className="chart-loading-overlay">
                  <div className="loading-spinner"></div>
                  <p>Loading {timeframe.label}...</p>
                </div>
              )}
              {error && (
                <div className="chart-error-overlay">
                  <p>⚠️ {error}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <style jsx>{`
        .multi-timeframe-charts {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
          overflow-y: auto;
        }

        .timeframe-controls {
          background: var(--card);
          border-radius: 8px;
          padding: 16px;
          border: 1px solid var(--border);
        }

        .controls-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .control-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-btn {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 32px;
        }

        .control-btn:hover {
          background: var(--muted);
          border-color: var(--primary);
        }

        .control-btn.active {
          background: var(--primary);
          color: var(--primary-foreground);
          border-color: var(--primary);
        }

        .controls-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .add-timeframe-btn {
          background: var(--primary);
          color: var(--primary-foreground);
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .add-timeframe-btn:hover {
          background: var(--primary-dark);
        }

        .timeframe-selector {
          border-top: 1px solid var(--border);
          padding-top: 12px;
        }

        .available-timeframes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 8px;
        }

        .timeframe-option {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 0.8rem;
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .timeframe-option:hover {
          background: var(--muted);
          border-color: var(--primary);
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .timeframe-select {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.8rem;
          color: var(--foreground);
          cursor: pointer;
          min-width: 100px;
        }

        .timeframe-select:hover {
          border-color: var(--primary);
        }

        .timeframe-select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.1);
        }

        .remove-chart-btn {
          background: none;
          border: none;
          color: var(--muted-foreground);
          font-size: 1rem;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .remove-chart-btn:hover {
          background: var(--destructive);
          color: var(--destructive-foreground);
        }

        .chart-section {
          background: var(--card);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          display: ${autoScale ? 'flex' : 'block'};
          flex-direction: ${autoScale ? 'column' : 'initial'};
          height: ${autoScale ? '400px' : 'auto'};
        }

        :global(.dark) .chart-section {
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--muted);
          border-bottom: 1px solid var(--border);
        }

        .chart-header h4 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .symbol-name {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--muted-foreground);
          background: var(--background);
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid var(--border);
        }

        .chart-container-wrapper {
          position: relative;
          width: 100%;
          height: ${autoScale ? 'auto' : '300px'} !important;
          min-height: ${autoScale ? '200px' : '300px'} !important;
          max-height: ${autoScale ? 'none' : 'none'} !important;
          flex: ${autoScale ? '1' : 'none'};
        }

        .chart-container {
          width: 100%;
          height: ${autoScale ? '100%' : '300px'} !important;
          position: relative;
          min-height: ${autoScale ? '200px' : '300px'} !important;
          max-height: none !important;
          min-width: 300px;
          background: var(--background);
          display: block;
        }

        .chart-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: 4px;
        }

        :global(.dark) .chart-loading-overlay {
          background: rgba(24, 24, 27, 0.9);
        }

        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e0e0e0;
          border-top: 2px solid #2196f3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 8px;
        }

        .chart-loading-overlay p {
          margin: 0;
          font-size: 0.8rem;
          color: var(--foreground);
        }

        .chart-error-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 243, 205, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          border-radius: 4px;
        }

        .chart-error-overlay p {
          margin: 0;
          font-size: 0.8rem;
          color: #856404;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 768px) {
          .multi-timeframe-charts {
            gap: 16px;
          }

          .chart-container-wrapper {
            height: ${autoScale ? 'auto' : '225px'} !important;
            min-height: ${autoScale ? '180px' : '225px'} !important;
            max-height: none !important;
          }

          .chart-container {
            height: ${autoScale ? '100%' : '225px'} !important;
            min-height: ${autoScale ? '180px' : '225px'} !important;
            max-height: none !important;
          }

          .chart-section {
            height: ${autoScale ? '300px' : 'auto'};
          }

          .control-buttons {
            flex-wrap: wrap;
            gap: 4px;
          }

          .control-btn {
            padding: 4px 8px;
            font-size: 0.8rem;
            min-width: 28px;
          }

          .controls-header {
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
          }

          .available-timeframes {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 6px;
          }

          .timeframe-option {
            padding: 6px 8px;
            font-size: 0.75rem;
          }

          .header-controls {
            flex-direction: column;
            gap: 6px;
            align-items: stretch;
          }

          .timeframe-select {
            font-size: 0.75rem;
            padding: 3px 6px;
            min-width: 80px;
          }

          .symbol-name {
            text-align: center;
          }

          .chart-header {
            padding: 10px 12px;
          }

          .chart-header h4 {
            font-size: 0.9rem;
          }

          .symbol-name {
            font-size: 0.8rem;
            padding: 3px 6px;
          }
        }

        @media (max-width: 480px) {
          .chart-header {
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
          }

          .symbol-name {
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
});

MultiTimeframeChart.displayName = 'MultiTimeframeChart';

export default MultiTimeframeChart;
