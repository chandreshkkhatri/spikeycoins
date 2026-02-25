"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type SortingState,
  type FilterFn,
  type Row,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, Search, RefreshCw, ArrowUpDown } from "lucide-react";
import { cryptoApi } from "@/lib/crypto-api";

export interface TickerData {
  s: string;
  price: number;
  change_24h: number;
  change_12h?: number | null;
  change_8h?: number | null;
  change_4h?: number | null;
  change_1h?: number | null;
  high_24h: number;
  low_24h: number;
  range_position_24h: number;
  volume_usd: number;
  volume_base: number;
  market_cap?: number | null;
  normalized_volume_score: number;
}

const columnHelper = createColumnHelper<TickerData>();

const numberSort = (
  rowA: Row<TickerData>,
  rowB: Row<TickerData>,
  columnId: string
): number => {
  const a = rowA.getValue(columnId) as number | null | undefined;
  const b = rowB.getValue(columnId) as number | null | undefined;
  const numA =
    a === null || a === undefined ? Number.NEGATIVE_INFINITY : Number(a);
  const numB =
    b === null || b === undefined ? Number.NEGATIVE_INFINITY : Number(b);
  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return 1;
  if (isNaN(numB)) return -1;
  return numA - numB;
};

const formatNumber = (num: number | undefined | null): string => {
  if (num === null || num === undefined || isNaN(Number(num))) return "0";
  const number = Number(num);
  if (number >= 1e9) return (number / 1e9).toFixed(2) + "B";
  if (number >= 1e6) return (number / 1e6).toFixed(2) + "M";
  if (number >= 1e3) return (number / 1e3).toFixed(2) + "K";
  return number.toFixed(2);
};

const formatPercentage = (
  value: number | undefined | null
): React.ReactNode => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return <span className="text-muted-foreground text-xs">N/A</span>;
  }
  const percentage = Number(value);
  const colorClass = percentage >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  return (
    <span className={colorClass}>
      {percentage >= 0 ? "+" : ""}
      {percentage.toFixed(2)}%
    </span>
  );
};

const formatPrice = (value: number | undefined | null): string => {
  if (value === null || value === undefined || isNaN(Number(value)))
    return "N/A";
  const price = Number(value);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
};

export default function Ticker() {
  const [tickerArray, setTickerArray] = useState<TickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTickers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await cryptoApi.getTickers();
      const data = response.data?.data || response.data || [];
      setTickerArray(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching tickers:", err);
      setError("Failed to load market data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickers();

    // Auto-refresh every 30s
    const interval = setInterval(fetchTickers, 30000);
    return () => clearInterval(interval);
  }, []);
  const columns = useMemo(
    () => [
      columnHelper.accessor("s", {
        header: "Symbol",
        cell: (info) => (
          <strong className="text-blue-600 dark:text-blue-400">
            {info.getValue().replace("USDT", "/USDT")}
          </strong>
        ),
      }),
      columnHelper.accessor("price", {
        header: "Price (USD)",
        cell: (info) => (
          <span className="font-mono">${formatPrice(info.getValue())}</span>
        ),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_24h", {
        header: "24h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_12h", {
        header: "12h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_8h", {
        header: "8h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_4h", {
        header: "4h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("change_1h", {
        header: "1h Change",
        cell: (info) => formatPercentage(info.getValue()),
        sortingFn: numberSort,
      }),
      columnHelper.display({
        id: "highLow_24h",
        header: "24h High/Low",
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            <div className="text-green-600 dark:text-green-400">
              ${formatPrice(row.original.high_24h)}
            </div>
            <div className="text-red-600 dark:text-red-400">
              ${formatPrice(row.original.low_24h)}
            </div>
          </div>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor("range_position_24h", {
        header: "24hr Range Position",
        cell: (info) => {
          const value = info.getValue();
          if (value === null || value === undefined)
            return <span className="text-muted-foreground text-xs">N/A</span>;
          let colorClass = "text-orange-500";
          if (value < 25) colorClass = "text-red-600 dark:text-red-400";
          if (value > 75) colorClass = "text-green-600 dark:text-green-400";
          return (
            <span className={cn("font-bold", colorClass)}>
              {Number(value).toFixed(1)}%
            </span>
          );
        },
        sortingFn: numberSort,
      }),
      columnHelper.accessor("volume_usd", {
        header: "Volume (USD)",
        cell: (info) => (
          <span className="font-mono">${formatNumber(info.getValue())}</span>
        ),
        sortingFn: numberSort,
      }),
      columnHelper.accessor("market_cap", {
        header: "Market Cap",
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={cn("font-mono", !value && "text-muted-foreground")}>
              {value ? `$${formatNumber(value)}` : "N/A"}
            </span>
          );
        },
        sortingFn: numberSort,
      }),
    ],
    []
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: "change_24h", desc: true },
  ]);

  const resetSort = () => {
    setSorting([{ id: "change_24h", desc: true }]);
  };

  const customGlobalFilterFn: FilterFn<TickerData> = React.useCallback(
    (row, columnId, filterValue) => {
      const value = row.getValue(columnId) as
        | string
        | number
        | null
        | undefined;
      const sValue = String(value).toLowerCase();
      const fValue = String(filterValue).toLowerCase();
      return sValue.includes(fValue);
    },
    []
  );

  const table = useReactTable({
    data: tickerArray,
    columns,
    state: {
      sorting,
      globalFilter: searchQuery,
    },
    onSortingChange: setSorting,
    globalFilterFn: customGlobalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return (
      <div className="text-center p-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-lg text-muted-foreground">Loading market data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-8 text-center">
        <p className="text-lg font-semibold text-red-700 dark:text-red-400">
          Error Loading Data
        </p>
        <p className="text-muted-foreground mt-2">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={fetchTickers}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!tickerArray || tickerArray.length === 0) {
    return (
      <div className="text-center p-10 bg-muted/50 rounded-lg">
        <p className="text-lg font-semibold text-muted-foreground">No Data Available</p>
        <p className="text-muted-foreground mt-2">
          Click &apos;Refresh&apos; to load market data.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="text-sm text-muted-foreground">
          {tickerArray.length} USDT trading pairs available
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
            size="icon"
            title="Reset Sort"
            onClick={resetSort}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={fetchTickers}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          header.column.getCanSort() &&
                            "cursor-pointer select-none"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: <ChevronUp className="h-4 w-4" />,
                          desc: <ChevronDown className="h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between flex-wrap gap-4 text-sm">
        <div className="text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {tickerArray.length}{" "}
          pairs
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="text-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
