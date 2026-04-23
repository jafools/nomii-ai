/**
 * SHENMAY AI — Database Connection
 * PostgreSQL connection pool using pg
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://shenmay:shenmay_dev_2026@localhost:5432/shenmay_ai',
});

// Log connection status
pool.on('connect', () => {
  console.log('[DB] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
