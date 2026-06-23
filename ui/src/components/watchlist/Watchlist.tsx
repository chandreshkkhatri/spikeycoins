"use client";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format-utils";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X, Search } from "lucide-react";
import { memo } from "react";
import SymbolSearchModal from "./SymbolSearchModal";
import TradingWindow from "./TradingWindow";
import WatchlistItemRow from "./WatchlistItemRow";
import WatchlistContextMenu from "./WatchlistContextMenu";
import { type WatchlistItem, type WatchlistProps } from "./watchlist-types";
import { useWatchlist } from "./useWatchlist";

const Watchlist = memo(function Watchlist(props: WatchlistProps) {
  const { accounts = [], selectedAccount, marketType = "binance-futures" } = props;

  const {
    watchlistItems,
    selectedSymbol,
    setSelectedSymbol,
    loading,
    error,
    setError,
    watchlists,
    currentWatchlistId,
    currentWatchlistName,
    showWatchlistDropdown,
    setShowWatchlistDropdown,
    showSymbolSearchModal,
    setShowSymbolSearchModal,
    isMobileWatchlistOpen,
    setIsMobileWatchlistOpen,
    addAnchorRect,
    setAddAnchorRect,
    showCreateWatchlistModal,
    setShowCreateWatchlistModal,
    newWatchlistName,
    setNewWatchlistName,
    success,
    setSuccess,
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchContainerRef,
    contextMenu,
    closeContextMenu,
    sortConfig,
    currentPrice,
    handleSort,
    filteredWatchlistItems,
    addSymbol,
    removeSymbol,
    switchWatchlist,
    handleOrderPlaced,
    handleContextMenu,
    handleSelectSymbol,
    createWatchlist,
    deleteWatchlist,
    getAuthHeaders,
  } = useWatchlist(props);

  const isDefaultBinance =
    selectedAccount?.accountType === "binance" &&
    watchlists.find((w) => w.id === currentWatchlistId)?.isSystem;

  if (loading) {
    return (
      <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="hidden h-full md:grid md:grid-cols-[320px_1fr]">
          <div className="h-full flex flex-col border-r border-border bg-card overflow-hidden">
            {/* Skeleton Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-3">
              <div className="h-6 w-32 animate-pulse rounded bg-muted"></div>
              <div className="h-8 w-8 animate-pulse rounded bg-muted"></div>
            </div>

            {/* Skeleton Column Headers */}
            <div className="grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border bg-muted/50 px-2 pr-1 py-2">
              <div className="h-3 w-12 animate-pulse rounded bg-muted"></div>
              <div className="h-3 w-10 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-10 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-8 animate-pulse rounded bg-muted justify-self-end"></div>
              <div className="h-3 w-8 animate-pulse rounded bg-muted justify-self-end"></div>
            </div>

            {/* Skeleton Items */}
            <div className="flex-1 min-h-0 overflow-y-auto p-0">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border px-2 pr-1 py-3 items-center"
                >
                  <div className="flex items-center gap-2">
                     <div className="h-4 w-16 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-16 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-12 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-3 w-10 animate-pulse rounded bg-muted"></div>
                  </div>
                  <div className="flex justify-end">
                    <div className="h-4 w-8 animate-pulse rounded bg-muted"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-full overflow-hidden bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">
                Loading trading interface...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (accounts.length === 0 || !selectedAccount) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-xl font-semibold text-foreground">
            Trading Panel
          </h3>
          <p className="text-muted-foreground">
            Select an account to view your watchlist
          </p>
          {accounts.length === 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => (window.location.href = "/accounts")}
            >
              Add Trading Account
            </Button>
          )}
        </div>
      </div>
    );
  }

  const renderSortHeader = (label: string, key: keyof WatchlistItem) => (
    <div
      className="flex cursor-pointer items-center gap-1 hover:text-foreground"
      onClick={() => handleSort(key)}
    >
      {label}
      {sortConfig.key === key &&
        (sortConfig.direction === "asc" ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        ))}
    </div>
  );

  const renderWatchlistContent = () => (
    <div
      ref={isSearchOpen ? searchContainerRef : null}
      className="h-full flex flex-col border-r border-border bg-card overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-3 h-[50px]">
        {isSearchOpen ? (
          <div
            className="flex-1 flex items-center gap-2 animate-in fade-in slide-in-from-right-5 mx-1"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Search..."
              className="flex-1 h-8 bg-transparent border-none text-sm focus:outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <>
            <div className="relative flex-1">
              <div
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                onClick={() => setShowWatchlistDropdown(!showWatchlistDropdown)}
              >
                <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                  {currentWatchlistName}
                </span>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </div>
              {showWatchlistDropdown && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95">
                  <div className="mb-1 border-b border-border pb-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 px-2 text-xs"
                      onClick={() => {
                        setShowCreateWatchlistModal(true);
                        setShowWatchlistDropdown(false);
                      }}
                    >
                      <Plus size={12} /> Create New Watchlist
                    </Button>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {watchlists.map((wl) => (
                      <div
                        key={wl.id}
                        className={`group flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                          wl.id === currentWatchlistId
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-popover-foreground"
                        }`}
                        onClick={() => switchWatchlist(wl.id, wl.name)}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="truncate">{wl.name}</span>
                          {wl.isSystem && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              System
                            </span>
                          )}
                        </div>
                        {!wl.isSystem && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => deleteWatchlist(wl.id, e)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setIsSearchOpen(true)}
                title="Search symbols"
              >
                <Search size={16} />
              </Button>
              {!isDefaultBinance && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    setAddAnchorRect({
                      top: rect.top,
                      left: rect.left,
                      bottom: rect.bottom,
                      right: rect.right,
                      width: rect.width,
                      height: rect.height,
                    });
                    setShowSymbolSearchModal(true);
                  }}
                  title="Add Symbol"
                >
                  <Plus size={18} />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {showCreateWatchlistModal && (
        <div className="border-b border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Watchlist Name"
              className="h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") createWatchlist();
                if (e.key === "Escape") setShowCreateWatchlistModal(false);
              }}
            />
            <Button size="sm" className="h-8 px-3" onClick={createWatchlist}>
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setShowCreateWatchlistModal(false)}
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
          {error}
        </div>
      )}

      {watchlistItems.length === 0 && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <p className="mb-2 text-sm">No symbols in your watchlist</p>
          {!isDefaultBinance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSymbolSearchModal(true)}
              className="gap-2"
            >
              <Plus size={14} /> Add Symbol
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Column Headers */}
        {watchlistItems.length > 0 && (
          <div className="sticky top-0 z-10 grid grid-cols-[1fr_70px_50px_45px_28px] gap-1 border-b border-border bg-muted px-2 pr-1 py-2 text-[10px] font-medium text-muted-foreground">
            {renderSortHeader("Symbol", "symbol")}
            <div className="justify-self-end">{renderSortHeader("Price", "lastPrice")}</div>
            <div className="justify-self-end">{renderSortHeader("24h %", "priceChangePercent")}</div>
            <div className="justify-self-end">{renderSortHeader("Vol", "volume")}</div>
            <div></div>
          </div>
        )}
        {filteredWatchlistItems.map((item) => (
          <WatchlistItemRow
            key={item.symbol}
            item={item}
            isSelected={selectedSymbol === item.symbol}
            isContextTarget={contextMenu.open && contextMenu.symbol === item.symbol}
            accountType={selectedAccount?.accountType}
            isSystemWatchlist={!!isDefaultBinance}
            onSelect={handleSelectSymbol}
            onContextMenu={handleContextMenu}
            onRemove={removeSymbol}
          />
        ))}
      </div>

      {/* Context Menu */}
      {selectedAccount && (
        <WatchlistContextMenu
          contextMenu={contextMenu}
          currentWatchlistId={currentWatchlistId}
          currentWatchlistName={currentWatchlistName}
          watchlists={watchlists}
          marketType={marketType}
          accountId={selectedAccount._id}
          getAuthHeaders={getAuthHeaders}
          onClose={closeContextMenu}
          onSuccess={(msg) => {
            setSuccess(msg);
            setTimeout(() => setSuccess(null), 3000);
          }}
          onError={(msg) => {
            setError(msg);
            setTimeout(() => setError(null), 3000);
          }}
          onCreateWatchlist={() => setShowCreateWatchlistModal(true)}
        />
      )}

      {/* Success message */}
      {success && (
        <div className="absolute bottom-4 left-4 right-4 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200 shadow-lg animate-in fade-in slide-in-from-bottom-2">
          ✓ {success}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      {/* Desktop View */}
      <div className="hidden h-full md:grid md:grid-cols-[320px_1fr]">
        {renderWatchlistContent()}
        <div className="h-full overflow-hidden bg-background">
          <TradingWindow
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            accounts={accounts}
            selectedAccount={selectedAccount}
            marketType={marketType?.includes("spot") ? "spot" : "futures"}
            onOrderPlaced={handleOrderPlaced}
            onSymbolSelect={setSelectedSymbol}
          />
        </div>
      </div>

      {/* Mobile View */}
      <div className="flex h-full flex-col md:hidden relative">
        <div
          className="flex items-center justify-between border-b border-border bg-card p-4 shadow-sm z-20 relative cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setIsMobileWatchlistOpen(!isMobileWatchlistOpen)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">
              {selectedSymbol || "Select Symbol"}
            </span>
            <ChevronDown
              size={20}
              className={`transition-transform duration-200 text-muted-foreground ${
                isMobileWatchlistOpen ? "rotate-180" : ""
              }`}
            />
          </div>
          {selectedSymbol && (
            <div className="flex flex-col items-end">
              <span className="font-mono font-medium text-foreground">
                {selectedAccount?.accountType === "binance"
                  ? formatPrice(currentPrice, "$")
                  : selectedAccount?.accountType === "upstox"
                  ? formatPrice(currentPrice, "₹")
                  : formatPrice(currentPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Watchlist Dropdown Overlay */}
        {isMobileWatchlistOpen && (
          <div className="absolute top-[61px] left-0 right-0 bottom-0 z-10 bg-background animate-in slide-in-from-top-5 fade-in duration-200 shadow-lg">
            {renderWatchlistContent()}
          </div>
        )}

        {/* Trading Window */}
        <div className="flex-1 overflow-hidden bg-background">
          <TradingWindow
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            accounts={accounts}
            selectedAccount={selectedAccount}
            marketType={marketType?.includes("spot") ? "spot" : "futures"}
            onOrderPlaced={handleOrderPlaced}
            onSymbolSelect={setSelectedSymbol}
          />
        </div>
      </div>

      {/* Symbol Search Modal */}
      {showSymbolSearchModal && selectedAccount && (
        <SymbolSearchModal
          isOpen={showSymbolSearchModal}
          onClose={() => setShowSymbolSearchModal(false)}
          onSelectSymbol={addSymbol}
          accountType={selectedAccount.accountType}
          anchorRect={addAnchorRect || undefined}
        />
      )}
    </div>
  );
});

export default Watchlist;
