# Shenmay AI — Session Handoff
*Last updated: 2026-04-10*

> **Brand note:** Product has been renamed twice:
> - **Knomi AI → Nomii AI** on 2026-03-18 (trademark conflict with Aware Inc.'s Knomi)
> - **Nomii AI → Shenmay AI** on 2026-04-20 (trademark conflict with glimpse.ai's Nomi)
>
> Historical infra names preserved (DB `nomii_ai`, Docker containers `nomii-*`,
> env vars `NOMII_*`, `/nomii/*` URL paths, `X-Nomii-Signature` header) for
> backward compatibility — Phase 4 infra rename runs later.

---

## Session: 2026-04-10 — Integration Testing + Pre-Deployment Fixes

### What was built

Complete integration test suite validating all three deployment modes. Pre-deployment blockers fixed.

| Item | Detail |
|------|--------|
| `tests/integration.test.js` | 50-test suite covering unit logic + three server modes. No framework, no deps beyond `pg` (already in server/node_modules). |
| `server/src/middleware/subscription.js` | Exported `getBlockReason` and `isWithinMessageLimit` so they're testable without reflection hacks. |
| `docker-compose.yml` | Removed stale `<<<<<<< HEAD` conflict marker that made it invalid YAML and would break `docker compose up`. |
| Migration 029 | Applied to production DB (`knomi_ai`) on Proxmox VPS. Licenses table now exists in prod. |

### Test suite overview

```
tests/integration.test.js  — run with: node tests/integration.test.js
```

**Unit tests (21)** — no server or DB required:
- `isSubscriptionValid()` — all subscription states (active, trialing, past_due grace, canceled, etc.)
- `getBlockReason()` — all error code paths
- `isWithinMessageLimit()` — plan limit enforcement
- `PLAN_LIMITS` — trial/starter limits sanity check

**SaaS mode (9)** — spawns server on port 3101:
- `/api/config` returns `deployment: saas`, Stripe billing enabled
- Platform admin routes exist and require auth
- License validation routes return 404 (not a master instance)
- Registration is accessible

**Self-hosted mode (8)** — spawns server on port 3102:
- `/api/config` returns `deployment: selfhosted`, license management enabled
- Platform admin routes return 404 (disabled)
- Registration blocked with 403 `registration_disabled`
- Tenant auto-seeded on startup; login works immediately

**License master mode (12)** — spawns server on port 3103:
- `POST /api/license/trial` — issues 14-day trial keys
- `POST /api/license/validate` — validates any key against DB
- Full platform/licenses CRUD (issue, list, get, revoke, reactivate)

### Running tests

**Local (dev machine):**
```bash
node tests/integration.test.js
```
The test suite auto-reads `server/.env` for DB credentials and creates `<dbname>_test` automatically.

**VPS / Proxmox (production server):**
```bash
TEST_DATABASE_URL=postgresql://knomi:knomi_prod_2026@localhost:5432/knomi_ai \
  node tests/integration.test.js
```
The test DB (`knomi_ai_test`) was already created and migrations applied during this session.

### VPS infrastructure notes

| Detail | Value |
|--------|-------|
| Host | Proxmox server (`pontenprox`) |
| DB container | `knomi-db` (postgres:16-alpine), port 5432 exposed to host |
| DB credentials | `knomi:knomi_prod_2026 / knomi_ai` |
| Server process | Running directly (NOT in Docker) — PM2/systemd not confirmed |
| `server/.env` | `DATABASE_URL` added this session pointing at `knomi-db` |

### Remaining pre-deployment blockers

- [ ] **Confirm how the server process is managed** — is it PM2, a systemd unit, a screen session, or manual `node`? Need to know to restart after deploys.
- [ ] **Apply migrations to production after code deploys** — only migration 029 was pending this session; future migrations need a deploy runbook.
- [ ] **Pending ops from previous session** — migrations 015b–022 may not all be applied to prod. Worth running `node server/db/migrate.js` against prod DB once (it's idempotent via `IF NOT EXISTS`).

### What's NOT changed

All Phase 1 features remain as-built — no regressions. This session was purely testing + fixes.

---

## Session: 2026-04-09 (afternoon) — Single-Tenant Self-Hosted Mode (NOMII_DEPLOYMENT=selfhosted)

### What was built

Complete on-prem product model: one company, one install, **trial-first** with a clear path to paid licensing.

| File | Purpose |
|------|---------|
| `server/src/config/plans.js` | Single source of truth for `PLAN_LIMITS` (trial: 20 msg/mo, 1 customer; starter/growth/professional tiers). Removes duplication between stripe-webhook.js and licenseService.js. Exports `isSelfHosted()` helper. |
| `server/src/jobs/seedSelfHostedTenant.js` | Auto-provisions the single tenant + pre-verified admin account on first boot using `MASTER_EMAIL`, `ADMIN_PASSWORD`, `TENANT_NAME` from `.env`. Idempotent (no-op if tenant exists). |
| `server/src/services/licenseService.js` | Rewritten: trial mode when no `NOMII_LICENSE_KEY` is set (no cloud call, just logs limits and exits gracefully). Upserts `subscriptions` row after heartbeat so existing `subscription.js` middleware enforces plan limits with zero changes. |
| `server/src/routes/license.js` | Added `POST /api/license/trial` — cloud issues a 14-day trial key when called by installer. Returns existing key if email already has one (prevents duplicates). |
| `server/src/routes/onboard.js` | `POST /register` returns 403 when `NOMII_DEPLOYMENT=selfhosted` — prevents accidental multi-tenant creation on a single-tenant install. |
| `server/src/index.js` | Platform admin routes disabled in selfhosted mode (404). Added `GET /api/config` endpoint exposing `{ deployment, features }` to frontend. Startup IIFE runs: seed → license check → listen. |
| `server/src/routes/stripe-webhook.js` | Now imports `PLAN_LIMITS` from shared config (DRY improvement). |
| `docker-compose.selfhosted.yml` | `NOMII_DEPLOYMENT=selfhosted` hardcoded. Added `TENANT_NAME`, `ADMIN_PASSWORD` env var placeholders. Updated license key comment: trial is now the default (operator skips it if they don't have a key). |
| `scripts/install.sh` | Added prompts: company name, admin email, **admin password** (with confirmation). Updated license key prompt to optional with trial explanation. All written to `.env`. |
| `client/src/pages/nomii/dashboard/NomiiPlans.jsx` | Fetches `/api/config` on mount. When `deployment=selfhosted`, renders self-hosted license panel (usage meters + 3-step upgrade instructions) instead of Stripe pricing table. |

### How it works (operator journey)

**Install:** Run `scripts/install.sh` on a fresh Ubuntu server. Prompts for: public URL (IP or domain), Anthropic key, company name, admin email, admin password, SMTP (optional), license key (optional — defaults to trial), Cloudflare token (optional).

**First boot:** Backend auto-seeds tenant + pre-verified admin. License service sees no key → starts in trial mode (20 messages/mo, 1 customer). No cloud call needed.

**Operator logs in:** Lands in the Shenmay dashboard. No sign-up flow. No multi-tenant UI. Platform admin routes (`/api/platform/*`) return 404.

**Trial limits hit:** `subscription.js` middleware returns 429/403. Dashboard shows trial banner + 3-step upgrade instructions: 1. Purchase at pontensolutions.com/nomii/license, 2. Add key to `.env`, 3. Restart backend.

**Upgrade:** Operator buys license, gets key by email. Updates `.env` with `NOMII_LICENSE_KEY=...`, restarts backend. On startup, license service validates key, upserts subscription with new plan limits. They're live.

### Architecture decisions

- **Single codebase, not split** — multi-tenant surface area is thin (all scoped by `tenant_id` from JWT). Self-hosted mode is just a few `if` statements at startup + frontend flag checks. DRY, maintainable.
- **No internet required for trial** — if no license key is set, backend starts immediately in trial mode (local limits, no cloud API call). Operator can use the product before buying anything.
- **Plan limits enforced by existing middleware** — the heartbeat writes limits to the local `subscriptions` row. The existing `subscription.js` checks enforce them. Zero new enforcement code needed.
- **Restart for license updates** — v1 simplicity. Operator changes `.env`, restarts backend. No hot-reload complexity.

### VPS/SaaS safety

- `NOMII_DEPLOYMENT` not set on VPS → all guards are no-ops
- `NOMII_LICENSE_MASTER` not set on VPS yet → validation endpoint returns 404 (will be set next session when VPS is activated)
- All new code is additive; no existing routes or tables modified (except stripe-webhook importing from shared config)

### What's ready for next session

The complete on-prem system is **built and ready to deploy**. What's outstanding:

| Task | How long | Impact |
|------|----------|--------|
| Activate on VPS: set `NOMII_LICENSE_MASTER=true`, apply migration 029, redeploy | 15 min | Enables trial endpoint |
| End-to-end test: run install.sh locally, verify trial + upgrade flow | 30 min | Validates the full journey |
| Build pontensolutions.com `/nomii/license` page with Stripe payment links | 30 min | Makes license purchase discoverable (can be manual issuance via admin API for now) |
| Pending ops from earlier (migration 022, Stripe portal URL, trademark) | — | Unblocked; can do in parallel |

---

## Session: 2026-04-09 (morning) — Self-Hosted License Enforcement (Option A)

### What was built

License key system for self-hosted deployments. Operators must hold a key issued by Shenmay; the backend validates it on startup and every 24 hours.

| File | Purpose |
|------|---------|
| `server/db/migrations/029_licenses.sql` | `licenses` table: key, plan, issued_to_email, expires_at, instance_id, last_ping_at, is_active |
| `server/src/services/licenseService.js` | Startup check + 24h heartbeat. Reads `NOMII_LICENSE_KEY`; exits in production if missing or invalid. No-op in dev. |
| `server/src/routes/license.js` | `POST /api/license/validate` — public endpoint called by self-hosted instances. Only active when `NOMII_LICENSE_MASTER=true`. Binds key to instance_id on first use. |
| `server/src/routes/platform/licenses.js` | Admin CRUD: `GET/POST /api/platform/licenses`, revoke/reactivate/delete. Issues keys and emails them to operators. |
| `server/src/services/emailService.js` | Added `sendLicenseKeyEmail()` — sends formatted key + activation instructions to operator. |
| `server/src/index.js` | Wired two new routes; wrapped `app.listen` in async IIFE so license check runs before accepting traffic. |
| `docker-compose.selfhosted.yml` | Added `NOMII_LICENSE_KEY` + `NOMII_INSTANCE_ID` env var placeholders with comments. Also fixed parity gaps (see below). |
| `scripts/install.sh` | Added license key prompt (Step 3). Key written to `.env`. |

### VPS safety

The cloud VPS deployment is **completely unaffected**:
- `NOMII_LICENSE_KEY` is not set in the VPS `.env` → startup check is a no-op
- All new code is additive; no existing routes or tables modified
- Migration 029 adds one new table with no impact on existing schema

### Parity audit — gaps fixed in `docker-compose.selfhosted.yml`

| Gap | Fix |
|-----|-----|
| Duplicate `API_KEY_ENCRYPTION_SECRET` (lines 46 + 60) | Removed the duplicate (line 60) |
| Missing `JWT_EXPIRY` | Added with default `7d` |
| Missing `LLM_HAIKU_MODEL` | Added with default `claude-haiku-4-5-20251001` |
| Missing `LLM_SONNET_MODEL` | Added with default `claude-sonnet-4-20250514` |

`FRONTEND_URL_PROD` was intentionally omitted — it's a secondary CORS override only needed when the cloud instance has two separate frontend domains.

### How to issue a license (admin workflow)

```bash
# 1. Log in to the platform admin
curl -X POST https://api.pontensolutions.com/api/platform/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pontensolutions.com","password":"..."}'

# 2. Issue a license key (email is sent automatically)
curl -X POST https://api.pontensolutions.com/api/platform/licenses \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"issued_to_email":"operator@firm.com","issued_to_name":"Jane Smith","plan":"starter"}'

# Returns: { license: { license_key: "NOMII-XXXX-XXXX-XXXX-XXXX", ... } }

# 3. Revoke a license
curl -X PATCH https://api.pontensolutions.com/api/platform/licenses/<id>/revoke \
  -H "Authorization: Bearer <TOKEN>"
```

### New env vars introduced

| Var | Where | Purpose |
|-----|-------|---------|
| `NOMII_LICENSE_KEY` | Self-hosted `.env` | License key — required in production |
| `NOMII_INSTANCE_ID` | Self-hosted `.env` (optional) | Stable instance identifier across restarts |
| `NOMII_LICENSE_MASTER` | Cloud VPS `.env` | Set to `true` to activate the validate endpoint |
| `NOMII_LICENSE_VALIDATE_URL` | Self-hosted `.env` (optional) | Override validation URL (default: `https://api.pontensolutions.com/api/license/validate`) |

### Next session

- Set `NOMII_LICENSE_MASTER=true` in the VPS `.env` and redeploy to activate the validation endpoint
- Apply migration 029 on the VPS: `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/029_licenses.sql`
- Issue first test license key via platform admin and verify end-to-end with a local self-hosted install
- Pending ops tasks from previous session still outstanding (migration 022, Stripe portal URL, trademark)

---

## Session: 2026-04-09 — Self-Hosted Package + GHCR

### What was built

**Self-hosted package** — allows anyone to run Shenmay AI on their own server with a single command.

| File | Purpose |
|------|---------|
| `docker-compose.selfhosted.yml` | Standalone compose file: postgres, backend, frontend, optional Cloudflare Tunnel. Pulls pre-built images from GHCR — no source code needed on target server. |
| `scripts/install.sh` | Interactive wizard for fresh Linux servers. Checks/installs Docker, prompts for public URL + API key + SMTP, generates secrets, writes `.env`, starts services, health-checks the API. |
| `.github/workflows/docker-publish.yml` | Builds backend + frontend Docker images on every push to `main` or version tag, pushes to `ghcr.io/jafools/nomii-backend` and `ghcr.io/jafools/nomii-frontend`. Includes `make-public` job that calls GitHub API to set package visibility to public. |

### Fixes applied this session

- `scripts/install.sh:18` — fixed hardcoded `jafools/knomi-ai` → `jafools/nomii-ai` (post repo rename)
- `.github/workflows/docker-publish.yml` — added `docker/setup-buildx-action@v3` step; without it the GHA cache backend (`type=gha`) fails with "Cache export is not supported for the docker driver"

### GHCR status

- Workflow is triggering on every push to `main` ✅
- All 4 prior runs failed due to missing buildx setup (now fixed) ✅
- Packages (`nomii-backend`, `nomii-frontend`) do not yet exist in GHCR — first successful run will create them
- `make-public` job will attempt to set visibility to public via GitHub API after each push; may need a `PACKAGES_PAT` secret (classic PAT, `write:packages` scope) if `GITHUB_TOKEN` lacks sufficient permissions

### Critical gap identified — self-hosted has no license enforcement

**Problem:** The self-hosted `.env` contains the *operator's* `STRIPE_SECRET_KEY`. All subscription revenue from self-hosted deployments flows to the operator, not to Shenmay. There is currently zero mechanism to ensure Shenmay gets paid for self-hosted installs.

**Decision:** Implement Option A — License Key System.

**What Option A means:**
1. Operator purchases a license from Shenmay (via a checkout on nomii.ai or similar)
2. They receive a license key
3. The self-hosted Docker image validates the license key against a Shenmay-hosted endpoint on startup and periodically
4. If the license is missing, expired, or invalid → the backend refuses to start (or degrades gracefully)
5. Shenmay controls license issuance and renewal

**Nothing has been built for this yet.** It is the primary goal of the next session.

### Next session goal

Full audit + implementation of **Option A license enforcement** for self-hosted, covering:

1. License validation service (a small endpoint on Shenmay's servers — can be a simple Express route or Cloudflare Worker)
2. License check in the self-hosted Docker image (startup + periodic heartbeat)
3. License issuance flow (how operators purchase and receive a key)
4. Parity audit: verify on-prem and cloud versions have no hidden gaps (migrations, env vars, auth, email, Stripe, GHCR image freshness)
5. End-to-end test of the full self-hosted install flow

---

## ⚠️ Critical Ops Notes (Read First)

- **Frontend live URL is `https://nomii.pontensolutions.com`** — NOT `app.pontensolutions.com`. The Cloudflare/Lovable routing redirects there. CORS and any frontend references must use this domain.
- **Always use `docker compose up --build -d`** for any code change deployment — `docker compose restart` does NOT rebuild the image and new code will NOT take effect.
- **`WIDGET_JWT_SECRET` must be set in the root `.env`** (`~/Knomi/knomi-ai/.env`) AND referenced in `docker-compose.yml`. Without it the backend refuses to start in production. Added 2026-03-30.
- **CORS allowed origins** (in `server/src/middleware/security.js`): `nomii.pontensolutions.com`, `app.pontensolutions.com`, localhost:5173, localhost:3000. Override via `FRONTEND_URL` env var.
- **Deploy command (correct):**
  ```bash
  cd ~/Knomi/knomi-ai && git pull && docker compose up --build -d
  ```
- **Verify CORS is working** (run from server after deploy):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" -X OPTIONS https://api.pontensolutions.com/api/onboard/login \
    -H "Origin: https://nomii.pontensolutions.com" \
    -H "Access-Control-Request-Method: POST"
  ```
  Must return `204`. If `403`, CORS is broken.

---

## Current System State

**Backend repo:** `github.com/jafools/nomii-ai` (public, formerly knomi-ai)
**Frontend repo:** `github.com/jafools/ponten-solutions` (Lovable 2-way sync)
**Stack:** PostgreSQL 16, Express.js (port 3001), React/Vite/Tailwind, nginx, JWT auth
**Deployed:** Proxmox VM (`81.224.218.93`) via Docker Compose
**Public API:** `https://api.pontensolutions.com` (Cloudflare Tunnel)
**Public app:** `https://nomii.pontensolutions.com` (Lovable frontend — primary URL)
**Public app:** `https://app.pontensolutions.com` (nginx frontend)
**Marketing/portal:** `https://pontensolutions.com/nomii/*` (Lovable CDN)

### Docker containers (all running on VM):

| Container | Image | Status | Purpose |
|-----------|-------|--------|---------|
| `knomi-db` | postgres:16-alpine | Up, healthy | PostgreSQL (`knomi_ai` DB, `knomi` user) |
| `knomi-backend` | knomi-ai-backend | Up | Express.js API on port 3001 |
| `knomi-frontend` | knomi-ai-frontend | Up | React app served by nginx on port 80 |
| `knomi-cloudflared` | cloudflare/cloudflared:latest | Up | Cloudflare Tunnel |

### Cloudflare Tunnel
- **Tunnel ID:** `fb2cb466-3f4f-46f8-8a0c-2b45c549bbe4`
- **Name:** `knomi-ai`
- **Routes:** `api.pontensolutions.com` → backend:3001, `app.pontensolutions.com` → frontend:80

### Environment variables (server — current state)

```
# Set and working (as of 2026-03-22)
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-api03-...   ⚠️ ROTATE at console.anthropic.com (was shared in chat)
CLAUDE_API_KEY=sk-ant-api03-...      (same key, docker-compose compatibility alias)
CLOUDFLARE_TUNNEL_TOKEN=eyJh...
STRIPE_WEBHOOK_SECRET=whsec_g8O3jWX...   ✅ Set
STRIPE_PRICE_STARTER=price_1TBzOuBlxts7IvMo3gKGHMnD   ✅ Set
STRIPE_PRICE_GROWTH=price_1TBzQ4Blxts7IvMoljlGNcQt    ✅ Set
STRIPE_PRICE_PROFESSIONAL=price_1TBzQoBlxts7IvMozz1hzhDr  ✅ Set

MASTER_EMAIL=ajaces@gmail.com        ✅ Set
API_KEY_ENCRYPTION_SECRET=...        ✅ Set
STRIPE_SECRET_KEY=sk_live_...        ✅ Set
SMTP_HOST=...                        ✅ Set
SMTP_USER=...                        ✅ Set
SMTP_FROM=...                        ✅ Set

# ⬇️ STILL NEED TO SET
STRIPE_PORTAL_RETURN_URL=https://app.pontensolutions.com/nomii/dashboard/plans
SMTP_PASS=...                        ← verify this is set (not checked above)
```

---

## What Has Been Built (All Sessions)

### Sessions 1–3 — Core Platform (2026-03-05 to 2026-03-11)

- Multi-tenant SaaS backend: PostgreSQL schema, Express.js API, JWT auth (4 layers)
- Soul + Memory engine: `promptBuilder.js` → system prompt pipeline
- Widget embed: `embed.js` + `widget.html` (drop-in script tag, floating chat bubble, iframe)
- Cloudflare Tunnel: all traffic via `api.pontensolutions.com`
- Tenants: Covenant Trust (demo), Hope for This Nation (live, widget on hub.hopeforthisnation.com)
- Migrations: `001` through `004`

### Session 4 — Portal + Legal (2026-03-11)

- Onboarding wizard (5 steps), tenant self-serve portal (`/api/portal/*`)
- ToS acceptance tracking, right-to-erasure (`DELETE /customers/:id` anonymises)
- Migrations: `005_portal.sql`, `006_tos_and_deletion.sql`

### Session 5 — Bug Fixes + Agent Steering (prior context)

- **Fix:** Customer conversations pane was empty — added correlated subquery to `GET /customers/:id`
- **Fix:** Chat bubble didn't persist personalized agent name — widget now compares `agentName` vs `agent.default_name`
- **Improved:** `promptBuilder.js` — company-agnostic steering rules, explicit off-topic refusal block, strong CTA-ending rules
- Migrations: `007`, `008`, `009`

### Session 6 — Subscription System + BYOK (prior context)

Full commercial subscription system built from scratch:

**Backend:**
- **`010_subscriptions_and_api_keys.sql`** — `subscriptions` table + API key columns on tenants
- **`middleware/subscription.js`** — `requireActiveSubscription`, `requireActiveWidgetSubscription`, `incrementMessageCount`
- **`services/apiKeyService.js`** — AES-256-GCM encryption for tenant API keys
- **`services/llmService.js`** — BYOK key resolution: tenant encrypted key → global platform key → mock
- **`routes/stripe-webhook.js`** — Handles `checkout.session.completed`, `invoice.paid/failed`, `subscription.updated/deleted`
- **`routes/onboard.js`** — Master account detection (`MASTER_EMAIL` env var), trial subscription creation on register
- **`routes/portal.js`** — New routes: `GET /subscription`, `POST /api-key`, `DELETE /api-key`, `POST /billing/checkout`, `POST /billing/portal`, `GET /plans`

**Plans:**
| Plan | Price | Customers | Messages/mo | Managed AI |
|------|-------|-----------|-------------|------------|
| Trial | Free (14 days) | 25 | 500 | No |
| Starter | $49/mo | 50 | 1,000 | No |
| Growth | $149/mo | 250 | 5,000 | Yes |
| Professional | $399/mo | 1,000 | 25,000 | Yes |
| Master | Free forever | Unlimited | Unlimited | Yes |

**Frontend:**
- `SubscriptionGate.jsx` — Locks dashboard content when subscription invalid, trial countdown banner
- `NomiiPlans.jsx` — **Stripe pricing table embed** (`prctbl_1TBzcVBlxts7IvMoJ2bWRd47`)
- `StepApiKey.jsx` — BYOK API key onboarding step with real-time validation
- `KnomiDashboardLayout` — Plans & Billing nav item, SubscriptionGate wrapper

### Session 7 — Rebrand + Stripe Integration (2026-03-18, this session)

**Rebrand: Knomi AI → Nomii AI** (historical — see 2026-04-20 for subsequent Nomii → Shenmay rebrand)
- All SVG logos updated: `nomiiai_*` (10 files in `Company Logos/`)
- All frontend files renamed: `Nomii*.jsx`, `pages/nomii/`, `components/nomii/`
- All code text, routes, localStorage keys, comments updated
- Infrastructure names preserved (`knomi_ai` DB, `knomi-*` containers)
- Commits: `08980a7` (backend), `4e25f77` (frontend)

**Stripe pricing table integration:**
- Stripe pricing table ID: `prctbl_1TBzcVBlxts7IvMoJ2bWRd47`
- Publishable key: `pk_live_U89VEYjy02VivrGxi5QF2IIw00cPn8Ts2n`
- Customer portal: `https://billing.stripe.com/p/login/28EbJ0cqz4y5gZEgS68N200`
- Webhook updated to handle `client_reference_id` (pricing table) + `metadata.tenant_id` (custom checkout)
- Plan auto-detected from price ID via `getPlanFromPriceId()` reverse lookup
- `NomiiPlans.jsx` now embeds Stripe pricing table, passes `tenant_id` as `client-reference-id`
- Commits: `1bf9766` (backend webhook), `411d623` (frontend plans page)

**Stripe product images:**
- `Company Logos/stripe_starter.jpg` — 1600×1000 on-brand JPEG for Stripe product
- `Company Logos/stripe_growth.jpg`
- `Company Logos/stripe_professional.jpg`

**Marketing page pricing section:**
- Added pricing section to `NomiiAI.tsx` (public product page)
- Three plan cards with inline SVG node graph headers, Growth highlighted as most popular
- Enterprise CTA row at bottom
- Commit: `f5251d3`

### Session 8 — Human Takeover, Unread Badges, Multi-Agent Teams (2026-03-20)

**Widget polling fix (human takeover messages not appearing in widget):**
- Root cause: widget only polled after entering human mode, but only entered human mode on poll response — deadlock
- Fix: `startBackgroundPoll()` called from `showChat()` — widget polls from session init
- `POLL_INTERVAL_AI = 5000ms`, `POLL_INTERVAL_HUMAN = 2500ms`
- `setHumanMode()` adjusts interval speed without resetting cursor

**Unread badge system:**
- `conversations.unread` BOOLEAN flag: set TRUE when widget sends message, FALSE when agent opens conversation
- Yellow number badge on "Conversations" nav
- Red number badge on "Concerns" nav (escalated conversations)
- `GET /api/portal/badge-counts` → `{ unread_conversations, open_concerns, unread_concerns }`
- Badges poll every 10s in sidebar

**Concerns pane takeover:**
- `mode` and `unread` added to concerns API response
- Red "Jump In" button for unread concerns, plain "View" for read
- Navigates to full conversation detail with Take Over / Hand Back / Reply UI

**Multi-agent team management:**
- `GET/POST/DELETE /api/portal/team` — list, invite, remove agents
- Agent invite: sends email with 7-day token via `/api/onboard/invite/:token` + `/api/onboard/accept-invite`
- Plan agent limits: free=1, trial=3, starter=10, growth=25, professional=100
- `NomiiTeam.jsx` — capacity bar, invite form, agent list with role/status
- `NomiiAcceptInvite.jsx` — public page for accepting invites, sets password
- "Team" nav item added to sidebar

**Migration 014:**
- `conversations.unread BOOLEAN NOT NULL DEFAULT FALSE`
- `subscriptions.max_agents INTEGER` with plan-specific defaults
- `tenant_admins` role CHECK expanded to `('owner', 'member', 'agent')`
- `invite_token`, `invite_expires_at`, `invited_by` columns on `tenant_admins`
- Applied inline (git push not possible from sandbox)

**Marketing page updates (`NomiiAI.tsx`):**
- SEO description updated
- New "Anonymous Visitor Widget" section with mock chat preview
- Feature cards: replaced "Proactive Insights" → "Human Takeover", "Actionable Analytics" → "Multi-Agent Teams"
- Operator Dashboard card copy updated to mention takeover + unread badges
- Pricing: added agent seat counts to each tier (Starter: 10, Growth: 25, Professional: 100)
- Download link for pitch overview doc added to CTA section
- JSON-LD FAQ: added Q&A for human takeover, team accounts, anonymous visitors

**Pitch document:**
- `nomii_pitch.docx` — 6-page grandma-friendly overview: What Is Shenmay, How It Works, Features, Pricing, FAQ
- Saved to `PontenSolutions/Shenmay AI Pitch Document.docx`
- Also copied to `ponten-solutions/public/nomii-ai-overview.docx` for download link

**New / modified files (Session 8):**
- `server/public/widget.html` — background poll fix
- `server/src/routes/widget.js` — sets unread=TRUE on message
- `server/src/routes/portal.js` — badge-counts endpoint, team endpoints, unread tracking
- `server/src/routes/onboard.js` — invite token endpoints
- `server/db/migrations/014_unread_and_agents.sql` — new migration
- `client/src/layouts/NomiiDashboardLayout.jsx` — badge polling, Team nav item
- `client/src/pages/nomii/dashboard/NomiiConcerns.jsx` — Jump In CTA, unread indicator
- `client/src/pages/nomii/dashboard/NomiiTeam.jsx` — NEW team management page
- `client/src/pages/nomii/NomiiAcceptInvite.jsx` — NEW invite acceptance page
- `client/src/lib/nomiiApi.js` — getBadgeCounts, getTeam, inviteAgent, removeAgent, getInviteInfo, acceptInvite
- `client/src/App.tsx` — NomiiTeam + NomiiAcceptInvite routes
- `ponten-solutions/src/pages/NomiiAI.tsx` — marketing page refresh
- `PontenSolutions/Shenmay AI Pitch Document.docx` — new pitch doc
- `ponten-solutions/public/nomii-ai-overview.docx` — pitch doc for download link

**⚠️ Code not yet pushed to GitHub** — git push failed from sandbox (no outbound network). User must run `git push` from local machine, then `docker compose build && docker compose up -d` on server.

### Session 9 — Stripe Webhook End-to-End Testing + Rate Limiting (2026-03-22)

**Stripe webhook verified end-to-end (all 3 plans):**
- Root cause of empty reply: `stripe` npm package missing from node_modules after container rebuild
- Root cause of rebuild dropping stripe: `COPY . .` in Dockerfile was overwriting node_modules with local copy
- Fix 1: Added `node_modules` to `server/.dockerignore`
- Fix 2: Added `stripe` + `express-rate-limit` to `server/package.json` (permanent)
- Fix 3: Added `metadata.plan` to test-webhook.sh payload so handler uses fast path (no Stripe API call)
- Fix 4: Fixed `max_agents` parameter ordering in `stripe-webhook.js` UPDATE query ($7=tenantId, $8=max_agents)
- All 3 plan webhooks confirmed: HTTP 200, correct limits in DB

**Stripe webhook — confirmed working limits in DB:**

| Plan | Customers | Messages/mo | Agents | Commit |
|------|-----------|-------------|--------|--------|
| Starter | 50 | 1,000 | 10 | `1eead20` |
| Growth | 250 | 5,000 | 25 | `1eead20` |
| Professional | 1,000 | 25,000 | 100 | `1eead20` |

**Rate limiting added (`server/src/index.js`):**
- Uses `express-rate-limit` with graceful degradation (passthrough if not installed)
- Widget session creation: 10 per 5 min per IP (prevents widget key scraping)
- Widget chat: 30 per min per IP (LLM cost protection — primary guard)
- Tenant registration: 5 per hour per IP (prevents spam accounts)
- Tenant login: 10 per 15 min per IP (brute-force protection)
- Global safety net: 300 per min per IP (covers all other endpoints)
- Run `npm install` after pulling to activate (package is in package.json)

**Migration 014 fix script (`scripts/fix-migration-014.sh`):**
- Safe idempotent script to apply migration 014 on server
- Fixes `[ERROR] column c.unread does not exist` (portal badge-counts fails)
- Run: `bash scripts/fix-migration-014.sh` from `~/Knomi/knomi-ai`
- Auto-detects if already applied; auto-restarts backend after applying

**`server/package.json` updated:**
- Added `stripe: ^17.7.0` (was missing from local workspace copy; caused rebuild to drop the package)
- Added `express-rate-limit: ^7.5.0`

**`server/.dockerignore` updated:**
- Added `node_modules` exclusion (prevents local node_modules from overwriting container's npm-installed modules on `COPY . .`)

**Key env var fix for test scripts:**
- `source .env` fails when SMTP_FROM contains angle brackets (`<hello@...>`)
- Workaround: `export VAR=$(grep '^VAR=' .env | cut -d'=' -f2-)` per variable
- Applied to all future test scripts

**Commits this session:**
- `1eead20` — feat: complete Stripe webhook integration with plan limits and agent seats
  - server/src/routes/stripe-webhook.js (max_agents in PLAN_LIMITS + UPDATE query)
  - server/.dockerignore (node_modules exclusion)
  - scripts/test-webhook.sh (env path, metadata plan, safe env loading)
  - scripts/test-plans.sh (new — direct DB plan simulator)

**New / modified files (Session 9, not yet committed):**
- `server/src/index.js` — rate limiting middleware added
- `server/package.json` — stripe + express-rate-limit added
- `scripts/fix-migration-014.sh` — NEW: safe migration 014 applier

---

## Tenants

### Hope for This Nation (Live)
- Admin: `ajaces@gmail.com`
- Agent: **Beacon** (formerly Larry)
- Widget key: `4e8bb9c05b6ffc22004a4edc65f1e9e43b291014d5803384722e5c7fe001c907`
- Widget live on: `hub.hopeforthisnation.com`
- Colors: `#4A2C8F` purple / `#F5A623` gold

### Creator / Master Account
- Email: `ajaces@gmail.com`
- Set `MASTER_EMAIL=ajaces@gmail.com` on server — registration with this email auto-creates master subscription
- If account already exists, manually INSERT master subscription (see below)

---

## Public URLs

| URL | Routes to | Purpose |
|-----|-----------|---------|
| `https://api.pontensolutions.com` | `knomi-backend:3001` | Public API |
| `https://api.pontensolutions.com/api/stripe/webhook` | stripe-webhook.js | Stripe webhook endpoint |
| `https://pontensolutions.com/nomii/*` | Lovable/CDN | Self-serve tenant portal |
| `https://pontensolutions.com/products/nomii-ai` | Lovable/CDN | Marketing page (has pricing section) |
| `https://app.pontensolutions.com` | `knomi-frontend:80` | Legacy admin UI |
| `https://billing.stripe.com/p/login/28EbJ0cqz4y5gZEgS68N200` | Stripe | Customer billing portal |

---

## Auth Layers (4 separate JWT systems)

1. **Main app JWT** — customer / advisor / admin in the React app
2. **Platform JWT** — superadmin (`/api/platform/`)
3. **Widget JWT** — issued by `/api/widget/session`, 15-min expiry
4. **Portal JWT** — issued by `/api/onboard/login`, `{ portal: true }` claim

---

## Common Operations

```bash
# SSH
ssh user@81.224.218.93

# View containers
docker ps

# Rebuild and restart backend after code changes
docker compose build backend && docker compose up -d backend

# Live logs
docker compose logs -f backend
docker compose logs -f knomi-cloudflared

# Run a migration
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/010_subscriptions_and_api_keys.sql

# Test API
curl https://api.pontensolutions.com/api/health

# Manually create master subscription for existing tenant
docker exec -it knomi-db psql -U knomi -d knomi_ai -c "
  INSERT INTO subscriptions (tenant_id, plan, status, max_customers, max_messages_month, trial_ends_at)
  SELECT id, 'master', 'active', 99999, 999999, NOW() + INTERVAL '100 years'
  FROM tenants WHERE id = (SELECT tenant_id FROM tenant_admins WHERE email = 'ajaces@gmail.com')
  ON CONFLICT (tenant_id) DO UPDATE SET plan='master', status='active', max_customers=99999, max_messages_month=999999;
"
```

---

### Session 12 — Three-Tier Data Model + Architecture Separation (2026-03-25)

#### Three-Tier Data Model

Established the product's long-term data architecture. Every customer can choose how their data enters Shenmay:

| Tier | What it is | Who it's for |
|------|-----------|-------------|
| **CSV Upload** | Upload a spreadsheet from the portal. Already existed. | Small businesses, non-technical teams |
| **Data API** | Push data programmatically via `POST /api/v1/` REST API | Tech-savvy teams, CRM integrations, nightly syncs |
| **Live Connector** | Shenmay calls the tenant's own API at query time. Data never stored in Shenmay. | Security-conscious firms, regulated industries, privacy-first |

#### New: External Data API (`/api/v1/`)

**Migration 017** (`server/db/migrations/017_data_api.sql`):
- Adds `data_api_key_hash` (bcrypt) and `data_api_key_prefix` to tenants
- Key is shown ONCE at generation, never stored in plain text

**`server/src/routes/dataApi.js`** (NEW):
- Auth: `Authorization: Bearer nomii_da_<key>` — prefix-based lookup then bcrypt compare
- `POST /api/v1/customers` — upsert by `external_id`
- `POST /api/v1/customers/:external_id/records` — bulk upsert up to 1,000 records; `replace_category` flag for full re-syncs
- `GET /api/v1/customers` — list with search/pagination
- `GET /api/v1/customers/:external_id/records` — fetch records grouped by category
- `DELETE /api/v1/customers/:external_id/records[/:category]` — clear all or one category
- Rate limited: 120 req/min per IP

**Portal key management** (added to `server/src/routes/portal.js`):
- `GET  /api/portal/settings/data-api-key` — returns `{ has_key, prefix }`
- `POST /api/portal/settings/data-api-key` — generates key, returns full key ONCE
- `DELETE /api/portal/settings/data-api-key` — revokes key immediately

**Settings UI** (`client/src/pages/nomii/dashboard/NomiiSettings.jsx`):
- New "Data API" section with three-model explainer cards (CSV / API / Connector)
- Key generation with one-time reveal + copy button + show/hide toggle
- Revoke button with confirmation step
- Copyable `curl` code snippet

#### Model 2: Connect Tool Polish

**`server/src/tools/custom_tool_handler.js`** (MODIFIED):
- `connect` type now reads `auth_type`, `auth_token`, `auth_header_name` from config
- Builds correct auth headers: bearer token or custom API key header

**`server/src/routes/portal.js`** (MODIFIED):
- `connect` tool type in `/tools/types` now includes `auth_type`, `method` config fields
- New endpoint: `POST /api/portal/tools/:toolId/test` — fires a test request to the webhook with `_test: true`, returns HTTP status + response body

**`client/src/pages/nomii/dashboard/NomiiTools.jsx`** (MODIFIED):
- `ConfigFields` shared component handles standard fields + conditional auth fields for `connect` type
- Auth type dropdown (none / bearer / api_key) → expands to show token input + optional header name
- **Test Connection button** on connect-type tool cards — shows inline result: HTTP status + response preview

#### Model 3: Enterprise On-Premise (Marketing)

**`ponten-solutions/src/pages/NomiiAI.tsx`** (MODIFIED):
- Added "Your data, your way" row above the enterprise CTA: three tiles explaining CSV / Data API / Live Connector in plain English, all tagged "All plans"
- Enhanced enterprise CTA copy: now explicitly mentions on-premise deployment, BAA, and regulated industries

#### Commits

- `a2daa50` — `feat: three-tier data model — Data API, live connector polish, enterprise marketing` (nomii-ai)
- `de49eb5` — `feat: add three-tier data model explainer + enhanced enterprise CTA to pricing section` (ponten-solutions)

### Session 13 — Soul Generation, Customer Data UI, Branded Emails (2026-03-25)

#### Agent Soul Auto-Generation

**`server/src/engine/soulGenerator.js`** (NEW):
- `generateAgentSoul(tenant, apiKey)` — calls `claude-haiku-4-5-20251001` to generate a rich soul from tenant profile (company name, agent name, vertical, description, website)
- Returns `base_identity`, `communication_style` (with `key_principles`), and `compliance` (disclaimer + restricted topics)
- `buildFallbackSoul(tenant)` — rule-based fallback for 8 industries if LLM unavailable: financial, retirement, ministry, healthcare, insurance, education, ecommerce, other
- Both paths return `generated_at` and `generated_from` metadata

**Migration 018** (`server/db/migrations/018_agent_soul_template.sql`):
- Adds `agent_soul_template JSONB DEFAULT NULL` to tenants
- Applied to new customers' `soul_file` at creation time

**`server/src/routes/portal.js`** (MODIFIED):
- `PUT /api/portal/company` — now auto-regenerates `agent_soul_template` in background via `setImmediate` when name/agent_name/vertical/company_description changes
- `GET /api/portal/settings/agent-soul` — return current soul template for the tenant
- `POST /api/portal/settings/generate-soul` — (re)generate soul using Claude, stores result in `agent_soul_template`
- CSV upload: fetches `agent_soul_template` before loop; new customers seeded with it as `soul_file`

**`server/src/routes/dataApi.js`** (MODIFIED):
- `POST /api/v1/customers` — fetches `agent_soul_template` and seeds new customers' `soul_file` at creation

**`client/src/pages/nomii/dashboard/NomiiSettings.jsx`** (MODIFIED):
- New `AgentSoulSection` component: shows `base_identity` (agent name, org, tone, role), `communication_style.key_principles` as bullet list, `compliance` (disclaimer + restricted topic tags)
- "Generate Soul" / "Regenerate" button calls POST `/api/portal/settings/generate-soul`
- Placed between CompanyProfile and WidgetSection

**`client/src/lib/nomiiApi.js`** (MODIFIED):
- `getAgentSoul()`, `generateSoul()`

#### Customer Data UI

**`server/src/routes/portal.js`** (MODIFIED — 4 new routes):
- `GET /api/portal/customers/:id/data[?category=]` — returns records grouped by category
- `POST /api/portal/customers/:id/data` — upsert a single record (category, label, value, value_type)
- `DELETE /api/portal/customers/:id/data/:category` — clear all records in a category
- `DELETE /api/portal/customers/:id/data/:category/:label` — delete one record

**`client/src/pages/nomii/dashboard/NomiiCustomerDetail.jsx`** (MODIFIED):
- New `CustomerDataSection` component above the Delete card
- Lists records grouped by collapsible category sections
- "Add Record" form: category, label, value, value_type fields
- Delete per-record (hover X) or entire category (Clear button)
- Confirm modal for category clears

**`client/src/lib/nomiiApi.js`** (MODIFIED):
- `getCustomerData(id, category?)`, `addCustomerDataRecord(id, record)`, `deleteCustomerCategory(id, category)`, `deleteCustomerRecord(id, category, label)`

#### Branded Agent Invite Emails

**`server/src/services/emailService.js`** (MODIFIED):
- New `sendAgentInviteEmail({ to, firstName, inviterName, tenantName, inviteUrl })` with full Shenmay-branded HTML email
- Dark blue header, "What you'll be able to do" highlight box, clear CTA button, 7-day expiry notice

**`server/src/routes/portal.js`** (MODIFIED):
- `POST /api/portal/team/invite` — replaced inline `sendEmail` call (broken — function didn't exist) with `sendAgentInviteEmail`

#### Commits
- `71b0a12` — `feat: soul generation, customer data UI, branded invite emails`
- `8a68e0d` — `fix: bug sweep — customer_data schema, is_deleted, tool column names`

#### Bug fixes in `8a68e0d` (all pre-existing from Session 12, found in Session 13 review)

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `is_deleted = false` in 9 queries | Column never existed; actual column is `deleted_at` | Replaced all with `deleted_at IS NULL` |
| `customer_data` schema mismatch | Data API used `category/value/secondary_value` but table had `data_category/value_primary/value_monthly` | Migration 019 rebuilds table with generic schema |
| Missing `UNIQUE(customer_id, category, label)` | `ON CONFLICT` in dataApi.js had no backing constraint | Added in migration 019 |
| `name` column missing on `customers` | Data API's `POST /customers` requires a `name` field | Migration 019 adds `name TEXT`, back-filled from `first_name + last_name` |
| `lookup_client_data.js` used old column names | Schema mismatch | Updated to use `category`, `value`, `secondary_value`, `recorded_at` |
| `generate_report.js` INSERT used old schema | Schema mismatch | Updated INSERT to use new schema |
| CSV upload notes INSERT used old schema | Schema mismatch | Fixed to use `category/label/value` |

---

## Immediate TODO (before going live)

1. ✅ ~~Fix `c.unread` error~~ — Migration 014 applied 2026-03-23
2. ✅ ~~Push Session 8+9 code to GitHub~~ — Done 2026-03-23 (commit `678604b`)
3. ✅ ~~Pull + rebuild on server~~ — Done 2026-03-23, all containers healthy
4. ✅ ~~Set env vars~~ — All set: MASTER_EMAIL, API_KEY_ENCRYPTION_SECRET, STRIPE_SECRET_KEY, SMTP
5. ✅ ~~Push Sessions 10–12 code~~ — Committed and pushed (`a2daa50`)
6. ✅ ~~Soul generation, customer data UI, branded emails~~ — Committed `71b0a12` (Session 13)
7. ✅ ~~Push Session 13+14 code to GitHub~~ — Done 2026-03-26
8. **Apply Migrations on server (SSH → VM):**
   ```bash
   # Migration 015b — seed Covenant Trust tool configs (if not done):
   docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/015b_seed_covenant_trust_tools.sql
   # Migration 016 — custom_tools table (if not done):
   docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/016_custom_tools.sql
   # Migration 017 — data_api_key columns (if not done):
   docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/017_data_api.sql
   # Migration 018 — agent_soul_template column:
   docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/018_agent_soul_template.sql
   # Migration 019 — rebuild customer_data to generic schema (IMPORTANT — run before using Data API or customer data UI):
   docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/019_rebuild_customer_data.sql
   # Then rebuild backend + frontend:
   docker compose up -d --build backend frontend
   ```
9. **Create master subscription** — Run the SQL in Common Operations below (if not already done)
10. ✅ ~~Rotate Anthropic API key~~ — Done 2026-03-25
11. ✅ ~~Verify SMTP_PASS is set~~ — Confirmed set 2026-03-25

## Near-term TODO (Next Sessions)

- **Per-agent read tracking** — Currently `unread` is per-conversation global. Could add per-agent read tracking in v2.
- ✅ ~~**Session summary auto-write**~~ — Done Session 15
- ✅ ~~**Advisor dashboard memory view**~~ — Done Session 16: PersonalProfileSection + GoalsSection + ConversationRow sync button in NomiiCustomerDetail
- ✅ ~~**Widget conversation context loader / proactive greeting**~~ — Done Session 16: `/api/widget/greeting` generates AI welcome-back message; falls back to static after 5s
- ✅ ~~**Document delivery tool**~~ — Done Session 16: `send_document` universal tool emails formatted HTML report; `sendDocumentEmail` added to emailService; registered in tool registry
- **`send_document` in Covenant Trust tool config** — Add `send_document` to the demo tenant's `enabled_tools` DB array so it works in live demos: `UPDATE tenants SET enabled_tools = enabled_tools || '["send_document"]' WHERE slug = 'covenant-trust';`
- **Live Connector skeleton** — Tier 3 of the data model. Stubbed-out Redtail/Orion connector configurable per tenant. Enterprise unlock.
- **Production infrastructure** — Migrate off Proxmox to VPS (Hetzner CX22 ~$6/mo — see `Shenmay AI Phase 3 Plan.docx`)

## Future / Strategic

- **SOC 2 Type II** — Required for enterprise financial firm onboarding. 6-12 month process. Start when first enterprise prospect is signed.
- **BAA (Business Associate Agreement)** — Legal contract required by financial/healthcare firms. Needed alongside SOC 2.
- **External API connectors** — Connect Shenmay to Orion, Envestnet, Redtail, Wealthbox (financial CRMs). Data fetched at query time, not stored. Enterprise tier feature.
- **On-premise deployment** — Entire Shenmay stack runs inside the firm's own infrastructure. Enterprise tier. Architecture is ready; just needs packaging.
- **Trademark** — "Shenmay AI" needs attorney sign-off before commercial launch. Shenmay selected over Knomi AI due to Aware Inc. trademark conflict.
- **GDPR** — Privacy Policy and DPIA needed before scaling to EU customers
- **Data retention** — Backend cron job for auto-purging old conversations/data
- **Stripe real purchase test** — Use test card `4242 4242 4242 4242` (any future expiry, any CVC) via pricing table

---

### Session 16 — Proactive Greeting, Memory Dashboard, Document Delivery (2026-03-26)

#### What Was Built

**Proactive AI greeting for returning widget users**
- New `POST /api/widget/greeting` endpoint in `widget.js`
  - Loads customer `memory_file` + `soul_file` + tenant API key fields
  - If customer has prior `conversation_history`: calls Haiku to generate a 1–2 sentence personalized welcome-back message referencing last session topics
  - Returns `{ greeting: string | null }` — null for new users, anonymous sessions, or no API key
  - Always responds (never throws) — widget falls back gracefully on any failure
- `widget.html` updated: returning user path now calls `/api/widget/greeting` instead of static `buildReturnGreeting`
  - Shows typing indicator (`showTyping(true)`) while fetching
  - 5s hard timeout falls back to static greeting if API is slow
  - Static fallback also applied on error

**Conversation history capping in promptBuilder**
- `buildConversationHistoryBlock` now limits to last 5 sessions (configurable via `HISTORY_WINDOW` constant)
- Older sessions acknowledged via "(N earlier sessions not shown)" note — agent knows history exists
- Added `action_items` display to session blocks (from `lastSession.action_items`)
- Prevents token bloat for long-term customers with many sessions

**Advisor dashboard — full memory visibility**

`NomiiCustomerDetail.jsx` extended with three new components:

- **`PersonalProfileSection`** — renders `memory_file.personal_profile`: name, age, location, career, tech comfort, communication pref, marital status, spouse, late spouse, children
- **`GoalsSection`** — renders `memory_file.life_plan.goals`, `.concerns`, and action items from the most recent session summary
- **`ConversationRow`** — replaces the plain Link with a component that adds a "⚡ Sync" button; clicking fires `POST /api/portal/conversations/:id/summarize` and refreshes the view after 3s
- `triggerMemorySummary(conversationId)` added to `nomiiApi.js`
- New lucide icons imported: `Target`, `Zap`

**`send_document` universal tool**

- `server/src/tools/universal/send_document.js` (NEW) — complete tool + handler
  - Looks up customer email from DB (no need to ask user)
  - Validates it's not an anon visitor placeholder
  - Calls `sendDocumentEmail` in emailService
  - Logs delivery to `customer_data` category `sent_documents` for advisor visibility
  - Returns `{ success, sent_to, message }` — agent reads this and tells the customer
- `server/src/services/emailService.js` — added `sendDocumentEmail({ to, customerName, agentName, tenantName, subject, summary, sections, nextSteps, disclaimer })`
  - Clean branded HTML email: dark blue header, white body, section cards, orange next-steps block, auto disclaimer footer
  - `sendDocumentEmail` exported in `module.exports`
- `server/src/tools/registry.js` — `send_document` registered

#### Typical agent flow (tool-enabled tenant):
```
Customer: "Can you send me a summary of what we discussed?"
Agent → generate_report({ report_type: "Session Summary", ... }) → gets report object
Agent → send_document({ subject: "Your Session Summary", summary: "...", sections: [...] }) → email sent
Agent: "Done! I've sent your session summary to your email."
```

#### Modified Files

- `server/src/routes/widget.js` — callClaude import + greeting endpoint
- `server/public/widget.html` — returning user path with typing indicator + API call + fallback
- `server/src/engine/promptBuilder.js` — history cap + action items in session blocks
- `server/src/tools/universal/send_document.js` — NEW
- `server/src/tools/registry.js` — send_document registered
- `server/src/services/emailService.js` — sendDocumentEmail added
- `client/src/pages/nomii/dashboard/NomiiCustomerDetail.jsx` — PersonalProfileSection, GoalsSection, ConversationRow
- `client/src/lib/nomiiApi.js` — triggerMemorySummary added

#### Deploy

```bash
git add server/src/routes/widget.js server/public/widget.html \
        server/src/engine/promptBuilder.js \
        server/src/tools/universal/send_document.js \
        server/src/tools/registry.js \
        server/src/services/emailService.js \
        client/src/pages/nomii/dashboard/NomiiCustomerDetail.jsx \
        client/src/lib/nomiiApi.js
git commit -m "feat: proactive AI greeting, full memory dashboard, send_document tool"
git push
# on server:
docker compose up -d --build backend frontend
```

---

### Session 14 — Soul Wire-up, Notifications, WordPress Plugin, Rate Limiting (2026-03-26)

#### What Was Built

**promptBuilder.js — Soul schema wire-up (high priority bug fix)**
- `buildCommunicationBlock` now reads `soul.communication_style` (new schema: `tone`, `complexity_level`, `pacing`, `key_principles`, `avoid_phrases`, `preferred_phrases`) with fallback to legacy `soul.communication_profile` + `soul.behavioral_rules`
- `buildComplianceBlock` now reads `soul.compliance` (generated: `required_disclaimers`, `restricted_topics`, `escalation_triggers`) with fallback to `tenant.compliance_config`
- `buildCustomerDataBlock` uses new column names (`category`, `value_type`, `value`, `secondary_value`) with legacy fallbacks

**analyze_client_data.js — Schema update**
- SQL updated to new `customer_data` columns (`category`, `value_type`, `value`, `secondary_value`, `metadata`, `recorded_at`)
- Aggregation now parses TEXT `value`/`secondary_value` to float before summing

**Advisor flag email notifications**
- `emailService.js`: Added `sendFlagNotificationEmail` — severity-coded HTML email (critical/high/medium/low color themes) with customer name, flag type, description, and dashboard CTA
- `chat.js`: After each flag INSERT, fetches advisor email and fires notification as fire-and-forget so chat response is never blocked

**Soul auto-generation on API key save**
- `portal.js POST /api-key`: After validating + storing the key, kicks off `generateAgentSoul` in background via `setImmediate`
- Only generates if no soul exists yet (won't overwrite manually regenerated souls)
- Together with existing company-update auto-regeneration, every new tenant now gets a soul automatically during onboarding

**WordPress Plugin**
- Full working plugin at `server/public/downloads/nomii-wordpress-plugin.zip`
- Features: admin settings page (key, position, colors, greeting, auto-embed toggle), `[nomii_widget]` shortcode with per-page attribute overrides, sitewide auto-embed via `wp_footer`, duplicate injection prevention
- Served automatically by `express.static` — accessible at `https://api.pontensolutions.com/downloads/nomii-wordpress-plugin.zip`

**Data API per-key rate limiting**
- In-memory Map tracks request counts per key prefix within 60s windows
- Default limit: 120 req/min per key (override with `DATA_API_RATE_LIMIT` env var)
- Applied after auth so unauthenticated probes don't burn tenant quota
- 429 response with descriptive message when exceeded
- Stale entry cleanup every 5 minutes

#### Commits
- `1948625` — fix: wire new soul schema into promptBuilder + fix analyze_client_data columns
- `a3a9d1f` — feat: advisor flag notifications, soul auto-trigger, WP plugin, per-key rate limiting

### Session 15 — Real-Time Memory & Soul Persistence (2026-03-26)

#### What Was Built

**`server/src/engine/memoryUpdater.js`** — Complete rewrite (v1 → v2)

Replaced the basic post-session-only stub with a comprehensive real-time system that runs three independent operations fire-and-forget after every single chat exchange.

**Operation 1 — Fact extraction (every message):**
- `extractFactsFromExchange` — haiku LLM call that extracts personal facts explicitly stated by the customer (name, age, location, career, family, goals, concerns)
- `applyFactsToMemory` — deep-merge into `memory_file`; never overwrites existing data, only fills gaps
- `keywordFallbackExtraction` — regex-based fallback when no API key: catches age, location, marital status, message-length notes

**Operation 2 — Session summary (on goodbye OR every 20 messages):**
- `isSessionEnd(message)` — detects goodbye/thanks/end-of-conversation patterns
- `generateSessionSummary` — haiku call generating structured `{ summary, topics, key_insights, action_items, goals_updated, emotional_tone, session_quality }`
- `applySessionSummary` — appends to `memory_file.conversation_history` with date, topics, insights, flags, action items
- Also writes `conversations.summary` and `conversations.topics_covered` to the DB for the advisor dashboard
- `keywordFallbackSummary` — topic keyword detection when LLM unavailable
- Attaches any DB-flagged events from this conversation to the session record

**Operation 3 — Soul evolution (every 5 messages):**
- `evolveSoulFromExchange` — haiku call detecting communication-style signals: complexity preference, tone, pacing, new principles, phrases to avoid
- `applySoulEvolution` — merges signals into `soul_file.communication_style`, dedups arrays, clamps complexity 1–5
- Runs only when API key is available; silent no-op otherwise

**Infrastructure:**
- `callHaikuForJSON` — strips markdown fences + parses JSON from haiku; logs warning + returns `null` on failure
- `mergeDeep` — arrays: deduplicated append; primitives: only fill null/undefined/empty gaps; objects: recurse
- `condenseMemory` — compact one-line summary injected into LLM prompts for context
- `updateMemoryAfterExchange` — main orchestrator; batches DB write (one UPDATE covers all changed fields); never propagates errors
- `updateMemoryAfterSession` — legacy shim kept; reloads conversation from DB and calls the new orchestrator
- All operations fail silently — memory errors **never** crash chat

**`server/src/routes/chat.js`** — Memory wiring

- `resolveApiKey` added to llmService import
- `updateMemoryAfterExchange` imported from memoryUpdater
- SELECT query extended: `t.managed_ai_enabled, t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated` (needed for API key resolution)
- Step 9b added after agent response save: `setImmediate` → `updateMemoryAfterExchange(...)` fire-and-forget, never blocks response
- `messageCount = existingMessages.length + 2` (pre-exchange messages + new customer + new agent)
- `sessionType = onboarding_status === 'in_progress' ? 'onboarding' : 'regular'`

**`server/src/routes/portal.js`** — Manual summarize endpoint

- `updateMemoryAfterSession` imported from memoryUpdater
- New `POST /api/portal/conversations/:id/summarize` — advisor-triggered force memory update
  - Validates conversation belongs to tenant
  - Runs `updateMemoryAfterSession` via `setImmediate` (responds immediately, update runs in background)
  - Returns `{ success: true, message: "Memory update queued..." }`
  - Use case: after human takeover session ends, or when advisor wants to ensure soul/memory reflects the latest interaction

#### What This Means for the Product

Every conversation session now permanently enriches the customer's profile:
- Facts said in session 1 are still in context for session 50
- The agent's tone and complexity calibrate to match this specific customer over time
- Advisors can see session history, topics, emotional tone, and follow-up actions in the dashboard
- Session goodbyes auto-trigger full summaries; checkpoints every 20 messages guarantee no context is lost even in very long sessions

#### Modified Files

- `server/src/engine/memoryUpdater.js` — Complete rewrite
- `server/src/routes/chat.js` — Memory wiring (imports + extended SELECT + fire-and-forget block)
- `server/src/routes/portal.js` — New summarize endpoint + import

#### Next Required Step

Push to GitHub + rebuild backend:
```bash
git add server/src/engine/memoryUpdater.js server/src/routes/chat.js server/src/routes/portal.js
git commit -m "feat: real-time memory + soul persistence — per-exchange fact extraction, session summaries, soul evolution"
git push
# on server:
docker compose up -d --build backend
```

### Session 10 — Agentic Tool System + Covenant Trust Presentation (2026-03-23)

#### Product Direction Decisions Made

This session established the long-term product architecture for Shenmay's AI agent capabilities. Key decisions:

- **Shenmay is industry-agnostic.** Tools must never be hardcoded for a specific vertical. The same code runs for every tenant; what changes is the *description* of each tool in `tool_configs`.
- **Five tool types** cover every industry use case: Lookup, Calculate, Report, Escalate, Connect.
- **Tools are configuration, not code.** Non-technical customers can "build" tools by filling in a form — the system generates the tool config from their plain-English description.
- **On-premise deployment** is reserved as an enterprise tier upsell for the most security-sensitive customers (e.g. large financial institutions). Not built yet — keep in backlog.
- **Custom tool builder** (self-service, no code) is the next sprint. Customers describe what they want; the system creates a tool config stored in a new `custom_tools` table.

#### Agentic Tool System Built

**Migration 015 (`server/db/migrations/015_tool_registry.sql`)**
- Adds `enabled_tools JSONB` to tenants — array of active tool names, e.g. `["lookup_client_data", "generate_report"]`
- Adds `tool_configs JSONB` to tenants — per-tenant description overrides keyed by tool name
- Seeds Covenant Trust demo with full financial advisory toolset + industry-appropriate descriptions
- Tenant with empty `enabled_tools` = pure conversation mode, nothing changes
- ⚠️ **NOT YET APPLIED TO SERVER** — run: `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/015_tool_registry.sql`

**Tool Registry (`server/src/tools/`)**

| File | Purpose |
|------|---------|
| `registry.js` | Master map of name → module. `getToolDefinitions(enabledTools, toolConfigs)` returns Anthropic-ready definitions with tenant overrides applied. `listAllTools()` for config UI. |
| `executor.js` | Receives a tool call from Claude (name + params), finds the handler, runs it with request context (db, tenantId, customerId, conversationId). |
| `universal/lookup_client_data.js` | Fetches customer_data records grouped by category. Returns totals + all records. |
| `universal/analyze_client_data.js` | Computes aggregates from customer_data: totals per category, monthly figures, record counts, focused-category breakdowns. |
| `universal/generate_report.js` | Assembles structured report object (title, summary, sections, next steps, disclaimer). Logs a record to customer_data so advisor dashboard can see report was generated. |
| `universal/request_specialist.js` | Creates a flag in DB + optionally escalates conversation. Returns client-facing confirmation message. |

**Agentic Loop (`server/src/services/llmService.js`)**
- New `callClaudeWithTools(systemPrompt, messages, toolDefs, toolExecutor, model, maxTokens, apiKey)` function
- Full agentic loop: Claude calls tool → executor runs it → result fed back → Claude continues. Up to 6 rounds, safe fallback message if limit hit.
- `sanitiseResponse` and `resolveApiKey` now exported (needed by widget.js)

**Widget Chat Route (`server/src/routes/widget.js`)**
- SQL query now fetches `t.enabled_tools, t.tool_configs` from tenants
- On each chat request: if tenant has `enabled_tools` set AND has a valid API key → tool-calling path; else → existing conversation path
- Tool context bound per-request: `{ db, tenantId, customerId, conversationId, customer, tenant }`
- Zero breaking changes: tenants with no tools continue exactly as before

**Tool Configurator (`server/src/engine/toolConfigurator.js`)**
- `generateTenantConfig(businessDescription, apiKey)` → complete tenant config as JSON
- Uses few-shot prompting (Covenant Trust example baked in) for consistent output quality
- Outputs: `vertical_config`, `enabled_tools`, `tool_configs`, `compliance_config`, `onboarding_config`
- `configToTenantFields(config)` → SQL-ready fields for `PATCH /api/tenants/:id`

**Tenants Route (`server/src/routes/tenants.js`)**
- `GET /api/tenants/tools/registry` — lists all available tools for config UI
- `POST /api/tenants/:id/configure` — AI-assisted industry configuration; takes `business_description`, returns suggested config for review before applying
- PATCH allowed fields expanded to include `enabled_tools` and `tool_configs`

#### Covenant Trust Presentation

**File:** `Shenmay AI/nomii-advisor-presentation.pptx` (9 slides)

Professionally designed sales deck targeting financial advisory firms. Navy/teal Shenmay brand palette, Georgia headers, Calibri body. All slides passed visual QA.

| Slide | Content |
|-------|---------|
| 1 | Title — "The Advisor Who Never Forgets." |
| 2 | The Challenge — 3 pain cards (repetition, turnover, inconsistency) |
| 3 | The Solution — description + Remembers/Engages/Escalates pillars |
| 4 | How It Works — 3-step process |
| 5 | Key Features — 6-up grid |
| 6 | Client Experience — Aria chat mock + advisor dashboard view |
| 7 | Pricing — Starter/Growth/Professional, Growth highlighted |
| 8 | Getting Started — 4-step setup + "What you need" box |
| 9 | CTA — "Ready to see it with your clients?" + contact card |

Does not mention Covenant Trust by name. Safe to send directly.

#### Marketing Page Compliance Fix (`ponten-solutions/src/pages/NomiiAI.tsx`)

Rephrased 5 specific elements that implied regulated financial advice:
- "Aria — Your Financial Guide" → "Aria — Your Advisor's Assistant"
- Aria's opening message removed "investment questions"
- Aria's response reframed agent as supporting advisors, not replacing them
- Industry card: "Retirement planning agents" → "Client engagement agents that help advisors track each client's goals"
- CTA: "live financial advisory demo" → "live demo for financial advisors"

#### New / Modified Files (Session 10)

```
server/db/migrations/015_tool_registry.sql      NEW — tool config columns on tenants
server/src/tools/registry.js                     NEW — master tool registry
server/src/tools/executor.js                     NEW — tool call executor
server/src/tools/universal/lookup_client_data.js NEW — fetch customer_data records
server/src/tools/universal/analyze_client_data.js NEW — compute aggregates
server/src/tools/universal/generate_report.js    NEW — assemble report object
server/src/tools/universal/request_specialist.js NEW — create flag + escalate
server/src/engine/toolConfigurator.js            NEW — AI-assisted tenant onboarding
server/src/services/llmService.js                MODIFIED — callClaudeWithTools + new exports
server/src/routes/widget.js                      MODIFIED — tool-aware chat path
server/src/routes/tenants.js                     MODIFIED — /configure + /tools/registry endpoints
Shenmay AI/nomii-advisor-presentation.pptx         NEW — Covenant Trust sales deck
ponten-solutions/src/pages/NomiiAI.tsx           MODIFIED — compliance language fixes
```

⚠️ **Not yet pushed to GitHub or deployed to server.** Next steps below.

---

### Session 11 — Custom Tool Builder (2026-03-25)

The self-service tool builder backend is fully built and wired into the agent loop.

#### New Files

```
server/db/migrations/015b_seed_covenant_trust_tools.sql  NEW — fixes 015 Covenant Trust seeding
server/db/migrations/016_custom_tools.sql                NEW — custom_tools table + trigger
server/src/tools/custom_tool_handler.js                  NEW — generic handler for all tool types
server/src/tools/customToolLoader.js                     NEW — loads custom tools from DB at chat time
server/src/routes/customTools.js                         NEW — CRUD API for custom tool builder
```

#### Modified Files

```
server/src/routes/widget.js    — imports customToolLoader, loads + merges custom tools on every chat request
server/src/index.js            — registers customTools router at /api/tenants
SESSION_HANDOFF.md             — updated (this file)
```

#### How the Custom Tool Builder Works

1. Tenant admin creates a tool via `POST /api/tenants/:id/custom-tools` with a `name`, `display_name`, `tool_type`, `trigger_description`, and `config`.
2. At chat time, `loadCustomTools(db, tenantId)` fetches all active tools for the tenant.
3. Each tool is converted to an Anthropic tool definition using `trigger_description` as the tool description.
4. These are merged with universal tools and passed to Claude in the same API call.
5. When Claude calls a custom tool, `handleCustomTool(toolRow, params, context)` dispatches based on `tool_type`:
   - `lookup` → fetch customer_data by category
   - `calculate` → aggregate numerics from a category (total/average/count)
   - `report` → delegate to universal `generate_report` handler
   - `escalate` → delegate to universal `request_specialist` handler
   - `connect` → fire outbound webhook to tenant's system (enterprise)

#### Key Architectural Decision

Custom tools have priority over universal tools. If a tenant defines a tool with the same name as a universal one, the custom version wins. This lets power users override universal behaviour without needing Shenmay support.

---

## ✅ Custom Tool Builder — BUILT (Session 11)

The self-service tool builder is fully implemented in the backend. Customers can define their own tools without writing code. All 5 tool types are supported: **lookup, calculate, report, escalate, connect**.

**What's done:**
- Migration 016 creates the `custom_tools` table (per-tenant, UNIQUE on `tenant_id + name`)
- Generic handler (`custom_tool_handler.js`) dispatches based on `tool_type` — no new code ever needed
- Loader (`customToolLoader.js`) fetches active custom tools at chat time, merges with universal tools
- CRUD API (`GET/POST/PATCH/DELETE /api/tenants/:id/custom-tools`)
- `GET /api/tenants/tools/types` — reference endpoint for dashboard form (returns field definitions per type)
- Widget chat route (`widget.js`) now loads custom tools for every request and includes them in Claude's tool list
- Combined executor: custom tools take priority, falls through to universal tools

**What still needs building:**
- Dashboard UI form (frontend) to create/manage tools. Route: `/dashboard/tools`
- Onboarding Stage 2/3 integration — after AI generates suggested tools, let tenant edit before saving

---

## Migrations Status

| Migration | Status | Notes |
|-----------|--------|-------|
| `001` through `014` | ✅ Applied | See session history above |
| `015_tool_registry.sql` | ⚠️ PARTIAL | ALTER TABLE + GIN index applied. UPDATE seed for Covenant Trust failed (shell quoting). Apply 015b to fix. |
| `015b_seed_covenant_trust_tools.sql` | ⏳ **NOT YET APPLIED** | Run after pushing: `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/015b_seed_covenant_trust_tools.sql` |
| `016_custom_tools.sql` | ⏳ **NOT YET APPLIED** | Run after pushing: `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/016_custom_tools.sql` |

---

## What Is NOT Broken (Confirmed Working)

- ✅ Stripe webhook signing + processing (all 3 plans: starter/growth/professional)
- ✅ DB subscription updates with correct plan limits (customers, messages, agents)
- ✅ Direct DB plan simulator: `bash scripts/test-plans.sh` (all 4 states)
- ✅ Widget JWT auth, session creation, anonymous mode
- ✅ Human takeover mode (poll endpoint + mode switching)
- ✅ Unread badge counting endpoint (`GET /api/portal/badge-counts`)
- ✅ Team management endpoints (GET/POST/DELETE /api/portal/team)
- ✅ Memory updater wired in widget.js (fires every 5 messages + on session end)
- ✅ Homepage pontensolutions.com no longer redirects to /nomii/login
- ✅ All "Knomi" brand references removed from local docs + code

---

## Session 17 — GDPR / Privacy Compliance & Security Hardening

### Goal
Build full legal compliance infrastructure for EU (GDPR) and US (CCPA/CPRA, GLBA) privacy laws. Zero tolerance for mistakes — all legally required features built in one session.

### What Was Built

#### New Files

```
server/db/migrations/020_compliance_gdpr.sql    NEW — audit_logs table, GDPR columns on customers/tenants, pgcrypto
server/src/middleware/auditLog.js               NEW — writeAuditLog() fire-and-forget helper
server/src/middleware/security.js               NEW — securityHeaders() + portalCors() middleware
server/src/services/cryptoService.js            NEW — encryptJson/decryptJson helpers (column encryption infrastructure)
server/src/jobs/dataRetention.js                NEW — 24h cron: message purge, anon session cleanup, erasure queue
```

#### Modified Files

```
server/src/index.js              — security headers + portalCors wired in; retention job started on server boot
server/src/routes/portal.js      — DELETE /customers/:id upgraded (full GDPR erasure); GET /customers/:id/export added; audit log on customer.read; imports anonymizeCustomer + writeAuditLog
server/src/routes/auth.js        — audit log on login success + all failure modes
server/src/routes/widget.js      — consent_given_at + consent_ip captured on new customer creation; audit log on session creation
SESSION_HANDOFF.md               — updated (this file)
FEATURES.md                      — updated
```

### Architecture Decisions

**Audit log is fire-and-forget**: `writeAuditLog()` uses `setImmediate` + `.catch()` — same pattern as memory updates. Never blocks responses. Failed writes go to stderr only.

**Erasure = anonymisation, not hard delete**: Customer rows are kept for referential integrity (conversations, audit_logs, flags have FK references). All PII is overwritten with placeholder values. This is the GDPR-endorsed "pseudonymisation" approach (Recital 26).

**Message purge ≠ conversation purge**: The retention job deletes message content but keeps conversation metadata (summary, topics, dates). This satisfies retention while preserving analytics.

**Encryption infrastructure**: `cryptoService.js` provides `encryptJson` / `decryptJson` with a transparent sentinel format (`{ __enc, __iv }`). Full rollout to `memory_file` / `soul_file` columns requires eliminating 4 SQL `jsonb_set()` calls first — scheduled as a separate deployment window.

**Security headers exempt widget**: Widget routes are excluded from `securityHeaders` and `portalCors` — they run cross-origin in customer iframes and manage their own permissive CORS via `widgetCors()`.

### Migration 020 — What It Adds

| Addition | Purpose |
|----------|---------|
| `audit_logs` table | Full access log — actor, event, IP, tenant, customer, outcome |
| `customers.consent_given_at / consent_ip / consent_version` | GDPR Art. 7 proof of consent |
| `customers.deletion_requested_at / anonymized_at` | Erasure workflow state machine |
| `customers.last_export_at` | DSAR tracking |
| `tenants.message_retention_days` | Per-tenant message TTL (default 730 days) |
| `tenants.anon_session_ttl_days` | Anonymous visitor cleanup window (default 30 days) |
| `tenants.gdpr_contact_email` | DPO contact — GDPR Art. 37 |
| `tenants.data_processing_basis` | Lawful basis documentation |
| `conversations.messages_purged_at` | Marks when message bodies were purged |
| pgcrypto extension | Prerequisite for column-level encryption |

### Pending: Column-Level Encryption Rollout

`cryptoService.js` is built and ready. Full rollout requires:
1. Convert `jsonb_set` calls in `widget.js` (×3) and `customers.js` (×1) to read-decrypt-modify-encrypt-write patterns
2. Update all read paths to call `safeDecryptJson()` after SELECT
3. Run one-time backfill migration to encrypt existing rows
4. Change `memory_file` / `soul_file` column types from JSONB → TEXT

### Migration Run Instructions

```bash
# On the server after pull + rebuild:
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/020_compliance_gdpr.sql
```

Or if using the automated migrate runner (it runs all .sql files in order, it will pick this up automatically on next `node db/migrate.js`).

### Security Headers Applied (non-widget routes)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `X-DNS-Prefetch-Control: off`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (production only)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy: default-src 'self'; ...`

### What Still Needs Doing (Legal)

- [ ] **Privacy Policy document** — hire lawyer or use Termly/Iubenda, must cover: data collected, retention periods, sub-processors (Anthropic, SMTP, cloud host), contact info, GDPR rights
- [ ] **Terms of Service** — limits liability, defines acceptable use, GLBA clauses for financial tenants
- [ ] **Data Processing Agreement (DPA) template** — for tenants to sign (you are data processor, they are controller)
- [ ] **Sub-processor DPAs** — get DPAs from Anthropic (they have one), email provider, cloud host
- [ ] **Column encryption rollout** — see above
- [ ] **Portal UI for GDPR actions** — expose the export and delete buttons in the customer detail view in the React dashboard

---

### Session 18 — Column-Level Encryption Rollout + GDPR Portal UI (2026-03-26)

#### What Was Built

**Column-level AES-256-GCM encryption for `memory_file` and `soul_file`**

The `cryptoService.js` infrastructure built in Session 17 was fully wired in across all read/write paths.

- `widget.js` — all `jsonb_set` update patterns converted to read-decrypt-modify-encrypt-write cycles using `safeDecryptJson` + `encryptJson`. Memory and soul columns now stored as encrypted `{ __enc, __iv }` objects in the DB.
- `memoryUpdater.js` — all `memory_file` / `soul_file` reads and writes go through `safeDecryptJson` / `encryptJson`
- `promptBuilder.js` — all soul/memory reads call `safeDecryptJson` before building system prompt
- `portal.js` — customer detail and export endpoints call `safeDecryptJson` on memory/soul before returning to frontend
- `soulGenerator.js` — soul write path encrypts before UPDATE
- Backfill migration run on DB: existing plaintext rows encrypted in-place

**GDPR Portal UI — Export & Delete in customer detail view**

`client/src/pages/nomii/dashboard/NomiiCustomerDetail.jsx` extended:
- **`ExportCustomerCard`** — "Export Customer Data" section: button calls `GET /api/portal/customers/:id/export`, triggers browser download of the JSON data package. Shows `last_export_at` date when available.
- **`DeleteCustomerCard`** — "Right to Erasure" section: two-step confirmation (type customer name to confirm), calls `DELETE /api/portal/customers/:id`, redirects to customer list on success. Warning copy explains irreversibility.
- `exportCustomerData(id)` + `eraseCustomer(id)` added to `nomiiApi.js`

#### Modified Files

```
server/src/routes/widget.js              — encrypt/decrypt all memory+soul read-write paths
server/src/engine/memoryUpdater.js       — safeDecryptJson on all SELECT paths, encryptJson on writes
server/src/engine/promptBuilder.js       — safeDecryptJson before system prompt assembly
server/src/routes/portal.js             — safeDecryptJson in customer detail + export
server/src/engine/soulGenerator.js       — encryptJson before soul UPDATE
client/src/pages/nomii/dashboard/NomiiCustomerDetail.jsx — ExportCustomerCard + DeleteCustomerCard
client/src/lib/nomiiApi.js              — exportCustomerData + eraseCustomer
```

#### Commits

- Committed as part of Session 18 work (column encryption + GDPR portal UI)

---

### Session 19 — Webhooks, Concern Resolution, Conversation UX, Memory Personalization (2026-03-27)

#### What Was Built

**Webhook management system**

Full outbound webhook infrastructure: tenants can configure URLs that receive signed POST payloads on product events.

- **Migration 021** (`server/db/migrations/021_webhooks.sql`) — `tenant_webhooks` table: `id`, `tenant_id`, `label`, `url`, `secret` (HMAC signing key), `events` (text[]), `enabled`, `last_triggered_at`, `consecutive_failures`, created/updated timestamps
- **`server/src/routes/portal.js`** — 5 new endpoints:
  - `GET /api/portal/webhooks` — list all hooks for tenant
  - `POST /api/portal/webhooks` — create hook (auto-generates secret with `crypto.randomBytes`)
  - `PATCH /api/portal/webhooks/:id` — update label/URL/events/enabled
  - `DELETE /api/portal/webhooks/:id` — remove hook
  - `POST /api/portal/webhooks/:id/test` — fire test ping with HMAC-SHA256 `X-Nomii-Signature` header; returns HTTP status + response snippet
- **`client/src/pages/nomii/dashboard/NomiiSettings.jsx`** — new `WebhooksSection` component (~280 lines):
  - `ALL_EVENTS` array: `session.started`, `session.ended`, `customer.created`, `flag.created`, `concern.raised`
  - Create form: label, URL, event type pill toggles
  - One-time secret reveal on creation with copy button + warning banner ("store this now — it won't be shown again")
  - Hook list: label, URL, event badges, last triggered date, consecutive failures badge (red)
  - Per-hook actions: toggle enable/disable, test ping (inline status + HTTP code), edit inline, delete
  - Footer note explaining HMAC-SHA256 `X-Nomii-Signature` format
- **`client/src/lib/nomiiApi.js`** — `getWebhooks`, `createWebhook`, `updateWebhook`, `deleteWebhook`, `testWebhook`

**Concern resolution**

Concerns had no exit path — they accumulated indefinitely. Fixed with a proper resolve flow.

- **`server/src/routes/portal.js`** — `PATCH /api/portal/concerns/:id/resolve` — sets `conversations.status = 'ended'` and `unread = FALSE`; 404s if concern not found or not escalated
- **`client/src/pages/nomii/dashboard/NomiiConcerns.jsx`** — green "Resolve" button (CheckCheck icon) next to "View/Jump In"; optimistic removal from list on success; `resolving` state prevents double-clicks
- **`client/src/lib/nomiiApi.js`** — `resolveConcern(id)`

**Conversation list visual triage**

Agents couldn't tell at a glance which conversations needed attention.

- **`client/src/pages/nomii/dashboard/NomiiConversations.jsx`** — three indicator layers per conversation row:
  - **Unread**: yellow dot on avatar, bold customer name, yellow `2px solid rgba(234,179,8,0.6)` left border, slightly lightened background
  - **Human mode** (`c.mode === 'human'`): green "HUMAN" badge with `Users` icon — advisor must handle these
  - **Escalated** (`c.status === 'escalated'`): red "ESCALATED" badge, red-tinted avatar — needs immediate attention

**Human mode reply email notification**

When a customer sent a message while a conversation was in human takeover mode, the assigned advisor had no proactive signal. Fixed with a fire-and-forget email.

- **`server/src/services/emailService.js`** — new `sendHumanModeReplyEmail({ customerName, conversationId, messageSnippet, tenantName, agentEmail, agentFirstName })` — branded HTML email with message snippet (up to 200 chars) and "Reply Now" CTA deep-linking to the conversation
- **`server/src/routes/widget.js`** — in the human mode message branch: `setImmediate` fires `sendHumanModeReplyEmail`; queries `human_agent_id` on the conversation, emails that agent; falls back to all tenant admins if no specific agent assigned

**Per-exchange memory update in widget chat**

The widget was only calling the legacy `updateMemoryAfterSession` every 5 messages — meaning fact extraction was being skipped between checkpoints.

- **`server/src/routes/widget.js`** — replaced legacy 5-message checkpoint with `updateMemoryAfterExchange` on every non-anonymous exchange (fire-and-forget via `.catch`); passes `customerMessage`, `agentResponse`, `currentMemory`, `currentSoul`, `messageCount`, `sessionType`, resolved `apiKey`

**Greeting personalization overhaul**

Proactive greetings were using topic slugs like `retirement_income` — robotic and impersonal. Rebuilt priority chain:

- **Action items first**: If last session's `action_items[]` has an entry, greeting asks specifically about that follow-up ("Last time you mentioned you'd X — did you get a chance to do that?")
- **Summary text second**: If no action item, uses session `summary` text for a context-aware warm opener
- **Topic slugs last**: Only if neither is available; humanized into plain English
- **Emotional tone modulation**: `emotionalTone` from last session adjusts warmth guidance passed to Haiku
- **`server/src/routes/widget.js`** — greeting endpoint rebuilt with above priority logic; Haiku token limit bumped 80 → 100

**System prompt: Open Follow-Ups block**

Action items from previous sessions were buried and often ignored by the agent.

- **`server/src/engine/promptBuilder.js`** — `buildConversationHistoryBlock` now collects all open `action_items` across recent sessions into a prominent `## OPEN FOLLOW-UPS` block placed BEFORE the session history list; includes `key_insights` and `emotional_tone` per session entry
- `buildCustomerNameBlock` rewritten with same action-item-first priority logic for the system prompt greeting instruction
- `buildSystemPrompt` moved history block above raw memory data so the agent sees follow-ups before facts

**Rate limit tightening**

- Widget session creation: 10/5min → **6/5min**
- Widget chat: 30/min → **20/min**
- Tenant registration: 5/hr → **3/hr**
- Tenant login: 10/15min → **5/15min**
- Data API: 120/min → **60/min**
- Global safety net: 300/min → **150/min**

#### Modified Files

```
server/db/migrations/021_webhooks.sql                    NEW — tenant_webhooks table
server/src/routes/portal.js                              MODIFIED — webhook CRUD + test + concern resolve
server/src/services/emailService.js                      MODIFIED — sendHumanModeReplyEmail added
server/src/routes/widget.js                              MODIFIED — per-exchange memory + greeting rebuild + human reply email
server/src/engine/promptBuilder.js                       MODIFIED — OPEN FOLLOW-UPS block + action-item-first greeting
server/src/index.js                                      MODIFIED — tightened rate limits
client/src/pages/nomii/dashboard/NomiiSettings.jsx       MODIFIED — WebhooksSection added
client/src/pages/nomii/dashboard/NomiiConcerns.jsx       MODIFIED — Resolve button
client/src/pages/nomii/dashboard/NomiiConversations.jsx  MODIFIED — unread/human/escalated indicators
client/src/lib/nomiiApi.js                               MODIFIED — webhook + resolveConcern functions
```

#### Commits

- `9229e35` — `feat: webhooks management UI — create, edit, delete, enable/disable, test ping, one-time secret`
- `a101e35` — `feat: concern resolution, conversation triage indicators, human mode reply email`
- `fad90c0` — `feat: per-exchange memory update, greeting personalization, OPEN FOLLOW-UPS in system prompt`

#### Deploy

```bash
# SSH to server
ssh user@81.224.218.93

# Pull latest code
cd ~/Knomi/nomii-ai
git pull

# Apply webhook migration (Session 19)
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/021_webhooks.sql

# Apply all pending migrations (018–020 if not already applied):
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/018_agent_soul_template.sql
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/019_rebuild_customer_data.sql
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/020_compliance_gdpr.sql

# Rebuild and restart everything
docker compose up -d --build
```

---

### Session 20 — Anonymous Widget, Auth Handoff, Notifications Bell, Tool Test Sandbox + Real Customer Mode (2026-03-27)

Four major features shipped in this session: anonymous-first widget chat with seamless auth handoff, in-app notification bell for portal advisors, a full tool test sandbox (all tool types, not just connect), and a real customer test mode for report/lookup tools.

---

#### Feature 1 — Anonymous Widget + Seamless Auth Handoff

**Business context:** Anonymous (unauthenticated) visitors can now chat freely with the brand AI agent. The moment they authenticate on the company's own site, the widget silently "claims" their session — the conversation continues under their real identity without any page reload or visible interruption. This means Shenmay can serve both first-time anonymous visitors *and* known returning customers from the same widget, instantly.

**Privacy rule:** An anonymous visitor record is only ever created; no email capture or persistent profile is built unless the customer *already exists* in the tenant's system. After claim, the anon record is soft-deleted.

**Backend — `server/src/routes/widget.js`**

- Anonymous sessions use a synthetic `anon_XXXX@visitor.nomii` email and `is_anonymous: true` JWT claim
- Anon customers excluded from seat-limit queries via `AND email NOT LIKE 'anon\_%@visitor.nomii'`
- No soul/memory lookup or injection for anonymous sessions — agent runs in pure conversation mode
- New `POST /api/widget/session/claim` endpoint:
  - Verifies the anon JWT (`is_anonymous: true` guard)
  - Finds or creates the authenticated customer record
  - `UPDATE conversations SET customer_id = realCustomerId` — migrates the entire conversation history, no message copying required
  - Soft-deletes the anon customer row (`deleted_at = NOW()`)
  - Issues a new JWT with `is_anonymous: false`
  - Fires `session.started` + `customer.created` webhooks as appropriate
- `createNotification()` helper added at top level (see Feature 2 below)

**Embed script — `server/public/embed.js`**

- `nomii:setUser` (login) handler changed: instead of reloading the iframe, sends `nomii:identify` postMessage to the widget with `{ email, name }` — zero reload, seamless
- Logout still calls `reloadWidget()` (correct behaviour — clears session)
- `MutationObserver` on the script tag watches `data-user-email` / `data-user-name` attribute changes (for non-SPA sites using server-rendered auth state) with the same login/logout split

**Widget — `server/public/widget.html`**

- `isAnonymous` and `sessionToken` state tracked throughout session lifecycle
- `claimSession(email, displayName)` async function:
  - Pauses background poll without calling `endSession()` (which would trigger memory update and close conversation)
  - `POST /api/widget/session/claim` with anon JWT + credentials
  - Swaps `sessionToken` to the new real-user JWT, sets `isAnonymous = false`
  - Appends a "✓ Signed in as [Name]" gold banner to the chat
  - Restarts background poll with new JWT
  - Falls back to `window.location.reload()` if claim fails
- `nomii:identify` postMessage listener triggers `claimSession()`
- `nomii:setUser` logout path: stops polling + calls `endSession()`
- CSS: `.signed-in-banner` style class added

---

#### Feature 2 — In-App Notification Bell

Dashboard advisors now get real-time in-app alerts for flag creation and human-mode customer replies. No more relying solely on email.

**Backend**

- **Migration 022** (`server/db/migrations/022_notifications.sql`):
  ```sql
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL,           -- 'flag' | 'human_reply' | 'escalation'
    title TEXT NOT NULL,
    body TEXT,
    resource_type TEXT,           -- 'conversation' | 'customer'
    resource_id UUID,
    customer_name TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX idx_notifications_tenant_unread ON notifications(tenant_id, read_at) WHERE read_at IS NULL;
  CREATE INDEX idx_notifications_tenant_recent ON notifications(tenant_id, created_at DESC);
  ```
- **`server/src/routes/widget.js`** — `createNotification(tenantId, {...})` fire-and-forget helper (swallows errors); called after flag insert + in human-mode reply `setImmediate` block
- **`server/src/routes/portal.js`** — two new endpoints:
  - `GET /api/portal/notifications` — returns all notifications for tenant (newest first, limit 50), grouped by `read_at IS NULL` (unread first)
  - `PATCH /api/portal/notifications/mark-read` — marks all (no body) or specific IDs as read (`{ ids: [...] }`)

**Frontend — `client/src/layouts/NomiiDashboardLayout.jsx`**

- Bell icon (`Bell` from lucide) in top-bar header; red badge shows unread count
- `fetchNotifications` callback polls every 15 seconds; also fires on bell open
- Click-outside close via `useEffect` + `mousedown` on `notifRef`
- Dropdown panel (360px max-height, scrollable):
  - `NOTIF_ICON` map: flag=🚩 (red), human_reply=💬 (blue), escalation=📢 (orange)
  - Per-notification left border accent when unread
  - `timeAgo()` relative timestamp helper
  - "Mark all read" button calls `markNotificationsRead()` (no ids = all)
  - Click on notification navigates to the relevant conversation (`/nomii/dashboard/conversations/:id`)

**API — `client/src/lib/nomiiApi.js`**

- `getNotifications = () => apiRequest("GET", "/api/portal/notifications")`
- `markNotificationsRead = (ids) => apiRequest("PATCH", "/api/portal/notifications/mark-read", ids ? { ids } : {})`

---

#### Feature 3 — Tool Test Sandbox (All Tool Types)

Previously only connect-type tools had an inline test button. Now every active tool of any type has a "Test" button that opens a full sandbox modal.

**Backend — `server/src/routes/portal.js`**

`POST /api/portal/tools/:toolId/test` (complete rewrite):
- Loads tool + tenant, resolves API key via `resolveApiKey()`
- Builds a system prompt appropriate for the test context (anon sandbox or real customer)
- `testExecutor` dispatcher:
  - `escalate` type: **always simulated** regardless of mode — returns a fake result, no flags or emails created
  - All other types: `handleCustomTool()` executes for real
- Returns `{ invoked, invocation_count, tool_input, tool_result, ai_response, sandbox, simulated, test_customer }`

**Frontend — `client/src/pages/nomii/dashboard/NomiiTools.jsx`**

Fully rewritten `TestModal` component:

- **Mode toggle** — "🧪 Sandbox" / "👤 Real customer" buttons at the top; switching resets result/selection
- **Real customer picker** (shown only in real customer mode):
  - Searchable input querying `getCustomers(1, 40, query)` as user types
  - Dropdown list with name + email per result
  - Selected customer shown as locked gold chip with clear button
  - Tip: "Use an employee's own profile for safe testing"
- **Context-aware warning banner** (yellow) — text varies by mode + tool type:
  - Sandbox + report: "No report record will be written in sandbox mode"
  - Sandbox + escalate: "Escalation is always simulated — no flag or email will be created"
  - Real customer + report: "A lightweight report log will be written to [Name]'s record"
  - Real customer + any: "Running against [Name]'s actual data"
- **Run button label**: "Run Sandbox Test" / "Run Real Test" / "Select a customer to run" (disabled state)
- **Result panel**:
  - ✓/✗ status with tool-type color
  - Gold badge showing `test_customer.name` when real customer was used
  - Agent response block
  - Collapsible "Tool input / output" JSON panel (same as before)

**API — `client/src/lib/nomiiApi.js`**

- `testTool(id, message, customerId?)` — passes `customer_id` to backend when provided
- `getCustomers` import added to `NomiiTools.jsx`

---

#### Migration Run Instructions (Session 20)

```bash
# After git pull + docker compose up --build -d on server:
docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/022_notifications.sql
```

---

#### Modified Files (Session 20)

```
server/db/migrations/022_notifications.sql                    NEW — notifications table + indexes
server/src/routes/widget.js                                   MODIFIED — anon session, session/claim endpoint, createNotification helper
server/src/routes/portal.js                                   MODIFIED — notifications endpoints, tool test rewrite (real customer mode)
server/public/embed.js                                        MODIFIED — nomii:identify login path (no reload), MutationObserver split
server/public/widget.html                                     MODIFIED — isAnonymous state, claimSession(), signed-in banner, nomii:identify listener
client/src/layouts/NomiiDashboardLayout.jsx                   MODIFIED — notification bell, dropdown panel, 15s polling
client/src/pages/nomii/dashboard/NomiiTools.jsx               MODIFIED — TestModal rewrite (mode toggle + customer picker)
client/src/lib/nomiiApi.js                                    MODIFIED — getNotifications, markNotificationsRead, testTool with customerId
```

#### Commits

- `27da910` — `fix: duplicate getConcerns export + CSS @import order (production build errors)`
- `1c3a1b8` — `feat: add real customer mode to tool test sandbox`
- (anonymous widget + notification bell commits in between — verify with `git log --oneline`)

---

### Session 21 — Self-Hosted License Enforcement (Option A) (2026-04-09, morning)

#### What Was Built

**Complete Option A license key system for self-hosted deployments** — allows Shenmay to monetize on-prem installs while operators start with a free trial that doesn't require a license key.

#### Architecture Decision

Single codebase with `NOMII_DEPLOYMENT=selfhosted` runtime flag. No code duplication. Trial-by-default: operators deploy without any license key and have 20 messages/month, 1 customer allowed for 14 days. After trial, they purchase a license key from Shenmay and upgrade to a paid plan.

#### New Files

```
server/src/config/plans.js                      NEW — shared PLAN_LIMITS object (trial/starter/growth/professional/enterprise/master) + isSelfHosted() helper
server/src/jobs/seedSelfHostedTenant.js         NEW — idempotent first-boot seeding: creates single tenant + pre-verified admin account
server/src/routes/license.js                    NEW — POST /api/license/validate (heartbeat) + POST /api/license/trial (issue 14-day trial key)
server/db/migrations/029_licenses.sql           NEW — licenses table: key, plan, issued_to_email, expires_at, instance_id, last_ping_at, is_active
```

#### Modified Files

```
server/src/config/plans.js                      MODIFIED — extracted from stripe-webhook.js to shared config
server/src/services/licenseService.js           MODIFIED — checkLicenseOnStartup() + applyPlanLimits() + 24h heartbeat
server/src/routes/stripe-webhook.js             MODIFIED — now imports PLAN_LIMITS from shared config
server/src/routes/onboard.js                    MODIFIED — POST /register returns 403 when NOMII_DEPLOYMENT === 'selfhosted'
server/src/index.js                             MODIFIED — new GET /api/config endpoint, NOMII_DEPLOYMENT mode guards, seedSelfHostedTenant + checkLicenseOnStartup called before listen()
docker-compose.selfhosted.yml                   MODIFIED — added NOMII_DEPLOYMENT=selfhosted, TENANT_NAME, ADMIN_PASSWORD, NOMII_LICENSE_KEY, NOMII_INSTANCE_ID env vars + fixed parity gaps
scripts/install.sh                              MODIFIED — Step 2: add company name + admin password prompts; Step 3: made license key optional with trial explanation
```

#### Trial Mode Behavior

- **No license key needed**: Backend starts immediately in trial mode
- **Plan limits enforced**: 20 messages/month, 1 customer, 1 agent (trial tier)
- **No cloud API call**: When `NOMII_LICENSE_KEY` is blank, no heartbeat or validation happens
- **Free trial**: Operators can evaluate the product cost-free for 14 days

#### License Validation (Paid Mode)

- **Startup**: `licenseService.checkLicenseOnStartup()` validates key against cloud `/api/license/validate` endpoint
- **Heartbeat**: Every 24 hours, backend pings the cloud to validate license is still active
- **Plan limits**: Cloud returns plan tier; backend upserts to local `subscriptions` table via `applyPlanLimits()`
- **Existing middleware**: Subscription limits enforced by existing `subscription.js` middleware (no new code needed)

#### Single-Tenant Seeding

- `seedSelfHostedTenant.js` runs on first boot before license check
- Creates tenant from `TENANT_NAME` env var
- Creates pre-verified admin account from `MASTER_EMAIL` + `ADMIN_PASSWORD` (no email confirmation)
- Inserts trial subscription with limits from `PLAN_LIMITS.trial`
- Idempotent: exits early if tenant already exists

#### Commits

- `92132fb` — `feat: self-hosted license enforcement (Option A)`

---

### Session 22 — Single-Tenant Self-Hosted Mode + Documentation (2026-04-09, afternoon)

#### What Was Built

**Complete single-tenant mode transformation** — self-hosted deployments are now single-company installs with trial-first licensing and a clear path to paid upgrades. Operators deploy on any Ubuntu server with just an IP address; Cloudflare Tunnel is optional.

#### Architecture Changes

- **Single-tenant registration disabled**: `POST /register` returns 403 when `NOMII_DEPLOYMENT === 'selfhosted'` — prevents accidental multi-tenant creation
- **Platform admin routes hidden**: `/api/platform/*` routes (auth, tenants, licenses) only registered when NOT in selfhosted mode
- **Feature flags via config**: Frontend detects deployment mode via `GET /api/config` endpoint; renders self-hosted license panel instead of Stripe pricing table
- **One admin account**: Operators use pre-seeded admin from `MASTER_EMAIL` + `ADMIN_PASSWORD` (already verified on first boot)

#### Frontend Changes

**`client/src/pages/nomii/dashboard/NomiiPlans.jsx`** — Complete rewrite when `deployment === 'selfhosted'`:
- Fetches `/api/config` on mount to detect deployment mode
- Self-hosted mode: renders custom license status panel instead of Stripe pricing table
  - Usage meters: customers used / plan limit, messages used this month / plan limit
  - Trial banner: countdown + days remaining
  - Upgrade instructions: 3 clear steps (1. contact us, 2. receive key, 3. update .env + restart)
  - Link to pontensolutions.com/nomii/license for purchase/upgrade
- Strips out Stripe script injection when self-hosted
- Maintains full Stripe integration for SaaS mode (no dual-path complexity)

#### Docker Compose Improvements

**Parity audit** — ensured `docker-compose.selfhosted.yml` has feature parity with main compose:
- Added missing env vars: `JWT_EXPIRY`, `LLM_HAIKU_MODEL`, `LLM_SONNET_MODEL`
- Removed duplication: `API_KEY_ENCRYPTION_SECRET` was listed twice
- All Stripe vars present (optional, can be left blank for self-hosted)

#### Installer Updates (`scripts/install.sh`)

- **Step 2 refactored**: Company name prompt (TENANT_NAME) + Admin email (MASTER_EMAIL) + Password prompts with confirmation
- **Step 3 refactored**: License key is now **optional** with clear explanation:
  - "Leave blank to start with the free trial (20 messages/mo, 1 customer)"
  - "You can add or upgrade a key at any time by editing .env and restarting"
- All user inputs written to `.env` ready for `docker compose up -d`

#### Installer UX Enhancements

- Friendly 6-step wizard layout with progress indicator
- Clear explanations for each required value
- Defaults for non-critical fields (e.g., port 465 for SMTP)
- Cloudflare Tunnel marked optional with explanation: "Gives your Shenmay installation a public HTTPS address without opening firewall ports"
- Public URL prompt accepts IP address or domain; defaults to `http://localhost` for local testing

#### New / Modified Files (Session 22)

```
server/src/index.js                             MODIFIED — added GET /api/config endpoint
client/src/pages/nomii/dashboard/NomiiPlans.jsx MODIFIED — self-hosted license panel + deployment mode detection
docker-compose.selfhosted.yml                   MODIFIED — parity fixes + documentation
scripts/install.sh                              MODIFIED — UX improvements for single-tenant onboarding
SESSION_HANDOFF.md                              MODIFIED — documented Sessions 21–22
ROADMAP.md                                      MODIFIED — updated next session task with time estimates
CLAUDE.md                                       (no changes needed — already correct)
```

#### Commits

- `9247a40` — `feat: single-tenant self-hosted mode (NOMII_DEPLOYMENT=selfhosted)`
- `90a6b49` — `docs: session wrap-up — single-tenant self-hosted mode complete`

#### Next Session: Activate Self-Hosted on VPS + E2E Test

See ROADMAP.md for the exact tasks. Summary:
1. Apply migration 029 on VPS: `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/029_licenses.sql`
2. Set `NOMII_LICENSE_MASTER=true` in VPS `.env` (enables `/api/license/validate` endpoint for self-hosted instances)
3. Redeploy: `git pull && docker compose up --build -d`
4. End-to-end test: Run `scripts/install.sh` on a fresh Ubuntu VM, verify trial mode works, test license upgrade path

---

## Outstanding Immediate Tasks (from ROADMAP.md)

| Task | Command / Notes | Status |
|------|----------------|--------|
| **Apply migration 022** (notifications table) | `docker exec -i knomi-db psql -U knomi -d knomi_ai < server/db/migrations/022_notifications.sql` | ⏳ Pending |
| **Enable `send_document` for Covenant Trust** | `UPDATE tenants SET enabled_tools = enabled_tools \|\| '["send_document"]'::jsonb WHERE slug = 'covenant-trust';` | ⏳ Pending |
| **Verify pending migrations 015b–019 applied** | Check `\dt` in psql — `custom_tools`, `customer_data` (generic schema), `agent_soul_template` column must all exist | ⏳ Pending |
| **Stripe Portal return URL env var** | Set `STRIPE_PORTAL_RETURN_URL=https://app.pontensolutions.com/nomii/dashboard/plans` in server `.env` | ⏳ Pending |
| **Trademark filing** | Attorney sign-off on "Shenmay AI" — Aware Inc. conflict flagged. Required before public commercial launch. | ⏳ Pending |
| **GHCR packages public** | First workflow run will create packages; `make-public` job auto-runs. If it fails, add `PACKAGES_PAT` secret (classic PAT, `write:packages` scope) in repo Settings → Secrets | ⏳ Pending |
| **Self-hosted parity audit** | End-to-end test of `scripts/install.sh` on a fresh VM; verify migrations, env vars, Stripe, email, auth all work identically to cloud | ⏳ Pending |

