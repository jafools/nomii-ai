/**
 * NOMII AI — Self-Hosted License Service
 *
 * Validates the NOMII_LICENSE_KEY env var against the Nomii cloud API.
 * Only active in production when NOMII_LICENSE_KEY is set.
 *
 * Behaviour matrix:
 *   NODE_ENV != 'production'          → skip all checks (dev/test free pass)
 *   production + no key               → warn + exit(1)
 *   production + key, valid           → start normally; schedule 24h heartbeat
 *   production + key, invalid/expired → warn + exit(1)
 *   heartbeat fails (network error)   → log warning only, do NOT crash running instance
 */

const https  = require('https');
const http   = require('http');
const crypto = require('crypto');

// The URL of the validation endpoint on the Nomii cloud instance.
// Self-hosted operators hit this on startup and every 24 hours.
const VALIDATE_URL = process.env.NOMII_LICENSE_VALIDATE_URL
  || 'https://api.pontensolutions.com/api/license/validate';

const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Stable identifier for this server process (persists within one run).
// Operators can override via NOMII_INSTANCE_ID to get a consistent ID
// across restarts — useful for the admin panel to track instances.
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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('License validation request timed out')); });
    req.write(payload);
    req.end();
  });
}

// ── Core validation ────────────────────────────────────────────────────────────

/**
 * Calls the Nomii validation endpoint once.
 * Resolves with the response body on HTTP 200; rejects otherwise.
 */
async function callValidate(licenseKey) {
  const { status, body } = await post(VALIDATE_URL, {
    license_key: licenseKey,
    instance_id: INSTANCE_ID,
  });

  if (status === 200 && body.valid) {
    return body; // { valid, plan, expires_at }
  }

  const reason = (body && body.error) || `HTTP ${status}`;
  throw new Error(`License invalid: ${reason}`);
}

// ── Startup check ──────────────────────────────────────────────────────────────

/**
 * Must be called early in server startup (before app.listen).
 * In non-production environments this is a no-op.
 * In production, a missing or invalid key causes process.exit(1).
 */
async function checkLicenseOnStartup() {
  if (process.env.NODE_ENV !== 'production') {
    return; // development / test — no check
  }

  const licenseKey = process.env.NOMII_LICENSE_KEY;

  if (!licenseKey) {
    console.error('[License] NOMII_LICENSE_KEY is not set.');
    console.error('[License] Self-hosted deployments require a valid license key.');
    console.error('[License] Purchase one at https://pontensolutions.com/nomii/license');
    console.error('[License] Refusing to start.');
    process.exit(1);
  }

  console.log(`[License] Validating license key (instance ${INSTANCE_ID})…`);

  try {
    const result = await callValidate(licenseKey);
    const expiry = result.expires_at
      ? `expires ${new Date(result.expires_at).toDateString()}`
      : 'no expiry';
    console.log(`[License] ✓ Valid — plan: ${result.plan}, ${expiry}`);
    scheduleHeartbeat(licenseKey);
  } catch (err) {
    console.error(`[License] Validation failed: ${err.message}`);
    console.error('[License] Check your NOMII_LICENSE_KEY and ensure this server can reach the internet.');
    console.error('[License] Refusing to start.');
    process.exit(1);
  }
}

// ── Periodic heartbeat ─────────────────────────────────────────────────────────

/**
 * Schedules a 24-hour re-validation loop.
 * On failure: logs a warning but does NOT kill the running process.
 * (A transient network blip should not take down a live deployment.)
 */
function scheduleHeartbeat(licenseKey) {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);

  _heartbeatTimer = setInterval(async () => {
    try {
      const result = await callValidate(licenseKey);
      console.log(`[License] Heartbeat OK — plan: ${result.plan}`);
    } catch (err) {
      console.warn(`[License] Heartbeat failed: ${err.message}`);
      console.warn('[License] License could not be re-validated. The server will continue running.');
      console.warn('[License] If this persists, check your key and network connectivity.');
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Don't keep the process alive just for the heartbeat
  if (_heartbeatTimer.unref) _heartbeatTimer.unref();
}

module.exports = { checkLicenseOnStartup, INSTANCE_ID };
