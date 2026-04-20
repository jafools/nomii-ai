# Claude Code — Shenmay AI Setup & Operations Guide
*For Claude Code sessions working on the Shenmay AI codebase*

---

## Quick Start (Read This First)

You are Claude Code. The user works in Cowork (browser-based). Your job is to:
1. **Edit code** in the Shenmay AI repo
2. **Run local dev servers** and test changes
3. **SSH to production** and deploy
4. **Debug** live issues on the server

Everything below is context you need to work efficiently.

---

## Project Overview

**Shenmay AI** is a B2B SaaS platform for deploying personalized AI agents to customer websites.

- **Backend:** Express.js, PostgreSQL 16, Node.js
- **Frontend:** React + Vite + Tailwind (built in Lovable, synced to GitHub)
- **Infrastructure:** Docker Compose on Proxmox VM at `81.224.218.93`
- **Public URLs:**
  - API: `https://api.pontensolutions.com` (Cloudflare Tunnel)
  - App: `https://nomii.pontensolutions.com` (Lovable frontend)
  - Demo widget: `https://hub.hopeforthisnation.com` (Hope for This Nation tenant)

---

## Critical Deployment Notes

**Read these or you will waste session time:**

1. **Frontend URL is `nomii.pontensolutions.com`** — NOT `app.pontensolutions.com`. This must be in CORS allowed origins (`server/src/middleware/security.js`).

2. **Always use `docker compose up --build -d`** — NOT just `docker compose restart`. The image must rebuild for code changes to take effect.

3. **`WIDGET_JWT_SECRET` must be set** in the root `.env` file AND passed to Docker via `docker-compose.yml`. Without it, the backend refuses to start in production.

4. **CORS verification command** (run from production server):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X OPTIONS https://api.pontensolutions.com/api/onboard/login \
     -H "Origin: https://nomii.pontensolutions.com" \
     -H "Access-Control-Request-Method: POST"
   ```
   Must return `204`. If `403`, CORS is broken.

5. **Correct deploy sequence:**
   ```bash
   cd ~/nomii-ai
   git add [files]
   git commit -m "..."
   git push
   # Then on server:
   cd ~/Knomi/knomi-ai
   git pull
   docker compose up --build -d
   # Verify:
   docker compose logs backend --tail=20
   docker compose ps
   ```

---

## Server Access

**SSH to production:**
```bash
ssh root@81.224.218.93
cd ~/Knomi/knomi-ai
```

**Key locations on server:**
- `.env` — root environment variables (WIDGET_JWT_SECRET, LLM_PROVIDER, Stripe keys, etc.)
- `docker-compose.yml` — container orchestration
- `server/` — Express backend
- `client/` — React frontend
- `/var/lib/docker/volumes/pgdata` — PostgreSQL data (persistent)

**Docker commands:**
```bash
docker compose ps                           # Status of all containers
docker compose logs backend --tail=50       # Backend logs (most useful)
docker compose logs db --tail=20            # Database logs
docker compose up --build -d                # Deploy code changes
docker compose restart backend              # Restart without rebuild (code changes WON'T apply)
docker compose down                         # Stop everything (data persists in volumes)
```

---

## Local Development

**Prerequisites:** Node.js 18+, PostgreSQL 14+, Docker (optional for full stack)

**Run locally:**
```bash
# 1. Install dependencies
npm run install:all

# 2. Create local .env
cp .env.example .env
# Edit .env: set LLM_PROVIDER, database URL, etc.

# 3. Setup database (if not using Docker)
createdb nomii_ai
cd server && npm run db:migrate && npm run db:seed && cd ..

# 4. Start both servers (port 3000 frontend, 3001 backend)
npm run dev

# 5. Open http://localhost:3000
```

**Backend only** (if you just need the API):
```bash
cd server
npm install
npm run dev
# Runs on http://localhost:3001
```

**Frontend only** (if you just need React):
```bash
cd client
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## File Structure (Key Files)

