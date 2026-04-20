# Shenmay AI — Session Notes

> This file is the live handoff between Claude sessions.
> Update it at the end of every session. Claude reads it automatically via CLAUDE.md.

---

## Last updated: 2026-04-20 afternoon (v1.1.6 live — Stripe test mode + Managed-AI-Enterprise-only + logo link; Hetzner on `:1.1.6`)

This entry covers the afternoon session on 2026-04-20. **Three patch tags shipped** end-to-end, plus **two marketing-site commits Published via Lovable**, plus one clean Stripe **test-mode E2E** (signup → checkout with card `4242` → webhook → DB flip) — unblocking a launch-blocker that had been sitting open for weeks. Full vault writeup at `[[projects/nomii/stripe-test-mode-plus-managed-ai-rewrite-apr20-2026]]`.

### Production state at session end

| | |
|---|---|
| Hetzner SaaS | https://nomii.pontensolutions.com |
| Image | `ghcr.io/jafools/nomii-backend:1.1.6` + frontend `:1.1.6` |
| Git HEAD | `v1.1.6` (commit `65439a1`) |
| Marketing site | `pontensolutions.com` serving bundle `index-DN5Z4JIF.js` (both Lovable commits Published + verified) |

### What shipped

**v1.1.4 — Stripe env-driven + Plans UX + bug fixes**
- [PR #28](https://github.com/jafools/nomii-ai/pull/28) — `/api/config` emits `stripe.{publishableKey,pricingTableId}` from env vars; [NomiiPlans.jsx](client/src/pages/nomii/dashboard/NomiiPlans.jsx) reads them at runtime with hardcoded live keys as fallback. Staging can now run test mode from the same GHCR image as prod — preserves the byte-identical-build rule.
- [PR #29](https://github.com/jafools/nomii-ai/pull/29) — "Current plan + next upgrade" nudge card above the Stripe pricing table on `/nomii/dashboard/plans`.
- [PR #30](https://github.com/jafools/nomii-ai/pull/30) — Fixed two UI bugs: "Covenant Trust" (a real customer name) leaked into Settings → Email Templates placeholders (swapped to Acme Co); Team page said "0 / 3 agents on trial plan" for starter tenants because of a flat `|| 3` fallback + missing `max_agents` on onboard register INSERT. Server now falls back to `PLAN_LIMITS[plan].max_agents` when the DB column is NULL.

**v1.1.5 — Managed AI is Enterprise-only**
- [PR #31](https://github.com/jafools/nomii-ai/pull/31) — Flipped Growth + Professional `managed_ai: false` in [server/src/config/plans.js](server/src/config/plans.js), [server/src/routes/portal.js](server/src/routes/portal.js) `/api/portal/plans` + admin set-plan defaults, and updated the UpgradeNudge delta copy. Paired with marketing commit [ponten-solutions@82ab2b7](https://github.com/jafools/ponten-solutions/commit/82ab2b7) dropping "Managed AI included/available" from Growth + Professional cards on `/nomii/license` and `/products/nomii-ai`. Existing Growth/Pro tenants with `managed_ai_enabled=true` keep it until their next plan flip — no silent mid-period downgrade.

**v1.1.6 — Logo → marketing-site link**
- [PR #32](https://github.com/jafools/nomii-ai/pull/32) — Wraps the NomiiAI + "by Pontén Solutions" logo stack on the 3 pre-auth pages (signup / login / reset-password) in an anchor to `pontensolutions.com`. Users now have a way back; post-auth dashboards already have their own nav.

**Marketing site (ponten-solutions) — pushed + Lovable-Published**
- Commit `82ab2b7` — Self-Hosted pricing CTAs on `/nomii/license` redirect to `/nomii/self-hosted` (installer page) instead of opening a Stripe checkout modal, so trial-first funnel. Also drops Managed AI from Growth + Pro marketing cards (matches the backend change above).

### Stripe test mode on staging (launch-blocker #1 CLOSED)

All 5 `STRIPE_*` env vars are now live on staging's `/root/nomii-staging/.env` (test mode: `sk_test_…`, `pk_test_…`, `whsec_hOkX…`, `prctbl_1TODCv…`, `price_1TODAr…` Starter). The staging compose file `docker-compose.staging.yml` was updated to forward the 3 new env vars (was previously only forwarding `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`). Prod keeps its live keys via the hardcoded fallback in NomiiPlans.jsx — zero prod env changes needed. End-to-end test with card `4242 4242 4242 4242` verified: signup → JWT → plans page → subscribe → Stripe-hosted checkout → webhook fires → `subscriptions` row flipped to `plan=starter, status=active, max_customers=50, max_messages_month=1000`. Test tenant deleted post-run; Stripe test subscription canceled.

### Gotchas learned this session

1. **Staging `.env` was inheriting prod's LIVE `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`** before this session — replaced with test-mode values and backed up at `.env.backup-20260420-pre-test-mode`. Worth auditing other secret env vars on staging to check for similar drift.
2. **`docker-compose.staging.yml` only forwards env vars explicitly named in the backend service's `environment:` block.** Adding to `.env` alone is silent no-op. Check both when wiring new vars.
3. **MCP Chrome tool `form_input` doesn't trigger React's synthetic `onChange`** — React state stays empty even though the DOM value is set. Use `javascript_tool` to invoke `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)` + dispatch `input` + `change` events to make React notice.
4. **MCP blocks all interactions with `checkout.stripe.com`** (live AND test). User has to fill the card form themselves — unavoidable for SaaS checkout E2E.
5. **Stripe pricing-table web component is a shadow-DOM iframe from `js.stripe.com`** — coordinate clicks work, but `ref`-based clicks through the MCP often don't reach the iframe.

### What's NOT done (deliberately deferred)

| Item | Why deferred |
|---|---|
| Force-migrate existing Growth tenants from `managed_ai_enabled=true` → `false` | Would silently downgrade paying customers mid-period. They keep what they bought; next plan flip resets. |
| Add Growth + Professional test products in Stripe test mode | Austin: "if this works the others should work right?" — same code path, trust the pattern. |
| Split `portal.js` (still 3,750+ LOC) | Same reasoning as prior session — real refactor risk, separate slot. |
| Playwright against staging | Same reasoning. Local Playwright still auth-fails (no TEST_ADMIN seed in dev DB). |
| Rotate the `sk_test_` key pasted in chat | Austin task — takes 10 sec in Stripe dashboard → test/apikeys → Roll key. |

### Launch blockers (remaining)

1. ~~Stripe test mode on staging~~ **CLOSED this session ✓**
2. Live stranger walkthrough — SaaS signup
3. Live stranger walkthrough — self-hosted install on a fresh VM
4. UptimeRobot signup (closes audit #14)
5. Off-host backup destination (Hetzner Storage Box)
6. Published docs site at `docs.pontensolutions.com`

### Memory housekeeping this session

- Nothing added/removed. Existing memories still accurate. One candidate for a new memory: the "form_input doesn't fire React onChange" finding — saving as `feedback_chrome_mcp_react_events.md`.

---

## Previous: 2026-04-20 (v1.1.3 live — PII coverage closed + audit cleanup; Hetzner on `:1.1.3`)

This entry covers the long session that opened 2026-04-19 evening (right after the v1.1.0 black-box E2E) and rolled into 2026-04-20 early morning. Three patch tags shipped end-to-end through the release flow with zero rollbacks. Full vault writeup at `[[projects/nomii/pii-completion-and-audit-cleanup-apr19-20-2026]]`.

### Production state at session end

| | |
|---|---|
| Hetzner SaaS | https://nomii.pontensolutions.com |
| Image | `ghcr.io/jafools/nomii-backend:1.1.3` |
| Git HEAD | `v1.1.3` (commit `9d35046` + the v1.1.3 tag) |
| `:stable` on GHCR | now points at v1.1.3 |
| `pii_tokenization_enabled` | TRUE for all tenants (default from migration 031, owner can toggle in `Settings → Privacy`) |
| Migration row cleanup | verified — `015b_*` row scrubbed from `schema_migrations`, `032_*` recorded |

### What shipped

**v1.1.1 — close CSV-import leak + delete zombie routes**
- [PR #20](https://github.com/jafools/nomii-ai/pull/20) — tokenize CSV-import sample rows + Privacy Policy §6.1 update. Two new regression tests for the JSON.stringify(headers + sample_rows) payload shape.
- [PR #21](https://github.com/jafools/nomii-ai/pull/21) — remove 7 pre-portal route files (chat, conversations, customers, advisors, flags, tenants, customTools) + their mounts. **−1,647 LOC.** Gated on a 7-day Hetzner log grep (zero hits across both backend + frontend nginx logs).

**v1.1.2 — PII closure + owner toggle UI**
- [PR #22](https://github.com/jafools/nomii-ai/pull/22) — prune 4 helpers orphaned by the v1.1.1 delete: `engine/toolConfigurator.js` (whole file), `requireCustomerOwnership`, `sendFlagNotificationEmail`, `listAllTools`. **−321 LOC.**
- [PR #23](https://github.com/jafools/nomii-ai/pull/23) — tokenize the second remaining bare-Anthropic call: `/api/portal/products/ai-suggest` (scrapes website HTML or eats free-text description). Two more regression tests (now 46/46 unit suite).
- [PR #24](https://github.com/jafools/nomii-ai/pull/24) — owner-only PII toggle UI on the existing tenant Settings page. New backend route `PUT /api/portal/settings/privacy` (owner-role-gated, audit-logged on every flip). UI section hidden client-side for non-owners. Default ON (matches migration 031).

**v1.1.3 — audit cleanup**
- [PR #25](https://github.com/jafools/nomii-ai/pull/25) — rename migration `015b_*` → `032_*` to fit `NNN_*.sql` convention. The new file's first statement is `DELETE FROM schema_migrations WHERE filename = '015b_seed_covenant_trust_tools.sql'` so Hetzner's orphan row gets cleaned on first run. Idempotent on fresh DBs. **Verified end-to-end on prod** — `015b_*` row gone, `032_*` recorded.
- [PR #26](https://github.com/jafools/nomii-ai/pull/26) — finish knomi → nomii rename in self-hosted compose + helper scripts (`docker-compose.selfhosted.yml`, `scripts/migrate.sh`, `scripts/backup.sh`). Safe because there are no live on-prem customers running the legacy `knomi` DB right now. Cloudflare tunnel `knomi-ai` and Proxmox docker network `knomi-ai_default` intentionally NOT touched (real infra, also serve Lateris).

### Audit progress

The `docs/AUDIT-2026-04-17.md` open list was 3 actionable items at session start (#5, #7, #15). All three closed. Remaining items are:
- **#14 LOW** — UptimeRobot signup (Austin task, ~5 min in dashboard)
- **#16 LOW/INFO** — `:latest` pinning, "no fix needed"
- **3 INFO items** — positive observations, no action

### What's NOT done (deliberately deferred for next session)

| Item | Why deferred |
|---|---|
| `portal.js` split (3,750+ LOC) | Pure tech debt, real refactor risk. Needs a focused session with an architectural call signed off (split by URL prefix vs feature domain). |
| Playwright wired into CI | Local Playwright suite has 6 auth-related failures because dev DB lacks `TEST_ADMIN_*` seed rows. CI passes the same suite cleanly. Wiring into CI may surface fresh issues — needs its own debug slot. See `[[feedback_playwright_local_env]]` memory. |

### Launch blockers (your court — unchanged)

1. Stripe test mode on staging (~10 min in Stripe dashboard)
2. Live stranger walkthrough — SaaS signup
3. Live stranger walkthrough — self-hosted install on a fresh VM
4. UptimeRobot signup (closes audit #14)
5. Off-host backup destination (Hetzner Storage Box)
6. Published docs site at `docs.pontensolutions.com`

### Carried forward (still true)

- Hetzner backup cron runs 03:00 daily, log at `~/nomii-backup.log`
- Log rotation: 10MB × 5 = 50MB cap per container
- Staging auto-refresh every 5 min via `nomii-staging-refresh.timer` on Proxmox
- SaaS + on-prem byte-identical (both pull GHCR images)
- 48 tokenizer unit tests (was 42 at the start of v1.1.0) — `npm run test:unit`

### Memory housekeeping this session

- **Removed:** `project_pre_portal_routes_zombie.md` — obsolete after PR #21 delete
- **Added:** `feedback_playwright_local_env.md` — don't debug local Playwright auth failures unless explicitly asked
- **Added:** `reference_no_super_admin_ui.md` — there's no platform-admin UI in client; tenant controls go on NomiiSettings.jsx gated by `role='owner'`

---

## Previous: 2026-04-19 evening (PII tokenizer SHIPPED + E2E verified on prod — v1.1.0 live)

### Live E2E verification — PASSED

Black-box E2E run against `https://nomii.pontensolutions.com` using a
disposable test tenant. Full script preserved at [tests/pii_blackbox_e2e.sh](tests/pii_blackbox_e2e.sh)
for future regression checks.

**What the test did:**
1. Created a disposable test tenant + subscription + widget key
2. Started a widget session with a fake customer email
3. Sent one message with a full suite of fake PII (SSN, CC, email, DOB,
   bank account, full name "Diana Thornton")
4. Tailed the backend logs during the turn
5. Verified the response + logs + breach log
6. Cleaned up every row it created

**Results (all three green):**

| Check | Result |
|---|---|
| Detokenization — agent response coherent, no raw tokens visible to user | ✓ (agent replied "Hi Diana!" — 694 chars, no `[SSN_N]` / `[CC_N]` leaked through) |
| Backend logs — no raw PII (SSN, CC, email) in log stream | ✓ |
| `pii_breach_log` delta on clean input | ✓ (0 new rows) |

The agent's response is itself a proof-point: *"I don't actually store or
have access to sensitive personal information like SSNs, credit card numbers,
or bank account details for security reasons"* — which is truthful,
because after tokenization Claude only sees `[SSN_1]`, `[CC_1]`, etc. The
agent accurately reflects what it saw.

### Fixes applied during testing

None — the tokenizer passed E2E on the first real run. The script needed
three cosmetic fixes before it would work:

- Widget API key column is `VARCHAR(64)` — reduced `gen_random_bytes(32)`
  to `(20)` so `'e2e_' + 40 hex chars = 44` fits
- `subscriptions.max_messages_per_month` doesn't exist — correct column
  name is `max_messages_month`
- `psql -t -A` returns `INSERT 0 1` status after `RETURNING` value — split
  into separate INSERT + SELECT to get a clean single-value capture

### Artifacts shipped this session

| | |
|---|---|
| [PR #16](https://github.com/jafools/nomii-ai/pull/16) — merged | Privacy Policy — `docs/PRIVACY.md` |
| [PR #17](https://github.com/jafools/nomii-ai/pull/17) — merged | PII tokenizer feature (v1.1.0) |
| [PR #18](https://github.com/jafools/nomii-ai/pull/18) — merged | SESSION_NOTES wrap of first half |
| PR #19 — this session-wrap | E2E harness + evening notes |
| v1.1.0 tag + Hetzner deploy | GHCR `:1.1.0`, `:stable`, migration 031 applied |

### Still-true things (carried forward)

- v1.1.0 live on Hetzner. `ghcr.io/jafools/nomii-backend:1.1.0`
- All tenants default `pii_tokenization_enabled = true`
- Launch blockers unchanged: Stripe test mode on staging, live stranger
  walkthrough (SaaS + self-hosted), UptimeRobot signup

### New follow-ups noted this session

- Wire tokenizer into `portal.js:639` CSV import (admin path sends up to
  3 customer sample rows to Claude for header mapping — lower risk than
  chat but still a leak vector)
- Admin UI toggle for `pii_tokenization_enabled` (column exists, no UI)
- Presidio NER sidecar for free-text name detection beyond what
  `memory_file` structural hints cover
- Update `docs/PRIVACY.md` §6.1 to mention live tokenization explicitly

---

## Previous: 2026-04-19 midday (PII tokenizer SHIPPED — v1.1.0 live; Privacy Policy drafted)

First minor-version bump. Triggered by Austin asking "what does Anthropic
see with our API calls?" Shipped two PRs end-to-end through the release
flow in one session:

### PRs merged + tag cut

| | |
|---|---|
| [PR #16](https://github.com/jafools/nomii-ai/pull/16) — **MERGED** ([25b3077](https://github.com/jafools/nomii-ai/commit/25b3077)) | `docs/PRIVACY.md` — Shenmay-specific Privacy Policy, BYOK vs Managed AI controller/processor split explicit, "Anthropic does not train on API data" stated directly, EU-first residency posture. Prior `.docx` draft moved to `docs/legal/` out of root. |
| [PR #17](https://github.com/jafools/nomii-ai/pull/17) — **MERGED** ([9d4f5bd](https://github.com/jafools/nomii-ai/commit/9d4f5bd)) | Log-and-block PII tokenizer. Regulated identifiers (SSN, CC+Luhn, IBAN+mod97, phone, email, DOB, postcode, account) tokenized before every Anthropic call; names pseudonymized from structured `memory_file`; breach detector blocks outbound if residual PII remains. |
| **v1.1.0** tag | Pushed to GHCR (`:1.1.0`, `:1.1`, `:stable`, `:latest`), deployed to Hetzner, live |

### Deployment log (Hetzner, 2026-04-19 ~11:21 UTC)

```
=== git fetch + checkout v1.1.0                                    [✓]
=== migration 031 applied (tenants.pii_tokenization_enabled +
    pii_breach_log table)                                          [✓]
=== IMAGE_TAG=1.1.0 docker compose pull (backend + frontend)       [✓]
=== IMAGE_TAG=1.1.0 docker compose up -d (db healthy, backend+
    frontend recreated)                                             [✓]
=== verify
     /api/health (internal):  {"status":"ok"...}                   [✓]
     /api/health (public):    {"status":"ok"...}                   [✓]
     nomii-backend image:     ghcr.io/jafools/nomii-backend:1.1.0  [✓]
     git HEAD:                v1.1.0                                [✓]
     pii_breach_log table:    7 columns present                    [✓]
     pii_tokenization_enabled: TRUE for all 5 tenants              [✓]
```

### The marketing story

`docs/marketing/PII-PROTECTION.md` has:
- One-sentence claim: *"Shenmay never sends your customers' regulated personal identifiers to Anthropic. Names are pseudonymized, SSNs and account numbers are tokenized, and a second-pass breach detector blocks any request that still contains unredacted PII."*
- Three-line pitch for slide decks
- Five-bullet compliance sheet for DPA attachments
- Prospect Q&A, detector list, deliberately-not-tokenized list

### Rollout posture

- Default ON via migration 031 (`DEFAULT TRUE` on `tenants.pii_tokenization_enabled`)
- Per-tenant toggle for BYOK opt-out if ever needed
- Global kill-switch env var: `PII_TOKENIZER_ENABLED=false`
- Fail-open on unknown tokens (Claude hallucinations don't crash)

### Testing

- `tests/tokenizer.test.js` — 42 unit tests, ~80ms, all green. Wired into `npm test` before the integration suite.
- CI server-test applies migration 031 to a fresh test DB — confirms schema change is clean.

### Austin's launch bar (unchanged)

> "I want strangers to be able to do the entire E2E setup and payment
> and dashboard features without any bugs or breaking."

### Remaining launch blockers (all human action, unchanged from Apr 18)

1. Stripe test mode on staging (~10 min in dashboard)
2. Live stranger walkthrough of SaaS signup flow
3. Live stranger walkthrough of self-hosted install on fresh VM
4. UptimeRobot signup (closes audit #14)

### New follow-ups from this session

1. Admin dashboard UI toggle for `pii_tokenization_enabled` (column exists, no UI)
2. Presidio NER sidecar for free-text names (beyond what `memory_file` hints cover)
3. Wire tokenizer into `portal.js:639` CSV import (admin path sends 3 customer sample rows to Claude for header-mapping — lower risk than chat but still a leak vector)
4. Update `docs/PRIVACY.md` §6.1 to mention live tokenization explicitly

### Audit findings scoreboard

**Unchanged at 8 open** — this session was orthogonal to the audit list. The PII story is a net-new win that didn't exist on the audit.

### Still-true things carried forward

- Hetzner backup cron runs 03:00 daily, log at `~/nomii-backup.log`
- Log rotation active (10MB × 5 = 50MB cap per container)
- Staging auto-refresh every 5 min via `nomii-staging-refresh.timer`
- Hetzner `.env` carries `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.override.yml`
- SaaS + on-prem byte-for-byte identical (both pull GHCR `:1.1.0`)

---

## Previous: 2026-04-18 afternoon (SaaS→GHCR cutover SHIPPED — v1.0.3 live on GHCR images)

Cutover done. Both PRs merged, tag cut, Hetzner fully migrated to GHCR-pull
deploy. Binary parity with on-prem customers achieved.

### Cutover log (executed in one SSH invocation, ~45s including pull+recreate)

```
=== Step 1: discard old local overrides (now in git)
     git checkout -- client/nginx.conf docker-compose.yml        [✓]
=== Step 2: add COMPOSE_FILE to .env                             [✓]
=== Step 3: remove duplicate APP_URL (app.pontensolutions.com)   [✓]
=== Step 4: git fetch + checkout v1.0.3                          [✓]
=== Step 5: pull GHCR images (backend + frontend @ 1.0.3)        [✓]
=== Step 6: recreate containers (db healthy, backend+frontend up) [✓]
=== Step 7: verify
     /api/health (internal):  {"status":"ok"...}                 [✓]
     /api/health (public):    {"status":"ok"...}                 [✓]
     nomii-backend image:     ghcr.io/jafools/nomii-backend:1.0.3 [✓]
     nomii-frontend image:    ghcr.io/jafools/nomii-frontend:1.0.3 [✓]
     git HEAD:                v1.0.3                              [✓]
     Bundle hash changed:     D1g5IfPw → DBJt-PRb (new image live) [✓]
```

No customer impact (Austin confirmed he had no customers during the
cutover, and the recreate is ~5s of backend downtime behind Cloudflare
anyway).

### Pre-flight that caught two things before they bit us

1. Ran `docker compose -f docker-compose.yml -f docker-compose.prod.override.yml config`
   on pontenprox against the merged files from main — parse OK, no YAML errors.
2. SSH'd to Hetzner before starting the cutover to capture pre-state.
   Discovered there was **no `git stash` entry** — Austin's overrides lived
   as uncommitted working-tree edits, not a stash. Adjusted the cutover to
   use `git checkout -- <files>` instead of `git stash drop`. Everything
   else went as documented.

### Artifacts shipped this session

| | |
|---|---|
| [PR #12](https://github.com/jafools/nomii-ai/pull/12) — merged earlier (overnight wrap) | Audit follow-ups #14 / #17 / #18 + client ESLint |
| [PR #13](https://github.com/jafools/nomii-ai/pull/13) — **MERGED** ([c633d95](https://github.com/jafools/nomii-ai/commit/c633d95)) | SaaS→GHCR. Findings #10 + #11 resolved. |
| [PR #14](https://github.com/jafools/nomii-ai/pull/14) — **MERGED** ([7afcc50](https://github.com/jafools/nomii-ai/commit/7afcc50)) | Launch-readiness audit: fixed `docs.pontensolutions.com/data-api` dead link, added `docs/DATA-API.md`, added `docs/LAUNCH-READINESS-2026-04-18.md` |
| **v1.0.3** tag | Pushed to GHCR (`:1.0.3`, `:1.0`, `:stable`, `:latest`), deployed to Hetzner, live |

### Austin's launch bar (still the guiding star)

> "I want strangers to be able to do the entire E2E setup and payment
> and dashboard features without any bugs or breaking."

### Remaining launch blockers (unchanged since morning — all human action)

See `docs/LAUNCH-READINESS-2026-04-18.md` for full doc. TL;DR:

1. **Stripe test mode on staging** (~10 min in Stripe dashboard) — #1 unblock
2. **Live stranger walkthrough of SaaS signup flow** — cold, no-coaching
3. **Live stranger walkthrough of self-hosted install** on a fresh VM

### New stuff to know after this cutover

- **`docker-compose.yml` on Hetzner** is now the clean-from-git version (no
  local edits). Future deploys: `git fetch --tags && git checkout vX.Y.Z &&
  IMAGE_TAG=X.Y.Z docker compose pull && docker compose up -d`. No stash.
- **`.env` on Hetzner** now has `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.override.yml`
  which causes docker compose to auto-layer the prod override file. Don't
  remove this line without also moving the overrides back into the base file.
- **`.env` duplicate `APP_URL` line cleaned up** — only `APP_URL=https://nomii.pontensolutions.com`
  remains. The old `app.pontensolutions.com` line was removed.
- **SaaS + on-prem now run byte-for-byte identical images** — both pull
  `ghcr.io/jafools/nomii-backend:1.0.3`. If a bug exists in one, it exists
  in the other; confirmed via `docker inspect` post-cutover.

### Audit findings scoreboard

**After this session:** 8 → still 8 open (cutover just proved the fixes
work, didn't resolve new findings).

- **LOW (4):** #7, #14 (UptimeRobot signup pending), #15, #16
- **INFO (3):** #19, #20, #22
- **MEDIUM (1):** #5 knomi DB branding drift

### Next session priorities

1. **Stripe test mode config** — see `docs/LAUNCH-READINESS-2026-04-18.md` §1
2. **Live stranger walkthrough** — no substitute
3. **UptimeRobot signup** — 5 min, closes #14

### Still-true things carried forward

- Hetzner backup cron runs 03:00 daily, log at `~/nomii-backup.log`
- Log rotation active (10MB × 5 = 50MB cap per container)
- `10.0.100.25` disposable VM has boosted login/widget rate limits — harmless
- pontenprox socat bridge to `10.0.100.25:80` still running; kill with
  `pkill -f "socat TCP-LISTEN:3001"` when no longer needed

---

## Previous: 2026-04-18 morning (SaaS→GHCR cutover PR + launch-readiness audit)

Austin stepped away mid-session. Two PRs left open for his review when he
returns — he has the final call on when to merge + cut the next tag.

### Artifacts shipped this session

| | |
|---|---|
| [PR #12](https://github.com/jafools/nomii-ai/pull/12) — merged overnight | Audit follow-ups #14 (MONITORING.md), #17/#18 (API-CONVENTIONS.md), client ESLint config wired into CI |
| [PR #13](https://github.com/jafools/nomii-ai/pull/13) — **OPEN, all CI green** | SaaS flips from `build: ./server` to `image: ghcr.io/jafools/nomii-{backend,frontend}:${IMAGE_TAG:-stable}`. Resolves Findings #10 + #11. Committed `docker-compose.prod.override.yml` + `config/nginx/prod.conf` so Hetzner's uncommitted overrides finally live in git. Deploy is now `pull + up -d`, not `--build`. |
| [PR #14](https://github.com/jafools/nomii-ai/pull/14) — **OPEN, CI running** | Launch-readiness audit: fixes one real customer-facing dead link (`docs.pontensolutions.com/data-api` — DNS doesn't resolve), adds `docs/DATA-API.md` reference, adds `docs/LAUNCH-READINESS-2026-04-18.md` with the go-to-market blocker list. |

### Austin's launch bar (captured from this session)

> "I want strangers to be able to do the entire E2E setup and payment and
> dashboard features without any bugs or breaking."

Translated: SaaS-signup → verify → onboarding → dashboard → payment flow
must work cold for a human who has never seen the product. Plus the
self-hosted install.sh → setup wizard → onboarding flow.

### Remaining launch blockers (human action only)

See `docs/LAUNCH-READINESS-2026-04-18.md` for the full doc. TL;DR:

1. **Stripe test mode on staging** (~10 min in Stripe dashboard). #1 unblock.
2. **Live stranger walkthrough of SaaS signup flow** — nothing substitutes.
3. **Live stranger walkthrough of self-hosted install** on a fresh VM.

Everything else is polish (UptimeRobot, off-host backups, Playwright in CI,
portal.js split, published docs site).

### Hetzner first-time cutover (one-time, after PR #13 merges + tag cut)

Required the first time PR #13's new compose layout hits Hetzner. Once:

```bash
ssh nomii@204.168.232.24
cd ~/nomii-ai
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.override.yml' >> .env
git fetch --tags
git checkout vX.Y.Z              # whatever tag has PR #13
git stash drop                   # throw out the old stashed overrides — in git now
IMAGE_TAG=X.Y.Z docker compose pull backend frontend
IMAGE_TAG=X.Y.Z docker compose up -d backend frontend
curl -s http://127.0.0.1:3001/api/health
docker inspect nomii-backend --format '{{.Config.Image}}'
#   → ghcr.io/jafools/nomii-backend:X.Y.Z
```

After this cutover, all future deploys use the simpler `pull + up -d` form
(documented at the new `docs/RELEASING.md`).

### Next session priorities

1. Merge PR #13 + cut v1.0.3 tag + do the Hetzner cutover above. Verify
   `docker inspect nomii-backend` shows the GHCR image ref.
2. Merge PR #14 (docs-only except for one JSX line — low risk).
3. Set up Stripe test keys on staging. See `docs/LAUNCH-READINESS-2026-04-18.md`
   §1 for step-by-step.
4. Schedule the stranger walkthrough.

### Still-true things carried forward

- Hetzner backup cron runs 03:00 daily, log at `~/nomii-backup.log`.
- Log rotation active (10MB × 5 = 50MB cap per container).
- `10.0.100.25` disposable VM has boosted login/widget rate limits — harmless to leave.
- pontenprox socat bridge to `10.0.100.25:80` still running; kill with
  `pkill -f "socat TCP-LISTEN:3001"` when no longer needed.
- Hetzner `.env` currently has TWO `APP_URL` lines (`nomii.pontensolutions.com`
  AND `app.pontensolutions.com`). Last-one-wins = `app.` which is wrong but
  the client never actually hits that URL in production (same-origin fetches).
  **Clean up in the Hetzner cutover** — edit `.env` to have just
  `APP_URL=https://nomii.pontensolutions.com`.

### Open audit findings after this session

Down to **8 remaining** (out of 25 originally):

- **MEDIUM (1):** #5 knomi DB branding drift
- **LOW (4):** #7 migration 015b naming, #14 uptime (external signup pending),
  #15 CI DB name alignment, #16 `:latest` pinning
- **INFO (3):** #19, #20, #22 — positive observations

Once UptimeRobot signup happens, down to 7.

---

## Previous: 2026-04-17 late night (bedtime wrap — audit followups #14 / #17 / #18 + client ESLint)

One last short session before bed. Closed out three audit findings with
docs + a working client-side ESLint config + CI lint step re-enabled.

### Artifacts shipped this session

| | |
|---|---|
| [`docs/MONITORING.md`](MONITORING.md) | Finding #14 — UptimeRobot setup recipe for `https://nomii.pontensolutions.com/api/health` + optional pontenprox fallback template. Actual account creation is an Austin task (external signup). |
| [`docs/API-CONVENTIONS.md`](API-CONVENTIONS.md) | Findings #17 + #18 — snake_case chosen as the go-forward convention, three `/login` endpoints documented with their distinct user populations (customers+advisors / tenant_admins / platform_admins), JWT payload shapes, and why we're keeping them separate. |
| `client/eslint.config.js` + `ci.yml` `Lint client` step | Flat ESLint 9 config tuned for the existing loose TS setup. Currently 0 errors / 10 warnings — warnings are allowed, errors fail CI. |
| `docs/AUDIT-2026-04-17.md` | Summary table updated: #14 → DOCUMENTED, #17 + #18 → RESOLVED. |

### Open findings after this session (9 remaining, down from 12)

- **MEDIUM (3):** #5 knomi DB branding drift, #10 Hetzner uncommitted overrides, #11 SaaS-source vs on-prem-GHCR build strategy
- **LOW (4):** #7 migration 015b naming, #14 uptime (pending external signup), #15 CI DB name alignment, #16 `:latest` pinning
- **INFO (3):** #19, #20, #22 — positive observations, no action

### Next session — priority order

1. **Spend 5 minutes on UptimeRobot signup** — instructions in `docs/MONITORING.md`. Closes #14 for real. External account + 2 monitors.
2. **#11 SaaS/on-prem build strategy** is the highest-value remaining finding — it's the last architectural loose end.
3. **Off-host backup destination for Hetzner** — still deferred. `rsync` to a Hetzner Storage Box (~EUR 4/mo for 1TB).
4. Wire Playwright into CI whenever the manual pontenprox setup becomes annoying.

### Still-true things carried forward from previous session

- Hetzner backup cron runs 03:00 daily, log at `~/nomii-backup.log`.
- Log rotation active on all three compose files (10MB × 5 files = 50MB cap per container).
- `10.0.100.25` disposable VM has boosted login/widget rate limits for E2E batches (harmless to leave).
- pontenprox socat bridge to `10.0.100.25:80` still running; kill with `pkill -f "socat TCP-LISTEN:3001"` when no longer needed.

---

## Previous: 2026-04-17 evening (audit sweep → v1.0.1 patch → full Playwright E2E 35/35)

Full 3-layer audit of both SaaS and on-prem Shenmay, followed by shipping the first
real bug-fix release through the new release flow end-to-end, followed by
5x stress runs of the install/signup flows, a real live Claude chat through
the whole backend chain, and the first full green run of the 35-test Playwright
suite against v1.0.1 code.

### Artifacts shipped this session

| | |
|---|---|
| [`docs/AUDIT-2026-04-17.md`](AUDIT-2026-04-17.md) | 25 findings across 3 layers (static / operational / E2E), 12 resolved this session |
| [`scripts/hetzner-backup.sh`](../scripts/hetzner-backup.sh) + cron | Daily pg_dump on Hetzner prod, 14-day retention, running since 12:32 UTC |
| [PR #7](https://github.com/jafools/nomii-ai/pull/7) — merged → **v1.0.1** | 9 findings fixed: fail-fast secrets in SaaS compose, log rotation, update.sh rewrite, `DEPLOYMENT.md` deleted, migrate.sh DB defaults, testing.md paths, CI `selfhosted-smoke` job, RELEASING.md migration-failure runbook, `tos_accepted` error shape |
| [PR #8](https://github.com/jafools/nomii-ai/pull/8) | Playwright tests now tolerant of rate-limit UX + documents 3 new findings |
| [PR #10](https://github.com/jafools/nomii-ai/pull/10) | Finding #23 resolved — `REGISTER_RATE_LIMIT_MAX` env override in backend + both compose files |
| **v1.0.1** tag | Pushed to GHCR (`:stable`, `:latest`, `:v1.0.1`, `:1.0`) + deployed to Hetzner |
| **v1.0.2** tag | Pushed to GHCR + deployed to Hetzner ~13:55 UTC. Proved the full release flow works twice in one day. |

### Release flow exercised end-to-end for the first time

```
branch → PR #7 → CI green → squash-merge → :edge rebuild → staging auto-refresh
      → git tag v1.0.1 → docker-publish rebuilds :stable/:latest → Hetzner SSH deploy → healthy
```

~4 seconds of perceived downtime on the SaaS backend recreate. Zero customer
impact.

### E2E verification done

| Flow | Result |
|---|---|
| Upgrade test on 10.0.100.25 (pre-release `:latest` → v1.0.0) | ✅ PASS — data preserved, 4s downtime |
| Fresh install x5 | ✅ 5/5 pass, 21s median |
| SaaS staging signup x5 | ✅ 3/5 (iters 4-5 hit register rate limit — correct product behaviour) |
| Real Claude chat with context retention (BYOK key) | ✅ 2-turn convo, DB-persisted |
| Widget iframe embed on simulated customer site | ✅ iframe + React UI render correctly |
| Full Playwright suite (35 tests) | ✅ 35/35 in 40s |

### Things to know for next session

- **10.0.100.25** (disposable test VM) has `LOGIN_RATE_LIMIT_MAX=200` and `WIDGET_SESSION_RATE_LIMIT_MAX=200` in `.env` to allow batched E2E runs. Harmless to leave.
- **pontenprox** (`/root/Knomi/knomi-ai`) has Playwright working. The test-env trick: start a local Vite dev on :5173 with `VITE_API_BASE_URL=http://10.0.100.25`, then run `socat TCP-LISTEN:3001,fork,reuseaddr TCP:10.0.100.25:80` to satisfy the tests' `API_BASE=localhost:3001` assumption. The socat process is still running — kill with `pkill -f "socat TCP-LISTEN:3001"` when no longer needed.
- **server/.env** on pontenprox was updated with `TEST_ADMIN_EMAIL=tier2@example.test` + `TEST_ADMIN_PASSWORD=tier2-password-12345` to match the VM's admin. Not in git — restore to ajaces@gmail.com creds if running tests against a different target.
- **Hetzner `nomii-backup.log`** is the thing to watch if backups ever stop.
- **Open findings (12 remaining)**: #5, #10, #11, #17, #23 MEDIUM; #7, #14, #15, #18 LOW; #16 LOW/INFO; #19, #20, #22 INFO-only. See audit doc summary table. #23 is the highest-value remaining item — adding `REGISTER_RATE_LIMIT_MAX` env override in backend would fix multiple rate-limit-related test fragility.

### Next session

1. If anything is broken, check `docker compose logs backend` on Hetzner — log rotation is now active, so logs are capped at 50MB.
2. Consider adding an **off-host backup destination** for Hetzner (rsync to a second VPS / Hetzner Storage Box) — local backups don't survive VM-destroy.
3. The 11 open audit findings sorted by value: #23 register rate-limit env > #11 SaaS/on-prem build strategy > #17 API naming convention > rest.
4. If you want to run the Playwright suite regularly, **wire it into CI** (deferred finding from audit) instead of relying on the pontenprox-hosted manual setup.

---

## Previous: 2026-04-17 afternoon (session wrap — full release infrastructure shipped)

Single-session build-out of Shenmay's release infrastructure end-to-end. Five PRs merged, v1.0.0 cut, staging environment live with auto-refresh, full flow documented at the top of CLAUDE.md.

### What's live now

| | URL | Image tag | Host |
|---|---|---|---|
| **Staging** | https://nomii-staging.pontensolutions.com | `:edge` (auto-refresh every 5 min) | Proxmox (`ssh pontenprox`) |
| **Prod SaaS** | https://nomii.pontensolutions.com | built from git tag `v1.0.0` | Hetzner (`ssh nomii@204.168.232.24`) |
| **Prod on-prem** | customer hardware | `:stable` from GHCR (currently v1.0.0 content) | customer servers |

### Shipping flow (now enforced)

```
branch → PR → CI green → squash-merge to main
                │
                ▼
      GHCR rebuilds :edge → systemd timer on Proxmox auto-pulls within 5 min
                │
                ▼
    preview at https://nomii-staging.pontensolutions.com
                │
                ▼ happy?
        git tag vX.Y.Z && git push origin vX.Y.Z
                │
                ▼
    GHCR rebuilds :vX.Y.Z + :stable + :latest   (on-prem customers)
                │
                ▼
    ssh nomii@204.168.232.24  + check out tag + rebuild   (SaaS)
```

Full procedure: `docs/RELEASING.md`. TL;DR at the top of `CLAUDE.md`.

### 5 PRs merged this session

1. [#1](https://github.com/jafools/nomii-ai/pull/1) — release flow + branch protection (CI, GHCR retagging, branch protection, repo settings)
2. [#2](https://github.com/jafools/nomii-ai/pull/2) — post-release cleanup (workflow tag-leak fix, docker image tag convention docs)
3. [#3](https://github.com/jafools/nomii-ai/pull/3) — staging environment docs
4. [#4](https://github.com/jafools/nomii-ai/pull/4) — staging timer + SSH alias rename (`nomii-prod` → `pontenprox`)
5. [#5](https://github.com/jafools/nomii-ai/pull/5) — shipping flow TL;DR promoted to top of CLAUDE.md

### Infrastructure state

- **Hetzner**: `v1.0.0` deployed. Health green. Unchanged since this morning's v1.0.0 cutover.
- **Proxmox**: old Shenmay fallback retired (DB backup at `/root/backups/knomi_ai_proxmox_final_20260417_131426.sql`). Fresh staging stack at `/root/nomii-staging/`. Lateris + `nomii-cloudflared` untouched. Systemd timer `nomii-staging-refresh.timer` polling GHCR every 5 min.
- **GHCR**: `ghcr.io/jafools/nomii-{backend,frontend}` with `:edge` (main-push), `:1.0.0`, `:1.0`, `:stable`, `:latest`.
- **Cloudflare tunnel `knomi-ai`**: stale pre-Hetzner routes deleted by Austin. New `nomii-staging.pontensolutions.com` → `http://nomii-frontend-staging:80` added.
- **Branch protection**: main requires PR + green CI (`client-build`, `server-test`). Squash-merge only. Auto-delete branch on merge.

### Open follow-ups (carry forward)

- **Manual QA flows** — the whole reason the release infra was built: SaaS signup → email verify → login → onboarding → dashboard → widget; self-hosted install.sh → setup wizard → widget. **Now safe to test against staging first.** Austin deferred to the next session.
- **`client/eslint.config.js`** missing → CI lint step skipped. Add when ready to enforce.
- **Client vitest tests** don't exist → CI client test step skipped. Add when first frontend test is worth writing.
- **`portal.js` split** (3,683 LOC) — still deferred.
- **Delete 1,646 LOC pre-portal zombie routes** — still deferred (7-day prod log grep needed).
- **Stripe test-mode + test SMTP on staging** — left unset; billing + email features no-op on staging. Add test-mode keys when needed.

### Gotchas worth remembering

- **Git Bash on Windows rewrites `gh api /repos/...`** into a filesystem path. Use `gh api repos/...` (no leading slash).
- **`gh api -f key=false`** sends the string `"false"`. Use `-F` for booleans.
- **`docker/metadata-action` drops the `v` prefix** on SemVer tags. Git tag `v1.2.3` → docker image `1.2.3`.
- **Cloudflare Tunnel "Subdomain" field** rejects dots in the newer Zero Trust UI (single-label subdomains only). That's why staging is `nomii-staging.pontensolutions.com`, not `staging.nomii.pontensolutions.com`.
- **Cloudflare Tunnel "Service URL" field** requires a protocol prefix (`http://` or `https://`).
- **Proxmox LAN IP `10.0.100.2`** is not reachable from GH Actions — so push-based deploy from CI doesn't work. Use pull-based (the systemd timer we set up).
- **Shared docker network on Proxmox is `knomi-ai_default`** (pre-rename). Renaming requires stopping `nomii-cloudflared` which also serves Lateris — left as tech debt.

### Next session

1. Start QA run using staging: sign up fresh, go through onboarding, widget chat, billing flow (once test-mode Stripe added).
2. Mirror the self-hosted flow: `install.sh` on a fresh Ubuntu VM + setup wizard → widget.
3. After QA passes, retire is complete: consider this milestone shipped and close out.

---

## Previous: 2026-04-17 morning (release-flow + branch protection — SHIPPED, v1.0.0 live)

Flipped Shenmay from "push to main = ship to customers" to a tagged-release model.
Main is now a protected branch. CI must pass before merge. Customer-facing
images (`:stable`, `:latest`) only rebuild on `git tag vX.Y.Z`.

### What shipped (branch `chore/release-flow-and-branch-protection`, PR [#1](https://github.com/jafools/nomii-ai/pull/1))

- **New**: `.github/workflows/ci.yml` — client build + server integration tests (Postgres service container). Client lint is currently skipped (no `eslint.config.js` — separate issue).
- **Rewrote**: `.github/workflows/docker-publish.yml` — main push now builds `:edge` only. Tagged release (`v*`) builds `:vX.Y.Z` + `:vX.Y` + `:stable` + `:latest`.
- **Pinned**: `docker-compose.selfhosted.yml` images now use `:stable` (was `:latest`). Customers only receive updates on a deliberate release.
- **Updated**: `scripts/install.sh` — defaults to the latest tagged release via the GitHub API (falls back to `main` if no tags exist).
- **New**: `docs/RELEASING.md` — full release procedure (day-to-day flow, cutting releases, hotfixes, rollback).
- **Updated**: `CLAUDE.md` — flipped the "always work on main" rule; documented the new branching + release model.

### Repo settings applied via `gh api` (not in the PR itself)

- Branch protection on `main`: required status checks (`client-build`, `server-test`), PR required (0 approvals), no force-push, no deletion, linear history, admins NOT enforced (solo-dev escape hatch).
- Merge settings: squash-merge only (`allow_merge_commit=false`, `allow_rebase_merge=false`), `delete_branch_on_merge=true`, `allow_update_branch=true`.

### Current state of prod (v1.0.0 is live on both SaaS and GHCR)

- **Hetzner SaaS**: on `v1.0.0` (commit `53cda5b`). `git describe --tags` returns `v1.0.0`. Public health check 200, internal health check `{"status":"ok"}`, migrations clean, DB connected.
- **GHCR (on-prem distribution)**: `:1.0.0`, `:1.0`, `:stable`, `:latest` all rebuilt for both `nomii-backend` and `nomii-frontend`. Customers pulling `:stable` will now receive v1.0.0's code.
- **Flow dogfooded end-to-end**: PR #1 merged via squash, branch auto-deleted, `:edge` rebuilt on main push, `:stable`/`:latest` rebuilt on tag push, SaaS deployed from the tag.

### Next session

1. **Austin's manual testing** (deferred from last session):
   - SaaS flow: signup → email verify → login → onboarding → dashboard → widget chat
   - Self-hosted flow: install.sh → setup wizard → onboarding → dashboard → widget
2. After testing: retire Proxmox Shenmay containers (`docker compose stop backend frontend db` — leave cloudflared for Lateris).
3. Optional: add `client/eslint.config.js` + re-enable lint step in CI.
4. Optional: add a first vitest smoke test + re-enable the client test step.

### Known follow-ups

- `client/` has ESLint 9 deps but no flat config — lint step skipped in CI with a TODO.
- `docker-compose.selfhosted.yml` still has `knomi_ai`/`knomi` DB user/name (pre-rename) — the live Hetzner compose uses `nomii`. Cosmetic for fresh on-prem installs but worth fixing in a future PR.
- `portal.js` split (3,683 LOC) — still deferred.
- Delete 1,646 LOC pre-portal zombie routes (after 7-day prod log grep).

### How to work from now on

```bash
# New feature
git checkout main && git pull
git checkout -b feat/my-thing
# ... commit ...
git push -u origin feat/my-thing
gh pr create
# wait for CI green, then merge via GitHub UI or `gh pr merge --squash`

# Release
git checkout main && git pull
git tag v1.2.3
git push origin v1.2.3
# wait for docker-publish workflow to go green
# then SSH Hetzner, checkout v1.2.3, rebuild
```

See `docs/RELEASING.md` for the full procedure.

---

## Previous: 2026-04-16 late-evening (pre-test targeted cleanup — deployed to Hetzner)

Targeted cleanup before Austin's manual testing of both SaaS and self-hosted flows.

### What shipped (commit `4820b6c`, deployed)

**Critical: managed_ai_enabled SQL fix (5 queries)**
- Column `managed_ai_enabled` lives on `subscriptions`, NOT `tenants`
- 5 queries were reading `t.managed_ai_enabled` — hard PostgreSQL crash
- Fixed: `widget.js:1284` (greeting), `portal.js:3106` (summarize), `portal.js:3483` (tool test), `memoryUpdater.js:581`, `chat.js:32`
- Each now JOINs `subscriptions s ON s.tenant_id = t.id`

**Onboarding step key standardized**
- `widget.js:1381` was setting `{"widget": true}`, setup.js uses `install_widget`
- Standardized to `install_widget` everywhere

**Stripe checkout URLs dynamic**
- `license-checkout.js` now uses `process.env.APP_URL` instead of hardcoded domain

**Stale URL defaults fixed**
- `emailService.js`, `notificationService.js`, `licenseService.js` — all default to `nomii.pontensolutions.com`
- Removed legacy `app.pontensolutions.com` from CORS allowlist
- `docker-compose.yml` FRONTEND_URL default updated

**CLAUDE.md updated** (commit `cfd10c0`)
- Replaced stale Proxmox VPS section with Hetzner deploy workflow
- Documented `git stash/pull/pop` pattern (Hetzner has local docker-compose overrides)

### Prod state
- Hetzner: `4820b6c` deployed, health check passing
- Proxmox: still running (cloudflared serves Lateris — do NOT stop)

### Next session: Austin's manual testing
1. **SaaS flow**: signup → email verify → login → onboarding (6 steps) → dashboard → widget chat
2. **Self-hosted flow**: install.sh → setup wizard → onboarding (widget step) → dashboard → widget chat
3. After testing: retire Proxmox Shenmay containers (`docker compose stop backend frontend db` — leave cloudflared)

### Still deferred (not blocking)
- `portal.js` split (3,683 LOC)
- Delete 1,646 LOC of pre-portal zombie routes (after 7-day prod log grep)
- Customer-facing self-hosted Getting Started guide
- Update README.md (still references Covenant Trust)

---

## Previous: 2026-04-16 afternoon (Hetzner VPS migration — COMPLETE)

Full production migration from Proxmox VM to Hetzner Cloud Helsinki. Zero downtime. All endpoints verified.

### What shipped

**Hetzner VPS provisioned and running**
- Server: `nomii-prod` — CPX22, Helsinki (hel1), `204.168.232.24`
- Cost: EUR 12.61/mo (server EUR 9.99 + backups EUR 2.00 + IPv4 EUR 0.63)
- OS: Ubuntu 24.04, Docker 29.4.0
- SSH: `ssh nomii@204.168.232.24` (root disabled, password auth disabled, key-only)

**Database migrated with clean naming**
- DB user: `nomii` (finally! no more `knomi`)
- DB name: `nomii_ai`
- Data: 34 tenants, 33 admins, 34 subscriptions, 100 messages, 1 license — all migrated via `pg_dump --no-owner`
- `API_KEY_ENCRYPTION_SECRET` carried over from Proxmox (encrypted API keys in DB still valid)

**DNS cutover — no tunnel, direct A records**
- `nomii.pontensolutions.com` → A `204.168.232.24` (Proxied)
- `api.pontensolutions.com` → A `204.168.232.24` (Proxied)
- `app.pontensolutions.com` → A `204.168.232.24` (Proxied)
- Lateris records (`lateris`, `dev-lateris`) still on Cloudflare tunnel → Proxmox (untouched)

**Full end-to-end SSL**
- Cloudflare Origin CA certificate installed (valid until 2041-04-12)
- SSL mode: **Full (Strict)** — Browser → HTTPS → Cloudflare → HTTPS → Origin
- Certificate covers `*.pontensolutions.com` + `pontensolutions.com`

**Security hardening**
- UFW firewall: SSH (22), HTTP (80), HTTPS (443) only
- fail2ban running
- Backend port 3001 bound to `127.0.0.1` only (not externally accessible)
- Database port 5432 internal to Docker only
- No server fingerprint leaked (shows "cloudflare" only)
- CORS locked to `nomii.pontensolutions.com`

**Repo cleanup (pre-migration)**
- Removed 8 garbage untracked files from repo root
- Fixed `migrate.sh` DB user default from `knomi` → `nomii`
- Added `.claude-flow/swarm/` to `.gitignore`

### Smoke test results (all passing)

| Endpoint | Result |
|---|---|
| `nomii.pontensolutions.com/api/health` | `{"status":"ok"}` |
| `api.pontensolutions.com/api/health` | `{"status":"ok"}` |
| `app.pontensolutions.com` | 301 redirect (expected) |
| `/widget.html` | 200 |
| `/embed.js` | 200 |
| `/api/license/validate` | 403 "License key not found" (correct) |
| `/api/auth/login` (bad creds) | 401 (auth working) |
| `/api/config` | SaaS mode, all features enabled |
| Stripe checkout | Live `checkout.stripe.com` URL returned |
| Response time | 83ms (nomii), 126ms (api) |
| Backend logs | Zero errors |

### What Austin still needs to manually test

1. **Log in** at `nomii.pontensolutions.com/nomii/login`
2. **Dashboard loads** with tenant data
3. **Widget chat** works (tests Anthropic API key decryption)
4. **Plans & Billing** page renders

### What's left (not blocking)

1. **Retire Proxmox Shenmay containers** — keep for 7 days as fallback:
   ```bash
   ssh nomii-prod "cd ~/Knomi/knomi-ai && docker compose stop nomii-backend nomii-frontend"
   # After 7 days: docker compose down (removes DB volume)
   ```
2. **Remove cloudflared from Hetzner docker-compose** — not running, but the service definition is still in the file
3. **Commit the nginx.conf SSL changes** — currently only on Hetzner, not in git
4. **Clean up `/tmp/nomii_dump.sql`** on both Hetzner and local machine
5. **Update `~/.ssh/config`** — add `nomii-hetzner` alias for the new server

### VPS provider research (for reference)

| Provider | DC | Price | Notes |
|---|---|---|---|
| **Hetzner (chosen)** | Helsinki | EUR 12.61/mo | Best value, sub-10ms from Sweden |
| Contabo | Stockholm | EUR 4.50/mo | Cheapest but mixed reputation |
| Vultr | Stockholm | $24/mo | 5x price for same spec |
| DigitalOcean | Amsterdam | $24/mo | No Nordic DC |
| OVHcloud | Stockholm | EUR 10-14/mo | Mixed support |
| UpCloud | Helsinki | EUR 26/mo | Finnish, priciest |

### Infrastructure state

| Component | Location | Status |
|---|---|---|
| Shenmay backend | Hetzner Helsinki | Running ✅ |
| Shenmay frontend | Hetzner Helsinki | Running ✅ |
| Shenmay DB (`nomii`/`nomii_ai`) | Hetzner Helsinki | Healthy ✅ |
| Shenmay (Proxmox) | Proxmox VM | Still running (fallback, retire in 7 days) |
| Lateris | Proxmox VM | Untouched, still on tunnel |
| Cloudflare tunnel | Proxmox | Still active for Lateris only |

### Key files on Hetzner

| Path | Purpose |
|---|---|
| `~/nomii-ai/` | Git clone of repo |
| `~/nomii-ai/.env` | Production env (nomii DB user) |
| `~/nomii-ai/docker-compose.yml` | Modified: backend on 127.0.0.1:3001, frontend on 80+443 |
| `~/nomii-ai/client/nginx.conf` | Modified: added HTTPS server block with Origin CA cert |
| `/etc/ssl/cloudflare/origin.pem` | Cloudflare Origin CA cert (expires 2041) |
| `/etc/ssl/cloudflare/origin.key` | Private key (chmod 600) |

### Migration runbook

Saved to Obsidian vault: `projects/nomii/hetzner-migration-runbook.md`

---

## Previous: 2026-04-16 morning (full launch QA + unified license portal + buy page overhaul)

### What shipped (nomii-ai repo)

**Commit `9685343`** — Portal license lookup endpoint
- New `POST /api/public/portal/licenses` at `server/src/routes/public-portal.js`
- Accepts portal session token, verifies via Cloudflare Worker proxy, returns Shenmay licenses for the authenticated email
- Gated by `NOMII_LICENSE_MASTER=true`, rate-limited 10 req/min
- Deployed to prod via `docker compose up -d --build backend`

### What shipped (ponten-solutions repo — 3 commits)

**Commit `e7d1eb2`** — Badge clipping fix + self-hosted nav
- Removed `overflow-hidden` from Cloud card and Growth pricing card (badges were clipped)
- Added `rounded-t-2xl` to Growth card decorative header to preserve corner clipping
- Wrapped `SelfHostedNomii.tsx` in `<Layout>` for Navbar + Footer
- Added `/nomii/self-hosted` to Navbar product-page check

**Commit `2beb197`** — Unified license portal + Buy page CTA
- Portal fetches Shenmay licenses alongside Lateris, displays grouped by product
- New `NomiiLicenseCard` component (shows plan, status, key, instance_id)
- `portalApi.ts`: `getNomiiLicenses()` function + `NomiiLicenseRecord` type
- Login branding updated to product-neutral (both product icons)
- Buy page CTA updated (was pointing to product explainer)

**Commit `38b129a`** — Combined Cloud + Self-Hosted pricing page
- Cloud/Self-Hosted deploy mode toggle on `/nomii/license`
- Cloud mode: SaaS pricing tiers with "Start Free Trial" → signup
- Self-Hosted mode: existing Stripe checkout pricing (unchanged)
- Bottom CTA dynamically offers the other deploy mode
- Buy overview CTA now links directly to `/nomii/license`

### Launch readiness verified

| Touchpoint | Status |
|---|---|
| Marketing page "Two Ways to Run Shenmay" | Live ✅ |
| Self-hosted landing page + nav | Live ✅ |
| SaaS signup page | ✅ |
| Login page | ✅ |
| License pricing (Cloud + Self-Hosted) | Live ✅ |
| Stripe checkout (live mode) | ✅ |
| License validate (master) | ✅ |
| Widget embed.js + widget.html | ✅ |
| Backend /api/health | ✅ |
| Install script (GitHub raw) | ✅ |
| Client build | Passes ✅ |
| Server syntax | All files clean ✅ |
| Stripe receipts | Already enabled ✅ |
| SMTP_PASS | Not leaked externally ✅ |

### Manual items resolved
- Stripe receipt emails — already toggled on
- SMTP_PASS — only visible in Claude session, not leaked externally
- GitHub PAT — low priority, deferred (scoped to one repo, only root has access)

### Next session: Hetzner VPS port

Austin wants to do the VPS migration in a fresh session. Steps:
1. Provision Hetzner CX22 + SSH keys
2. Harden server (ufw, fail2ban, non-root user)
3. Install Docker + clone repo
4. Copy `.env` + adjust secrets
5. `pg_dump` from Proxmox → `pg_restore` on Hetzner
6. `docker compose up -d`
7. New Cloudflare tunnel token → point to Hetzner
8. Smoke test all endpoints
9. DNS cutover (Cloudflare tunnel swap)
10. Verify + retire Proxmox Shenmay containers

Estimated: 1-2 hours. No code changes needed — same docker-compose.yml works anywhere.

### Still deferred (not blocking launch)
- portal.js split (3,683 LOC) — post-first-customer
- Delete zombie pre-portal routes (1,646 LOC) — needs 7-day prod log grep
- Stale success card at `pontensolutions.com/nomii/license?success=true` — orphaned, nothing links to it

### Prod HEAD state
- `nomii-ai`: `9685343` (deployed to Proxmox)
- `ponten-solutions`: `38b129a` (published via Lovable)

---

## Previous: 2026-04-15 late-evening (marketing-page buyer-journey fork — Cloud vs Self-Hosted)

Shipped Austin's explicit ask from the previous session: a clear two-path fork on the Shenmay product page so visitors immediately see both deployment options. Work was done in the `ponten-solutions` repo (not this one), committed directly on the Proxmox VM at `~/ponten-solutions`, pushed to `origin/main`, Lovable auto-redeploys.

### What shipped (ponten-solutions commit `2086711`)

New **"Two Ways to Run Shenmay"** section inserted between the hero and "The Challenge" section on `/products/nomii-ai`. Two equal-weight cards:

- **Shenmay Cloud** (★ FASTEST TO START badge) → `https://nomii.pontensolutions.com/nomii/signup` — "We run it. You focus on your customers." 5-min signup, fully managed, auto-updates, 14-day trial, from $49/mo.
- **Shenmay Self-Hosted** (accent color `#C9A84C` to match SelfHostedNomii.tsx) → `/nomii/self-hosted` — "You run it. Data stays on your own infrastructure." One-line install, data stays on your network, BYO Anthropic key, free trial, from $49/mo.
- **"Not sure which fits?"** → `/contact` (Book a 20-minute chat).

Design follows existing patterns in the file: `card-glass`, `FadeIn`, `section-padding`/`section-container`, eyebrow label + gradient-text headline. Cloud card gets the same visual priority treatment as the "MOST POPULAR" Growth plan card in the pricing section (primary-color border + glow). Self-Hosted card uses the gold accent from SelfHostedNomii.tsx for cohesion across the on-prem flow.

### Drive-by cleanups in the same commit

- **5x `app.pontensolutions.com/nomii/signup` → `nomii.pontensolutions.com/nomii/signup`** (hero CTA, 3 pricing cards, closing CTA). Skips the `app.` → `nomii.` redirect hop and survives eventual retirement of the `app.` subdomain.
- **Reframed "Need total control?" row** (line ~960 of NomiiAI.tsx) into "Enterprise & regulated industries" — since the new section now owns the self-hosted fork, this row is now pitched for SLA/BAA/volume-pricing conversations on either deployment. CTA text changed from "Buy a License" → "Self-Hosted Plans".
- Added `Cloud, Server` icons to the lucide-react import list.

### What was NOT touched

Hero, Challenge, Architecture (Soul/Memory), Anonymous Widget, Use Cases, Business, Features, Who It's For, 3 SaaS pricing cards (Starter/Growth/Professional), Data Model row, Closing CTA. Non-destructive addition + targeted tweaks only.

### Verification

- Local TSX syntax check via `npx esbuild` on the VM — PARSE OK (no type errors)
- `git diff --stat`: +120/−10 in a single file
- `git push origin main`: `ec6a63f..2086711 main -> main` — confirmed via `git ls-remote` that GitHub main HEAD is `2086711`.

### 🔑 New gotcha discovered: Lovable does NOT auto-publish on GitHub pushes

After the push landed, the deployed bundle (`/assets/index-D8j9QHlx.js`) still served pre-Apr-14 content:

| Commit | String signature | In deployed bundle? |
|---|---|---|
| `2086711` (today, mine) | "Two Ways to Run Shenmay" | ❌ 0 |
| `ec6a63f` (Apr 14) | "Run Shenmay AI on your own" | ❌ 0 |
| `bfbbbf3` (Apr 14) | "Buy a License" | ❌ 0 |
| pre-`bfbbbf3` | "Need total control" | ✅ 1 |

At first I thought the Vercel auto-deploy was broken. It wasn't. Austin showed me a screenshot of his Lovable UI: **my commit WAS synced into Lovable's version history, Lovable just hadn't published it to production.** Lovable's GitHub integration syncs commits to version history automatically, but the live URL stays on whatever the last *published* build was. Austin has to click **Publish** in Lovable manually.

**Consequence for future marketing-page work in `ponten-solutions`:**
- `git push origin main` is step 1 of 2, not the whole shipping process.
- Step 2 is: Austin clicks Publish in Lovable.
- Don't mark a marketing-page task complete until Austin confirms "published" and a curl-grep of the deployed bundle shows the new content.
- The Apr 14 handoff note ("Austin must have applied it between sessions … `/nomii/self-hosted` returning HTTP 200") was also misleading — HTTP 200 just means the SPA shell loaded. The `SelfHostedNomii` component likely wasn't in the live bundle until Austin clicked Publish. Any prior session that claimed "deployed" without a bundle-grep verification is suspect.

**Hosting layer (confirmed):** Lovable → (internal pipeline) → Vercel. Response cookie `__dpl=...` confirms Vercel as the serving platform, Cloudflare is the CDN edge in front. No `vercel.json` or `.github/workflows/` in the repo — deploy config is entirely on Lovable/Vercel's side.

**Saved as memory:** `reference_lovable_manual_publish.md` in the auto-memory system, indexed in `MEMORY.md`.

### Status at session end

- Code on GitHub at `2086711` ✓
- Commit visible in Lovable Version History ✓
- Austin is clicking Publish now — live in a few minutes.

Post-publish verification:
```bash
NEW_BUNDLE=$(curl -s https://pontensolutions.com/products/nomii-ai | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | sed 's/src="//;s/"$//')
curl -s "https://pontensolutions.com${NEW_BUNDLE}" | grep -c "Two Ways to Run Shenmay"
# Expect: 1 once Lovable publishes
```

### Gotcha captured

- **Vite SPA diagnostic gotcha (reinforces an earlier one)**: curl of `/products/nomii-ai` returns the HTML shell — none of the React-rendered content. To verify copy changes on pontensolutions.com, find the `/assets/index-*.js` bundle URL in the HTML and grep the bundle. Hash in the URL changes on each deploy, so a stale hash + old content = deploy not complete yet.

### Git identity warning on the VM

`~/ponten-solutions` on Proxmox has no `user.name`/`user.email` configured, so commits land as `root@pontenprox.local`. Not breaking anything but worth setting once:
```bash
ssh nomii-prod "git config --global user.name 'Austin Ponten' && git config --global user.email '<your email>'"
```

### Security flag

The `origin` remote in `~/ponten-solutions/.git/config` has a GitHub PAT embedded directly in the URL (`https://ghp_...@github.com/...`). Seen in terminal output this session → already in shell history and process tables. Rotate at GitHub → Settings → Developer settings → PATs → revoke + reissue, then `git remote set-url origin https://github.com/jafools/ponten-solutions.git` and use SSH key or credential helper instead. Low blast radius (PAT is scoped to this repo, not org-wide), but don't forget.

### Next session TODO (updated)

1. **Visual QA the new section in a browser** — desktop + mobile. Adjust spacing/copy if anything reads awkward.
2. **Stripe receipts toggle** — Austin to enable "Successful payment receipts" + "Refund receipts" in Stripe Dashboard → Settings → Emails. Manual, 30 seconds.
3. **Stale success card at `pontensolutions.com/nomii/license?success=true`** — orphaned after Apr 15 evening redirect fix. Clean up next ponten-solutions deploy.
4. **SMTP_PASS rotation** — was visible in terminal `env` output during the earlier session. Low risk, worth rotating at convenience.
5. **portal.js split** (3,683 LOC in nomii-ai repo) — deferred post-launch.
6. **Delete 1,646 LOC of pre-portal zombie routes** — after 7-day prod log grep confirms no external traffic.
7. **Hetzner CX22 migration** — still on roadmap, not blocking.
8. **Marketing-page nitpicks** (optional): the `SelfHostedNomii.tsx` "7-day trial" copy in session notes doesn't match the actual behavior (unlimited days, capped at 20 msg/mo + 1 customer). New section copy was rewritten to say "Free trial included" — the SelfHostedNomii.tsx landing page itself is fine, but worth a copy review.

### Prod HEAD state at session end

- `nomii-ai` repo: `83ddc3a` (unchanged from earlier this evening — no nomii-ai code edits this session)
- `ponten-solutions` repo: `2086711` (NEW — this session's marketing-page fork)

---

## Earlier this evening: 2026-04-15 evening (self-hosted purchase funnel validated — live Stripe smoke test passed)

Ran a live $49 Stripe smoke test of the self-hosted Starter license flow. Payment → webhook → DB insert → license-key email → dashboard activation → plan-limits lifted — **all green end-to-end**. Prod HEAD `83ddc3a`. Self-hosted purchase funnel is shippable. Refunded the test purchase after validation.

Fixed three real bugs surfaced by the live test, created a proper post-purchase success page, and identified the marketing-page customer-journey gap as the next priority.

### Bugs fixed this session

1. **Lateris/Shenmay Stripe webhook crossfire** (fix applied in Lateris repo, cross-repo)
   - Both products share one Stripe account → both webhook endpoints receive every `checkout.session.completed` → Lateris issued a spurious Lateris license key for a Shenmay test purchase
   - Fix: negative `metadata.product_type` guard in Lateris `bin/license-worker.js`. Events with `product_type !== "lateris"` are skipped with `{ received: true, skipped: "not a Lateris checkout" }`
   - Shenmay side already stamps `metadata.product_type = 'selfhosted'` on both session AND subscription (see `server/src/routes/license-checkout.js:64-65`), so the guard works with zero Shenmay-side code changes
   - Lateris worker redeployed, stale KV entry (`LIC-2026-AUSTINPONTEN-752`) cleaned up

2. **Stale email activation instructions** (commit `26ad89a`)
   - `sendLicenseKeyEmail()` in `server/src/services/emailService.js` told buyers to SSH in, edit `.env`, set `NOMII_LICENSE_KEY=`, run `docker compose restart` — contradicts the new dashboard-first activation flow
   - Rewrote HTML + plain-text bodies: primary path is now "Log in → Plans & Billing → paste → Activate" (limits lift instantly, no restart). Kept the advanced env-var path in a collapsed `<details>` block for operators who prefer config-over-UI

3. **SMTP_FROM brand drift on prod** (env-only, no commit)
   - Prod `.env` on `nomii-prod` still had `SMTP_FROM="Knomi AI <hello@pontensolutions.com>"` — receipts branded with the retired name
   - Changed to `"Shenmay AI <hello@pontensolutions.com>"`. Required `docker compose up -d --force-recreate backend` to pick up (plain `restart` does NOT reload env files — new gotcha worth remembering)
   - Code default at `emailService.js:44` was already correct; only the prod env override was stale

### Post-purchase success page — created from scratch

Before this session: Stripe's `success_url` pointed to `pontensolutions.com/nomii/license?success=true`, which redirected through the `app.pontensolutions.com → nomii.pontensolutions.com` chain and hit the SPA catch-all → login redirect. No dedicated success page existed anywhere in the Shenmay app. The card showing on the old marketing site was orphaned legacy code with a "Go to Dashboard" button that sent self-hosted buyers to SaaS login.

Created `client/src/pages/nomii/NomiiLicenseSuccess.jsx` — self-contained, no auth, no API calls:
- Dark themed, matches `NomiiLogin` design language
- **Install command embedded inline** with a copy button — buyers who haven't installed yet don't need to leave the page:
  ```
  bash <(curl -fsSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh)
  ```
- Two labeled sections: "Haven't installed yet?" (Terminal icon, copy-able install cmd) + "Already running Shenmay?" (Server icon, pointing at Plans & Billing)
- Wired route `/nomii/license/success` into `client/src/App.tsx`
- Stripe `success_url` changed to `https://nomii.pontensolutions.com/nomii/license/success` — bypasses the marketing-site redirect chain entirely

Commits `41c0724` (page + route + success_url) and `83ddc3a` (inline install cmd). Deployed and verified: `nomii.pontensolutions.com/nomii/license/success` returns 200, install command present in the deployed JS bundle.

### Gotchas captured

- **`docker compose restart` does NOT reload env files.** Use `docker compose up -d --force-recreate <service>` whenever `.env` changes.
- **`curl -I` on SPA routes is diagnostically useless.** All routes return 200 for the HTML shell regardless of whether a route component exists. Trust code grep, not HTTP headers.
- **Shared Stripe accounts multiply webhook fanout.** Every product under the same Stripe account receives every event. Stamp `metadata.product_type` on session AND subscription (subscription-lifecycle events don't inherit session metadata), and add negative guards in each worker.

### Next session priority (Austin's explicit ask)

> "I want to see the clear path on my marketing page next. I want to hand hold the customers to be able to do On prem or SaaS Shenmay"

Marketing page at `pontensolutions.com/nomii/*` currently has no clear on-prem vs SaaS fork. Needs two explicit buyer journeys:

- **On-prem / Self-hosted (Trial-first)**: "Install Free (2 min)" primary CTA → runs `install.sh` → 7-day trial → upgrade in dashboard (Plans & Billing → paste Stripe key)
- **SaaS / Cloud (Managed)**: "Start Free Trial" → signup at `nomii.pontensolutions.com` → managed single-tenant instance → Stripe subscription from in-app billing

Work belongs in the `ponten-solutions` repo (not this repo). The `SelfHostedNomii.tsx` page drafted in the Apr 14 session is probably a starting point but needs review against the current branding + routing.

### Other outstanding (non-blocking)

- **Stripe customer receipts** — Austin to manually toggle in Stripe Dashboard → Settings → Emails → enable "Successful payment receipts" + "Refund receipts". Email service handles the license-key email but not invoice/receipt.
- **Stale success card** at `pontensolutions.com/nomii/license?success=true` — orphaned (nothing links to it now). Clean up on next ponten-solutions deploy or leave as-is (unreachable).
- **SMTP_PASS rotation** — Was visible in terminal output during an `env | grep` diagnostic this session. Low risk (local terminal only, not logged) but worth rotating at next convenient moment (One.com mail settings).
- **portal.js split** — 3,683 LOC. Flagged by the cleanup sweep. Deferred post-launch.
- **Pre-portal routes** (~1,646 LOC of zombies) — Needs 7-day prod log grep to confirm no external traffic before deletion.
- **Hetzner CX22 migration** — Still on roadmap. Not blocking first customer.

---

## Previous session (2026-04-15 late-evening): 8-agent codebase cleanup sweep — DEPLOYED

37 commits pushed to `origin/main` (cleanup + notes). 96 files changed, net **−5,223 LOC** across 7 merge commits + agent 5's direct commits. **Deployed to Proxmox prod** at HEAD `06f512d`. Backend + frontend containers rebuilt and healthy; external endpoints verified (`/api/health`, `/api/license/validate`, `/api/public/license/checkout`, `/widget.html`, `/embed.js` all 200).

**Still needs Austin's hands for the user-visible verification**: log into `/nomii/dashboard`, open Tools page, click "Test" on a non-connect tool — agent 7's latent bug fix means this should now work (was silently broken since `f6f0edb`). Widget chat round-trip also worth a smoke test.

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
- **HTML branding leak**: `client/index.html` had Pontén marketing title + og:image to `pontensolutions.com/og-image.png`. Self-hosted operators sharing their URL got the wrong link preview. Now generic "Shenmay AI" + relative `/og-image.png`. Improvement for SaaS too.
- **8 pre-auth logo links** to `https://pontensolutions.com` across NomiiLogin (3), NomiiSignup (2), NomiiResetPassword (2), NomiiVerifyEmail (1) — same SH-3 pattern as the post-auth onboarding. Removed the `<a>` wrappers; static logos on login forms is standard UX anyway.
- **Cloudflared restart loop** — root cause: compose `command:` was passed to the cloudflared image's ENTRYPOINT, so the actual exec was `cloudflared sh -c "..."`, sh got treated as a cloudflared subcommand, exit 1, restart-looped forever. **Two failed attempts** before the right fix:
  1. Tried entrypoint override `["/bin/sh","-c"]` + `exec sleep infinity` on no-token. **Failed:** the cloudflared image is distroless, no `/bin/sh` exists.
  2. Switched to **compose `profiles: [tunnel]`**. install.sh detects `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and adds `--profile tunnel` automatically. When no token, no cloudflared container exists at all. Verified scenario A (no token → 3 containers) and scenario B (token set → 4 containers, profile auto-activated).
- **install.sh `clear` crashed in headless mode** — `clear` errors with "TERM environment variable not set" when no tty + `set -e` aborts. Now gated by `[ -n "$TERM" ] && [ "$NONINT" != "1" ]`.
- **install.sh stale CDN cache** — install.sh hardcoded `main` branch URL for compose download; CDN can lag pushes by minutes. Added `NOMII_GITHUB_REF` env var so customers can pin to a release tag (the production-correct way) and so testers can pin to a SHA.
- **install.sh post-docker-install group bug** — install.sh installed Docker, added user to docker group, then immediately tried `docker compose pull` in the same shell — always failed (group not active in current shell). Now uses `DOCKER_CMD="sudo docker"` for the rest of the run when we just installed Docker. User logs out + back in for subsequent runs without sudo.
- **install.sh headless mode** — added `NOMII_NONINTERACTIVE=1` (skips `/dev/tty` redirect, reads answers from `NOMII_PUBLIC_URL`, `NOMII_SMTP_*`, `NOMII_CF_TOKEN`, `NOMII_LICENSE_KEY`). Real customer feature — needed for CI/Ansible/Terraform/Docker-build workflows. Also unblocks automated testing.

### Final verification (cycle 3, scenario A, fresh VM)
- `bash <(curl ...install.sh)` with `NOMII_NONINTERACTIVE=1 NOMII_PUBLIC_URL=http://10.0.100.25 NOMII_GITHUB_REF=<sha>` — completes in ~30s, ends with "Shenmay AI is almost ready!"
- 3 containers up: `nomii-db (healthy)`, `nomii-backend`, `nomii-frontend`. No cloudflared.
- `/api/health` → `{"status":"ok"}` in 1s
- `POST /api/setup/complete` → tenant created with `onboarding_steps` pre-filled `{tools, api_key, products, customers, company_profile: true}` — only `install_widget` undone (SH-1 verified end-to-end)
- HTML head: `<title>Shenmay AI</title>`, og:image=`/og-image.png`, og:site_name=`Shenmay AI`
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
- `client/src/pages/nomii/NomiiOnboarding.jsx:207,288` — both logo wrappers were `<a href="https://pontensolutions.com">`. Clicking the Shenmay logo in the sidebar (desktop) or header (mobile) mid-flow hard-redirected users OUT of their self-hosted instance.
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
5. Click the Shenmay logo inside `/nomii/onboarding` mid-flow — must stay in-app (go to `/nomii/dashboard`), not kick out to pontensolutions.com.
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
| `jafools/nomii-ai` | Shenmay AI app (backend + frontend) | `~/Knomi/knomi-ai` on Proxmox |
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
| `src/pages/NomiiAI.tsx` | ponten-solutions | Shenmay product page (has Buy a License button) |
| `src/App.tsx` | ponten-solutions | Router — BuyNomiiLicense imported at line 23, route at line 90 |
| `docs/SESSION_NOTES.md` | nomii-ai | This file — session handoff |

---

## Architecture notes

- **DB name**: `knomi_ai`, **DB user**: `knomi` — kept from old Knomi AI brand to avoid breaking production
- **Poll flow**: widget polls `/api/widget/poll?since=<ISO timestamp>` every 1.5s (human) or 3s (AI)
- **JWT expiry**: 2h (`WIDGET_JWT_EXPIRY`)
- **Deployment modes**: `NOMII_DEPLOYMENT=selfhosted` for single-tenant; `NOMII_LICENSE_MASTER=true` for SaaS license server
- **Stripe webhook**: `stripe-webhook.js` handles `checkout.session.completed`; detects `metadata.product_type === 'selfhosted'` → generates license key → inserts into `licenses` table → emails to buyer. No changes needed to this file.
- **Self-hosted license flow**: buyer visits `pontensolutions.com/nomii/license` → selects plan → enters email → POST to `nomii.pontensolutions.com/api/public/license/checkout` → redirected to Stripe → webhook fires → key emailed → buyer activates in Shenmay dashboard under Plans & Billing
