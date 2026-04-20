# Nomii → Shenmay AI Migration Plan

**Decision date:** 2026-04-20
**Target brand:** Shenmay AI
**Status:** Planning — no code changes yet

---

## Why this migration

`Nomii` is phonetically identical to `Nomi` (registered US trademark of glimpse.ai,
Inc. — the Nomi.ai AI companion platform). Under USPTO likelihood-of-confusion
analysis, a one-letter spelling difference with identical phonetics and overlapping
Nice classes (Class 9 software, Class 42 SaaS) is generally held confusingly
similar. Continuing under `Nomii` exposes the product to:

- USPTO opposition or refusal of any trademark filing
- Cease-and-desist risk from glimpse.ai
- SEO dilution (nomi.ai has ~1.1M monthly visits)
- Customer confusion in enterprise procurement reviews

`Shenmay AI` resolves all three:

- **Brand:** An English-spelled word that an English speaker naturally pronounces
  as "SHEN-MAY" — which is how Swedish-speakers colloquially pronounce
  *"Känn mej"* ("know me"). Hidden-meaning construction: the brand says its
  value proposition every time someone speaks it, without requiring knowledge of
  Swedish.
- **Trademark:** No collisions found in USPTO preliminary scan for AI / software
  classes. Arbitrary/fanciful mark → strongest TM category.
- **Domains:** `shenmay.com`, `shenmay.ai`, `shenmay.io` all unregistered as of
  this scan.
- **Heritage:** Authentic — founder is Swedish. Fits the Scandinavian-B2B
  archetype (Spotify, Klarna, IKEA, Minecraft, Acne Studios).

## Brand primer (for marketing / customer comms)

> **Shenmay** is how *"Känn mej"* sounds when spoken — Swedish for "know me."
> Our AI helps you know your customers. That's the whole idea.

- **Wordmark rendering:** `Shenmay` or `shenmay` (typography carries the elegance;
  do not use `Shen May` with a space, do not hyphenate)
- **Product name:** `Shenmay AI`
- **Company rename scope:** Shenmay AI is a *product* of Ponten Solutions.
  `pontensolutions.com` stays unchanged. Do not rename the parent company.
- **Pronunciation:** "SHEN-MAY" (rhymes with "when-day")
- **Tagline seed:** *"Shenmay is Swedish for 'know me.' Our AI knows your customers."*

---

## Workstreams

There are 9 parallel workstreams. Some must happen before others; see the phased
sequence below for ordering.

| # | Workstream | Owner | Blocking |
|---|------------|-------|----------|
| 1 | **Legal / trademark clearance + ITU filing** | Austin (with attorney) | Public launch |
| 2 | **Domain purchases** | Austin | Brand assets |
| 3 | **Brand design (logo, typography, palette)** | Austin + Claude | Code sweep |
| 4 | **Codebase sweep** (1,738 refs across 185 files) | Claude | Staging deploy |
| 5 | **Infrastructure (DNS, Cloudflare, SSL, Docker, GHCR, DB)** | Austin + Claude | Production cutover |
| 6 | **UI / asset replacement (SVG, favicon, email templates)** | Claude | Staging deploy |
| 7 | **Marketing site update (ponten-solutions / Lovable)** | Austin (Lovable publish) | Production cutover |
| 8 | **Customer communications (SaaS + on-prem)** | Austin (signs off) + Claude (drafts) | Production cutover |
| 9 | **Deprecation (301s, sunset plan for nomii.*)** | Claude | Ongoing post-cutover |

---

## Phased sequence

### Phase 0 — Pre-work (Days 1–2)

**No user-facing changes.**

- [ ] Austin: engage a US trademark attorney for a clearance opinion on "Shenmay"
      in Class 9 (software) + Class 42 (SaaS). Expect $500–1,500.
- [ ] Austin: file USPTO Intent-to-Use (ITU) application for `SHENMAY` word mark.
      Filing fee ~$350/class. Can be DIY via Trademark Center but attorney is
      safer for first filing.
