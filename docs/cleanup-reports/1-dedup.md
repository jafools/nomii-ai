# Cleanup Report 1 — Duplication / DRY

Branch: `worktree-agent-a6afd43a`
Base: `main` @ `0566e49`
Scope: identify code duplication across `server/src/` (Express routes,
middleware, utils) and `client/src/` (React pages, hooks, lib, components).
Apply DRY *only where it reduces complexity for the reader*.

## Methodology

1. Mapped the shape of the codebase (`server/src/routes` — 17 JS files,
   ~9k lines total; `client/src/pages/nomii/dashboard` — 12 JSX files;
   `client/src/lib` — API + utils).
2. Grep for recurring signatures:
   - client: `const relativeTime`, `const fmtTime`, `const card`,
     `linear-gradient(135deg, #C9A84C, #B8943F)`, `navigator.clipboard`,
     `Retry` button markup, `URL.createObjectURL(blob)`.
   - server: `requireAuth`, `req.user`, `req.tenant_id`,
     `res.status(401).json(...)`, `async function requireTenantAccess`.
3. For every candidate cluster, read *all* call sites before proposing
   an extraction. Verified whether differences were incidental
   (formatting only) or semantic (different keys, different return
   shapes, different consumer expectations).
4. Applied a strict rule: only extract if the caller gets easier to
   read. Otherwise demote the finding to MEDIUM/LOW with a write-up.
5. Verified each extraction with `cd client && npm run build` and
   `node -c` on adjacent server files.

## Findings

### Time formatters (client)

Near-identical relative-time / format-time helpers inlined in multiple
dashboard pages:

- `client/src/pages/nomii/dashboard/NomiiOverview.jsx:8` — `relativeTime`
- `client/src/pages/nomii/dashboard/NomiiOverview.jsx:22` — `relativeDay`
- `client/src/pages/nomii/dashboard/NomiiConversations.jsx:18` — `relTime`
- `client/src/pages/nomii/dashboard/NomiiConversations.jsx:32` — `fmtTime`
- `client/src/pages/nomii/dashboard/NomiiConversationDetail.jsx:18` — `fmtTime` (byte-identical to the one above)
- `client/src/pages/nomii/dashboard/NomiiSettings.jsx:872` — nested `relativeTime` (subtly different: returns `null` on empty, no day/date fallback)

The two `fmtTime` copies are byte-for-byte identical. The various
`relativeTime` variants use different short labels ("now"/"just now",
"5m"/"5m ago") — intentional, driven by the surrounding layout's
density.

### Clipboard helper (client)

`copyToClipboard` (with the plain-HTTP `execCommand` fallback for
self-hosted installs) duplicated verbatim:

- `client/src/pages/nomii/dashboard/NomiiSettings.jsx:5-19`
- `client/src/components/nomii/onboarding/Step4InstallWidget.jsx:74-91`

Both copies include the identical `navigator.clipboard?.writeText`
probe, identical textarea-fallback, and identical inline `position:
fixed; opacity: 0` styles. The import in `NomiiSettings.jsx` was also
landing *after* a block of top-level statements, which is a minor code
smell.

### Authenticated blob download (client)

`downloadTranscript` and `exportCustomerData` in
`client/src/lib/nomiiApi.js` (lines 123-139 and 220-240 before the
change) shared:

- `Authorization: Bearer ${token}` fetch
- `URL.createObjectURL(blob)` → anchor click → revoke
- Identical filename sanitization: `.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")`

Only difference: the endpoint, the filename template, and the
fallback error message. Exactly the shape of a parameterized helper.

### Card style (client) — not extracted

`const card = { background: "rgba(255,255,255,0.03)", border: "1px
solid rgba(255,255,255,0.06)" };`

Appears in 5 dashboard pages. This is a 2-property object used
inline with `style={card}` (and frequently extended: `{...card, height:
h}`, or with different heights/paddings). Extracting it would require
picking a name (`cardBase`? `card`?) and cost a new import in 5 files
to save 1 line of actual code per file. Demoted to LOW.

### Retry error state (client) — not extracted

The "AlertTriangle + error text + gold gradient Retry button" block
appears in 8 pages but with:

- different retry function names (`fetch`, `fetchData`, `fetchList`)
- different outer wrappers (`py-24` vs `py-16`, flex gap variations)
- different bottom spacing and icon sizes
- `NomiiConversations.jsx` only renders it when
  `error && conversations.length === 0`; others unconditionally

Extracting would require 8 callers to pass their retry handler, their
error string, and in some cases a wrapper class override. This is
borderline — small visual drift would accumulate in the shared
component. Demoted to MEDIUM.

### Server-side `requireTenantAccess` vs middleware/auth.js — not extracted

`server/src/routes/customTools.js:36` defines a local
`requireTenantAccess(req, res, next)` that overlaps conceptually with
`requireTenantScope()` in `server/src/middleware/auth.js:77` but:

- Works off `req.params.id` instead of `req.user.tenant_id` alone
- Has a *different* role check (`platform_admin` vs `admin`)
- Sets `req.tenantId` (camelCase) rather than `req.tenant_id`

