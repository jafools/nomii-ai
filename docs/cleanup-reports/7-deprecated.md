# Cleanup Report 7: Deprecated / Legacy / Dead-fallback Code

Worktree branch: `worktree-agent-a9288f7e`
Base commit: `0566e49`
Author: cleanup sweep (Opus 4.6)

## Methodology

1. Grepped `.js/.jsx/.ts/.tsx` for `DEPRECATED|LEGACY|TODO: remove|TODO: replace|XXX|FIXME|@deprecated` — all XXXX matches were license-key placeholder strings (`NOMII-XXXX-XXXX-XXXX-XXXX`), not FIXME markers.
2. Grepped case-insensitively for `deprecated|legacy|obsolete|backcompat` — found ~15 references.
3. Scripted a scan for 8+ consecutive `//`-prefixed lines to find commented-out code blocks.
4. Scripted a scan for `// (const|let|if|await|return|function|...)` to find disabled-code-as-comment.
5. Grepped for `process.env.X || process.env.Y` env-var fallback chains.
6. Cross-referenced every server route file against client callers (`client/src/**`), widget HTML (`server/public/**`), tests, and scripts to find dead routes.
7. Scripted a duplicate-route-path scan across `server/src/routes/*.js`.
8. `git log --follow` / `git log -S` on every suspect before recommending removal.

## Findings

### 1. [HIGH — REMOVED] Shadowed duplicate route handler `POST /api/portal/tools/:toolId/test`

**Location:** `server/src/routes/portal.js` — old handler at lines 2892-2952, live intended handler at line 3472 (now 3407 after removal).

**Evidence:**
- `node` scan for duplicate `router.<method>(...)` definitions found exactly one duplicate across all route files: `POST /tools/:toolId/test` appears twice in `portal.js`.
- First handler (line 2892) was added in commit `a2daa50 feat: three-tier data model — Data API, live connector polish, enterprise marketing` — a simple webhook-test that hard-rejects any tool_type that isn't `'connect'` with "Only connect-type tools support test requests."
- Second handler (line 3472) was added in commit `f6f0edb feat: tool testing sandbox with full AI dry-run` — a full agentic sandbox that accepts `{ message, customer_id }`, loads the tool, runs `callClaudeWithTools` with only this tool available, and handles connect / report / escalate / lookup / calculate types. The commit message explicitly says "Test button now shown on ALL active tools (not just connect)."
- Client (`client/src/lib/nomiiApi.js:203`) sends `{ message, customer_id }` — the sandbox handler's body shape.
- Because Express first-match wins and the old handler was declared first, the new sandbox handler has been **unreachable since `f6f0edb` landed**. The dashboard's Test button has been returning "Only connect-type tools support test requests." for every non-connect tool.

**Action:** Removed the old webhook-only handler (and its section header "CONNECT TOOL — TEST WEBHOOK"). The sandbox handler at the bottom of the file now receives the request as the commit author intended.

**Verification:** `node -c server/src/routes/portal.js` passes. Duplicate-route scan now reports "No duplicate routes."

---

### 2. [HIGH — REPORT ONLY, deferred for Austin] Dead pre-portal REST route family

**Seven route files are mounted but have zero callers** from `client/`, `server/public/`, `tests/`, or `scripts/`. Every dashboard feature has been reimplemented under `/api/portal/*` (registered in `server/src/routes/portal.js`, 3617 lines), and the widget chat runs through `/api/widget/*`. The pre-portal routes predate that migration.

| File | Lines | Mount point | Status |
|---|---|---|---|
| `server/src/routes/chat.js` | 360 | `/api/chat` | No client/widget callers. Superseded by `/api/widget/chat` (widget.js line 899). |
| `server/src/routes/conversations.js` | 152 | `/api/conversations` | Client uses `/api/portal/conversations/*` exclusively (nomiiApi.js lines 122, 178, 180, 182, 184, 216, 265, 266, 270). |
| `server/src/routes/customers.js` | 480 | `/api/customers` | No client references. Dashboard uses `/api/portal/customers/*`. |
| `server/src/routes/advisors.js` | 118 | `/api/advisors` | No client references. |
| `server/src/routes/flags.js` | 112 | `/api/flags` | No client references. |
| `server/src/routes/tenants.js` | 160 | `/api/tenants` | No client references. |
| `server/src/routes/customTools.js` | 264 | `/api/tenants/:id/custom-tools` | No client references. Dashboard uses `/api/portal/tools/*`. `customToolLoader.js` (used by widget) is a SEPARATE, still-load-bearing module. |

