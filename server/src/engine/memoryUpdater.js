/**
 * NOMII AI — Memory Updater Engine (v2)
 *
 * Keeps every customer's memory_file and soul_file alive and current.
 * Runs fire-and-forget after each chat exchange — never blocks the response.
 *
 * Three independent operations:
 *
 *   1. extractFactsFromExchange  — haiku call after EVERY message
 *      Extracts any new facts stated by the customer (name, age, family,
 *      career, goals, concerns) and deep-merges into memory_file.
 *      Never overwrites existing data — only fills gaps.
 *
 *   2. generateSessionSummary    — haiku call on session-end detection
 *      OR every 20 messages as a mid-session checkpoint.
 *      Appends a structured entry to memory_file.conversation_history
 *      so the agent picks up seamlessly in the next session.
 *
 *   3. evolveSoulFromExchange    — haiku call every 5 messages
 *      Detects communication-style signals (prefers simpler language,
 *      more formal tone, likes specific dollar amounts, etc.) and
 *      updates soul_file.communication_style so the agent's personality
 *      slowly shapes itself to fit this specific person.
 *
 * All LLM calls use claude-haiku-4-5-20251001 (fast + cheap).
 * All operations fail silently — memory never crashes a chat.
 * Keyword-based fallback for fact extraction when no API key is available.
 */

const { callClaude, resolveApiKey } = require('../services/llmService');
const { encryptJson, safeDecryptJson } = require('../services/cryptoService');
const db = require('../db');

const HAIKU = process.env.LLM_HAIKU_MODEL || 'claude-haiku-4-5-20251001';

// ─── Session end detection ─────────────────────────────────────────────────────

