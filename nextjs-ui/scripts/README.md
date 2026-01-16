# Migration Scripts

Helper scripts for managing the vite-ui → nextjs-ui migration.

## Scripts

### `migration-diff.sh`
Shows what changed in vite-ui since the last sync.

```bash
./scripts/migration-diff.sh
```

**Output includes:**
- New commits in vite-ui
- Changed files categorized by type (components, pages, lib, styles)
- Commands to view detailed diffs

### `update-sync-commit.sh`
Updates the sync checkpoint in MIGRATION_STATUS.md after you've migrated changes.

```bash
# Use the latest vite-ui commit
./scripts/update-sync-commit.sh

# Or specify a commit
./scripts/update-sync-commit.sh abc1234
```

## Typical Workflow

### When developing in vite-ui (your normal work):
```bash
# Work in vite-ui as usual
cd vite-ui
# ... make changes ...
git add . && git commit -m "your feature"
```

### When ready to sync to nextjs-ui:
```bash
# 1. Check what needs to be migrated
cd nextjs-ui
./scripts/migration-diff.sh

# 2. For each changed file, migrate it:
#    - Copy the file
#    - Add "use client" if needed
#    - Update imports (see MIGRATION_STATUS.md for patterns)
#    - Test: npm run build

# 3. Update the sync checkpoint
./scripts/update-sync-commit.sh

# 4. Commit your migration work
git add .
git commit -m "sync nextjs-ui with vite-ui changes"
```

## Quick Reference: Migration Patterns

| vite-ui | nextjs-ui |
|---------|-----------|
| `import { useNavigate } from "react-router-dom"` | `import { useRouter } from "next/navigation"` |
| `navigate("/path")` | `router.push("/path")` |
| `import { Link } from "react-router-dom"` | `import Link from "next/link"` |
| `import { useLocation } from "react-router-dom"` | `import { usePathname } from "next/navigation"` |
| `@/lib/auth-context` | `@/contexts/auth-context` |
| `@/lib/account-context` | `@/contexts/account-context` |
| `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` |

Don't forget to add `"use client"` at the top of files that use:
- React hooks (useState, useEffect, etc.)
- Context hooks (useAuth, useAccount, etc.)
- Browser APIs (localStorage, window)
- Event handlers
