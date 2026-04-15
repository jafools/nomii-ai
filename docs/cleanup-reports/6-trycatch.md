# Cleanup 6 — Defensive try/catch Audit

**Branch:** `worktree-agent-ab89410f`  
**Scope:** `server/src/**` and `client/src/**` (JavaScript/JSX, CommonJS/ESM mix)  
**Exclusions:** `server/public/widget.html`, migrations, config, docker, scripts, tests, docs.  
**Date:** 2026-04-15  
**Base commit:** `0566e49`

---

## 1. Methodology

1. Listed all `try {` and `.catch(` occurrences in `server/src` and `client/src` via Grep.
2. Counted: **239** server catches, **95** client catches, and ~15 `.catch(() => {})` promise-chain tails → **~349 total** sites.
3. For each representative pattern family, read the surrounding context to classify:
   - **Pure `catch(err) { next(err); }` in Express route handlers** — standard async wrapper, not redundant in Express 4.
   - **Empty or comment-only `catch` around fire-and-forget side effects** — intentional best-effort.
   - **`catch` that inspects `err.name` / `err.code` / `err.status`** — meaningful branching.
   - **`catch` around `JSON.parse`, `new URL()`, `jwt.verify`** — boundary / untrusted input.
   - **`catch` around external API calls** — Anthropic, Stripe, SMTP, webhook, Cloudflare-master.
   - **`catch` around decryption / file I/O with optional fallback** — legitimate graceful degradation.
4. Sampled enough files in each family to confirm the pattern is consistent.
5. Evaluated candidate removals by asking: "If I remove this, does it propagate to a caller that handles it, or become an unhandled rejection?"

## 2. Findings Summary

| Pattern family | Count (approx) | Verdict |
|---|---|---|
| Express `catch(err) { next(err); }` route wrappers | ~120 | **KEEP** — Express 4 does not auto-propagate async throws to the global error handler. |
| LLM / Stripe / SMTP / webhook / Anthropic SDK calls | ~25 | **KEEP** — external-API boundary. |
| `JSON.parse`, `new URL()`, `jwt.verify` on untrusted input | ~15 | **KEEP** — boundary validation. |
| Fire-and-forget best-effort (`catch (_) {}`, `.catch(() => {})`) around Slack/Teams/webhook/notification/memory-update side effects | ~50 | **KEEP** — explicitly documented, serves real purpose: prevents a side-effect failure from breaking the main transaction and prevents UnhandledPromiseRejection in setImmediate/detached promises. |
| Per-tenant isolation in batch jobs (`dataRetention` purge steps, CSV import row loop) | ~8 | **KEEP** — isolation between independent units of work is the whole point. |
| React async handlers with `toast({ variant: 'destructive' })` feedback | ~60 | **KEEP** — the toast IS the UI error handling. |
| Boot-time retries / optional require (`express-rate-limit`, `seedSelfHostedTenant`, license-check) | ~6 | **KEEP** — intentional degradation with explicit branching on `err.code`. |
| JWT-verify middleware branching on `err.name === 'TokenExpiredError'` | 3 | **KEEP** — meaningful differentiation. |
| `safeDecryptJson` and `resolveApiKey` decrypt-with-fallback | 2 | **KEEP** — named for the behavior, explicit. |
| Duplicate-logging catches (log + `next(err)`) in `middleware/subscription.js` | 2 | **SIMPLIFIED** — redundant `console.error` removed, `catch(err){next(err);}` kept (§5). |
| Error-HIDING (`catch(err) { console.error(err); }` with no UI feedback) in a few React load functions | ~8 | **DEFER** — structural change required to surface (React error boundary or a toast). Not in scope of "simple removal". |

### Specific sites reviewed (selection)

