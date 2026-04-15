# Nomii AI — Session Notes

> This file is the live handoff between Claude sessions.
> Update it at the end of every session. Claude reads it automatically via CLAUDE.md.

---

## Last updated: 2026-04-15 late-evening (8-agent codebase cleanup sweep)

36 commits landed locally on `main` (unpushed). 96 files changed, net **−5,223 LOC** across 7 merge commits + agent 5's direct commits. Production **NOT YET DEPLOYED** — Austin to review, push, and rebuild on Proxmox.

### What changed (8 parallel subagents, worktree-isolated, background)

| Agent | Branch / merge | Outcome |
|---|---|---|
| 1 DRY | `merge(cleanup-1)` 70a78b8 | Extracted `lib/format.js`, `lib/clipboard.js` (copyToClipboard + plain-HTTP fallback), and `downloadAuthenticatedFile` helper in `nomiiApi.js`. Resisted extracting `ErrorState`/skeletons (drift across 8 sites); left `requireTenantAccess` vs `requireTenantScope` alone (different role checks). |
| 2 Types | `merge(cleanup-2)` bc75394 | Centralized plan/status/notification/deployment enums + JSDoc typedefs (first in repo). `server/src/config/plans.js` sources `UNRESTRICTED_PLANS`/`TRIAL_PLANS`/`VALID_ADMIN_PLANS`/`VALID_LICENSE_PLANS`. New `client/src/lib/constants.js` for `PLAN_LABELS` + enums. `DEPLOYMENT_MODES`/`isSelfHosted()` replaced 10 literal checks. 14 files touched. |
| 3 Unused | `merge(cleanup-3)` ad8fb1e | Deleted **48 client files** (42 shadcn/ui, 3 orphan hooks, `NomiiDashboard.jsx` placeholder, `Step5TestAgent.jsx`). Removed **38 npm deps** (client: `react-hook-form`, `zod`, `framer-motion`, 25 Radix primitives, cmdk, vaul…; server: `uuid`). Client CSS bundle 73.45 kB → 38.55 kB (−48%). |
| 4 Circular | `merge(cleanup-4)` 34e36d2 | **0 cycles** in client (91 files, TS/TSX aware) or server (52 files). Report-only. |
| 5 Weak types | *leaked onto main* (9b65c11 → 4908225) | Added JSDoc to `nomiiApi.js` (80+ consumers had zero docs). Narrowed `licenseService.callValidate` return shape. Added boundary `TypeError`s to `apiKeyService.encrypt/decrypt` and `promptBuilder.buildSystemPrompt`. Added `typeof` guards + length caps on 4 portal mutation routes. **Verified safe against master `/validate` contract** at `server/src/routes/license.js:82-86` — always returns `{ valid, plan, expires_at }`. |
| 6 try/catch | `merge(cleanup-6)` 8964803 | Only 2 simplifications (redundant `console.error` before `next(err)` in `middleware/subscription.js`). Report documents ~349 try/catch sites as consistently purposeful. |
| 7 Deprecated | `merge(cleanup-7)` 9f63590 | **Real latent bug fix**: `portal.js` had TWO `POST /tools/:toolId/test` handlers — older webhook-only one was shadowing the newer agentic sandbox handler (Express first-match). Tools dashboard Test button has been broken for every non-connect tool since `f6f0edb`. Removed shadower (−63 LOC). |
| 8 Comments | `merge(cleanup-8)` 7e2260b | 62 `// =====` banner lines across 10 files. 2 engine-file AI marketing headers replaced with terse module JSDoc. 4 stale narrating comments. 0 debug `console.log`s removed — all 75+ are structured `[Prefix]` grep targets. |

### Big finding from agent 7 (DEFERRED — your call)

Seven **pre-portal route files** (`chat.js`, `conversations.js`, `customers.js`, `advisors.js`, `flags.js`, `tenants.js`, `customTools.js` — ~**1,646 LOC**) have **zero in-repo callers**. All dashboard features moved to `/api/portal/*`; widget chat moved to `/api/widget/chat`. Agent deliberately did not auto-delete due to possible external consumers (WordPress plugin?). Needs a separate decision.

### Agent 5 broke isolation

Despite the worktree sandbox, agent 5 committed 6 commits directly to `main` instead of its branch (`worktree-agent-a93f98e0` is empty). Commits are still local and recoverable. Work itself is good (verified callValidate contract against master). Going forward: explicit "NEVER commit to main" in subagent briefings OR use a pre-commit hook that blocks writes to `main` inside agents' worktrees.

