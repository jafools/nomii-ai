/**
 * SHENMAY AI — Tenant Portal Routes
 *
 * All routes require a valid portal JWT (issued by /api/onboard/login or /register).
 * These power the tenant dashboard at pontensolutions.com.
 *
 *   GET  /api/portal/me                    — Current tenant + admin profile
 *   PUT  /api/portal/company               — Update company profile
 *
 *   GET  /api/portal/products              — List products/services
 *   POST /api/portal/products              — Add a product
 *   PUT  /api/portal/products/:id          — Edit a product
 *   DELETE /api/portal/products/:id        — Remove a product
 *   POST /api/portal/products/upload       — Bulk CSV import
 *   POST /api/portal/products/ai-suggest   — AI extraction from URL or description (preview only)
 *   POST /api/portal/products/bulk-save    — Save AI-suggested products after user approval
 *
 *   GET    /api/portal/customers               — List customers (paginated)
 *   POST   /api/portal/customers/ai-map       — AI column mapping (headers + sample → mapping obj)
 *   POST   /api/portal/customers/upload       — Bulk CSV import (accepts optional mapping)
 *   PUT    /api/portal/customers/:id          — Edit a customer
 *   DELETE /api/portal/customers/:id          — Right-to-Erasure (GDPR Art.17 / CCPA §1798.105)
 *   GET    /api/portal/customers/:id/export   — Data export (GDPR Art.20 / CCPA §1798.100)
 *
 *   GET  /api/portal/dashboard                        — Stats overview
 *   GET  /api/portal/conversations                    — Conversation list
 *   GET  /api/portal/conversations/:id                — Single conversation with messages
 *   POST /api/portal/conversations/:id/takeover       — Human agent takes over from AI
 *   POST /api/portal/conversations/:id/handback       — Return control to AI agent
 *   POST /api/portal/conversations/:id/reply          — Human agent sends a message
 *   GET  /api/portal/concerns                         — Escalated / flagged conversations
 *
 *   GET  /api/portal/visitors             — Anonymous (unlogged) widget visitors
 */

const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { parse: csvParse } = require('csv-parse/sync');
const { requireActiveSubscription, getSubscription, isWithinCustomerLimit } = require('../middleware/subscription');
const { UNRESTRICTED_PLANS, VALID_ADMIN_PLANS, DEPLOYMENT_MODES, isSelfHosted } = require('../config/plans');
const { decrypt } = require('../services/apiKeyService');
const { resolveApiKey, callClaude, buildTokenizer } = require('../services/llmService');
const { BreachError } = require('../services/piiTokenizer');
const { updateMemoryAfterSession, generateSessionSummary, applySessionSummary, applyFactsToMemory } = require('../engine/memoryUpdater');
const { writeAuditLog }              = require('../middleware/auditLog');
const { anonymizeCustomer }          = require('../jobs/dataRetention');
const { encryptJson, safeDecryptJson } = require('../services/cryptoService');
const { fireNotifications }          = require('../services/notificationService');
const { anonEmailNotLikeGuard, anonEmailLikeMatch } = require('../constants/anonDomains');
const { envVar }                     = require('../utils/env');
const { markStepComplete }           = require('../utils/onboarding');

const PORTAL_JWT_SECRET = process.env.JWT_SECRET || 'shenmay-dev-secret';

// ── Safe pagination helper ─────────────────────────────────────────────────
// Prevents NaN / out-of-range from malformed query params
function parsePage(raw, defaultVal = 1)  { const n = parseInt(raw, 10); return isNaN(n) ? defaultVal : Math.max(1, Math.min(n, 10000)); }
function parseLimit(raw, max = 100, def = 25) { const n = parseInt(raw, 10); return isNaN(n) ? def : Math.max(1, Math.min(n, max)); }

// ── Portal auth middleware ─────────────────────────────────────────────────
function requirePortalAuth(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Portal session required' });

  try {
    const payload = jwt.verify(token, PORTAL_JWT_SECRET);
    if (!payload.portal) return res.status(401).json({ error: 'Invalid portal token' });
    req.portal = payload;   // { tenant_id, admin_id, email, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired portal session' });
  }
}

router.use(requirePortalAuth);


