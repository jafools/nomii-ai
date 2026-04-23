# Phase 5 Checklist — Backend Identifier Dual-Emit

**Parent plan:** `docs/SHENMAY_MIGRATION_PLAN.md` §Phase 5
**Status:** **Phase 5 bundle A (5a/5b/5d/5g) LIVE at v2.4.0 (2026-04-23 morning).**
Remaining sub-items (5c localStorage, 5e WP shortcode, 5f WP plugin zip) queued.
**Strategy:** All 7 sub-items are **additive dual-emit / dual-accept** — the
`nomii` form keeps working, the `shenmay` form becomes canonical, old form
removed in Phase 8 after 6-month grace window (target sunset 2026-10-20).
**Customer-comms gate:** Polished email at
[`docs/CUSTOMER_COMMS_SHENMAY_EMAIL.md`](./CUSTOMER_COMMS_SHENMAY_EMAIL.md)
MUST ship BEFORE **5c** (localStorage migration) or **5f** (WP plugin URL
change) merges. Shipped 5a/5b/5d/5g didn't need the email — all four
were silent backend additions.

Grep `TODO(Phase 5` to find every touch-point in code.

---

## 5a · Webhook signature header — `X-Nomii-Signature` → also emit `X-Shenmay-Signature`

Outbound webhooks already send `X-Shenmay-Event` + `User-Agent: Shenmay-Webhook/1.0`.
Only the HMAC-SHA256 signature header is still Nomii-only. Customer
receivers pin on this header name, so dual-emit is the safe play.

| File | Line | Action |
|---|---|---|
| [server/src/services/webhookService.js:81](server/src/services/webhookService.js:81) | existing `'X-Nomii-Signature'` emit | Add `'X-Shenmay-Signature': \`sha256=${signature}\`` alongside — same payload, two headers |
| [server/src/services/webhookService.js:17](server/src/services/webhookService.js:17) | docstring | Update to mention both headers emitted, note Phase 8 sunset |
| [client/src/pages/shenmay/dashboard/ShenmaySettings.jsx:913](client/src/pages/shenmay/dashboard/ShenmaySettings.jsx:913) | Settings copy | Change "Verify the `X-Nomii-Signature` header" → "Verify the `X-Shenmay-Signature` header (legacy `X-Nomii-Signature` also sent until 2026-10-20)" |
| [client/src/pages/shenmay/dashboard/ShenmaySettings.jsx:1131](client/src/pages/shenmay/dashboard/ShenmaySettings.jsx:1131) | Webhook test copy | Same rewording |

**Test plan:** Curl the webhook test endpoint, verify both headers on the outbound POST.
**Risk:** 🟢 zero — customers pinning `X-Nomii-Signature` keep verifying fine.

---

## 5b · Data API key prefix — `nomii_da_*` + `shenmay_da_*`

Bearer-token check must accept both prefixes. New keys issued as `shenmay_da_*`.
Existing customer keys keep working.

| File | Line | Action |
|---|---|---|
| [server/src/routes/dataApi.js:81](server/src/routes/dataApi.js:81) | `key.startsWith('nomii_da_')` | Accept BOTH: `key.startsWith('nomii_da_') || key.startsWith('shenmay_da_')` |
| [server/src/routes/dataApi.js:92](server/src/routes/dataApi.js:92) | `prefix = key.slice(0, 17)` | Prefix length varies: `nomii_da_` = 9 chars, `shenmay_da_` = 11 chars. Slice `key.startsWith('shenmay_da_') ? 19 : 17` (prefix + 8 bytes) |
| [server/src/routes/portal.js:3011-3014](server/src/routes/portal.js:3011) | Key generator | Switch new-key generation to `shenmay_da_${randomPart}` |
| [server/db/migrations/017_data_api.sql:13](server/db/migrations/017_data_api.sql:13) | Comment | Leave (historical SQL comment, not enforced) |
| [docs/DATA-API.md:19](docs/DATA-API.md:19) | Auth header example | Update to `shenmay_da_<key>` with deprecation note on `nomii_da_*` |
| [docs/DATA-API.md:138](docs/DATA-API.md:138) | Example key | Update to `shenmay_da_pk_live_...` |
| [FEATURES.md:106](FEATURES.md:106) | Feature list | Update auth format |

**Test plan:** Unit-test bearer middleware with both prefix forms + 8-char
prefix lookup for each. Manually issue new key via portal → verify
`shenmay_da_` prefix in UI + DB `data_api_key_prefix` column.
**Risk:** 🟢 zero — no existing customer key gets rejected.

---

## 5c · localStorage portal token — `nomii_portal_token` → `shenmay_portal_token` ✅ SHIPPED

**Status:** LIVE. Implemented in feat/phase-5c-localstorage-migration.
Customer sessions silently migrate on their next portal load; no
re-login required.

**Implementation summary:**

