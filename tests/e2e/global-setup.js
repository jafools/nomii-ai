/**
 * Playwright global setup.
 *
 * Runs once before any spec files execute. Responsibilities:
 *
 *   1. Seed the deterministic TEST_ADMIN tenant into the database
 *      (idempotent — safe to re-run against the same DB).
 *
 *   2. If PLAYWRIGHT_BASE_URL is pointed at a REMOTE URL (staging/prod),
 *      skip the seed — we don't have DB creds for remote hosts and the
 *      seed must be applied there out-of-band (once, manually).
 *
 * To explicitly skip the seed in any environment, set PLAYWRIGHT_SKIP_SEED=1.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'server', '.env') });

module.exports = async () => {
  if (process.env.PLAYWRIGHT_SKIP_SEED === '1') {
    console.log('[E2E globalSetup] PLAYWRIGHT_SKIP_SEED=1 — skipping DB seed.');
    return;
  }

  const base = process.env.PLAYWRIGHT_BASE_URL || '';
  const isRemote = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(base);
  if (isRemote) {
    console.log(`[E2E globalSetup] Remote base URL (${base}) — skipping local DB seed.`);
    console.log('[E2E globalSetup] Ensure the target DB has been seeded out-of-band:');
    console.log('                  node server/db/seed-test-admin.js');
    return;
  }

  const { seed } = require('../../server/db/seed-test-admin');
  const db = require('../../server/src/db');
  try {
    await seed();
  } finally {
    // Close the pg pool so Playwright's node process can exit cleanly
    // after the test run.
    try { await db.pool.end(); } catch { /* already closed */ }
  }
};
