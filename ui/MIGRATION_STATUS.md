# Next.js Migration Status

## Quick Reference

**Last synced vite-ui commit:** `d438253` (fix SL/TP prices not initializing on first instrument load)
**Last sync date:** 2026-01-16
**Migration branch:** `migrate-to-nextjs`

## How to Check for Pending Changes

```bash
# See what changed in vite-ui since last sync
./scripts/migration-diff.sh

# Or manually:
git diff d438253..HEAD --stat -- vite-ui/
```

## Migration Status by Component

### Core Infrastructure ✅
- [x] Project setup (Next.js 14+ with App Router)
- [x] Tailwind CSS configuration (v3 with custom colors)
- [x] API proxy configuration (next.config.ts)
- [x] Environment variables setup

### Contexts ✅
- [x] auth-context.tsx
- [x] theme-context.tsx
- [x] account-context.tsx
- [x] trading-data-context.tsx

### Layout Components ✅
- [x] Header.tsx
- [x] HeaderFundsDisplay.tsx
- [x] PageLayout.tsx

### UI Components ✅
- [x] badge.tsx
- [x] button.tsx
- [x] Card components
- [x] Modal.tsx
- [x] LoadingSpinner.tsx
- [x] All other shadcn components

### Feature Components ✅
- [x] Watchlist.tsx + subcomponents (TradingWindow, SymbolSearchModal, etc.)
- [x] FundsCard.tsx
- [x] HoldingsCard.tsx
- [x] AccountCard.tsx
- [x] OrdersCard.tsx
- [x] PositionsCard.tsx
- [x] TradingTabs.tsx

### Pages ✅
- [x] /command-center (Dashboard)
- [x] /terminal (Trading Panel)
- [x] /trading
- [x] /portfolio
- [x] /brokers
- [x] /journal
- [x] /gym
- [x] /market-watch
- [x] /market-watch/screener
- [x] /settings
- [x] /admin
- [x] /login
- [x] /auth/callback

### Services ✅
- [x] binance-websocket.ts
- [x] upstox-websocket.ts
- [x] api.ts
- [x] format-utils.ts
- [x] constants.ts

### Not Migrated / Intentionally Skipped
- [ ] AddAccountModal.tsx (TODO: implement)
- [ ] EditAccountModal.tsx (TODO: implement)
- [ ] crypto/ components (GainersLosers, MarketOverview, etc.)
- [ ] ErrorBoundary.tsx

---

## Sync Workflow

When you're ready to sync changes from vite-ui to nextjs-ui:

1. **Check what changed:**
   ```bash
   ./scripts/migration-diff.sh
   ```

2. **Review and migrate changes:**
   - Copy modified files
   - Add `"use client"` directive where needed
   - Update imports (`@/lib/` → `@/contexts/` for contexts)
   - Update router usage (React Router → Next.js)

3. **Update this file:**
   - Update "Last synced vite-ui commit" with new commit hash
   - Update "Last sync date"
   - Check off any newly migrated components

4. **Test:**
   ```bash
   cd nextjs-ui
   npm run build
   npm run dev
   ```

5. **Commit:**
   ```bash
   git add .
   git commit -m "sync nextjs-ui with vite-ui up to commit XXXXXX"
   ```

---

## Known Differences

| Area | vite-ui | nextjs-ui | Notes |
|------|---------|-----------|-------|
| Router | React Router v6 | Next.js App Router | `useNavigate` → `useRouter`, `Link` from next/link |
| Imports | `@/lib/auth-context` | `@/contexts/auth-context` | Contexts moved to dedicated folder |
| Env vars | `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` | Different prefix |
| Tailwind | v3.4 | v3.4 | Now aligned after fix |
| Badge variants | outline, secondary, destructive | default, neutral, danger, etc. | Different variant names |

---

## Commit History

| Date | vite-ui Commit | Description |
|------|----------------|-------------|
| 2026-01-16 | d438253 | Initial full migration completed |
