# Multi-LLM Provider Support — v1 Scoping

> Status: scoping (not yet on the build queue).
> Owner: Austin. Last updated: 2026-04-28.
> Supersedes the multi-LLM bullet in `docs/SESSION_NOTES.md` (v3.3.27 night handoff).

## Goal

Add OpenAI as a second LLM provider alongside Anthropic, so every prospect-with-an-OpenAI-key can use Shenmay without first creating an Anthropic account. Preserve pure BYOK (no platform-key carve-outs).

## Sales positioning (post-ship)

> "Bring your own LLM key. Works with Anthropic Claude (recommended) and OpenAI. Self-hosted enterprise on a future release."

The "and OpenAI" line removes the most common drop-off in the signup flow today: prospects who already pay OpenAI but don't want to set up a second AI billing relationship.

## Decisions (as of 2026-04-28)

1. **Soul generator + memory updater follow the chat provider** — pure BYOK preserved. No platform-key carve-out for system jobs. Customers selecting non-Claude providers see an unmissable warning that **agent quality may degrade** (less consistent persona, weaker memory continuity, slightly different tone). Warning lives in three places: provider dropdown in onboarding, provider dropdown in Settings, and a confirmation modal on the first Claude → OpenAI switch.
2. **Master / `managed_ai_enabled` accounts stay Anthropic-only.** Managed AI is an operator-driven internal account choice, not customer-configurable. No provider dropdown for managed accounts (the existing "Managed AI is active" Mode 1 render in `ApiKeySection.jsx` is unchanged).
3. **Cost copy** — placeholder for now ("see provider pricing"); Austin will fold in OpenAI per-message pricing once we have a deployed cell to measure.
4. **Marketing site update (`ponten-solutions`)** — follow-on after v1 ships. Not part of this scope.
5. **v1 ships OpenAI only.** OpenAI-compatible base URL (Together, Groq, Azure OpenAI, Ollama, vLLM) is **Phase 2**, not v1.

## Phase 1 (v1) — what ships

### Backend

**`server/src/services/llmService.js` — refactor + dispatch:**

- Introduce `ProviderAdapter` interface:
  ```
  {
    name: string,                     // 'anthropic' | 'openai'
    validateKey(apiKey) -> { valid, error? },
    chat({ system, messages, model, maxTokens, apiKey }) -> string,
    chatWithTools({ system, messages, tools, executor, model, maxTokens, apiKey }) -> string,
    defaultModel(role) -> string,     // role: 'sonnet' (chat) | 'haiku' (validate, soul, memory)
  }
  ```
- Implement `AnthropicAdapter` — pure refactor of existing `callClaude` / `callClaudeWithTools` / `validateApiKey`. Zero behavior change. Existing 5×5 e2e gate still passes.
- Implement `OpenAIAdapter` — uses `openai` npm package (~v5). Tool-call shape normalization (table below).
- `getAgentResponse` dispatches via `tenant.llm_provider`:
  - `'claude' | 'anthropic'` → AnthropicAdapter (back-compat with the heritage `'claude'` value)
  - `'openai'` → OpenAIAdapter
  - `'mock'` → mock (unchanged)
  - anything else → throw with friendly error

**Tool-call schema mapping (the trickiest piece):**

| Anthropic | OpenAI | Notes |
|---|---|---|
| `tools[].input_schema` | `tools[].function.parameters` | Both subsets of JSONSchema; `input_schema` shape ports cleanly. Wrap in `{ type: 'function', function: {...} }`. |
| `content: [{ type: 'tool_use', id, name, input }]` | `tool_calls: [{ id, type: 'function', function: { name, arguments } }]` | OpenAI sends arguments as a JSON-encoded string; parse before passing to executor. |
| `content: [{ type: 'tool_result', tool_use_id, content }]` | `{ role: 'tool', tool_call_id, content }` | Different role + key name. |
| `stop_reason: 'end_turn'` | `finish_reason: 'stop'` | Loop-exit signal. |
| `system` prop on `messages.create` | `messages[0] = { role: 'system', content }` | OpenAI inlines system as the first message. |