- [ ] Austin: buy domains. Recommended: `shenmay.com`, `shenmay.ai`, `shenmay.io`.
      Defensive: `shenmay.co`, `shenmay.app`, `getshenmay.com`. Use Cloudflare
      Registrar or Namecheap. Expect $100–200 total first year.
- [ ] Austin: grab social handles — `@shenmay` and `@shenmayai` on X, LinkedIn,
      GitHub, YouTube. Free, but only one person can own each — squat fast.
- [ ] Claude: design initial logo concepts (wordmark SVG + favicon). See
      "Design direction" below.
- [ ] Claude: draft brand guidelines doc (`docs/BRAND.md`) — colors, typography,
      voice.

### Phase 1 — Code sweep (Day 3, on a feature branch)

**Everything happens on `feat/shenmay-rename`. No merge to main yet.**

Order of operations within the sweep matters — changing DB schema before UI
code referencing it breaks staging.

1. **Text replacement pass** (~1,738 occurrences):
   - `Nomii` → `Shenmay` (PascalCase — in component/class names)
   - `nomii` → `shenmay` (lowercase — in URL paths, CSS classes, env vars, DB identifiers, file paths)
   - `NOMII` → `SHENMAY` (upper — in constants, env vars like `NOMII_LICENSE_MASTER`)
   - `Nomii AI` → `Shenmay AI` (product name string)
2. **Filename renames** (14+ React files):
   - `client/src/pages/nomii/Nomii*.jsx` → `client/src/pages/shenmay/Shenmay*.jsx`
   - `client/src/components/nomii/` → `client/src/components/shenmay/`
   - `client/src/layouts/NomiiDashboardLayout.jsx` → `ShenmayDashboardLayout.jsx`
   - `client/src/contexts/NomiiAuthContext.jsx` → `ShenmayAuthContext.jsx`
   - `client/src/lib/nomiiApi.js` → `shenmayApi.js`
3. **Asset renames** (11 SVGs):
   - `Company Logos/nomiiai_*.svg` → `Company Logos/shenmay_*.svg`
   - `client/src/assets/nomiiai-*.svg` → `client/src/assets/shenmay-*.svg`
   - Replace contents with new Shenmay wordmark SVGs
4. **Also sweep `knomi` references** (56 occurrences across 6 files — leftover
   from the prior `knomi → nomii` rename). Kill all of them in this pass.
5. **CI must stay green.** Run `npm run build`, `npm test`, and the Playwright
   suite in staging before merge.

### Phase 2 — Infrastructure prep (Day 4)

Still no user-facing changes. Parallel to code review.

- [ ] DNS: add `shenmay.ai` A record pointing to Hetzner (`204.168.232.24`)
- [ ] DNS: add `staging.shenmay.ai` CNAME to the Cloudflare tunnel used by Proxmox staging
- [ ] Cloudflare: issue new Origin CA cert for `*.shenmay.ai` (valid until 2041)
- [ ] Cloudflare tunnel: rename `knomi-ai` tunnel OR create `shenmay-ai` tunnel in parallel.
      Recommendation: create new tunnel, keep old running during transition.
- [ ] GHCR: update workflow to publish `shenmay-backend` / `shenmay-frontend` image names.
      Old `nomii-backend` / `nomii-frontend` tags stay accessible for on-prem rollback window.
- [ ] DB container: rename from `nomii-db` → `shenmay-db` (requires container recreate,
      NOT a data migration — volume stays mounted)
- [ ] Docker compose: rename services (`nomii-backend` → `shenmay-backend`, etc.)
- [ ] Docker compose: container names, network names (`nomii-network` → `shenmay-network`)
- [ ] Proxmox staging refresh script: update image tag references

**DB name decision:** keep the PostgreSQL database named `nomii_ai` for now. Renaming
a live Postgres DB requires disconnecting all sessions, running `ALTER DATABASE`,
and updating all connection strings in one coordinated window. **Defer to Phase 5.**
The DB name is internal and invisible to customers.

### Phase 3 — Staging cutover (Day 5)

