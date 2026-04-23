/**
 * SHENMAY AI — Database Reset
 * Drops all tables and re-runs migrations + seeds
 */

require('dotenv').config();
const { Pool } = require('pg');
const { execSync } = require('child_process');

async function reset() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://shenmay:shenmay_dev_2026@localhost:5432/shenmay_ai',
  });

  try {
    console.log('Resetting database...\n');

    // Drop all tables
    await pool.query(`
      DROP TABLE IF EXISTS advisor_customers CASCADE;
      DROP TABLE IF EXISTS flags CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS customer_data CASCADE;
      DROP TABLE IF EXISTS financial_accounts CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
      DROP TABLE IF EXISTS advisors CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;
    `);
    console.log('  ✓ All tables dropped');

    await pool.end();

    // Re-run migrations and seeds
    console.log('');
    execSync('node db/migrate.js', { cwd: __dirname + '/..', stdio: 'inherit' });
    console.log('');
    execSync('node db/seed.js', { cwd: __dirname + '/..', stdio: 'inherit' });

    console.log('\nDatabase reset complete!');
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  }
}

reset();
