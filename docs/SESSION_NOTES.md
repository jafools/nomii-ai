# Nomii AI — Session Notes

> This file is the live handoff between Claude sessions.
> Update it at the end of every session. Claude reads it automatically via CLAUDE.md.

---

## Last updated: 2026-04-14 (session 2 of the day)

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
| Migrations | `docker exec -i nomii-db psql -U knomi -d knomi_ai < file.sql` |

## Two repos in play

| Repo | Purpose | Where |
|------|---------|--------|
| `jafools/nomii-ai` | Nomii AI app (backend + frontend) | `~/Knomi/knomi-ai` on Proxmox |
| `jafools/ponten-solutions` | Marketing site (Lovable, auto-deploys to `pontensolutions.com`) | `~/ponten-solutions` on Proxmox |

**Important:** Changes to `ponten-solutions` must be committed and pushed from `~/ponten-solutions` on Proxmox. Claude's sandbox cannot push to that repo directly. Always give the user commands to run on Proxmox for `ponten-solutions` changes.

---

## What was completed (session 2026-04-14)

### Earlier in session
- **nginx iframe fix** — removed `X-Frame-Options: SAMEORIGIN` for `widget.html` (commit `fd5a9d7`)
- **AI re-greeting fix** — `widgetGreeted` flag in `promptBuilder.js` (commit `9f8d299`)
- **Poll spam fix** — `pollInFlight` guard + `+1ms` cursor advance in `widget.html` (commit `f838f42`)
- **Take Over button** — added to `ThreadView` in `NomiiConversations.jsx` (commit `20896ef`)
- **Git history scrub** — secrets removed from all commits, force-pushed to main
- **Stripe key rotation** — user rotated live key, updated on VPS
- **Widget error instrumentation** — diagnostic logging added (commit `3812b0c`)
- **SaaS NOMII_DEPLOYMENT bug fixed** — `NOMII_DEPLOYMENT=selfhosted` incorrectly set in `.env` on SaaS server; removed and rebuilt

### Self-hosted license purchase flow (completed this session)
Full end-to-end flow: **self-hosted customer → pricing page → Stripe → license key by email → activate in dashboard**

**Backend (nomii-ai repo, main branch):**
- `server/src/routes/license-checkout.js` — new public endpoint `POST /api/public/license/checkout`; looks up `STRIPE_SELFHOSTED_PRICE_*` env vars, creates Stripe Checkout Session (subscription), sets `metadata.product_type = 'selfhosted'` so webhook auto-generates + emails license key (commit `016d86d`)
- `server/src/middleware/security.js` — added `https://pontensolutions.com` to `ALLOWED_ORIGINS` for CORS
- `server/src/index.js` — mounted checkout route at `/api/public/license/checkout` (no auth)

**Marketing site (ponten-solutions repo, main branch):**
- `src/pages/nomii/BuyNomiiLicense.tsx` — self-hosted pricing page with monthly/annual toggle, 3 plan cards (Starter $49/mo, Growth $149/mo, Professional $349/mo), email-capture modal, POSTs to `https://nomii.pontensolutions.com/api/public/license/checkout`, success screen on `?success=true` (commits `c7bbd16`, `6d8e816`, `4a93660`)
  - Key bugs fixed during deploy: missing SVG asset import caused module load failure; missing `import BuyNomiiLicense` in `App.tsx` caused ReferenceError
- `src/App.tsx` — added `import BuyNomiiLicense from "./pages/nomii/BuyNomiiLicense"` at line 23; route already existed at line 90 (commit `4a93660`)
- `src/pages/NomiiAI.tsx` — added "Buy a License" primary button (links to `/nomii/license`) in the "Need total control?" enterprise row of the pricing section, alongside existing "Contact Sales" (commit `bfbbbf3`)

**Lesson learned:** When transferring large files to ponten-solutions repo via SSH terminal, use `git show <commit>:path | grep -v <unwanted> > path` to restore/patch from known-good commits. Avoid heredoc and base64 for large files — both are error-prone in terminal paste.

---

## Next session TODO (priority order)

1. **On-prem setup guide page** — build a `/nomii/self-hosted` (or similar) page on `pontensolutions.com` with a step-by-step setup guide for self-hosted customers. Need to scope:
   - Docker Compose template they can download
   - Required env vars documented
   - License activation steps
   - Ask user what their current self-hosted onboarding looks like before building

2. **Verify annual Stripe prices** — `BuyNomiiLicense.tsx` displays `$490 / $1,490 / $3,490` per year. Confirm these match the actual annual prices in Stripe under `STRIPE_SELFHOSTED_PRICE_*_ANNUAL` price IDs.

3. **Widget "Sorry, I had trouble responding" error** — instrumentation deployed, waiting for live repro. When it happens:
   ```bash
   cd ~/Knomi/knomi-ai && docker compose logs backend --tail=200 | grep -E '\[Widget\]\[chat\]|\[ERROR\] 5'
   ```

4. **Other bugs** — user mentioned additional bugs at end of a previous session but never described them. Ask at start of next session.

---

## Key file map

| File | Repo | Purpose |
|------|------|---------|
| `server/src/routes/widget.js` | nomii-ai | Widget API — session, message, poll endpoints |
| `server/src/routes/license-checkout.js` | nomii-ai | Public checkout endpoint — creates Stripe Session for self-hosted license |
| `server/src/middleware/security.js` | nomii-ai | Security headers + CORS allowed origins |
| `server/src/engine/promptBuilder.js` | nomii-ai | Builds AI system prompt; `widgetGreeted` param added |
| `server/public/widget.html` | nomii-ai | Embeddable chat widget (vanilla JS) |
| `client/src/pages/nomii/dashboard/NomiiConversations.jsx` | nomii-ai | Conversations dashboard with split-pane ThreadView |
| `client/src/lib/nomiiApi.js` | nomii-ai | All client API calls |
| `client/nginx.conf` | nomii-ai | nginx config (widget iframe fix lives here) |
| `src/pages/nomii/BuyNomiiLicense.tsx` | ponten-solutions | Self-hosted license purchase page |
| `src/pages/NomiiAI.tsx` | ponten-solutions | Nomii product page (has Buy a License button) |
| `src/App.tsx` | ponten-solutions | Router — BuyNomiiLicense imported at line 23, route at line 90 |
| `docs/SESSION_NOTES.md` | nomii-ai | This file — session handoff |

---

## Architecture notes

- **DB name**: `knomi_ai`, **DB user**: `knomi` — kept from old Knomi AI brand to avoid breaking production
- **Poll flow**: widget polls `/api/widget/poll?since=<ISO timestamp>` every 1.5s (human) or 3s (AI)
- **JWT expiry**: 2h (`WIDGET_JWT_EXPIRY`)
- **Deployment modes**: `NOMII_DEPLOYMENT=selfhosted` for single-tenant; `NOMII_LICENSE_MASTER=true` for SaaS license server
- **Stripe webhook**: `stripe-webhook.js` handles `checkout.session.completed`; detects `metadata.product_type === 'selfhosted'` → generates license key → inserts into `licenses` table → emails to buyer. No changes needed to this file.
- **Self-hosted license flow**: buyer visits `pontensolutions.com/nomii/license` → selects plan → enters email → POST to `nomii.pontensolutions.com/api/public/license/checkout` → redirected to Stripe → webhook fires → key emailed → buyer activates in Nomii dashboard under Plans & Billing