All 5 Shenmay tool types (`lookup`/`calculate`/`report`/`escalate`/`connect`) use simple JSONSchema input shapes that translate without lossage.

**`server/src/engine/soulGenerator.js:89` — cleanup:**
- Currently bypasses `callClaude` and instantiates `new Anthropic` directly. Rip that out, route through the adapter, so OpenAI tenants get OpenAI-generated souls + the warning is honest.

**`server/src/engine/memoryUpdater.js:54` — already uses `callClaude`:**
- Just dispatches via the adapter once the abstraction lands. No site-specific work.

**Hot-path call sites (no behavior change, just dispatch through adapter):**
- `widget.js:1346` (chat with tools), `widget.js:1545` (chat fallback)
- `products-routes.js:243`, `customers-routes.js:101` (extraction)
- `tools-routes.js:356` (TestModal back-end)

**Validate-key endpoint (`api-key-routes.js`):**
- `validateApiKey(key, provider)` — extend to handle `openai`. OpenAI minimal-call uses `gpt-4o-mini` (or whichever cheapest model is current) with `max_tokens: 1` to confirm auth. Map error codes (401 → "Invalid key", 403 → "Permission denied") symmetric with the Anthropic path.

### Frontend

**`client/src/pages/shenmay/dashboard/settings/ApiKeySection.jsx`:**
- Provider dropdown above the key paste field. Two options: `Anthropic Claude (recommended)` / `OpenAI`.
- "Anthropic · Claude" hardcoded label at line 138 → reads from state, shows current provider.
- Walkthrough copy is provider-aware (Anthropic console URL ↔ OpenAI platform.openai.com URL).
- Cost copy: "See provider pricing — costs scale with usage" (placeholder until Austin fills in).
- **Warning UI when OpenAI selected:**
  ```
  ⚠ Claude is the recommended provider for Shenmay.
  Choosing OpenAI may produce:
   • A less consistent agent persona over time
   • Weaker memory continuity across customer conversations
   • Subtly different tone in chat replies
  You can change providers any time. We recommend trying Claude first.
  ```
  Render inline below the dropdown. Persists while OpenAI is selected.

**`client/src/components/shenmay/onboarding/StepApiKey.jsx`:**
- Mirror the dropdown + warning pattern from ApiKeySection.

**Confirmation modal on first Claude → OpenAI switch:**
- Trigger: customer's current saved provider is `anthropic` AND they're trying to save a new key with provider `openai`.
- Modal copy:
  > "Switch to OpenAI?
  > Your agent's persona and memory may behave differently after this change. Existing soul + memory files stay where they are; new chats and memory updates will use OpenAI from the next message forward.
  > [Cancel] [Switch to OpenAI]"
- One-shot — once they've switched they don't see it again on subsequent switches.

### Schema

**No migration for v1.** Existing columns are sufficient:
- `tenants.llm_provider` already accepts any 50-char string (`'claude' | 'anthropic' | 'openai' | 'mock'`)
- `tenants.llm_model` stores the provider's chosen model string (defaulted in code per provider)
- `tenants.llm_api_key_provider` mirrors the chosen provider on save
- `tenants.llm_api_key_encrypted/iv/validated/last4` are provider-agnostic AES-256

### Tests

- New E2E spec: `tests/e2e/14-multi-llm-provider-switch.spec.js` — sign up trial, paste OpenAI key, send widget message, assert it round-trips. Cell runs against both providers in a parameterized loop.
- Existing 5×5 release gate still required to be green for both providers' code paths.
- Unit tests for tool-call schema translation (Anthropic ↔ OpenAI ↔ Anthropic round-trip).

## Acceptance criteria for v1 ship

