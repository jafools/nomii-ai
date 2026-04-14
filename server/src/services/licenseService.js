/**
 * NOMII AI — Self-Hosted License Service
 *
 * Behaviour matrix:
 *
 *   NODE_ENV != 'production'                → skip (dev free pass)
 *   NOMII_DEPLOYMENT != 'selfhosted'        → skip (SaaS VPS — not our concern)
 *   selfhosted + no NOMII_LICENSE_KEY       → trial mode (local limits, no cloud call)
 *   selfhosted + key present, valid         → apply plan limits; schedule 24h heartbeat
 *   selfhosted + key present, invalid       → log error + exit(1)
 *   heartbeat fails (transient network)     → warn only, do NOT crash running instance
 */

const https  = require('https');
const http   = require('http');
const crypto = require('crypto');
const { PLAN_LIMITS, isSelfHosted } = require('../config/plans');

const VALIDATE_URL = process.env.NOMII_LICENSE_VALIDATE_URL
  || 'https://api.pontensolutions.com/api/license/validate';

const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Stable identifier for this server process.
// Override with NOMII_INSTANCE_ID for consistency across restarts.
const INSTANCE_ID = process.env.NOMII_INSTANCE_ID
  || crypto.createHash('sha256')
       .update(
         (process.env.NOMII_LICENSE_KEY || '') +
         (process.env.APP_URL           || '') +
         process.pid.toString()
       )
       .digest('hex')
       .slice(0, 16);

let _heartbeatTimer = null;

// ── HTTP helper ────────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':     'nomii-selfhosted/1.0',
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('License validation timed out')); });
    req.write(payload);
    req.end();
  });
}

// ── Cloud validation call ─────────────────────────────────────────────────────

async function callValidate(licenseKey) {
  const { status, body } = await post(VALIDATE_URL, {
    license_key: licenseKey,
    instance_id: INSTANCE_ID,
  });

  if (status === 200 && body.valid) return body; // { valid, plan, expires_at }

  const reason = (body && body.error) || `HTTP ${status}`;
  throw new Error(`License invalid: ${reason}`);
}

// ── Apply plan limits to the local DB ─────────────────────────────────────────
// Upserts the subscription row for the single self-hosted tenant so the
// existing subscription middleware enforces the correct limits.

async function applyPlanLimits(plan) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
  try {
    const db = require('../db');
    // Self-hosted is always BYOK — the tenant's API key is stored encrypted
    // on the tenant row. The "managed AI" concept only applies to SaaS where
    // the platform provides the key. Forcing false here prevents growth+ plans
    // from breaking LLM calls on self-hosted (resolveApiKey would otherwise
    // try process.env.ANTHROPIC_API_KEY and fail).
    await db.query(
      `UPDATE subscriptions
       SET plan                  = $1,
           max_messages_month    = $2,
           max_customers         = $3,
           managed_ai_enabled    = false,
           max_agents            = $4,
           status                = 'active',
           updated_at            = NOW()
       WHERE tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)`,
      [plan, limits.max_messages_month, limits.max_customers, limits.max_agents]
    );
    console.log(`[License] Plan limits applied: ${plan} (${limits.max_messages_month} msg/mo, ${limits.max_customers} customers)`);
  } catch (err) {
    console.warn('[License] Could not upsert subscription limits:', err.message);
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

function scheduleHeartbeat(licenseKey) {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);

  _heartbeatTimer = setInterval(async () => {
    try {
      const result = await callValidate(licenseKey);
      console.log(`[License] Heartbeat OK — plan: ${result.plan}`);
      await applyPlanLimits(result.plan);
    } catch (err) {
      console.warn(`[License] Heartbeat failed: ${err.message}`);
      console.warn('[License] Server continues running. Check key and connectivity.');
    }
  }, HEARTBEAT_INTERVAL_MS);

  if (_heartbeatTimer.unref) _heartbeatTimer.unref();
}

// ── Startup check ─────────────────────────────────────────────────────────────

async function checkLicenseOnStartup() {
  // Not production → skip entirely
  if (process.env.NODE_ENV !== 'production') return;

  // SaaS VPS → skip (license enforcement is for self-hosted only)
  if (!isSelfHosted()) return;

  const licenseKey = process.env.NOMII_LICENSE_KEY;

  if (!licenseKey) {
    // ── Trial mode ───────────────────────────────────────────────────────────
    // No key required to start the trial. Limits are enforced via the
    // subscription row seeded by seedSelfHostedTenant (20 msg, 1 customer).
    console.log('[License] No license key — running in self-hosted trial mode.');
    console.log('[License]   Limits: 20 messages/mo, 1 customer.');
    const appUrl = (process.env.APP_URL || 'https://pontensolutions.com').replace(/\/$/, '');
    console.log(`[License]   Upgrade: ${appUrl}/nomii/license`);
    return;
  }

  // ── Paid mode ────────────────────────────────────────────────────────────
  console.log(`[License] Validating license key (instance ${INSTANCE_ID})…`);
  try {
    const result = await callValidate(licenseKey);
    const expiry = result.expires_at
      ? `expires ${new Date(result.expires_at).toDateString()}`
      : 'no expiry';
    console.log(`[License] ✓ Valid — plan: ${result.plan}, ${expiry}`);
    await applyPlanLimits(result.plan);
    scheduleHeartbeat(licenseKey);
  } catch (err) {
    console.error(`[License] Validation failed: ${err.message}`);
    console.error('[License] Check NOMII_LICENSE_KEY and internet connectivity.');
    console.error('[License] Refusing to start.');
    process.exit(1);
  }
}

module.exports = { checkLicenseOnStartup, INSTANCE_ID };