const SESSION_END_PATTERNS = [
  /\b(goodbye|bye|bye-bye|good night|goodnight|talk later|talk soon|catch you later|see you later|see ya|until next time|signing off|that'?s all for (now|today)|i'?m done( for today)?|we'?re done|that will be all)\b/i,
  /\b(thanks? (so much|a lot|for everything|for your help|very much)|thank you (so much|for everything|for your time|very much))\b/i,
  /\b(have a (good|great|nice) (day|night|evening|weekend))\b/i,
];

function isSessionEnd(message) {
  return SESSION_END_PATTERNS.some(p => p.test(message));
}


// ─── LLM JSON extractor ────────────────────────────────────────────────────────

async function callHaikuForJSON(systemPrompt, userContent, apiKey, maxTokens = 512) {
  try {
    const raw = await callClaude(
      systemPrompt,
      [{ role: 'user', content: userContent }],
      HAIKU,
      maxTokens,
      apiKey
    );
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('[MemoryUpdater] LLM JSON extraction failed:', err.message);
    return null;
  }
}


// ─── 1. Fact extraction ────────────────────────────────────────────────────────

const FACT_EXTRACTION_SYSTEM = `You are a fact-extraction assistant for a persistent AI agent platform.
Given ONE conversation exchange, extract any NEW personal facts the customer explicitly stated.

STRICT RULES:
- ONLY extract facts the customer explicitly stated in their message — never infer or assume
- Return {} if nothing new was learned or if it already exists in known memory
- Keep values concise — names, numbers, short phrases only
- For arrays (children, goals, notes), only include NEW items not already known

Return JSON with ONLY fields that contain NEW information:
{
  "personal_profile": {
    "name": "Full Name",
    "age": 72,
    "location": "City, State",
    "career": "Occupation or retired status",
    "tech_comfort": "low|medium|high",
    "communication_preference": "email|phone|chat"
  },
  "family": {
    "marital_status": "married|single|widowed|divorced",
    "spouse": { "name": "...", "age": 0 },
    "children": [{ "name": "...", "age": 0, "location": "..." }]
  },
  "new_goals": ["explicit goal the customer stated"],
  "new_concerns": ["explicit concern the customer stated"],
  "new_agent_notes": ["important observation about this customer's communication or situation"]
}

Include only keys with new data. Return {} if nothing is new.`;

async function extractFactsFromExchange({ customerMessage, agentResponse, currentMemory, apiKey }) {
  if (!apiKey) return keywordFallbackExtraction(customerMessage, currentMemory);

  const userContent = `Already known about this customer:
${condenseMemory(currentMemory)}

Customer said: "${customerMessage}"
Agent replied: "${agentResponse.substring(0, 300)}"

Extract NEW facts from the customer's message only. Return {} if nothing new.`;

  const result = await callHaikuForJSON(FACT_EXTRACTION_SYSTEM, userContent, apiKey, 400);
  // If LLM fails, use keyword fallback
  return result !== null ? result : keywordFallbackExtraction(customerMessage, currentMemory);
}

/**
 * Keyword-based fact extraction — runs when no API key or LLM call fails.
 * Catches the most obvious personal facts mentioned in conversation.
 */
function keywordFallbackExtraction(message, currentMemory) {
  const facts = {};
  const lower = message.toLowerCase();

  // Age detection
  const ageMatch = message.match(/\b(i'?m|i am|i'?m turning|just turned)\s+(\d{2,3})\b/i)
    || message.match(/\b(\d{2,3})\s*years?\s*old\b/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[ageMatch.length - 1]);
    if (age > 10 && age < 120 && !(currentMemory?.personal_profile?.age)) {
      facts.personal_profile = { ...(facts.personal_profile || {}), age };
    }
  }

  // Location detection
  const locationMatch = message.match(/\b(?:i live in|i'?m from|based in|living in)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|$)/i);
  if (locationMatch && !(currentMemory?.personal_profile?.location)) {
    facts.personal_profile = { ...(facts.personal_profile || {}), location: locationMatch[1].trim() };
  }

  // Marital status
  if ((lower.includes('my wife') || lower.includes('my husband')) && !(currentMemory?.personal_profile?.family?.marital_status)) {
    facts.family = { marital_status: lower.includes('my wife') ? 'married' : 'married' };
  }
  if ((lower.includes('i am widowed') || lower.includes("i'm widowed") || lower.includes('my late wife') || lower.includes('my late husband')) && !(currentMemory?.personal_profile?.family?.marital_status)) {
    facts.family = { marital_status: 'widowed' };
  }

  // Short message note
  if (message.length < 40 && message.trim().split(/\s+/).length < 8) {
    const existing = currentMemory?.agent_notes || [];
    const shortNoteExists = existing.some(n => n.includes('short messages'));
    if (!shortNoteExists) {
      facts.new_agent_notes = ['Tends to send short messages — keep responses concise'];
    }
  }

  return Object.keys(facts).length > 0 ? facts : {};
}


// ─── 2. Session summary ────────────────────────────────────────────────────────

const SESSION_SUMMARY_SYSTEM = `You are a session archivist for a persistent AI agent.
Generate a structured memory record of this conversation that the agent will read at the START of the NEXT conversation to pick up seamlessly.

Return ONLY valid JSON (no explanation, no markdown):
{
  "summary": "2-3 sentences covering what was discussed and any key outcomes or decisions",
  "topics": ["topic_slug_1", "topic_slug_2"],
  "key_insights": ["One important thing learned about this customer's situation or preferences"],
  "action_items": ["Specific follow-up if any — otherwise empty array"],
  "goals_updated": { "goal name": "progress or status noted" },
  "emotional_tone": "positive|neutral|anxious|confused|satisfied",
  "session_quality": "productive|exploratory|support|onboarding"
}

Topics: short snake_case slugs e.g. retirement_income, healthcare_costs, estate_planning, product_inquiry`;

async function generateSessionSummary({ messages, currentMemory, sessionType = 'regular', apiKey }) {
  const transcript = messages
    .slice(-30)
    .map(m => `${m.role === 'customer' ? 'Customer' : 'Agent'}: ${m.content.substring(0, 400)}`)
    .join('\n');

  // Keyword fallback when no API key
  if (!apiKey) {
    return keywordFallbackSummary(messages, currentMemory);
  }

  const userContent = `Session type: ${sessionType}
Customer profile: ${condenseMemory(currentMemory)}

Conversation:
${transcript}

Generate a session summary for the agent's long-term memory.`;

  const result = await callHaikuForJSON(SESSION_SUMMARY_SYSTEM, userContent, apiKey, 600);
  return result !== null ? result : keywordFallbackSummary(messages, currentMemory);
}

function keywordFallbackSummary(messages, currentMemory) {
  const customerMessages = messages.filter(m => m.role === 'customer').map(m => m.content.toLowerCase());
  const allText = customerMessages.join(' ');
  const topics = detectTopicsFromText(allText);
  const name = currentMemory?.personal_profile?.name || 'Customer';

  let summary = `Conversation with ${name}.`;
  if (topics.length > 0) summary += ` Discussed: ${topics.slice(0, 3).join(', ')}.`;
  if (messages.length > 10) summary += ` Extended session with ${messages.length} exchanges.`;

  return {
    summary,
    topics,
    key_insights: [],
    action_items: [],
    goals_updated: {},
    emotional_tone: 'neutral',
    session_quality: 'exploratory',
  };
}

function detectTopicsFromText(text) {
  const topicMap = {
    'retirement_planning': ['retire', 'retirement', '401k', 'ira', 'pension'],
    'healthcare_costs':    ['health', 'medical', 'doctor', 'medicare', 'insurance', 'hospital'],
    'income_concerns':     ['income', 'social security', 'monthly', 'budget', 'expenses'],
    'estate_planning':     ['estate', 'will', 'trust', 'inheritance', 'beneficiary'],
    'investment_review':   ['invest', 'portfolio', 'stocks', 'market', 'account'],
    'family':              ['family', 'kids', 'children', 'spouse', 'grandchildren'],
    'faith':               ['faith', 'pray', 'church', 'spiritual', 'bible', 'god', 'ministry'],
    'general_support':     ['worried', 'anxious', 'stressed', 'scared', 'lonely', 'struggling'],
    'product_inquiry':     ['what do you offer', 'how does', 'tell me about', 'interested in'],
  };
  return Object.entries(topicMap)
    .filter(([, keywords]) => keywords.some(kw => text.includes(kw)))
    .map(([topic]) => topic);
}


// ─── 3. Soul evolution ────────────────────────────────────────────────────────

const SOUL_EVOLUTION_SYSTEM = `You are a communication-style analyst for a persistent AI agent.
Analyse this exchange and detect any signals about how THIS SPECIFIC CUSTOMER prefers to communicate.

Return {} if no clear signals — most exchanges have no signals.

Return JSON with only fields that need updating:
{
  "complexity_level": 2,
  "tone": "warm and casual",
  "pacing": "slow",
  "add_principles": ["Use specific dollar amounts, not percentages"],
  "add_avoid_phrases": ["Don't say it depends"],
  "notes": "Customer prefers very simple explanations and reassurance"
}

complexity_level: 1=very simple to 5=expert. Only change if clearly signaled.
Only return fields that need to change. Return {} if no style signals.`;

async function evolveSoulFromExchange({ customerMessage, agentResponse, currentSoul, apiKey }) {
  if (!apiKey) return {};

  const currentStyle = currentSoul.communication_style || currentSoul.communication_profile || {};
  const userContent = `Current communication style:
- Tone: ${currentStyle.tone || 'warm & reassuring'}
- Complexity: ${currentStyle.complexity_level || 3}/5
- Pacing: ${currentStyle.pacing || currentStyle.pace || 'moderate'}
- Key principles: ${(currentStyle.key_principles || []).slice(0, 3).join('; ') || 'none'}

Customer: "${customerMessage}"
Agent: "${agentResponse.substring(0, 300)}"

Detect communication style signals. Return {} if none.`;

  return await callHaikuForJSON(SOUL_EVOLUTION_SYSTEM, userContent, apiKey, 300) || {};
}


// ─── Memory merge helpers ──────────────────────────────────────────────────────

function mergeDeep(target, update) {
  if (!update || typeof update !== 'object') return target;
  const result = { ...target };
  for (const [key, val] of Object.entries(update)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      const existing = Array.isArray(result[key]) ? result[key] : [];
      const newItems = val.filter(v => {
        const vStr = typeof v === 'string' ? v.toLowerCase() : JSON.stringify(v);
        return !existing.some(e => (typeof e === 'string' ? e.toLowerCase() : JSON.stringify(e)) === vStr);
      });
      result[key] = [...existing, ...newItems];
    } else if (typeof val === 'object') {
      result[key] = mergeDeep(result[key] || {}, val);
    } else {
      // Only fill gaps — never overwrite existing data
      if (result[key] === null || result[key] === undefined || result[key] === '') {
        result[key] = val;
      }
    }
  }
  return result;
}

function applyFactsToMemory(memory, facts) {
  if (!facts || typeof facts !== 'object' || Object.keys(facts).length === 0) return memory;
  const updated = JSON.parse(JSON.stringify(memory));

  if (facts.personal_profile) {
    updated.personal_profile = mergeDeep(updated.personal_profile || {}, facts.personal_profile);
  }
  if (facts.family) {
    if (!updated.personal_profile) updated.personal_profile = {};
    updated.personal_profile.family = mergeDeep(updated.personal_profile.family || {}, facts.family);
  }
  if (facts.new_goals?.length > 0) {
    if (!updated.life_plan) updated.life_plan = {};
    if (!updated.life_plan.goals) updated.life_plan.goals = [];
    const existing = updated.life_plan.goals.map(g => (typeof g === 'string' ? g.toLowerCase() : ''));
    for (const g of facts.new_goals) {
      if (!existing.includes(g.toLowerCase())) updated.life_plan.goals.push(g);
    }
  }
  if (facts.new_concerns?.length > 0) {
    if (!updated.life_plan) updated.life_plan = {};
    if (!updated.life_plan.concerns) updated.life_plan.concerns = [];
    const existing = updated.life_plan.concerns.map(c => c.toLowerCase());
    for (const c of facts.new_concerns) {
      if (!existing.includes(c.toLowerCase())) updated.life_plan.concerns.push(c);
    }
  }
  if (facts.new_agent_notes?.length > 0) {
    if (!updated.agent_notes) updated.agent_notes = [];
    const existing = updated.agent_notes.map(n => n.toLowerCase());
    for (const n of facts.new_agent_notes) {
      if (!existing.includes(n.toLowerCase())) updated.agent_notes.push(n);
    }
  }
  return updated;
}

function applySessionSummary(memory, summary, sessionNumber) {
  if (!summary) return memory;
  const updated = JSON.parse(JSON.stringify(memory));
  if (!updated.conversation_history) updated.conversation_history = [];

  // Attach flags from DB if passed in summary
  const entry = {
    session:        sessionNumber || updated.conversation_history.length + 1,
    date:           new Date().toISOString().split('T')[0],
    type:           summary.session_quality || 'regular',
    summary:        summary.summary || '',
    topics:         summary.topics || [],
    key_insights:   summary.key_insights || [],
    action_items:   summary.action_items || [],
    emotional_tone: summary.emotional_tone || 'neutral',
    flags:          summary.flags || [],
  };

  if (summary.goals_updated && Object.keys(summary.goals_updated).length > 0) {
    if (!updated.life_plan) updated.life_plan = {};
    if (!updated.life_plan.goal_progress) updated.life_plan.goal_progress = {};
    Object.assign(updated.life_plan.goal_progress, summary.goals_updated);
  }

  // Also append keyword-detected agent notes
  if (summary.new_agent_notes?.length > 0) {
    if (!updated.agent_notes) updated.agent_notes = [];
    const existing = updated.agent_notes.map(n => n.toLowerCase());
    for (const n of summary.new_agent_notes) {
      if (!existing.includes(n.toLowerCase())) updated.agent_notes.push(n);
    }
  }

  updated.conversation_history.push(entry);
  return updated;
}

function applySoulEvolution(soul, signals) {
  if (!signals || Object.keys(signals).length === 0) return soul;
  const updated = JSON.parse(JSON.stringify(soul));

  if (!updated.communication_style) {
    updated.communication_style = updated.communication_profile || {};
  }
  const style = updated.communication_style;

  if (signals.complexity_level != null) {
    style.complexity_level = Math.max(1, Math.min(5, Number(signals.complexity_level)));
  }
  if (signals.tone)   style.tone = signals.tone;
  if (signals.pacing) style.pacing = signals.pacing;
  if (signals.notes)  style.notes = signals.notes;

  if (signals.add_principles?.length > 0) {
    if (!style.key_principles) style.key_principles = [];
    for (const p of signals.add_principles) {
      if (!style.key_principles.includes(p)) style.key_principles.push(p);
    }
  }
  if (signals.add_avoid_phrases?.length > 0) {
    if (!style.avoid_phrases) style.avoid_phrases = [];
    for (const p of signals.add_avoid_phrases) {
      if (!style.avoid_phrases.includes(p)) style.avoid_phrases.push(p);
    }
  }

  updated.communication_style = style;
  return updated;
}


// ─── Memory condenser ──────────────────────────────────────────────────────────

function condenseMemory(memory) {
  if (!memory || typeof memory !== 'object') return 'No prior memory.';
  const profile = memory.personal_profile || {};
  const family  = profile.family || {};
  const plan    = memory.life_plan || {};
  const notes   = memory.agent_notes || [];
  const history = memory.conversation_history || [];

  const parts = [];
  if (profile.name)            parts.push(`Name: ${profile.name}`);
  if (profile.age)             parts.push(`Age: ${profile.age}`);
  if (profile.location)        parts.push(`Location: ${profile.location}`);
  if (profile.career)          parts.push(`Career: ${profile.career}`);
  if (family.marital_status)   parts.push(`Marital: ${family.marital_status}`);
  if (family.children?.length) parts.push(`Children: ${family.children.map(c => c.name || 'child').join(', ')}`);
  if (plan.goals?.length)      parts.push(`Goals: ${plan.goals.slice(0, 3).join('; ')}`);
  if (plan.concerns?.length)   parts.push(`Concerns: ${plan.concerns.slice(0, 3).join('; ')}`);
  if (notes.length)            parts.push(`Notes: ${notes.slice(0, 2).join('; ')}`);
  if (history.length)          parts.push(`${history.length} prior sessions`);

  return parts.length > 0 ? parts.join(' | ') : 'No prior profile data.';
}


// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Run all memory updates for a single chat exchange.
 * Call fire-and-forget from chat.js — NEVER await this directly.
 *
 * @param {object} params
 *   customerMessage  — the customer's message this turn
 *   agentResponse    — the agent's response this turn
 *   currentMemory    — customer.memory_file (from DB, before this exchange)
 *   currentSoul      — customer.soul_file (from DB, before this exchange)
 *   customerId       — customer UUID
 *   conversationId   — conversation UUID
 *   messageCount     — total messages in this conversation (including this exchange)
 *   sessionType      — 'onboarding' | 'regular'
 *   apiKey           — resolved key (tenant's or platform key, can be null)
 *   db               — pg pool
 */
async function updateMemoryAfterExchange({
  customerMessage,
  agentResponse,
  currentMemory,
  currentSoul,
  customerId,
  conversationId,
  messageCount,
  sessionType,
  apiKey,
  db,
}) {
  let updatedMemory = JSON.parse(JSON.stringify(currentMemory || {}));
  let updatedSoul   = JSON.parse(JSON.stringify(currentSoul   || {}));
  let memoryChanged = false;
  let soulChanged   = false;

  try {
    // ── 1. Fact extraction — every exchange ────────────────────────────────
    const facts = await extractFactsFromExchange({
      customerMessage,
      agentResponse,
      currentMemory: updatedMemory,
      apiKey,
    });

    if (facts && Object.keys(facts).length > 0) {
      updatedMemory = applyFactsToMemory(updatedMemory, facts);
      memoryChanged = true;
      console.log(`[MemoryUpdater] Facts extracted for customer ${customerId}:`, Object.keys(facts));
    }

    // ── 2. Session summary — on goodbye OR every 20 messages ───────────────
    const endDetected = isSessionEnd(customerMessage);
    const checkpointHit = messageCount > 0 && messageCount % 20 === 0;

    if (endDetected || checkpointHit) {
      const { rows: msgRows } = await db.query(
        'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );

      // Pull any flags triggered this session to attach to the summary
      const { rows: flagRows } = await db.query(
        'SELECT flag_type, severity, description FROM flags WHERE conversation_id = $1',
        [conversationId]
      );

      const summary = await generateSessionSummary({
        messages:      msgRows,
        currentMemory: updatedMemory,
        sessionType,
        apiKey,
      });

      if (summary) {
        summary.flags = flagRows.map(f => ({ type: f.flag_type, severity: f.severity, description: f.description }));
        const sessionNum = (updatedMemory.conversation_history || []).length + 1;
        updatedMemory = applySessionSummary(updatedMemory, summary, sessionNum);
        memoryChanged = true;

        // Also persist summary to conversations table for the advisor dashboard
        await db.query(
          `UPDATE conversations SET summary = $1, topics_covered = $2 WHERE id = $3`,
          [summary.summary, JSON.stringify(summary.topics || []), conversationId]
        ).catch(() => {}); // non-critical

        console.log(`[MemoryUpdater] Session ${sessionNum} summary written for customer ${customerId} (${endDetected ? 'goodbye' : 'checkpoint'})`);
      }
    }

    // ── 3. Soul evolution — every 5 messages ──────────────────────────────
    if (messageCount > 0 && messageCount % 5 === 0) {
      const signals = await evolveSoulFromExchange({
        customerMessage,
        agentResponse,
        currentSoul: updatedSoul,
        apiKey,
      });

      if (signals && Object.keys(signals).length > 0) {
        updatedSoul = applySoulEvolution(updatedSoul, signals);
        soulChanged = true;
        console.log(`[MemoryUpdater] Soul evolved for customer ${customerId}:`, Object.keys(signals));
      }
    }

    // ── 4. Persist changes ─────────────────────────────────────────────────
    if (memoryChanged && soulChanged) {
      await db.query(
        'UPDATE customers SET memory_file = $1, soul_file = $2 WHERE id = $3',
        [JSON.stringify(encryptJson(updatedMemory)), JSON.stringify(encryptJson(updatedSoul)), customerId]
      );
    } else if (memoryChanged) {
      await db.query(
        'UPDATE customers SET memory_file = $1 WHERE id = $2',
        [JSON.stringify(encryptJson(updatedMemory)), customerId]
      );
    } else if (soulChanged) {
      await db.query(
        'UPDATE customers SET soul_file = $1 WHERE id = $2',
        [JSON.stringify(encryptJson(updatedSoul)), customerId]
      );
    }

  } catch (err) {
    console.error('[MemoryUpdater] Error during update for customer', customerId, ':', err.message);
    // Never propagate — memory errors must never crash chat
  }
}


/**
 * Legacy entry point — kept for any code that still calls updateMemoryAfterSession.
 * Calls the new updateMemoryAfterExchange with a complete session reload.
 */
async function updateMemoryAfterSession(conversationId, customerId) {
  try {
    const { rows: convRows } = await db.query(
      `SELECT co.*, c.memory_file, c.soul_file, c.first_name,
              t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated,
              t.managed_ai_enabled
       FROM conversations co
       JOIN customers c ON co.customer_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE co.id = $1`,
      [conversationId]
    );
    if (!convRows[0]) return null;

    const conv = convRows[0];
    const { rows: msgRows } = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    if (!msgRows.length) return null;

    const apiKey = resolveApiKey(conv);

    const lastCustomer = msgRows.filter(m => m.role === 'customer').pop();
    const lastAgent    = msgRows.filter(m => m.role === 'agent').pop();
    if (!lastCustomer) return null;

    await updateMemoryAfterExchange({
      customerMessage: lastCustomer.content,
      agentResponse:   lastAgent?.content || '',
      currentMemory:   safeDecryptJson(conv.memory_file),
      currentSoul:     safeDecryptJson(conv.soul_file),
      customerId:      conv.customer_id,
      conversationId,
      messageCount:    msgRows.length,
      sessionType:     'regular',
      apiKey,
      db,
    });

    return { ok: true };
  } catch (err) {
    console.error('[MemoryUpdater] Legacy updateMemoryAfterSession error:', err.message);
    return null;
  }
}


module.exports = {
  updateMemoryAfterExchange,
  updateMemoryAfterSession,   // legacy compat
  generateSessionSummary,
  applyFactsToMemory,
  applySessionSummary,
  applySoulEvolution,
  isSessionEnd,
  condenseMemory,
};
