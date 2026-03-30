/**
 * NOMII AI — Custom Tool Loader
 *
 * At chat time, this module:
 *   1. Loads a tenant's active custom tools from the DB
 *   2. Converts them to Anthropic-compatible tool definitions
 *   3. Builds an executor function that routes calls to handleCustomTool
 *
 * Usage in the widget route:
 *
 *   const { loadCustomTools, buildCustomExecutor } = require('./customToolLoader');
 *
 *   const customTools   = await loadCustomTools(db, tenantId);
 *   const customDefs    = customTools.map(toToolDefinition);
 *   const customExecutor = buildCustomExecutor(customTools, context);
 *
 *   // Merge with universal tools:
 *   const allDefs     = [...universalDefs, ...customDefs];
 *   const allExecutor = buildCombinedExecutor(universalExecutor, customExecutor);
 */

const { handleCustomTool } = require('./custom_tool_handler');

// ── Input schema shared by all custom tools ────────────────────────────────
// Custom tools accept a flexible params object — Claude fills in what it
// deems appropriate based on the trigger_description.
const CUSTOM_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    reason: {
      type:        'string',
      description: 'Optional: brief context for why this tool is being called.',
    },
    category: {
      type:        'string',
      description: 'Optional: data category to focus on (if relevant).',
    },
    metric: {
      type:        'string',
      description: 'Optional: computation type — total, average, or count.',
      enum:        ['total', 'average', 'count'],
    },
  },
  required: [],
};

/**
 * Load all active custom tools for a tenant.
 *
 * @param {object} db       — database pool
 * @param {string} tenantId — tenant UUID
 * @returns {Array}          — rows from custom_tools table
 */
async function loadCustomTools(db, tenantId) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, name, display_name, tool_type, trigger_description, config
     FROM custom_tools
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY created_at ASC`,
    [tenantId]
  );
  return rows;
}

/**
 * Convert a custom_tools row into an Anthropic tool definition.
 *
 * @param {object} toolRow — row from custom_tools
 * @returns {object}        tool definition: { name, description, inputSchema }
 */
function toToolDefinition(toolRow) {
  return {
    name:        toolRow.name,
    description: toolRow.trigger_description,
    inputSchema: CUSTOM_TOOL_INPUT_SCHEMA,
  };
}

/**
 * Build an executor function for a set of custom tools.
 *
 * Returns a function: (toolName, params) => Promise<result>
 * If toolName isn't found in customTools, returns null (so the caller
 * can fall through to the universal executor).
 *
 * @param {Array}  customTools — rows from custom_tools (loadCustomTools output)
 * @param {object} context     — { db, tenantId, customerId, conversationId, customer, tenant }
 */
function buildCustomExecutor(customTools, context) {
  // Index rows by name for O(1) lookup
  const toolMap = Object.fromEntries(customTools.map(t => [t.name, t]));

  return async function customExecutor(toolName, params) {
    const toolRow = toolMap[toolName];
    if (!toolRow) return null; // not a custom tool — caller should try universal

    return handleCustomTool(toolRow, params || {}, context);
  };
}

/**
 * Build a combined executor that tries custom tools first, then universal.
 *
 * @param {Function} customExecutor   — from buildCustomExecutor
 * @param {Function} universalExecutor — (toolName, params) => Promise<result>
 */
function buildCombinedExecutor(customExecutor, universalExecutor) {
  return async function combinedExecutor(toolName, params) {
    const customResult = await customExecutor(toolName, params);
    if (customResult !== null) return customResult;

    return universalExecutor(toolName, params);
  };
}

module.exports = {
  loadCustomTools,
  toToolDefinition,
  buildCustomExecutor,
  buildCombinedExecutor,
};
