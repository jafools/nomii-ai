/**
 * SHENMAY AI — Seed a deterministic TEST_ADMIN tenant for Playwright E2E.
 *
 * Runs as part of `playwright.config.js` globalSetup so every test session
 * starts from a known good state. Safe to run against any database (local
 * dev, CI test DB, staging) — the upserts are idempotent and scoped to a
 * fixed tenant UUID + admin UUID that no real customer will ever use.
 *
 * Requires:
 *   TEST_ADMIN_EMAIL     — default 'e2e-admin@shenmay.test'
 *   TEST_ADMIN_PASSWORD  — default 'E2ETestPass!234' (>= 8 chars)
 *   DATABASE_URL         — a test or dev Postgres; NEVER the prod one
 *
 * Guardrails (hard refusals):
 *   - If DATABASE_URL contains 'shenmay_ai' (without a `_test`/`_staging`/`_dev`
 *     suffix), this script aborts. The prod DB is literally named `shenmay_ai`
 *     and nuking it with an e2e tenant would be a very bad day.
 *
 * What we seed:
 *   tenants row                     (id pinned, name 'Shenmay E2E Test')
 *   tenant_admins row               (id pinned, email_verified=true, owner role)
 *   subscriptions row               (plan='master', 99999 caps, never expires)
 *
 * What we DON'T seed:
 *   - No customers, no conversations, no labels, no api keys. Individual
 *     specs that need that data seed it themselves (and clean up after).
 *
 * This is the E2E harness companion to server/db/seed.js. Keep them in sync
 * with schema changes that add NOT NULL columns to the three tables above.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');

const TEST_TENANT_ID = '00000000-0000-4000-a000-0000000000e2';
const TEST_ADMIN_ID  = '00000000-0000-4000-a000-0000000000ad';

const TEST_EMAIL    = (process.env.TEST_ADMIN_EMAIL    || 'e2e-admin@shenmay.test').toLowerCase();
const TEST_PASSWORD =  process.env.TEST_ADMIN_PASSWORD || 'E2ETestPass!234';

const TEST_COMPANY  = 'Shenmay E2E Test';
const TEST_SLUG     = 'shenmay-e2e-test';
// Deterministic widget key so tests that need it can hard-code or env-load it.
const TEST_WIDGET_KEY = 'e2e-widget-key-000000000000000000000000000000e2e2';

function refuseProdDb() {
  const url = process.env.DATABASE_URL || '';
  if (!url) return;
  const looksLikeProd =
    /@(?!localhost|127\.0\.0\.1|db|postgres)/i.test(url) &&
    !/shenmay_ai_(test|staging|dev|ci)/i.test(url) &&
    /\/shenmay_ai(\b|$)/.test(url);
  if (looksLikeProd) {
    console.error('[SeedTestAdmin] REFUSING to run — DATABASE_URL looks like production.');
    console.error('[SeedTestAdmin] Got:', url.replace(/:[^:@/]+@/, ':***@'));
    process.exit(2);
  }
}

async function seed() {
  refuseProdDb();

  if (TEST_PASSWORD.length < 8) {
    throw new Error('TEST_ADMIN_PASSWORD must be at least 8 characters');
  }

  console.log(`[SeedTestAdmin] Seeding deterministic test admin: ${TEST_EMAIL}`);

  const hash = await bcrypt.hash(TEST_PASSWORD, 10);

  // ── 1. Tenant upsert ────────────────────────────────────────────────────
  // We key on the pinned UUID, not the unique name, so repeat runs are
  // a no-op even if the name happens to collide (it shouldn't).
  await db.query(
    `INSERT INTO tenants (
       id, name, slug, agent_name, vertical,
       primary_color, secondary_color,
       widget_api_key, is_active,
       onboarding_steps
     ) VALUES ($1, $2, $3, 'E2E Assistant', 'other',
               '#0F5F5C', '#84C7C4',
               $4, true,
               '{"company": true, "products": true, "customers": true, "widget": true, "test": true}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name              = EXCLUDED.name,
       slug              = EXCLUDED.slug,
       is_active         = true,
       widget_api_key    = EXCLUDED.widget_api_key,
       onboarding_steps  = EXCLUDED.onboarding_steps,
       updated_at        = NOW()`,
    [TEST_TENANT_ID, TEST_COMPANY, TEST_SLUG, TEST_WIDGET_KEY]
  );

  // ── 2. Tenant admin upsert ──────────────────────────────────────────────
  // Re-hash every run so password rotation Just Works. email_verified=true
  // bypasses the verification email step so tests don't need a mail inbox.
  await db.query(
    `INSERT INTO tenant_admins (
       id, tenant_id, email, password_hash,
       first_name, last_name, role,
       email_verified, email_verification_token, email_verification_expires,
       newsletter_opt_in
     ) VALUES ($1, $2, $3, $4,
               'E2E', 'Admin', 'owner',
               true, NULL, NULL,
               false)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id                 = EXCLUDED.tenant_id,
       email                     = EXCLUDED.email,
       password_hash             = EXCLUDED.password_hash,
       role                      = 'owner',
       email_verified            = true,
       email_verification_token  = NULL,
       email_verification_expires = NULL`,
    [TEST_ADMIN_ID, TEST_TENANT_ID, TEST_EMAIL, hash]
  );

  // ── 3. Subscription upsert — master tier so no limits trip tests ────────
  await db.query(
    `INSERT INTO subscriptions (
       tenant_id, plan, status,
       max_customers, max_messages_month, managed_ai_enabled,
       trial_ends_at, current_period_start, current_period_end,
       messages_used_this_month
     ) VALUES ($1, 'master', 'active',
               99999, 999999, true,
               NOW() + INTERVAL '100 years',
               NOW(), NOW() + INTERVAL '100 years',
               0)
     ON CONFLICT (tenant_id) DO UPDATE SET
       plan                       = 'master',
       status                     = 'active',
       max_customers              = 99999,
       max_messages_month         = 999999,
       managed_ai_enabled         = true,
       trial_ends_at              = NOW() + INTERVAL '100 years',
       current_period_end         = NOW() + INTERVAL '100 years',
       messages_used_this_month   = 0,
       updated_at                 = NOW()`,
    [TEST_TENANT_ID]
  );

  // ── 4. Leftover token cleanup ───────────────────────────────────────────
  // Removes any expired/consumed magic-link tokens left over from a previous
  // run of the portal-magic-link spec — avoids stale tokens poisoning
  // later runs on the same DB.
  await db.query(
    `DELETE FROM portal_login_tokens
      WHERE expires_at < NOW() - INTERVAL '1 hour'`
  );
  await db.query(
    `DELETE FROM portal_sessions
      WHERE expires_at < NOW() - INTERVAL '1 hour'
         OR revoked_at IS NOT NULL`
  );

  console.log(`[SeedTestAdmin] OK — tenant=${TEST_TENANT_ID} admin=${TEST_ADMIN_ID} email=${TEST_EMAIL}`);
}

// Export so globalSetup can call without spawning a subprocess.
module.exports = { seed, TEST_TENANT_ID, TEST_ADMIN_ID, TEST_WIDGET_KEY };

// CLI mode — when invoked as `node server/db/seed-test-admin.js`.
if (require.main === module) {
  seed()
    .then(() => db.pool.end())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SeedTestAdmin] Error:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}
