/**
 * SHENMAY AI — LLM Service
 *
 * Handles all calls to the Claude API.
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
 */

const Anthropic = require('@anthropic-ai/sdk');
const { decrypt } = require('./apiKeyService');
const { Tokenizer, BreachError } = require('./piiTokenizer');
const { isSelfHosted } = require('../config/plans');

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

// Cache Anthropic clients by API key hash to avoid re-creating
const _clientCache = new Map();

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
  if (!tenant) return true; // safest default
  // Explicitly false → off; anything else (true/null/undefined) → on.
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
    // Logging the breach log failure is itself important — but don't escalate.
    console.error('[PII] Failed to persist breach log:', err.message);
  }
}

/**
 * Get or create an Anthropic client for a given API key.
 */
function getClient(apiKey) {
  if (!apiKey) {
    throw new Error('No API key available');
  }

  // Use SHA-256 hash of key as cache key to avoid collisions
  const crypto = require('crypto');
  const cacheKey = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  if (_clientCache.has(cacheKey)) return _clientCache.get(cacheKey);

  const client = new Anthropic({ apiKey, timeout: 60000, maxRetries: 1 });
  _clientCache.set(cacheKey, client);
  return client;
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

/**
 * Call Claude API with a system prompt and message history (no tools).
 *
 * Tokenization flow (when `opts.tokenizer` is provided):
 *   1. Tokenize systemPrompt + messages, producing an in-memory TokenMap.
 *   2. Run the breach detector on the tokenized payload. If anything that
 *      looks like PII remains, THROW BreachError (caller blocks + logs).
 *   3. Send the tokenized payload to Anthropic.
 *   4. Detokenize Claude's response using the same map before returning.
 *
 * @param {object} [opts]
 * @param {Tokenizer} [opts.tokenizer]   Pre-built tokenizer with tenant context.
 * @param {object}    [opts.breachCtx]   { tenantId, conversationId, customerId, callSite }
 *                                        Used to persist breach log on BreachError.
 */
async function callClaude(systemPrompt, messages, model, maxTokens = 1024, apiKey = null, opts = {}) {
  // resolveApiKey is the single source of truth for key resolution. No
  // env-var fallback inside the call sites — that would silently bypass
  // the BYOK policy for tenants who happen to call this directly.
  if (!apiKey) throw new NoApiKeyError();

  const client = getClient(apiKey);
  const tokenizer = opts.tokenizer || null;

  let sendSystem = systemPrompt;
  let sendMessages = messages;
  let tokenMap = null;

  if (tokenizer) {
    const sys = tokenizer.tokenize(systemPrompt);
    tokenMap = sys.map;
    sendSystem = sys.text;
    const msgs = tokenizer.tokenizeMessages(messages, tokenMap);
    sendMessages = msgs.messages;

    try {
      tokenizer.auditOutbound(sendSystem, sendMessages);
    } catch (err) {
      if (err instanceof BreachError) {
        await logBreach({ ...(opts.breachCtx || {}), findings: err.findings });
        throw err; // caller translates to safe user response
      }
      throw err;
    }
  }

  const response = await client.messages.create({
    model: model || process.env.LLM_SONNET_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: sendSystem,
    messages: sendMessages,
  });

  const rawText = response.content[0]?.text ?? '';
  return tokenizer ? tokenizer.detokenize(rawText, tokenMap) : rawText;
}

/**
 * Call Claude with tool-use enabled — the full agentic loop.
 *
 * Claude may call tools multiple times before giving a final text response.
 * Each tool call is executed via the provided toolExecutor function, and the
 * result is fed back to Claude so it can continue reasoning.
 *
 * @param {string}   systemPrompt   — full system prompt
 * @param {Array}    messages        — LLM message history
 * @param {Array}    toolDefs        — tool definitions from registry.getToolDefinitions()
 *                                    each: { name, description, inputSchema }
 * @param {Function} toolExecutor    — async (toolName, params) => result
 *                                    bound to request context by the caller
 * @param {string}   model           — Claude model string
 * @param {number}   maxTokens       — max tokens per response
 * @param {string}   apiKey          — resolved API key
 * @returns {string}  Final text response from Claude
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
  if (!apiKey) throw new NoApiKeyError();

  const client    = getClient(apiKey);
  const tokenizer = opts.tokenizer || null;

  // Format tool definitions for Anthropic API
  const anthropicTools = toolDefs.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.inputSchema,
  }));

  // Tokenize system prompt + initial messages once. The TokenMap carries
  // across loop iterations so repeated identifiers get consistent tokens.
  let tokenMap  = null;
  let sendSystem = systemPrompt;
  let currentMessages = [...messages];

  if (tokenizer) {
    const sys = tokenizer.tokenize(systemPrompt);
    tokenMap = sys.map;
    sendSystem = sys.text;
    const msgs = tokenizer.tokenizeMessages(currentMessages, tokenMap);
    currentMessages = msgs.messages;
  }

  const MAX_TOOL_ROUNDS = 6; // safety ceiling — prevent runaway loops

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (tokenizer) {
      try {
        tokenizer.auditOutbound(sendSystem, currentMessages);
      } catch (err) {
        if (err instanceof BreachError) {
          await logBreach({ ...(opts.breachCtx || {}), findings: err.findings });
          throw err;
        }
        throw err;
      }
    }

    const response = await client.messages.create({
      model:      model || process.env.LLM_SONNET_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system:     sendSystem,
      messages:   currentMessages,
      tools:      anthropicTools,
    });

    // If Claude finished with text (no tool calls), we're done
    const hasToolUse = response.content.some(b => b.type === 'tool_use');
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(b => b.type === 'text');
      const joined = textBlocks.map(b => b.text).join('\n').trim();
      return tokenizer ? tokenizer.detokenize(joined, tokenMap) : joined;
    }

    // Claude wants to call tools — add its response to history.
    // Response content may contain tokenized text in text blocks; it's fine
    // to feed back as-is since we'll re-tokenize any raw text on next audit.
    currentMessages.push({ role: 'assistant', content: response.content });

    // Execute each tool call. Tool inputs reference the tokenized text
    // Claude saw, so we must DETOKENIZE them back to real values before
    // executing against the DB, then RE-TOKENIZE the result going back in.
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let execInput = block.input;
      if (tokenizer) {
        // Shallow-walk input object and detokenize any string values.
        execInput = {};
        for (const [k, v] of Object.entries(block.input || {})) {
          execInput[k] = typeof v === 'string' ? tokenizer.detokenize(v, tokenMap) : v;
        }
      }

      console.log(`[LLM] Tool call: ${block.name}`);
      const result = await toolExecutor(block.name, execInput);
      let resultStr = JSON.stringify(result);

      if (tokenizer) {
        const tok = tokenizer.tokenize(resultStr, tokenMap);
        resultStr = tok.text;
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     resultStr,
      });
    }

    // Feed results back to Claude as the next user turn
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety fallback if loop limit is hit
  console.warn('[LLM] Tool loop hit max rounds — returning fallback response');
  return 'I was working through your question but ran into a processing limit. Could you rephrase or ask me to focus on one thing at a time?';
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
 * Validate an API key by making a minimal test call.
 * Returns { valid: boolean, error?: string }
 */
async function validateApiKey(apiKey, provider = 'anthropic') {
  if (provider !== 'anthropic') {
    return { valid: false, error: `Provider "${provider}" is not yet supported. Only "anthropic" is available.` };
  }

  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: process.env.LLM_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    });
    return { valid: true };
  } catch (err) {
    if (err.status === 401) {
      return { valid: false, error: 'Invalid API key. Please check and try again.' };
    }
    if (err.status === 403) {
      return { valid: false, error: 'API key does not have permission. Check your Anthropic account.' };
    }
    return { valid: false, error: err.message || 'Could not validate API key.' };
  }
}