- [ ] Merge `feat/shenmay-rename` to `main` via PR (CI green)
- [ ] Proxmox staging refresh pulls new `:edge` images
- [ ] Verify `staging.shenmay.ai` loads, login works, widget works, email works
- [ ] Run full Playwright E2E suite against staging
- [ ] Click through every dashboard page manually
- [ ] Test embed widget on a test page
- [ ] Leave `nomii-staging.pontensolutions.com` running in parallel for 48h regression window

### Phase 4 — Production cutover (Day 7, scheduled Sunday low-traffic window)

- [ ] Cut release tag: `git tag v2.0.0` (major version — breaking brand change)
- [ ] GHCR rebuilds `:v2.0.0`, `:v2.0`, `:stable`, `:latest`
- [ ] SSH to Hetzner: checkout tag, `docker compose pull`, `docker compose up -d`
- [ ] Verify `https://shenmay.ai` is live end-to-end
- [ ] Add 301 redirects: `nomii.pontensolutions.com/*` → `shenmay.ai/*`
- [ ] Update `pontensolutions.com/products/nomii-ai` → `pontensolutions.com/products/shenmay-ai`
      (commit to `ponten-solutions` repo, then **Austin must Publish in Lovable** —
      see `reference_lovable_manual_publish.md`)
- [ ] Send customer notification emails (see "Customer comms" below)
- [ ] Update all public docs, README, LinkedIn, social profiles

### Phase 5 — DB rename (Day 14, optional / deferred)

Only execute if we want `nomii_ai` → `shenmay_ai` internally. Not customer-facing,
purely a code-hygiene call.

- [ ] Schedule 10-minute maintenance window
- [ ] `docker compose stop backend` (cut off connections)
- [ ] `psql -c "ALTER DATABASE nomii_ai RENAME TO shenmay_ai;"`
- [ ] Update `DATABASE_URL` in Hetzner `.env` + Proxmox staging `.env`
- [ ] `docker compose up -d backend`
- [ ] Verify

### Phase 6 — Sunset (Month 2–6)

- [ ] On-prem customers migrate to Shenmay-branded image via documented upgrade guide
- [ ] After 90 days: decommission `nomii-backend` / `nomii-frontend` GHCR image publishing
- [ ] After 180 days: remove `nomii.pontensolutions.com` DNS record (keep 301 to shenmay.ai)
- [ ] After trademark registration certificate issues (typically 8–12 months from filing):
      add ® to wordmark

---

## Design direction

### What I (Claude) can do well
- Wordmark SVG (text-based logo) — I can produce clean, scalable SVG directly
- Favicon (SVG + 16/32/48 pixel PNG exports via a small conversion step)
- Email template header graphics
- Color palette + typography spec as a brand guidelines markdown

### What a human designer does better
- Illustrative/symbolic logo mark (an icon, not just type)
- Polished hero imagery for marketing
- Motion / animated logo

### Recommendation for now
Start with a **typography-forward wordmark** (no icon) — a strategy that
companies like Stripe, Notion, Linear, Vercel, Klarna, and Figma have all
validated. A strong wordmark is cheaper, faster, and scales to every surface
from favicon to billboard. Austin can add an illustrative mark later if the
brand calls for one.

### Visual hypothesis (to iterate on)
- **Type:** geometric sans-serif with a slightly humanist warmth (Inter,
  Söhne, or Neue Haas Grotesk family). Scandinavian brands favor this register.
- **Case:** lowercase `shenmay` — modern, approachable, matches the
  "known-by-an-AI" emotional tone
- **Color:** a single brand color + neutrals. Suggested starting point: a
  desaturated teal or warm slate — both test well in B2B AI and feel
  Scandinavian-restrained (think Klarna pink as an inspiration for *conviction*,
  not palette match)
- **Logo lockup:** `shenmay` or `shenmay AI` — decide based on use case
  (product UI = `shenmay`, marketing = `shenmay AI`)

### "Claude Design" — honest note
I'm not aware of an Anthropic product specifically called "Claude Design." The
practical AI-assisted design tools available today:

