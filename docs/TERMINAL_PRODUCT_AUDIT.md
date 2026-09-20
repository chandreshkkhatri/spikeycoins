# Terminal product audit — 20 September 2026

Terminal has a useful integrated workspace, but trustworthy market inputs and
account-bound order state need attention before further trading features.

## Scope and evidence

Reviewed Terminal, watchlist selection, chart lifecycle, order entry, SL/TP
retry, position closing, and server-side order routing. Exercised Chromium at
390 × 844 with intercepted synthetic API responses and blocked WebSockets:
no account, delayed watchlist loading, and a ready demo account opening
HYPEUSDT while only BTCUSDT belonged to the watchlist. No orders were submitted,
no real account data was changed, and no live execution was tested.

Browser observations below are limited to those fixtures. Account-switch and
retry findings are source-based risks, not reproduced wrong-account trades.
Desktop visual review, complete keyboard testing, Upstox behavior, exchange
rejection handling, and ambiguous order-outcome reconciliation remain to be
validated. No application code was changed for this audit.

## What works

- Market Watch supplies the selected instrument and a return-to-scan link.
- Charts, order entry, depth, positions and orders share one workspace.
- The server applies authentication and account ownership checks to order routes.
- Position close requests use reduce-only and ask for confirmation.
- Order entry exposes partial SL/TP failure warnings and a dedicated retry action.
- Existing component tests cover order payloads and SL/TP retries.

## Findings

| ID | Priority | Finding and evidence | Acceptance |
| --- | --- | --- | --- |
| T-01 | P0 | Order-book fallback generates random quantities/totals and synthetic levels; rows still populate the order price when clicked. A small “(mock)” label depends on connection state, not the origin of displayed data. Browser-confirmed with a disconnected fixture. | No generated levels in the ordinary trading interface. Empty/stale depth is explicit; unavailable levels cannot set an order price. |
| T-02 | P0 | Percentage sizing uses a fixed $1,000 balance when balance is unavailable/zero. Account sync also uses availableBalance OR equity, so a real zero available balance can become total equity. Submit is disabled for submission/demo auth only, not data readiness. Source-confirmed. | Distinguish zero, missing and stale funds. No guessed sizing. Submission validates current account, symbol rules and required inputs; stale/missing data is explained. |
| T-03 | P1 | An instrument opened outside the watchlist gets a zero currentPrice because the price lookup only searches watchlistItems. HYPEUSDT displayed $0.00 in the browser fixture. | Selected-instrument quotes work independently of membership. Missing quotes display unavailable, not zero. |
| T-04 | P1 | Depth still uses fstream /ws instead of the documented /public/ws namespace. | Use the current depth endpoint, validate messages, and distinguish transport connection from fresh depth. |
| T-05 | P0 investigation | orderForm.accountId is initialized from props but is not explicitly synchronized with later account changes. Chart account and submit use this stored ID. RetryState omits the originating account/order ID and retry uses orderForm.accountId. Parent loading can remount the component, mitigating some switch paths, but is not an explicit account-binding contract. | Tests cover account switches and late responses. Drafts, request results and protection retries remain bound to their originating account/symbol/order. Never rely on incidental remounts. |
| T-06 | P1 | Both desktop and mobile TradingWindow trees mount, with CSS hiding one. Eight chart instances were present for four visible timeframes in the mobile fixture. | One active trading workspace, with one set of chart subscriptions and draft state at each viewport. |
| T-07 | P1 | Loading renders a desktop-only skeleton (hidden below md), leaving mobile blank. Browser-confirmed. No-account CTA routes to /accounts, while the app's Brokers route is /brokers. | Visible mobile loading/recovery feedback and a working account-setup destination. |
| T-08 | P2 | Approximate liquidation calculation is displayed as “Liquidation Price”; it uses simplified margin tiers and omits funding/account effects. Source-confirmed. | Label estimates clearly and explain their limitations; distinguish broker-reported liquidation values. |
| T-09 | P2 | Watchlist sorting and the mobile instrument dropdown use clickable divs. | Keyboard-operable buttons, named controls, sort/expanded state and focus handling. |

P0 here means resolve or explicitly rule out before treating the live-order
journey as release-ready. It does not claim an observed financial loss or a
server authorization bypass.

## Source references

- [MarketDepth.tsx](../ui/src/components/watchlist/MarketDepth.tsx): depth
  connection around line 156, generated fallback around 335, clickable levels
  around 436 and 453.
- [useWatchlist.ts](../ui/src/components/watchlist/useWatchlist.ts): currentPrice
  around 175, requested-symbol preservation around 158.
- [Watchlist.tsx](../ui/src/components/watchlist/Watchlist.tsx): mobile-hidden
  loading around 66, no-account CTA around 147, duplicate TradingWindow mounts
  around 418 and 469.
- [TradingWindow.tsx](../ui/src/components/watchlist/TradingWindow.tsx):
  RetryState around 57, initial account around 101, balance sync around 214,
  context reset around 234, sizing fallback around 1086/1108, submit around
  1129, retry around 1320, liquidation display around 2071.
- [orders.ts](../web-server/src/routes/orders.ts): router authorization around
  12, market routing around 143.
- [TradingPanelTabs.tsx](../ui/src/components/watchlist/TradingPanelTabs.tsx):
  per-position and bulk closing around 700–795. Bulk closing is sequential;
  partial completion and retries deserve a dedicated follow-up test.
- [Binance current Futures depth documentation](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/public):
  partial depth uses /public/ws/{symbol}@depth{levels}@{updateSpeed}.

## Recommended first implementation slice

**Trustworthy inputs before order submission** (T-01–T-04 and account binding
from T-05 where necessary for readiness).

1. Introduce explicit quote/depth availability and freshness for the selected
   account, venue and symbol, independent of watchlist membership.
2. Migrate Futures depth, remove synthetic fallback and prevent stale/absent
   depth from silently supplying the order form.
3. Preserve zero available balance; remove $1,000 sizing substitutes. Make
   percentage sizing and order readiness depend on verified, matching inputs.
4. Bind submission and protection-retry context explicitly; test account and
   instrument switching while requests are in flight.
5. Verify in isolated browser fixtures: unsaved instrument, no funds, delayed
   account/rules responses, silent feed, reconnect, account switch, accepted
   entry with failed protection, and late responses. Mock every order endpoint.

### Implementation checkpoint: verified depth

T-01 and T-04 are implemented:

- Removed generated depth prices, quantities and totals.
- Futures uses the public stream and its a/b payload; Spot retains asks/bids.
- Validates symbol, levels and Futures event age before accepting data.
- Missing, disconnected or silent depth is cleared; retries back off from one
  second to 30 seconds. Ten seconds without a valid message expires the book.
- Symbol/market changes remount the depth state; late old-stream messages cannot
  populate the new instrument. Click-time freshness also guards suspended timers.
- Price rows are keyboard-operable buttons. Ask aggregation rounds upward and
  bid aggregation downward, including precision steps greater than one.
- Mocked component tests cover both venues, invalid/stale messages, reconnects,
  pending updates, symbol switches, unmount cleanup and unsupported accounts.

The rest of the first slice remains open: independent selected-symbol quotes,
verified funds/rules readiness, removal of guessed sizing, and explicit
account/order-bound protection retries (T-02, T-03, T-05). This checkpoint does
not make the complete live-order journey release-ready. No live orders were
placed during verification.

Keep responsive workspace consolidation and navigation fixes after that
foundation; revisit positions/bulk-close outcome recovery subsequently.
