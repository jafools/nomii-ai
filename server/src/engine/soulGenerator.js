/**
 * NOMII AI — Agent Soul Generator
 *
 * Generates an industry-appropriate agent soul from a tenant's onboarding
 * data (company, agent name, vertical, description). The generated soul is
 * stored in tenants.agent_soul_template and copied into each new customer's
 * soul_file on creation.
 *
 * Usage:
 *   const soul = await generateAgentSoul(tenant, apiKey);
 */

const Anthropic = require('@anthropic-ai/sdk');

// ── Industry role descriptions ─────────────────────────────────────────────
// Used as a fallback if Claude is unavailable
const INDUSTRY_DEFAULTS = {
  financial:   { role: 'personalised financial guidance assistant', domain: 'financial planning', tone: 'professional and reassuring' },
  retirement:  { role: 'retirement planning assistant',             domain: 'retirement',          tone: 'warm, patient, and encouraging' },
  ministry:    { role: 'ministry support assistant',                domain: 'faith and community', tone: 'compassionate, warm, and supportive' },
  healthcare:  { role: 'patient support assistant',                 domain: 'healthcare',           tone: 'caring, clear, and reassuring' },
  insurance:   { role: 'insurance guidance assistant',              domain: 'insurance',            tone: 'clear, helpful, and trustworthy' },
  education:   { role: 'student support assistant',                 domain: 'education',            tone: 'encouraging, clear, and patient' },
  ecommerce:   { role: 'customer support assistant',                domain: 'e-commerce',           tone: 'friendly, efficient, and helpful' },
  other:       { role: 'personalised customer assistant',           domain: 'customer service',     tone: 'professional and approachable' },
};

/**
 * Generate an agent soul from tenant profile data.
 *
 * @param {object} tenant - Tenant row from DB (name, agent_name, vertical, company_description, website_url)
 * @param {string|null} apiKey - Tenant's Anthropic API key (if BYOK). Falls back to platform key.
 * @returns {object} Soul object ready to store in agent_soul_template / soul_file
 */
async function generateAgentSoul(tenant, apiKey = null) {
  const {
    name:                companyName,
    agent_name:          agentName   = 'Assistant',
    vertical            = 'other',
    company_description: description = '',
    website_url:         website     = '',
  } = tenant;

  const resolvedKey = apiKey
    || process.env.ANTHROPIC_API_KEY
    || process.env.CLAUDE_API_KEY;

  // If no API key at all, return a solid rule-based default
  if (!resolvedKey) {
    return buildFallbackSoul(tenant);
  }

  const industryDefault = INDUSTRY_DEFAULTS[vertical] || INDUSTRY_DEFAULTS.other;

  const prompt = `You are helping set up an AI customer assistant called "${agentName}" for a company called "${companyName}".

Company details:
- Industry: ${vertical}
- Description: ${description || `A ${vertical} company`}
- Website: ${website || 'not provided'}

Generate a soul JSON object for this AI assistant. The soul defines who the assistant is and how it communicates. Be specific and tailored to this company.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "base_identity": {
    "agent_name": "${agentName}",
    "organization": "${companyName}",
    "role": "A 1-2 sentence description of the assistant's role, tailored to ${vertical}",
    "tone_description": "A short phrase describing the communication tone (e.g. 'warm, professional, and reassuring')"
  },
  "communication_style": {
    "tone": "2-4 words describing tone",
    "complexity_level": 3,
    "language": "plain English",
    "emotional_awareness": "high",
    "key_principles": [
      "3-5 specific principles for how this assistant should behave, tailored to ${companyName} and ${vertical}"
    ]
  },
  "compliance": {
    "disclaimer": "A short, appropriate disclaimer for the ${vertical} industry",
    "restricted_topics": ["list 1-3 topics this assistant should not advise on directly"]
  }
}`;

  try {
    const client = new Anthropic({ apiKey: resolvedKey });
    const response = await client.messages.create({
      model:      process.env.LLM_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() || '';

    // Strip any markdown code fences if present (handles spaces, CRLF, trailing text)
    const jsonText = raw.replace(/^```[\w\s]*\r?\n/, '').replace(/\r?\n```[\s\S]*$/, '').trim();
    const generated = JSON.parse(jsonText);

    return {
      ...generated,
      generated_at:   new Date().toISOString(),
      generated_from: {
        company_name: companyName,
        agent_name:   agentName,
        vertical,
        description:  description?.slice(0, 200) || '',
      },
    };
  } catch (err) {
    console.error('[SoulGenerator] LLM generation failed, using fallback:', err.message);
    return buildFallbackSoul(tenant);
  }
}


/**
 * Rule-based fallback when no API key is available.
 * Produces a solid, professional soul without calling Claude.
 */
function buildFallbackSoul(tenant) {
  const {
    name:       companyName = 'our company',
    agent_name: agentName   = 'Assistant',
    vertical   = 'other',
  } = tenant;

  const def = INDUSTRY_DEFAULTS[vertical] || INDUSTRY_DEFAULTS.other;

  return {
    base_identity: {
      agent_name:       agentName,
      organization:     companyName,
      role:             `Personalised ${def.role} for ${companyName}. Provides accurate, helpful information and knows when to involve the human team.`,
      tone_description: def.tone,
    },
    communication_style: {
      tone:                def.tone,
      complexity_level:    3,
      language:            'plain English',
      emotional_awareness: 'high',
      key_principles: [
        `Always represent ${companyName} professionally and accurately`,
        'Be helpful and clear — never confuse or overwhelm',
        'Know the limits of AI — escalate when a human is needed',
        'Respect the client\'s time — be concise but thorough',
        'Maintain confidentiality and handle sensitive topics with care',
      ],
    },
    compliance: {
      disclaimer:        `This is informational guidance only. Please consult a qualified ${def.domain} professional for specific advice.`,
      restricted_topics: ['specific legal advice', 'specific financial advice requiring a licence'],
    },
    generated_at:   new Date().toISOString(),
    generated_from: {
      company_name: companyName,
      agent_name:   agentName,
      vertical,
      description:  '',
    },
  };
}


module.exports = { generateAgentSoul, buildFallbackSoul };
