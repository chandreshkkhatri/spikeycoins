**Spikey Coins codebase review — 12 September 2026**

Reviewed commit: `2db20c8`. The working tree was clean when the review began. This report is the only repository change.

The highest-priority defects are an unauthenticated refresh-token query injection, an account authorization mismatch, and order handling that can remove existing protection before validating its replacement. These should be addressed before further production releases. The review identified **6 P1 findings and 5 P2 findings**. P1 means urgent security or trading-correctness work; P2 means a significant defect to address next.

**Scope and method**

Reviewed the Next.js/React frontend and Express/Mongoose backend, concentrating on authentication, account ownership, broker integration, futures order protection, frontend account/session state, and test/deployment configuration. Also sampled journal, gym, watchlist, market-data, and service-worker paths. This was a risk-focused review, not an exhaustive audit of every source line.

Ran existing tests, TypeScript checks, and lint scripts using installed dependencies and Node `v24.12.0`. Used isolated probes against transpiled source with synthetic users and mocked database/broker/HTTP operations to verify five defects. The refresh-token probe also exercised the installed Mongoose model's real query casting. No production database, broker account, live trade, or deployed service was accessed. Production builds, browser E2E execution, dependency vulnerability scanning, and deployment configuration validation were outside this review.

**Prioritized findings**

**1. P1 — Refresh-token input accepts MongoDB query operators and can issue another user's session**

Source: [auth/user.ts](../web-server/src/routes/auth/user.ts), lines 149–162 and 225–256; [refresh-token.ts](../web-server/src/models/refresh-token.ts), token schema.

The public refresh endpoint checks only whether `refreshToken` is truthy, then passes it directly into `RefreshToken.findOne({ token: refreshToken })`. A JSON object such as `{ "refreshToken": { "$ne": null } }` becomes a database predicate rather than a token value. If the selected record is an unexpired, unreplaced token, the route issues access and refresh tokens for that record's user without proof of possession. Replaced/expired records can affect which request succeeds; the defect does not require knowledge of a valid token.

Evidence: real Mongoose query casting preserved the operator. The actual route, with a matching synthetic token record supplied by a mock, returned HTTP 200 and credentials for the synthetic victim.

Fix: require a scalar string in the expected token format before database access; construct a strict equality lookup from validated input. Apply equivalent validation to logout, which also accepts an unchecked token value. Add tests rejecting objects, arrays, numbers, and malformed strings before any query executes.

**2. P1 — Account mutations authorize a different identifier from the account they change**

Source: [auth-middleware.ts](../web-server/src/lib/auth-middleware.ts), line 165; [accounts.ts](../web-server/src/routes/accounts.ts), lines 143–165 and 191–201.

`requireAccountAccess` prioritizes query/body `accountId` over the path ID. Update and delete handlers subsequently use `req.params.id`. Consequently, an authenticated request to `/api/accounts/<other-account>?accountId=<owned-account>` passes ownership validation for the owned account and mutates the other account. PATCH and PUT can overwrite credentials or metadata; DELETE can deactivate the other account. The update response also omits only `apiSecret`, leaving a stored `accessToken` exposed if present.

Evidence: the actual middleware and PATCH/DELETE handlers accepted an owned query ID and invoked mocked persistence with a different path ID. Both returned HTTP 200.

Fix: bind authorization to the route's canonical ID and use the authorized account throughout the handler. Reject conflicting IDs and scope database writes by both account ID and authenticated user ID. Allowlist update fields and use a consistent response serializer that removes broker tokens. Add cross-user mutation and conflicting-identifier tests.

**3. P1 — Upstox sandbox credentials can be overwritten without authentication**

Source: [auth/upstox.ts](../web-server/src/routes/auth/upstox.ts), lines 173–209; [auth/index.ts](../web-server/src/routes/auth/index.ts), route mounting.

`POST /api/auth/upstox/sandbox-token` has no authentication or ownership middleware. Anyone who knows a sandbox account ID can supply a replacement access token, which is saved to that account. The sandbox flag limits the affected accounts but does not provide ownership protection.

Evidence: invoking the actual route without authorization returned HTTP 200 and saved the synthetic replacement token through mocked persistence.

Fix: require authentication and account ownership before saving. Review the adjacent broker login/validation endpoints as part of the same boundary cleanup; callback ownership should be established through a verified OAuth transaction. Test anonymous and cross-user writes and ensure persistence is never called for either.

**4. P1 — A legacy public endpoint exposes user watchlists**

Source: [crypto.ts](../web-server/src/crypto/routes/crypto.ts), `/watchlists` registration; [crypto/routes/routes.ts](../web-server/src/crypto/routes/routes.ts), lines 477–503; [mongodb.ts](../web-server/src/lib/mongodb.ts).

`GET /api/watchlists?userId=<user>` is mounted without authentication and reads up to three records from the `watchlists` collection using the caller-supplied user ID. It uses the same central database connection as the protected application routes. Returned records can disclose symbols, account IDs, and watchlist metadata. The newer singular `/api/watchlist` router's ownership checks do not protect this separate endpoint.