// ═══════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/portal/me
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         t.id, t.name, t.slug, t.agent_name, t.vertical,
         t.primary_color, t.secondary_color,
         t.widget_api_key, t.website_url, t.company_description, t.logo_url,
         t.chat_bubble_name,
         t.onboarding_steps, t.widget_verified_at, t.is_active,
         t.llm_api_key_last4, t.llm_api_key_validated,
         t.pii_tokenization_enabled,
         t.anonymous_only_mode,
         a.id AS admin_id, a.email, a.first_name, a.last_name, a.role
       FROM tenants t
       JOIN tenant_admins a ON a.tenant_id = t.id
       WHERE t.id = $1 AND a.id = $2`,
      [req.portal.tenant_id, req.portal.admin_id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];

    // Load subscription
    const sub = await getSubscription(req.portal.tenant_id);

    res.json({
      tenant: {
        id:                  r.id,
        name:                r.name,
        slug:                r.slug,
        agent_name:          r.agent_name,
        vertical:            r.vertical,
        primary_color:       r.primary_color,
        secondary_color:     r.secondary_color,
        widget_key:          r.widget_api_key,
        website_url:         r.website_url,
        company_description: r.company_description,
        logo_url:            r.logo_url,
        chat_bubble_name:    r.chat_bubble_name,
        onboarding_steps:    r.onboarding_steps,
        widget_verified:     r.widget_verified_at !== null,
        llm_api_key_last4:   r.llm_api_key_last4 || null,
        llm_api_key_validated: r.llm_api_key_validated || false,
        pii_tokenization_enabled: r.pii_tokenization_enabled !== false,
        anonymous_only_mode: r.anonymous_only_mode === true,
      },
      admin: {
        id:         r.admin_id,
        email:      r.email,
        first_name: r.first_name,
        last_name:  r.last_name,
        role:       r.role,
      },
      subscription: sub ? {
        plan:                    sub.plan,
        status:                  sub.status,
        max_customers:           sub.max_customers,
        max_messages_month:      sub.max_messages_month,
        messages_used_this_month: sub.messages_used_this_month,
        managed_ai_enabled:      sub.managed_ai_enabled,
        trial_ends_at:           sub.trial_ends_at,
        current_period_end:      sub.current_period_end,
        canceled_at:             sub.canceled_at,
        stripe_customer_id:      sub.stripe_customer_id || null,
      } : null,
      // Lets the dashboard branch its billing UI: SaaS shows Stripe pricing
      // table; self-hosted shows "Buy a license" + Activate-Key form.
      deployment_mode: isSelfHosted() ? DEPLOYMENT_MODES.SELFHOSTED : DEPLOYMENT_MODES.SAAS,
    });
  } catch (err) { next(err); }
});


// PUT /api/portal/admin/profile  — update admin's own name
// Body: { first_name?: string, last_name?: string }
router.put('/admin/profile', async (req, res, next) => {
  try {
    const { first_name, last_name } = req.body || {};

    // Guard against non-string payloads (e.g. UI bug submitting {first_name: null}
    // as a number). COALESCE already handles undefined, but an explicit array or
    // object would reach the DB as a JSON value which fails the VARCHAR cast.
    if (first_name !== undefined && first_name !== null && typeof first_name !== 'string') {
      return res.status(400).json({ error: 'first_name must be a string' });
    }
    if (last_name !== undefined && last_name !== null && typeof last_name !== 'string') {
      return res.status(400).json({ error: 'last_name must be a string' });
    }

    const cleanFirst = typeof first_name === 'string' ? first_name.trim().slice(0, 100) : null;
    const cleanLast  = typeof last_name  === 'string' ? last_name.trim().slice(0, 100)  : null;

    await db.query(
      `UPDATE tenant_admins SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name)
       WHERE id = $3`,
      [cleanFirst || null, cleanLast || null, req.portal.admin_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/portal/admin/password  — change own password
router.put('/admin/password', async (req, res, next) => {
  try {
    const bcrypt = require('bcrypt');
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const { rows } = await db.query(
      'SELECT password_hash FROM tenant_admins WHERE id = $1',
      [req.portal.admin_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE tenant_admins SET password_hash = $1 WHERE id = $2', [newHash, req.portal.admin_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/portal/settings/privacy  — owner-only PII tokenization toggle
// Body: { pii_tokenization_enabled: boolean }
//
// The PII tokenizer rewrites regulated identifiers in every outbound Anthropic
// call (chat, CSV import, products extraction). It is ON by default for every
// tenant (see migration 031). Only the original onboarding owner can disable
// it — we don't want a team member to accidentally weaken the safety control.
router.put('/settings/privacy', async (req, res, next) => {
  try {
    if (req.portal.role !== 'owner') {
      return res.status(403).json({ error: 'Only the account owner can change privacy settings.' });
    }
    const { pii_tokenization_enabled } = req.body || {};
    if (typeof pii_tokenization_enabled !== 'boolean') {
      return res.status(400).json({ error: 'pii_tokenization_enabled (boolean) is required.' });
    }

    await db.query(
      `UPDATE tenants SET pii_tokenization_enabled = $1, updated_at = NOW() WHERE id = $2`,
      [pii_tokenization_enabled, req.portal.tenant_id]
    );

    writeAuditLog({
      actorType   : 'admin',
      actorId     : req.portal.admin_id,
      actorEmail  : req.portal.email,
      tenantId    : req.portal.tenant_id,
      eventType   : 'privacy.pii_tokenization.toggle',
      resourceType: 'tenant',
      resourceId  : req.portal.tenant_id,
      description : `Owner ${pii_tokenization_enabled ? 'enabled' : 'DISABLED'} PII tokenization for outbound Anthropic calls`,
      req,
      success     : true,
    });

    res.json({ ok: true, pii_tokenization_enabled });
  } catch (err) { next(err); }
});

// PUT /api/portal/settings/anonymous-only-mode  — owner-only tenant-wide widget
// privacy posture. When ON, the widget ignores any host-page identity and
// always runs anonymously. See migration 036. Disables per-customer memory /
// continuity for every visitor on this tenant.
router.put('/settings/anonymous-only-mode', async (req, res, next) => {
  try {
    if (req.portal.role !== 'owner') {
      return res.status(403).json({ error: 'Only the account owner can change privacy settings.' });
    }
    const { anonymous_only_mode } = req.body || {};
    if (typeof anonymous_only_mode !== 'boolean') {
      return res.status(400).json({ error: 'anonymous_only_mode (boolean) is required.' });
    }

    await db.query(
      `UPDATE tenants SET anonymous_only_mode = $1, updated_at = NOW() WHERE id = $2`,
      [anonymous_only_mode, req.portal.tenant_id]
    );

    writeAuditLog({
      actorType   : 'admin',
      actorId     : req.portal.admin_id,
      actorEmail  : req.portal.email,
      tenantId    : req.portal.tenant_id,
      eventType   : 'privacy.anonymous_only_mode.toggle',
      resourceType: 'tenant',
      resourceId  : req.portal.tenant_id,
      description : `Owner ${anonymous_only_mode ? 'ENABLED anonymous-only mode (widget forces anon sessions for all visitors)' : 'disabled anonymous-only mode'}`,
      req,
      success     : true,
    });

    res.json({ ok: true, anonymous_only_mode });
  } catch (err) { next(err); }
});


// PUT /api/portal/company
router.put('/company', async (req, res, next) => {
  try {
    const {
      name, agent_name, vertical, primary_color, secondary_color,
      website_url, company_description, logo_url, chat_bubble_name,
    } = req.body;

    await db.query(
      `UPDATE tenants SET
         name                = COALESCE($1, name),
         agent_name          = COALESCE($2, agent_name),
         vertical            = COALESCE($3, vertical),
         primary_color       = COALESCE($4, primary_color),
         secondary_color     = COALESCE($5, secondary_color),
         website_url         = COALESCE($6, website_url),
         company_description = COALESCE($7, company_description),
         logo_url            = COALESCE($8, logo_url),
         chat_bubble_name    = COALESCE($9, chat_bubble_name)
       WHERE id = $10`,
      [name, agent_name, vertical, primary_color, secondary_color,
       website_url, company_description, logo_url, chat_bubble_name, req.portal.tenant_id]
    );

    await markStepComplete(req.portal.tenant_id, 'company');

    // Auto-regenerate soul in background if key identity fields changed
    // (don't await — fire and forget, no need to block the response)
    if (name || agent_name || vertical || company_description) {
      setImmediate(async () => {
        try {
          const { generateAgentSoul } = require('../engine/soulGenerator');
          const { rows } = await db.query(
            `SELECT name, agent_name, vertical, company_description, website_url,
                    api_key_encrypted FROM tenants WHERE id = $1`,
            [req.portal.tenant_id]
          );
          if (!rows[0]) return;
          const tenant = rows[0];
          let apiKey = null;
          if (tenant.api_key_encrypted) {
            const { decrypt } = require('../services/apiKeyService');
            try { apiKey = decrypt(tenant.api_key_encrypted); } catch { /* use platform key */ }
          }
          const soul = await generateAgentSoul(tenant, apiKey);
          await db.query(
            `UPDATE tenants SET agent_soul_template = $1 WHERE id = $2`,
            [JSON.stringify(soul), req.portal.tenant_id]
          );
          console.log(`[SoulGenerator] Soul auto-regenerated for tenant ${req.portal.tenant_id}`);
        } catch (err) {
          console.error('[SoulGenerator] Auto-regenerate failed:', err.message);
        }
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});


// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/portal/email-templates  — current email customization for this tenant
router.get('/email-templates', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT email_from_name, email_reply_to, email_footer FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      email_from_name: rows[0].email_from_name || '',
      email_reply_to:  rows[0].email_reply_to  || '',
      email_footer:    rows[0].email_footer     || '',
    });
  } catch (err) { next(err); }
});

// PUT /api/portal/email-templates  — update email customization
router.put('/email-templates', async (req, res, next) => {
  try {
    const { email_from_name, email_reply_to, email_footer } = req.body;

    // Validate reply-to looks like an email (if provided)
    const cleanReplyTo = (email_reply_to || '').trim().slice(0, 255);
    if (cleanReplyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanReplyTo)) {
      return res.status(400).json({ error: 'Invalid reply-to email address' });
    }

    const cleanFromName = (email_from_name || '').trim().slice(0, 100) || null;
    const cleanFooter   = (email_footer || '').trim().slice(0, 500) || null;

    await db.query(
      `UPDATE tenants SET
         email_from_name = $1,
         email_reply_to  = $2,
         email_footer    = $3
       WHERE id = $4`,
      [cleanFromName, cleanReplyTo || null, cleanFooter, req.portal.tenant_id]
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});


// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS / SERVICES — extracted to ./portal/products-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/products', require('./portal/products-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/portal/customers/ai-map
// Accepts { headers: string[], sample_rows: object[] }
// Asks Claude to map the tenant's CSV columns → our fields.
// Returns { mapping: { "Their Column": "our_field", ... } }
// Fields Claude can map to: email, first_name, last_name, external_id, notes, skip
router.post('/customers/ai-map', async (req, res, next) => {
  try {
    const { headers, sample_rows } = req.body;
    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: 'headers array required' });
    }

    // Load tenant for tokenizer + API key resolution. Sample rows in CSV uploads
    // routinely contain regulated PII (SSNs, cards, account numbers, DOBs), so
    // the same tokenize-before-Anthropic guarantee the chat path has must apply here.
    const { rows: tenantRows } = await db.query(
      `SELECT t.id, t.pii_tokenization_enabled, t.llm_api_key_encrypted, t.llm_api_key_iv,
              t.llm_api_key_validated, t.llm_provider,
              COALESCE(s.managed_ai_enabled, false) AS managed_ai_enabled
         FROM tenants t
         LEFT JOIN subscriptions s ON s.tenant_id = t.id
         WHERE t.id = $1
         LIMIT 1`,
      [req.portal.tenant_id]
    );
    const tenant = tenantRows[0];
    if (!tenant) return res.status(404).json({ error: 'tenant not found' });

    const apiKey = resolveApiKey(tenant);
    if (!apiKey) {
      return res.status(503).json({ error: 'No AI key configured for this tenant. Add one in Settings and retry.' });
    }

    const tokenizer = buildTokenizer({ tenant });

    const systemPrompt = `You are a data mapping assistant. Map CSV column names to customer record fields.
Return ONLY a raw JSON object. No markdown. No explanation. Start with { and end with }.
Map each column name to exactly one of these field names:
  "email"       — customer email address (unique identifier, required)
  "first_name"  — first or given name
  "last_name"   — last, family, or surname
  "external_id" — any platform ID (Shopify ID, Stripe customer ID, internal user ID, account number)
  "notes"       — any freeform notes, comments, or tags
  "skip"        — ignore this column

Rules:
- Every column must be mapped to something (use "skip" if irrelevant)
- If two columns could both be "email", pick the most likely one and skip the other
- Map full names to first_name if there is no separate last_name column
- Account numbers, member IDs, user IDs → external_id

Sample values may be redacted to opaque tokens like [EMAIL_N], [SSN_N], [PHONE_N],
[CC_N], [ACCOUNT_N], [DOB_N], [POSTCODE_N], [IBAN_N], [PERSON_N] — the token name
tells you what kind of data the column holds and is a strong mapping signal.`;

    const userPrompt = `Map these CSV columns to customer record fields.
