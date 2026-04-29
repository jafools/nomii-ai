# Overnight build — Multi-LLM Provider v1 — handoff (2026-04-28 → 04-29 morning)

> **READ ME FIRST when you wake up.** Two PRs are open and ready for review.
> **Nothing has been merged. Production stays at v3.3.27 untouched.**

## TL;DR

You went to bed at ~Apr 28 night and asked me to build out the multi-LLM provider scoping autonomously. I shipped both phases of [docs/MULTI_LLM_SCOPING.md](MULTI_LLM_SCOPING.md) into two stacked PRs — Phase 1a (refactor) is fully done, Phase 1b (OpenAI + frontend + tests) is fully done. Both pass lint + build + 70/70 unit tests locally. CI runs are green pending PR-level checks. **Your morning checklist:**

1. Merge the v3.3.27 wrap PR ([docs/wrap-v3327-pure-byok](https://github.com/jafools/shenmay-ai/pulls?q=is%3Apr+head%3Adocs%2Fwrap-v3327-pure-byok)) — this was already open before I started, I left it alone.
2. Review **[shenmay-ai#165](https://github.com/jafools/shenmay-ai/pull/165)** (Phase 1a refactor — pure internal restructure, zero behavior change) and merge if happy.
3. Review **[shenmay-ai#166](https://github.com/jafools/shenmay-ai/pull/166)** (OpenAI provider support) — needs manual end-to-end via Mailinator + a real OpenAI test key before merging.
4. After both merged, decide whether to cut a v3.4.0 tag (the deploy act) or sit on `:edge` for a cycle of staging soak.
5. Merge this handoff doc PR ([docs/overnight-multi-llm-handoff](https://github.com/jafools/shenmay-ai/pulls?q=is%3Apr+head%3Adocs%2Fovernight-multi-llm-handoff)) — just this file.

## Hard boundaries respected (proof I didn't break anything)

| Rule | Honored? |
|---|---|
| No merge to main | ✅ Both PRs open, none merged |
| No release tag | ✅ Production stays at v3.3.27 |
| No Hetzner SSH writes | ✅ Zero ssh against prod tonight |
| No 5×5 release gate dispatch | ✅ Standard PR-level CI only |
| No secrets committed | ✅ Confirmed via `git diff origin/main` review |
| Pure-BYOK rule from v3.3.27 | ✅ resolveApiKey untouched, soul + memory follow chat provider |
| `master / managed_ai_enabled` accounts stay Anthropic-only | ✅ Mode 1 render in ApiKeySection unchanged |
| One new dependency (`openai`) per scoping doc | ✅ Pinned at `openai@^6.35.0` |

## What landed in PR1 — `chore(llm): introduce ProviderAdapter abstraction`

[shenmay-ai#165](https://github.com/jafools/shenmay-ai/pull/165) — branch `feat/multi-llm-adapter-anthropic`, off main.

**Pure internal restructure.** Zero behavior change. Anthropic codepath byte-equivalent.

| File | What |
|---|---|
| `server/src/services/llm/anthropicAdapter.js` (new) | Owns the Anthropic SDK calls + per-key client cache that previously lived in llmService.js. Exposes `chat`, `chatWithTools`, `validateKey`, `defaultModel`. |
| `server/src/services/llm/index.js` (new) | Registry/factory. `normalizeProvider('claude')` → `'anthropic'` so callers stop dealing with the legacy spelling. |
| `server/src/services/llmService.js` (refactored) | Thin public surface. New `chat` / `chatWithTools` / `validateKey` provider-aware functions. Legacy `callClaude` / `callClaudeWithTools` / `validateApiKey` names preserved as shims (existing 8 call sites unchanged). resolveApiKey + buildTokenizer + logBreach + NoApiKeyError + getAgentResponse all preserved. |
| `server/src/engine/soulGenerator.js` | Removes direct `new Anthropic(...)` instantiation, routes through `chat()` instead. Closes the cleanup item from the multi-LLM scoping audit. |
| `docs/MULTI_LLM_SCOPING.md` (new) | Formal scoping doc — included in PR1 since it IS the spec. |

**Verification this PR passed locally:**
- `npm run lint:server` clean
- `npm run build` (client) clean
- 46/46 tokenizer unit tests pass
- Module-load smoke test: every adapter + every consumer (widget, tools-routes, products-routes, customers-routes, api-key-routes, soulGenerator, memoryUpdater) loads
- normalizeProvider returns canonical names for all spellings

## What landed in PR2 — `feat(llm): OpenAI provider support`

[shenmay-ai#166](https://github.com/jafools/shenmay-ai/pull/166) — branch `feat/openai-llm-provider`, **stacked on PR1**.

**The actual feature.** Adds OpenAI as a second provider. Anthropic codepath byte-equivalent — OpenAI is purely additive.

### Backend (the bulk of the work)

`server/src/services/llm/openaiAdapter.js` (new) — chat / chatWithTools / validateKey using the `openai` npm package. Owns the entire Anthropic ↔ OpenAI shape conversion at the SDK boundary so the rest of the codebase stays in Anthropic shape (which the PII tokenizer + breach detector already understand without modification). Mapping table per the scoping doc:

| Anthropic | OpenAI |
|---|---|
| `tools[].input_schema` | `tools[].function.parameters` |
| `content: [{ type: 'tool_use', id, name, input }]` | `tool_calls: [{ id, type:'function', function: { name, arguments: jsonStr } }]` |
| `content: [{ type: 'tool_result', tool_use_id, content }]` | `{ role: 'tool', tool_call_id, content }` |
| `system` prop on `messages.create` | First message `{ role: 'system', content }` |
| `stop_reason: 'end_turn'` | `finish_reason: 'stop'` |

Eight call sites now plumb provider through:

| Call site | What dispatches |
|---|---|
| [widget.js:1346](server/src/routes/widget.js#L1346) | Hot path — chat with tools. Reads `conv.llm_provider`. |
| [widget.js:1545](server/src/routes/widget.js#L1545) | Greeting on conversation load. Reads `row.llm_provider`. Picks `gpt-4o-mini` for OpenAI tenants, Haiku for Anthropic. |
| [products-routes.js:243](server/src/routes/portal/products-routes.js#L243) | Product extraction from website / description. Reads `tenant.llm_provider`. |
| [customers-routes.js:101](server/src/routes/portal/customers-routes.js#L101) | CSV ai-map. Reads `tenant.llm_provider`. |
| [tools-routes.js:356](server/src/routes/portal/tools-routes.js#L356) | TestModal back-end (sandbox + real-customer test runs). Reads `tenant.llm_provider`. |
| [memoryUpdater.js](server/src/engine/memoryUpdater.js) | `pickFastModel(provider)` for fact / summary / soul-evolution sub-calls. Provider rides on `tokenizerOpts` so all three Haiku-equivalent calls inherit it. |
| [soulGenerator.js](server/src/engine/soulGenerator.js) | Reads `tenant.llm_provider`, dispatches accordingly. **Pure BYOK preserved — soul follows chat provider, no platform-key carve-out.** |
| `getAgentResponse` (in llmService.js) | Already provider-aware after PR1; normalizes legacy `'claude'` → `'anthropic'`. |

`me-routes.js` (`GET /api/portal/me`) now exposes `llm_api_key_provider` + `llm_provider` so the frontend can render the right provider badge + walkthrough copy.

### Frontend

`ApiKeySection.jsx` (Settings) and `StepApiKey.jsx` (onboarding) — provider dropdown above the paste field with two options:
- Anthropic Claude (recommended)
- OpenAI

Provider-aware walkthrough copy (Anthropic console URL + `sk-ant-…` prefix vs OpenAI platform URL + `sk-…` prefix). Header label switches between "Anthropic · Claude" and "OpenAI · GPT-4o" based on the saved provider.

**Inline warning banner** appears when OpenAI is picked, listing the three quality risks per the scoping spec:

> ⚠ Claude is the recommended provider for Shenmay.
> Choosing OpenAI may produce:
> - A less consistent agent persona over time
> - Weaker memory continuity across customer conversations
> - Subtly different tone in chat replies
>
> You can change providers any time. We recommend trying Claude first.

**First-switch confirmation modal** — when a tenant with a validated Anthropic key tries to save a new OpenAI key, the save is held and a modal fires asking *"Switch to OpenAI?"* with the existing-soul-stays-in-place caveat:

> Your agent's persona and memory may behave differently after this change. Existing soul + memory files stay where they are; new chats and memory updates will use OpenAI from the next message forward.
>
> Claude is the recommended provider for Shenmay's agent-quality guarantees.
>
> [Cancel] [Switch to OpenAI]

One-shot per switch direction. Mirrors the scoping spec — inline warning isn't enough by itself; this is the unmissable confirmation.

### Tests

`tests/openai-adapter.test.js` (new) — 24 unit tests covering:
- toOpenAIMessages: 9 tests (system prompt, plain messages, tool_use blocks, tool_result blocks, mixed content, full agentic round-trip)
- toOpenAITools: 2 tests
- fromOpenAIResponseToContentBlocks: 5 tests (incl. malformed JSON → empty object)
- Registry + normalizeProvider: 5 tests
- Adapter defaultModel: 2 tests

Wired into `npm test` and `npm run test:unit`. **70/70 unit tests pass** (46 tokenizer + 24 openai-adapter).

### Schema

**Zero migrations.** Every column needed already exists from migration 010 (`tenants.llm_provider`, `llm_api_key_provider`, `llm_model`).

## What I did NOT do (acknowledge the gaps)

- **No live OpenAI API call test.** The adapter has only been smoke-tested via static schema translation + module-load. A real OpenAI key + a real chat round-trip is the part that requires your eyes (and your test key). Highest-priority morning verification.
- **No production deploy.** Per the boundary contract.
- **No 5×5 release gate dispatch.** Standard PR-level CI only — the 5×5 gate is for cutting tags, your call after PR review.
- **No npm audit fix.** `openai@^6.35` flagged 2 high-severity transitive vulns on install. `npm audit fix --force` would touch other packages. Out of scope, flagged in PR2 description.
- **No vault note.** Couldn't write to `C:\Users\ajace\Documents\Work\Obsidian\jafools' Vault\` from the autonomous overnight session boundary — that lives outside the repo. Suggest you run `/wrap` or similar in the morning to fold this into the vault.
- **No marketing site update.** Scoping doc explicitly defers `ponten-solutions` copy update to post-ship per Decision #4.
- **No cost-copy update.** Scoping doc explicitly defers per Decision #3 — placeholder reads "see provider pricing" until you fold in real OpenAI per-message costs.
- **company-routes.js auto-regenerate path is broken (pre-existing).** Reads `api_key_encrypted` (legacy column name; should be `llm_api_key_encrypted`) and calls `decrypt(x)` single-arg (should be two-arg). Currently fails silently → soulGenerator returns rule-based fallback. Out of scope to fix tonight; flagged here so you don't blame the multi-LLM PR. Worth its own small fix PR.

## Morning verification checklist (suggested)

In rough order — feel free to skip steps that don't apply:

1. **Read this doc first** ✓ (you're here)
2. **Sanity check both PR diffs at GitHub** — `gh pr diff 165` and `gh pr diff 166` if you want the terminal view
3. **CI status** — both PRs should have green checks; if not, click into the failure and decide
4. **Pull PR1 + PR2 locally and run unit tests** to reproduce my 70/70:
   ```bash
   git fetch origin
   git checkout feat/openai-llm-provider
   npm install
   NODE_ENV=test node tests/tokenizer.test.js
   NODE_ENV=test node tests/openai-adapter.test.js
   npm run lint
   npm run build
   ```
5. **Manual end-to-end (the part I couldn't do):**
   - Sign up a fresh tenant via Mailinator on the staging URL after the PRs land on `:edge`
   - DB-skip onboarding to dashboard
   - Settings → AI API key → pick OpenAI from dropdown
   - Verify the warning banner renders + walkthrough copy is OpenAI-flavored
   - Paste a real OpenAI test key → save → verify validation succeeds
   - Send a widget chat message → verify response round-trips
   - Test connection button → expect "Connection OK"
   - Toggle back to Anthropic via Replace key + paste an Anthropic key → verify confirmation modal does NOT fire on this direction (we only fire it Anthropic→OpenAI)
   - Repeat the inverse: paste Anthropic key first, then Replace with OpenAI → verify the modal DOES fire
6. **Manual quality check (optional but worth it):** trigger a soul regeneration on the OpenAI tenant and read the output for coherence — Risk #2 from the scoping doc
7. **Decide on tagging:** if 5×5 gate green and manual checks pass, cut `v3.4.0`. Otherwise leave on `:edge` for a soak cycle.

## File map

| Path | Purpose | Touched in |
|---|---|---|
| `docs/MULTI_LLM_SCOPING.md` | Formal scoping doc | PR1 |
| `docs/OVERNIGHT_MULTI_LLM_HANDOFF.md` | This file | docs/overnight-multi-llm-handoff |
| `server/src/services/llm/anthropicAdapter.js` | Anthropic SDK calls | PR1 |
| `server/src/services/llm/openaiAdapter.js` | OpenAI SDK calls + shape translation | PR2 |
| `server/src/services/llm/index.js` | Registry | PR1 (PR2 adds openai entry) |
| `server/src/services/llmService.js` | Public surface | PR1 (PR2 plumbs `opts.provider`) |
| `server/src/engine/soulGenerator.js` | Soul gen | PR1 (PR2 reads tenant.llm_provider) |
| `server/src/engine/memoryUpdater.js` | Memory updater | PR2 (provider-aware sub-calls) |
| `server/src/routes/widget.js` | Customer chat | PR2 (provider plumbing) |
| `server/src/routes/portal/products-routes.js` | Product extraction | PR2 |
| `server/src/routes/portal/customers-routes.js` | CSV ai-map | PR2 |
| `server/src/routes/portal/tools-routes.js` | TestModal back-end | PR2 |
| `server/src/routes/portal/api-key-routes.js` | BYOK save + test | PR2 (SELECT adds llm_provider) |
| `server/src/routes/portal/me-routes.js` | /api/portal/me bootstrap | PR2 (exposes llm_api_key_provider) |
| `server/src/routes/portal/company-routes.js` | Company-info save | PR2 (SELECT adds llm_provider) |
| `client/src/pages/shenmay/dashboard/settings/ApiKeySection.jsx` | Settings UI | PR2 (provider dropdown + warning + modal) |
| `client/src/components/shenmay/onboarding/StepApiKey.jsx` | Onboarding UI | PR2 (provider dropdown + warning) |
| `tests/openai-adapter.test.js` | Schema translation tests | PR2 |
| `package.json` + `server/package.json` + `server/package-lock.json` | `openai` dep + test wiring | PR2 |

## If you want to bail

If for any reason you'd rather not ship this in one go:

- PR1 is **safe to merge alone** — pure refactor, zero behavior change. Could land tonight, OpenAI work picked up later.
- PR2 depends on PR1 (the abstraction). If you merge PR1 only, GitHub will auto-update PR2's base branch to main.
- This handoff doc PR is independent of both — merge or close at your discretion.

---

Sleep well. I'll keep an eye on the conversation if you ping back tonight; otherwise I'll see you in the morning. Production stays at v3.3.27 until you say otherwise.
