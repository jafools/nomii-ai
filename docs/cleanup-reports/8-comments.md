---
report: comment-slop-cleanup
branch: worktree-agent-a174798c
base: 0566e49
commits: 4
date: 2026-04-15
---

# Comment Slop Cleanup — Session 8

## Methodology

Systematic grep sweeps of `server/src/**` and `client/src/**` (JS/JSX only — TS files in `client/src/components/ui/` are shadcn-imported and left untouched) for the following AI-slop patterns:

1. Past-tense change descriptions — `// Updated`, `// Now`, `// Previously`, `// Replaced`, `// Refactored`, `// Renamed`, `// Keep old name…` — in-flight refactor narration that lingers after the refactor lands.
2. In-motion future-tense TODOs — `// TODO: implement`, `// This will`, `// In the future` — stale when left behind.
3. `console.log` triage — kept all structured-prefix production logs (`[License]`, `[Email]`, `[Widget]`, `[Stripe]`, `[SoulGenerator]`, `[DataRetention]`, `[Audit]`, `[ToolExecutor]`, `[LLM]`, `[MemoryUpdater]`, `[Onboard]`, `[Portal]`, `[Setup]`, `[Subscription]`, `[Self-Hosted]`). Found zero `[DEBUG]`-style debug leftovers. Client has zero `console.*` calls.
4. ASCII decorative banners — `// ====`, `// ─────`, `// ****`.
5. Narrating one-liners — `// Loop …`, `// Get …`, `// Check …`, `// Create …`, `// Build …`, `// Set …`, etc. Only removed when confidently redundant AND near non-obvious logic where a WHY-comment could replace, or near trivial code where removal was cleaner than rewriting.
6. JSDoc block marketing copy — file-header blocks that pitched the feature rather than documenting the module contract.

For every candidate I read enough surrounding code to confirm the comment wasn't load-bearing context. When unsure, I left the comment alone (per LOW policy: defer).

## Findings — verdict per file (file:line refers to the pre-change state)

### ASCII `// ====` banner removals — verdict REMOVE or REPLACE

62 banner lines across 10 files. Every one of them wrapped a route signature or section label that is either (a) already listed in the top-of-file JSDoc route index or (b) immediately followed by the `router.post('/foo', …)` line that self-documents the same thing. Kept substantive middle lines as single-line comments where they carried real info (body schemas, one-off constraints, cross-cutting notes).

