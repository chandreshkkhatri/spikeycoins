'use client';

import { CandlestickSeries, ColorType, createChart, UTCTimestamp } from 'lightweight-charts';
import React, { useEffect, useRef, useState } from 'react';

interface TradingChartProps {
  symbol: string;
}

const TradingChart: React.FC<TradingChartProps> = ({ symbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ chart: any; series: any } | null>(null);
  const [timeframe, setTimeframe] = useState('1h');
  const [autoScale, setAutoScale] = useState(false);
  const [isLogScale, setIsLogScale] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Adjust chart height based on screen size and auto-scale setting
    const isMobile = window.innerWidth <= 768;
    let chartHeight;
    if (autoScale) {
      // Use parent container height minus controls height
      chartHeight = Math.max(
        (chartContainerRef.current.parentElement?.clientHeight || 300) - 50,
        150
      );
    } else {
      chartHeight = isMobile ? 135 : 188;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      autoSize: autoScale,
      layout: {
        background: { type: ColorType.Solid, color: isDarkMode ? '#18181b' : '#ffffff' },
        textColor: isDarkMode ? '#e4e4e7' : '#333',
      },
      grid: {
        vertLines: { color: isDarkMode ? '#27272a' : '#f0f0f0' },
        horzLines: { color: isDarkMode ? '#27272a' : '#f0f0f0' },
      },
      crosshair: {
        mode: 1, // Magnet
      },
      rightPriceScale: {
        borderColor: isDarkMode ? '#3f3f46' : '#e0e0e0',
        mode: isLogScale ? 1 : 0, // 1 = logarithmic, 0 = normal
        scaleMargins: {
          top: isMobile ? 0.15 : 0.1,
          bottom: isMobile ? 0.15 : 0.1,
        },
      },
      timeScale: {
        borderColor: isDarkMode ? '#3f3f46' : '#e0e0e0',
        rightOffset: isMobile ? 5 : 12,
        barSpacing: isMobile ? 3 : 6,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    chartRef.current = { chart, series };

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        const isMobile = window.innerWidth <= 768;
        let chartHeight;
        if (autoScale) {
          chartHeight = Math.max(
            (chartContainerRef.current.parentElement?.clientHeight || 300) - 50,
            150
          );
        } else {
          chartHeight = isMobile ? 135 : 188;
        }
        chartRef.current.chart.resize(chartContainerRef.current.clientWidth, chartHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.chart.remove();
      }
    };
  }, []);

  useEffect(() => {
    const fetchHistoricalData = async () => {
      if (!chartRef.current) return;

      try {
        // Determine vendor based on symbol (USDT = Binance, others = Kite)
        const vendor = symbol.endsWith('USDT') ? 'binance' : 'kite';
        const response = await fetch(
          `/api/historical-data?vendor=${vendor}&symbol=${symbol}&interval=${timeframe}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch historical data');
        }
        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('Historical data is not in expected format');
        }

        const formattedData = data.map((d: any) => ({
          time: (new Date(d.date).getTime() / 1000) as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));

        chartRef.current.series.setData(formattedData);
      } catch (error) {
        // eslint-disable-next-line no-console -- error is surfaced for debugging
        console.error('Error fetching historical data:', error);
      }
    };

    fetchHistoricalData();
  }, [symbol, timeframe]);

  // Effect to handle auto-scale and log-scale changes
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;

    try {
      const chart = chartRef.current.chart;

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
        chartHeight = Math.max(
          (chartContainerRef.current.parentElement?.clientHeight || 300) - 50,
          150
        );
      } else {
        chartHeight = isMobile ? 135 : 188;
      }

      chart.resize(chartContainerRef.current.clientWidth, chartHeight);

      console.log(
        `Updated trading chart: autoScale=${autoScale}, logScale=${isLogScale}, height=${chartHeight}`
      );
    } catch (error) {
      console.error('Error updating trading chart settings:', error);
    }
  }, [autoScale, isLogScale]);

  return (
    <div className="trading-chart">
      <div className="chart-controls">
        <div className="controls-left">
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </div>
        <div className="controls-right">
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
        </div>
      </div>
      <div ref={chartContainerRef} className="chart-container" />
      <style jsx>{`
        .chart-controls {
          padding: 8px;
          background: var(--muted);
          color: var(--muted-foreground);
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .controls-left,
        .controls-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-btn {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 28px;
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

        .chart-controls select {
          padding: 4px 8px;
          border: 1px solid var(--border);
          border-radius: 4px;
          font-size: 0.85rem;
          background: var(--background);
          color: var(--foreground);
          cursor: pointer;
        }

        .chart-container {
          width: 100%;
          height: ${autoScale ? '100%' : '188px'};
          flex: ${autoScale ? '1' : 'none'};
          min-height: ${autoScale ? '150px' : '188px'};
        }

        .trading-chart {
          width: 100%;
          display: flex;
          flex-direction: column;
          height: ${autoScale ? '100%' : 'auto'};
        }

        @media (max-width: 768px) {
          .chart-container {
            height: ${autoScale ? '100%' : '135px'};
            min-height: ${autoScale ? '120px' : '135px'};
          }

          .chart-controls {
            padding: 6px;
            flex-direction: column;
            gap: 6px;
          }

          .controls-left,
          .controls-right {
            gap: 6px;
          }

          .chart-controls select {
            font-size: 0.9rem;
            padding: 6px 10px;
          }

          .control-btn {
            padding: 3px 6px;
            font-size: 0.75rem;
            min-width: 24px;
          }
        }

        @media (max-width: 480px) {
          .chart-container {
            height: ${autoScale ? '100%' : '120px'};
            min-height: ${autoScale ? '100px' : '120px'};
          }
        }
      `}</style>
    </div>
  );
};

export default TradingChart;