Columns: ${JSON.stringify(headers)}
Sample data (first few rows): ${JSON.stringify(sample_rows?.slice(0, 3) || [])}`;

    let rawText;
    try {
      rawText = await callClaude(
        systemPrompt,
        [{ role: 'user', content: userPrompt }],
        process.env.LLM_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
        512,
        apiKey,
        {
          tokenizer,
          breachCtx: {
            tenantId: req.portal.tenant_id,
            callSite: 'csv_import_ai_map',
          },
        }
      );
    } catch (err) {
      if (err instanceof BreachError) {
        // Breach detector fired on the tokenized payload — request NEVER left
        // this process. Tell the admin which rows looked unsafe so they can
        // retry without sample values.
        return res.status(422).json({
          error: 'Some sample values look like unredacted personal data that our safety check blocked. Try re-uploading without sample rows, or with a smaller, less-sensitive sample.',
          blocked_by_pii_guard: true,
        });
      }
      throw err;
    }

    let mapping = {};
    try {
      let raw = rawText.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) raw = objMatch[0];
      mapping = JSON.parse(raw);
      // Ensure all values are valid field names
      const validFields = new Set(['email', 'first_name', 'last_name', 'external_id', 'notes', 'skip']);
      for (const [col, field] of Object.entries(mapping)) {
        if (!validFields.has(field)) mapping[col] = 'skip';
      }
    } catch {
      console.error('[ai-map] JSON parse failed:', rawText?.slice(0, 300));
      return res.status(500).json({ error: 'Could not parse AI mapping. Try again.' });
    }

    res.json({ mapping });
  } catch (err) { next(err); }
});


// POST /api/portal/customers/upload
// Accepts { csv, mapping? }
// mapping: { "CSV Column Name": "our_field" } — from ai-map or user-confirmed
// If no mapping provided, falls back to guessing by common column name variants.
router.post('/customers/upload', async (req, res, next) => {
  try {
    const { csv, mapping } = req.body;
    if (!csv) return res.status(400).json({ error: 'csv field required' });

    let records;
    try {
      records = csvParse(csv, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      return res.status(400).json({ error: 'Could not parse CSV — check the file format' });
    }
    if (records.length === 0) return res.status(400).json({ error: 'CSV contains no rows' });

    // Load subscription and current customer count to enforce limits
    const sub = await getSubscription(req.portal.tenant_id);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL AND ${anonEmailNotLikeGuard()}`,
      [req.portal.tenant_id]
    );

    // Fetch agent soul template to pre-populate new customers
    const { rows: tenantSoulRows } = await db.query(
      `SELECT agent_soul_template FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    const soulTemplate = tenantSoulRows[0]?.agent_soul_template || null;
    let currentCount = parseInt(countRows[0].count);
    const maxCustomers = sub ? sub.max_customers : null;
    const isUnrestricted = sub && UNRESTRICTED_PLANS.includes(sub.plan);

    // Build a resolver: given a row, extract a named field using the mapping
    // Falls back to common name variants if no mapping provided
    const FALLBACKS = {
      email:       ['email', 'Email', 'EMAIL', 'e-mail', 'E-Mail'],
      first_name:  ['first_name', 'firstName', 'First Name', 'first', 'given_name', 'name'],
      last_name:   ['last_name',  'lastName',  'Last Name',  'last',  'surname', 'family_name'],
      external_id: ['external_id', 'id', 'ID', 'user_id', 'customer_id', 'account_id', 'member_id'],
      notes:       ['notes', 'Notes', 'NOTES', 'comments', 'Comments', 'tags', 'Tags'],
    };

    function resolve(row, field) {
      if (mapping) {
        // Find the CSV column(s) that map to this field
        for (const [col, mappedField] of Object.entries(mapping)) {
          if (mappedField === field && row[col] !== undefined) return (row[col] || '').trim();
        }
        return '';
      }
      // Fallback: try common variants
      for (const variant of FALLBACKS[field] || []) {
        if (row[variant] !== undefined) return (row[variant] || '').trim();
      }
      return '';
    }

    let inserted = 0;
    let updated  = 0;
    const errors = [];

    for (const [i, row] of records.entries()) {
      const email = resolve(row, 'email').toLowerCase();
      if (!email) { errors.push(`Row ${i + 2}: no email found`); continue; }

      const firstName  = resolve(row, 'first_name');
      const lastName   = resolve(row, 'last_name');
      const externalId = resolve(row, 'external_id') || null;
      const notes      = resolve(row, 'notes')       || null;

      // Any columns mapped to "skip" or already handled are excluded from extra
      const mappedFields = new Set(mapping ? Object.values(mapping) : []);
      const handledCols  = new Set(
        mapping
          ? Object.entries(mapping).filter(([,f]) => f !== 'skip').map(([c]) => c)
          : [...FALLBACKS.email, ...FALLBACKS.first_name, ...FALLBACKS.last_name,
             ...FALLBACKS.external_id, ...FALLBACKS.notes]
      );

      const upsert = async (customerId) => {
        if (externalId) {
          await db.query(
            `UPDATE customers SET external_id = $1 WHERE id = $2 AND (external_id IS NULL OR external_id = $1)`,
            [externalId, customerId]
          );
        }
        if (notes) {
          await db.query(
            `INSERT INTO customer_data (customer_id, category, label, value, value_type, source)
             VALUES ($1, 'profile', 'Notes', $2, 'text', 'csv_import')
             ON CONFLICT (customer_id, category, label) DO UPDATE SET
               value = EXCLUDED.value, recorded_at = NOW()`,
            [customerId, notes]
          );
        }
      };

      const { rows: existing } = await db.query(
        `SELECT id FROM customers
         WHERE tenant_id = $1 AND (email = $2 ${externalId ? 'OR external_id = $3' : ''})`,
        externalId ? [req.portal.tenant_id, email, externalId] : [req.portal.tenant_id, email]
      );

      if (existing.length > 0) {
        await db.query(
          `UPDATE customers SET
             first_name = COALESCE(NULLIF($1,''), first_name),
             last_name  = COALESCE(NULLIF($2,''), last_name),
             email      = COALESCE(NULLIF($3,''), email)
           WHERE id = $4`,
          [firstName, lastName, email, existing[0].id]
        );
        await upsert(existing[0].id);
        updated++;
      } else {
        // Enforce customer limit for new inserts
        if (!isUnrestricted && maxCustomers !== null && currentCount >= maxCustomers) {
          errors.push(`Row ${i + 2}: customer limit reached (${maxCustomers} max) — upgrade your plan to add more`);
          // Fire one-time notification email for trial tenants
          const { sendLimitNotificationIfNeeded } = require('../middleware/subscription');
          sendLimitNotificationIfNeeded(req.portal.tenant_id);
          continue;
        }
        const { rows: newCust } = await db.query(
          `INSERT INTO customers (tenant_id, email, first_name, last_name, external_id, onboarding_status, soul_file)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
           RETURNING id`,
          [req.portal.tenant_id, email, firstName, lastName, externalId,
           JSON.stringify(encryptJson(soulTemplate || {}))]
        );
        await upsert(newCust[0].id);
        inserted++;
        currentCount++;
      }
    }

    await markStepComplete(req.portal.tenant_id, 'customers');
    const limitReached = !isUnrestricted && maxCustomers !== null && currentCount >= maxCustomers;
    res.json({ ok: true, inserted, updated, errors, limit_reached: limitReached, customers_count: currentCount, customers_limit: maxCustomers });
  } catch (err) { next(err); }
});

// GET /api/portal/customers  — named/known customers only (excludes anonymous visitors)
router.get('/customers', async (req, res, next) => {
  try {
    const page   = parsePage(req.query.page);
    const limit  = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;
    const q      = (req.query.q || '').trim().slice(0, 200);

    const params = [req.portal.tenant_id, limit, offset];
    let searchClause = '';

    if (q) {
      // Search by name or email (case-insensitive)
      params.push(`%${q}%`);
      const p = params.length;
      searchClause = `AND (
        first_name ILIKE $${p} OR
        last_name  ILIKE $${p} OR
        email      ILIKE $${p} OR
        (first_name || ' ' || last_name) ILIKE $${p}
      )`;
    }

    const { rows } = await db.query(
      `SELECT id, email,
              COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS display_name,
              first_name, last_name, onboarding_status,
              last_interaction_at, created_at,
              CASE
                WHEN last_interaction_at IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (NOW() - last_interaction_at)) / 60)
                ELSE NULL
              END AS idle_minutes
       FROM customers
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND ${anonEmailNotLikeGuard()}
         ${searchClause}
       ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    const countParams = [req.portal.tenant_id];
    let countSearch = '';
    if (q) {
      countParams.push(`%${q}%`);
      const p = countParams.length;
      countSearch = `AND (
        first_name ILIKE $${p} OR last_name ILIKE $${p} OR email ILIKE $${p} OR
        (first_name || ' ' || last_name) ILIKE $${p}
      )`;
    }

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM customers
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND ${anonEmailNotLikeGuard()}
         ${countSearch}`,
      countParams
    );

    res.json({
      customers: rows,
      total:     parseInt(countRows[0].count),
      page,
      limit,
      query:     q || null,
    });
  } catch (err) { next(err); }
});

// GET /api/portal/search — unified search across customers + conversations
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().slice(0, 200);
    if (!q) return res.json({ customers: [], conversations: [] });

    const tid = req.portal.tenant_id;
    const pattern = `%${q}%`;

    const [{ rows: customers }, { rows: conversations }] = await Promise.all([
      // Customer search: name or email
      db.query(
        `SELECT id, email,
                COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS display_name,
                first_name, last_name, onboarding_status, last_interaction_at
         FROM customers
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND ${anonEmailNotLikeGuard()}
           AND (
             first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR
             (first_name || ' ' || last_name) ILIKE $2
           )
         ORDER BY last_interaction_at DESC NULLS LAST
         LIMIT 10`,
        [tid, pattern]
      ),

      // Conversation search: last message content or customer name
      db.query(
        `SELECT c.id, c.status, c.created_at,
                cu.id AS customer_id,
                COALESCE(NULLIF(TRIM(cu.first_name || ' ' || cu.last_name), ''), cu.email) AS customer_display_name,
                cu.email,
                (SELECT content FROM messages WHERE conversation_id = c.id
                 AND content ILIKE $2
                 ORDER BY created_at DESC LIMIT 1) AS matching_message,
                (SELECT created_at FROM messages WHERE conversation_id = c.id
                 ORDER BY created_at DESC LIMIT 1) AS last_message_at
         FROM conversations c
         JOIN customers cu ON c.customer_id = cu.id
         WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id AND m.content ILIKE $2
           )
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT 10`,
        [tid, pattern]
      ),
    ]);

    res.json({ customers, conversations, query: q });
  } catch (err) { next(err); }
});

// GET /api/portal/customers/:id  — customer detail with soul + memory + conversations
router.get('/customers/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.email, c.first_name, c.last_name, c.onboarding_status,
              c.soul_file, c.memory_file, c.last_interaction_at, c.created_at,
              c.consent_given_at, c.anonymized_at, c.deletion_requested_at,
              json_agg(json_build_object(
                'category', cd.category,
                'label',    cd.label,
                'value',    cd.value,
                'type',     cd.value_type,
                'metadata', cd.metadata
              ) ORDER BY cd.recorded_at) FILTER (WHERE cd.id IS NOT NULL) AS data,
              (SELECT COALESCE(json_agg(json_build_object(
                'id',              conv.id,
                'status',          conv.status,
                'created_at',      conv.created_at,
                'message_count',   (SELECT COUNT(*) FROM messages WHERE conversation_id = conv.id),
                'last_message_at', (SELECT created_at FROM messages WHERE conversation_id = conv.id ORDER BY created_at DESC LIMIT 1),
                'last_message',    (SELECT content FROM messages WHERE conversation_id = conv.id ORDER BY created_at DESC LIMIT 1)
              ) ORDER BY conv.created_at DESC), '[]')
               FROM conversations conv
               WHERE conv.customer_id = c.id) AS conversations
       FROM customers c
       LEFT JOIN customer_data cd ON cd.customer_id = c.id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [req.params.id, req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

    // Decrypt encrypted columns before returning to portal
    const customer = rows[0];
    customer.soul_file   = safeDecryptJson(customer.soul_file);
    customer.memory_file = safeDecryptJson(customer.memory_file);

    // Audit log: advisor accessed a customer profile
    writeAuditLog({
      actorType   : req.portal.role === 'admin' ? 'admin' : 'advisor',
      actorId     : req.portal.admin_id,
      actorEmail  : req.portal.email,
      tenantId    : req.portal.tenant_id,
      customerId  : req.params.id,
      eventType   : 'customer.read',
      resourceType: 'customer',
      resourceId  : req.params.id,
      description : `Advisor viewed customer profile (includes soul_file + memory_file)`,
      req,
      success     : true,
    });

    res.json({ customer });
  } catch (err) { next(err); }
});

// PUT /api/portal/customers/:id
// Body: { first_name?: string, last_name?: string }
router.put('/customers/:id', async (req, res, next) => {
  try {
    const { first_name, last_name } = req.body || {};

    if (first_name !== undefined && first_name !== null && typeof first_name !== 'string') {
      return res.status(400).json({ error: 'first_name must be a string' });
    }
    if (last_name !== undefined && last_name !== null && typeof last_name !== 'string') {
      return res.status(400).json({ error: 'last_name must be a string' });
    }

    const cleanFirst = typeof first_name === 'string' ? first_name.trim().slice(0, 100) : null;
    const cleanLast  = typeof last_name  === 'string' ? last_name.trim().slice(0, 100)  : null;

    const { rowCount } = await db.query(
      `UPDATE customers SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name)
       WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL`,
      [cleanFirst, cleanLast, req.params.id, req.portal.tenant_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});


// DELETE /api/portal/customers/:id
//
// Right-to-Erasure — GDPR Article 17, CCPA Section 1798.105
//
// Fully anonymises the customer record:
//   - PII fields (name, email, phone, DOB, location) → placeholder values
//   - memory_file + soul_file wiped to {}
//   - customer_data records deleted
//   - flags deleted (contain PII in description)
//   - message content replaced with deletion notice
//   - conversation metadata kept (no PII) for analytics
//   - audit log entry written
//
// The customer row is NOT hard-deleted — foreign key references (conversations,
// flags, audit_logs) require the row to exist for referential integrity.
//
router.delete('/customers/:id', async (req, res, next) => {
  try {
    // Verify customer belongs to this tenant
    const { rows: check } = await db.query(
      `SELECT id, anonymized_at FROM customers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Customer not found' });
    if (check[0].anonymized_at) {
      return res.status(409).json({ error: 'Customer data has already been erased' });
    }

    // Audit: log the erasure request BEFORE executing (so there's a record even if it fails)
    writeAuditLog({
      actorType   : req.portal.role === 'admin' ? 'admin' : 'advisor',
      actorId     : req.portal.admin_id,
      actorEmail  : req.portal.email,
      tenantId    : req.portal.tenant_id,
      customerId  : req.params.id,
      eventType   : 'customer.erasure_requested',
      resourceType: 'customer',
      resourceId  : req.params.id,
      description : `Right-to-erasure invoked by advisor — immediate anonymisation`,
      req,
      success     : true,
    });

    // Mark deletion requested (for queue visibility), then immediately process
    await db.query(
      `UPDATE customers SET deletion_requested_at = NOW(), deletion_requested_by = $2
       WHERE id = $1`,
      [req.params.id, req.portal.admin_id]
    );

    // Execute anonymisation immediately (not deferred — advisor expects it now)
    await anonymizeCustomer(req.params.id, req.portal.tenant_id, req.portal.admin_id);

    console.log(`[Portal] Customer ${req.params.id} anonymised (right-to-erasure) by advisor ${req.portal.admin_id}`);
    res.json({ ok: true, message: 'Customer data has been permanently anonymised and removed.' });
  } catch (err) { next(err); }
});


