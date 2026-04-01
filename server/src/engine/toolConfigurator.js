/**
 * NOMII AI — Tool Configurator (AI-Assisted Onboarding)
 *
 * When a new tenant onboards, they describe their business.
 * This module sends that description to Claude, which reads the
 * tool registry and outputs a complete tenant configuration:
 *
 *   - vertical_config    — industry terminology and framing rules
 *   - enabled_tools      — which tools are relevant for this business
 *   - tool_configs       — industry-specific descriptions for each tool
 *   - compliance_config  — appropriate disclaimers and restrictions
 *   - onboarding_config  — what to learn about this industry's clients
 *
 * This means Nomii can onboard any new industry without anyone at
 * Ponten Solutions touching a line of code — the AI figures out the
 * right configuration from the business description alone.
 *
 * Usage:
 *   const config = await generateTenantConfig(businessDescription, apiKey);
 *   // config is ready to be saved directly to the tenants table
 */

const Anthropic   = require('@anthropic-ai/sdk');
const { listAllTools } = require('../tools/registry');

// ── System prompt ─────────────────────────────────────────────────────────────
// Instructs Claude to act as a configuration expert and return clean JSON.
const CONFIGURATOR_SYSTEM_PROMPT = `You are a configuration expert for Nomii AI — a multi-industry client engagement platform.

Your job: given a business description, produce a complete JSON tenant configuration that makes Nomii feel completely native to that business.

The configuration must be realistic, practical, and use terminology that professionals in that industry would actually use. Never be generic — if it's a healthcare business, use "patient" not "client". If it's a lumber company, use "customer" and talk about board-feet and species.

You will be given a list of available tools. For each tool you enable, write a description that:
- Uses the industry's own language
- Clearly explains WHEN the agent should call the tool
- References the kinds of data the business would actually have

Return ONLY valid JSON — no markdown fences, no explanation text. The JSON must be parseable by JSON.parse().`;

// ── Few-shot example (improves output quality significantly) ──────────────────
const EXAMPLE_INPUT = `Business: "Covenant Trust — a retirement planning firm. We manage IRA, 401(k), pension, and brokerage accounts for clients aged 55-75 approaching or in retirement."`;

const EXAMPLE_OUTPUT = JSON.stringify({
  vertical_config: {
    domain_label:           'financial',
    customer_label:         'client',
    advisor_label:          'financial advisor',
    agent_role_description: 'Personalized financial guidance assistant for clients of Covenant Trust, helping them understand their retirement accounts, goals, and planning options.',
    framing_rules:          'You provide EDUCATIONAL and INFORMATIONAL guidance only. Never give specific investment, tax, or legal advice. Frame all guidance as general information and always defer specific questions to the client\'s human advisor.',
    terminology: {
      data_section_title:    'Financial Accounts & Records',
      primary_value_label:   'Account Value',
      monthly_value_label:   'Monthly',
    },
  },
  enabled_tools: [
    'lookup_client_data',
    'analyze_client_data',
    'generate_report',
    'request_specialist',
  ],
  tool_configs: {
    lookup_client_data: {
      description: 'Retrieves this client\'s financial accounts on file — retirement accounts (IRA, 401k, pension), investments, income sources, and expenses. Use when the client asks about their accounts, balances, or financial picture.',
    },
    analyze_client_data: {
      description: 'Analyzes this client\'s retirement accounts and financial records to compute total assets, monthly income vs expenses, and identify data gaps. Use before providing any account-level guidance to ensure you have accurate figures.',
    },
    generate_report: {
      description: 'Generates a structured financial summary report — account overview, retirement readiness notes, or topic-specific analysis. Use when the client wants something in writing, asks for a summary, or when the advisor would benefit from a formatted overview.',
    },
    request_specialist: {
      description: 'Notifies a human financial advisor that this client needs personal attention. Use when the client asks a specific tax, investment, or legal question beyond educational scope, requests a meeting, or when their situation needs professional judgment.',
    },
  },
  compliance_config: {
    disclaimers: [
      'This information is educational only and does not constitute financial, tax, or legal advice.',
      'Past performance does not guarantee future results.',
      'Please consult your Covenant Trust financial advisor before making any financial decisions.',
    ],
    restricted_topics: [
      'Specific investment recommendations or stock picks',
      'Tax filing advice or specific tax strategies',
      'Legal advice regarding estates, wills, or trusts',
      'Guaranteed return promises or performance predictions',
    ],
    escalation_triggers: [
      'Client mentions significant financial loss or hardship',
      'Client asks for specific buy/sell recommendations',
      'Client expresses urgency about a financial decision',
      'Client mentions legal action or disputes',
    ],
  },
  onboarding_config: {
    categories: [
      'personal_background',
      'retirement_timeline',
      'account_overview',
      'income_and_expenses',
      'goals_and_priorities',
      'risk_comfort',
      'family_situation',
    ],
    optional_categories: [
      'estate_planning_awareness',
      'social_security_awareness',
    ],
    interview_style: 'conversational',
  },
}, null, 2);


/**
 * Generate a complete tenant configuration from a business description.
 *
 * @param {string} businessDescription — free-text description of the business
 * @param {string} apiKey              — Anthropic API key to use
 * @returns {object} Parsed configuration object ready to save to tenants table
 */
async function generateTenantConfig(businessDescription, apiKey) {
  if (!apiKey) throw new Error('API key required for AI-assisted configuration');

  const availableTools = listAllTools().map(t => ({
    name:        t.name,
    category:    t.category,
    description: t.defaultDescription,
  }));

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model:      process.env.LLM_SONNET_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system:     CONFIGURATOR_SYSTEM_PROMPT,
    messages: [
      // Few-shot example
      { role: 'user',      content: EXAMPLE_INPUT },
      { role: 'assistant', content: EXAMPLE_OUTPUT },
      // Actual request
      {
        role: 'user',
        content:
          `Business: "${businessDescription}"\n\n` +
          `Available tools:\n${JSON.stringify(availableTools, null, 2)}\n\n` +
          `Generate the Nomii configuration for this business.`,
      },
    ],
  });

  const raw = response.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    // Attempt to extract JSON if Claude wrapped it in anything
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) { /* fall through */ }
    }
    console.error('[ToolConfigurator] Failed to parse AI config output:', raw.slice(0, 300));
    throw new Error('AI configuration returned invalid JSON. Try again or configure manually.');
  }
}

/**
 * Apply a generated config to a tenant record (partial update helper).
 * Returns the SQL-ready fields — does NOT run the query itself.
 *
 * @param {object} config — output from generateTenantConfig
 * @returns {object}       Fields to SET on the tenants table
 */
function configToTenantFields(config) {
  return {
    vertical_config:   config.vertical_config   || {},
    enabled_tools:     config.enabled_tools      || [],
    tool_configs:      config.tool_configs       || {},
    compliance_config: config.compliance_config  || {},
    onboarding_config: config.onboarding_config  || {},
  };
}

module.exports = { generateTenantConfig, configToTenantFields };
