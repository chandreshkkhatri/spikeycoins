#!/bin/bash

# Migration Diff Helper Script
# Shows what changed in vite-ui since the last migration sync

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the last synced commit from MIGRATION_STATUS.md
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATION_FILE="$PROJECT_ROOT/MIGRATION_STATUS.md"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: MIGRATION_STATUS.md not found${NC}"
    exit 1
fi

# Extract the last synced commit
LAST_SYNC_COMMIT=$(grep -oP '(?<=\*\*Last synced vite-ui commit:\*\* `)[a-f0-9]+' "$MIGRATION_FILE" | head -1)

if [ -z "$LAST_SYNC_COMMIT" ]; then
    echo -e "${RED}Error: Could not find last synced commit in MIGRATION_STATUS.md${NC}"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  vite-ui Migration Diff Report${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Last synced commit:${NC} $LAST_SYNC_COMMIT"
echo -e "${GREEN}Current HEAD:${NC} $(git rev-parse --short HEAD)"
echo ""

cd "$(git rev-parse --show-toplevel)"

# Check if there are any changes
CHANGES=$(git diff "$LAST_SYNC_COMMIT"..HEAD --stat -- vite-ui/ 2>/dev/null || echo "")

if [ -z "$CHANGES" ]; then
    echo -e "${GREEN}✓ No changes in vite-ui since last sync!${NC}"
    exit 0
fi

# Show summary
echo -e "${YELLOW}Changes in vite-ui since last sync:${NC}"
echo ""

# Show commits
echo -e "${BLUE}─── New Commits ───${NC}"
git log "$LAST_SYNC_COMMIT"..HEAD --oneline -- vite-ui/ 2>/dev/null || echo "No new commits"
echo ""

# Show file changes
echo -e "${BLUE}─── Changed Files ───${NC}"
git diff "$LAST_SYNC_COMMIT"..HEAD --stat -- vite-ui/

echo ""
echo -e "${BLUE}─── Detailed Changes ───${NC}"

# Categorize changes
echo ""
echo -e "${YELLOW}Components changed:${NC}"
git diff "$LAST_SYNC_COMMIT"..HEAD --name-only -- vite-ui/src/components/ 2>/dev/null | sed 's|vite-ui/||' || echo "  (none)"

echo ""
echo -e "${YELLOW}Pages changed:${NC}"
git diff "$LAST_SYNC_COMMIT"..HEAD --name-only -- vite-ui/src/pages/ 2>/dev/null | sed 's|vite-ui/||' || echo "  (none)"

echo ""
echo -e "${YELLOW}Lib/Utils changed:${NC}"
git diff "$LAST_SYNC_COMMIT"..HEAD --name-only -- vite-ui/src/lib/ 2>/dev/null | sed 's|vite-ui/||' || echo "  (none)"

echo ""
echo -e "${YELLOW}Styles changed:${NC}"
git diff "$LAST_SYNC_COMMIT"..HEAD --name-only -- 'vite-ui/src/*.css' 'vite-ui/src/**/*.css' 2>/dev/null | sed 's|vite-ui/||' || echo "  (none)"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}To view full diff:${NC}"
echo "  git diff $LAST_SYNC_COMMIT..HEAD -- vite-ui/"
echo ""
echo -e "${YELLOW}To view a specific file's diff:${NC}"
echo "  git diff $LAST_SYNC_COMMIT..HEAD -- vite-ui/src/path/to/file.tsx"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
