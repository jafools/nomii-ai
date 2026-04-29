/**
 * SHENMAY AI — LLM Service
 *
 * Thin public surface over the LLM provider adapters in ./llm/. Holds
 * the cross-cutting concerns that aren't provider-specific:
 *   - tenant API key resolution (resolveApiKey — pure BYOK rules from v3.3.27)
 *   - PII tokenizer construction (buildTokenizer + tokenizationEnabledFor)
 *   - breach logging (logBreach)
 *   - the high-level getAgentResponse entry point that the chat path calls
 *
 * Provider SDK details (Anthropic SDK calls, OpenAI SDK calls, tool-call
 * schema translation, model name defaults) live in ./llm/<provider>Adapter.js.
 *
 * SaaS is pure BYOK as of v3.3.27: every tenant must have a validated
 * llm_api_key on their tenant row, OR be flagged managed_ai_enabled
 * (reserved for internal master/enterprise accounts whose key the operator
 * has explicitly chosen to provide via env). The platform-key env-var
 * fallback only fires when SHENMAY_DEPLOYMENT=selfhosted, where the
 * operator owns the box and the env-key IS their BYOK.
 *
 * Resolution priority (resolveApiKey):
 *   1. tenant.managed_ai_enabled = true → platform env key
 *      (master/enterprise opt-in, set explicitly in DB — never via Stripe)
 *   2. tenant has validated BYOK → decrypt and return
 *   3. SaaS → null (caller surfaces "Add your API key in Settings")
 *      Self-hosted → platform env key fallback (operator-provided)
 *
 * The legacy function names `callClaude`, `callClaudeWithTools`, and
 * `validateApiKey` are preserved for back-compat with existing call sites
 * (8 call sites at the time of the Phase 1a refactor). They internally
 * dispatch through the adapter registry. New code should prefer `chat`,
 * `chatWithTools`, and `validateKey`.
 */

const { decrypt } = require('./apiKeyService');
const { Tokenizer, BreachError } = require('./piiTokenizer');
const { isSelfHosted } = require('../config/plans');
const { getAdapter, normalizeProvider } = require('./llm');

/**
 * Thrown when an LLM call is attempted but no API key is resolvable for the
 * tenant. Callers should catch this and surface a friendly, audience-appropriate
 * message: operator-facing endpoints say "Add your API key in Settings",
 * customer-facing widget says "We're having trouble responding right now".
 */
class NoApiKeyError extends Error {
  constructor(message = 'No API key configured for this tenant') {
    super(message);
    this.name = 'NoApiKeyError';
    this.code = 'NO_API_KEY';
  }
}

// Global emergency kill-switch. Set PII_TOKENIZER_ENABLED=false to force-off
// for every tenant regardless of per-tenant flag. Default is enabled.
const TOKENIZER_GLOBAL_ENABLED =
  process.env.PII_TOKENIZER_ENABLED !== 'false' &&
  process.env.PII_TOKENIZER_ENABLED !== '0';


/**
 * Decide whether PII tokenization runs for this call.
 * Per-tenant flag defaults TRUE after migration 031; callers without a
 * tenant (dev scripts, tests) default TRUE as well. Global kill-switch wins.
 */
function tokenizationEnabledFor(tenant) {
  if (!TOKENIZER_GLOBAL_ENABLED) return false;
  if (!tenant) return true;
  return tenant.pii_tokenization_enabled !== false;
}


/**
 * Build a Tokenizer configured for this tenant + customer context.
 * Passes memory_file + soul_file so names are pseudonymized deterministically.
 */
function buildTokenizer({ tenant, memoryFile, soulFile } = {}) {
  if (!tokenizationEnabledFor(tenant)) return null;
  return new Tokenizer({ memoryFile, soulFile });
}


/**
 * Persist a breach log row. Best-effort — never throws, never blocks.
 * Called only when the breach detector fires.
 */
