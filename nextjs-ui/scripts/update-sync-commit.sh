#!/bin/bash

# Update the last synced commit in MIGRATION_STATUS.md
# Usage: ./update-sync-commit.sh [commit-hash]
# If no commit hash provided, uses the latest vite-ui commit

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATION_FILE="$PROJECT_ROOT/MIGRATION_STATUS.md"

cd "$(git rev-parse --show-toplevel)"

# Get the commit to sync to
if [ -n "$1" ]; then
    NEW_COMMIT="$1"
else
    # Get the latest commit that touched vite-ui
    NEW_COMMIT=$(git log -1 --format="%h" -- vite-ui/)
fi

# Validate the commit exists
if ! git cat-file -e "$NEW_COMMIT" 2>/dev/null; then
    echo -e "${RED}Error: Commit $NEW_COMMIT does not exist${NC}"
    exit 1
fi

# Get commit message for reference
COMMIT_MSG=$(git log -1 --format="%s" "$NEW_COMMIT")
TODAY=$(date +%Y-%m-%d)

echo -e "${YELLOW}Updating migration sync status...${NC}"
echo ""
echo -e "  New commit: ${GREEN}$NEW_COMMIT${NC}"
echo -e "  Message: $COMMIT_MSG"
echo -e "  Date: $TODAY"
echo ""

# Update the MIGRATION_STATUS.md file
# Update the commit hash
sed -i "s/\*\*Last synced vite-ui commit:\*\* \`[a-f0-9]*\`.*/**Last synced vite-ui commit:** \`$NEW_COMMIT\` ($COMMIT_MSG)/" "$MIGRATION_FILE"

# Update the date
sed -i "s/\*\*Last sync date:\*\* .*/\*\*Last sync date:\*\* $TODAY/" "$MIGRATION_FILE"

# Add to commit history table
# Find the line with "| Date | vite-ui Commit |" and add a new entry after the header row
HISTORY_LINE="| $TODAY | $NEW_COMMIT | Synced: $COMMIT_MSG |"

# Check if this commit is already in the history
if grep -q "$NEW_COMMIT" "$MIGRATION_FILE"; then
    echo -e "${YELLOW}Note: This commit is already in the history${NC}"
else
    # Add to history (after the table header)
    sed -i "/^| Date | vite-ui Commit | Description |$/a $HISTORY_LINE" "$MIGRATION_FILE"
fi

echo -e "${GREEN}✓ MIGRATION_STATUS.md updated!${NC}"
echo ""
echo -e "Don't forget to:"
echo -e "  1. Review and migrate any changed files"
echo -e "  2. Run: ${YELLOW}npm run build${NC} to verify"
echo -e "  3. Commit the changes"
