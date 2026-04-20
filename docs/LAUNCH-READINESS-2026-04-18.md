# Shenmay AI — Launch-Readiness Assessment (2026-04-18)

> **Context:** Austin's explicit launch bar is "strangers can do the entire
> E2E setup + payment + dashboard features without any bugs or breaking."
> This doc catalogs what's ready, what isn't, and the exact steps needed
> to close the gap.
>
> Solo static + API sweep only — no live stranger walkthrough yet. That's
> a must-do before cutting the marketing push.

## TL;DR

Shenmay is **close but not launch-ready.** Infrastructure (CI, staging, release
flow, backups, monitoring scaffold) is in place. The product flow works for
the happy path that's been tested. The remaining gaps are concentrated in
four areas:

1. **Stripe test mode on staging** — billing is untested end-to-end against
   real test keys. This is the #1 unblock.
2. **One live stranger walkthrough of the SaaS signup flow** — nothing
   substitutes for an outside eye on the onboarding wizard, empty-state
   copy, and error messages.
3. **Self-hosted install flow** — also needs a live walkthrough, especially
   with a customer who didn't write it.
4. **Two fixable-solo issues** found during this audit (below) — addressed
   in the PR that ships this doc.

---

## What's ready (no action needed)

| Area | State |
|---|---|
| Signup API — `POST /api/onboard/register` | ✅ Validates fields, structured error shape (see `docs/API-CONVENTIONS.md`), register rate limit configurable, returns `pending_verification` when SMTP is configured |
| Login API — `POST /api/onboard/login` | ✅ Clean error on bad creds, blocks unverified emails |
| Forgot-password — `POST /api/onboard/forgot-password` | ✅ Does not leak existence of the email (returns "if that email is registered…" regardless) |
| Verify email — `GET /api/onboard/verify/:token` | ✅ Clear error on bad/expired token |
| Dashboard first-load — `NomiiOverview.jsx` | ✅ Skeleton loaders, handles empty data, 15s background refresh, subscription-fetch failure doesn't block dashboard |
| Subscription gate — `SubscriptionGate.jsx` | ✅ Calls `createCheckout`, handles checkout URL redirect |
| Widget embed generator — `Step4InstallWidget.jsx` | ✅ Covers WordPress, Webflow, Squarespace, Wix, Shopify, React, generic HTML. Snippet strings are generated from `window.location.origin` fallback → works whether same-origin or VITE_API_BASE_URL is set |
| Widget-verification polling | ✅ Polls `/api/portal/me` every 5s, surfaces a toast + auto-advances when `widget_verified` flips |
| Self-hosted first-install wizard — `NomiiSetup.jsx` | ✅ Three-step wizard, validates API key prefix (`sk-ant-`), password match, email format |
| Data API (`/api/v1/customers[/records]`) | ✅ Endpoints wired, per-key rate limits, bcrypt-hashed keys, upsert semantics |
| Release flow | ✅ main-protected, CI green-gated, `:edge`→`:stable` split, Hetzner deploy documented |
| Log rotation (Finding #9) | ✅ 50MB cap per container |
| DB backups (Finding #8) | ✅ Daily cron, 14-day retention |
| Rate limits | ✅ Login 3/15min, Register 3/hour, Widget 6/min — all env-overridable |

---

## What isn't ready (ordered by launch blocker priority)

### 1. Stripe test mode on staging — **blocks real E2E of payment flow**

**Why it matters:** `/api/portal/billing/checkout` exists and looks correct,
but no one has actually walked through the flow on staging with test-mode
Stripe keys. A stranger who signs up, trials, and clicks "Upgrade" is the
moment of truth. Right now if they clicked Upgrade on staging they'd get
HTTP 503 "Billing is not yet configured. Please contact support" (which
is at least a graceful failure, but it's not real testing).

**What to do (~10 min, Austin only):**

1. Log into Stripe test mode
2. Create test products matching the three plans (starter/growth/professional)
3. Copy the test secret key → staging `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_PRICE_PROFESSIONAL=price_...
   ```
4. Set up a test webhook endpoint on Stripe pointing at
   `https://nomii-staging.pontensolutions.com/api/stripe/webhook`
5. Restart the staging backend: `ssh pontenprox "cd /root/nomii-staging && docker compose restart backend"`
6. Walk through: signup → verify → onboarding → plans page → click "Upgrade to Starter" → test card `4242 4242 4242 4242` → verify dashboard shows starter plan active

### 2. Live stranger walkthrough of SaaS signup — **blocks "no bugs" claim**

**Why it matters:** The Playwright suite (35 tests) covers the happy path,
but it's written against behavior we expect. Real strangers find things the
test author didn't imagine. At minimum, walk through once with a person
who hasn't seen the code — ideally someone whose company the product is
actually aimed at (financial / retirement / healthcare domain).

**What to do:**

1. Register a fresh test account on staging with someone else (friend,
   spouse) watching. Tell them nothing — let them navigate.
2. Score three things:
   - Does each step's copy tell them what to do next?
   - Do the error messages make sense in the user's language (not ours)?
   - Can they install the widget on a real site (WordPress plugin / plain
     HTML) and see their own message come through?
3. Capture any confusion points, broken buttons, or questions. Those are
   the launch-blocker list.

### 3. Self-hosted install walkthrough — **blocks on-prem purchase funnel**

**Why it matters:** On-prem customers run `install.sh` on an Ubuntu VM,
then hit the setup wizard, then the onboarding flow. Every step is
tested — but by us, against our own mental model.

**What to do:**

1. Spin up a fresh Ubuntu 24.04 VM (Proxmox, Hetzner, or Multipass locally)
2. Run `curl -sSL https://raw.githubusercontent.com/jafools/nomii-ai/main/scripts/install.sh | bash`
3. Walk through the setup wizard, onboarding, widget install
4. Try the license purchase flow (needs test Stripe too)

### 4. Two solo-fixable issues — **shipped in this PR**

- **Dead link to `docs.pontensolutions.com/data-api`** (`NomiiSettings.jsx:722`).
  The subdomain doesn't resolve. Customers clicking "Full API reference"
  get a DNS error. **Fix:** this PR replaces the link with a GitHub URL
  for `docs/DATA-API.md` (also added in this PR, self-contained reference
  for the entire Data API surface).
- **No Data API docs exist.** The dashboard shows a brief cURL example but
  no way to read about pagination, rate limits, error shapes, or
  `replace_category`. **Fix:** this PR adds `docs/DATA-API.md`.

---

## What's deferred but should happen soon

| # | Item | Why it's not a launch-blocker | When |
|---|---|---|---|
| A | UptimeRobot signup (Finding #14) | If SaaS dies, Austin learns when a customer tells him. Tolerable at launch with ~5 customers; bad at 50. | First month post-launch |
| B | Off-host backup destination (Hetzner Storage Box) | Local backups cover DB corruption, not VM-destroy. VM-destroy probability is ~low but non-zero. | Before 100 paying customers |
| C | Playwright wired into CI | Currently runs manually from `pontenprox`. Not blocking launch — but first regression that sneaks through will prompt this. | Within first 3 releases post-launch |
| D | `portal.js` split (3,683 LOC) | Pure tech debt. Increases merge-conflict risk during launch, doesn't affect customers. | After first stable month |
| E | Pre-portal zombie routes delete (1,646 LOC) | Dead code. No customer impact. Requires 7-day prod log grep first. | After first stable month |
| F | Published docs site (`docs.pontensolutions.com`) | GitHub Markdown works as a stopgap. A real docs site is marketing polish. | Before first major marketing push |

---

## Recommended launch sequence

Assuming you want to go live within 2 weeks:

```
Day 1  (today)   — Merge PR #13 (SaaS→GHCR), cut v1.0.3, deploy.
                   Merge this PR (launch-readiness), verify staging.
Day 2           — Set up Stripe test mode on staging (10 min).
                   Walk through full signup+payment flow yourself.
Day 3           — First live stranger walkthrough of SaaS signup.
                   Patch the 1-3 bugs they find.
Day 4           — Self-hosted install walkthrough on fresh VM.
                   Patch what breaks.
Day 5           — UptimeRobot signup (5 min).
                   Off-host backup to Hetzner Storage Box (30 min).
Day 6-7         — Second stranger walkthrough (different persona).
                   Iterate on copy + error messages.
Day 8-10        — Marketing prep. Ponten-solutions page polish.
                   Pricing clarity. Screenshot capture for marketing.
Day 11-14       — Launch. Sit near Slack. Watch the backend logs.
```

---

## How to use this doc

- Re-audit weekly during the launch runup. Move items between sections as
  they resolve.
- Any item that blocks the "strangers can do E2E without breaking" bar
  must be closed before marketing goes live. Everything else can be
  post-launch.

---

## Related

- [`docs/AUDIT-2026-04-17.md`](AUDIT-2026-04-17.md) — 25-finding infrastructure audit
- [`docs/MONITORING.md`](MONITORING.md) — uptime monitoring recipe
- [`docs/API-CONVENTIONS.md`](API-CONVENTIONS.md) — API design conventions
- [`docs/RELEASING.md`](RELEASING.md) — release process
- [`docs/DATA-API.md`](DATA-API.md) — Data API reference (added in this PR)
