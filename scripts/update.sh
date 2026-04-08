#!/bin/bash
# ============================================================
# Nomii AI — Update Script
# Pulls latest code, runs new migrations, rebuilds containers.
# Run: bash scripts/update.sh
# ============================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  Nomii AI — Update${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# ------------------------------------------------------------
# Step 1: Pull latest code
# ------------------------------------------------------------
echo -e "${BLUE}Pulling latest code...${NC}"

if git pull origin "$(git rev-parse --abbrev-ref HEAD)"; then
  echo -e "${GREEN}✓ Code updated${NC}"
else
  echo -e "${YELLOW}⚠ git pull failed — continuing with local code${NC}"
fi
echo ""

# ------------------------------------------------------------
# Step 2: Run migrations
# ------------------------------------------------------------
echo -e "${BLUE}Running migrations...${NC}"
echo ""
bash "$SCRIPT_DIR/migrate.sh"

# ------------------------------------------------------------
# Step 3: Rebuild and restart containers
# ------------------------------------------------------------
echo ""
echo -e "${BLUE}Rebuilding containers...${NC}"
echo ""

docker compose up --build -d backend frontend

echo ""
echo -e "${GREEN}✓ Update complete${NC}"
echo ""
echo -e "  Check logs: ${BOLD}docker compose logs -f backend${NC}"
echo ""