**Approximate total:** ~1,646 lines of dead routing code plus corresponding `requireAuth`/`requireTenantScope` middleware usages.

**Why I did not auto-remove:** The scope is 1,600+ lines spanning 7 files, and this is a production-pending codebase with live customers imminent. The `requireAuth`/`requireTenantScope` middleware is used only by these files; if they all go, the middleware can also be simplified. Austin should confirm these aren't used by:
- The WordPress plugin (mentioned in `a3a9d1f feat: … WP plugin …`)
- Any external script, cron, or internal tool
- Documented public API (if any was published)

If confirmed-unused, recommended commits:
1. Unmount routes in `server/src/index.js:193-199` (and tidy the comment block).
2. Delete `chat.js`, `conversations.js`, `customers.js`, `advisors.js`, `flags.js`, `tenants.js`, `customTools.js`.
3. Review `server/src/middleware/auth.js` — `requireAuth`/`requireRole`/`requireTenantScope` may be entirely removable once these routes are gone (portal.js uses `requirePortalAuth` instead).

---

### 3. [MEDIUM — REPORT ONLY] `// Legacy XSS filter` comment in security.js

**Location:** `server/src/middleware/security.js:14, 51`.

`X-XSS-Protection: 1; mode=block` is labelled "Legacy XSS filter (belt + suspenders alongside CSP)". This header is deprecated by modern browsers (Chrome 78+ ignores it) but still recognised by some older browsers. "Belt + suspenders" framing is intentional defense-in-depth. **Keep.** The word "Legacy" here describes the HEADER standard, not the code.

---

### 4. [MEDIUM — REPORT ONLY] `https://app.pontensolutions.com` marked "Legacy frontend URL"

**Location:** `server/src/middleware/security.js:28`, also referenced in `docker-compose.yml:35`, `DEPLOYMENT.md:76`, `server/src/services/emailService.js:46`.

Session notes (`docs/SESSION_NOTES.md:29`) call `nomii.pontensolutions.com` the "primary" portal. `app.pontensolutions.com` is still the default `FRONTEND_URL` in `docker-compose.yml` and the `APP_URL` fallback in `emailService.js`. Removing it from CORS without a coordinated .env / DNS swap would break emails + the legacy portal URL. **Keep — defer per-site decision to Austin.**

---

### 5. [MEDIUM — REPORT ONLY] `process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY` fallback chain

**Location:** 8 call sites across `llmService.js`, `portal.js`, `tenants.js`, `seedSelfHostedTenant.js`, `soulGenerator.js`, `apiKeyService.js`, `cryptoService.js` (the last two are `JWT_SECRET` fallbacks, which are different).

`CLAUDE_API_KEY` was introduced in `ca2ff29 fix: accept CLAUDE_API_KEY as fallback for ANTHROPIC_API_KEY in llmService` — intentional operator convenience. It's documented in `README.md:116`, `DEPLOYMENT.md:67`, and both `docker-compose.yml:39` and `docker-compose.selfhosted.yml:54`. **Keep** — this is a stable public env var contract.

---

### 6. [LOW — REPORT ONLY] `updateMemoryAfterSession` "legacy entry point"

**Location:** `server/src/engine/memoryUpdater.js:573` (definition), exported at line 626 with comment `// legacy compat`.