| File:line | Pattern | Verdict | Reason |
|---|---|---|---|
| `server/src/index.js:52-56` | try/require with passthrough fallback | KEEP | Optional `express-rate-limit` dependency. |
| `server/src/index.js:243-254` | Startup tenant seed with `err.code` branching | KEEP | Differentiates DB-unreachable vs benign. |
| `server/src/index.js:258-264` | License check retry | KEEP | Explicitly `process.exit(1)` on fail. |
| `server/src/index.js:272-276` | Data retention cron start | KEEP | Non-fatal graceful degradation. |
| `server/src/utils/validateWebhookUrl.js:58-62` | `new URL()` parse | KEEP | Untrusted input boundary. |
| `server/src/middleware/auth.js:29-38` | jwt.verify with `err.name` check | KEEP | Differentiates expired vs invalid. |
| `server/src/middleware/platformAuth.js:26-40` | same | KEEP | same |
| `server/src/middleware/auditLog.js:63-103` | setImmediate audit write | KEEP | Fire-and-forget with explicit comment: audit must never crash request. |
| `server/src/middleware/subscription.js:133-136`, `167-170` | catch + console.error + next(err) | **SIMPLIFIED** | `console.error` was a strict subset of the global handler's log (which includes message + stack). Removed the redundant log; kept the try/catch for Express async propagation. |
| `server/src/services/llmService.js:59-63` | decrypt fallback to global key | KEEP | Meaningful graceful degradation with console.error. |
| `server/src/services/llmService.js:215-231` | Anthropic API validation | KEEP | External API with `err.status` branching. |
| `server/src/services/cryptoService.js:100-108` | `safeDecryptJson` | KEEP | Intentionally-named safe wrapper. |
| `server/src/services/licenseService.js` (all 7) | license-master API, DB upserts | KEEP | External API + optional subscription upsert. |
| `server/src/services/notificationService.js`, `webhookService.js` | `setImmediate(() => _dispatch(...).catch(() => {}))` | KEEP | Detached promise tail — removal = UnhandledPromiseRejection crash. |
| `server/src/engine/memoryUpdater.js` (3) | LLM call + JSON.parse + memory-never-crashes-chat wrapper | KEEP | Documented contract. |
| `server/src/engine/soulGenerator.js:116-119` | LLM call with fallback | KEEP | Intentional `buildFallbackSoul(tenant)` fallback on LLM failure. |
| `server/src/engine/toolConfigurator.js:154-166` | JSON.parse of LLM output, with retry extract | KEEP | Untrusted LLM output. |
| `server/src/jobs/dataRetention.js` (5) | isolated try/catch per purge step | KEEP | Intentional step-isolation. |
| `server/src/routes/*` pure `} catch (err) { next(err); }` | ~80 sites across auth, advisors, conversations, customers, flags, tenants, portal, chat, onboard, setup, license, license-checkout, platform/*, dataApi, customTools | KEEP | Express 4 async wrapper. |
| `server/src/routes/customTools.js:134-137`, `231-234`, `258-261` | catch + console.error + `res.status(500).json(...)` inline (no `next` in handler signature) | KEEP (DEFERRED for refactor) | Converting to `next(err)` is a structural change across the router; safer to leave as-is for now. |
| `server/src/routes/widget.js:49-58` | createNotification wrapper | KEEP | Explicit fire-and-forget with comment. |
| `server/src/routes/widget.js:396-400` | jwt.verify anon token | KEEP | Boundary. |
| `server/src/routes/widget.js:1363-1366` | greeting route fallback to null | KEEP | Widget greeting is explicitly documented to never block. |
| `server/src/routes/widget.js:1388-1390` | `/verify` silent swallow | KEEP | Comment: never block widget loading. |
| `server/src/routes/widget.js:1441-1444` | csat catch returning ok | KEEP | Comment: never block close flow. |
| `server/src/routes/widget.js:714-717`, `793-795`, `842`, `1005-1007`, `1251-1255`, `1437` | Slack/Teams/email fire-and-forget | KEEP | Best-effort notifications; logging and main transaction must continue. |
| `server/src/routes/portal.js:1602`, `1655`, `3614` | Slack/Teams + incrementMessageCount best-effort | KEEP | Same. |
| `server/src/routes/portal.js:249-251`, `2255-2258`, `2359-2361`, `3177-3179` | Soul auto-regen + invite email + force-summarize side effects | KEEP | Fire-and-forget side effects around a main success path; already documented with comments. |
| `server/src/routes/stripe-webhook.js:57-60`, `117-119`, `222-224` | Signature verify + retrieve-sub + event dispatch | KEEP | Stripe API boundary. |
| `server/src/routes/license-checkout.js:75-77` | Stripe session create | KEEP | Stripe API. |
| `server/src/tools/custom_tool_handler.js:229`, `236-242` | JSON.parse of response + outer webhook failure | KEEP | Untrusted response body + external API. |
| `server/src/tools/executor.js:42` | Tool executor failure | KEEP | Tool can fail arbitrarily. |
| `server/src/scripts/backfillEncryption.js` | Per-row retry | KEEP | Continues batch on individual row failure. |
| `client/src/lib/nomiiApi.js:29-33`, `289`, `303` | fetch + AbortError differentiation + error-object wrapping | KEEP | Inspect err.name, attach status/code. |
| `client/src/lib/nomiiApi.js:227` | `await res.json().catch(() => ({}))` on a failing-response body | KEEP | Response may not be JSON on error. |
| `client/src/**/*.jsx` pages with `toast({ title: "Error", ... })` | ~60 sites across dashboard/settings/onboarding | KEEP | The toast IS the error handling. |
| `client/src/pages/nomii/dashboard/NomiiSettings.jsx:556-557` | DataAPIKey load with comment `/* not critical */` | KEEP | Documented intent. |
| `client/src/pages/nomii/dashboard/NomiiSettings.jsx:1173` | LabelsSection load empty swallow | KEEP (improvable) | Removal would cause UnhandledPromiseRejection inside a React async useEffect handler. A structural fix (try/catch with setLabels([]) — already happens — plus a toast or error-boundary) is out of scope. |
| `client/src/pages/nomii/dashboard/NomiiSettings.jsx:68`, `1339`, `1587` + sibling `.catch(() => {})` tails in NomiiSignup/Login/Plans/Overview/Conversations/ConversationDetail | KEEP | Fire-and-forget branding / deployment-mode lookups; UI falls back to defaults. |

## 3. Critical Assessment

The Nomii AI codebase is **more defensive than average** but **not defensively wasteful**. Every try/catch I inspected serves at least one of these legitimate purposes:

1. **Express 4 async wrapping.** The global error middleware at `server/src/index.js:221` depends on routes calling `next(err)` — unwrapped async throws become unhandled rejections that bypass it. All ~120 `catch(err) { next(err); }` are required structural glue, not defensive noise.
2. **Best-effort side effects.** The product has many fire-and-forget side effects: Slack/Teams/webhook notifications, audit logs, memory updates, soul regeneration, email sends, quota increments. Each is wrapped so that the main transaction (replying to a customer, completing checkout, ending a session) commits and returns even when an ancillary system is down. Explicit comments on many of these confirm the intent ("Never block", "Continue even if ...", "Fire-and-forget"). Removing them would cause user-visible latency spikes and 500s when ancillary systems fail.
3. **External-API containment.** Stripe, Anthropic, license-master, SMTP, and arbitrary customer webhooks each have their own failure modes that must be translated into either a user-facing `502` + message or a best-effort log.
4. **Untrusted-input parsing.** `JSON.parse` on LLM output, webhook bodies, widget message tokens; `new URL()` on customer-supplied webhook URLs; `jwt.verify` on widget session tokens. All are real boundaries.
5. **Graceful degradation with explicit branching.** `err.name === 'TokenExpiredError'`, `err.code === 'ECONNREFUSED'`, `err.status === 401`. These are the opposite of error-hiding — they inspect and act.

The **error-hiding smell** (`catch(err) { console.error(err); }` in React load functions) does exist in ~8 places, but removing the `try/catch` there would produce React UnhandledPromiseRejection and blank-screen behavior — strictly worse than the current state. A proper fix involves an ErrorBoundary or toast infrastructure, which is out of scope for a single-concern cleanup.

The **duplicate-log smell** (log in catch, also `next(err)` logs via global handler) in `middleware/subscription.js` is real but marginal — the `[Subscription]` prefix aids production log grepping and would likely be added back after removal.

## 4. Recommendations

**HIGH — 1 applied.** `middleware/subscription.js` duplicate-log cleanup (see §5).

The rest of the codebase is well-engineered for its three-mode (SaaS / Self-Hosted / License-Master) deployment model and its fire-and-forget notification fabric — no other catch met the bar of "pure no-op with safe removal path".

**MEDIUM — backlog (no changes made this session):**
- `routes/customTools.js:134-137`, `231-234`, `258-261`: convert from `(req, res)` + inline `res.status(500)` to `(req, res, next)` + `next(err)` for consistency with the rest of the routers. Structural, not a simple removal. Left alone.
- `pages/nomii/dashboard/NomiiSettings.jsx:1173` and a handful of other React load empty-swallows: add a toast on failure, or ensure the parent component has an ErrorBoundary so the swallow becomes unnecessary. Out of scope for "remove defensive try/catch".

**LOW — do not touch:**
- All `catch(err) { next(err); }` Express wrappers.
- All widget-side best-effort blocks (explicit requirement of the widget UX).
- All LLM/Stripe/SMTP/external-webhook catches.
- `JSON.parse` / `new URL()` / `jwt.verify` boundaries.

## 5. Implementation Log

### Change 1 — Drop duplicate-log lines in subscription middleware

**File:** `server/src/middleware/subscription.js`  
**Lines removed:** `134` (Portal) and `168` (Widget) — `console.error('[Subscription] ... failed:', err.message);`  
**Kept:** the surrounding `try { ... } catch (err) { next(err); }` — required for Express 4 async-error propagation.

**Why safe:** the global error handler at `server/src/index.js:221` already logs every 5xx at that level, including the error message and full stack. The subscription middleware's `console.error(..., err.message)` was a strict subset of that (no stack), so its only effect was to add a `[Subscription]` label. The label is not referenced by any alerting rule (verified via Grep for `\[Subscription\]`). Net result: identical observability, one less line of duplicate noise.

**Commit:** (see §7).

### Other candidates left alone

The task rules state: "WHEN YOU REMOVE: do NOT replace with bare `await` that will silently unhandled-promise-reject. Ensure the caller chain either catches meaningfully or the server's global error middleware handles it. If unclear, DEFER."

Every other HIGH candidate I examined fell into one of these post-removal failure modes:
- Unhandled promise rejection in `setImmediate` / detached promise (would crash the Node process or log a noisy Node warning repeatedly).
- Unhandled promise rejection in a React `useEffect` async handler (would cause a console warning and a partially-loaded page).
- Skipping `next(err)` to the global Express error middleware (would cause the HTTP request to hang until client timeout, a strictly worse UX than a 500).
- Collapsing an explicit `err.name === '...'` branch would produce identical-looking 401s that are harder to diagnose.

Given the product is "B2B SaaS / self-hosted, live customers imminent", the downside of an aggressive removal (flaky behavior under partial-failure conditions like SMTP down, Slack down, LLM timeout) is materially worse than the readability cost of keeping the defensive blocks.

## 6. Deferred

| Item | Reason |
|---|---|
| `routes/customTools.js` inline 500s → `next(err)` refactor | Structural change (signature `(req, res)` → `(req, res, next)`); belongs in a "route handler consistency" pass, not a try/catch removal pass. |
| React load empty-swallows (NomiiSettings, etc.) | Needs toast infrastructure or ErrorBoundary decision; out of scope. |
| Auditing whether `[Widget]`, `[DataRetention]`, `[License]`, `[MemoryUpdater]` etc. log prefixes are load-bearing for any log-based alerts | Out of scope; this cleanup should not change observability semantics blindly. |

## 7. Verification

- `node -c server/src/middleware/subscription.js` → OK.
- `git diff` confirms only the two `console.error` lines removed in the single edited file.
- No test suite run (Node tests not wired for MCP agent env; syntax-check + grep for `[Subscription]` usage suffices).
- Client build not re-run: edit is in `server/src`, no client files changed.

---

**Bottom line:** Nomii AI's try/catch usage is *consistently purposeful*. The defensive blocks protect the main transaction from ancillary-system failures (Slack/Teams/SMTP/webhook), respect Express 4's async-throw semantics, and contain external-API and untrusted-input risks at boundaries. A single duplicate-log simplification was applied in `middleware/subscription.js` (2 lines, 0 structural change); no other HIGH-confidence removals were identified.
