# Nomii AI — Session Notes

> This file is the live handoff between Claude sessions.
> Update it at the end of every session. Claude reads it automatically via CLAUDE.md.

---

## Last updated: 2026-04-14

## VPS / Deployment

| Item | Detail |
|------|--------|
| Host | Proxmox VM `pontenprox` |
| Install dir | `~/Knomi/knomi-ai` (NOT `~/nomii`) |
| Compose file | `docker-compose.yml` (SaaS); `docker-compose.selfhosted.yml` (self-hosted builds) |
| Rebuild cmd | `docker compose up -d --build backend frontend` (no sudo — runs as root) |
| Pull image | `docker compose pull frontend && docker compose up -d frontend` |
| DB | `nomii-db` postgres:16, user `knomi`, db `knomi_ai` |
| Backend port | 3001 |
| Frontend port | 80 (nginx) |

---

## What was completed (session 2026-04-14)

- **nginx iframe fix** — removed `X-Frame-Options: SAMEORIGIN` for `widget.html` so it loads in third-party iframes (commit `fd5a9d7`)
- **AI re-greeting fix** — `widgetGreeted` flag in `promptBuilder.js` stops AI saying hi again on first message (commit `9f8d299`)
- **Poll spam fix** — `pollInFlight` guard + `+1ms` cursor advance in `widget.html` to handle Postgres microsecond vs JS millisecond precision mismatch (commit `f838f42`)
- **Take Over button** — added to `ThreadView` split-pane in `NomiiConversations.jsx` (commit `20896ef`)
- **Git history scrub** — `Stripe_data.txt`, `CLAUDE_CODE_SETUP.md`, `SESSION_HANDOFF.md`, `SPRINT_HANDOFF.md` removed from all commits and added to `.gitignore`; force-pushed to main
- **Stripe key rotation** — user rotated Stripe live key via Stripe dashboard and updated it on VPS
- **Widget error instrumentation** — diagnostic logging for the intermittent "Sorry, I had trouble responding" error (commit `3812b0c`):
  - Global error handler in `server/src/index.js` now logs `method`, `originalUrl`, and full stack for 5xx errors
  - `/api/widget/chat` wraps the LLM call (both tool and standard paths) in its own try/catch that logs a tagged `[Widget][chat][llm]` line with provider, model, tenant, conversation, and message count
  - No behaviour change — on next repro, grep backend logs for `[Widget][chat][llm]` to get the exact cause
- **Self-hosted license purchase page** — `POST /api/public/license/checkout` endpoint (commit `016d86d`):
  - New file: `server/src/routes/license-checkout.js` — creates Stripe Checkout Session using `STRIPE_SELFHOSTED_PRICE_*` env vars; supports monthly/annual; sets `metadata.product_type = 'selfhosted'` so webhook auto-generates license key
  - CORS: added `https://pontensolutions.com` to `ALLOWED_ORIGINS` in `security.js`
  - Mounted at `/api/public/license/checkout` in `index.js` (no auth required — public)
  - Frontend page `BuyNomiiLicense.tsx` deployed to `jafools/ponten-solutions` repo (commit `c7bbd16`) → auto-deploys to `pontensolutions.com/nomii/license`
  - Page has monthly/annual toggle, email-capture modal, success state on `?success=true`
- **SaaS NOMII_DEPLOYMENT bug fixed** — `NOMII_DEPLOYMENT=selfhosted` was incorrectly set in `.env` on the Proxmox SaaS server, causing all tenants to see the self-hosted license panel instead of Stripe Pricing Table. Fixed by removing the line and rebuilding backend.

---

## Known bugs / next session TODO

- **Widget "Sorry, I had trouble responding" error** — instrumentation deployed. Next step: wait for a live repro, then grep:
  ```bash
  docker compose logs backend --tail=200 | grep -E '\[Widget\]\[chat\]|\[ERROR\] 5'
  ```
- **Verify annual Stripe prices** — `BuyNomiiLicense.tsx` displays `$490 / $1,490 / $3,490` per year. Confirm these match the actual annual prices configured in Stripe dashboard under the `STRIPE_SELFHOSTED_PRICE_*_ANNUAL` price IDs.
- **Additional bugs reported by user** — unspecified, user ended session. Ask user to describe them.

---

## Key file map

| File | Purpose |
|------|---------|
| `server/src/routes/widget.js` | Widget API — session, message, poll endpoints |
| `server/src/engine/promptBuilder.js` | Builds AI system prompt; `widgetGreeted` param added |
| `server/public/widget.html` | Embeddable chat widget (vanilla JS) |
| `server/src/routes/license-checkout.js` | Public checkout endpoint — creates Stripe Session for self-hosted license |
| `client/src/pages/nomii/dashboard/NomiiConversations.jsx` | Conversations dashboard with split-pane ThreadView |
| `client/src/lib/nomiiApi.js` | All client API calls |
| `client/nginx.conf` | nginx config (widget iframe fix lives here) |
| `docs/SESSION_NOTES.md` | This file — session handoff |

---

## Architecture notes

- **DB name**: `knomi_ai`, **DB user**: `knomi` — kept from old Knomi AI brand to avoid breaking production
- **Poll flow**: widget polls `/api/widget/poll?since=<ISO timestamp>` every 1.5s (human) or 3s (AI)
- **JWT expiry**: 2h (`WIDGET_JWT_EXPIRY`)
- **Deployment modes**: `NOMII_DEPLOYMENT=selfhosted` for single-tenant; `NOMII_LICENSE_MASTER=true` for SaaS license server
