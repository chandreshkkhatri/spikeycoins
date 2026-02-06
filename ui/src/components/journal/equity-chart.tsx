"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  LineSeries,
  UTCTimestamp,
} from "lightweight-charts";
import type { ChartDataPoint } from "./types";

interface EquityChartProps {
  data: ChartDataPoint[];
  loading: boolean;
}

export default function EquityChart({ data, loading }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || loading) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
        horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      },
      width: containerRef.current.clientWidth,
      height: 280,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
      crosshair: {
        horzLine: {
          visible: true,
          labelVisible: true,
        },
      },
    });

    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: data.length > 0 && data[data.length - 1].value >= 0
        ? "#22c55e"
        : "#ef4444",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    if (data.length > 0) {
      lineSeries.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
        })),
      );
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, loading]);

  if (loading) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return <div ref={containerRef} />;
}
