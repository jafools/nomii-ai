// @ts-check
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const dbHelper = require('./helpers/db');
const { isOnprem, hasDbAccess } = require('./helpers/mode');

/**
 * Resend webhook handler — bounce / complaint → email_suppressions row.
 *
 * Exercises three things:
 *   1. Signed `email.bounced` (hard) webhook → row in email_suppressions
 *   2. Signed `email.complained` webhook → row in email_suppressions
 *   3. Tampered signature → 400 rejection, no DB row
 *
 * The CI env sets RESEND_WEBHOOK_SECRET so the handler runs the real
 * Svix verifier — no dev-mode bypass in play here.
 *
 * Skipped in onprem mode (this is SaaS-only infra) and in no-DB modes.
 */

const DISAMBIGUATOR = `e2e${Date.now().toString(36)}`;

function apiBase() {
  return `http://localhost:${process.env.PORT || 3001}`;
}

/**
 * Svix-style signature: HMAC-SHA256 over `${id}.${ts}.${payload}` keyed
 * by the base64 portion of `whsec_...`. Return value is `v1,<b64>` — the
 * handler supports multiple space-separated signatures but we only ever
 * send one here.
 */
function svixSign(id, ts, body, secret) {
  const secretB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(secretB64, 'base64');
  const mac = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${mac}`;
}

test.describe('Resend webhook — bounce/complaint suppression', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    test.skip(isOnprem(), 'Resend webhook is a SaaS infra concern; self-hosted deploys their own.');
    test.skip(!hasDbAccess(), 'Resend webhook spec needs direct DB access to assert the suppression row.');
    test.skip(!process.env.RESEND_WEBHOOK_SECRET, 'RESEND_WEBHOOK_SECRET not set — handler is in dev-mode bypass, skip signed-verification specs.');
  });

  test.afterAll(async () => {
    if (!hasDbAccess()) return;
    try {
      await dbHelper.query(
        `DELETE FROM email_suppressions WHERE email LIKE $1`,
        [`%${DISAMBIGUATOR}%`],
      );
    } catch (err) {
      console.warn('[resend-webhook] cleanup failed:', err.message);
    }
  });

  test('signed email.bounced (hard) inserts a suppression row', async ({ request }) => {
    const email = `bounce-${DISAMBIGUATOR}@shenmay.test`;
    const payload = {
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id:  `msg_${DISAMBIGUATOR}_bounce`,
        to:        [email],
        from:      'hello@pontensolutions.com',
        subject:   'Welcome to Shenmay AI',
        bounce:    { type: 'hard', reason: 'address does not exist' },
      },
    };
    const body = JSON.stringify(payload);
    const id   = `msg_${DISAMBIGUATOR}_bounce`;
    const ts   = String(Math.floor(Date.now() / 1000));
    const sig  = svixSign(id, ts, body, process.env.RESEND_WEBHOOK_SECRET);

    const res = await request.post(`${apiBase()}/api/webhooks/resend`, {
      headers: {
        'content-type':    'application/json',
        'svix-id':         id,
        'svix-timestamp':  ts,
        'svix-signature':  sig,
      },
      data: body,
    });
    expect(res.status()).toBe(200);

    const rows = await dbHelper.query(
      `SELECT email, reason, bounce_type FROM email_suppressions
        WHERE email = LOWER($1)`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].reason).toBe('bounce');
    expect(rows[0].bounce_type).toBe('hard');
  });

  test('signed email.complained inserts a suppression row', async ({ request }) => {
    const email = `complaint-${DISAMBIGUATOR}@shenmay.test`;
    const payload = {
      type: 'email.complained',
      created_at: new Date().toISOString(),
      data: {
        email_id:  `msg_${DISAMBIGUATOR}_complaint`,
        to:        [email],
        from:      'hello@pontensolutions.com',
        subject:   'Your Shenmay AI License Key',
      },
    };
    const body = JSON.stringify(payload);
    const id   = `msg_${DISAMBIGUATOR}_complaint`;
    const ts   = String(Math.floor(Date.now() / 1000));
    const sig  = svixSign(id, ts, body, process.env.RESEND_WEBHOOK_SECRET);

    const res = await request.post(`${apiBase()}/api/webhooks/resend`, {
      headers: {
        'content-type':    'application/json',
        'svix-id':         id,
        'svix-timestamp':  ts,
        'svix-signature':  sig,
      },
      data: body,
    });
    expect(res.status()).toBe(200);

    const rows = await dbHelper.query(
      `SELECT email, reason FROM email_suppressions
        WHERE email = LOWER($1)`,
      [email],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].reason).toBe('complaint');
  });

  test('tampered signature returns 400 and writes no row', async ({ request }) => {
    const email = `tamper-${DISAMBIGUATOR}@shenmay.test`;
    const payload = {
      type: 'email.bounced',
      data: { to: [email], bounce: { type: 'hard' } },
    };
    const body = JSON.stringify(payload);
    const id   = `msg_${DISAMBIGUATOR}_tamper`;
    const ts   = String(Math.floor(Date.now() / 1000));
    // Sign with the wrong secret
    const sig  = svixSign(id, ts, body, 'whsec_' + Buffer.from('wrong-secret-value-garbage').toString('base64'));

    const res = await request.post(`${apiBase()}/api/webhooks/resend`, {
      headers: {
        'content-type':    'application/json',
        'svix-id':         id,
        'svix-timestamp':  ts,
        'svix-signature':  sig,
      },
      data: body,
    });
    expect(res.status()).toBe(400);

    const rows = await dbHelper.query(
      `SELECT email FROM email_suppressions WHERE email = LOWER($1)`,
      [email],
    );
    expect(rows.length).toBe(0);
  });

  test('soft bounce does NOT insert a suppression row', async ({ request }) => {
    const email = `soft-${DISAMBIGUATOR}@shenmay.test`;
    const payload = {
      type: 'email.bounced',
      data: {
        email_id: `msg_${DISAMBIGUATOR}_soft`,
        to:       [email],
        bounce:   { type: 'soft', reason: 'mailbox full' },
      },
    };
    const body = JSON.stringify(payload);
    const id   = `msg_${DISAMBIGUATOR}_soft`;
    const ts   = String(Math.floor(Date.now() / 1000));
    const sig  = svixSign(id, ts, body, process.env.RESEND_WEBHOOK_SECRET);

    const res = await request.post(`${apiBase()}/api/webhooks/resend`, {
      headers: {
        'content-type':    'application/json',
        'svix-id':         id,
        'svix-timestamp':  ts,
        'svix-signature':  sig,
      },
      data: body,
    });
    expect(res.status()).toBe(200);

    const rows = await dbHelper.query(
      `SELECT email FROM email_suppressions WHERE email = LOWER($1)`,
      [email],
    );
    expect(rows.length).toBe(0);
  });
});
