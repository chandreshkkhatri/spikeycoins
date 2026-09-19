**Market Watch product audit — 12 September 2026**

**Product verdict:** Market Watch provides useful market scanning and a consistent visual structure, but users cannot reliably complete the journey from noticing a move to investigating and saving a candidate. Data trust is the first release concern: some displayed market values are generated or substituted without disclosure. Fix that before expanding the feature set.

Assumed primary user: a self-directed crypto trader checking market conditions, finding relevant instruments, and deciding what deserves further investigation. This is a product hypothesis, not a conclusion from customer interviews. The recommended success outcome is informed investigation or saving an instrument; placing more trades is not the success metric.

**Scope and evidence**

Audited `/market-watch` and `/market-watch/screener`, their shared navigation, and the data-generation paths that affect the displayed information. Walked through both pages in Chromium at **1440 × 1000** and **390 × 844**, using an anonymous, non-admin session and intercepted synthetic responses. Exercised navigation, search, pagination, automatic refresh, empty/error states, and summary dialogs. No live market figures or private account data were used.

Browser observations establish interaction and layout behavior under the fixtures; source inspection establishes fallback-data and research-generation behavior. No production performance measurements, user interviews, analytics, contrast measurements, or full assistive-technology audit were performed. Proposed product impact remains a hypothesis to validate with users.

| Evidence | Artifact |
| --- | --- |
| Overview, desktop | [Screenshot](assets/market-watch-audit/overview-desktop.png) |
| Overview, mobile | [Screenshot](assets/market-watch-audit/overview-mobile.png) |
| Screener, desktop | [Screenshot](assets/market-watch-audit/screener-desktop.png) |
| Screener, mobile | [Screenshot](assets/market-watch-audit/screener-mobile.png) |
| Search with no matches | [Screenshot](assets/market-watch-audit/screener-no-results.png) |
| Empty API response | [Screenshot](assets/market-watch-audit/screener-empty.png) |
| Recorded interaction results | [Observations](assets/market-watch-audit/observations.json) |

Screenshots contain synthetic prices/stories and a Next.js development indicator. That indicator is not reported as a production UX defect.

**What works**

The overview groups major coins, movers, and stories into recognizable sections. Positive/negative changes include signs and directional icons as well as color. The screener supports numerical sorting, several change periods, range position, volume, and market capitalization. Story expansion and source links provide a foundation for deeper investigation. The mobile page avoids document-wide overflow; the table scrolls within its own container. Preserve these useful foundations.

**The intended journey and current gaps**

| User question | Current experience | Product need |
| --- | --- | --- |
| What market am I looking at? | “Market Watch” navigation opens “Crypto Dashboard”; the next page is titled “Market Watch.” | One stable section identity with Overview and Screener destinations. |
| What is moving? | Major-coin cards, gainers/losers, and multiple return periods. | Explicit market scope, data age, and trustworthy measurements. |
| Is this move worth investigating? | Sortable metrics and research stories, but no chart/detail action for ordinary screener users. | A symbol detail view that connects price context, liquidity, and related research. |
| How do I follow this instrument? | No save/watchlist action in these pages. | A contextual save action and a symbol-preserving handoff to Terminal. |
| Can I resume my scan? | Refresh resets pagination; reload clears search/sort state. | A stable reading position and retained scan settings. |

**Priorities**

P0 means a release-blocking trust issue. P1 means the next product iteration. P2 means subsequent usability and clarity work. These labels are product priorities, separate from the security priorities in the codebase review.

| ID | Priority | Finding |
| --- | --- | --- |
| MW-01 | P0 | Synthetic values appear as ordinary market data |
| MW-02 | P1 | Discovery actions lose context or end without a next step |
| MW-03 | P1 | Refresh disrupts scanning and gives no data-age context |
| MW-04 | P1 | Empty and failed states remove recovery controls |
| MW-05 | P1 | Mobile prioritizes the story feed over market scanning |
| MW-06 | P2 | Search and filtering do not support repeatable scans |
| MW-07 | P2 | Naming, market scope, and metric definitions are unclear |
| MW-08 | P2 | Research presentation obscures how claims were produced |
| MW-09 | P2 | Core interactions are difficult to operate by keyboard |

**MW-01 — Synthetic values appear as ordinary market data**

The backend generates BTC dominance change using `Math.random()` even when dominance itself was retrieved successfully. When upstream requests fail, fixed prices such as BTC at 43,000 and fixed dominance values can be returned through the normal overview response. The frontend renders them with the same treatment as observed data, beneath “Real-time” copy. There is also a frontend legacy-response fallback that inserts fixed dominance figures.

This makes a directional market signal untrustworthy; it is more serious than an absent refresh timestamp. Evidence is from source inspection, not a claim that the deployed service was serving fallback prices during this audit.

**Recommendation:** Remove generated change values from the production display. Represent unavailable measurements explicitly. Preserve last-known real values with their original observation time and a stale label; confine sample values to an unmistakable demo mode.

