/**
 * NOMII AI — LLM Service
 *
 * Handles all calls to the Claude API (or mock fallback).
 * Supports per-tenant API keys (BYOK) and a global fallback key (managed AI).
 *
 * Priority:
 *   1. Tenant's own API key (BYOK — stored encrypted in DB)
 *   2. Global platform key (managed AI — ANTHROPIC_API_KEY env var)
 *   3. Mock responses (development / no key configured)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { decrypt } = require('./apiKeyService');

// Cache Anthropic clients by API key hash to avoid re-creating
const _clientCache = new Map();

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
 * Key selection priority:
 *   1. managed_ai_enabled = true  → always use platform key (Growth/Professional plans)
 *   2. Tenant's own validated BYOK key (Starter plan)
 *   3. Global platform key as fallback (development / master accounts)
 *
 * @param {object} tenant - Tenant record (needs llm_api_key_encrypted, llm_api_key_iv, llm_api_key_validated, managed_ai_enabled)
 * @returns {string|null} The API key to use, or null if none available
 */
function resolveApiKey(tenant) {
  // 1. Managed AI plan → always use platform key
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

  // 3. Global platform key fallback (development / master accounts without managed flag)
  const globalKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (globalKey) return globalKey;

  // 4. No key available
  return null;
}

/**
 * Call Claude API with a system prompt and message history (no tools).
 */
async function callClaude(systemPrompt, messages, model, maxTokens = 1024, apiKey = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) throw new Error('No API key configured');

  const client = getClient(key);

  const response = await client.messages.create({
    model: model || process.env.LLM_SONNET_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  return response.content[0]?.text ?? '';
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
  apiKey = null
) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) throw new Error('No API key configured');

  const client = getClient(key);

  // Format tool definitions for Anthropic API
  const anthropicTools = toolDefs.map(t => ({
    name:         t.name,
    description:  t.description,
    input_schema: t.inputSchema,
  }));

  // Agentic loop: Claude may call tools multiple times
  let currentMessages = [...messages];
  const MAX_TOOL_ROUNDS = 6; // safety ceiling — prevent runaway loops

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model:      model || process.env.LLM_SONNET_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   currentMessages,
      tools:      anthropicTools,
    });

    // If Claude finished with text (no tool calls), we're done
    const hasToolUse = response.content.some(b => b.type === 'tool_use');
    if (!hasToolUse || response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(b => b.type === 'text');
      return textBlocks.map(b => b.text).join('\n').trim();
    }

    // Claude wants to call tools — add its response to history
    currentMessages.push({ role: 'assistant', content: response.content });

    // Execute each tool call and collect results
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      console.log(`[LLM] Tool call: ${block.name}`, block.input);
      const result = await toolExecutor(block.name, block.input);

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
      });
    }

    // Feed results back to Claude as the next user turn
    currentMessages.push({ role: 'user', content: toolResults });

    // Loop: Claude will now have the tool results and can respond or call more tools
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
 */
async function getAgentResponse({ systemPrompt, messages, model, customerName, agentName, lastUserMessage, tenant }) {
  // Determine provider: use tenant setting, then env, then mock
  const provider = tenant?.llm_provider || process.env.LLM_PROVIDER || 'mock';

  if (provider === 'claude' || provider === 'anthropic') {
    const apiKey = resolveApiKey(tenant);
    if (!apiKey) {
      console.warn('[LLM] No API key available for tenant, falling back to mock');
      return generateMockResponse(customerName, lastUserMessage, agentName);
    }
    const raw = await callClaude(systemPrompt, messages, model, 1024, apiKey);
    return sanitiseResponse(raw);
  }

  return generateMockResponse(customerName, lastUserMessage, agentName);
}

module.exports = { getAgentResponse, callClaude, callClaudeWithTools, generateMockResponse, validateApiKey, resolveApiKey, sanitiseResponse };
