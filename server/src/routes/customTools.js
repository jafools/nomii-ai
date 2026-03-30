/**
 * NOMII AI — Custom Tools API
 *
 * REST endpoints for the custom tool builder — lets tenant admins
 * create, read, update, and delete their own AI tools without writing code.
 *
 * All routes require a valid tenant admin session (requireAuth middleware).
 *
 * Endpoints:
 *   GET    /api/tenants/:id/custom-tools          — list all custom tools
 *   POST   /api/tenants/:id/custom-tools          — create a new custom tool
 *   PATCH  /api/tenants/:id/custom-tools/:toolId  — update a custom tool
 *   DELETE /api/tenants/:id/custom-tools/:toolId  — soft-delete (deactivate)
 *
 * Additionally:
 *   GET    /api/tenants/tools/types               — list tool types + descriptions
 *                                                   (used to populate the builder form)
 */

const express = require('express');
const router  = express.Router();

// ── Validation helpers ─────────────────────────────────────────────────────

const VALID_TOOL_TYPES = ['lookup', 'calculate', 'report', 'escalate', 'connect'];

// Tool names passed to Claude must be safe identifiers (letters, numbers, underscores)
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

function validateToolName(name) {
  return typeof name === 'string' && TOOL_NAME_PATTERN.test(name);
}

// ── Middleware: verify tenant access ───────────────────────────────────────

async function requireTenantAccess(req, res, next) {
  const { id: tenantId } = req.params;
  const user = req.user; // set by requireAuth upstream

  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  // Platform admins can access any tenant
  if (user.role === 'platform_admin') {
    req.tenantId = tenantId;
    return next();
  }

  // Tenant user must belong to this tenant
  if (user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Forbidden — you do not have access to this tenant' });
  }

  req.tenantId = tenantId;
  next();
}

// ── GET /api/tenants/tools/types ──────────────────────────────────────────
// Returns available tool types with descriptions to power the builder UI.
// No auth required — this is static reference data.
router.get('/tools/types', (req, res) => {
  res.json({
    tool_types: [
      {
        type:        'lookup',
        label:       'Look Up Client Data',
        description: 'Fetch records from a specific category of client data (e.g. portfolio holdings, past orders, case history).',
        config_fields: [
          { key: 'data_category', label: 'Data Category', type: 'text', required: true,
            placeholder: 'e.g. investments, orders, case_notes' },
        ],
      },
      {
        type:        'calculate',
        label:       'Calculate a Value',
        description: 'Compute a total, average, or count from numeric data in a specific category.',
        config_fields: [
          { key: 'data_category', label: 'Data Category',  type: 'text',   required: true,
            placeholder: 'e.g. expenses, sales, donations' },
          { key: 'metric',        label: 'Calculation',    type: 'select', required: false,
            options: ['total', 'average', 'count'], default: 'total' },
        ],
      },
      {
        type:        'report',
        label:       'Generate a Report',
        description: 'Produce a structured written report or summary, logged to the client record.',
        config_fields: [
          { key: 'report_type',    label: 'Report Type',    type: 'select', required: false,
            options: ['summary', 'detailed', 'custom'], default: 'summary' },
          { key: 'template_hint', label: 'Template Hint',  type: 'text',   required: false,
            placeholder: 'Optional: e.g. "Focus on retirement readiness"' },
        ],
      },
      {
        type:        'escalate',
        label:       'Escalate to a Specialist',
        description: 'Notify a human team member that a client needs personal attention.',
        config_fields: [
          { key: 'urgency',    label: 'Default Urgency', type: 'select', required: false,
            options: ['low', 'medium', 'high'], default: 'medium' },
          { key: 'department', label: 'Department',      type: 'text',   required: false,
            placeholder: 'e.g. Financial Advisor, Case Manager' },
        ],
      },
      {
        type:        'connect',
        label:       'Connect to Your System',
        description: 'Send a request to your own platform via a webhook URL when the agent triggers this tool.',
        config_fields: [
          { key: 'webhook_url', label: 'Webhook URL', type: 'url',    required: true,
            placeholder: 'https://your-system.com/api/nomii-hook' },
          { key: 'method',      label: 'HTTP Method', type: 'select', required: false,
            options: ['POST', 'GET', 'PUT'], default: 'POST' },
        ],
      },
    ],
  });
});