async function logBreach({ tenantId, conversationId, customerId, callSite, findings }) {
  try {
    const db = require('../db');
    await db.query(
      `INSERT INTO pii_breach_log (tenant_id, conversation_id, customer_id, call_site, findings)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId || null, conversationId || null, customerId || null, callSite || 'unknown', JSON.stringify(findings)]
    );
    console.warn(`[PII] BLOCKED outbound request — ${findings.length} residual finding(s), tenant=${tenantId || 'unknown'}, site=${callSite}`);
  } catch (err) {
    console.error('[PII] Failed to persist breach log:', err.message);
  }
}


/**
 * Resolve which API key to use for a tenant.
 *
 * Pure BYOK on SaaS — see file header for the policy.
 *
 *   1. managed_ai_enabled=true  → platform env key
 *      (master/enterprise opt-in only; Stripe webhook does NOT set this)
 *   2. validated BYOK on tenant → decrypt + return
 *   3. SaaS → null;  self-hosted → platform env key (operator's BYOK)
 *
 * @param {object} tenant - Tenant record (needs llm_api_key_encrypted, llm_api_key_iv, llm_api_key_validated, managed_ai_enabled)
 * @returns {string|null} The API key to use, or null if none available
 */
function resolveApiKey(tenant) {
  // 1. Managed AI opt-in → platform key
  if (tenant && tenant.managed_ai_enabled) {
    const globalKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (globalKey) return globalKey;
    console.warn('[LLM] managed_ai_enabled=true but no platform ANTHROPIC_API_KEY set');
    return null;
  }

  // 2. Tenant's own BYOK key (if validated)
  if (tenant && tenant.llm_api_key_encrypted && tenant.llm_api_key_iv && tenant.llm_api_key_validated) {
    try {
      return decrypt(tenant.llm_api_key_encrypted, tenant.llm_api_key_iv);
    } catch (err) {
      console.error('[LLM] Failed to decrypt tenant API key:', err.message);
    }
  }

  // 3. Self-hosted only: operator's env-var key is their BYOK. SaaS has no
  //    equivalent fallback — the absence of a tenant key is a hard failure
  //    so paid plans can't drift onto the platform's key by accident.
  if (isSelfHosted()) {
    const globalKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (globalKey) return globalKey;
  }

  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// New provider-aware API. Phase 1a (this commit) only knows about Anthropic;
// Phase 1b adds OpenAI dispatch via the same surface.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-turn chat. Dispatches to the adapter for the given provider.
 *
 * @param {object} opts
 * @param {string} opts.provider     - 'anthropic' (default) | 'openai' (Phase 1b)
 * @param {string} opts.systemPrompt
 * @param {Array}  opts.messages
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {string} opts.apiKey
 * @param {Tokenizer} [opts.tokenizer]
 * @param {object} [opts.breachCtx]
 */
async function chat(opts = {}) {
  if (!opts.apiKey) throw new NoApiKeyError();
  const adapter = getAdapter(opts.provider || 'anthropic');
  return adapter.chat({ ...opts, logBreach });
}

/**
 * Multi-turn chat with tool-use. Dispatches to the adapter.
 */
async function chatWithTools(opts = {}) {
  if (!opts.apiKey) throw new NoApiKeyError();
  const adapter = getAdapter(opts.provider || 'anthropic');
  return adapter.chatWithTools({ ...opts, logBreach });
}

/**
 * Validate an API key for a given provider.
 */
async function validateKey(apiKey, provider = 'anthropic') {
  const adapter = getAdapter(provider);
  return adapter.validateKey(apiKey);
}


// ─────────────────────────────────────────────────────────────────────────────
// Legacy back-compat shims. Existing call sites used these names — kept here
// so the Phase 1a refactor is zero-behavior-change. New code should use the
// `chat` / `chatWithTools` / `validateKey` functions above.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `chat({ provider, ... })` instead. Kept for back-compat.
 */
async function callClaude(systemPrompt, messages, model, maxTokens = 1024, apiKey = null, opts = {}) {
  return chat({
    provider: 'anthropic',
    systemPrompt,
    messages,
    model,
    maxTokens,
    apiKey,
    tokenizer: opts.tokenizer || null,
    breachCtx: opts.breachCtx || null,
  });
}

/**
 * @deprecated Use `chatWithTools({ provider, ... })` instead. Kept for back-compat.
 */
async function callClaudeWithTools(
  systemPrompt,
  messages,
  toolDefs,
  toolExecutor,
  model,
  maxTokens = 2048,
  apiKey = null,
  opts = {}
) {
  return chatWithTools({
    provider: 'anthropic',
    systemPrompt,
    messages,
    tools: toolDefs,
    executor: toolExecutor,
    model,
    maxTokens,
    apiKey,
    tokenizer: opts.tokenizer || null,
    breachCtx: opts.breachCtx || null,
  });
}

/**
 * @deprecated Use `validateKey(apiKey, provider)` instead. Kept for back-compat.
 */
async function validateApiKey(apiKey, provider = 'anthropic') {
  return validateKey(apiKey, provider);
}


/**
 * Generate a mock response for development/testing without an API key.
 */
function generateMockResponse(customerName, message, agentName) {
  const responses = [
    `Hi ${customerName}! I'm ${agentName || 'your AI assistant'}. I received your message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}". This is a mock response — add your API key to enable real AI responses.`,
    `Thanks for reaching out, ${customerName}. I'm currently running in demo mode. An API key is needed to activate real AI responses.`,
    `Hello ${customerName}! I'm here to help. To get real AI-powered responses, an API key needs to be configured.`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Strip non-Latin/non-standard characters that occasionally appear in LLM output.
 */
function sanitiseResponse(text) {
  if (!text) return text;
  return text
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}\u3000-\u303F\uFF00-\uFFEF]/gu, '')
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, '')
    .replace(/[\u0400-\u04FF\u0500-\u052F]/g, '')
    .replace(/  +/g, ' ')
    .trim();
}


