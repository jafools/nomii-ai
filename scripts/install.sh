#!/bin/bash
# ============================================================
# Nomii AI — Self-Hosted Installer
#
# Run this on a fresh Linux server:
#   curl -sSL https://raw.githubusercontent.com/jafools/knomi-ai/main/scripts/install.sh | bash
#
# Or if you've cloned the repo:
#   bash scripts/install.sh
# ============================================================

set -e

# ── Colours ─────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m'
B='\033[0;34m' W='\033[1;37m' D='\033[2m' NC='\033[0m'

GITHUB_REPO="jafools/nomii-ai"
COMPOSE_FILE="docker-compose.selfhosted.yml"
COMPOSE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/${COMPOSE_FILE}"
INSTALL_DIR="${NOMII_DIR:-$HOME/nomii}"
TOTAL_STEPS=6

step() { echo -e "\n${W}── Step $1 of $TOTAL_STEPS  $2${NC}"; }
ok()   { echo -e "   ${G}✓${NC} $1"; }
warn() { echo -e "   ${Y}⚠${NC}  $1"; }
fail() { echo -e "\n${R}Error:${NC} $1\n"; exit 1; }
ask()  { echo -e "   ${B}?${NC}  $1"; }

# ── Header ───────────────────────────────────────────────────
clear
echo ""
echo -e "${W}╔═══════════════════════════════════════════╗${NC}"
echo -e "${W}║          Nomii AI — Self-Hosted           ║${NC}"
echo -e "${W}║             Setup Wizard v1.0             ║${NC}"
echo -e "${W}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${D}This wizard will install Nomii AI on your server."
echo -e "It takes about 5–10 minutes on a fresh machine.${NC}"
echo ""

# ════════════════════════════════════════════════
step 1 "Check requirements"
# ════════════════════════════════════════════════

# OS check
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
  warn "This script is designed for Linux. You're running: $OSTYPE"
  warn "Continuing anyway — some steps may need manual adjustment."
fi

# Docker check — offer to install if missing
if ! command -v docker &>/dev/null; then
  echo ""
  warn "Docker is not installed."
  echo ""
  ask "Install Docker automatically? This requires sudo. [Y/n]"
  read -r INSTALL_DOCKER
  if [[ "$INSTALL_DOCKER" =~ ^[Nn]$ ]]; then
    fail "Docker is required. Install it from https://docs.docker.com/get-docker/ and re-run this script."
  fi
  echo ""
  echo -e "   ${D}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo ""
  ok "Docker installed."
  warn "You may need to log out and back in for Docker permissions to take effect."
  warn "If the next step fails, run: newgrp docker"
else
  ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"
fi

# Docker Compose v2 check
if ! docker compose version &>/dev/null; then
  fail "Docker Compose v2 not found. Update Docker Desktop or install the plugin:\n   https://docs.docker.com/compose/install/"
fi
ok "Docker Compose $(docker compose version --short)"

# Docker daemon running?
if ! docker info &>/dev/null 2>&1; then
  echo ""
  echo -e "   ${D}Starting Docker daemon...${NC}"
  sudo systemctl start docker 2>/dev/null || true
  sleep 3
  if ! docker info &>/dev/null 2>&1; then
    fail "Docker is installed but not running. Try: sudo systemctl start docker"
  fi
fi
ok "Docker daemon is running"

# ════════════════════════════════════════════════
step 2 "Choose installation directory"
# ════════════════════════════════════════════════

echo ""
echo -e "   ${D}Nomii AI will be installed to a folder on your server."
echo -e "   This folder stores your configuration and database.${NC}"
echo ""
ask "Installation directory [${INSTALL_DIR}]:"
read -r USER_DIR
INSTALL_DIR="${USER_DIR:-$INSTALL_DIR}"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
ok "Using: $INSTALL_DIR"

# Download compose file if not already present
if [ ! -f "$COMPOSE_FILE" ]; then
  echo ""
  echo -e "   ${D}Downloading Nomii AI configuration...${NC}"
  if command -v curl &>/dev/null; then
    curl -fsSL "$COMPOSE_URL" -o "$COMPOSE_FILE"
  elif command -v wget &>/dev/null; then
    wget -q "$COMPOSE_URL" -O "$COMPOSE_FILE"
  else
    fail "Neither curl nor wget found. Please install curl and re-run."
  fi
  ok "Configuration downloaded"
