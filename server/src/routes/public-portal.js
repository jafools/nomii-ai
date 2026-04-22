/**
 * Public portal license lookup — called by pontensolutions.com license portal.
 *
 * POST /api/public/portal/licenses
 *   Body: { session_token }
 *   Verifies the token with the Lateris Worker, then returns Shenmay licenses
 *   for the authenticated email.
 *
 * Only active when NOMII_LICENSE_MASTER=true (the cloud instance holds the
 * licenses table).
 */

const express = require('express');
const https   = require('https');
const db      = require('../db');
const { envVar } = require('../utils/env');

const router = express.Router();

const WORKER_URL = 'https://laterisworker.ajaces.workers.dev/portal/licenses';

/**
 * GET request to the Cloudflare Worker to verify a portal session token
 * and extract the authenticated email.
 */
function verifyPortalSession(sessionToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(WORKER_URL);

    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'GET',
      headers:  { Authorization: `Bearer ${sessionToken}` },
      timeout:  10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Worker verification timed out')); });
    req.end();
  });
}

router.post('/licenses', async (req, res) => {
  // Gate: only the license master has the licenses table
  if (envVar('LICENSE_MASTER') !== 'true') {
    return res.status(404).json({ error: 'not_available' });
  }

  const { session_token } = req.body || {};
  if (!session_token || typeof session_token !== 'string') {
    return res.status(400).json({ error: 'missing_session_token' });
  }

  // Verify session with the Cloudflare Worker
  let workerResp;
  try {
    workerResp = await verifyPortalSession(session_token);
  } catch (err) {
    console.error('[Portal] Worker verification failed:', err.message);
    return res.status(502).json({ error: 'upstream_error' });
  }

  if (workerResp.status === 401 || workerResp.status === 403) {
    return res.status(401).json({ error: 'invalid_session' });
  }
  if (workerResp.status === 429) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  if (workerResp.status !== 200) {
    return res.status(502).json({ error: 'upstream_error' });
  }

  const email = workerResp.body?.email;
  if (!email) {
    return res.status(502).json({ error: 'upstream_error' });
  }

  // Query local licenses table
  try {
    const { rows } = await db.query(
      `SELECT id, license_key, plan, issued_to_email, issued_to_name,
              issued_at, expires_at, is_active, instance_id, last_ping_at
       FROM licenses
       WHERE issued_to_email = $1
       ORDER BY issued_at DESC`,
      [email.toLowerCase().trim()]
    );

    const licenses = rows.map((r) => ({
      license_id:  String(r.id),
      license_key: r.license_key,
      plan:        r.plan,
      status:      !r.is_active ? 'revoked' : (r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : 'active'),
      issued_at:   r.issued_at?.toISOString() ?? null,
      expires_at:  r.expires_at?.toISOString() ?? null,
      instance_id: r.instance_id ?? null,
      last_ping_at: r.last_ping_at?.toISOString() ?? null,
    }));

    return res.json({ email, product: 'nomii', licenses });
  } catch (err) {
    console.error('[Portal] DB query failed:', err.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
