# Phase 5 Checklist — Backend Identifier Dual-Emit

**Parent plan:** `docs/SHENMAY_MIGRATION_PLAN.md` §Phase 5
**Status:** PLANNED (prep branch `chore/phase-5-prep`, no behavior change yet)
**Strategy:** All 7 sub-items are **additive dual-emit / dual-accept** — the
`nomii` form keeps working, the `shenmay` form becomes canonical, old form
removed in Phase 8 after 6-month grace window (target sunset 2026-10-20).
**Customer-comms gate:** Email in `docs/SHENMAY_MIGRATION_PLAN.md:425` MUST
ship BEFORE any Phase 5 sub-PR merges (once even one sub ships, the
customer-visible identifier surface changes).

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

## 5c · localStorage portal token — `nomii_portal_token` → `shenmay_portal_token`

Client refactor: write new key, read new-first-then-old-with-migration.
Old sessions migrate on next page load; no customer action needed.

| File | Line | Action |
|---|---|---|
| [client/src/lib/shenmayApi.js:42-45](client/src/lib/shenmayApi.js:42) | `getToken`, `setToken`, `clearToken` | Rewrite: write + primary-read `shenmay_portal_token`; fallback-read `nomii_portal_token` → migrate → clear; `clearToken` clears both |
| [client/src/pages/shenmay/ShenmayOnboarding.jsx:123](client/src/pages/shenmay/ShenmayOnboarding.jsx:123) | Direct `localStorage.getItem` | Replace with `getToken()` from shenmayApi |
| [LOVABLE_PROMPTS.md](LOVABLE_PROMPTS.md) | Multiple refs to token key | Update all references (doc-only, non-runtime) |

**Test plan:** E2E — seed `nomii_portal_token` manually, reload, assert
`shenmay_portal_token` is set + old key is cleared + session still valid.
Do NOT flip the E2E suite's direct-localStorage accesses in this PR — the
suite currently validates the old key path; Phase 5c is the moment it
becomes the dual-key path.
**Risk:** 🟡 minor — bad migration logic could strand a session. Mitigate
with verified in-session migration test + rollback hooks.

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
`nomii-wordpress-plugin.zip` build artifact). In-repo work is
documentation-only; the shortcode rename happens in a separate PR
against the WP plugin repo, coordinated with 5f's zip rename.

| File | Line | Action |
|---|---|---|
| [FEATURES.md:239](FEATURES.md:239) | Feature list | Update to "Both `[nomii_widget]` and `[shenmay_widget]` shortcodes supported" once plugin rebuilt |

**Test plan:** In the WP plugin PR: register both shortcodes pointing at
the same handler; WP install of the new plugin zip → paste either
shortcode → widget renders.
**Risk:** 🟢 zero — WP customers on old plugin keep working; new
plugin supports both.

---

## 5f · WP plugin zip — `nomii-wordpress-plugin.zip` → `shenmay-wordpress-plugin.zip`

Publish the new-named zip at `/downloads/shenmay-wordpress-plugin.zip`
alongside the existing one. Add a permanent 301 from the old URL so WP
update checks on existing installs keep resolving.

| File | Line | Action |
|---|---|---|
| [client/src/components/shenmay/onboarding/Step4InstallWidget.jsx:172](client/src/components/shenmay/onboarding/Step4InstallWidget.jsx:172) | Download button href | Point to `shenmay-wordpress-plugin.zip` |
| config/nginx/prod.conf (`/downloads/` blocks at lines 79, 145, 219, 283) | `/downloads/` | Add `location = /downloads/nomii-wordpress-plugin.zip { return 301 /downloads/shenmay-wordpress-plugin.zip; }` inside each `/downloads/` block (permanent, per Phase 8 rule "keep indefinitely") |
| [LOVABLE_PROMPTS.md:148](LOVABLE_PROMPTS.md:148) | Onboarding copy | Update to new filename |
| [FEATURES.md:237](FEATURES.md:237) | Docs | Update |
| Hetzner ops | — | Upload `shenmay-wordpress-plugin.zip` artifact to `/downloads/` + keep `nomii-*.zip` in place (nginx serves 301 from it to the new name) |

**Test plan:** `curl -I https://shenmay.ai/downloads/nomii-wordpress-plugin.zip`
→ 301 to new URL. `curl -I .../shenmay-wordpress-plugin.zip` → 200.
**Risk:** 🟢 zero — 301 preserves existing WP auto-update behavior.

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