| Tool | Best for | Cost |
|------|----------|------|
| **Claude (me) generating SVG** | Wordmark, favicon, simple marks | $0 (this session) |
| **Figma + AI plugins (Magician, Figma AI)** | Full brand system, components | Figma subscription + plugins |
| **Lovable** (you already use it for ponten-solutions) | Landing pages, marketing | Already paid |
| **Midjourney / Ideogram** | Logo concept exploration, hero imagery | ~$10–30/mo |
| **Fiverr / 99designs** | Human designer for final polish | $100–500 one-time |

Suggested path for Shenmay specifically: **I design the wordmark + favicon
in SVG during the code sweep (free, fast). You use Lovable for the marketing
site update (already your workflow). Defer any illustrative mark until the
brand is shipped and you've decided if you want one.**

---

## What Austin must do personally

These are blocked by you, not me:

1. **Attorney engagement** — trademark clearance + ITU filing. Not legal advice
   from me.
2. **Domain purchases** — you're the billing owner.
3. **Social handle claims** — requires your accounts.
4. **Taste calls on logo direction** — I'll propose; you decide.
5. **Lovable publish** for the ponten-solutions marketing update.
6. **Final send on customer comms** — your signature, your voice.
7. **Approve the production cutover window** — I don't schedule downtime
   unilaterally.

## What I can drive end-to-end

1. **Codebase sweep PR** — all 1,738 references, filename renames, asset swaps.
2. **Wordmark + favicon SVG** — first draft in the sweep PR.
3. **Brand guidelines doc** (`docs/BRAND.md`).
4. **Migration scripts** — DB rename, env var updates, Docker compose.
5. **Nginx / Cloudflare config changes.**
6. **Customer comms drafts** — SaaS email + on-prem migration guide.
7. **README, docs, SESSION_NOTES** updates.
8. **301 redirect config** for `nomii.pontensolutions.com`.

---

## Cost estimate

| Line item | Estimate |
|-----------|----------|
| Trademark attorney (clearance + ITU) | $500–1,500 |
| USPTO filing fee (Class 9 + 42) | ~$700 |
| Domains (shenmay.com / .ai / .io, first year) | $100–200 |
| Defensive domains (optional) | $50–100 |
| Design (I do it; no outsourcing) | $0 |
| Email / brand-mark refresh (if outsourced later) | $0–500 |
| **Total to launch-ready** | **~$1,350–$3,000** |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `shenmay.com` gets squatted during Phase 0 | Medium | High | Austin buys domain on Day 1, before any public mention of the name |
| USPTO issues office action on ITU filing | Medium | Medium | Attorney can handle; adds 2–6 months to registration but doesn't block commercial use |
| A `nomii` reference is missed in the sweep | Low | Low–Medium | Automated grep + manual review + CI runs + staging soak; post-cutover grep pass |
| DB rename fails mid-transaction | Low | High | Defer DB rename to Phase 5; run during scheduled window; have rollback script |
| On-prem customer upgrade breaks | Low | Medium | Provide both `:nomii-stable` and `:shenmay-stable` for 90 days; write clear upgrade guide |
| Customer confusion / churn from rename | Low | Medium | Transparent email, story about the "know me" meaning, show the origin |
| Lovable manual publish forgotten | Medium | Low | Explicit checklist item; grep-verify production bundle per `reference_lovable_manual_publish.md` |

---

## Customer communication draft (v0.1)

**Subject:** We're now Shenmay AI

Hi [first name],

A short note to let you know Nomii is now **Shenmay AI** — same product,
same team, same login, new name.

Why the rename? The short version: our previous name was too close to an
existing AI product, and we wanted something uniquely ours before we ship more.

*Shenmay* is how *"Känn mej"* sounds when spoken — Swedish for "know me."
It's the whole point of the product.

**What changes for you:**
- Your login URL is now `https://shenmay.ai` (the old URL redirects)
- Your widget embed code stays the same — we've mirrored the old endpoint
- Your API keys, data, and integrations are unchanged

Nothing else moves. Questions → just reply.

