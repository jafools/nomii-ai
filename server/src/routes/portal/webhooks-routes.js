/**
 * SHENMAY AI — Tenant Portal: Tenant Webhooks (HMAC-signed events)
 *
 * Sub-router mounted by ../portal.js at `/api/portal/webhooks`.
 * All requests have already passed `requirePortalAuth` (set by the parent),
 * so `req.portal` is populated.
 *
 *   GET    /api/portal/webhooks         — list tenant webhooks
 *   POST   /api/portal/webhooks         — register a new webhook (returns raw secret once)
 *   PATCH  /api/portal/webhooks/:id     — update label / url / events / enabled
 *   DELETE /api/portal/webhooks/:id     — remove a webhook
 *   POST   /api/portal/webhooks/:id/test — fire a `test.ping` event
 *
 * These are the rich HMAC-signed event-driven webhooks (X-Shenmay-Signature).
 * The lighter Slack/Teams notification integrations live in
 * ./connectors-routes.js.
 */

const router = require('express').Router();
const db = require('../../db');
const { validateWebhookUrl } = require('../../utils/validateWebhookUrl');
const { generateSecret, fireWebhooks } = require('../../services/webhookService');

const VALID_WEBHOOK_EVENTS = [
  'session.started', 'session.ended', 'flag.created', 'concern.raised',
  'customer.created', 'human.takeover', 'human.handback', 'csat.received',
];

// GET /api/portal/webhooks — list all webhooks for this tenant
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, label, url, event_types, enabled,
              last_triggered_at, last_success_at, last_failure_at, consecutive_failures, created_at
       FROM tenant_webhooks
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [req.portal.tenant_id]
    );
    res.json({ webhooks: rows });
  } catch (err) { next(err); }
});

// POST /api/portal/webhooks — register a new webhook
router.post('/', async (req, res, next) => {
  try {
    const { label, url, event_types } = req.body;

    const urlErr = validateWebhookUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });

    const events = Array.isArray(event_types) && event_types.length > 0
      ? event_types.filter(e => VALID_WEBHOOK_EVENTS.includes(e))
      : ['flag.created', 'concern.raised'];

    if (events.length === 0) {
      return res.status(400).json({ error: `event_types must include at least one of: ${VALID_WEBHOOK_EVENTS.join(', ')}` });
    }

    // Enforce max 10 webhooks per tenant
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) FROM tenant_webhooks WHERE tenant_id = $1',
      [req.portal.tenant_id]
    );
    if (parseInt(countRows[0].count) >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 webhooks per tenant' });
    }

    const secret = generateSecret();

    const { rows } = await db.query(
      `INSERT INTO tenant_webhooks (tenant_id, label, url, secret_hash, event_types)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, label, url, event_types, enabled, created_at`,
      [req.portal.tenant_id, (label || 'Webhook').slice(0, 100), url.slice(0, 500), secret, events]
    );

    // Return the raw secret once — it cannot be retrieved again
    res.status(201).json({ webhook: rows[0], secret });
  } catch (err) { next(err); }
});

// PATCH /api/portal/webhooks/:id — update label, url, event_types, or enabled
router.patch('/:id', async (req, res, next) => {
  try {
    const { label, url, event_types, enabled } = req.body;
    const updates = [];
    const params  = [req.params.id, req.portal.tenant_id];

    if (label !== undefined) { updates.push(`label = $${params.push(label.slice(0, 100))}`); }
    if (url !== undefined) {
      const urlErr = validateWebhookUrl(url);
      if (urlErr) return res.status(400).json({ error: urlErr });
      updates.push(`url = $${params.push(url.slice(0, 500))}`);
    }
    if (event_types !== undefined) {
      const events = event_types.filter(e => VALID_WEBHOOK_EVENTS.includes(e));
      if (events.length === 0) return res.status(400).json({ error: 'No valid event_types provided' });
      updates.push(`event_types = $${params.push(events)}`);
    }
    if (enabled !== undefined) { updates.push(`enabled = $${params.push(!!enabled)}`); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push(`updated_at = NOW()`);

    const { rows } = await db.query(
      `UPDATE tenant_webhooks
       SET ${updates.join(', ')}
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, label, url, event_types, enabled, consecutive_failures, updated_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ webhook: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/portal/webhooks/:id — remove a webhook
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/portal/webhooks/:id/test — send a test ping to verify the endpoint is reachable
router.post('/:id/test', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, url, secret_hash FROM tenant_webhooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });

    fireWebhooks(req.portal.tenant_id, 'test.ping', { message: 'This is a test ping from Shenmay AI.' });

    res.json({ ok: true, message: 'Test ping queued — check your endpoint for the delivery.' });
  } catch (err) { next(err); }
});

module.exports = router;
