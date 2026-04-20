#!/bin/bash
# ============================================================
# Shenmay AI — Self-hosted update
#
# Pulls the latest compose file + images for a self-hosted install.
# Safe to run repeatedly; idempotent.
#
#   bash ~/nomii/update.sh
#
# This script works for installs made via install.sh (the documented
# customer path), which creates a `.env`-only directory with no git
# repo. It does NOT assume a git checkout.
#
# What it does:
#   1. Fetch the latest docker-compose.selfhosted.yml from GitHub.
#   2. docker compose pull.
#   3. docker compose up -d (recreates backend + frontend; DB persists).
#
# Migrations run automatically on backend startup — no manual step needed.
# ============================================================
set -e

GITHUB_REPO="${GITHUB_REPO:-jafools/nomii-ai}"
# Track the latest tagged release by default. Override with:
#   NOMII_GITHUB_REF=v1.2.3   — pin to a specific release
#   NOMII_GITHUB_REF=main     — track edge (not recommended for prod)
if [ -n "${NOMII_GITHUB_REF:-}" ]; then
  GITHUB_REF="$NOMII_GITHUB_REF"
else
  LATEST_TAG=$(curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null \
    | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | head -1 \
    | sed -E 's/.*"([^"]+)"$/\1/')
  GITHUB_REF="${LATEST_TAG:-main}"
fi

COMPOSE_FILE="docker-compose.selfhosted.yml"
COMPOSE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_REF}/${COMPOSE_FILE}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

cd "$SCRIPT_DIR"

if [ ! -f .env ]; then
  echo -e "${YELLOW}No .env found in $(pwd). Is this a Shenmay install directory?${NC}" >&2
  echo -e "If you're trying to do a fresh install, run scripts/install.sh instead." >&2
  exit 1
fi

echo ""
echo -e "${BOLD}============================================================${NC}"
echo -e "${BOLD}  Shenmay AI — Update to ${GITHUB_REF}${NC}"
echo -e "${BOLD}============================================================${NC}"
echo ""

# ── Step 1: Refresh compose file ──────────────────────────────
echo -e "${BLUE}Fetching ${COMPOSE_FILE} from ${GITHUB_REF}...${NC}"
TMP_COMPOSE=$(mktemp)
if ! curl -fsSL "$COMPOSE_URL" -o "$TMP_COMPOSE"; then
  echo -e "${YELLOW}Could not fetch compose file. Keeping existing ${COMPOSE_FILE}.${NC}" >&2
  rm -f "$TMP_COMPOSE"
else
  if [ -f "$COMPOSE_FILE" ]; then
    cp "$COMPOSE_FILE" "${COMPOSE_FILE}.bak"
  fi
  mv "$TMP_COMPOSE" "$COMPOSE_FILE"
  echo -e "${GREEN}✓ Compose file updated${NC}"
fi

# ── Step 2: Pull latest images ───────────────────────────────
echo ""
echo -e "${BLUE}Pulling latest images...${NC}"
# If a Cloudflare Tunnel token is set, include the tunnel profile (matches install.sh).
PROFILE_FLAG=()
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env; then
  PROFILE_FLAG=(--profile tunnel)
fi
docker compose "${PROFILE_FLAG[@]}" -f "$COMPOSE_FILE" pull

# ── Step 3: Recreate containers ──────────────────────────────
echo ""
echo -e "${BLUE}Recreating containers...${NC}"
docker compose "${PROFILE_FLAG[@]}" -f "$COMPOSE_FILE" up -d

# ── Step 4: Health check ──────────────────────────────────────
echo ""
echo -e "${BLUE}Waiting for API to be healthy...${NC}"
READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    READY=1
    break
  fi
  printf "."
  sleep 2
done
echo ""

if [ "$READY" -eq 1 ]; then
  echo -e "${GREEN}✓ Update complete — API is healthy${NC}"
else
  echo -e "${YELLOW}⚠ API health check timed out.${NC}"
  echo -e "  Check logs: ${BOLD}docker compose -f ${COMPOSE_FILE} logs -f backend${NC}"
  exit 1
fi
echo ""