**Acceptance:** With the market provider unavailable, no fabricated price or percentage appears as current. Dominance change is calculated from real observations or shown as unavailable. A new fetch attempt never makes an old observation appear fresh.

Sources: [MarketOverviewService.ts](../web-server/src/crypto/services/MarketOverviewService.ts), lines 229–240 and 265–290; [MarketOverview.tsx](../ui/src/components/crypto/MarketOverview.tsx), lines 79–103.

**MW-02 — Discovery actions lose context or end without a next step**

Clicking BTC in the overview opens the generic screener with an empty search. Mover rows have a pointer/hover treatment but no click action. “View All Losers” opens the screener's default descending 24h sort: the fixture showed BTC at **+9%** first. The selected 7d context is not carried through either. Ordinary screener users have no chart/detail, save, or Terminal action; the optional Analyze action is admin-only.

**Recommendation:** Make instruments actionable and preserve symbol, market, direction, and period in navigation. Give ordinary users “View details” and “Add to watchlist,” with “Open in Terminal” as an explicit continuation that does not submit an order. Hide action styling from genuinely informational cards.

**Acceptance:** Selecting BTC opens BTC context; “View All Losers” preserves the period and negative ordering. A user can inspect and save a candidate without retyping its symbol. Returning to the scan restores its state.

Sources: [MarketOverview.tsx](../ui/src/components/crypto/MarketOverview.tsx), line 183; [GainersLosers.tsx](../ui/src/components/crypto/GainersLosers.tsx), lines 262–265 and 310–314; [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), columns and default sorting.

**MW-03 — Refresh disrupts scanning and gives no data-age context**

In the browser, both manual refresh and the automatic 30-second refresh moved the screener from page 2 to page 1. Overview and mover panels also replace populated content with loading skeletons on their refresh cycles. No visible observation time or stale-data status explains the data's age. The overview's backend refreshes on a two-minute cycle, so frontend polling frequency is not the same as underlying data freshness.

**Recommendation:** Refresh in place, preserve page/filter/sort state, and show the observation time and source. Keep old real data visible during a temporary failure with a stale indicator. Consider an explicit control for pausing ranked-row movement while inspecting a candidate.

**Acceptance:** A user on page 2 stays there through a successful background update when that page still exists. Loading never blanks a populated panel during routine refresh. A feed outage is distinguishable from unchanged prices.

Sources: [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), lines 117–139 and table configuration; [MarketOverview.tsx](../ui/src/components/crypto/MarketOverview.tsx), lines 70 and 116; [MarketOverviewService.ts](../web-server/src/crypto/services/MarketOverviewService.ts), line 40. Pagination reset was browser-confirmed.

**MW-04 — Empty and failed states remove recovery controls**

An empty ticker response displays “Click 'Refresh' to load market data,” but the Refresh button is absent. A failed 7d movers request removes both timeframe buttons, preventing a switch back to 24h from that panel. A screener fetch failure hides previously loaded rows. A search with no matches leaves an empty table and “Page 1 of 0,” without an explanatory no-results message.

**Recommendation:** Keep search, period selection, and retry controls available in every state. Distinguish no matching instruments, no provider data, and a failed update. Offer Clear search, Retry, or Switch period according to the cause.

**Acceptance:** Every empty/error state offers an actionable next step. A 7d failure permits a 24h switch. Zero matches never produce impossible pagination. Previously observed real data remains available with its age after an update failure.

Sources: [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), lines 360–387 and 491–507; [GainersLosers.tsx](../ui/src/components/crypto/GainersLosers.tsx), lines 170–216. All four cases were browser-confirmed.

**MW-05 — Mobile prioritizes the story feed over market scanning**

At 390px, the entire summary feed precedes movers. With seven fixture stories, Top Gainers started about **1,379px** down the page on an 844px-tall viewport; the component supports up to ten stories. The screener's 11 columns occupy about **999px**, with no pinned symbol column. Horizontal comparison loses the instrument label as users reach later metrics. The screen fits the viewport, but the task remains cumbersome.

**Recommendation:** Put movers before research on mobile, show a short initial story selection, and offer expansion. Start the mobile screener with symbol, price, selected-period change, and volume; put additional metrics in row details or a column selector. Pin the instrument identity during horizontal scrolling.

**Acceptance:** After the overview, the first discovery section on a phone is movers. Users can compare the primary metrics without horizontal scrolling, and can always identify the symbol when exploring additional columns.

Sources: [overview page](../ui/src/app/%28routes%29/market-watch/page.tsx), component order; [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), column definitions and table rendering. See the mobile screenshots.

**MW-06 — Search and filtering do not support repeatable scans**

Searching `BTC` works, but copying the displayed label `BTC/USDT` produces no matches. The footer says “Showing 1 of 15 pairs” after narrowing to one result, mixing displayed and total counts. Search is a generic table filter rather than a clearly defined pair search. There are no market-type, liquidity, or change-threshold filters, and scan settings reset on reload.

