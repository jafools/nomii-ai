/**
 * SHENMAY AI — Tool Executor
 *
 * Receives a tool call from Claude (name + params), finds the right handler
 * in the registry, and runs it with the request context.
 *
 * Context object passed to every handler:
 *   db             — database pool (for queries)
 *   tenantId       — current tenant UUID
 *   customerId     — current customer UUID
 *   conversationId — current conversation UUID
 *   customer       — customer row { first_name, last_name, email, ... }
 *   tenant         — tenant row { name, vertical_config, ... }
 */

const { REGISTRY } = require('./registry');

/**
 * Execute a tool by name.
 *
 * @param {string} toolName   — must match a key in REGISTRY
 * @param {object} params     — Claude's parsed tool input
 * @param {object} context    — { db, tenantId, customerId, conversationId, customer, tenant }
 * @returns {object}          — result object sent back to Claude as tool_result
 */
async function execute(toolName, params, context) {
  const tool = REGISTRY[toolName];

  if (!tool) {
    console.warn(`[ToolExecutor] Unknown tool requested: "${toolName}"`);
    return {
      error: `Tool "${toolName}" is not available.`,
      available: Object.keys(REGISTRY),
    };
  }

  try {
    console.log(`[ToolExecutor] Executing "${toolName}" for customer ${context.customerId}`);
    const result = await tool.handler(params || {}, context);
    console.log(`[ToolExecutor] "${toolName}" completed successfully`);
    return result;
  } catch (err) {
    console.error(`[ToolExecutor] "${toolName}" failed:`, err.message);
    // Return a safe error payload — Claude will see this and adapt its response
    return {
      error:   `Tool "${toolName}" encountered an error: ${err.message}`,
      success: false,
    };
  }
}

module.exports = { execute };
