/**
 * SHENMAY AI — Resend Webhook Handler
 *
 * Receives Resend event notifications (bounces, complaints, deliveries)
 * and populates the `email_suppressions` table so subsequent sends to
 * permfailed addresses are skipped before touching the transporter.
 *
 * Mounted at POST /api/webhooks/resend with express.raw({ type:
 * 'application/json' }) so req.body is a Buffer we can feed to the
 * signature verifier.
 *
 * Resend signs webhook requests via Svix. Three headers:
 *   svix-id         — unique message id
 *   svix-timestamp  — unix seconds
 *   svix-signature  — one or more `v1,<base64(hmac-sha256)>` tokens,
 *                     space-separated
 *
 * The signed payload is `${svix-id}.${svix-timestamp}.${raw-body}`,
 * HMAC'd with the webhook secret (the base64 part after `whsec_` in
 * RESEND_WEBHOOK_SECRET). Timing-safe compare required — Resend can
 * rotate secrets and send overlapping signatures.
 *
 * Dev mode: if RESEND_WEBHOOK_SECRET is unset the handler skips
 * verification and parses the body directly. Matches the
 * stripe-webhook pattern.
 */

const router = require('express').Router();
const crypto = require('crypto');
const db     = require('../db');

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

// Reject events older than 5 minutes even if the signature validates
// (replay-attack defense).
const MAX_TIMESTAMP_SKEW_SEC = 5 * 60;

function verifySvixSignature(req) {
  if (!RESEND_WEBHOOK_SECRET) {
    // Refuse the dev-mode bypass in production — an unsigned endpoint
    // lets anyone POST arbitrary suppression rows, which is an
    // availability attack on our own deliverability (victim@example.com
    // gets blocked from receiving legitimate mail from us). Forces
    // operators to wire RESEND_WEBHOOK_SECRET before the webhook is
    // actually useful.
    if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
      return { ok: false, reason: 'webhook_secret_unset_in_production' };
    }
    return { ok: true, reason: 'dev_mode_unsigned' };
  }

  const id   = req.headers['svix-id'];
  const ts   = req.headers['svix-timestamp'];
  const sigs = req.headers['svix-signature'];
  if (!id || !ts || !sigs) {
    return { ok: false, reason: 'missing_headers' };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'bad_timestamp' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_TIMESTAMP_SKEW_SEC) {
    return { ok: false, reason: 'timestamp_skew' };
  }

  // Secret is "whsec_<base64>" — decode the base64 part
  const secretB64 = RESEND_WEBHOOK_SECRET.startsWith('whsec_')
    ? RESEND_WEBHOOK_SECRET.slice('whsec_'.length)
    : RESEND_WEBHOOK_SECRET;
  const secretBytes = Buffer.from(secretB64, 'base64');

  const signedPayload = `${id}.${ts}.${req.body.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedPayload)
    .digest('base64');

  // Resend can send multiple signatures (rotation). Accept if any match.
  const tokens = String(sigs)
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const [version, value] = token.split(',');
    if (version !== 'v1' || !value) continue;
    const a = Buffer.from(value, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'signature_mismatch' };
}

async function upsertSuppression({ email, reason, bounceType, rawEvent }) {
  const normalized = email.toLowerCase().trim();
  await db.query(
    `INSERT INTO email_suppressions (email, reason, bounce_type, raw_event)
         VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       reason      = EXCLUDED.reason,
       bounce_type = EXCLUDED.bounce_type,
       raw_event   = EXCLUDED.raw_event,
       updated_at  = NOW()`,
    [normalized, reason, bounceType, rawEvent],
  );
}

router.post('/', async (req, res) => {
  const verdict = verifySvixSignature(req);
  if (!verdict.ok) {
    console.warn(`[Resend Webhook] rejected: ${verdict.reason}`);
    return res.status(400).json({ error: verdict.reason });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad_json' });
  }

  const type = event?.type;
  const toField = event?.data?.to;
  const recipients = Array.isArray(toField) ? toField : (toField ? [toField] : []);

  console.log(`[Resend Webhook] ${type} → ${recipients.join(', ') || '(no recipient)'}`);

  try {
    // Only hard bounces go on the deny-list. Soft bounces (mailbox full,
    // temporarily unavailable) may recover; suppressing them permanently
    // would be over-eager.
    if (type === 'email.bounced') {
      const bounceType = event?.data?.bounce?.type || 'unknown';
      if (bounceType === 'hard' || bounceType === 'Permanent') {
        for (const r of recipients) {
          await upsertSuppression({
            email:      r,
            reason:     'bounce',
            bounceType: 'hard',
            rawEvent:   event,
          });
        }
      }
    } else if (type === 'email.complained') {
      for (const r of recipients) {
        await upsertSuppression({
          email:      r,
          reason:     'complaint',
          bounceType: null,
          rawEvent:   event,
        });
      }
    }
    // delivered / sent / opened / clicked events are acked but not stored.
    // Add handling here if we ever want per-message analytics.
  } catch (err) {
    console.error('[Resend Webhook] DB upsert failed:', err.message);
    // Still 200 — Resend retries failures indefinitely, and a transient
    // DB blip shouldn't fill the retry queue. Alert via UptimeRobot on
    // /api/health instead.
  }

  return res.json({ ok: true });
});

module.exports = router;
