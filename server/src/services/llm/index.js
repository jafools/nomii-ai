/**
 * SHENMAY AI — LLM Provider Registry
 *
 * Maps a provider name to the adapter that implements its SDK calls.
 *
 * Phase 1a (this file's first cut): only Anthropic exists. The legacy
 * `'claude'` value used by `tenants.llm_provider` is normalized to
 * `'anthropic'` so the rest of the codebase can stop caring about which
 * spelling the database happens to hold.
 *
 * Phase 1b (next PR): adds OpenAI. Registry stays a flat map; new providers
 * register themselves here.
 *
 * See docs/MULTI_LLM_SCOPING.md for the full plan.
 */

const anthropicAdapter = require('./anthropicAdapter');
const openaiAdapter    = require('./openaiAdapter');

/**
 * Normalize a provider name to its canonical form.
 * Accepts the legacy 'claude' alias (default in migration 001).
 */
function normalizeProvider(provider) {
  if (!provider) return 'anthropic';
  const p = String(provider).toLowerCase().trim();
  if (p === 'claude' || p === 'anthropic') return 'anthropic';
  if (p === 'openai' || p === 'open-ai' || p === 'gpt') return 'openai';
  return p;
}

const REGISTRY = {
  anthropic: anthropicAdapter,
  openai:    openaiAdapter,
};

/**
 * Look up the adapter for a provider name. Throws if unknown.
 * Callers that want a fallback ('mock' / null) should branch BEFORE calling.
 */
function getAdapter(provider) {
  const name = normalizeProvider(provider);
  const adapter = REGISTRY[name];
  if (!adapter) {
    throw new Error(`Unknown LLM provider: "${provider}" (normalized: "${name}")`);
  }
  return adapter;
}

/**
 * Returns the list of registered provider names — useful for validation
 * endpoints and for the frontend dropdown.
 */
function listProviders() {
  return Object.keys(REGISTRY);
}

/**
 * Resolve the canonical default model for a given provider + role.
 *
 * Why this exists: `tenants.llm_model` is set at signup-time and never
 * updated when the tenant later switches provider (e.g. anthropic →
 * openai), so the column can hold a Claude name while `llm_provider`
 * is `openai`. Sending that mismatched name to the OpenAI adapter
 * round-trips a 404 from OpenAI's API. Dispatch sites should call
 * this helper instead of trusting the stored column.
 */
function getDefaultModel(provider, role = 'sonnet') {
  return getAdapter(provider).defaultModel(role);
}

module.exports = {
  getAdapter,
  normalizeProvider,
  listProviders,
  getDefaultModel,
};