Evidence: static tracing of router mounting, query construction, collection name, and shared database connection. No user data was retrieved.

Fix: retire the legacy endpoint or authenticate it and derive the user ID solely from the verified session. Test the legacy and current route names for anonymous and cross-user access.

**5. P1 — Missing secret configuration silently enables public fallback keys**

Source: [auth-middleware.ts](../web-server/src/lib/auth-middleware.ts), line 9; [encryption.ts](../web-server/src/lib/encryption.ts), line 3; [server.ts](../web-server/src/server.ts), line 98.

JWT signing, credential encryption, and Express sessions fall back to constants committed in source. A deployment without `JWT_SECRET` accepts tokens signed using the known fallback. Without `ENCRYPTION_KEY`, anyone obtaining encrypted account records can decrypt them using the known key. This finding is conditional on missing configuration; deployed secret values were not inspected.

Evidence: static review; no production environment assumptions or claims of compromise.

Fix: validate required secrets at startup and refuse production startup when missing or equal to known defaults. Add startup tests for missing configuration. If a deployed environment used a fallback, rotate the affected secrets and plan session invalidation/credential re-encryption with migration support.

**6. P1 — Invalid replacement stops can remove protection after opening an order**

Source: [binance-futures-order.service.ts](../web-server/src/lib/binance-futures-order.service.ts), lines 314, 340–350, 357–375, and 400–418.

The service submits the entry order, cancels existing SL/TP orders for the symbol and closing side, and only then validates replacement stop prices. A BUY with mark price 100 and stop loss 110 places the entry and cancels existing protection before reporting the invalid stop. Cancellation is also broader than the requested replacement: supplying only a stop loss can remove an existing take profit without replacing it. Broker rejection during replacement can leave the position exposed as well.

Evidence: the actual orchestrator with a mock broker recorded `entry → cancel-existing-protection`, returned an SL validation error, and placed no replacement protection. The UI does surface warnings; that does not restore cancelled orders.

Fix: validate all requested risk parameters before entry submission. Design replacement so existing protection is retained until replacement is confirmed, with explicit recovery for partial failure. Replace only the intended protective legs. Add tests asserting invalid risk settings cause no entry/cancellation, failed replacements preserve protection, and SL-only changes retain TP protection.

**7. P2 — Google OAuth state is not bound to the browser that initiated login**

Source: [auth/google.ts](../web-server/src/routes/auth/google.ts), lines 62–69 and 86–114.

OAuth state contains only Base64-encoded invite/redirect information. There is no random, single-use nonce tied to the initiating browser, and callbacks accept missing or malformed state. Redirect allowlisting prevents arbitrary redirect destinations but does not verify who started the login transaction. A callback carrying an attacker's valid authorization code can therefore establish the attacker's application session in another browser.

Evidence: static tracing of initiation and callback handling; no external OAuth flow was executed.

Fix: store a random, short-lived transaction identifier in a session or secure cookie and validate/consume it on callback. Keep invite and redirect data bound to that transaction. Test missing, altered, expired, replayed, and different-browser state.

**8. P2 — Requests queued during manual token refresh never settle**

Source: [api.ts](../ui/src/lib/api.ts), lines 61–108, 147–162, and 180; [auth-context.tsx](../ui/src/contexts/auth-context.tsx), manual refresh usage.

The response interceptor queues 401 requests whenever `isRefreshing` is true. Queue processing happens only in the interceptor branch that initiates a refresh. If `manualRefreshTokens()` starts the refresh instead, concurrent 401 requests enter the queue, but successful or failed completion never drains it. Their promises remain pending, which can leave account panels loading indefinitely.

Evidence: a mocked-transport probe started manual refresh, queued a 401, completed refresh successfully, and observed that the queued request remained unresolved.

Fix: settle all waiters within the shared refresh lifecycle, or have each interceptor await the same refresh promise and perform its own bounded retry. Add success and failure tests covering overlap between manual and interceptor-triggered refresh.

**9. P2 — Late account responses can repopulate panels after account selection changes**

Source: [useAccountCardData.ts](../ui/src/hooks/useAccountCardData.ts), lines 134–147 and 205–240; [PositionsCard.tsx](../ui/src/components/positions/PositionsCard.tsx), position totals; [HoldingsCard.tsx](../ui/src/components/holdings/HoldingsCard.tsx), holding totals.

Changing selected accounts clears data and starts new requests, but old requests have no cancellation or generation check. If account A's request finishes after switching to B, its success handler appends A's items to the current state. Panel totals aggregate that state directly, so B's view can include A's positions or holdings. Older completion/error handlers can also overwrite the newer loading/error state.

Evidence: static trace of asynchronous writes and consumers; this race was not exercised in a browser.