/**
 * Main entry point — chooses real or mock, supports per-tenant keys.
 *
 * When tenant.pii_tokenization_enabled is true (default) AND a memory_file
 * is available, outbound text is tokenized before hitting Anthropic and
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
  memoryFile,           // optional — enables name pseudonymization
  soulFile,             // optional — enables name pseudonymization
  breachCtx,            // { tenantId, conversationId, customerId, callSite }
}) {
  // Determine provider: use tenant setting, then env, then mock
  const provider = tenant?.llm_provider || process.env.LLM_PROVIDER || 'mock';

  if (provider === 'claude' || provider === 'anthropic') {
    const apiKey = resolveApiKey(tenant);
    if (!apiKey) {
      // Pure BYOK: refuse to silently mock. Caller decides how to surface
      // this — operator-facing endpoints say "Add your API key in Settings",
      // customer-facing widget says "having trouble responding".
      throw new NoApiKeyError();
    }

    const tokenizer = buildTokenizer({ tenant, memoryFile, soulFile });

    try {
      const raw = await callClaude(
        systemPrompt,
        messages,
        model,
        1024,
        apiKey,
        { tokenizer, breachCtx: { ...(breachCtx || {}), callSite: 'chat' } }
      );
      return sanitiseResponse(raw);
    } catch (err) {
      if (err instanceof BreachError) {
        // Log-and-block: request was NOT sent to Anthropic. Return a safe,
        // generic message that signals to the user to retry without PII.
        console.error(`[LLM] BreachError blocked chat request — ${err.findings.length} finding(s)`);
        return 'I noticed some sensitive information in that message. For your security, I can\'t process it in this form. Please rephrase without the specific details and I\'ll be happy to help.';
      }
      throw err;
    }
  }

  return generateMockResponse(customerName, lastUserMessage, agentName);
}

module.exports = {
  getAgentResponse,
  callClaude,
  callClaudeWithTools,
  generateMockResponse,
  validateApiKey,
  resolveApiKey,
  sanitiseResponse,
  buildTokenizer,
  tokenizationEnabledFor,
  logBreach,
  NoApiKeyError,
};