— Austin, Shenmay AI

---

## Immediate next 48 hours

In priority order:

1. **Austin:** Buy `shenmay.com`, `shenmay.ai`, `shenmay.io` **today**.
   (The .com being unregistered is a time-sensitive asset — grab it before
   you tell anyone the name.)
2. **Austin:** Grab `@shenmay` social handles on X, LinkedIn, GitHub.
3. **Austin:** Email a trademark attorney to book a clearance consult for
   Shenmay in Class 9 + 42.
4. **Claude:** Design wordmark SVG drafts for Austin to review.
5. **Claude:** Scope the code sweep PR and open a draft on
   `feat/shenmay-rename`.

Once 1–3 are done, Phase 1 can start safely.

---

## Decisions locked on 2026-04-20

These decisions have been made and override the ranges/options above.

### Domain strategy: `shenmay.ai` only
- **Registered:** `shenmay.ai` at **Cloudflare Registrar** for ~$160 / 2 years
  (registry-enforced 2-year minimum for `.ai`). At-cost pricing, free WHOIS
  privacy.
- **Skipped (for now):** `shenmay.com` ($458 on Afternic — deferred; if the
  owner doesn't renew on 2026-08-05 it drops and can be re-attempted; still
  parked with no active site so SEO contamination is low). `shenmay.io`
  (~$80 / 2 years — skipped, can buy later if still available).
- **Canonical URL in production:** `shenmay.ai` (once DNS is configured and
  Cloudflare Origin CA re-issued). During transition, continue serving from
  `shenmay.pontensolutions.com` and 301-redirect from the registered `.ai`.
- **On-prem customers** continue to self-host; the brand change is cosmetic
  to them, their domains are customer-owned.

### Trademark: DIY via USPTO Trademark Center (not attorney-assisted)
- Target classes: 9 (software) + 42 (SaaS). Filing fee ~$350/class = ~$700.
- **Deferred** until wordmark + initial brand assets exist (USPTO likes to
  see the intended mark + specimen of use). Practical timing: after Phase 3
  staging cutover.
- If funds are tighter, file Class 42 only first ($350), add Class 9 later.

### Brand design: Claude-generated wordmark, no outsourced designer yet
- Typography-forward wordmark, lowercase `shenmay`. No illustrative icon.
- Typeface direction: geometric humanist sans-serif (Inter as a safe web-safe
  proxy; can commission a custom wordmark later if needed).
- Color: carry forward the warm gold (`#C9A84C`) from the existing Nomii
  brand as an accent for continuity — change the name, keep the visual
  warmth. Primary text in near-black (`#111827`) on light surfaces.
- Favicon: simplified "S" mark derived from the wordmark.

### Migration sweep: phased, not big-bang
The 1,738 `nomii` references are not uniformly safe to text-replace. Three
categories:

1. **Safe text swap** (~90% of references) — UI copy, page titles, component
   names, file names, docs, marketing strings. Runs in Phase 1 as a single
   automated sweep with manual review.

2. **Backward-compat shim required** — env vars (`NOMII_DEPLOYMENT`,
   `NOMII_LICENSE_MASTER`, `NOMII_LICENSE_KEY`, `NOMII_PUBLIC_URL`,
   `NOMII_GITHUB_REF`, etc.). On-prem customers have these set in their
   `.env` files; a hard rename breaks their deployments on next pull.
   Server code reads `SHENMAY_* || NOMII_*` for one release cycle, logs
   deprecation warning when the old var is used. Documented customer
   migration: rename env vars on their next maintenance window.

3. **301 redirect required** — client-side URL paths (`/nomii/login`,
   `/nomii/dashboard`, `/nomii/verify/:token`, etc.). Already-sent email
   magic links point at `/nomii/*` routes; we can't break those. Mount both
   `/shenmay/*` (canonical) and `/nomii/*` (legacy, 301 to canonical) for at
   least 180 days.

Docker container names, GHCR image names, DB name stay on `nomii-*` through
Phase 1–3; rename in Phase 4 as a coordinated ops change.