- [client/src/lib/shenmayApi.js:40-71](client/src/lib/shenmayApi.js:40) — `TOKEN_KEY` = `shenmay_portal_token`, `LEGACY_TOKEN_KEY` = `nomii_portal_token`. `getToken()` reads new key first, falls back to legacy with in-place migration (writes new key + clears legacy). `setToken()` writes new key + clears legacy proactively. `clearToken()` removes both.
- [client/src/pages/shenmay/ShenmayOnboarding.jsx:123](client/src/pages/shenmay/ShenmayOnboarding.jsx:123) — direct `localStorage.getItem` replaced with the `getToken()` helper.
- E2E helpers + specs intentionally left on direct `nomii_portal_token` access — Playwright isolation gives each test a fresh context, so test-seeded legacy tokens exercise the migration path which is a valuable coverage boost.
- `LOVABLE_PROMPTS.md` references left for a future doc sweep (non-runtime).

**Verified scenarios:**
- Fresh user (no tokens) → `getToken()` returns `null`, `isLoggedIn()` false.
- Post-login with new flow → `setToken(jwt)` writes new key, no legacy key left behind.
- Returning user with legacy token only → first `getToken()` migrates in place; second call is a single-key hit.
- Dual-key state (defensive) → new key wins, legacy ignored.
- Logout → `clearToken()` removes both keys.

---

## 5d · Anonymous visitor email domain — `@visitor.nomii` + `@visitor.shenmay`

New anon widget sessions get `@visitor.shenmay`. Every query that
filters `NOT LIKE '%@visitor.nomii'` must also exclude
`%@visitor.shenmay`. Safest pattern: introduce a helper constant /
SQL fragment and sweep all sites.

| File | Line | Action |
|---|---|---|
| [server/src/routes/widget.js:133](server/src/routes/widget.js:133) | Anon email generation | Change to ``anon_${anonId}@visitor.shenmay`` |
| [server/src/routes/widget.js:165](server/src/routes/widget.js:165) | Customer-lookup filter | Add `@visitor.shenmay` to the `NOT LIKE` guard |
| [server/src/routes/widget.js:450](server/src/routes/widget.js:450) | Same | Same |
| [server/src/middleware/subscription.js:101](server/src/middleware/subscription.js:101) | Billable-customer count filter | Same |
| [server/src/routes/portal.js:822](server/src/routes/portal.js:822) | `NOT LIKE 'anon\\_%@visitor.nomii'` | Same |
| [server/src/routes/portal.js:981](server/src/routes/portal.js:981) | Same | Same |
| [server/src/routes/portal.js:1002](server/src/routes/portal.js:1002) | Same | Same |
| [server/src/routes/portal.js:1034](server/src/routes/portal.js:1034) | Same | Same |
| [server/src/routes/portal.js:1366](server/src/routes/portal.js:1366) | Same | Same |
| [server/src/routes/portal.js:1372](server/src/routes/portal.js:1372) | Same | Same |
| [server/src/jobs/dataRetention.js:153-157](server/src/jobs/dataRetention.js:153) | Cleanup query comment + predicate | Match both domains |
| [server/src/tools/universal/send_document.js:123](server/src/tools/universal/send_document.js:123) | `toEmail.includes('@visitor.nomii')` | Also check `@visitor.shenmay` |
| [FEATURES.md:15](FEATURES.md:15) | Docs | Update to Shenmay domain, note legacy still recognized |

**Recommended implementation:** Introduce
`server/src/constants/anonDomains.js` exporting
`ANON_EMAIL_DOMAINS = ['@visitor.nomii', '@visitor.shenmay']` and
`ANON_EMAIL_SQL_GUARD = "email NOT LIKE 'anon\\_%@visitor.nomii' AND email NOT LIKE 'anon\\_%@visitor.shenmay'"`
so every call site can import one source of truth.

**Test plan:** Create a fresh widget session post-change → verify email
has `@visitor.shenmay`. Seed a tenant with mixed old + new anon rows →
verify billable count, retention job, send_document all count/handle
both.
**Risk:** 🟡 minor — an unmigrated query would under-count billable or
over-purge in retention.

---

## 5e · WordPress shortcode — `[nomii_widget]` + `[shenmay_widget]`

The WP plugin source is NOT in this repo (lives in the
`shenmay-wordpress-plugin.zip` build artifact, which is now the
canonical filename post-5f). In-repo work is documentation-only; the
shortcode rename happens in a separate PR against the WP plugin repo.

| File | Line | Action |
|---|---|---|
| [FEATURES.md:239](FEATURES.md:239) | Feature list | Update to "Both `[nomii_widget]` and `[shenmay_widget]` shortcodes supported" once plugin rebuilt |

**Test plan:** In the WP plugin PR: register both shortcodes pointing at
the same handler; WP install of the new plugin zip → paste either
shortcode → widget renders.
**Risk:** 🟢 zero — WP customers on old plugin keep working; new
plugin supports both.

---

## 5f · WP plugin zip — `nomii-wordpress-plugin.zip` → `shenmay-wordpress-plugin.zip` ✅ SHIPPED