These are not duplicates; they have different semantics. Any
consolidation would silently change authorization behavior. Deferred.

### Server route error responses — not extracted

`res.status(401).json({ error: 'Authentication required' })` appears
~19 times across 7 routes. `res.status(500).json({ error: ... })`
appears ~10 times across 5 routes. Each call site has slightly
different error strings reflecting the domain (`'Unauthorised'`,
`'Authentication required'`, `'Cannot access other tenant data'`,
`'Forbidden — you do not have access to this tenant'`).

Replacing with a helper (e.g. `unauthorized(res)`) would save 5-10
characters per site and hide the exact status code from the reader.
Net negative. Demoted to LOW.

## Critical assessment

The codebase is young enough that most "duplication" is legitimate
variation: the dashboard pages were built in parallel and each picked a
slightly different time-label vocabulary that matched its layout
density. Genuine copy-paste was mostly confined to:

1. Utility functions a dev re-typed rather than looked up.
2. The `copyToClipboard` helper (literal copy of both the main function
   and its fallback, 20 lines of JS).
3. The two authenticated-blob download helpers inside `nomiiApi.js`.

Resisted the temptation to extract a shared `<StatePill>` component,
shared error-state UI, or a shared `card` style constant — each of
those would add indirection without clarifying the call sites, and the
dashboard pages are still evolving.

## Recommendations

### HIGH confidence (implemented)

1. **Extract date/time formatters** to `client/src/lib/format.js` with
   one named export per variant (`relativeTime`, `relTime`,
   `relativeDay`, `fmtTime`). Commit `f0fa5af`.
2. **Extract `copyToClipboard`** to `client/src/lib/clipboard.js`.
   Commit `2a8b9c3`.
3. **Dedupe authenticated blob downloads** inside
   `client/src/lib/nomiiApi.js` via private `downloadAuthenticatedFile`
   and `safeFilename` helpers. Commit `3419b2b`.

### MEDIUM confidence (not implemented)

1. **Shared `<ErrorState>` / `<RetryState>` component** — would span 8
   pages, each with drift; likely a separate, larger refactor.
2. **Shared dashboard skeleton loaders** — `SkeletonCard` and
   `SkeletonTable` patterns repeat across `NomiiOverview`,
   `NomiiConversations`, etc. but with different row counts and widths.

### LOW confidence (not implemented)

1. **Card style constant** — 5 sites, trivial savings, extensions
   already diverge (`{...card, height: h}`).
2. **HTTP error response helpers** — shallow refactor that hides status
   codes from the caller; not worth the abstraction.

## Implementation log

| SHA       | Title                                                     | Files changed | LOC diff |
|-----------|-----------------------------------------------------------|---------------|----------|
| `f0fa5af` | Extract dashboard date/time formatters to `lib/format.js` | 4             | +59 / -49 |
| `2a8b9c3` | Extract `copyToClipboard` to `lib/clipboard.js`           | 3             | +24 / -37 |
| `3419b2b` | Dedupe `downloadTranscript` + `exportCustomerData`        | 1             | +31 / -29 |

Files created:
- `client/src/lib/format.js`
- `client/src/lib/clipboard.js`

Files edited:
- `client/src/lib/nomiiApi.js`
- `client/src/pages/nomii/dashboard/NomiiOverview.jsx`
- `client/src/pages/nomii/dashboard/NomiiConversations.jsx`
- `client/src/pages/nomii/dashboard/NomiiConversationDetail.jsx`
- `client/src/pages/nomii/dashboard/NomiiSettings.jsx`
- `client/src/components/nomii/onboarding/Step4InstallWidget.jsx`

### Verification

- `cd client && npm run build` → success (2499 modules, 5.02s).
- `node -c` on `server/src/routes/{advisors,portal,customTools}.js` and
  `server/src/middleware/auth.js` → clean.
- No behavior change in the two extractions outside `nomiiApi.js`.
- `downloadTranscript` now additionally parses the JSON error body on
  non-OK responses (matching `exportCustomerData`). Falls back to the
  original `"Transcript download failed"` string when no JSON body is
  present. Safe — the failure surface is strictly a superset of the
  old behavior.

## Deferred

- **Widget (`server/public/widget.html`)** — 1517-line self-contained
  vanilla-JS widget. Out of scope per the task brief; even if there are
  helpers in common with the server, touching the widget risks breaking
  the self-hosted embed without an integration test.
- **Server route consolidation** — `requireTenantAccess` in
  `customTools.js` vs `requireTenantScope()` in `middleware/auth.js`
  *look* similar but enforce different rules (`platform_admin` vs
  `admin`, camelCase `req.tenantId` vs snake_case `req.tenant_id`).
  Unifying them requires a careful auth audit that is out of scope for
  a DRY sweep.
- **Dashboard status-pill objects** — `statusStyle` / `statusPill`
  appears in 4 files with *different keys* (conversation status vs
  customer onboarding status). Coincidental structural similarity,
  different domain. Not dedup targets.
- **Skeleton loaders** — candidate for a shared `<Skeleton>` primitive,
  but each page tunes row count/height to its real layout. Better
  addressed during a design-system pass.
