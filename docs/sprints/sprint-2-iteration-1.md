# Plan: Sprint-2 Iteration 1 — `issueSession` helper + Upstox API typing

## Context

First iteration of [Sprint-2](sprint-2-plan.md): both items are backend-only, contained, and verifiable purely by `tsc` + the existing test suite — no new test-coverage gaps opened, no behavior change beyond what's described.

---

## Part 1 — BG-026: `issueSession` helper

### What's actually duplicated
Read all four candidate sites in `routes/auth/`. Three are identical:
- [`user.ts` `/register`](../../web-server/src/routes/auth/user.ts#L84) (lines 84–93)
- [`user.ts` `/login`](../../web-server/src/routes/auth/user.ts#L135) (lines 135–144, plus a `cleanupOldTokens` call `/login` has and `/register` deliberately doesn't — new user, nothing to clean up — **preserve this asymmetry**, don't add cleanup to register)
- [`google.ts` callback](../../web-server/src/routes/auth/google.ts#L215) (lines 215–224)

All three do exactly:
```ts
const accessToken = generateToken(user._id.toString(), user.email);
const refreshToken = generateRefreshToken();
await RefreshToken.create({
  userId: user._id,
  token: refreshToken,
  expiresAt: getRefreshTokenExpiry(),
});
```

`/refresh`'s token-rotation path is **not** a 4th copy of this — it marks the old token `replacedAt`/`replacedByToken` and has a grace-period-reuse branch that returns an *existing* token without creating a new one. Don't force it into the same helper; touching `/refresh`'s rotation logic is out of scope here (it's a security-sensitive path, not a duplication problem).

### The helper
Add to [`auth-middleware.ts`](../../web-server/src/lib/auth-middleware.ts) (199 lines today, already the home of `generateToken`/`generateRefreshToken`/`getRefreshTokenExpiry` — no new file needed):
```ts
export async function issueSession(user: IUser): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateToken(user._id.toString(), user.email);
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    userId: user._id,
    token: refreshToken,
    expiresAt: getRefreshTokenExpiry(),
  });
  return { accessToken, refreshToken };
}
```
Replace the 3 sites with a call to `issueSession(user)`. `/login` keeps its separate `cleanupOldTokens` call immediately after (unrelated concern, don't fold it in). `google.ts`'s caller still builds its own `URLSearchParams`/redirect from the returned pair; `user.ts`'s callers still build their own `res.json(...)`. The helper only owns token generation + persistence, not the response shape — that's what makes it safe to share across a JSON-response site and a redirect site.

### Backlog correction
While filing this, fix BG-026's description in `docs/BACKLOG.md` — it currently says "...→ set cookies", but no cookies are set anywhere in this flow (tokens go in the JSON body or redirect URL params). Correct the wording when marking it done.

### Verification
- `cd web-server && npx tsc --noEmit && npm run build` — clean.
- `npx eslint src/lib/auth-middleware.ts src/routes/auth/*.ts` — no new issues.
- No new tests required (pure extraction of already-untested code paths — these routes have no existing test file; adding one is out of scope for this light item). Manual smoke: register, login, and Google OAuth callback each still return a valid `{ accessToken, refreshToken }` pair.

---

## Part 2 — BG-027: Upstox API typing

### Scope (re-confirmed from Sprint-1 iteration-3 grounding)
In [`upstox-service.ts`](../../web-server/src/lib/upstox-service.ts), of the 27 `any`s:
- **Fix (this iteration):** return types on `generateSession`, `getProfile`, `getFunds`, `getPositions`, `getHoldings`, `getOrders`, `getQuote`, `getLTP`, `getOHLC`, `getHistoricalData` (our own `fetch()`-based REST calls — real, modelable Upstox API v2 shapes), plus the 3 SDK *param* shapes on `placeOrder`/`modifyOrder`/`convertPosition`.
- **Leave alone:** `private client: any` / `getUpstoxClient(): any` / the `(response as any).data` casts on SDK-routed calls (`revokeAccessToken`, the 3 order methods, `getQuote`/`getLTP`/`getOHLC`'s `MarketQuoteApi` calls, `convertPosition`) — these touch the untyped `upstox-js-sdk` CommonJS module; typing them would mean vendoring SDK type defs, out of scope.

### Approach
Add a small set of local interfaces (new file `web-server/src/lib/upstox-types.ts`, since these shapes are reused across `upstox-service.ts` and will propagate into `trading.ts`/`funds.ts`/`holdings.ts`/`orders.ts`/`positions.ts`): `UpstoxFunds`, `UpstoxPosition`, `UpstoxHolding`, `UpstoxOrder`, `UpstoxQuote`, `UpstoxProfile`, `UpstoxCandle`, `UpstoxPlaceOrderParams`. Model fields from what the consuming code in `format-utils.ts`/`trading.ts` actually reads off these objects today (e.g. `formatDefaultPosition` reads `tradingsymbol`/`netQty`/`average_price`/`ltp`/`mtm`/`pnl_percentage` — that's the real shape, not Upstox's full docs surface, which has many fields nothing here touches). Update `upstox-service.ts`'s signatures to use them, then follow the cascade into the 6 consuming route files, replacing their local `any`/`any[]` annotations with the new types where they line up 1:1.

### Verification
- `cd web-server && npx tsc --noEmit && npm run build` — clean (this is the real safety net here: if the new interfaces are missing a field some call site reads, the compiler catches it immediately).
- `npx eslint` on every touched file — confirm only `no-explicit-any` warnings are removed, zero new errors (same diff-against-baseline check used for BG-025's mechanical tier).
- `npm run test` — existing suite (49 tests) still green; no behavior change, just signature typing.
- Manual smoke (per Part 1's pattern from iteration-3): load `/api/trading/summary`, `/api/positions`, `/api/orders`, `/api/holdings`, `/api/funds` for a real or sandboxed Upstox account, confirm responses are unchanged.

---

## Sequencing & commits
1. Part 1 (BG-026) first — small, fast, no dependency on Part 2.
2. Part 2 (BG-027) — bigger; commit the new `upstox-types.ts` + `upstox-service.ts` signature changes separately from the cascade into the route files, so a `tsc` failure in the cascade is easy to bisect.

## Notes
- No new dependencies.
- BG-028 (TradingWindow test coverage, prerequisite for BG-024) is the next iteration — not started here.