**Status:** LIVE. The physical zip is renamed in the repo (`git mv`), the
canonical URL is `/downloads/shenmay-wordpress-plugin.zip`, and the
legacy URL is 301-redirected at the Express layer (intercepted BEFORE
the static middleware so the redirect wins).

**Implementation summary:**

- [server/public/downloads/shenmay-wordpress-plugin.zip](server/public/downloads/shenmay-wordpress-plugin.zip) — renamed from `nomii-wordpress-plugin.zip` via `git mv` (history preserved).
- [server/src/index.js:138-143](server/src/index.js:138) — explicit `app.get('/downloads/nomii-wordpress-plugin.zip', ...)` returning 301 to the canonical path, added BEFORE the `express.static` middleware so it intercepts first.
- [client/src/components/shenmay/onboarding/Step4InstallWidget.jsx:170](client/src/components/shenmay/onboarding/Step4InstallWidget.jsx:170) — download button href flipped to the canonical filename; removed the TODO anchor comment.
- `FEATURES.md:237` + `LOVABLE_PROMPTS.md:148` — doc URLs updated with legacy-301 note.

**Notes on WP auto-update:**

WordPress's plugin auto-update mechanism issues a GET for the plugin zip; any `fetch`/`wp_remote_get` call follows redirects by default, so the 301 is transparent to existing WP installs. No customer action required. The plugin internals (shortcode + settings page) are unchanged — those are Phase 5e's territory, in the sibling WP plugin repo.

**Phase 8 sunset (target 2026-10-20):**

1. Delete the `app.get('/downloads/nomii-wordpress-plugin.zip', ...)` handler from `server/src/index.js`.
2. Any remaining WP installs still requesting the legacy URL will get a 404. By then we expect ~100% to be calling the canonical URL directly (most WP plugin update cycles run ≥ weekly).

**Test plan (post-deploy):**
`curl -I https://shenmay.ai/downloads/nomii-wordpress-plugin.zip` → 301 to canonical URL.
`curl -I https://shenmay.ai/downloads/shenmay-wordpress-plugin.zip` → 200.

**Risk:** 🟢 zero — 301 preserves existing WP auto-update behavior; redirect is intercepted BEFORE `express.static` so the rename can't 404 a legacy caller.

**Ops (not required for this PR):** none — the physical file rename lives inside the Docker image, so `docker compose pull + up -d` on the tag swap handles it atomically. No separate SSH step.

**Note on original plan:** The original checklist proposed doing the 301 at the nginx layer (4 server blocks) plus a pre-deploy `cp` on Hetzner. The Express-level redirect is simpler (one file, testable in `node --check`), survives any future nginx re-config, and avoids the ops coordination window. Nginx would still work if we ever re-add it for perf; not needed today given the `/downloads/` route already proxies to the backend.

---

## 5g · Products CSV template — `nomii-products-template.csv` → `shenmay-products-template.csv`

Customer downloads the CSV on each onboarding session, so there's no
need for a redirect or dual filename — just flip it.

| File | Line | Action |
|---|---|---|
| [client/src/components/shenmay/onboarding/Step2Products.jsx:152](client/src/components/shenmay/onboarding/Step2Products.jsx:152) | `a.download = "nomii-products-template.csv"` | Change to `"shenmay-products-template.csv"` |

**Test plan:** Click "Download template" in onboarding → verify
downloaded filename.
**Risk:** 🟢 zero.

---

## Sequencing

Recommended PR order (one PR per sub or bundle):

1. **PR A: 5a + 5b + 5d + 5g** — pure server + static-client dual-emits.
   Zero customer action required. No email needed yet because customers
   see no change (old identifiers keep working).
2. **Customer comms email goes out** (text at `docs/SHENMAY_MIGRATION_PLAN.md:425` — polish + send via current email pipeline).
3. **PR B: 5c** — localStorage migration. Customer portal sessions
   start migrating on next login. Email precedes this so customers know
   to expect anything (though silent migration needs no customer action).
4. **PR C: 5f** — static-file rename + 301. Coordinate with Hetzner
   artifact upload.
5. **Parallel PR: 5e** — WP plugin repo rebuild + publish new zip.

Phase 6 (Docker / GHCR rename) cannot start until at least 5a+5b+5d are
merged; Phase 7 (DB rename) depends on Phase 6. This checklist can be
fully closed out in ~1 week of sub-PRs, or compressed into one large
Phase 5 mega-PR if review bandwidth allows.

---

## Out-of-scope (intentionally NOT in Phase 5)

- `/nomii/*` client routes — handled in Phase 4 (already shipped, backward-compat redirect live)
- `NOMII_*` env vars — handled in Phase 4 shim (`server/src/utils/env.js`), removed in Phase 8
- `nomii-db`, `nomii-backend`, `nomii-frontend` container names — Phase 6
- `nomii_ai` database + `nomii` DB user — Phase 7
- `ghcr.io/jafools/nomii-*` image names — Phase 6
- Cloudflare tunnel `knomi-ai` — never (shared with Lateris)
- USPTO ITU registration — Phase 9 (last)
