# Nomii AI — Session Notes

> This file is the live handoff between Claude sessions.
> Update it at the end of every session. Claude reads it automatically via CLAUDE.md.

---

## Last updated: 2026-04-15 (onboarding wizard bugfixes)

### What was completed (session 2026-04-15)

Three bugs from yesterday's fresh-VM install test (2026-04-14, tracked in `projects/nomii/fresh-vm-install-test-apr14-2026.md` in the Obsidian vault) fixed in one pass.

**SH-3 (CRITICAL) — hardcoded pontensolutions.com redirect mid-onboarding:**
- `client/src/pages/nomii/NomiiOnboarding.jsx:207,288` — both logo wrappers were `<a href="https://pontensolutions.com">`. Clicking the Nomii logo in the sidebar (desktop) or header (mobile) mid-flow hard-redirected users OUT of their self-hosted instance.
- Fix: swapped to `<Link to="/nomii/dashboard">` (react-router `Link` already imported). Logo now SPA-navigates to dashboard — works for both SaaS and self-hosted.
- Note: NomiiLogin, NomiiSignup, NomiiResetPassword, NomiiVerifyEmail still hardcode the same external link on their logos. Left alone for now — those are pre-auth pages and the scoped task was onboarding.

**SH-1 — first-run wizard skipped widget install step:**
- `server/src/routes/setup.js:89` inserted tenant with `onboarding_steps='{}'`, so `/nomii/onboarding` resume logic treated every step as incomplete.
- `client/src/pages/nomii/NomiiSetup.jsx:62` routed to `/nomii/dashboard` after self-hosted setup, so the operator never passed through the widget-install UI.
- Fix:
  - `setup.js` now pre-fills `onboarding_steps` as `{company_profile, products, customers, api_key, tools: true}` via `$5::jsonb`. Only `install_widget` stays undone.
  - `NomiiSetup.jsx` now `navigate("/nomii/onboarding", ...)` on success; onboarding resume logic lands directly on Step4InstallWidget.

**SH-2 — "Installation guide" link landed on step 1:**
- `client/src/pages/nomii/dashboard/NomiiSettings.jsx:193` `<Link to="/nomii/onboarding">`. On self-hosted, because of SH-1's empty `onboarding_steps`, resume landed on step 1.
- Fix: none required. The SH-1 `onboarding_steps` pre-fill means the Settings → Widget "Installation guide" link now also lands on the widget step. Dropped from scope.

### Verification
- `npm run build` in `client/` passes — 2497 modules, 4.32s, no errors.
- `node -e "require('./server/src/routes/setup.js')"` loads cleanly.
- `onboarding_steps` column confirmed `JSONB NOT NULL DEFAULT '{}'` in migration 005, so `$5::jsonb` cast is schema-correct.

### What still needs to run (on the VM)
1. Commit + push to `main` so CI rebuilds `ghcr.io/jafools/nomii-*:latest` images (or build from source on the VM).
2. Reset the VM tenant (fresh-install scenario) — e.g. `docker exec nomii-db psql -U knomi -d knomi_ai -c "TRUNCATE tenants, tenant_admins, subscriptions CASCADE;"` — so `/api/setup/status` returns `required: true` again.
3. Rerun the first-run wizard in the browser at `http://10.0.100.25/`. Expected: after step 3 (API key), lands on `/nomii/onboarding` widget step (not dashboard).
4. Paste the widget snippet on a test page, verify → wizard flips to "You're all set!" → dashboard.
5. Click the Nomii logo inside `/nomii/onboarding` mid-flow — must stay in-app (go to `/nomii/dashboard`), not kick out to pontensolutions.com.
6. In Settings → Widget, remove the widget from the test page so "Not yet detected" reappears, click the "Installation guide" pill, verify it lands on the widget step (not step 1).
7. **20-msg rate limit retest** — send 20 messages through the widget in trial mode, confirm 21st is blocked with the trial-exhausted error. `SELECT COUNT(*) FROM messages WHERE tenant_id = <id>` in `nomii-db` to double-check.

---

## Previous sessions

### Last updated: 2026-04-14 (session 4 of the day)

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

## What was completed (session 2026-04-14, session 3)

### First-run browser setup wizard for self-hosted (commits `bbbb356`, `ccdbec9`)
Replaces the terminal/env-var provisioning approach with a polished 3-step web wizard.
Self-hosted users now: `docker compose up -d` → open browser → wizard → dashboard.

**Backend:**
- `server/src/routes/setup.js` (new) — `GET /api/setup/status` returns `{ required: true }` when no tenant exists; `POST /api/setup/complete` creates tenant + admin, stores Anthropic API key encrypted (AES-256 via existing apiKeyService), returns portal JWT for auto-login. Gated by `NOMII_DEPLOYMENT=selfhosted` and idempotent (409 if tenant exists).
- `server/src/index.js` — mounted setup routes at `/api/setup`
- `server/src/jobs/seedSelfHostedTenant.js` — skips silently if `MASTER_EMAIL`/`ADMIN_PASSWORD` not set (wizard handles it)
- `server/src/services/licenseService.js` — `applyPlanLimits` now forces `managed_ai_enabled=false` on self-hosted. Prevented a bug where growth+ license upgrades would break LLM calls (heartbeat was setting `managed_ai_enabled=true` but self-hosted has no platform key).