/**
 * Main entry point — chooses real or mock, supports per-tenant keys.
 *
 * When tenant.pii_tokenization_enabled is true (default) AND a memory_file
 * is available, outbound text is tokenized before hitting the provider and
 * swapped back on response. Breaches are log-and-block: if our detector
 * finds residual PII in the tokenized payload, the request never leaves
 * this process and the user sees a safe retry message.
 */
async function getAgentResponse({
  systemPrompt,
  messages,
  model,
  customerName,
  agentName,
  lastUserMessage,
  tenant,
  memoryFile,
  soulFile,
  breachCtx,
}) {
  // Determine provider: use tenant setting, then env, then mock.
  const rawProvider = tenant?.llm_provider || process.env.LLM_PROVIDER || 'mock';

  if (rawProvider === 'mock') {
    return generateMockResponse(customerName, lastUserMessage, agentName);
  }

  // Normalize 'claude' → 'anthropic' so downstream code only sees canonical names.
  const provider = normalizeProvider(rawProvider);

  const apiKey = resolveApiKey(tenant);
  if (!apiKey) {
    // Pure BYOK: refuse to silently mock. Caller decides how to surface
    // this — operator-facing endpoints say "Add your API key in Settings",
    // customer-facing widget says "having trouble responding".
    throw new NoApiKeyError();
  }

  const tokenizer = buildTokenizer({ tenant, memoryFile, soulFile });

  try {
    const raw = await chat({
      provider,
      systemPrompt,
      messages,
      model,
      maxTokens: 1024,
      apiKey,
      tokenizer,
      breachCtx: { ...(breachCtx || {}), callSite: 'chat' },
    });
    return sanitiseResponse(raw);
  } catch (err) {
    if (err instanceof BreachError) {
      console.error(`[LLM] BreachError blocked chat request — ${err.findings.length} finding(s)`);
      return 'I noticed some sensitive information in that message. For your security, I can\'t process it in this form. Please rephrase without the specific details and I\'ll be happy to help.';
    }
    throw err;
  }
}


module.exports = {
  // High-level entry
  getAgentResponse,
  // New provider-aware API
  chat,
  chatWithTools,
  validateKey,
  // Legacy back-compat (preserve names; route through new API)
  callClaude,
  callClaudeWithTools,
  validateApiKey,
  // Helpers exposed for callers + tests
  generateMockResponse,
  resolveApiKey,
  sanitiseResponse,
  buildTokenizer,
  tokenizationEnabledFor,
  logBreach,
  NoApiKeyError,
};
