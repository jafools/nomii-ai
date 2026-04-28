/**
 * SHENMAY AI — OpenAI Provider Adapter
 *
 * Concrete LLM provider implementation for OpenAI (and OpenAI-compatible
 * endpoints in a future Phase 2 — currently no base-URL plumbing).
 *
 * Part of the Phase 1b multi-LLM build (see docs/MULTI_LLM_SCOPING.md).
 * Implements the same adapter contract as anthropicAdapter.js so the
 * upstream `llmService.chat()` / `chatWithTools()` dispatch can stay
 * provider-agnostic.
 *
 * Shape translation
 * -----------------
 * Internally Shenmay represents messages in Anthropic's shape — that's
 * the historical shape every call site uses, and the PII tokenizer +
 * breach detector both walk that shape. This adapter does the
 * Anthropic↔OpenAI shape conversion at the SDK boundary so the rest of
 * the codebase only ever sees Anthropic-shape messages.
 *
 * Mapping reference (matches docs/MULTI_LLM_SCOPING.md):
 *   - tools[].input_schema     ↔  tools[].function.parameters
 *   - {type:'tool_use',input}  ↔  message.tool_calls[].function.arguments (JSON string)
 *   - {type:'tool_result',...} ↔  separate {role:'tool', tool_call_id, content}
 *   - top-level `system`       ↔  first message {role:'system', content}
 *   - stop_reason 'end_turn'   ↔  finish_reason 'stop'
 */

const OpenAI = require('openai');
const crypto = require('crypto');
const { BreachError } = require('../piiTokenizer');

const PROVIDER_NAME = 'openai';

const _clientCache = new Map();

function getClient(apiKey) {
  if (!apiKey) throw new Error('No API key available');
  const cacheKey = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  if (_clientCache.has(cacheKey)) return _clientCache.get(cacheKey);
  const client = new OpenAI({ apiKey, timeout: 60000, maxRetries: 1 });
  _clientCache.set(cacheKey, client);
  return client;
}

function defaultModel(role) {
  if (role === 'haiku') return process.env.LLM_OPENAI_MINI_MODEL || 'gpt-4o-mini';
  return process.env.LLM_OPENAI_MODEL || 'gpt-4o';
}

/**
 * Build OpenAI's `messages` array from Shenmay's Anthropic-shaped
 * `(systemPrompt, messages)` pair. Walks the message-content blocks and
 * flattens the Anthropic tool_use / tool_result block shapes into the
 * separate OpenAI assistant.tool_calls / role:'tool' messages.
 */
function toOpenAIMessages(systemPrompt, messages) {
  const out = [];
  if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.length > 0) {
    out.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (!Array.isArray(msg.content)) {
      out.push({ role: msg.role, content: String(msg.content ?? '') });
      continue;
    }

    // Block-content message — partition into text vs tool_use vs tool_result.
    if (msg.role === 'assistant') {
      const texts = [];
      const toolCalls = [];
      for (const block of msg.content) {
        if (typeof block === 'string') texts.push(block);
        else if (block?.type === 'text') texts.push(block.text || '');
        else if (block?.type === 'tool_use') {
          toolCalls.push({
            id:   block.id,
            type: 'function',
            function: {
              name:      block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
      }
      const assistantMsg = { role: 'assistant', content: texts.join('\n') || null };
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      out.push(assistantMsg);
      continue;
    }

    if (msg.role === 'user') {
      // user messages either carry plain text or an array of tool_result
      // blocks (replies to a previous assistant tool_use round). Each
      // tool_result becomes its own role:'tool' message in the OpenAI shape.
      const textParts = [];
      for (const block of msg.content) {
        if (typeof block === 'string') textParts.push(block);
        else if (block?.type === 'text') textParts.push(block.text || '');
        else if (block?.type === 'tool_result') {
          const content = typeof block.content === 'string' ? block.content
            : (Array.isArray(block.content) ? block.content.map(c => (c?.text || c?.content || '')).join('\n') : '');
          out.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content,
          });
        }
      }
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts.join('\n') });
      }
      continue;
    }

    // Fallback — stringify
    out.push({ role: msg.role, content: JSON.stringify(msg.content) });
  }

  return out;
}

/**
 * Convert Shenmay tool defs (Anthropic-style {name, description, inputSchema})
 * to OpenAI's {type:'function', function: {name, description, parameters}}.
 */
function toOpenAITools(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.inputSchema,
    },
  }));
}

/**
 * Convert an OpenAI assistant response message back into Anthropic-shape
 * content blocks. Used so the agentic loop can append the response to the
 * shared message history without leaking the OpenAI shape upward.
 */
function fromOpenAIResponseToContentBlocks(message) {
  const blocks = [];
  if (typeof message.content === 'string' && message.content.length > 0) {
    blocks.push({ type: 'text', text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let parsedArgs = {};
      try {
        parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (err) {
        console.warn(`[OpenAIAdapter] Tool-call arguments JSON parse failed: ${err.message} — using empty object`);
      }
      blocks.push({
        type:  'tool_use',
        id:    tc.id,
        name:  tc.function?.name || '',
        input: parsedArgs,
      });
    }
  }
  return blocks;
}

/**
 * Single-turn chat (no tools).
 */
async function chat({
  systemPrompt,
  messages,
  model,
  maxTokens = 1024,
  apiKey,
  tokenizer = null,
  breachCtx = null,
  logBreach = null,
}) {
  const client = getClient(apiKey);

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
        if (logBreach) await logBreach({ ...(breachCtx || {}), findings: err.findings });
        throw err;
      }
      throw err;
    }
  }

  const response = await client.chat.completions.create({
    model: model || defaultModel('sonnet'),
    max_tokens: maxTokens,
    messages: toOpenAIMessages(sendSystem, sendMessages),
  });

  const rawText = response.choices?.[0]?.message?.content ?? '';
  return tokenizer ? tokenizer.detokenize(rawText, tokenMap) : rawText;
}

