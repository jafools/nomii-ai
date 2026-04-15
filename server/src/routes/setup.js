/**
 * NOMII AI — First-Run Setup Routes (self-hosted only)
 *
 * Provides a web-based setup wizard experience on first boot.
 * These endpoints are only active when NOMII_DEPLOYMENT=selfhosted.
 * Once a tenant exists, /complete returns 409 and the routes become inert.
 *
 *   GET  /api/setup/status    — { required: bool }
 *   POST /api/setup/complete  — create tenant + admin, return portal JWT
 */

const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../db');
const { encrypt, getLast4 } = require('../services/apiKeyService');
const { PLAN_LIMITS }       = require('../config/plans');

const PORTAL_JWT_SECRET = process.env.JWT_SECRET || 'nomii-dev-secret';
const PORTAL_JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

function requireSelfHosted(req, res, next) {
  if (process.env.NOMII_DEPLOYMENT !== 'selfhosted') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

// ── GET /api/setup/status ────────────────────────────────────────────────────
// Returns { required: true } when no tenant exists yet (fresh install).
router.get('/status', requireSelfHosted, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id FROM tenants LIMIT 1');
    res.json({ required: rows.length === 0 });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/setup/complete ─────────────────────────────────────────────────
// Called once by the setup wizard to provision the tenant and admin account.
// Body: { companyName, email, password, anthropicApiKey }
// Returns: { token, tenant } — token is a portal JWT for immediate auto-login.
router.post('/complete', requireSelfHosted, async (req, res, next) => {
  try {
    // Guard: only runs once
    const { rows: existing } = await db.query('SELECT id FROM tenants LIMIT 1');
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Setup is already complete. Please log in.' });
    }

    const { companyName, email, password, anthropicApiKey } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────────
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!anthropicApiKey || !anthropicApiKey.trim().startsWith('sk-ant-')) {
      return res.status(400).json({ error: 'Please enter a valid Anthropic API key (starts with sk-ant-)' });
    }

    const cleanCompany = companyName.trim();
    const cleanKey     = anthropicApiKey.trim();
    const slug         = cleanCompany.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tenant';
    const widgetApiKey = crypto.randomBytes(32).toString('hex');

    // Encrypt API key for storage (AES-256-GCM via apiKeyService)
    const { encrypted, iv } = encrypt(cleanKey);
    const last4             = getLast4(cleanKey);

    // ── Create tenant ──────────────────────────────────────────────────────────
    // Pre-fill onboarding_steps: company_profile + api_key were captured by the
    // setup wizard; products/customers/tools are optional and marked done so the
    // post-setup resume lands directly on the install_widget step (fixes SH-1).
    // Only install_widget remains — that's the one step the wizard can't do for
    // the operator since it requires pasting a script on their own site.
    const initialOnboardingSteps = JSON.stringify({
      company_profile: true,
      products: true,
      customers: true,
      api_key: true,
      tools: true,
    });
    const { rows: tenantRows } = await db.query(
      `INSERT INTO tenants (
         name, slug, agent_name, vertical,
         primary_color, secondary_color, widget_api_key, is_active,
         onboarding_steps, llm_api_key_encrypted, llm_api_key_iv,
         llm_api_key_provider, llm_api_key_validated, llm_api_key_last4
       ) VALUES ($1,$2,$3,'other','#1E3A5F','#C9A84C',$4,true,$5::jsonb, $6,$7,'anthropic',true,$8)
       RETURNING id`,
      [cleanCompany, slug, `${cleanCompany} Assistant`, widgetApiKey, initialOnboardingSteps, encrypted, iv, last4]
    );
    const tenantId = tenantRows[0].id;

    // ── Create admin (pre-verified — they own the server) ──────────────────────
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: adminRows } = await db.query(
      `INSERT INTO tenant_admins
         (tenant_id, email, password_hash, first_name, last_name,
          role, email_verified, tos_accepted_at)
       VALUES ($1,$2,$3,'Admin','','owner',true,NOW())
       RETURNING id`,
      [tenantId, cleanEmail, passwordHash]
    );
    const adminId = adminRows[0].id;

    // ── Create trial subscription ──────────────────────────────────────────────
    // managed_ai_enabled=false — API key is stored as BYOK in the tenant row,
    // not as a platform env var. resolveApiKey() will decrypt it from DB.
    const limits = PLAN_LIMITS.trial;
    await db.query(
      `INSERT INTO subscriptions
         (tenant_id, plan, status, max_customers, max_messages_month, managed_ai_enabled, max_agents)
       VALUES ($1,'trial','active',$2,$3,false,$4)`,
      [tenantId, limits.max_customers, limits.max_messages_month, limits.max_agents]
    );

    // ── Issue portal JWT (auto-login) ──────────────────────────────────────────
    const token = jwt.sign(
      { portal: true, tenant_id: tenantId, admin_id: adminId, email: cleanEmail, role: 'owner' },
      PORTAL_JWT_SECRET,
      { expiresIn: PORTAL_JWT_EXPIRY }
    );

    console.log(`[Setup] ✓ Self-hosted setup complete — ${cleanCompany} (${cleanEmail})`);
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    console.log(`[Setup]   Trial: ${limits.max_messages_month} msg/mo, ${limits.max_customers} customer. Upgrade: ${appUrl}/nomii/license`);

    res.status(201).json({ token, tenant: { id: tenantId, name: cleanCompany } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
