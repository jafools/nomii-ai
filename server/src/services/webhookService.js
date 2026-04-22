/**
 * NOMII AI — Webhook Delivery Service
 *
 * Fires signed HTTPS POST requests to tenant-registered webhook URLs
 * when platform events occur.
 *
 * Supported events:
 *   session.started   — new widget session opened (authenticated users only)
 *   session.ended     — widget session closed / end-session called
 *   flag.created      — customer flagged a concern via the widget
 *   concern.raised    — advisor escalated a conversation to concerns
 *   customer.created  — new customer record auto-created
 *
 * Delivery model:
 *   - Fire-and-forget via setImmediate (never blocks the main response)
 *   - One automatic retry after 3 seconds on failure
 *   - HMAC-SHA256 payload signature, emitted in BOTH X-Nomii-Signature and
 *     X-Shenmay-Signature headers (dual-emit for the Phase 5 rebrand;
 *     X-Nomii-Signature sunset target 2026-10-20). Customer receivers
 *     can pin on either header — the value is byte-identical.
 *   - 10 second timeout per attempt
 *   - Consecutive failure counter tracked for monitoring
 *
 * Payload format:
 *   {
 *     event:      "flag.created",
 *     tenant_id:  "uuid",
 *     timestamp:  "2025-01-01T00:00:00.000Z",
 *     data:       { ... event-specific fields ... }
 *   }
 */

const crypto = require('crypto');
const db     = require('../db');

const DELIVERY_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS      = 3_000;

/**
 * Fire all enabled webhooks for the given tenant + event type.
 * Non-blocking — returns immediately, delivers in background.
 *
 * @param {string} tenantId   — UUID of the tenant
 * @param {string} eventType  — e.g. "flag.created"
 * @param {object} data       — event-specific payload fields
 */
function fireWebhooks(tenantId, eventType, data = {}) {
  setImmediate(() => _deliverAll(tenantId, eventType, data).catch(() => {}));
}

async function _deliverAll(tenantId, eventType, data) {
  const { rows: hooks } = await db.query(
    `SELECT id, url, secret_hash
     FROM tenant_webhooks
     WHERE tenant_id = $1
       AND enabled = TRUE
       AND $2 = ANY(event_types)`,
    [tenantId, eventType]
  );

  if (hooks.length === 0) return;

  const payload = JSON.stringify({
    event:     eventType,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    data,
  });

  await Promise.allSettled(hooks.map(hook => _deliver(hook, payload)));
}

async function _deliver(hook, payload, isRetry = false) {
  const signature = _sign(payload, hook.secret_hash);

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const res = await fetch(hook.url, {
      method:  'POST',
      headers: {
        'Content-Type':        'application/json',
        // Dual-emit during Phase 5 rebrand. X-Nomii-Signature removed in
        // Phase 8 (target 2026-10-20) once customers have migrated
        // their verification code to check X-Shenmay-Signature.
        'X-Nomii-Signature':   `sha256=${signature}`,
        'X-Shenmay-Signature': `sha256=${signature}`,
        'X-Shenmay-Event':     JSON.parse(payload).event,
        'User-Agent':          'Shenmay-Webhook/1.0',
      },
      body:   payload,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const success = res.ok;

    await db.query(
      `UPDATE tenant_webhooks
       SET last_triggered_at     = NOW(),
           last_success_at       = CASE WHEN $2 THEN NOW() ELSE last_success_at END,
           last_failure_at       = CASE WHEN $2 THEN last_failure_at ELSE NOW() END,
           consecutive_failures  = CASE WHEN $2 THEN 0 ELSE consecutive_failures + 1 END,
           updated_at            = NOW()
       WHERE id = $1`,
      [hook.id, success]
    );

    if (!success) {
      console.warn(`[Webhook] Delivery failed for hook ${hook.id} — HTTP ${res.status}`);
      if (!isRetry) await _scheduleRetry(hook, payload);
    }

  } catch (err) {
    await db.query(
      `UPDATE tenant_webhooks
       SET last_triggered_at    = NOW(),
           last_failure_at      = NOW(),
           consecutive_failures = consecutive_failures + 1,
           updated_at           = NOW()
       WHERE id = $1`,
      [hook.id]
    ).catch(() => {});

    console.warn(`[Webhook] Delivery error for hook ${hook.id}: ${err.message}`);
    if (!isRetry) await _scheduleRetry(hook, payload);
  }
}

function _scheduleRetry(hook, payload) {
  return new Promise(resolve => {
    setTimeout(() => {
      _deliver(hook, payload, true).catch(() => {}).finally(resolve);
    }, RETRY_DELAY_MS);
  });
}

/**
 * HMAC-SHA256 signature.
 * The secret_hash stored in the DB IS the raw secret (not hashed despite the column name —
 * kept as-is since the secret is only used server-side for signing, never verified externally).
 */
function _sign(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Generate a secure random webhook secret.
 * Returns the raw value — store it in secret_hash, show it once to the tenant.
 */
function generateSecret() {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
}

module.exports = { fireWebhooks, generateSecret };
