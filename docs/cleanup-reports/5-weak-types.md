# Weak Types Audit — Nomii AI

**Branch:** `worktree-agent-a93f98e0`
**Base commit:** `0566e49` (main)
**Date:** 2026-04-15
**Scope:** JS-adapted "weak types" — missing JSDoc, missing boundary validation, implicit shapes.

This repository is pure JavaScript (no TypeScript — CLAUDE.md is explicit on this).
The equivalent of "un-typed" here is **implicit-shape surfaces** where a function
or HTTP handler accepts `req.body`, `data`, `options`, or a DB row without
documenting or validating what it actually expects.

---

## Methodology

1. Grepped `server/src` for `(options|params|data)\s*[,\)]` to find generic
   parameter names with no JSDoc.
2. Grepped all `JSON.parse` usages (17 total) and checked whether each result
   is treated as an already-validated shape.
3. Grepped `req\.body` across routes and inspected each handler for explicit
   field-by-field destructuring + validation.
4. Read the priority files called out in the mission in full:
   - `server/src/services/licenseService.js`
   - `server/src/services/apiKeyService.js`
   - `server/src/engine/promptBuilder.js`
   - `client/src/lib/nomiiApi.js`
   - `server/src/routes/portal.js` (3683 lines — scanned every `req.body`)
5. For each weak surface: if the shape is used in 3+ places, added a JSDoc
   `@typedef`; for 1-2 callers, inline `@param` docs.
6. Added plain-JS boundary assertions (no validation library) where shape
   mismatches were reaching the DB as JSON or triggering cryptic errors.

---

## Findings (file:line)

### Already well-documented — no action needed
- `server/src/services/llmService.js` — full JSDoc on `resolveApiKey`,
  `callClaude`, `callClaudeWithTools`, `validateApiKey`, `getAgentResponse`.
- `server/src/services/cryptoService.js:43,69,87,100` — all 4 exports have
  `@param` / `@returns` with sentinel-envelope typedef described inline.
- `server/src/services/webhookService.js:36,132,143` — fireWebhooks, _sign,
  generateSecret all documented. One cosmetic nit: `JSON.parse(payload).event`
  on line 82 re-parses the service's own payload to extract `event`; could
  be refactored but not a "weak type" issue.
- `server/src/services/notificationService.js:39` — fireNotifications has
  an inline event-payload typedef.
- `server/src/services/emailService.js` — all send functions take an
  object-destructured argument with clear field names.
- `server/src/middleware/auditLog.js:38` — complete JSDoc on `writeAuditLog`.
- `server/src/engine/memoryUpdater.js:442` — `updateMemoryAfterExchange`
  already has the canonical JSDoc block.

### Weak surfaces — fixed in this branch
| File | Lines | Issue | Fix |
|---|---|---|---|
| `client/src/lib/nomiiApi.js:1-49` | 305 | Module-level wrapper used in 80+ React files; `apiRequest(method, path, body)` had zero JSDoc, callers had to trace server routes for body shape. | Added `ApiError`, `ProductRecord`, `ConversationFilters`, `LoginError`, `HttpMethod` typedefs + `@param/@returns/@throws` on `apiRequest` and the 10 auth/setup helpers. |
| `server/src/services/licenseService.js` | 337 | `callValidate` returned `body` verbatim from cloud master — a 200 response missing `.plan` would silently propagate. 5 exports had no `@param/@returns` typedefs. | Added `LicensePlan`, `ValidateResponse`, `ActivateResult`, `LicenseStatus` typedefs. Narrowed `callValidate` return to only the 3 load-bearing fields and rejected 200s whose `valid !== true` or whose `plan` isn't a string. Added `tenantId` presence asserts on `activateLicense` / `deactivateLicense`. |
| `server/src/services/apiKeyService.js` | 67 | `encrypt('')` would produce an empty-ciphertext envelope; `decrypt(malformed)` bubbled a cryptic "bad auth tag" instead of saying why. No `EncryptedKey` typedef despite the shape being used in setup.js, portal.js, and llmService.js. | Added `EncryptedKey` typedef; both `encrypt` and `decrypt` now `throw TypeError` at the boundary with a clear message; `getLast4` handles empty/non-string safely. |
| `server/src/engine/promptBuilder.js` | 694 | `buildSystemPrompt({ tenant, customer, customerData, products, ... })` — 7-field destructure with no docs. A missing `tenant` surfaced as "cannot read base_identity of undefined" 80 lines into `buildIdentityBlock`. | Added `PromptTenant`, `PromptCustomer`, `PromptDataRecord`, `PromptProduct`, `BuildPromptInput` typedefs. Added presence checks on `tenant` + `customer` so the error lands at the boundary with a useful message. |
| `server/src/routes/portal.js:162,970,366,3028` | 3683 | Four mutation routes used `req.body` destructuring with only truthy checks. A client bug submitting `{first_name: 12345}` or `{metadata: [1,2,3]}` would either 500 at the DB layer or persist garbage. | Added `typeof` guards + length caps. Affects `PUT /admin/profile`, `PUT /customers/:id`, `POST /products`, `POST /customers/:id/data`. |

