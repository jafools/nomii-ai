/**
 * NOMII AI — Tenant Routes
 * CRUD for multi-tenant firms
 *
 * Public:  GET /slug/:slug (for login page branding)
 * Auth:    GET / (list), GET /:id, GET /:id/stats
 * Admin:   PUT /:id, PATCH /:id
 */

const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireRole, requireTenantScope } = require('../middleware/auth');
const { generateTenantConfig, configToTenantFields } = require('../engine/toolConfigurator');
const { listAllTools } = require('../tools/registry');

// GET /api/tenants — List all tenants (public — needed for login dropdown)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, slug, vertical, agent_name, primary_color, secondary_color, logo_url FROM tenants WHERE is_active = true ORDER BY name'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/tenants/slug/:slug — Get tenant by slug (public — for login page branding)
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, slug, vertical, agent_name, primary_color, secondary_color, logo_url FROM tenants WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/tenants/:id — Get tenant details (authenticated)
router.get('/:id', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tenants WHERE id = $1', [req.tenant_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/tenants/:id — Update tenant config (admin only)
router.put('/:id', requireAuth(), requireRole('admin'), requireTenantScope(), async (req, res, next) => {
  try {
    const { agent_name, primary_color, secondary_color, compliance_config, base_soul_template, llm_provider, llm_model } = req.body;
    const { rows } = await db.query(
      `UPDATE tenants SET
        agent_name = COALESCE($2, agent_name),
        primary_color = COALESCE($3, primary_color),
        secondary_color = COALESCE($4, secondary_color),
        compliance_config = COALESCE($5, compliance_config),
        base_soul_template = COALESCE($6, base_soul_template),
        llm_provider = COALESCE($7, llm_provider),
        llm_model = COALESCE($8, llm_model)
      WHERE id = $1 RETURNING *`,
      [req.tenant_id, agent_name, primary_color, secondary_color,
       compliance_config ? JSON.stringify(compliance_config) : null,
       base_soul_template ? JSON.stringify(base_soul_template) : null,
       llm_provider, llm_model]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/tenants/:id — Partial update for admin (branding, onboarding, etc.)
router.patch('/:id', requireAuth(), requireRole('admin'), requireTenantScope(), async (req, res, next) => {
  try {
    const allowedFields = ['name', 'agent_name', 'primary_color', 'secondary_color', 'logo_url',
                           'vertical', 'vertical_config', 'compliance_config', 'onboarding_config',
                           'base_soul_template', 'llm_provider', 'llm_model',
                           'enabled_tools', 'tool_configs'];

    const updates = [];
    const params = [req.tenant_id];
    let paramIndex = 2;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = typeof req.body[field] === 'object' ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const { rows } = await db.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/tenants/:id/stats — Dashboard stats (authenticated)
router.get('/:id/stats', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const tenantId = req.tenant_id;
    const [customers, flags, conversations] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1 AND is_active = true', [tenantId]),
      db.query("SELECT COUNT(*) as count FROM flags f JOIN customers c ON f.customer_id = c.id WHERE c.tenant_id = $1 AND f.status = 'open'", [tenantId]),
      db.query("SELECT COUNT(*) as count FROM conversations co JOIN customers c ON co.customer_id = c.id WHERE c.tenant_id = $1 AND co.started_at > NOW() - INTERVAL '7 days'", [tenantId]),
    ]);
    res.json({
      total_customers: parseInt(customers.rows[0].count),
      open_flags: parseInt(flags.rows[0].count),
      conversations_this_week: parseInt(conversations.rows[0].count),
    });
  } catch (err) { next(err); }
});

// GET /api/tenants/tools/registry — List all available tools (for config UI)
router.get('/tools/registry', requireAuth(), async (req, res, next) => {
  try {
    res.json({ tools: listAllTools() });
  } catch (err) { next(err); }
});

// POST /api/tenants/:id/configure — AI-assisted industry configuration
//
// Body: { business_description: "We are a retirement planning firm..." }
//
// Returns a suggested configuration for review. Does NOT auto-apply —
// the admin reviews it and then calls PATCH /:id to save.
//
router.post('/:id/configure', requireAuth(), requireRole('admin'), requireTenantScope(), async (req, res, next) => {
  try {
    const { business_description } = req.body;
    if (!business_description || !business_description.trim()) {
      return res.status(400).json({ error: 'business_description is required' });
    }

    // Use platform API key for configuration (this is a Ponten Solutions cost, not per-tenant)
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI configuration requires a platform API key. Please configure ANTHROPIC_API_KEY.',
      });
    }

    const config = await generateTenantConfig(business_description.trim(), apiKey);

    res.json({
      suggested_config: config,
      fields_to_apply:  configToTenantFields(config),
      message:
        'Review the suggested configuration below. ' +
        'To apply it, send a PATCH /api/tenants/:id request with the fields_to_apply object.',
    });
  } catch (err) { next(err); }
});

module.exports = router;