// ── GET /api/tenants/:id/custom-tools ─────────────────────────────────────
router.get('/:id/custom-tools', requireTenantAccess, async (req, res) => {
  const { db } = req.app.locals;

  try {
    const { rows } = await db.query(
      `SELECT id, name, display_name, tool_type, trigger_description, config, is_active, created_at, updated_at
       FROM custom_tools
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [req.tenantId]
    );

    res.json({ tools: rows });
  } catch (err) {
    console.error('[CustomTools] GET list failed:', err.message);
    res.status(500).json({ error: 'Failed to load custom tools' });
  }
});

// ── POST /api/tenants/:id/custom-tools ────────────────────────────────────
router.post('/:id/custom-tools', requireTenantAccess, async (req, res) => {
  const { db }                                             = req.app.locals;
  const { name, display_name, tool_type, trigger_description, config = {} } = req.body;

  // Validate required fields
  if (!name || !display_name || !tool_type || !trigger_description) {
    return res.status(400).json({
      error: 'name, display_name, tool_type, and trigger_description are required',
    });
  }

  if (!validateToolName(name)) {
    return res.status(400).json({
      error: 'Tool name must start with a letter and contain only lowercase letters, numbers, and underscores (max 64 chars)',
    });
  }

  if (!VALID_TOOL_TYPES.includes(tool_type)) {
    return res.status(400).json({
      error: `Invalid tool_type. Must be one of: ${VALID_TOOL_TYPES.join(', ')}`,
    });
  }

  // connect tools must have a webhook_url
  if (tool_type === 'connect' && !config.webhook_url) {
    return res.status(400).json({ error: 'connect tools require a webhook_url in config' });
  }

  // lookup / calculate tools need a data_category
  if (['lookup', 'calculate'].includes(tool_type) && !config.data_category) {
    return res.status(400).json({ error: `${tool_type} tools require a data_category in config` });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO custom_tools
         (tenant_id, name, display_name, tool_type, trigger_description, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.tenantId, name, display_name, tool_type, trigger_description, JSON.stringify(config)]
    );

    res.status(201).json({ tool: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `A tool named "${name}" already exists for this tenant` });
    }
    console.error('[CustomTools] POST create failed:', err.message);
    res.status(500).json({ error: 'Failed to create custom tool' });
  }
});

// ── PATCH /api/tenants/:id/custom-tools/:toolId ───────────────────────────
router.patch('/:id/custom-tools/:toolId', requireTenantAccess, async (req, res) => {
  const { db }       = req.app.locals;
  const { toolId }   = req.params;
  const allowed      = ['display_name', 'trigger_description', 'config', 'is_active'];
  const updates      = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Validate tool_type change (not normally allowed, but guard it)
  if (req.body.tool_type && !VALID_TOOL_TYPES.includes(req.body.tool_type)) {
    return res.status(400).json({ error: 'Invalid tool_type' });
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  // Build SET clause dynamically
  const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 3}`);
  const values     = [toolId, req.tenantId, ...Object.values(updates)];

  try {
    const { rows } = await db.query(
      `UPDATE custom_tools
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Custom tool not found' });
    }

    res.json({ tool: rows[0] });
  } catch (err) {
    console.error('[CustomTools] PATCH update failed:', err.message);
    res.status(500).json({ error: 'Failed to update custom tool' });
  }
});

// ── DELETE /api/tenants/:id/custom-tools/:toolId ──────────────────────────
// Soft-delete: sets is_active = false rather than removing the row.
// This preserves audit history and allows recovery.
router.delete('/:id/custom-tools/:toolId', requireTenantAccess, async (req, res) => {
  const { db }     = req.app.locals;
  const { toolId } = req.params;

  try {
    const { rows } = await db.query(
      `UPDATE custom_tools
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, display_name, is_active`,
      [toolId, req.tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Custom tool not found' });
    }

    res.json({ message: `Tool "${rows[0].display_name}" deactivated`, tool: rows[0] });
  } catch (err) {
    console.error('[CustomTools] DELETE failed:', err.message);
    res.status(500).json({ error: 'Failed to deactivate custom tool' });
  }
});

module.exports = router;
