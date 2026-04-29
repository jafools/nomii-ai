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

/**
 * Normalize a provider name to its canonical form.
 * Accepts the legacy 'claude' alias (default in migration 001).
 */
function normalizeProvider(provider) {
  if (!provider) return 'anthropic';
  const p = String(provider).toLowerCase().trim();
  if (p === 'claude' || p === 'anthropic') return 'anthropic';
  return p;
}

const REGISTRY = {
  anthropic: anthropicAdapter,
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

module.exports = {
  getAdapter,
  normalizeProvider,
  listProviders,
};