// GET /api/portal/customers/:id/export
//
// Right-to-Access (Data Portability) — GDPR Article 20, CCPA Section 1798.100
//
// Returns a structured JSON object containing all data held about the customer:
//   - Personal profile (name, email, phone, DOB, location)
//   - Memory file (conversation history, goals, profile extracted by AI)
//   - Soul file (communication preferences, agent nickname)
//   - Structured data records (financial, health, etc.)
//   - Conversation metadata (dates, summaries, topics — not raw messages)
//   - Consent record
//
// The response is suitable for providing directly to the customer as their
// GDPR "data subject access request" (DSAR) response.
//
router.get('/customers/:id/export', async (req, res, next) => {
  try {
    // Verify customer belongs to this tenant
    const { rows: customerRows } = await db.query(
      `SELECT c.*, t.name AS tenant_name, t.gdpr_contact_email
       FROM customers c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (customerRows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = customerRows[0];
    // Decrypt encrypted columns before building the export package
    customer.soul_file   = safeDecryptJson(customer.soul_file);
    customer.memory_file = safeDecryptJson(customer.memory_file);

    // Structured data records
    const { rows: dataRows } = await db.query(
      `SELECT category, label, value, secondary_value, value_type, source, recorded_at
       FROM customer_data WHERE customer_id = $1 ORDER BY category, label`,
      [req.params.id]
    );

    // Conversation metadata (no message content — that's separately accessible)
    const { rows: convRows } = await db.query(
      `SELECT id, session_type, status, summary, topics_covered,
              started_at, ended_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conversations.id) AS message_count
       FROM conversations
       WHERE customer_id = $1
       ORDER BY started_at DESC`,
      [req.params.id]
    );

    // Flags (excluding already-deleted ones)
    const { rows: flagRows } = await db.query(
      `SELECT flag_type, severity, description, status, created_at, resolved_at
       FROM flags WHERE customer_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    // Audit log entries for this customer (what data was accessed and by whom)
    const { rows: auditRows } = await db.query(
      `SELECT event_type, actor_type, actor_email, description, created_at, success
       FROM audit_logs
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.params.id]
    );

    // Audit: log the export
    writeAuditLog({
      actorType   : req.portal.role === 'admin' ? 'admin' : 'advisor',
      actorId     : req.portal.admin_id,
      actorEmail  : req.portal.email,
      tenantId    : req.portal.tenant_id,
      customerId  : req.params.id,
      eventType   : 'customer.data_export',
      resourceType: 'customer',
      resourceId  : req.params.id,
      description : `Full data export (GDPR DSAR / CCPA access request)`,
      req,
      success     : true,
    });

    // Build the export package
    const exportPackage = {
      export_metadata: {
        generated_at      : new Date().toISOString(),
        generated_by      : req.portal.email,
        data_controller   : customer.tenant_name,
        gdpr_contact      : customer.gdpr_contact_email || 'See your service provider\'s privacy policy',
        export_format     : 'application/json',
        schema_version    : '1.0',
      },
      personal_data: {
        id              : customer.id,
        name            : `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        email           : customer.email,
        phone           : customer.phone,
        date_of_birth   : customer.date_of_birth,
        location        : customer.location,
        created_at      : customer.created_at,
        last_interaction: customer.last_interaction_at,
      },
      consent: {
        consent_given_at : customer.consent_given_at,
        consent_version  : customer.consent_version,
        consent_ip       : customer.consent_ip ? String(customer.consent_ip) : null,
      },
      ai_memory: {
        memory_file      : customer.memory_file || {},
        soul_file        : customer.soul_file   || {},
      },
      structured_data   : dataRows,
      conversations     : convRows,
      flags             : flagRows,
      access_log        : auditRows,
    };

    // Respond as a downloadable JSON file
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer_data_export_${req.params.id}_${new Date().toISOString().split('T')[0]}.json"`
    );
    res.json(exportPackage);
  } catch (err) { next(err); }
});


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD & CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/portal/dashboard  — stats overview
router.get('/dashboard', async (req, res, next) => {
  try {
    const tid = req.portal.tenant_id;

    const [totalConvs, activeCustomers, totalCustomers, anonVisitors, recentConvs, totalMessages, concerns] =
      await Promise.all([
        db.query(
          `SELECT COUNT(*) FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL`,
          [tid]
        ),
        db.query(
          `SELECT COUNT(DISTINCT c.customer_id)
           FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL
             AND c.created_at > NOW() - INTERVAL '30 days'
             AND ${anonEmailNotLikeGuard('cu.email')}`,
          [tid]
        ),
        db.query(
          `SELECT COUNT(*) FROM customers
           WHERE tenant_id = $1 AND deleted_at IS NULL
             AND ${anonEmailNotLikeGuard()}`,
          [tid]
        ),
        db.query(
          `SELECT COUNT(*) FROM customers
           WHERE tenant_id = $1 AND deleted_at IS NULL
             AND ${anonEmailLikeMatch()}`,
          [tid]
        ),
        db.query(
          `SELECT c.id, c.status, c.created_at,
                  CASE
                    WHEN ${anonEmailLikeMatch('cu.email')} THEN 'Anonymous Visitor'
                    ELSE COALESCE(cu.soul_file->>'customer_name', NULLIF(TRIM(cu.first_name || ' ' || cu.last_name), ''), cu.email)
                  END AS customer_display_name,
                  cu.email,
                  ${anonEmailLikeMatch('cu.email')} AS is_anonymous,
                  (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                  (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
                  (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count
           FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL
           ORDER BY COALESCE(
             (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
             c.created_at
           ) DESC LIMIT 10`,
          [tid]
        ),
        db.query(
          `SELECT COUNT(*) FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL`,
          [tid]
        ),
        db.query(
          `SELECT COUNT(*) FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1 AND cu.deleted_at IS NULL AND c.status = 'escalated'`,
          [tid]
        ),
      ]);

    res.json({
      stats: {
        total_conversations:  parseInt(totalConvs.rows[0].count),
        active_customers_30d: parseInt(activeCustomers.rows[0].count),
        total_customers:      parseInt(totalCustomers.rows[0].count),
        anonymous_visitors:   parseInt(anonVisitors.rows[0].count),
        total_messages:       parseInt(totalMessages.rows[0].count),
        open_concerns:        parseInt(concerns.rows[0].count),
      },
      recent_conversations: recentConvs.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/portal/analytics?period=7d|30d|90d  — time-series chart data
router.get('/analytics', async (req, res, next) => {
  try {
    const tid = req.portal.tenant_id;
    const VALID_PERIODS = { '7d': 7, '30d': 30, '90d': 90 };
    const days = VALID_PERIODS[req.query.period] || 30;

    const [dailyMessages, dailyConversations, topCustomers, periodConvs, periodMsgs] =
      await Promise.all([
        // Daily message volume
        db.query(
          `SELECT DATE(m.created_at) AS day, COUNT(*)::int AS count
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1
             AND cu.deleted_at IS NULL
             AND m.created_at >= NOW() - make_interval(days => ${Number(days)})
           GROUP BY DATE(m.created_at)
           ORDER BY day`,
          [tid]
        ),
        // Daily conversation stats (total started + escalated)
        db.query(
          `SELECT DATE(c.created_at) AS day,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE c.status = 'escalated')::int AS escalated
           FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1
             AND cu.deleted_at IS NULL
             AND c.created_at >= NOW() - make_interval(days => ${Number(days)})
           GROUP BY DATE(c.created_at)
           ORDER BY day`,
          [tid]
        ),
        // Top 5 customers by message count in period (excluding anonymous)
        db.query(
          `SELECT
             cu.id,
             COALESCE(
               cu.soul_file->>'customer_name',
               NULLIF(TRIM(cu.first_name || ' ' || cu.last_name), ''),
               cu.email
             ) AS name,
             COUNT(m.id)::int AS message_count,
             COUNT(DISTINCT c.id)::int AS conversation_count
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1
             AND cu.deleted_at IS NULL
             AND ${anonEmailNotLikeGuard('cu.email')}
             AND m.created_at >= NOW() - make_interval(days => ${Number(days)})
           GROUP BY cu.id, name
           ORDER BY message_count DESC
           LIMIT 5`,
          [tid]
        ),
        // Period conversation summary (includes avg advisor score)
        db.query(
          `SELECT
             COUNT(*)::int AS total_conversations,
             COUNT(*) FILTER (WHERE c.status = 'escalated')::int AS escalated,
             COUNT(*) FILTER (WHERE c.status = 'ended')::int AS resolved,
             ROUND(AVG(c.conversation_score) FILTER (WHERE c.conversation_score IS NOT NULL), 1)::float AS avg_score,
             COUNT(*) FILTER (WHERE c.conversation_score IS NOT NULL)::int AS scored_count
           FROM conversations c
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1
             AND cu.deleted_at IS NULL
             AND c.created_at >= NOW() - make_interval(days => ${Number(days)})`,
          [tid]
        ),
        // Period message total
        db.query(
          `SELECT COUNT(*)::int AS total_messages
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           JOIN customers cu ON c.customer_id = cu.id
           WHERE cu.tenant_id = $1
             AND cu.deleted_at IS NULL
             AND m.created_at >= NOW() - make_interval(days => ${Number(days)})`,
          [tid]
        ),
      ]);

    const conv = periodConvs.rows[0] || {};
    res.json({
      period_days:          days,
      daily_messages:       dailyMessages.rows,
      daily_conversations:  dailyConversations.rows,
      top_customers:        topCustomers.rows,
      summary: {
        total_conversations: conv.total_conversations || 0,
        escalated:           conv.escalated || 0,
        resolved:            conv.resolved || 0,
        total_messages:      periodMsgs.rows[0]?.total_messages || 0,
        avg_score:           conv.avg_score ?? null,
        scored_count:        conv.scored_count || 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/portal/conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const page   = parsePage(req.query.page);
    const limit  = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;           // active | ended | escalated
    const mode   = req.query.mode   || null;           // human | ai
    const unread = req.query.unread === 'true' ? true : null;  // true = unread only
    const search = req.query.search ? req.query.search.trim() : null; // name / email substring

    // Build parameterised WHERE conditions
    const params  = [req.portal.tenant_id];
    const clauses = [
      `cu.tenant_id = $1`,
      `cu.deleted_at IS NULL`,
    ];

    if (status) { params.push(status); clauses.push(`c.status = $${params.length}`); }
    if (mode === 'human') { clauses.push(`c.mode = 'human'`); }
    if (mode === 'ai')    { clauses.push(`(c.mode IS NULL OR c.mode = 'ai')`); }
    if (unread)  { clauses.push(`c.unread = TRUE`); }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      clauses.push(`(
        LOWER(cu.first_name) LIKE $${params.length}
        OR LOWER(cu.last_name)  LIKE $${params.length}
        OR LOWER(cu.email)      LIKE $${params.length}
        OR LOWER(COALESCE(cu.soul_file->>'customer_name','')) LIKE $${params.length}
      )`);
    }

    const where = clauses.join(' AND ');

    // Main query
    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const { rows } = await db.query(
      `SELECT c.id, c.status, c.mode, c.unread, c.created_at,
              c.csat_score,
              CASE
                WHEN ${anonEmailLikeMatch('cu.email')} THEN 'Anonymous Visitor'
                ELSE COALESCE(cu.soul_file->>'customer_name', NULLIF(TRIM(cu.first_name || ' ' || cu.last_name), ''), cu.email)
              END AS customer_display_name,
              cu.email, cu.id AS customer_id,
              ${anonEmailLikeMatch('cu.email')} AS is_anonymous,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS message_count,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
              COALESCE(
                (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
                 FROM conversation_labels cl JOIN labels l ON cl.label_id = l.id
                 WHERE cl.conversation_id = c.id),
                '[]'::json
              ) AS labels
       FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE ${where}
       ORDER BY COALESCE(
         (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
         c.created_at
       ) DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    // Count query (same WHERE, no LIMIT/OFFSET)
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE ${where}`,
      countParams
    );

    res.json({ conversations: rows, total: parseInt(countRows[0].count), page, limit });
  } catch (err) { next(err); }
});

// POST /api/portal/conversations/:id/score  — advisor rates AI performance 1–5
router.post('/conversations/:id/score', async (req, res, next) => {
  try {
    const score = parseInt(req.body.score, 10);
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ error: 'score must be an integer between 1 and 5' });
    }
    const { rowCount } = await db.query(
      `UPDATE conversations c
       SET conversation_score = $1
       FROM customers cu
       WHERE c.id = $2
         AND c.customer_id = cu.id
         AND cu.tenant_id = $3`,
      [score, req.params.id, req.portal.tenant_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ conversation_score: score });
  } catch (err) { next(err); }
});

// GET /api/portal/conversations/:id  — full thread + mark as read
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const { rows: convRows } = await db.query(
      `SELECT c.id, c.status, c.mode, c.human_agent_id, c.created_at, c.unread,
              c.csat_score, c.csat_comment, c.csat_submitted_at, c.conversation_score,
              cu.id AS customer_id, cu.first_name, cu.last_name, cu.email,
              COALESCE(
                (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
                 FROM conversation_labels cl JOIN labels l ON cl.label_id = l.id
                 WHERE cl.conversation_id = c.id),
                '[]'::json
              ) AS labels
       FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    // Mark as read when portal agent opens it
    await db.query(
      'UPDATE conversations SET unread = FALSE WHERE id = $1',
      [req.params.id]
    );

    const { rows: messages } = await db.query(
      'SELECT id, role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ conversation: { ...convRows[0], unread: false }, messages });
  } catch (err) { next(err); }
});


// GET /api/portal/conversations/:id/transcript — download full conversation as plain text
router.get('/conversations/:id/transcript', async (req, res, next) => {
  try {
    const { rows: convRows } = await db.query(
      `SELECT c.id, c.status, c.created_at,
              cu.first_name, cu.last_name, cu.email,
              t.name AS tenant_name, t.agent_name
       FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       JOIN tenants   t  ON cu.tenant_id  = t.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const conv = convRows[0];
    const { rows: messages } = await db.query(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    const customerName = `${conv.first_name || ''} ${conv.last_name || ''}`.trim() || conv.email || 'Customer';
    const agentName    = conv.agent_name || 'Agent';
    const date         = new Date(conv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Build plain-text transcript
    const lines = [
      `CONVERSATION TRANSCRIPT`,
      `═══════════════════════════════════════`,
      `Tenant:   ${conv.tenant_name}`,
      `Customer: ${customerName} <${conv.email}>`,
      `Date:     ${date}`,
      `Status:   ${conv.status}`,
      `ID:       ${conv.id}`,
      `═══════════════════════════════════════`,
      '',
      ...messages.map(m => {
        const speaker  = m.role === 'customer' ? customerName : agentName;
        const time     = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `[${time}] ${speaker}:\n${m.content}\n`;
      }),
      `═══════════════════════════════════════`,
      `Exported: ${new Date().toISOString()}`,
    ];

    const transcript = lines.join('\n');
    const safeName   = customerName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const dateStr    = new Date(conv.created_at).toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transcript_${safeName}_${dateStr}.txt"`);
    res.send(transcript);
  } catch (err) { next(err); }
});


// POST /api/portal/conversations/:id/takeover  — human agent takes over
router.post('/conversations/:id/takeover', async (req, res, next) => {
  try {
    const { id }        = req.params;
    const { tenant_id, admin_id } = req.portal;

    // Verify conversation belongs to this tenant
    const { rows } = await db.query(
      `SELECT c.id FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [id, tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    await db.query(
      `UPDATE conversations SET mode = 'human', human_agent_id = $1 WHERE id = $2`,
      [admin_id, id]
    );

    // Post a system notice into the message thread so the customer sees the handover
    await db.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'agent', '👋 You are now connected with a human support agent. How can I help you?')`,
      [id]
    );

    // Slack/Teams + webhooks notification
    try {
      const { rows: ctx } = await db.query(
        `SELECT cu.first_name, cu.last_name, cu.email, ta.first_name AS agent_first, ta.last_name AS agent_last
         FROM conversations c
         JOIN customers cu ON c.customer_id = cu.id
         LEFT JOIN tenant_admins ta ON ta.id = $1
         WHERE c.id = $2 LIMIT 1`,
        [admin_id, id]
      );
      if (ctx.length > 0) {
        const cName = [ctx[0].first_name, ctx[0].last_name].filter(Boolean).join(' ') || ctx[0].email || '';
        const aName = [ctx[0].agent_first, ctx[0].agent_last].filter(Boolean).join(' ') || 'Advisor';
        fireNotifications(tenant_id, 'human.takeover', {
          conversation_id: id, customer_name: cName, customer_email: ctx[0].email, agent_name: aName,
        });
      }
    } catch (_) {}

    res.json({ ok: true, mode: 'human' });
  } catch (err) { next(err); }
});


// POST /api/portal/conversations/:id/handback  — return control to AI agent
// Body: { note?: string }  — optional context note for the AI's next turn (single-use)
router.post('/conversations/:id/handback', async (req, res, next) => {
  try {
    const { id }        = req.params;
    const { tenant_id } = req.portal;
    const { note }      = req.body || {};

    const { rows } = await db.query(
      `SELECT c.id FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [id, tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    // Store advisor note (if provided) — consumed on next AI turn, then cleared
    const cleanNote = note && note.trim() ? note.trim().slice(0, 1000) : null;

    await db.query(
      `UPDATE conversations
       SET mode = 'ai', human_agent_id = NULL, handback_note = $1
       WHERE id = $2`,
      [cleanNote, id]
    );

    // Post a system notice so the customer knows the AI is back
    await db.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'agent', '🤖 You are now back with your AI assistant. Is there anything else I can help you with?')`,
      [id]
    );

    // Slack/Teams notification
    try {
      const { rows: ctx } = await db.query(
        `SELECT cu.first_name, cu.last_name, cu.email
         FROM conversations c JOIN customers cu ON c.customer_id = cu.id
         WHERE c.id = $1 LIMIT 1`, [id]
      );
      if (ctx.length > 0) {
        const cName = [ctx[0].first_name, ctx[0].last_name].filter(Boolean).join(' ') || ctx[0].email || '';
        fireNotifications(tenant_id, 'human.handback', {
          conversation_id: id, customer_name: cName, customer_email: ctx[0].email,
        });
      }
    } catch (_) {}

    res.json({ ok: true, mode: 'ai' });
  } catch (err) { next(err); }
});


// POST /api/portal/conversations/:id/reply  — human agent sends a message
router.post('/conversations/:id/reply', async (req, res, next) => {
  try {
    const { id }       = req.params;
    const { content }  = req.body;
    const { tenant_id } = req.portal;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const { rows } = await db.query(
      `SELECT c.id, c.customer_id, c.mode FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [id, tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    // Only allow replies when the conversation is in human mode
    if (rows[0].mode !== 'human') {
      return res.status(409).json({ error: 'Conversation is not in human mode. Take over first.' });
    }

    const { rows: msgRows } = await db.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'agent', $2)
       RETURNING id, role, content, created_at`,
      [id, content.trim()]
    );

    // Update customer last interaction + mark conversation unread so widget poll picks it up
    await Promise.all([
      db.query('UPDATE customers SET last_interaction_at = NOW() WHERE id = $1', [rows[0].customer_id]),
      db.query('UPDATE conversations SET unread = TRUE WHERE id = $1', [id]),
    ]);

    res.json({ ok: true, message: msgRows[0] });
  } catch (err) { next(err); }
});

// LABELS — extracted to ./portal/labels-routes.js
// CRUD for conversation labels. The POST/DELETE conversation-label
// attach/detach routes stay here because they use `/conversations/*`
// as their path prefix.
router.use('/labels', require('./portal/labels-routes'));

// POST /api/portal/conversations/:id/labels/:labelId  — assign label to conversation
router.post('/conversations/:id/labels/:labelId', async (req, res, next) => {
  try {
    // Verify the conversation belongs to this tenant
    const { rows: convCheck } = await db.query(
      `SELECT c.id FROM conversations c JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (convCheck.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    // Verify the label belongs to this tenant
    const { rows: labelCheck } = await db.query(
      `SELECT id FROM labels WHERE id = $1 AND tenant_id = $2`,
      [req.params.labelId, req.portal.tenant_id]
    );
    if (labelCheck.length === 0) return res.status(404).json({ error: 'Label not found' });

    await db.query(
      `INSERT INTO conversation_labels (conversation_id, label_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.params.id, req.params.labelId]
    );

    // Return updated label list for the conversation
    const { rows: labels } = await db.query(
      `SELECT l.id, l.name, l.color FROM conversation_labels cl
       JOIN labels l ON cl.label_id = l.id
       WHERE cl.conversation_id = $1 ORDER BY l.name`,
      [req.params.id]
    );
    res.json({ labels });
  } catch (err) { next(err); }
});

// DELETE /api/portal/conversations/:id/labels/:labelId  — remove label from conversation
router.delete('/conversations/:id/labels/:labelId', async (req, res, next) => {
  try {
    const { rows: convCheck } = await db.query(
      `SELECT c.id FROM conversations c JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = $1 AND cu.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (convCheck.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    await db.query(
      `DELETE FROM conversation_labels WHERE conversation_id = $1 AND label_id = $2`,
      [req.params.id, req.params.labelId]
    );

    const { rows: labels } = await db.query(
      `SELECT l.id, l.name, l.color FROM conversation_labels cl
       JOIN labels l ON cl.label_id = l.id
       WHERE cl.conversation_id = $1 ORDER BY l.name`,
      [req.params.id]
    );
    res.json({ labels });
  } catch (err) { next(err); }
});

// ── Bulk conversation operations ───────────────────────────────────────────────

// POST /api/portal/conversations/bulk
// Body: { ids: string[], action: 'resolve' | 'assign' | 'label' | 'unlabel',
//         agent_id?: string, label_id?: string }
router.post('/conversations/bulk', async (req, res, next) => {
  try {
    const { ids, action, agent_id, label_id } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (ids.length > 100) return res.status(400).json({ error: 'Maximum 100 conversations per bulk operation' });

    // Verify all conversations belong to this tenant
    const { rows: owned } = await db.query(
      `SELECT c.id FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE c.id = ANY($1::uuid[]) AND cu.tenant_id = $2`,
      [ids, req.portal.tenant_id]
    );
    const ownedIds = owned.map(r => r.id);
    if (ownedIds.length === 0) return res.status(404).json({ error: 'No matching conversations found' });

    let affected = 0;

    if (action === 'resolve') {
      const { rowCount } = await db.query(
        `UPDATE conversations SET status = 'ended', unread = FALSE
         WHERE id = ANY($1::uuid[])`,
        [ownedIds]
      );
      affected = rowCount;

    } else if (action === 'assign') {
      if (!agent_id) return res.status(400).json({ error: 'agent_id is required for assign' });
      // Verify the agent belongs to this tenant
      const { rows: agentCheck } = await db.query(
        `SELECT id FROM tenant_admins WHERE id = $1 AND tenant_id = $2`,
        [agent_id, req.portal.tenant_id]
      );
      if (agentCheck.length === 0) return res.status(404).json({ error: 'Agent not found' });
      // Store as human_agent_id but keep mode as-is (assign ≠ takeover)
      const { rowCount } = await db.query(
        `UPDATE conversations SET human_agent_id = $1 WHERE id = ANY($2::uuid[])`,
        [agent_id, ownedIds]
      );
      affected = rowCount;

    } else if (action === 'label') {
      if (!label_id) return res.status(400).json({ error: 'label_id is required for label' });
      const { rows: labelCheck } = await db.query(
        `SELECT id FROM labels WHERE id = $1 AND tenant_id = $2`,
        [label_id, req.portal.tenant_id]
      );
      if (labelCheck.length === 0) return res.status(404).json({ error: 'Label not found' });
      // Batch upsert — ON CONFLICT DO NOTHING skips already-labelled rows
      const values = ownedIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = ownedIds.flatMap(id => [id, label_id]);
      await db.query(
        `INSERT INTO conversation_labels (conversation_id, label_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        params
      );
      affected = ownedIds.length;

    } else if (action === 'unlabel') {
      if (!label_id) return res.status(400).json({ error: 'label_id is required for unlabel' });
      const { rowCount } = await db.query(
        `DELETE FROM conversation_labels
         WHERE conversation_id = ANY($1::uuid[]) AND label_id = $2`,
        [ownedIds, label_id]
      );
      affected = rowCount;

    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.json({ ok: true, affected });
  } catch (err) { next(err); }
});

// CONCERNS + BADGE-COUNTS — extracted to ./portal/{concerns,badge-counts}-routes.js
// Inbox-side endpoints: list escalated conversations, mark resolved, and the
// unread-counters used by nav badges. req.portal set by parent.
router.use('/concerns',     require('./portal/concerns-routes'));
router.use('/badge-counts', require('./portal/badge-counts-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// ANONYMOUS VISITORS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/portal/visitors  — anonymous (unlogged) widget visitors
// These are sessions where the host page didn't supply a user email,
// so we auto-generated anon_<uuid>@visitor.shenmay as the identifier
// (legacy @visitor.nomii also recognised — see server/src/constants/anonDomains.js).
router.get('/visitors', async (req, res, next) => {
  try {
    const page   = parsePage(req.query.page);
    const limit  = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT
         cu.id,
         'Anonymous Visitor' AS display_name,
         cu.last_interaction_at,
         cu.created_at,
         CASE
           WHEN cu.last_interaction_at IS NOT NULL
           THEN ROUND(EXTRACT(EPOCH FROM (NOW() - cu.last_interaction_at)) / 60)
           ELSE NULL
         END AS idle_minutes,
         (SELECT COUNT(*) FROM conversations c WHERE c.customer_id = cu.id) AS conversation_count,
         (SELECT COUNT(*) FROM messages m
          JOIN conversations c ON m.conversation_id = c.id
          WHERE c.customer_id = cu.id) AS message_count
       FROM customers cu
       WHERE cu.tenant_id = $1
         AND cu.deleted_at IS NULL
         AND ${anonEmailLikeMatch('cu.email')}
       ORDER BY cu.last_interaction_at DESC NULLS LAST, cu.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.portal.tenant_id, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM customers
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND ${anonEmailLikeMatch()}`,
      [req.portal.tenant_id]
    );

    res.json({
      visitors: rows,
      total:    parseInt(countRows[0].count),
      page,
      limit,
    });
  } catch (err) { next(err); }
});


// ═══════════════════════════════════════════════════════════════════════════
// SELF-HOSTED LICENSE MANAGEMENT — extracted to ./portal/license-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/license', require('./portal/license-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION & BILLING
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/portal/subscription  — current plan details + usage
router.get('/subscription', async (req, res, next) => {
  try {
    const sub = await getSubscription(req.portal.tenant_id);
    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    // Count current customers for limit display
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM customers
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND ${anonEmailNotLikeGuard()}`,
      [req.portal.tenant_id]
    );

    const customersCount = parseInt(rows[0].count);
    const messagesUsed   = sub.messages_used_this_month || 0;
    const isUnrestricted = UNRESTRICTED_PLANS.includes(sub.plan);

    // Percentage helpers (null when plan has no cap)
    const customerPct = (!isUnrestricted && sub.max_customers)
      ? Math.min(100, Math.round((customersCount / sub.max_customers) * 100))
      : null;
    const messagePct = (!isUnrestricted && sub.max_messages_month)
      ? Math.min(100, Math.round((messagesUsed / sub.max_messages_month) * 100))
      : null;

    res.json({
      subscription: {
        plan:                    sub.plan,
        status:                  sub.status,
        max_customers:           sub.max_customers,
        max_messages_month:      sub.max_messages_month,
        messages_used_this_month: messagesUsed,
        managed_ai_enabled:      sub.managed_ai_enabled,
        trial_starts_at:         sub.trial_starts_at,
        trial_ends_at:           sub.trial_ends_at,
        current_period_start:    sub.current_period_start,
        current_period_end:      sub.current_period_end,
        canceled_at:             sub.canceled_at,
        stripe_customer_id:      sub.stripe_customer_id || null,
      },
      usage: {
        customers_count:       customersCount,
        customers_limit:       sub.max_customers,
        customers_pct:         customerPct,
        near_customer_limit:   customerPct !== null && customerPct >= 80,
        customer_limit_reached: customerPct !== null && customerPct >= 100,
        messages_used:         messagesUsed,
        messages_limit:        sub.max_messages_month,
        messages_pct:          messagePct,
        near_message_limit:    messagePct !== null && messagePct >= 80,
        message_limit_reached: messagePct !== null && messagePct >= 100,
      },
    });
  } catch (err) { next(err); }
});


// ═══════════════════════════════════════════════════════════════════════════
// TEAM / AGENT MANAGEMENT — extracted to ./portal/team-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/team', require('./portal/team-routes'));

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT — extracted to ./portal/api-key-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/api-key', require('./portal/api-key-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// STRIPE BILLING
// ═══════════════════════════════════════════════════════════════════════════

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_MAP  = {
  starter:      process.env.STRIPE_PRICE_STARTER      || null,
  growth:       process.env.STRIPE_PRICE_GROWTH        || null,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL  || null,
};
const STRIPE_PORTAL_RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL || `${(process.env.APP_URL || 'https://pontensolutions.com').replace(/\/$/, '')}/dashboard`;

// Helper: get Stripe instance (lazy init)
let _stripe = null;
function getStripe() {
  if (!STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = require('stripe')(STRIPE_SECRET_KEY);
  return _stripe;
}

// POST /api/portal/billing/checkout  — create Stripe checkout session
router.post('/billing/checkout', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body;

    if (!plan || !STRIPE_PRICE_MAP[plan]) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or professional' });
    }

    const sub = await getSubscription(req.portal.tenant_id);

    // Create or retrieve Stripe customer
    let stripeCustomerId = sub?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: req.portal.email,
        metadata: { tenant_id: req.portal.tenant_id },
      });
      stripeCustomerId = customer.id;
      await db.query(
        'UPDATE subscriptions SET stripe_customer_id = $1 WHERE tenant_id = $2',
        [stripeCustomerId, req.portal.tenant_id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_MAP[plan], quantity: 1 }],
      success_url: STRIPE_PORTAL_RETURN_URL + '?billing=success',
      cancel_url:  STRIPE_PORTAL_RETURN_URL + '?billing=canceled',
      metadata: { tenant_id: req.portal.tenant_id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.message === 'Stripe is not configured') {
      return res.status(503).json({ error: 'Billing is not yet configured. Please contact support.' });
    }
    next(err);
  }
});

// POST /api/portal/billing/portal  — redirect to Stripe customer portal
router.post('/billing/portal', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const sub = await getSubscription(req.portal.tenant_id);
    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account. Start a subscription first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: STRIPE_PORTAL_RETURN_URL,
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.message === 'Stripe is not configured') {
      return res.status(503).json({ error: 'Billing is not yet configured.' });
    }
    next(err);
  }
});


