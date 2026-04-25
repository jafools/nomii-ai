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
const { getSubscription } = require('../middleware/subscription');
const { UNRESTRICTED_PLANS } = require('../config/plans');
const { decrypt } = require('../services/apiKeyService');
const { resolveApiKey } = require('../services/llmService');
const { updateMemoryAfterSession, generateSessionSummary, applySessionSummary, applyFactsToMemory } = require('../engine/memoryUpdater');
const { writeAuditLog }              = require('../middleware/auditLog');
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
// CURRENT-USER + ADMIN ACCOUNT — extracted to sub-routers
//
// /me returns the dashboard's bootstrap payload (tenant + admin +
// subscription + deployment_mode). /admin/profile + /admin/password let
// the admin update their own account; /admin/set-plan is a master-only
// override mounted alongside (same /admin prefix).
// ═══════════════════════════════════════════════════════════════════════════
router.use('/me',    require('./portal/me-routes'));
router.use('/admin', require('./portal/admin-routes'));

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS / COMPANY / EMAIL TEMPLATES — extracted to sub-routers
//
// settings-routes.js owns the full /api/portal/settings/* surface (privacy
// + anon-only-mode + data-api-key CRUD + agent-soul + generate-soul). The
// company profile editor and email-template customization each got their
// own file — different prefix, different concern.
// ═══════════════════════════════════════════════════════════════════════════
router.use('/settings',        require('./portal/settings-routes'));
router.use('/company',         require('./portal/company-routes'));
router.use('/email-templates', require('./portal/email-templates-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS / SERVICES — extracted to ./portal/products-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/products', require('./portal/products-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS — extracted to ./portal/customers-routes.js
//
// All /api/portal/customers/* routes (CSV import, paginated list, detail with
// soul + memory, GDPR erasure + export, customer_data CRUD) live in the
// sub-router. /search stays inline below — it bridges customers AND
// conversations and doesn't share a single prefix.
// ═══════════════════════════════════════════════════════════════════════════
router.use('/customers', require('./portal/customers-routes'));


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
// SUBSCRIPTION SUMMARY — extracted to ./portal/subscription-routes.js
// Single GET that returns plan + usage + percentage display data.
// ═══════════════════════════════════════════════════════════════════════════
router.use('/subscription', require('./portal/subscription-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// TEAM / AGENT MANAGEMENT — extracted to ./portal/team-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/team', require('./portal/team-routes'));

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT — extracted to ./portal/api-key-routes.js
// ═══════════════════════════════════════════════════════════════════════════
router.use('/api-key', require('./portal/api-key-routes'));


// ═══════════════════════════════════════════════════════════════════════════
// STRIPE BILLING — extracted to ./portal/billing-routes.js
// POST /billing/checkout (start upgrade) + POST /billing/portal (manage existing).
// All STRIPE_* env-var reads + lazy stripe-client init live in the sub-router.
// ═══════════════════════════════════════════════════════════════════════════
router.use('/billing', require('./portal/billing-routes'));


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


// CUSTOM TOOLS — extracted to ./portal/tools-routes.js
// Self-service tool builder (CRUD) + /:toolId/test sandbox. All routes scoped
// to req.portal.tenant_id; req.portal is populated by requirePortalAuth.
router.use('/tools', require('./portal/tools-routes'));


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