### Open issues the sweep surfaced (not fixed)

- `server/src/routes/portal.js` is **3,683 lines** — violates CLAUDE.md `<500-line` guideline. Should be split into route-group modules.
- `planDefaults` in `portal.js` vs `PLAN_LIMITS` shape mismatch (`null` vs sentinel int for unlimited; `managed_ai_enabled` vs `managed_ai`). Too risky pre-launch but worth aligning after first paying customer.
- Eslint config not present but devDeps installed; vitest scripts exist but no tests. Pick one: restore or remove.

### Post-merge verification (this session)

- `cd client && npm install && npm run build` → PASS (2497 modules, 4.70s)
- `cd server && npm install` → PASS
- `node -c` on 14 key server files (index, portal, widget, license, license-checkout, setup, onboard, auth, chat, promptBuilder, licenseService, apiKeyService, subscription, plans) → all PASS
- 2 merge conflicts resolved by hand: `promptBuilder.js` (agent 5 JSDoc + agent 8 banner removal) and `portal.js` (agent 7 handler removal superseded agent 8's edit inside the deleted block). Both resolutions verified by re-running `node -c`.

### Reports for review

All 8 cleanup reports landed at `docs/cleanup-reports/1-dedup.md` through `8-comments.md`. Each has methodology, concrete file:line findings, HIGH/MEDIUM/LOW recommendations, and a deferred list.

### Next-session TODO (updated)

0. **Review + push the cleanup to prod.** `git push origin main` pushes 36 commits. Then on Proxmox: `cd ~/Knomi/knomi-ai && git pull && docker compose up -d --build backend frontend`. Validate dashboard loads, Test Tool button fires, widget chat works. The sweep is LOCAL until pushed.
1. **Phase 1B-11 (Austin manual, still outstanding)** — $1 live Stripe smoke test through the now-fixed checkout. Cleanup sweep is independent of this.
2. **Phase 3** — SaaS parity audit (as in previous notes).
3. **Phase 4** — Hetzner cutover (as in previous notes).
4. **Decide on 1,646 LOC of pre-portal routes** (agent 7's HIGH deferred finding). Grep production logs for hits to `/api/chat`, `/api/conversations`, `/api/customers`, `/api/advisors`, `/api/flags`, `/api/tenants`, `/api/tools` (not `/api/portal/tools`). If zero hits in 7d, safe to delete.
5. **Split `portal.js`** (3,683 LOC → sensible route-group modules). Separate ticket.
6. **Smaller polish (unchanged)** — paid-tier upgrade banner, refactor `createNotification` to shared service.

---

## Last updated: 2026-04-15 evening (on-prem journey end-to-end shippable)

This was a "is the customer journey actually shippable" validation session that turned into a real-bug discovery + 3 commits to main + 1 prod hotfix + 1 prod deploy. The on-prem self-hosted journey is now genuinely complete end-to-end except a single user-driven smoke test ($1 Stripe).

### What changed (commits, in order)
| Commit | Subject |
|---|---|
| `5647470` | fix(deploy): pass STRIPE_SELFHOSTED_PRICE_* env vars to backend container |
| `233820a` | feat(license): in-dashboard activation for self-hosted licenses |
| `6325c1e` | feat(notifications): in-app trial-limit notification (SMTP-independent) |

### 🚨 Critical bug found and fixed (5647470)
`pontensolutions.com/nomii/license` Stripe checkout was **completely broken** — every plan/interval combo returned 503 "Price not configured". Root cause: the 6 `STRIPE_SELFHOSTED_PRICE_*` env vars were set in `.env` on prod but `docker-compose.yml`'s `environment:` block didn't list them, so they never propagated to the running backend container. `docker compose restart` doesn't pick up new env-var lists; needed `--force-recreate`.

Confirmed via the `licenses` table on prod: **0 licenses ever issued** since the checkout endpoint started returning 503. Today's fix is the first time customers can actually purchase a self-hosted license.

### 🎯 Big build (233820a) — in-dashboard license activation
Before: customer buys a license → receives email → has to SSH in, edit `.env`, run `docker compose restart`. Tech-support nightmare for the SMB target market.

After: customer buys → receives email → opens dashboard → pastes key in `/nomii/dashboard/plans` → trial limits lift instantly. No SSH, no `.env` editing, no restart.

Backend changes:
- Migration 030: `tenants.license_key` + `license_key_validated_at` columns
- `licenseService.activateLicense(key, tenantId)` — validate with master, persist to DB, `applyPlanLimits`, schedule heartbeat
- `licenseService.deactivateLicense(tenantId)` — null the key, revert to trial, clear heartbeat
- `licenseService.getLicenseStatus(tenantId)` — returns masked key + plan + validated_at + signals env_var_in_use
- `checkLicenseOnStartup()` falls back to DB key when env var unset (env var still wins for existing operator-pinned installs)
- DB-sourced key invalid on startup falls to trial rather than crashing (env-var path stays strict)
- **Heartbeat now reverts to trial on definitive failures** (revoked/expired/not-found/instance-bind-mismatch). Closes a revenue leak: previously, if a customer let their license lapse, heartbeat warned but limits stayed paid forever.

Portal endpoints (gated to `NOMII_DEPLOYMENT=selfhosted`):
- `GET    /api/portal/license` — current status
- `POST   /api/portal/license/activate` — validate + persist + lift limits
- `DELETE /api/portal/license` — clear key + revert
- `/api/portal/me` now exposes `deployment_mode` so the dashboard branches its billing UI correctly

`NomiiPlans.jsx` replaces the static "Step 1: edit .env / Step 2: restart" instruction box with an interactive activate form + status panel. Hides the form (with an explanation) when key is pinned via `NOMII_LICENSE_KEY`.

### 🛎️ In-app limit notification (6325c1e)
`sendLimitNotificationIfNeeded` previously only sent an email — useless on default installs since `install.sh` makes SMTP optional. Now also creates a `notifications` row, picked up by the dashboard bell icon. New `limit_reached` notification type with a red Zap icon in the sidebar.

### Phase 2 audit revealed three NOT-A-BUG findings
- **Plans copy "mismatch"** (marketing $349 vs dashboard $399 for Pro): different products. Self-hosted is intentionally cheaper; SaaS includes infrastructure. After the activation build, self-hosted dashboards don't even show SaaS prices anymore.
- **Global upgrade banner**: already exists at `client/src/layouts/NomiiDashboardLayout.jsx:512-552` for trial/free plans. Earlier audit was API-only and missed it. Small follow-up: doesn't fire for paid plans hitting their cap, worth a separate ticket.
- **CSV upload silent fail at customer cap**: my earlier test used multipart; correct format is JSON `{csv:"..."}`. Endpoint actually returns 200 with per-row errors + `limit_reached: true` flag.

### End-to-end verification on test VM (10.0.100.25)
Wiped completely, re-installed via `curl install.sh`, drove the entire customer journey via API:
- ✅ install.sh completes ~60s, 3 containers up, /api/health OK
- ✅ Setup wizard creates tenant + admin + key, JWT issued, idempotent (409 on retry)
- ✅ Onboarding pre-filled correctly (only `install_widget` undone — SH-1 verified)
- ✅ Tool building: created `lookup_investments` lookup tool linked to `investments` data category. AI invoked it via widget chat and returned Alice's exact seeded holdings ("100 AAPL, 50 MSFT, 25 NVDA — total $87,400 as of April 14")
- ✅ Per-minute rate limit fires at burst ~10 messages with "Message rate limit reached. Please slow down."
- ✅ Trial monthly limit (20 msg) fires correctly with `{error: "message_limit_reached"}` HTTP 429
- ✅ Synthetic license activation lifts trial→starter (20→1000 msg, 1→50 customers) instantly via dashboard endpoint, no restart
- ✅ Bad key returns clean error: `{error: "License key not found"}` HTTP 400
- ✅ Deactivate reverts to trial limits instantly
- ✅ In-app notification fires on limit hit, visible at /api/portal/notifications

### Prod state at session end
- Git: at HEAD `6325c1e`, **0 commits behind main** (was 16 behind at session start)
- All 4 containers running: db, backend, frontend, cloudflared
- Stripe checkout: returns live URLs for all 6 plan/interval combos
- License master endpoint: responsive
- New /api/portal/license/* endpoints: mounted (return 404 on SaaS by design)
- Migration 030: applied

### Customer install command (unchanged from previous session)
```bash
# Trial / dev:
NOMII_PUBLIC_URL=https://nomii.yourfirm.com \
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh)

# Headless / CI / Ansible:
NOMII_NONINTERACTIVE=1 \
NOMII_PUBLIC_URL=https://nomii.yourfirm.com \
NOMII_LICENSE_KEY=NOMII-XXXX-XXXX-XXXX-XXXX \
NOMII_CF_TOKEN=eyJ... \
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh)
```
Customers with no license use the dashboard activation flow built today instead of the env var.

### Next-session TODO
1. **Phase 1B-11 (Austin manual, ONLY remaining stitch)** — $1 live Stripe smoke test through the now-fixed checkout to validate the webhook → license-key-email half. Every other segment of the on-prem journey is verified end-to-end. Visit `pontensolutions.com/nomii/license`, pick Starter monthly, real email, complete checkout. Confirm: (a) email arrives with key, (b) `SELECT * FROM licenses;` on prod-DB shows the new row.
2. **Phase 3** — SaaS parity audit: walk the same customer journey on the SaaS path (signup + Stripe subscription instead of install.sh + license activation). Confirm feature parity, fix any deployment-mode drift.
3. **Phase 4** — Hetzner cutover: port docker-compose + .env + DB to Hetzner CX22, DNS swap, retire Proxmox.
4. **Smaller polish (low priority)** — paid-tier upgrade banner (current global banner is trial-only), refactor `createNotification` to a shared service (currently lives in widget.js).

### Phase 1A (landing page) — ALREADY DONE
End-of-session check on prod found `SelfHostedNomii.tsx` already committed (`ec6a63f` on prod ponten-solutions repo), `App.tsx` route mounted at `/nomii/self-hosted` above the wildcard catch-all, and `https://pontensolutions.com/nomii/self-hosted` returning HTTP 200. Austin must have applied it between sessions. The Cloudflare redirect-rule concern from the Apr 14 notes is also resolved.

### Discoveries / new context worth remembering
- Prod SSH: `ssh nomii-prod` (configured in `~/.ssh/config` → `root@10.0.100.2`). Lateris also lives on this Proxmox host — DON'T touch any `lateris-*` containers.
- Prod DB user is `knomi` (not `nomii`) — kept from old brand to preserve volume.
- License master endpoint default in `licenseService.js` is `https://api.pontensolutions.com/api/license/validate` — both `api.` and `nomii.` resolve to the same backend.
- Stripe price IDs (live mode): saved in prod `.env`. Self-hosted plans range $49–$349/mo monthly, slightly different annual.
- The widget-side per-minute rate limit ("slow down") is distinct from the trial monthly cap. Defined in `server/src/index.js:77`.

---

## Earlier today: 2026-04-15 PM (on-prem install iteration — 3 cycles, end-to-end verified)

After the SH-1/SH-2/SH-3 surgical fixes earlier in the day landed, scope expanded to "make the on-prem install actually stress-free for customers". Drove 3 iterative install cycles directly against VM 10.0.100.25 (jafools@, key set up apr-14). VM completely wiped (volumes dropped, ~/nomii rm'd) and `install.sh` re-run from raw GitHub on every cycle. Final state — cycle 3 — passed every verification cleanly.

### Commits shipped in the iteration (all on main)
| Commit | Subject |
|---|---|
| `f5c0dd5` | fix(onboarding): SH-1/SH-2/SH-3 wizard bugs |
| `642fb98` | chore(session): notes |
| `9d673c0` | fix(self-hosted): polish on-prem install — branding, cloudflared, headless mode |
| `0925c0e` | fix(install): skip clear when TERM unset or headless |
| `411ab53` | fix(self-hosted): cloudflared via profiles, fixes distroless /bin/sh |
| `2fc8dc2` | feat(install): add NOMII_GITHUB_REF for version pinning |

### Issues found and fixed
- **HTML branding leak**: `client/index.html` had Pontén marketing title + og:image to `pontensolutions.com/og-image.png`. Self-hosted operators sharing their URL got the wrong link preview. Now generic "Nomii AI" + relative `/og-image.png`. Improvement for SaaS too.
- **8 pre-auth logo links** to `https://pontensolutions.com` across NomiiLogin (3), NomiiSignup (2), NomiiResetPassword (2), NomiiVerifyEmail (1) — same SH-3 pattern as the post-auth onboarding. Removed the `<a>` wrappers; static logos on login forms is standard UX anyway.
- **Cloudflared restart loop** — root cause: compose `command:` was passed to the cloudflared image's ENTRYPOINT, so the actual exec was `cloudflared sh -c "..."`, sh got treated as a cloudflared subcommand, exit 1, restart-looped forever. **Two failed attempts** before the right fix:
  1. Tried entrypoint override `["/bin/sh","-c"]` + `exec sleep infinity` on no-token. **Failed:** the cloudflared image is distroless, no `/bin/sh` exists.
  2. Switched to **compose `profiles: [tunnel]`**. install.sh detects `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and adds `--profile tunnel` automatically. When no token, no cloudflared container exists at all. Verified scenario A (no token → 3 containers) and scenario B (token set → 4 containers, profile auto-activated).
- **install.sh `clear` crashed in headless mode** — `clear` errors with "TERM environment variable not set" when no tty + `set -e` aborts. Now gated by `[ -n "$TERM" ] && [ "$NONINT" != "1" ]`.
- **install.sh stale CDN cache** — install.sh hardcoded `main` branch URL for compose download; CDN can lag pushes by minutes. Added `NOMII_GITHUB_REF` env var so customers can pin to a release tag (the production-correct way) and so testers can pin to a SHA.
- **install.sh post-docker-install group bug** — install.sh installed Docker, added user to docker group, then immediately tried `docker compose pull` in the same shell — always failed (group not active in current shell). Now uses `DOCKER_CMD="sudo docker"` for the rest of the run when we just installed Docker. User logs out + back in for subsequent runs without sudo.
- **install.sh headless mode** — added `NOMII_NONINTERACTIVE=1` (skips `/dev/tty` redirect, reads answers from `NOMII_PUBLIC_URL`, `NOMII_SMTP_*`, `NOMII_CF_TOKEN`, `NOMII_LICENSE_KEY`). Real customer feature — needed for CI/Ansible/Terraform/Docker-build workflows. Also unblocks automated testing.

### Final verification (cycle 3, scenario A, fresh VM)
- `bash <(curl ...install.sh)` with `NOMII_NONINTERACTIVE=1 NOMII_PUBLIC_URL=http://10.0.100.25 NOMII_GITHUB_REF=<sha>` — completes in ~30s, ends with "Nomii AI is almost ready!"
- 3 containers up: `nomii-db (healthy)`, `nomii-backend`, `nomii-frontend`. No cloudflared.
- `/api/health` → `{"status":"ok"}` in 1s
- `POST /api/setup/complete` → tenant created with `onboarding_steps` pre-filled `{tools, api_key, products, customers, company_profile: true}` — only `install_widget` undone (SH-1 verified end-to-end)
- HTML head: `<title>Nomii AI</title>`, og:image=`/og-image.png`, og:site_name=`Nomii AI`
- 0 `pontensolutions.com` refs on `/`, `/nomii/login`, `/nomii/setup`, `/nomii/onboarding`, `/nomii/signup`
- 20-msg trial limit: with `messages_used_this_month=20`, the 21st widget chat returns `HTTP 429 message_limit_reached`

### Customer install command (post-iteration, recommended)
```bash
# Trial / dev:
NOMII_PUBLIC_URL=https://nomii.yourfirm.com \
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh)

# Headless / CI / Ansible:
NOMII_NONINTERACTIVE=1 \
NOMII_PUBLIC_URL=https://nomii.yourfirm.com \
NOMII_LICENSE_KEY=NOMII-XXXX-XXXX-XXXX-XXXX \
NOMII_CF_TOKEN=eyJ... \
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh)

# Production: pin to a tag (when we cut releases)
NOMII_GITHUB_REF=v1.0.0 \
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/v1.0.0/scripts/install.sh)
```

### Still open / future polish (NOT touched in this iteration)
- SH-4 (LOW): `/nomii/*` URL prefix is a SaaS artifact on self-hosted — aesthetic, not functional
- SH-5 (LOW): widget snippet template placeholders shown without inline help
- Pre-existing `widget.js:1284` join bug (selects `t.managed_ai_enabled` from tenants instead of subscriptions)
- Self-hosted onboarding shows SaaS-only steps (Products, Customers) in sidebar even though they're pre-marked done. Customer can click into them — not broken, just redundant. Worth gating those steps on deployment mode.

---

## Earlier today: 2026-04-15 (onboarding wizard bugfixes)

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
