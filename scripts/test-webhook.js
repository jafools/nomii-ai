#!/usr/bin/env node
// ============================================================
//  Shenmay AI — Stripe Webhook Simulator
//  Sends a fake-but-correctly-signed checkout.session.completed
//  event to your webhook endpoint, exactly like Stripe would.
//
//  Usage (run on your server inside the project folder):
//    node scripts/test-webhook.js ajaces@gmail.com starter
//    node scripts/test-webhook.js ajaces@gmail.com growth
//    node scripts/test-webhook.js ajaces@gmail.com professional
// ============================================================

const crypto = require('crypto');
const https  = require('https');
const http   = require('http');
require('dotenv').config({ path: './server/.env' });

const EMAIL = process.argv[2] || 'ajaces@gmail.com';
const PLAN  = process.argv[3] || 'starter';

// ── Config ────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const WEBHOOK_URL    = process.env.WEBHOOK_URL || 'http://localhost:3001/api/stripe/webhook';

// Plan → fake Stripe price ID mapping (matches your getPlanFromPriceId logic)
const PRICE_IDS = {
  starter:      process.env.STRIPE_PRICE_STARTER      || 'price_test_starter',
  growth:       process.env.STRIPE_PRICE_GROWTH        || 'price_test_growth',
  professional: process.env.STRIPE_PRICE_PROFESSIONAL  || 'price_test_professional',
};

// ── Get tenant_id from DB ─────────────────────────────────
const { execSync } = require('child_process');

let tenantId;
try {
  tenantId = execSync(
    `docker exec shenmay-db psql --U nomii -d nomii_ai -t -c "SELECT tenant_id FROM tenant_admins WHERE email = '${EMAIL}' LIMIT 1;"`,
    { encoding: 'utf8' }
  ).trim();
} catch (e) {
  console.error('❌  Could not connect to database. Are containers running?');
  process.exit(1);
}

if (!tenantId) {
  console.error(`❌  No tenant found for email: ${EMAIL}`);
  process.exit(1);
}

console.log(`\n✅  Found tenant: ${tenantId}`);
console.log(`📦  Simulating ${PLAN} plan purchase...\n`);

// ── Build fake Stripe event ────────────────────────────────
const fakeEvent = {
  id: `evt_test_${Date.now()}`,
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: `cs_test_${Date.now()}`,
      object: 'checkout.session',
      client_reference_id: tenantId,          // how pricing table passes tenant_id
      customer: `cus_test_${Date.now()}`,
      subscription: `sub_test_${Date.now()}`,
      payment_status: 'paid',
      status: 'complete',
      metadata: { tenant_id: tenantId },       // fallback for custom checkout
      line_items: {
        data: [{ price: { id: PRICE_IDS[PLAN] } }]
      }
    }
  }
};

const payload = JSON.stringify(fakeEvent);
const timestamp = Math.floor(Date.now() / 1000);

// ── Sign the payload exactly like Stripe does ──────────────
function signPayload(payload, secret, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

if (!WEBHOOK_SECRET) {
  console.log('⚠️   STRIPE_WEBHOOK_SECRET not set in server/.env');
  console.log('    The webhook will likely reject this request.');
  console.log('    Set it and rerun, or temporarily disable signature verification for testing.\n');
}

const stripeSignature = WEBHOOK_SECRET
  ? signPayload(payload, WEBHOOK_SECRET, timestamp)
  : `t=${timestamp},v1=unsigned_test`;

// ── Send the request ─────────────────────────────────────
const url = new URL(WEBHOOK_URL);
const lib = url.protocol === 'https:' ? https : http;

const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Stripe-Signature': stripeSignature,
  }
};

const req = lib.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`✅  Webhook accepted! (HTTP ${res.statusCode})`);
      console.log('\n📋  Checking database...\n');
      try {
        const result = execSync(
          `docker exec shenmay-db psql --U nomii -d nomii_ai -c "SELECT plan, status, max_customers, max_messages_month, max_agents FROM subscriptions WHERE tenant_id = '${tenantId}';"`,
          { encoding: 'utf8' }
        );
        console.log(result);
        console.log('👉  Now refresh your dashboard to confirm the plan shows correctly.');
      } catch (e) {
        console.log('(Could not read DB — check manually)');
      }
    } else {
      console.log(`❌  Webhook rejected — HTTP ${res.statusCode}`);
      console.log(`    Response: ${data}`);
      console.log('\n    Common causes:');
      console.log('    • STRIPE_WEBHOOK_SECRET is wrong or not set');
      console.log('    • The price ID in STRIPE_PRICE_STARTER/GROWTH/PROFESSIONAL does not match');
      console.log('    • Backend container is not running on port 3001');
    }
  });
});

req.on('error', (e) => {
  console.error(`❌  Could not reach ${WEBHOOK_URL}`);
  console.error(`    Error: ${e.message}`);
  console.error('\n    Is the backend running? Try: docker compose ps');
});

req.write(payload);
req.end();