```
nomii-ai/
├── .env                              # Root environment variables (SECRET — not in git)
├── docker-compose.yml                # Container config (FRONTEND_URL, WIDGET_JWT_SECRET, etc.)
├── SESSION_HANDOFF.md                # Current state, deployment notes, critical ops (READ FIRST)
├── SPRINT_HANDOFF.md                 # Most recent sprint notes (what shipped, what broke)
├── FEATURES.md                       # Full feature inventory
├── ROADMAP.md                        # Product roadmap
│
├── server/                           # Express.js backend
│   ├── src/
│   │   ├── index.js                  # Server entry point (trust proxy, rate limiting, routes)
│   │   ├── db.js                     # PostgreSQL connection
│   │   ├── engine/
│   │   │   ├── promptBuilder.js      # Soul + Memory → system prompt
│   │   │   ├── memoryUpdater.js      # Auto-updates memory after exchanges
│   │   │   └── soulGenerator.js      # Generates soul via Claude Haiku
│   │   ├── middleware/
│   │   │   ├── security.js           # CORS, security headers (ALLOWED_ORIGINS here)
│   │   │   ├── auth.js               # JWT verification
│   │   │   └── subscription.js       # Rate limiting by plan
│   │   ├── routes/
│   │   │   ├── chat.js               # POST /api/chat — main AI endpoint
│   │   │   ├── widget.js             # Widget session, CSAT, messages
│   │   │   ├── portal.js             # Dashboard API (conversations, customers, etc.)
│   │   │   ├── stripe-webhook.js     # Stripe payment events
│   │   │   ├── onboard.js            # Registration, login, invites
│   │   │   └── [others]
│   │   ├── services/
│   │   │   ├── llmService.js         # Claude API abstraction
│   │   │   ├── authService.js        # Password hashing, validation
│   │   │   ├── cryptoService.js      # AES-256-GCM encryption
│   │   │   ├── notificationService.js # Slack/Teams notifications (Sprint 3)
│   │   │   └── [others]
│   │   └── tools/                    # Agentic tool system
│   │
│   ├── db/
│   │   ├── migrations/               # SQL migrations (001–026)
│   │   ├── migrate.js                # Migration runner
│   │   └── seeds/                    # Test data
│   │
│   ├── .env                          # Server-specific env (rarely used — root .env is primary)
│   ├── Dockerfile                    # Docker image for backend
│   └── package.json
│
├── client/                           # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx                   # Router, main app shell
│   │   ├── pages/nomii/              # All Shenmay dashboard pages
│   │   │   ├── NomiiLogin.jsx        # Login page
│   │   │   ├── NomiiDashboard.jsx    # Main dashboard (routes to subpages)
│   │   │   └── dashboard/
│   │   │       ├── NomiiOverview.jsx
│   │   │       ├── NomiiConversations.jsx
│   │   │       ├── NomiiCustomers.jsx
│   │   │       ├── NomiiSettings.jsx   # Connectors tab (Slack/Teams/Zapier)
│   │   │       └── [others]
│   │   ├── lib/
│   │   │   └── nomiiApi.js           # API client (BASE_URL = https://api.pontensolutions.com)
│   │   └── components/
│   │       └── nomii/                # Shenmay-specific components
│   │
│   ├── Dockerfile                    # Docker image for frontend (nginx)
│   └── package.json
```

---

## Key Database Info

**Database name:** `knomi_ai` (keeping legacy name to avoid breaking prod)
**User:** `knomi`
**Migrations:** `server/db/migrations/` — run in order, idempotent or already-applied tracked

**Connect locally:**
```bash
psql -U knomi -d knomi_ai
```

**Connect on server:**
```bash
docker compose exec db psql -U knomi -d knomi_ai
```

**Common queries:**
```sql
SELECT id, email, slug FROM tenants;                    -- List all tenants
SELECT * FROM subscriptions WHERE active = true;       -- Active subs
SELECT * FROM conversations WHERE unread = true;       -- Unread conversations
SELECT * FROM audit_logs ORDER BY created_at DESC;     -- Security audit trail
```

---

## Environment Variables (Root `.env` File)

**Must-have in production:**
```
LLM_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...                              # Rotate if exposed
WIDGET_JWT_SECRET=<strong-random-64-char-hex>        # CRITICAL
JWT_SECRET=<strong-random-value>
API_KEY_ENCRYPTION_SECRET=<strong-random-value>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_1TBzOuBlxts7IvMo...
STRIPE_PRICE_GROWTH=price_1TBzQ4Blxts7Ivy...
STRIPE_PRICE_PROFESSIONAL=price_1TBzQoBlxts7Ivm...
STRIPE_PORTAL_RETURN_URL=https://nomii.pontensolutions.com/nomii/dashboard/plans
MASTER_EMAIL=ajaces@gmail.com
SMTP_HOST=mail.example.com
SMTP_USER=noreply@example.com
SMTP_PASS=...
SMTP_FROM=Shenmay AI <noreply@example.com>
NODE_ENV=production
DB_PASSWORD=knomi_dev_2026                             # Default, keep it
CLOUDFLARE_TUNNEL_TOKEN=eyJh...
FRONTEND_URL=https://nomii.pontensolutions.com         # Critical for CORS
```

---

## Common Tasks & Commands

### Deploy a Code Change
```bash
# Local: commit and push
git add [files]
git commit -m "feat: [description]"
git push

# Server: pull and rebuild
ssh root@81.224.218.93
cd ~/Knomi/knomi-ai
git pull
docker compose up --build -d
docker compose logs backend --tail=20
```