**Recommendation:** Normalize pair punctuation, distinguish matching versus total counts, and persist search/sort settings. Add a small first set of filters tied to actual user tasks: spot/perpetual, minimum volume, and selected-period change. Validate demand before adding a larger filter catalogue.

**Acceptance:** `BTC`, `BTCUSDT`, and `BTC/USDT` find the same instrument. The UI states the matching count. Reload and return navigation preserve a saved scan. Users can exclude thinly traded instruments without inspecting each row manually.

Source: [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), lines 322–334, 399–405, and 491–493. Search behavior and reload reset were browser-confirmed; added filters are a product proposal.

**MW-07 — Naming, market scope, and metric definitions are unclear**

The section has three overlapping names: Market Watch, Crypto Dashboard, and Screener. The global navigation loses its active highlight on the screener subroute. Rows display `/USDT` while headings say USD; a PERP badge does not explain the source or inclusion rules. BTC DOM and 24hr Range Position lack definitions, and volume omits its period in the screener heading. The broad “cryptocurrency market” copy does not establish the supported venue/universe.

**Recommendation:** Use “Market Watch” consistently with Overview/Screener navigation. State the actual venue, instrument coverage, quote asset, metric period, and source. Add short definitions for dominance, percentage-point change, and range position without crowding the table.

**Acceptance:** A first-time user can explain what instruments are included, what currency prices use, and what 0%/100% range position mean. The section stays highlighted on both routes.

Sources: [Header.tsx](../ui/src/components/layout/Header.tsx), lines 34 and 118; [screener page](../ui/src/app/%28routes%29/market-watch/screener/page.tsx); [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), column labels.

**MW-08 — Research presentation obscures how claims were produced**

Research is generated with an AI workflow, but story cards appear as “Top Stories” with HIGH/MEDIUM impact labels and no visible AI-generation label or impact definition. Source identity appears in the expanded view; the backend exposes only the first source through this summary contract. Research time and price-change period can be mistaken for current market context.

**Recommendation:** Label generated research, make source identity and generation time visible on the card, explain impact labels, and expose supporting sources in the detail view. Separate observed movement from an inferred explanation and show when no verified catalyst is available.

**Acceptance:** Users can distinguish reported facts from generated interpretation before opening a story and inspect its supporting sources. Impact labels describe their basis rather than implying an unexplained recommendation.

Sources: [MarketSummary.tsx](../ui/src/components/crypto/MarketSummary.tsx), lines 195–245 and 307–327; [ResearchService.ts](../web-server/src/crypto/services/ResearchService.ts), research generation and lines 899–914.

**MW-09 — Core interactions are difficult to operate by keyboard**

Overview navigation and sortable headers use clickable divs. The expanded story has no dialog role, and Escape did not close it in the browser. The close icon has no accessible name. These are task-completion barriers for keyboard users, not merely presentation details.

**Recommendation:** Use links/buttons for navigation and sorting, expose sort state, and use the existing accessible dialog primitive with focus management, a named close action, and Escape dismissal.

**Acceptance:** Users can open a coin, sort, read a story, and return to their previous focus using only the keyboard. This targeted check should be followed by a broader accessibility review.

Sources: [MarketOverview.tsx](../ui/src/components/crypto/MarketOverview.tsx), line 181; [Ticker.tsx](../ui/src/components/crypto/Ticker.tsx), lines 454–460; [MarketSummary.tsx](../ui/src/components/crypto/MarketSummary.tsx), lines 256–301.

**Proposed next iteration**

First remove misleading market values and introduce honest freshness/unavailability states. Then complete one coherent journey: **scan movers → inspect the selected instrument → save it or open its Terminal context → return to the same scan**. Include the wrong-direction handoff, refresh reset, and recovery-state fixes in that iteration. Move movers above research on mobile and reduce the default mobile table to primary metrics. Additional filters and research refinements can follow after users can complete that basic journey.

A suggested page order is: Market Watch title and scope; source/freshness status; major-coin overview; Movers and Screener access; a concise research section. The screener should retain its search/filter controls through loading, empty, and failed states.

**How to validate the product change**

Run short usability sessions with representative users: identify a suitable loser in a chosen period, inspect one symbol, save it, and return to the same scan; repeat on mobile and during a simulated data outage. Observe task completion, time spent re-entering context, accidental navigation, and whether users correctly interpret data age and generated research. Establish a baseline before setting numerical targets.

Instrument discovery-to-detail and detail-to-save completion, repeated no-result searches, failed recovery attempts, and unexpected pagination resets. Treat these as proposed measures; this audit collected no production usage data.

Both frontend and backend TypeScript checks passed. No application code was changed. The deliverables are this report, screenshots, and recorded browser observations; the existing codebase review and the user's handbook-file changes were preserved.