// GET /api/portal/plans  — available plans for the upgrade page
router.get('/plans', async (req, res) => {
  res.json({
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        price: '$49/mo',
        max_customers: 50,
        max_messages: 1000,
        managed_ai: false,
        features: [
          'Up to 50 customers',
          '1,000 messages/month',
          'Bring your own API key',
          'Full dashboard access',
          'Email support',
        ],
      },
      {
        id: 'growth',
        name: 'Growth',
        price: '$149/mo',
        max_customers: 250,
        max_messages: 5000,
        managed_ai: false,
        popular: true,
        features: [
          'Up to 250 customers',
          '5,000 messages/month',
          'Bring your own API key',
          'Priority support',
          'Advanced analytics',
          'Custom branding',
        ],
      },
      {
        id: 'professional',
        name: 'Professional',
        price: '$399/mo',
        max_customers: 1000,
        max_messages: 25000,
        managed_ai: false,
        features: [
          'Up to 1,000 customers',
          '25,000 messages/month',
          'Bring your own API key',
          'Dedicated support',
          'API access',
          'White-label options',
          'Custom integrations',
        ],
      },
    ],
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PLAN OVERRIDE (for testing without billing)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/portal/admin/set-plan
// Body: { plan, max_customers?, max_messages_month?, managed_ai_enabled? }
//
// Only accessible by the master account email (MASTER_EMAIL env var).
// Lets developers switch their own tenant's plan without going through Stripe.
//
router.post('/admin/set-plan', async (req, res, next) => {
  try {
    const MASTER_EMAIL = process.env.MASTER_EMAIL || '';
    if (!MASTER_EMAIL || req.portal.email !== MASTER_EMAIL) {
      return res.status(403).json({ error: 'Forbidden: master account only' });
    }

    const { plan, max_customers, max_messages_month, managed_ai_enabled } = req.body;

    if (!plan || !VALID_ADMIN_PLANS.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${VALID_ADMIN_PLANS.join(', ')}` });
    }

    // Plan defaults (can be overridden by body params)
    const planDefaults = {
      free:         { max_customers: 1,     max_messages_month: 20,    managed_ai_enabled: false },
      trial:        { max_customers: 1,     max_messages_month: 20,    managed_ai_enabled: false },
      starter:      { max_customers: 50,    max_messages_month: 1000,  managed_ai_enabled: false },
      growth:       { max_customers: 250,   max_messages_month: 5000,  managed_ai_enabled: false },
      professional: { max_customers: 1000,  max_messages_month: 25000, managed_ai_enabled: false },
      enterprise:   { max_customers: null,  max_messages_month: null,  managed_ai_enabled: true  },
      master:       { max_customers: null,  max_messages_month: null,  managed_ai_enabled: true  },
    };

    const defaults = planDefaults[plan];
    const finalMaxCustomers = max_customers !== undefined ? max_customers : defaults.max_customers;
    const finalMaxMessages  = max_messages_month !== undefined ? max_messages_month : defaults.max_messages_month;
    const finalManagedAI    = managed_ai_enabled !== undefined ? managed_ai_enabled : defaults.managed_ai_enabled;

    await db.query(
      `UPDATE subscriptions SET
         plan                = $1,
         status              = 'active',
         max_customers       = $2,
         max_messages_month  = $3,
         managed_ai_enabled  = $4,
         updated_at          = NOW()
       WHERE tenant_id = $5`,
      [plan, finalMaxCustomers, finalMaxMessages, finalManagedAI, req.portal.tenant_id]
    );

    console.log(`[Admin] Plan override: tenant ${req.portal.tenant_id} → ${plan} by ${req.portal.email}`);

    res.json({
      ok: true,
      plan,
      max_customers:      finalMaxCustomers,
      max_messages_month: finalMaxMessages,
      managed_ai_enabled: finalManagedAI,
    });
  } catch (err) { next(err); }
});


// CUSTOM TOOLS — extracted to ./portal/tools-routes.js
// Self-service tool builder (CRUD) + /:toolId/test sandbox. All routes scoped
// to req.portal.tenant_id; req.portal is populated by requirePortalAuth.
router.use('/tools', require('./portal/tools-routes'));


// --- Data API key management ---

// bcrypt — graceful fallback
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch {
  try { bcrypt = require('bcrypt'); } catch { bcrypt = null; }
}

function generateDataApiKey() {
  // Format: shenmay_da_<32 random hex chars>
  // "shenmay_da_" is 11 chars; prefix stored = first 19 chars (prefix + 8 chars).
  const randomPart = require('crypto').randomBytes(16).toString('hex');
  return `shenmay_da_${randomPart}`;
}

// GET /api/portal/settings/data-api-key
// Returns whether a key exists and its display prefix (never the full key)
router.get('/settings/data-api-key', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT data_api_key_prefix FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    const prefix = rows[0]?.data_api_key_prefix;
    res.json({
      has_key: !!prefix,
      prefix:  prefix ? `${prefix}...` : null,
    });
  } catch (err) { next(err); }
});

// POST /api/portal/settings/data-api-key
// Generate (or rotate) the data API key.
// Returns the full key ONCE — never stored in plain text, cannot be retrieved again.
router.post('/settings/data-api-key', async (req, res, next) => {
  try {
    if (!bcrypt) return res.status(500).json({ error: 'Auth module not available on server.' });

    const fullKey = generateDataApiKey();
    const prefix  = fullKey.slice(0, 17);
    const hash    = await bcrypt.hash(fullKey, 10);

    await db.query(
      `UPDATE tenants SET data_api_key_hash = $1, data_api_key_prefix = $2 WHERE id = $3`,
      [hash, prefix, req.portal.tenant_id]
    );

    res.json({
      key:     fullKey,
      prefix:  `${prefix}...`,
      warning: 'Save this key now — it will never be shown again.',
    });
  } catch (err) { next(err); }
});

// DELETE /api/portal/settings/data-api-key
// Revoke the current key — any integrations using it stop working immediately.
router.delete('/settings/data-api-key', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE tenants SET data_api_key_hash = NULL, data_api_key_prefix = NULL WHERE id = $1`,
      [req.portal.tenant_id]
    );
    res.json({ ok: true, message: 'Data API key revoked.' });
  } catch (err) { next(err); }
});


// ── Soul Management ────────────────────────────────────────────────────────────

// GET /api/portal/settings/agent-soul — return current soul template
router.get('/settings/agent-soul', requirePortalAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT agent_soul_template FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    const soul = rows[0]?.agent_soul_template || null;
    res.json({ soul });
  } catch (err) { next(err); }
});

