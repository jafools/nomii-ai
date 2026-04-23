# Nomii → Shenmay AI Migration Plan

**Phase 1 shipped:** 2026-04-20 (PR #34 / commit `5e0a882`).
**Current brand:** **Shenmay AI** across all user-visible surfaces.
**Infra state:** still on legacy `nomii-*` / `NOMII_*` / `/nomii/*` names
(backward-compat by design, Phases 4–7).

**Quick links:**
- Canonical domain (registered): [`shenmay.ai`](https://shenmay.ai) (Cloudflare Registrar, 2yr)
- Repo: `jafools/nomii-ai` (rename deferred — GitHub handles redirects)
- Brand assets: `Company Logos/shenmay_*.svg`

---

## Why this migration

`Nomii` is phonetically identical to `Nomi` — a registered US trademark
of glimpse.ai, Inc. (operator of the Nomi.ai AI companion platform).
USPTO likelihood-of-confusion analysis treats one-letter phonetic matches
in the same Nice class (Class 9 software + Class 42 SaaS) as confusingly
similar. Continuing under `Nomii` exposed the product to:

- USPTO opposition or refusal of any trademark filing
- Cease-and-desist risk from glimpse.ai
- SEO dilution (nomi.ai has ~1.1M monthly visits)
- Customer confusion in enterprise procurement reviews

`Shenmay AI` resolves all three:

- **Brand:** An English-spelled word that an English speaker naturally
  pronounces as "SHEN-MAY" — which is how Swedish-speakers colloquially
  pronounce *"Känn mej"* ("know me"). Hidden-meaning construction: the
  brand says its value proposition every time someone speaks it, without
  requiring knowledge of Swedish.
- **Trademark:** No collisions found in USPTO preliminary scan for AI /
  software classes. Arbitrary/fanciful mark → strongest TM category.
- **Heritage:** Authentic — founder is Swedish. Fits the Scandinavian-B2B
  archetype (Spotify, Klarna, IKEA, Minecraft, Acne Studios).

## Brand primer (for marketing / customer comms)

> **Shenmay** is how *"Känn mej"* sounds when spoken — Swedish for "know me."
> Our AI helps you know your customers. That's the whole idea.

- **Wordmark rendering:** `Shenmay` or `shenmay` (typography carries the
  elegance; don't use `Shen May` with a space, don't hyphenate)
- **Product name:** `Shenmay AI`
- **Company rename scope:** Shenmay AI is a *product* of Ponten Solutions.
  `pontensolutions.com` stays unchanged. Do not rename the parent company.
- **Pronunciation:** "SHEN-MAY" (rhymes with "when-day")
- **Design language:** typography-only wordmark, teal-dot accent
  (`#0F5F5C` — Stockholm fjord), no illustrative icon, Scandinavian restraint
- **Tagline seed:** *"Shenmay is Swedish for 'know me.' Our AI knows your customers."*

---

## Phase 1 — SHIPPED ✅ (2026-04-20)

Merged as [PR #34](https://github.com/jafools/nomii-ai/pull/34) / `5e0a882`.
**145 files changed, +11,453 / −11,419 lines, 12 phased commits squashed.**

**What landed:**

- Domain `shenmay.ai` purchased at Cloudflare Registrar (2yr, ~$160)
- New wordmark (Inter 500 typography + teal-dot accent) in
  `Company Logos/shenmay_*.svg` and `client/src/assets/shenmay-*.svg`
- 9 obsolete `nomiiai_*.svg` logos deleted
- 32 React component files renamed `Nomii*.jsx` → `Shenmay*.jsx`
  (`git mv`, history preserved)
- Directory renames: `pages/nomii` → `pages/shenmay`, `components/nomii`
  → `components/shenmay`
- Symbol + import sweep across `client/src` + `server/src`:
  `NomiiFoo` → `ShenmayFoo`, `nomiiTenant` → `shenmayTenant`,
  `useNomiiAuth` → `useShenmayAuth`, `nomiiApi` → `shenmayApi`, etc.
- All user-visible brand text swept: docs, READMEs, email templates,
  UI copy, portal/widget brand refs, server startup log, `package.json`
  names, HTML titles + OG/Twitter meta
- Claude-session source docs: `CLAUDE.md`, `SESSION_HANDOFF.md`,
  `docs/RELEASING.md`, `Covenant Trust/*` (+ rename
  `NOMII_AI_ARCHITECTURE.md` → `SHENMAY_AI_ARCHITECTURE.md`)
- CI workflow files + docker-compose comments + nginx comments
- Tests, scripts, DB migration schema comments
- Historical rebrand chronology preserved in `SESSION_HANDOFF.md`
  (Knomi → Nomii on 2026-03-18; Nomii → Shenmay on 2026-04-20)

**Backward-compat preserved on purpose (renamed in later phases):**

| Preserved | Why | Rename phase |
|---|---|---|
| `/nomii/*` URL routes | existing bookmarks + email magic links | 4 |
| `X-Nomii-Signature` webhook header | customer webhook handlers | 5 |
| `nomii-*` Docker container names | infra coordinated rename | 6 |
| `nomii_ai` DB + `nomii` DB user | coordinated maintenance | 7 |
| `NOMII_*` env vars | on-prem customer `.env` files | 4 (shim), 8 (remove) |
| `nomii_da_` API key prefix | issued customer keys | 5 |
| `@visitor.nomii` anon email domain | data continuity | 5 |
| `nomii_portal_token` localStorage | existing sessions | 5 |
| `nomii-wordpress-plugin.zip` URL | existing WP install update checks | 5 (redirect) |
| `ghcr.io/jafools/nomii-*` images | CI workflow coordinated rename | 6 |
| Cloudflare tunnel `knomi-ai` | shared with Lateris, untouchable | never |

---

## Phase 2 — Staging verify + v2.0.0 release [NEXT — ~1 day]

**Goal:** Get the rebranded code serving real users (SaaS + on-prem).

**Blockers:** none — Phase 1 is on main and CI is green.

**Steps:**

1. Wait for GHCR `:edge` rebuild + Proxmox `nomii-staging-refresh.timer`
   pull (~5–8 min total after merge)
2. Click-through verify `https://nomii-staging.pontensolutions.com`:
   - Browser tab says **Shenmay AI**
   - Teal-dot wordmark renders in header + login page
   - Dashboard pages (overview, customers, conversations, concerns,
     settings, plans, team, tools) all branded Shenmay
   - Trigger a test invite email — verify "Shenmay AI" in subject + body
     + footer
   - Trigger a webhook test ping — verify Slack/Teams card branding
3. If staging clean → cut the v2.0.0 release:
   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```
4. SSH to Hetzner and check out the tag (per `docs/RELEASING.md`):
   ```bash
   ssh nomii@204.168.232.24 "cd ~/nomii-ai && git fetch --tags && \
     git checkout v2.0.0 && IMAGE_TAG=2.0.0 docker compose pull \
     backend frontend && IMAGE_TAG=2.0.0 docker compose up -d \
     backend frontend"
   ```
5. Verify prod `https://nomii.pontensolutions.com` shows Shenmay branding
6. Verify `docker inspect nomii-backend --format '{{.Config.Image}}'`
   shows `ghcr.io/jafools/nomii-backend:2.0.0`

**Output:** `v2.0.0` tag on GitHub + GHCR; SaaS + on-prem on same SHA.

---

## Phase 3 — Canonical domain switchover to `shenmay.ai` [~1 week]

**Goal:** `shenmay.ai` becomes the primary URL. `nomii.pontensolutions.com`
301-redirects forever.

**Blockers:** Phase 2 shipped. Cloudflare account access.

**Steps:**

1. DNS at Cloudflare Registrar: add A record `shenmay.ai` → `204.168.232.24`
   (Hetzner public IP). Proxy enabled (orange cloud).
2. Cloudflare Origin CA: issue new cert for `*.shenmay.ai` + `shenmay.ai`
   (15yr validity). Install on Hetzner under `/etc/ssl/shenmay/` and
   reference from `config/nginx/prod.conf`.
3. Add `shenmay.ai` `server_name` block to nginx alongside the existing
   `nomii.pontensolutions.com` block. Reload nginx.
4. Update `APP_URL=https://shenmay.ai` in Hetzner `.env`. Restart backend
   so email links use the new domain.
5. Verify SSL: `curl -I https://shenmay.ai` should return 200 + the app.
6. Add 301 redirect on the old subdomain:
   ```nginx
   server {
     server_name nomii.pontensolutions.com;
     return 301 https://shenmay.ai$request_uri;
   }
   ```
7. Staging: same treatment on Proxmox (add `shenmay-staging.pontensolutions.com`
   alongside `nomii-staging.pontensolutions.com`, or keep staging on the
   nomii subdomain since it's internal-only).
8. Marketing site (`ponten-solutions` repo): rename path
   `/products/nomii-ai` → `/products/shenmay-ai`. Update internal
   links. Commit + **Austin: click Publish in Lovable** (manual step
   required — see `reference_lovable_manual_publish.md`). Verify the
   bundle hash on `pontensolutions.com/products/shenmay-ai` actually
   reflects the new page.

**Output:** Primary URL = `shenmay.ai`. Old URLs 301 forever. Customers
can bookmark either.

---

## Phase 4 — Client-side URL route dual-mount + env var shims [~3 days]

**Goal:** Backend accepts both `NOMII_*` and `SHENMAY_*` env vars. Client
React Router serves both `/nomii/*` and `/shenmay/*`. Ready for Phase 5.

**Blockers:** Phase 2 merged.

**Server (Express + Node) changes:**

1. Add env var shim helper:
   ```js
   // server/src/utils/env.js
   export function envVar(suffix, fallback) {
     const newKey = `SHENMAY_${suffix}`;
     const oldKey = `NOMII_${suffix}`;
     if (process.env[newKey] != null) return process.env[newKey];
     if (process.env[oldKey] != null) {
       console.warn(
         `[deprecated] ${oldKey} is deprecated — rename to ${newKey} ` +
         `before 2026-10-20 (6mo grace window)`
       );
       return process.env[oldKey];
     }
     return fallback;
   }
   ```
2. Replace every `process.env.NOMII_X` with `envVar('X')`. On-prem customer
   `.env` files keep working unchanged; operators see deprecation warnings
   in their logs.
3. Example `.env.example` files now show `SHENMAY_*` variants.

**Client (React Router) changes:**

4. Duplicate-mount every route at `/shenmay/*`:
   ```jsx
   <Route path="/nomii/login"   element={<ShenmayLogin />} />
   <Route path="/shenmay/login" element={<ShenmayLogin />} />
   <Route path="/nomii/dashboard"   element={<Dashboard />} />
   <Route path="/shenmay/dashboard" element={<Dashboard />} />
   ```
5. Update every `navigate(...)` call and `<Link to=...>` to use
   `/shenmay/*`.
6. Flip catch-all redirects to `/shenmay/*`:
   ```jsx
   <Route path="*" element={<Navigate to="/shenmay/dashboard" replace />} />
   ```
7. Add client-side "soft-301": anyone landing on `/nomii/*` gets
   `<Navigate to="/shenmay/..." replace />` so URLs display as
   `/shenmay/*` after the redirect.
8. Update emails + invite magic links (`emailService.js`) to use
   `/shenmay/*` paths. Existing un-redeemed tokens on `/nomii/*` keep
   working via the dual-mount.

**Output:** Old `/nomii/*` bookmarks + magic links keep working. New URLs
are canonical. Env var deprecation warnings visible to on-prem admins.

---

## Phase 5 — Backend identifier rename [~1–2 weeks]

**Goal:** Every customer-facing identifier exists in both Nomii and
Shenmay form; Shenmay is primary; Nomii accepted with deprecation window.

**Send customer comms email BEFORE merging Phase 5.** (Template in
`docs/SHENMAY_MIGRATION_PLAN.md` section "Customer communication draft".)

| Identifier | Action |
|---|---|
| `X-Nomii-Signature` webhook header | Emit **both** `X-Nomii-Signature` and `X-Shenmay-Signature` on every webhook. Docs: "either header is valid." Customers migrate at their pace. |
| `nomii_da_*` API key prefix | Bearer-token check accepts both prefixes. Issue new keys with `shenmay_da_*`. Existing keys continue to work. |
| `nomii_portal_token` localStorage | Primary read + write = `shenmay_portal_token`. Fallback: on login, read `nomii_portal_token`, migrate to new key, clear old. Customer sessions migrate on next login. |
| `@visitor.nomii` anon domain | New anon sessions use `@visitor.shenmay`. Old anon records preserved. Retention cron (`dataRetention.js`) matches either domain. |
| `[nomii_widget]` WP shortcode | Plugin supports both `[nomii_widget]` and `[shenmay_widget]`. New docs reference `[shenmay_widget]`. |
| `nomii-wordpress-plugin.zip` | Publish `shenmay-wordpress-plugin.zip` at `api.pontensolutions.com/downloads/`. Keep old URL as a 301 to the new one for existing WP update checks. |
| `nomii-products-template.csv` | Rename download filename to `shenmay-products-template.csv`. No backward-compat needed (customer downloads each time). |

**Output:** Customer integrations keep working unchanged. New docs +
new customers use Shenmay identifiers. Deprecation window announced
("After 2026-10-20, `X-Nomii-Signature` will no longer be emitted").

---

## Phase 6 — Docker / GHCR / compose rename ✅ SHIPPED (v2.7.0, 2026-04-23)

**Status:** LIVE on Hetzner. Image names cut over to
`ghcr.io/jafools/shenmay-{backend,frontend}`; container names cut over to
`shenmay-{db,backend,frontend,cloudflared}`. No dual-publish — no real
customers at cutover point, so a hard cutover was lower-risk than managing
dual-publish machinery. Rollback to v2.6.0 works cleanly: that tag's compose
references the old `nomii-*` image names, which remain on GHCR indefinitely
(tags are immutable). Proxmox staging rename + Cloudflared tunnel origin
update deferred to a separate PR.

**Goal:** Container + image names reflect Shenmay. Requires coordination
with on-prem customers.

**Blockers:** Phase 5 shipped + on-prem customers notified.

**Steps:**

1. Update `.github/workflows/docker-publish.yml` to publish **both**
   `ghcr.io/jafools/nomii-backend` and `ghcr.io/jafools/shenmay-backend`
   (same image, two tags) for one release cycle.
2. Update `docker-compose.yml` + `docker-compose.selfhosted.yml`:
   - `services: nomii-backend:` → `services: shenmay-backend:`
   - `container_name: nomii-backend` → `container_name: shenmay-backend`
   - Same for `nomii-frontend`, `nomii-db`
   - Network name `nomii-network` → `shenmay-network`
3. Write on-prem migration script:
   ```bash
   # scripts/migrate-to-shenmay-compose.sh
   docker compose -f docker-compose.selfhosted.yml down
   # volumes persist by name; docker-compose recreates containers with new names
   docker compose -f docker-compose.selfhosted.yml up -d
   ```
4. Hetzner: coordinate maintenance window, apply compose rename.
5. Proxmox staging: apply rename + update `refresh-staging.sh` to
   reference new container names.
6. Customer comms: email on-prem customers with upgrade guide + link to
   migration script.

**Output:** All containers named `shenmay-*`. Old `ghcr.io/jafools/nomii-*`
images stay on GHCR for 90 days (dual-publish cycle), then get pruned.

**Skip:** Cloudflare tunnel `knomi-ai` — shared with Lateris, rename
requires coordinated Lateris change. Defer or skip permanently.

---

## Phase 7 — Database rename [~10 min maintenance window]

**Goal:** Postgres DB name = `shenmay_ai`, DB user = `shenmay`.

**Blockers:** Phase 6 shipped.

**Steps:**

```bash
# 1. Announce 10-min window to any active customers (SaaS)

# 2. Backup first
ssh nomii@204.168.232.24 \
  "docker exec -i nomii-db pg_dump -U nomii nomii_ai > \
   ~/backups/pre-shenmay-rename-$(date +%F).sql"

# 3. Stop backend (connections must close before ALTER)
ssh nomii@204.168.232.24 "cd ~/nomii-ai && docker compose stop backend"

# 4. Rename DB + user
ssh nomii@204.168.232.24 \
  "docker exec -i nomii-db psql -U postgres -c \
    \"ALTER DATABASE nomii_ai RENAME TO shenmay_ai;\""
ssh nomii@204.168.232.24 \
  "docker exec -i nomii-db psql -U postgres -c \
    \"ALTER USER nomii RENAME TO shenmay;\""

# 5. Update .env
ssh nomii@204.168.232.24 \
  "cd ~/nomii-ai && sed -i 's|nomii_ai|shenmay_ai|g; s|postgresql://nomii:|postgresql://shenmay:|g' .env"

# 6. Restart backend
ssh nomii@204.168.232.24 "cd ~/nomii-ai && docker compose up -d backend"

# 7. Verify
ssh nomii@204.168.232.24 "curl -s http://127.0.0.1:3001/api/health"
```

**Output:** DB identifiers = Shenmay. Postgres internals only; no
customer-visible effect.

---

## Phase 8 — Sunset old shims [6–12 months after Phase 5]

**Goal:** Remove backward-compat code. Simplify the codebase.

| Identifier | Sunset trigger | Action |
|---|---|---|
| `NOMII_*` env vars | 6 months + telemetry shows 0 deprecation-warning hits | Remove the env shim |
| `/nomii/*` client-side dual-mount | 12 months | Remove duplicate Route entries; keep server-side 301 permanently |
| `X-Nomii-Signature` header | 12 months (give customers a year to update webhook handlers) | Stop emitting |
| `nomii_da_` API key prefix | 90 days after customer notice | Reject `nomii_da_*` keys; customers must rotate |
| `nomii_portal_token` localStorage fallback | 90 days | Remove read-fallback (sessions expire within) |
| `[nomii_widget]` WP shortcode | — | Keep indefinitely (cheap, no cost) |
| `nomii-wordpress-plugin.zip` URL | — | Keep 301 permanently |

**Output:** Code is Shenmay-only except historical references in docs.

---

## Phase 9 — Trademark registration complete [6–12 months post-ITU]

**Goal:** ® on the wordmark.

**Steps:**

1. **Now (parallel to Phase 2):** File USPTO ITU (Intent-to-Use) via
   Trademark Center, Class 9 + 42 (`$350 × 2 = $700`). Establishes
   priority date.
2. Wait for USPTO examination (~3–6 months). Respond to any office
   actions. Hire attorney (~$500–1,500) only if office action is
   non-trivial.
3. Once published + no opposition filed: file Statement of Use (SOU,
   $100) after Phase 2 ships (product is in commerce under Shenmay).
4. Receive registration certificate (~8–12 months from filing).
5. Update wordmark + marketing to `Shenmay®` / `Shenmay AI®`.

---

## Parallel work items (anytime)

- **USPTO ITU filing** — do **now**. Every day of delay is a day of
  priority-date loss.
- **Social handles** — claim `@shenmay` and `@shenmayai` on X, LinkedIn,
  GitHub, YouTube if not already secured.
- **Ponten-solutions marketing page** — currently at
  `pontensolutions.com/products/nomii-ai`. Rename to
  `pontensolutions.com/products/shenmay-ai`. Lovable manual Publish
  required.
- **`shenmay.com` aftermarket** — listed on Afternic at $458 buy-now.
  Owner's registration expires 2026-08-05. Strategy: make a $275 offer
  via Afternic; if declined, either pay $458 or wait for potential drop
  at expiry. `.ai` is sufficient as canonical; `.com` is defensive.

---

## Skipped intentionally

- `shenmay.io` domain — not worth $80/2yr when `.ai` is canonical
- `shenmay.com` immediate buy — see parallel items
- Cloudflare tunnel `knomi-ai` rename — shared with Lateris
- Trademark attorney for clean filing — DIY sufficient for solo founder;
  hire only on office action
- Repo rename (`jafools/nomii-ai` → `jafools/shenmay-ai`) — GitHub
  handles redirects; purely cosmetic; defer indefinitely

---

## Cost estimate through Phase 9

| Line item | When | Estimate |
|---|---|---|
| Domain `shenmay.ai` | 2026-04-20 (paid) | $160 (2yr) |
| USPTO ITU filing fee (Class 9 + 42) | parallel / ASAP | $700 |
| Statement of Use fee | Phase 9 (~6mo out) | $100 |
| `shenmay.com` aftermarket (optional) | anytime | $275–500 |
| Attorney (if office action) | contingent | $500–1,500 |
| **Total through registration** | | **~$960–$2,960** |

---

## Customer communication email

The polished, send-ready version (HTML + plain-text + send-list SQL +
pre-send checklist + timing) lives in [`docs/CUSTOMER_COMMS_SHENMAY_EMAIL.md`](./CUSTOMER_COMMS_SHENMAY_EMAIL.md).

**Timing:** ship the email BEFORE Phase 5c (localStorage migration) or 5f
(WP plugin URL change) merges. The email is NOT a prerequisite for the
already-shipped Phase 5 bundle A (v2.4.0) — those changes are silent
backend additions.

---

## How to use this doc

- Each phase gets its own PR, commit prefix `refactor(brand):` or
  `feat(brand):`.
- Phase 5 is the customer-impact window — send the comms email before
  merging.
- Phase 6 + 7 require maintenance windows — schedule 48h in advance.
- When a phase ships, mark it here + update memory file
  `project_shenmay_rebrand.md`.

## Changelog

- 2026-04-20 (morning) — initial plan drafted
- 2026-04-20 (afternoon) — Phase 1 decisions locked (domain, design, sweep strategy)
- 2026-04-20 (evening) — **Phase 1 shipped**; plan rewritten forward through Phase 9