**Frontend:**
- `client/src/pages/nomii/NomiiSetup.jsx` (new) — 3-step wizard matching dark theme (company name → admin account → Anthropic key)
- `client/src/App.tsx` — added `/nomii/setup` route + `SetupRedirect` component that checks setup status on root visit
- `client/src/lib/nomiiApi.js` — added `getSetupStatus()` and `completeSetup()`

**Deployment:**
- `docker-compose.selfhosted.yml` — removed `TENANT_NAME`, `ADMIN_PASSWORD`; marked `ANTHROPIC_API_KEY` as optional
- `scripts/install.sh` — simplified to 5 steps. Prompts only for install dir, public URL, optional SMTP, optional Cloudflare token, optional license key. Final message directs user to browser wizard.

### Self-hosted landing page for pontensolutions.com
Wrote `src/pages/nomii/SelfHostedNomii.tsx` for the `ponten-solutions` repo — provided full TSX + Proxmox commands to the user. Route: `/nomii/self-hosted`. Uses dark theme, has hero with one-line install command (copy button), benefits, 4-step "how it works", requirements, trial CTA linking to `/nomii/license`.

**User action needed on Proxmox:**
1. Apply the TSX file + App.tsx route in `~/ponten-solutions`
2. Remove/scope the Cloudflare redirect rule catching `pontensolutions.com/nomii/*` → `nomii.pontensolutions.com` so the new route renders

### Verified during review
- nginx.conf correctly proxies `/api/setup/*` to backend
- Widget chat uses `req.subscription.managed_ai_enabled` (not the broken tenant join at widget.js:1284)
- `NomiiProtectedRoute` works with just localStorage token set by the wizard
- Setup endpoint idempotent + gated to self-hosted
- Found + flagged pre-existing bug at `server/src/routes/widget.js:1284` — selects `t.managed_ai_enabled` from tenants but column only exists on subscriptions. Out of scope for this session.

---

## What was completed (session 2026-04-14, session 4)

- **Annual Stripe prices configured** — All 6 price IDs now set in VPS `.env`:
  - `STRIPE_SELFHOSTED_PRICE_STARTER_MONTHLY=price_1TKfAjBlxts7IvMos78onw0X`
  - `STRIPE_SELFHOSTED_PRICE_GROWTH_MONTHLY=price_1TKfAlBlxts7IvMoEzKQSpTe`
  - `STRIPE_SELFHOSTED_PRICE_PROFESSIONAL_MONTHLY=price_1TKfAnBlxts7IvMooJKLldT7`
  - `STRIPE_SELFHOSTED_PRICE_STARTER_ANNUAL=price_1TMCtuBlxts7IvMoLwpXJafP`
  - `STRIPE_SELFHOSTED_PRICE_GROWTH_ANNUAL=price_1TMCuJBlxts7IvMoftLzEgS8`
  - `STRIPE_SELFHOSTED_PRICE_PROFESSIONAL_ANNUAL=price_1TMCukBlxts7IvMoSIeCQtOs`
  - Backend restarted. Annual toggle on `pontensolutions.com/nomii/license` now routes to correct Stripe prices.

---

## Next session TODO (priority order)

1. **Apply self-hosted landing page on pontensolutions.com** — TSX written last session. User needs to apply in `~/ponten-solutions` on Proxmox (nano the file, edit App.tsx, commit, push). Also remove/scope the Cloudflare redirect rule that catches `pontensolutions.com/nomii/*` → `nomii.pontensolutions.com`.

2. **End-to-end test the setup wizard** — create a throwaway deploy in `/tmp/nomii-test` with a port-80→8080 override and minimal `.env` (no MASTER_EMAIL/ADMIN_PASSWORD/ANTHROPIC_API_KEY). Verify wizard appears, 3 steps complete, auto-login works, widget message sends via BYOK key. Teardown with `docker compose down -v`.

3. **Smoke test annual billing** — go to `pontensolutions.com/nomii/license`, toggle to Annual, pick a plan, enter email, confirm Stripe Checkout shows annual price. Do not complete purchase, just verify redirect.

4. **Widget "Sorry, I had trouble responding" error** — instrumentation deployed, waiting for live repro. When it happens:
   ```bash
   cd ~/Knomi/knomi-ai && docker compose logs backend --tail=200 | grep -E '\[Widget\]\[chat\]|\[ERROR\] 5'
   ```

5. **Pre-existing bug at widget.js:1284** — selects `t.managed_ai_enabled` from tenants but the column lives on subscriptions. Returns undefined in that code path. Worth fixing when time permits.

---

## Key file map

| File | Repo | Purpose |
|------|------|---------|
| `server/src/routes/widget.js` | nomii-ai | Widget API — session, message, poll endpoints |
| `server/src/routes/setup.js` | nomii-ai | First-run setup endpoints (`/api/setup/status`, `/api/setup/complete`) |
| `server/src/routes/license-checkout.js` | nomii-ai | Public checkout endpoint — creates Stripe Session for self-hosted license |
| `client/src/pages/nomii/NomiiSetup.jsx` | nomii-ai | 3-step browser setup wizard (self-hosted first-run) |
| `src/pages/nomii/SelfHostedNomii.tsx` | ponten-solutions | Self-hosted landing page at `/nomii/self-hosted` (pending apply) |
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