### Weak surfaces — NOT fixed (see Deferred)
- `server/src/routes/portal.js:509,627` — LLM-response JSON.parse in `/products/ai-suggest` and `/customers/ai-map`. Already wrapped in try/catch and validates field membership. Low priority.
- `server/src/tools/custom_tool_handler.js:229` — `JSON.parse(responseText)` from tenant webhooks; fallback to raw text is already in place.
- `server/src/routes/widget.js` — 1448 lines, 11 `req.body` usages. Authentication-gated and has existing validation per handler; not a priority target.

---

## Critical assessment

The strongest smells were in two places:

1. **`licenseService.callValidate`** — this is the trust boundary between the
   self-hosted instance and the license master. If the master ever responded
   200 with a malformed body, the instance would happily apply
   `PLAN_LIMITS[undefined]` (falling through to trial silently). The narrowed
   return now rejects that at the call site with a clear "License invalid"
   error.

2. **`apiKeyService.encrypt/decrypt`** — the BYOK flow is security-sensitive.
   The prior code's failure modes were silent (empty ciphertext on empty
   plaintext) or cryptic ("Unsupported state or unable to authenticate data"
   on a corrupt envelope). Now they throw TypeError at the boundary where
   the mistake actually is.

Beyond those, the project is in pretty good shape. The widget, webhook,
notification, and llm services all already have JSDoc at the level I was
planning to add. Setup flows validate thoroughly (e.g. `POST /api/setup/complete`
at server/src/routes/setup.js:56-71 has 5 distinct validation branches).
The biggest remaining "weak surface" is the **sheer size of portal.js
(3683 lines, 34 mutation routes)** — but per CLAUDE.md's "do what has been
asked, nothing more" rule, breaking it up is out of scope here.

---

## Recommendations

### HIGH (applied)
- **Add JSDoc typedefs to load-bearing contracts.** `LicensePlan` /
  `ValidateResponse` / `LicenseStatus` / `EncryptedKey` / the prompt-builder
  input shapes — all 3+ callers and the wrong shape bites at runtime.
- **Narrow `callValidate` return.** Don't pass the master's whole response
  body through untouched.
- **Assert BYOK inputs.** `encrypt`/`decrypt` now reject malformed inputs
  explicitly.
- **Validate req.body types, not just presence.** 4 mutation routes now
  reject `typeof field !== 'string'` at the HTTP boundary.
- **JSDoc the React API wrapper.** `nomiiApi.js` is the React app's single
  call site for every API — now documented.

### MEDIUM (applied where cheap; reported otherwise)
- `buildSystemPrompt` now fails fast on missing `tenant` / `customer`.
- Other internal helpers in `promptBuilder.js` (buildIdentityBlock, etc.)
  are not exported and only consume `soul`/`memory`/`tenant` subsets — their
  shapes are now covered transitively by the top-level typedefs.

### LOW (deferred)
- A stricter validation library (zod, joi) would catch the remaining cases
  uniformly, but introducing a new dependency before the first paying
  customer isn't justified. Per task spec — DEFERRED.
- TypeScript migration — explicitly out of scope per CLAUDE.md. DEFERRED.

---

## Implementation log

| Commit | Subject | Files |
|---|---|---|
| `9b65c11` | docs(client): add JSDoc to nomiiApi core request + auth helpers | client/src/lib/nomiiApi.js |
| `b317dc2` | docs(license): add JSDoc typedefs + narrow callValidate return shape | server/src/services/licenseService.js |
| `e333a99` | docs(byok): add input-shape assertions + EncryptedKey typedef to apiKeyService | server/src/services/apiKeyService.js |
| `ebe99cd` | docs(engine): document promptBuilder input shape + fail fast on missing tenant/customer | server/src/engine/promptBuilder.js |
| `f6459de` | fix(portal): strengthen req.body validation on 4 mutation routes | server/src/routes/portal.js |

**Verification**
- `node -c` on each edited server file: PASS
- `cd client && npm run build`: PASS (4.18s, 1113 KB bundle unchanged)
- No behavioural regressions — JSDoc comments don't execute; new `typeof`
  guards only fire on inputs that would previously have 500'd.

---

## Deferred

1. **Stripe webhook payload narrowing** (`server/src/routes/stripe-webhook.js:62`).
   `const { type, data: { object } } = event;` — we trust the Stripe SDK's
   `constructEvent` to validate the signature but not the inner shape. A
   future hardening pass could typedef `object` per event type (
   `checkout.session.completed` uses `metadata.tenant_id` and
   `customer_details.email`; `invoice.paid` uses `period_start`/`period_end`).
   Risk is low — these paths only fire on actual Stripe-originated events.

2. **`portal.js` decomposition.** 3683 lines violates the "keep files under
   500 lines" guideline in CLAUDE.md. Splitting into domain-specific
   routers (billing, customers, conversations, tools, webhooks, connectors,
   notifications) would make the weak-type surface tractable, but is a
   much larger refactor than this audit's remit.

3. **Validation library adoption.** `zod` is the natural fit given the
   codebase's patterns. Would replace ~40 hand-rolled `typeof ... !== 'string'`
   branches with a single schema per route. Defer until post-launch.

4. **TypeScript migration.** DO NOT START. Explicit instruction in
   CLAUDE.md: "THERE IS NO TYPESCRIPT IN THIS REPO — do not add it".
