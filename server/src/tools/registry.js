/**
 * SHENMAY AI — Tool Registry
 *
 * The master list of all tools available to agents.
 * Each entry is a self-contained module with:
 *   name            — unique identifier (matches enabled_tools array in tenants)
 *   defaultDescription — what Claude sees when no tenant override is set
 *   inputSchema     — Anthropic tool input_schema (JSON Schema)
 *   handler         — async function(params, context) => result
 *   category        — for grouping in the UI: 'data_access' | 'data_analysis'
 *                     | 'document_generation' | 'escalation' | 'communication'
 *
 * To add a new tool:
 *   1. Create a file in tools/universal/ (or a vertical subdirectory)
 *   2. Export { name, defaultDescription, inputSchema, handler, category }
 *   3. Import and register it here
 *
 * Tools are never loaded into a conversation unless the tenant's
 * enabled_tools array includes the tool name. A tenant with
 * enabled_tools = [] gets pure conversation mode — no tool access.
 */

const lookupClientData  = require('./universal/lookup_client_data');
const analyzeClientData = require('./universal/analyze_client_data');
const generateReport    = require('./universal/generate_report');
const requestSpecialist = require('./universal/request_specialist');
const sendDocument      = require('./universal/send_document');

// ── Registry ────────────────────────────────────────────────────────────────
// Maps tool name → module
const REGISTRY = {
  [lookupClientData.name]:  lookupClientData,
  [analyzeClientData.name]: analyzeClientData,
  [generateReport.name]:    generateReport,
  [requestSpecialist.name]: requestSpecialist,
  [sendDocument.name]:      sendDocument,
};

/**
 * Get the active tool definitions for a tenant.
 *
 * Merges the default description with any tenant-specific override
 * from tool_configs. This is how the same tool sounds native to
 * a financial firm, a lumber yard, or a healthcare provider —
 * the description changes, the code doesn't.
 *
 * @param {string[]} enabledTools  — from tenant.enabled_tools
 * @param {object}   toolConfigs   — from tenant.tool_configs
 * @returns {Array}  Ready-to-use tool definitions for Anthropic API
 */
function getToolDefinitions(enabledTools = [], toolConfigs = {}) {
  if (!enabledTools || enabledTools.length === 0) return [];

  return enabledTools
    .filter(toolName => REGISTRY[toolName])
    .map(toolName => {
      const tool    = REGISTRY[toolName];
      const config  = toolConfigs[toolName] || {};

      return {
        name:        tool.name,
        description: config.description || tool.defaultDescription,
        inputSchema: tool.inputSchema,
        // Keep handler reference for executor
        _handler:    tool.handler,
      };
    });
}

module.exports = { REGISTRY, getToolDefinitions };