else
  ok "Configuration file already present"
fi

# ════════════════════════════════════════════════
step 3 "Configure Nomii AI"
# ════════════════════════════════════════════════

if [ -f ".env" ]; then
  echo ""
  warn "An existing .env configuration was found."
  ask "Reconfigure from scratch? Existing settings will be overwritten. [y/N]"
  read -r REDO
  if [[ ! "$REDO" =~ ^[Yy]$ ]]; then
    ok "Keeping existing configuration — skipping setup."
    SKIP_CONFIG=1
  fi
fi

if [ "${SKIP_CONFIG}" != "1" ]; then

  echo ""
  echo -e "   ${D}Answer the questions below. Press Enter to accept the default shown in [brackets].${NC}"
  echo ""

  # ── Public URL ────────────────────────────────
  echo -e "   ${W}Your public URL${NC}"
  echo -e "   ${D}The web address where Nomii will be accessible."
  echo -e "   Examples: https://nomii.yourfirm.com  or  http://192.168.1.100${NC}"
  ask "Public URL [http://localhost]:"
  read -r PUBLIC_URL
  PUBLIC_URL="${PUBLIC_URL:-http://localhost}"

  # ── Anthropic API Key ─────────────────────────
  echo ""
  echo -e "   ${W}Anthropic API key${NC}"
  echo -e "   ${D}This powers the AI. Get one free at console.anthropic.com${NC}"
  ask "Anthropic API key (sk-ant-...):"
  read -r ANTHROPIC_API_KEY
  [ -z "$ANTHROPIC_API_KEY" ] && warn "No API key entered — AI features will be disabled until you add one to .env"

  # ── Admin email ───────────────────────────────
  echo ""
  echo -e "   ${W}Admin email${NC}"
  echo -e "   ${D}Your email address. This account gets unlimited free access.${NC}"
  ask "Your email address:"
  read -r MASTER_EMAIL

  # ── SMTP ──────────────────────────────────────
  echo ""
  echo -e "   ${W}Email (SMTP) — optional but recommended${NC}"
  echo -e "   ${D}Used for advisor notifications, invite emails, and document delivery."
  echo -e "   Skip for now by pressing Enter — you can add it later in .env${NC}"
  ask "SMTP host [skip]:"
  read -r SMTP_HOST

  if [ -n "$SMTP_HOST" ]; then
    ask "SMTP port [465]:"
    read -r SMTP_PORT
    SMTP_PORT="${SMTP_PORT:-465}"
    ask "SMTP username:"
    read -r SMTP_USER
    ask "SMTP password:"
    read -rs SMTP_PASS
    echo ""
    ask "From address [noreply@$(echo "$PUBLIC_URL" | sed 's|https\?://||' | cut -d'/' -f1)]:"
    read -r SMTP_FROM
    SMTP_FROM="${SMTP_FROM:-noreply@$(echo "$PUBLIC_URL" | sed 's|https\?://||' | cut -d'/' -f1)}"
  fi

  # ── Cloudflare Tunnel ─────────────────────────
  echo ""
  echo -e "   ${W}Cloudflare Tunnel — optional${NC}"
  echo -e "   ${D}Gives your Nomii installation a public HTTPS address without"
  echo -e "   opening firewall ports or managing SSL certificates."
  echo -e "   Create a free tunnel at: dash.cloudflare.com > Zero Trust > Networks > Tunnels"
  echo -e "   Leave blank to skip — you can add it later in .env${NC}"
  ask "Cloudflare Tunnel token [skip]:"
  read -r CF_TOKEN

  # ── Generate secrets ──────────────────────────
  echo ""
  echo -e "   ${D}Generating secure secrets...${NC}"
  gen_secret() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-f0-9' | head -c 64; }
  JWT_SECRET=$(gen_secret)
  WIDGET_JWT_SECRET=$(gen_secret)
  API_KEY_ENCRYPTION_SECRET=$(gen_secret)
  DB_PASSWORD=$(gen_secret | head -c 32)
  ok "Secrets generated"

  # ── Write .env ────────────────────────────────
  cat > .env << ENV