Fix: associate requests with the active fetch generation and discard stale results, including errors and loading updates. Cancellation can complement that guard. Add a deferred-response test: start A, switch to B, resolve B, then A; only B's data and status should remain.

**10. P2 — Anonymous demo-account loading contradicts backend authentication requirements**

Source: [account-context.tsx](../ui/src/contexts/account-context.tsx), lines 91–92 and 161–169; [accounts.ts](../web-server/src/routes/accounts.ts), line 15; [demo-account-service.ts](../web-server/src/lib/demo-account-service.ts), documented anonymous behavior.

The account provider deliberately fetches `/api/accounts` while logged out, expecting demo-only results. The backend applies `requireAuth` to the entire accounts router, so a fresh anonymous browser receives 401 instead of the configured demo account. The shared demo workflow cannot initialize as described. Public market-data endpoints remain a separate capability.

Evidence: static verification of the frontend request and mounted backend middleware.

Fix: define an explicit public, credential-free demo metadata endpoint and use it for anonymous initialization, or update the product to require login and stop making that anonymous request. Keep trading mutations authenticated. Test the chosen behavior from empty browser storage.

**11. P2 — The default frontend test command collects Playwright tests and fails**

Source: [vitest.config.ts](../ui/vitest.config.ts), lines 7–10; [gym.spec.ts](../ui/e2e/gym.spec.ts), line 3.

The Vitest configuration does not restrict discovery to unit tests or exclude `e2e/`. `npm test` collects the Playwright suite and throws `Playwright Test did not expect test.describe() to be called here`. The unit assertions pass, but the documented test command exits unsuccessfully.

Evidence: reproduced directly: 13 unit-test files and 97 tests passed; `e2e/gym.spec.ts` failed during collection.

Fix: give Vitest an explicit source-test include pattern or exclude the E2E directory. Keep Playwright execution in its separate script. Verify `npm test` exits successfully and the separate Playwright configuration still discovers its suite.

**Verification results**

| Check | Result |
| --- | --- |
| Backend: `npm test` | PASS — 4 files, 49 tests |
| Frontend: `npm test` | FAIL — 13 files/97 unit tests passed; 1 Playwright collection failure |
| Backend: `npm run type-check` | PASS |
| Frontend: `./node_modules/.bin/tsc --noEmit --incremental false` | PASS |
| Backend: `npm run lint` | FAIL — 16 errors, 242 warnings |
| Frontend: `npm run lint` | FAIL — 84 errors, 45 warnings |
| Isolated probes | Confirmed findings 1, 2, 3, 6, and 8 with synthetic data/mocked dependencies |
| Production builds and browser E2E | Not run |

The review probes verify local code behavior, not successful exploitation of a deployed application. Logs and the temporary probe script were generated under `/tmp`; they are not repository deliverables.

**Architecture and maintenance observations**

The repository has useful foundations: TypeScript passes in both projects, most trading routes share authentication/account middleware, broker construction has a common factory, and the newer watchlist and gym routes explicitly check ownership. Existing tests exercise futures-order helpers, broker factory behavior, formatting, account cards, and UI interactions. The active [AccountSelector.test.tsx](../ui/src/components/account-selector/AccountSelector.test.tsx) covers selection, demo display, and empty-state rendering; its tests passed. No confirmed defect was found in that component's selection callback during this review.

The most consequential gaps sit between those tested units: route authorization and input validation, refresh coordination, asynchronous account switching, and protective-order replacement. The four backend test files do not include route/authentication integration suites. Passing current unit tests therefore provides limited assurance about these boundaries; no coverage percentage was measured.

Both [production](../.github/workflows/deploy-prod.yml) and [development](../.github/workflows/deploy-dev.yml) workflows install dependencies, build, and restart the backend without running tests or lint. Add required verification before deployment, including the frontend checks for frontend changes. Address lint errors with particular attention to React hook issues; avoid treating the warning count as equivalent to a defect count.

Documentation also overstates some guarantees. [ARCHITECTURE.md](ARCHITECTURE.md) describes AES-256-GCM with an authentication tag, while [encryption.ts](../web-server/src/lib/encryption.ts) implements AES-256-CBC without a tag. Only API key/secret fields are encrypted by the account model; broker access/refresh tokens are ordinary fields. Plan an authenticated-encryption migration if adopting the documented design, and correct documentation meanwhile. The frontend README describes tests as not yet set up and mentions a nonexistent `type-check` script, despite the working Vitest setup and direct TypeScript command.

**Recommended sequence**

1. Close refresh-token query injection, the account mutation mismatch, anonymous credential writes, and the legacy watchlist disclosure. Validate production secret requirements and add focused route-level regression tests.
2. Repair protective-order replacement sequencing and test invalid inputs and partial broker failures before resuming changes to trading behavior.
3. Fix OAuth transaction binding, refresh waiters, stale account responses, and the anonymous demo contract.
4. Separate test runners, resolve lint errors, and require verification before deployment. Update architecture/setup documentation to match the implementation.