1. Onboarding StepApiKey + Settings ApiKeySection both expose the provider dropdown with the warning.
2. Pasting an OpenAI key validates against OpenAI's API (live HTTP, not mocked).
3. Customer chat round-trips on a fresh tenant with `llm_provider='openai'` — message in, response out, no errors.
4. Tool calls work end-to-end on OpenAI for at least one of the 5 tool types (`lookup` is the simplest test).
5. Soul generation succeeds with `llm_provider='openai'` — produces a coherent (if non-Claude-style) Soul.
6. The first-switch confirmation modal renders correctly.
7. The Anthropic codepath is byte-equivalent to v3.3.27 — no regression.
8. 5×5 release gate green.

## Phase 2 — Deferred (separate scoping pass when prioritized)

OpenAI-compatible base URL (Together / Groq / Azure OpenAI / Ollama / vLLM / OpenRouter). Single new column `tenants.llm_api_key_base_url`, OpenAIAdapter respects it, UI dropdown gains "OpenAI (custom endpoint)" option. Disproportionate sales win for self-hosted enterprise prospects but explicitly out of v1 scope per Austin's call.

## Phase 3 — Long-tail (no current scope)

- Google Gemini (different SDK, different schema)
- AWS Bedrock (IAM-role auth)
- Per-customer model picker UI (currently one default model per provider works fine)
- Streaming responses (Shenmay isn't streaming today regardless of provider)

## Risks / unknowns

1. **OpenAI tool-call schema edge cases.** All 5 current tool types use simple object inputs — should translate cleanly. New tool types added in the future need to be tested against both providers. Mitigation: schema-translation unit tests.

2. **Soul/memory quality on OpenAI.** No way to know without running the system prompts against GPT-4o and reading the output. Mitigation: the warning is the customer-facing safety net; engineering checks output quality manually before ship + flags any awful regressions for prompt tuning.

3. **PII tokenizer behavior on OpenAI responses.** The breach detector was tuned against Claude output style. Different provider response patterns could trigger false positives or (worse) false negatives. Mitigation: spot-check the audit pass against ~10 real OpenAI responses before declaring v1 ready.

4. **Stripe pricing + plan tiers.** Plan tiers stay flat (priced per message count, not per cost-per-message). GPT-4o is roughly cost-equivalent to Claude Sonnet for typical chat lengths; GPT-4o-mini is ~10× cheaper. No plan-tier change needed for v1.

5. **Cost-copy placeholder.** Walkthrough copy needs OpenAI pricing inserted post-ship (Austin's queue).

## Estimated effort

| Phase | Work | Estimate |
|---|---|---|
| 1 — Backend abstraction (Anthropic refactor) | All call sites dispatch through adapter, soulGenerator cleanup, no behavior change | ~6 hours |
| 1 — OpenAI adapter | New SDK, tool-call translation, validation endpoint | ~6 hours |
| 1 — Frontend (ApiKeySection + StepApiKey + confirmation modal) | Provider dropdown, warning, modal, walkthrough copy | ~4 hours |
| 1 — Tests (e2e + unit) | New parameterized provider-switch spec, schema-translation unit tests | ~3 hours |
| 1 — 5×5 gate + ship | Standard release dance | ~1 hour |
| **Phase 1 total** | | **~20 hours / 1.5–2.5 days** depending on tool-call edge cases |

## Open follow-ons (post-v1, Austin's queue)

- Cost-copy update once OpenAI pricing landed
- `ponten-solutions` marketing-site copy update with "and OpenAI" positioning
- Phase 2 base-URL scoping when self-hosted prospects ask
- Audit + tune soul/memory prompts if early OpenAI customers report visibly worse agent quality

## Cross-references

- Pure-BYOK rule: [`memory/feedback_platform_fallback_chain_leaks.md`](../../C--Users-ajace-Documents-Work-Nomii-AI/memory/feedback_platform_fallback_chain_leaks.md)
- Friendly-error-must-name-real-destination: [`memory/feedback_friendly_error_destination_must_exist.md`](../../C--Users-ajace-Documents-Work-Nomii-AI/memory/feedback_friendly_error_destination_must_exist.md)
- v3.3.27 LIVE: [`docs/SESSION_NOTES.md`](./SESSION_NOTES.md) (top entry)
