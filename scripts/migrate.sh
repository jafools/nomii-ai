#!/bin/bash
# ============================================================
# Shenmay AI — Migration Runner
# Runs all pending SQL migrations in numeric order.
# Safe to run multiple times — migrations use IF NOT EXISTS.
# ============================================================

set -e

CONTAINER="${NOMII_DB_CONTAINER:-shenmay-db}"
# Defaults match the canonical post-rename identity used by both
# docker-compose.yml (SaaS) and docker-compose.selfhosted.yml.
# Override only if your install predates the knomi→nomii rename.
DB_USER="${NOMII_DB_USER:-shenmay}"
DB_NAME="${NOMII_DB_NAME:-shenmay_ai}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../server/db/migrations" && pwd)"

# Colour helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "Shenmay AI — Migration Runner"
echo "============================"
echo ""

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo -e "${RED}Error: ${CONTAINER} container is not running.${NC}"
  echo "Run 'docker compose up -d' first."
  exit 1
fi

# Wait for DB to be ready
echo "Waiting for PostgreSQL..."
until docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ PostgreSQL ready${NC}"
echo ""

# Get sorted list of migration files
MIGRATIONS=$(ls "$MIGRATIONS_DIR"/*.sql | sort -V)
TOTAL=$(echo "$MIGRATIONS" | wc -l | tr -d ' ')
APPLIED=0
SKIPPED=0
FAILED=0

echo "Found $TOTAL migration files."
echo ""

for FILE in $MIGRATIONS; do
  NAME=$(basename "$FILE")
  echo -n "  $NAME ... "

  # Run migration — all migrations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
  # so running them again is safe
  if docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
      --quiet --no-psqlrc < "$FILE" 2>/tmp/migration_err; then
    echo -e "${GREEN}ok${NC}"
    APPLIED=$((APPLIED + 1))
  else
    ERR=$(cat /tmp/migration_err)
    # Treat "already exists" notices as success (idempotent)
    if echo "$ERR" | grep -qi "already exists\|duplicate\|NOTICE"; then
      echo -e "${YELLOW}skipped (already applied)${NC}"
      SKIPPED=$((SKIPPED + 1))
    else
      echo -e "${RED}FAILED${NC}"
      echo ""
      echo -e "${RED}Error output:${NC}"
      echo "$ERR"
      FAILED=$((FAILED + 1))
      # Continue with remaining migrations rather than aborting
    fi
  fi
done

echo ""
echo "============================"
echo -e "Applied: ${GREEN}$APPLIED${NC}  Skipped: ${YELLOW}$SKIPPED${NC}  Failed: ${RED}$FAILED${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}Some migrations failed. Check output above.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All migrations complete.${NC}"
echo ""