The comment calls it "legacy entry point — kept for any code that still calls updateMemoryAfterSession." Grep confirms it IS still called from three active route files:
- `server/src/routes/widget.js:713` (end-session flow)
- `server/src/routes/portal.js:43` (import, used for takeover/handback)
- `server/src/routes/conversations.js:12` (the dead route from Finding #2)

The name is misleading but the function is load-bearing. **Defer** — should only be removed if Finding #2 lands AND `portal.js` / `widget.js` call sites are refactored to use `updateMemoryAfterExchange` directly. Not a cleanup, that's a refactor.

---

### 7. [LOW — REPORT ONLY] `promptBuilder.js` "legacy schema" fallbacks

**Location:** `server/src/engine/promptBuilder.js:91, 128, 132, 140, 211, 221, 225, 232, 239`.

Each site supports BOTH a new schema (e.g. `soul.compliance`, `comm.key_principles`, `r.category`, `r.value`) and a legacy one (e.g. `tenant.compliance_config`, `soul.behavioral_rules.personality_rules`, `r.data_category`, `r.value_primary`). `git log` shows the new schema landed in `71b0a12 feat: soul generation, customer data UI, branded invite emails`. Production DB tenants migrated via migration 019 — but any seeded or pre-migration rows still have the legacy shape. **Keep — this is a data-compatibility layer, not dead code.**

---

### 8. [LOW — REPORT ONLY] `NomiiOnboarding.jsx` legacy onboarding step keys

**Location:** `client/src/pages/nomii/NomiiOnboarding.jsx:119-127`.

Maps both short keys (`company`, `widget`) and current STEPS keys (`company_profile`, `install_widget`) to step indices. Existing tenant rows may have either shape. **Keep — data-compat.**

---

### 9. [N/A] Phase-1 "Covenant Trust" demo folder

The root-level `Covenant Trust/` folder contains seed SQL, soul/memory JSON, and Phase-1 docs. It is referenced by README as a demo persona set. Not a code directory, not mounted by any runtime file, not in scope for this cleanup task.

## Critical assessment

The codebase is clean of the usual "dead comment" markers — no `FIXME`, no `TODO: remove`, no multi-line commented-out blocks. Everything that looks superficially legacy turns out to be either:

- Deliberate backcompat for on-disk data with dual schemas (promptBuilder, onboarding steps),
- Deliberate env-var flexibility (CLAUDE_API_KEY),
- Deliberate defense-in-depth (X-XSS-Protection),
- Still-load-bearing despite the name (updateMemoryAfterSession),

...EXCEPT the two real issues found:

1. **The shadowed duplicate `/tools/:toolId/test` handler** is a latent product bug — the sandbox Test button in the tools dashboard has been broken for every non-connect tool since commit `f6f0edb` landed. This is the most valuable find of the sweep. Fixed.
2. **The pre-portal route family** is ~1,600 lines of dead routing with zero callers. Too big for me to remove unilaterally in a cleanup pass, but worth a follow-up deletion sprint once Austin confirms no out-of-repo callers.

## Recommendations

### HIGH priority
- **[DONE]** Remove the shadowed `/tools/:toolId/test` handler (lines 2892-2952 of `portal.js`) so the sandbox handler receives requests and the Test button works for non-connect tools.
- **[DEFER TO AUSTIN]** Delete the 7 dead pre-portal route files and unmount them from `index.js:193-199` once he confirms no external callers. Expected ~1,600 LOC removal.

### MEDIUM priority
- When the Hetzner cutover happens (Phase 4 in SESSION_NOTES), drop `https://app.pontensolutions.com` from the CORS allowlist, `FRONTEND_URL` default, and `APP_URL` fallback in one coordinated commit.
- Consider renaming `updateMemoryAfterSession` to something that reflects current usage, OR refactor the 3 call sites to use `updateMemoryAfterExchange` directly and delete the wrapper. Both are single-PR-sized refactors.

### LOW priority
- Nothing actionable; promptBuilder dual-schema and onboarding step-key map are load-bearing.

## Implementation log

| # | Action | Files touched | LOC |
|---|---|---|---|
| 1 | Removed shadowed webhook-only handler for `POST /tools/:toolId/test` + its section header | `server/src/routes/portal.js` | -66 |

## Deferred

- 7 dead pre-portal routes (Finding #2) — scope too large for a cleanup pass without Austin's sign-off.
- Rename/refactor of `updateMemoryAfterSession` — non-trivial refactor, not cleanup.
- `app.pontensolutions.com` allowlist entry — coupled to infra migration.

## Verify

- `node -c server/src/routes/portal.js` → OK
- Duplicate-route scan → clean
- `cd client && npm run build` → see commit verification below
