'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Users } from 'lucide-react';

interface TradingTabsProps {
  className?: string;
  hasHoldings?: boolean;
  hasAccount?: boolean;
}

export default function TradingTabs({
  className = '',
  hasHoldings = false,
  hasAccount = true,
}: TradingTabsProps) {
  return (
    <div className={`trading-tabs-container ${className}`}>
      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Active Orders</h3>
            <div className="flex items-center gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="grid grid-cols-6 gap-4 p-4 font-semibold border-b bg-muted/50">
              <div>Symbol</div>
              <div>Type</div>
              <div>Qty</div>
              <div>Price</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
            <div className="p-8 text-center text-muted-foreground">No active orders</div>
          </div>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Open Positions</h3>
            <div className="flex items-center gap-2">
              <Select defaultValue="all">
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  <SelectItem value="kite">Zerodha Kite</SelectItem>
                  <SelectItem value="upstox">Upstox</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                Square Off All
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="grid grid-cols-7 gap-4 p-4 font-semibold border-b bg-muted/50">
              <div>Symbol</div>
              <div>Qty</div>
              <div>Avg Price</div>
              <div>LTP</div>
              <div>P&L</div>
              <div>Day Change</div>
              <div>Actions</div>
            </div>
            <div className="p-8 text-center text-muted-foreground">No open positions</div>
          </div>
        </TabsContent>

        <TabsContent value="holdings" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Portfolio Holdings</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Portfolio Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Portfolio</DropdownMenuLabel>
                <DropdownMenuItem>Export Holdings</DropdownMenuItem>
                <DropdownMenuItem>Download Report</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Sync Holdings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {!hasAccount ? (
            /* No Account Selected State */
            <div className="text-center py-12 px-6">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                  No Account Selected
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Please select a trading account to view your portfolio holdings
                </p>
                <div className="text-xs text-muted-foreground/70">
                  Select an account from the dropdown above to get started
                </div>
              </div>
            </div>
          ) : !hasHoldings ? (
            /* No Holdings State */
            <div className="text-center py-12 px-6">
              <div className="max-w-sm mx-auto">
                <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                  No Holdings Yet
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You don't have any stocks or securities in your portfolio yet
                </p>
                <Button variant="outline" size="sm" className="mt-2">
                  Start Trading
                </Button>
                <div className="text-xs text-muted-foreground/70 mt-3">
                  Your holdings will appear here once you make your first purchase
                </div>
              </div>
            </div>
          ) : (
            /* Holdings Exist - Show Data */
            <>
              {/* Portfolio Summary Cards */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
                  <div className="text-xs opacity-90 mb-1">Current Value</div>
                  <div className="text-lg font-bold">₹2,05,000</div>
                </div>
                <div className="bg-gradient-to-r from-gray-500 to-gray-600 text-white p-4 rounded-lg">
                  <div className="text-xs opacity-90 mb-1">Total Investment</div>
                  <div className="text-lg font-bold">₹1,82,500</div>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
                  <div className="text-xs opacity-90 mb-1">Total P&L</div>
                  <div className="text-lg font-bold">+₹22,500</div>
                </div>
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white p-4 rounded-lg">
                  <div className="text-xs opacity-90 mb-1">Total P&L %</div>
                  <div className="text-lg font-bold">+12.33%</div>
                </div>
              </div>

              <div className="border rounded-lg">
                <div className="grid grid-cols-8 gap-4 p-4 font-semibold border-b bg-muted/50">
                  <div>Symbol</div>
                  <div>Qty</div>
                  <div>Avg Price</div>
                  <div>LTP</div>
                  <div>Current Value</div>
                  <div>P&L</div>
                  <div>P&L %</div>
                  <div>Actions</div>
                </div>
                <div className="space-y-2 p-4">
                  <div className="grid grid-cols-8 gap-4 p-3 hover:bg-muted/50 rounded-lg border border-transparent hover:border-border/50 transition-all">
                    <div className="flex flex-col">
                      <div className="font-semibold">RELIANCE</div>
                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                        NSE
                      </div>
                    </div>
                    <div className="font-medium">50</div>
                    <div className="text-sm">₹2,200.00</div>
                    <div className="font-medium text-green-600">₹2,500.00</div>
                    <div className="font-medium">₹1,25,000</div>
                    <div className="font-semibold text-green-600">+₹15,000</div>
                    <div className="font-semibold text-green-600">+13.64%</div>
                    <div>
                      <Button variant="ghost" size="sm" className="h-8">
                        Sell
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-4 p-3 hover:bg-muted/50 rounded-lg border border-transparent hover:border-border/50 transition-all">
                    <div className="flex flex-col">
                      <div className="font-semibold">TCS</div>
                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                        NSE
                      </div>
                    </div>
                    <div className="font-medium">25</div>
                    <div className="text-sm">₹3,100.00</div>
                    <div className="font-medium text-green-600">₹3,200.00</div>
                    <div className="font-medium">₹80,000</div>
                    <div className="font-semibold text-green-600">+₹2,500</div>
                    <div className="font-semibold text-green-600">+3.23%</div>
                    <div>
                      <Button variant="ghost" size="sm" className="h-8">
                        Sell
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-4 p-3 hover:bg-muted/50 rounded-lg border border-transparent hover:border-border/50 transition-all">
                    <div className="flex flex-col">
                      <div className="font-semibold">INFY</div>
                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                        NSE
                      </div>
                    </div>
                    <div className="font-medium">10</div>
                    <div className="text-sm">₹1,850.00</div>
                    <div className="font-medium text-red-600">₹1,750.00</div>
                    <div className="font-medium">₹17,500</div>
                    <div className="font-semibold text-red-600">-₹1,000</div>
                    <div className="font-semibold text-red-600">-5.41%</div>
                    <div>
                      <Button variant="ghost" size="sm" className="h-8">
                        Sell
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Market Watchlist</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Add Symbol
              </Button>
              <Button variant="trading" size="sm">
                Create Alert
              </Button>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="grid grid-cols-6 gap-4 p-4 font-semibold border-b bg-muted/50">
              <div>Symbol</div>
              <div>LTP</div>
              <div>Change</div>
              <div>% Change</div>
              <div>Volume</div>
              <div>Actions</div>
            </div>
            <div className="space-y-2 p-4">
              <div className="grid grid-cols-6 gap-4 p-2 hover:bg-muted/50 rounded">
                <div className="font-medium">NIFTY 50</div>
                <div className="text-green-600">24,850.25</div>
                <div className="text-green-600">+125.30</div>
                <div className="text-green-600">+0.51%</div>
                <div className="text-sm text-muted-foreground">-</div>
                <div>
                  <Button variant="ghost" size="sm">
                    Trade
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-4 p-2 hover:bg-muted/50 rounded">
                <div className="font-medium">RELIANCE</div>
                <div className="text-red-600">2,847.15</div>
                <div className="text-red-600">-23.85</div>
                <div className="text-red-600">-0.83%</div>
                <div className="text-sm text-muted-foreground">1,23,456</div>
                <div>
                  <Button variant="ghost" size="sm">
                    Trade
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