// POST /api/portal/settings/generate-soul — (re)generate soul using Claude
router.post('/settings/generate-soul', requirePortalAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, agent_name, vertical, company_description, website_url
       FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant not found' });

    const tenant   = rows[0];
    const { generateAgentSoul } = require('../engine/soulGenerator');
    const soul = await generateAgentSoul(tenant, null);

    await db.query(
      `UPDATE tenants SET agent_soul_template = $1::jsonb WHERE id = $2`,
      [JSON.stringify(soul), req.portal.tenant_id]
    );

    res.json({ soul });
  } catch (err) { next(err); }
});


// ── Customer Data (portal) ─────────────────────────────────────────────────────

// GET /api/portal/customers/:id/data — list all data records grouped by category
router.get('/customers/:id/data', requirePortalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = req.query.category;

    // Verify customer belongs to this tenant
    const { rows: cRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, req.portal.tenant_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Customer not found' });

    const { rows } = await db.query(
      `SELECT id, category, label, value, secondary_value, value_type, metadata, recorded_at, source
       FROM customer_data
       WHERE customer_id = $1 ${category ? 'AND category = $2' : ''}
       ORDER BY category, label`,
      category ? [id, category] : [id]
    );

    // Group by category
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    res.json({ records: grouped, total: rows.length });
  } catch (err) { next(err); }
});