### Test an API Endpoint
```bash
# Health check
curl https://api.pontensolutions.com/api/health

# Test CORS preflight for login
curl -v -X OPTIONS https://api.pontensolutions.com/api/onboard/login \
  -H "Origin: https://nomii.pontensolutions.com" \
  -H "Access-Control-Request-Method: POST"

# Login (with credentials)
curl -X POST https://api.pontensolutions.com/api/onboard/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ajaces@gmail.com","password":"..."}'
```

### Check Production Logs
```bash
ssh root@81.224.218.93
cd ~/Knomi/knomi-ai
docker compose logs backend --tail=100 -f   # Follow live logs
docker compose logs db --tail=50
```

### Restart Backend (Code Changes)
```bash
ssh root@81.224.218.93
cd ~/Knomi/knomi-ai
docker compose up --build -d               # ALWAYS --build for code changes
sleep 5
docker compose logs backend --tail=20      # Verify startup
```

### Check Container Status
```bash
docker compose ps
# Should see all 4 containers as "Up"
```

---

## Recent Changes (Session 30 — 2026-03-30)

**Sprint 3 + Deployment Fixes:**
- Slack/Teams notification connectors (fire-and-forget messaging)
- Security hardening (JWT secrets validation, stronger passwords, SSRF protection)
- CSAT ratings (thumbs up/down overlay on widget close)
- Labels and bulk conversation operations
- Migrations 024–026 applied to production
- Fixed: `WIDGET_JWT_SECRET` missing from docker-compose.yml
- Fixed: CORS allowed origins didn't include `nomii.pontensolutions.com`
- Fixed: `trust proxy` setting missing for Cloudflare Tunnel
- Fixed: `docker compose restart` doesn't rebuild images (must use `up --build -d`)

**Commits this session:**
- `ca9bc87` — feat: Sprint 3 (Slack/Teams/security)
- `8b0df59` — fix: pass WIDGET_JWT_SECRET into container
- `99eda52` — fix: trust proxy for Cloudflare Tunnel
- `767c2c2` — fix: CORS allowed origins
- `99dbdd1` — fix: add nomii.pontensolutions.com to CORS
- `13ae822` — docs: update SESSION_HANDOFF with critical ops notes

---

## Tenants

| Name | Email | Agent | Widget Key | Live URL | Status |
|------|-------|-------|------------|----------|--------|
| Hope for This Nation | ajaces@gmail.com | Beacon | `4e8bb9c0...` | hub.hopeforthisnation.com | ✅ Active |
| Covenant Trust | (demo) | (demo) | — | — | Demo |

---

## Next Sprint Ideas (From Roadmap)

- **Immediate:** Wire `conversation.started` + `conversation.escalated` events to notifications
- **Sprint 1:** Analytics dashboard, widget conversation history, handoff notes, email templates
- **Sprint 2:** Agent performance scoring, conversation labels (already built), scheduled reports
- **Sprint 3:** Live Connector (tier 3 data), Zapier consumer webhook, infrastructure migration

---

## Quick Debugging Checklist

**If login fails ("Failed to fetch"):**
1. Check CORS: Run the curl command above — if 403, ALLOWED_ORIGINS is wrong
2. Check backend is running: `docker compose ps` → knomi-backend should be "Up"
3. Check backend logs: `docker compose logs backend --tail=20` → look for errors
4. Verify `WIDGET_JWT_SECRET` is set: `grep WIDGET_JWT_SECRET ~/Knomi/knomi-ai/.env`

**If widget doesn't load:**
1. Check backend is running and healthy
2. Check `PORTAL_URL` env var is correct (used for deep links in notifications)
3. Check the widget key is valid: `SELECT widget_api_key FROM tenants WHERE slug = 'hope-for-this-nation';`

**If migrations fail:**
1. Check if already applied: `\dt` in psql — look for `labels`, `csat`, `connectors` tables
2. If not there, re-apply: `docker compose exec -T db psql -U knomi -d knomi_ai < server/db/migrations/024_labels.sql`

**If Docker build fails:**
1. Check disk space: `df -h`
2. Prune old images: `docker system prune -a --volumes`
3. Check logs: `docker compose logs backend 2>&1 | tail -50`

---

## Contact / Escalation

The user (Austin) is reachable via email at `austin.ponten@kaldryn.com`. If something breaks in production:
1. Check the logs first
2. Try a restart
3. If stuck, document the exact error and context for the next session

---

**Last updated:** 2026-03-30
**Session:** Deployment verification + live testing
**Status:** ✅ Server deployed, backend running, dashboard accessible