- `server/src/routes/auth.js:16–21,57–59,140–142,295–297` — REMOVE (top JSDoc already lists all four routes).
- `server/src/routes/chat.js:269–271,318–320` — REPLACE (kept the "Flag detection — keyword heuristic for MVP" label as a one-liner; dropped the Agent-naming banner entirely since the JSDoc below it already identifies the function).
- `server/src/routes/customers.js:73–75,125–131` — REMOVE + REPLACE (kept the CSV-import body schema lines, dropped the purely-decorative section banner).
- `server/src/routes/license.js:27–29,91–96` — REMOVE + REPLACE (kept the substantive "trial: 14-day, one per email" note).
- `server/src/routes/portal.js:2822–2824,2892–2894` — REPLACE (collapsed `// ===` sections to `// --- Data API key management ---` single-liner; retained landmark value in a 3000-line file).
- `server/src/routes/platform/auth.js:14–18,59–61,101–103` — REMOVE + REPLACE (kept setup's "blocks once one exists" line).
- `server/src/routes/platform/licenses.js:30–32,46–49,99–101,113–115,127–129,141–144` — REMOVE + REPLACE (kept body schema + "prefer revoke for audit trail" line).
- `server/src/routes/platform/tenants.js:21–23,44–46,198–200,239–241,300–302` — REMOVE + REPLACE (kept "creates tenant + first admin atomically" note).
- `server/src/engine/promptBuilder.js:15–17,51–53,577–579,615–617` — REMOVE + REPLACE (kept "Prompt sections" and the mock-LLM-only-when-no-API-key note).
- `server/src/services/emailService.js:745–747` — REMOVE (function name self-documents).

### Stale / slop JSDoc + inline — verdict REMOVE or REPLACE

- `server/src/engine/soulGenerator.js:10–11` — REMOVE — "This replaces manual soul seeding" is past-tense change narration.
- `server/src/engine/toolConfigurator.js:14–16` — REMOVE — marketing copy about Ponten Solutions "not touching a line of code", not technical context.
- `server/src/engine/toolConfigurator.js:26–27` — REMOVE — `// ── System prompt ──` banner plus "Instructs Claude to act…" just restates the const that follows.
- `server/src/engine/toolConfigurator.js:41,138,141` — REPLACE/REMOVE — collapsed section banner to a one-liner; dropped the two inline "Few-shot example" / "Actual request" labels inside the `messages:` array (they narrated obvious data).
- `server/src/routes/chat.js:315–325` — REPLACE — the JSDoc contained a stale "when Claude API is live" future-tense note. Claude *is* live in every call path. Rewrote to a three-line JSDoc.
- `server/src/services/emailService.js:40` — REMOVE — "Keep old name for minimal diff in callers" is a past-tense refactor tag on a trivial alias. Function name is self-explanatory.
- `client/src/components/nomii/onboarding/StepTools.jsx:233,240,243` — REMOVE/REPLACE — dropped three narrating one-liners; kept a single `// Machine name must be unique per tenant…` comment that explains the WHY of the random suffix.

### Verdict KEEP (did not touch)

- `server/public/widget.html` — OUT OF SCOPE per brief.
- All `console.log(\`[Prefix]…\`)` production logging — KEEP. These are grep targets.
- All `// SH-N` / session-note references — not encountered in the edited files, but the search pattern was applied.
- `// Legacy fallback`, `// New schema` comments in promptBuilder — KEEP. They mark a genuine migration boundary still in force.
- Numbered step comments (`// 1. …`, `// 2. …`) in chat.js, widget.js, dataRetention.js, llmService.js, portal.js — KEEP. They serve as a skimmable roadmap through long multi-step handlers (50+ lines).
- `// ── Section ──` box-drawing dividers in memoryUpdater.js, notificationService.js, licenses.js — KEEP. These carry meaningful section labels and don't wrap text with triple-line decoration.
- `// LLM call is the most likely intermittent failure point…` (widget.js:1145) — KEEP. Explains WHY this single call is the thing that gets its own try/catch.
- `// On first use, bind the license to this instance_id…` (license.js) — KEEP. Business-logic constraint.
- `// Never propagate — memory errors must never crash chat` (memoryUpdater.js:561) — KEEP. Load-bearing invariant.
- `// Search customers first, then advisors` (auth.js:27) — KEEP. Borderline narration, but it describes a semantic priority decision (customer identity wins), not just the code below.
- `// Used as a fallback if Claude is unavailable` (soulGenerator.js) — KEEP.
- `// bcrypt — graceful fallback` (portal.js:2826) — KEEP. Explains a try-catch-try pattern.
- `// We use openProp and setOpenProp for control from outside the component.` (client/src/components/ui/sidebar.tsx) — KEEP. Vendored shadcn code; out of scope for rewrites.

## Critical assessment of overall comment quality

This codebase has **good comments overall** — Austin's written prose is concrete, tenant-scope-aware, and references external constraints (Stripe webhooks, SMTP limitations, jsonb_set on encrypted columns, etc.). The slop was concentrated in two archetypes:

1. **AI-generated section scaffolding.** The `// ========` banners were mechanically inserted around every route by an earlier generation pass. They added zero context, duplicated the top-of-file route index, and fought the reader in diff review. 62 lines removed.

2. **File-header marketing copy.** A couple of engine JSDoc blocks (soulGenerator, toolConfigurator) crossed the line from "module contract" into "what this feature achieves for the business." That's an AI tell — a human would put it in the PR description, not the file header.

No narrating one-liners crossed the HIGH bar. The codebase's `// Check X`, `// Build Y`, `// Get Z` comments are *almost always* paired with either non-obvious code or a WHY that justifies them. I trimmed only three (StepTools.jsx) and one stale JSDoc paragraph.

No `[DEBUG]` console.logs. No stray TODO-from-AI patterns (`TODO: implement this properly` style). No ASCII-art decorative file banners beyond the `// ====` pattern. No in-motion refactor markers ("will be replaced when X").

## Recommendations

### HIGH

1. **Ban `// ===============` banner blocks in new code.** They're a recurring AI tic and add zero signal over what the route handler signature already shows. If a section landmark is useful in a 2000+-line file, a single `// --- Section name ---` is enough.

### MEDIUM

1. **portal.js (3600+ lines)** is long enough to warrant splitting into domain modules (settings, conversations, customers, tools, data-api-keys, admin). This is organizational debt, not comment debt, but it's what drove the banner-slop hack in the first place.
2. **promptBuilder.js** retains a "new schema / legacy fallback" split throughout. The legacy path should be retired when you're confident every tenant has migrated to the generated soul — revisit in a sprint.
3. **soulGenerator.js** has a long `buildFallbackSoul` path that was not read in full — worth checking for more stale "we'll replace this when…" notes.

### LOW

1. Consider moving feature-explanation copy out of JSDoc and into `docs/` where it can be versioned as actual documentation (not grep-noise in source).
2. The `// Features:` bulleted list at the top of `NomiiTools.jsx` is borderline — might not age well — but it's not actively harmful and didn't meet my HIGH bar.

## Implementation log

Four atomic commits on `worktree-agent-a174798c` (local only, not pushed):

| SHA | Summary | Files | ± |
|-----|---------|-------|---|
| `765bea1` | Remove ASCII banner slop in platform routes | 3 | +4 / -46 |
| `f837b09` | Remove ASCII banner slop in routes/engine/services | 7 | +13 / -66 |
| `1fcc245` | Trim AI marketing copy in engine JSDoc headers | 2 | +11 / -27 |
| `5998e10` | Remove stale past-tense change notes + narration | 3 | +4 / -14 |

**Totals:** 15 file-edits across 13 unique files, ~121 lines removed, ~32 lines replaced with tighter one-liners.

Verification:
- `node -c` passes for all 12 edited server files.
- `cd client && npm run build` passes (vite build, 2497 modules, 4.38s, no new warnings introduced).
- `console.log` triage: zero production prefixes were touched; zero `[DEBUG]` leftovers found to remove.

## Deferred

- `server/public/widget.html` — out of scope per brief (cross-origin/iframe context is fragile).
- `docker-compose*.yml`, `Dockerfile*`, `nginx.conf`, `scripts/*` — shell/YAML have their own comment conventions.
- `server/src/migrations/**` — append-only; migration comments are their own story.
- All `*.md` / `*.docx` / `*.pptx` — not "comments" per the brief.
- Vendored shadcn code under `client/src/components/ui/**` — not ours to rewrite.
- The numbered-step handler comments in widget.js and chat.js — *not* slop in my judgment; kept.
- Extensive re-reads of routes I did not touch (webhooks, flags, advisors, conversations, dataApi, customTools, tools/* handlers) — nothing surfaced in the grep sweeps, but a future pass could audit those line-by-line.