// POST /api/portal/customers/:id/data — add or update a single data record
// Body: { category: string, label: string, value?, secondary_value?, value_type?: string,
//         metadata?: object }
router.post('/customers/:id/data', requirePortalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, label, value, secondary_value, value_type, metadata } = req.body || {};

    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ error: 'label is required' });
    }
    if (value_type !== undefined && value_type !== null && typeof value_type !== 'string') {
      return res.status(400).json({ error: 'value_type must be a string' });
    }
    // metadata is stored as JSONB — reject anything that won't round-trip
    if (metadata !== undefined && metadata !== null &&
        (typeof metadata !== 'object' || Array.isArray(metadata))) {
      return res.status(400).json({ error: 'metadata must be an object' });
    }

    const { rows: cRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, req.portal.tenant_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Customer not found' });

    const { rows } = await db.query(
      `INSERT INTO customer_data
         (customer_id, category, label, value, secondary_value, value_type, metadata, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'portal')
       ON CONFLICT (customer_id, category, label)
       DO UPDATE SET
         value           = EXCLUDED.value,
         secondary_value = EXCLUDED.secondary_value,
         value_type      = COALESCE(EXCLUDED.value_type, customer_data.value_type),
         metadata        = COALESCE(EXCLUDED.metadata, customer_data.metadata),
         recorded_at     = NOW()
       RETURNING id, category, label, value, secondary_value, value_type, recorded_at, source`,
      [
        id, category, label,
        value != null ? String(value) : null,
        secondary_value != null ? String(secondary_value) : null,
        value_type || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    res.status(201).json({ record: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/portal/customers/:id/data/:category — clear all records for a category
router.delete('/customers/:id/data/:category', requirePortalAuth, async (req, res, next) => {
  try {
    const { id, category } = req.params;

    const { rows: cRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, req.portal.tenant_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Customer not found' });

    const { rowCount } = await db.query(
      `DELETE FROM customer_data
       WHERE customer_id = $1 AND category = $2
         AND customer_id IN (SELECT id FROM customers WHERE tenant_id = $3 AND deleted_at IS NULL)`,
      [id, category, req.portal.tenant_id]
    );

    res.json({ success: true, deleted: rowCount, category });
  } catch (err) { next(err); }
});

// DELETE /api/portal/customers/:id/data/:category/:label — delete a single record
router.delete('/customers/:id/data/:category/:label', requirePortalAuth, async (req, res, next) => {
  try {
    const { id, category, label } = req.params;

    const { rows: cRows } = await db.query(
      `SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, req.portal.tenant_id]
    );
    if (!cRows.length) return res.status(404).json({ error: 'Customer not found' });

    const { rowCount } = await db.query(
      `DELETE FROM customer_data
       WHERE customer_id = $1 AND category = $2 AND label = $3
         AND customer_id IN (SELECT id FROM customers WHERE tenant_id = $4 AND deleted_at IS NULL)`,
      [id, category, label, req.portal.tenant_id]
    );

    res.json({ success: true, deleted: rowCount });
  } catch (err) { next(err); }
});


// POST /api/portal/conversations/:id/summarize
// Advisor-triggered force summarize: re-runs full memory + soul update for a conversation.
// Useful after a human takeover session, or when the advisor wants to ensure memory is current.
router.post('/conversations/:id/summarize', async (req, res, next) => {
  try {
    // Verify the conversation belongs to this tenant
    const { rows: convRows } = await db.query(
      `SELECT co.id, co.customer_id, c.memory_file, c.soul_file,
              t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated,
              s.managed_ai_enabled
       FROM conversations co
       JOIN customers c ON co.customer_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       JOIN subscriptions s ON s.tenant_id = t.id
       WHERE co.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.portal.tenant_id]
    );
    if (!convRows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];

    // Respond immediately — update happens in background
    res.json({ success: true, message: 'Memory update queued — will complete in background.' });

    // Fire-and-forget force summarize
    setImmediate(async () => {
      try {
        const { rows: msgRows } = await db.query(
          'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
          [req.params.id]
        );
        if (!msgRows.length) return;

        const apiKey = resolveApiKey(conv);
        const currentMemory = safeDecryptJson(conv.memory_file);
        const updatedMemory = JSON.parse(JSON.stringify(currentMemory || {}));

        // Force-generate a session summary regardless of message count or goodbye detection
        const summary = await generateSessionSummary({
          messages:      msgRows,
          currentMemory: updatedMemory,
          sessionType:   'regular',
          apiKey,
        });

        if (summary) {
          const sessionNum = (updatedMemory.conversation_history || []).length + 1;
          const finalMemory = applySessionSummary(updatedMemory, summary, sessionNum);

          // Persist the updated memory
          await db.query(
            'UPDATE customers SET memory_file = $1 WHERE id = $2',
            [JSON.stringify(encryptJson(finalMemory)), conv.customer_id]
          );

          // Also update conversation summary for the dashboard
          await db.query(
            `UPDATE conversations SET summary = $1, topics_covered = $2 WHERE id = $3`,
            [summary.summary, JSON.stringify(summary.topics || []), req.params.id]
          ).catch(() => {});

          console.log(`[Portal] Force summarize complete for conversation ${req.params.id}`);
        }
      } catch (err) {
        console.error('[Portal] Force summarize error:', err.message);
      }
    });
  } catch (err) { next(err); }
});


// ── Integrations — extracted to ./portal/{connectors,webhooks}-routes.js ──────
// Slack / Teams lightweight notifications lives in connectors-routes.js;
// the rich HMAC-signed tenant_webhooks flow lives in webhooks-routes.js.
router.use('/connectors', require('./portal/connectors-routes'));
router.use('/webhooks',   require('./portal/webhooks-routes'));




// NOTIFICATIONS — extracted to ./portal/notifications-routes.js
// Bell-icon notifications list + mark-read. req.portal set by parent.
router.use('/notifications', require('./portal/notifications-routes'));


module.exports = router;