# Nomii AI — Configuration
# Generated by install.sh on $(date)
# Edit this file to change settings, then run:
#   docker compose -f docker-compose.selfhosted.yml up -d

# ── Database ─────────────────────────────────
DB_PASSWORD=${DB_PASSWORD}

# ── Security (do not share these) ────────────
JWT_SECRET=${JWT_SECRET}
WIDGET_JWT_SECRET=${WIDGET_JWT_SECRET}
API_KEY_ENCRYPTION_SECRET=${API_KEY_ENCRYPTION_SECRET}

# ── App URLs ──────────────────────────────────
APP_URL=${PUBLIC_URL}
FRONTEND_URL=${PUBLIC_URL}

# ── AI Provider ───────────────────────────────
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# ── Admin account ─────────────────────────────
MASTER_EMAIL=${MASTER_EMAIL}

# ── Email / SMTP ──────────────────────────────
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT:-465}
SMTP_SECURE=true
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}

# ── Cloudflare Tunnel (optional) ──────────────
CLOUDFLARE_TUNNEL_TOKEN=${CF_TOKEN}

# ── Stripe billing (optional) ─────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_PROFESSIONAL=
STRIPE_PORTAL_RETURN_URL=${PUBLIC_URL}/dashboard/plans
ENV

  ok "Configuration saved to .env"
fi

# ════════════════════════════════════════════════
step 4 "Download and start services"
# ════════════════════════════════════════════════

echo ""
echo -e "   ${D}Pulling Docker images (this may take a few minutes)...${NC}"
echo ""

docker compose -f "$COMPOSE_FILE" pull

echo ""
echo -e "   ${D}Starting services...${NC}"
echo ""

docker compose -f "$COMPOSE_FILE" up -d

ok "Services started"

# ════════════════════════════════════════════════
step 5 "Wait for Nomii AI to be ready"
# ════════════════════════════════════════════════

echo ""
echo -e "   ${D}Waiting for the API to come online (up to 60 seconds)...${NC}"

READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    READY=1
    break
  fi
  printf "."
  sleep 2
done
echo ""

if [ "$READY" -eq 1 ]; then
  ok "API is healthy"
else
  warn "API health check timed out — services may still be starting."
  warn "Check logs with: docker compose -f $INSTALL_DIR/$COMPOSE_FILE logs -f backend"
fi

# ════════════════════════════════════════════════
step 6 "All done!"
# ════════════════════════════════════════════════

source .env 2>/dev/null || true

echo ""
echo -e "${W}╔═══════════════════════════════════════════╗${NC}"
echo -e "${W}║         Nomii AI is now running!          ║${NC}"
echo -e "${W}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "   ${W}Open your browser and go to:${NC}"
echo -e "   ${B}${APP_URL:-http://localhost}${NC}"
echo ""
echo -e "   ${W}First time? Register an account using:${NC}"
echo -e "   ${G}${MASTER_EMAIL:-your admin email}${NC}"
echo -e "   ${D}(This email gets unlimited free access)${NC}"
echo ""
echo -e "   ${D}────────────────────────────────────────${NC}"
echo -e "   ${W}Useful commands:${NC}"
echo -e "   ${D}View logs:   ${NC}docker compose -f ${COMPOSE_FILE} logs -f backend"
echo -e "   ${D}Stop:        ${NC}docker compose -f ${COMPOSE_FILE} down"
echo -e "   ${D}Update:      ${NC}docker compose -f ${COMPOSE_FILE} pull && docker compose -f ${COMPOSE_FILE} up -d"
echo -e "   ${D}Edit config: ${NC}nano ${INSTALL_DIR}/.env"
echo ""
echo -e "   ${D}All files are in: ${INSTALL_DIR}${NC}"
echo -e "   ${D}Your database is persisted in a Docker volume and survives restarts.${NC}"
echo ""