/**
 * Multi-turn chat with tool-use. Keeps the message history in Anthropic
 * shape internally so the tokenizer works without modification, and only
 * shape-converts at the SDK boundary on each iteration.
 */
async function chatWithTools({
  systemPrompt,
  messages,
  tools,
  executor,
  model,
  maxTokens = 2048,
  apiKey,
  tokenizer = null,
  breachCtx = null,
  logBreach = null,
}) {
  const client = getClient(apiKey);

  const openAITools = toOpenAITools(tools);

  let tokenMap = null;
  let sendSystem = systemPrompt;
  let currentMessages = [...messages];

  if (tokenizer) {
    const sys = tokenizer.tokenize(systemPrompt);
    tokenMap = sys.map;
    sendSystem = sys.text;
    const msgs = tokenizer.tokenizeMessages(currentMessages, tokenMap);
    currentMessages = msgs.messages;
  }

  const MAX_TOOL_ROUNDS = 6;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (tokenizer) {
      try {
        tokenizer.auditOutbound(sendSystem, currentMessages);
      } catch (err) {
        if (err instanceof BreachError) {
          if (logBreach) await logBreach({ ...(breachCtx || {}), findings: err.findings });
          throw err;
        }
        throw err;
      }
    }

    const response = await client.chat.completions.create({
      model:      model || defaultModel('sonnet'),
      max_tokens: maxTokens,
      messages:   toOpenAIMessages(sendSystem, currentMessages),
      tools:      openAITools,
      tool_choice: 'auto',
    });

    const assistantMsg = response.choices?.[0]?.message;
    const finishReason = response.choices?.[0]?.finish_reason;
    const hasToolCalls = Array.isArray(assistantMsg?.tool_calls) && assistantMsg.tool_calls.length > 0;

    if (!hasToolCalls || finishReason === 'stop') {
      const text = assistantMsg?.content || '';
      const trimmed = text.trim();
      return tokenizer ? tokenizer.detokenize(trimmed, tokenMap) : trimmed;
    }

    // Append assistant response to history in Anthropic shape so the
    // tokenizer can re-walk it on the next iteration if needed.
    currentMessages.push({
      role:    'assistant',
      content: fromOpenAIResponseToContentBlocks(assistantMsg),
    });

    // Execute each tool call. Args arrive as JSON strings; parse + detokenize
    // before passing to the executor, then re-tokenize the result going back in.
    const toolResultBlocks = [];
    for (const tc of assistantMsg.tool_calls) {
      let rawArgs = {};
      try {
        rawArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (err) {
        console.warn(`[OpenAIAdapter] Tool-call arguments JSON parse failed for ${tc.function?.name}: ${err.message}`);
      }

      let execInput = rawArgs;
      if (tokenizer) {
        execInput = {};
        for (const [k, v] of Object.entries(rawArgs || {})) {
          execInput[k] = typeof v === 'string' ? tokenizer.detokenize(v, tokenMap) : v;
        }
      }

      console.log(`[LLM] Tool call: ${tc.function?.name}`);
      const result = await executor(tc.function?.name, execInput);
      let resultStr = JSON.stringify(result);

      if (tokenizer) {
        const tok = tokenizer.tokenize(resultStr, tokenMap);
        resultStr = tok.text;
      }

      toolResultBlocks.push({
        type:        'tool_result',
        tool_use_id: tc.id,
        content:     resultStr,
      });
    }

    // Append tool results as a single user-role message in Anthropic shape;
    // the next toOpenAIMessages() call splits them into role:'tool' messages.
    currentMessages.push({ role: 'user', content: toolResultBlocks });
  }

  console.warn('[LLM] Tool loop hit max rounds — returning fallback response');
  return 'I was working through your question but ran into a processing limit. Could you rephrase or ask me to focus on one thing at a time?';
}

/**
 * Validate an API key by making a minimal test call.
 */
async function validateKey(apiKey) {
  try {
    const client = new OpenAI({ apiKey });
    await client.chat.completions.create({
      model: defaultModel('haiku'),
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    });
    return { valid: true };
  } catch (err) {
    if (err.status === 401) {
      return { valid: false, error: 'Invalid API key. Please check and try again.' };
    }
    if (err.status === 403) {
      return { valid: false, error: 'API key does not have permission. Check your OpenAI account.' };
    }
    if (err.status === 429) {
      return { valid: false, error: 'OpenAI rate limit hit during validation — try again in a moment.' };
    }
    return { valid: false, error: err.message || 'Could not validate API key.' };
  }
}

module.exports = {
  PROVIDER_NAME,
  chat,
  chatWithTools,
  validateKey,
  defaultModel,
  // Exposed for unit tests
  _internal: {
    toOpenAIMessages,
    toOpenAITools,
    fromOpenAIResponseToContentBlocks,
  },
};
