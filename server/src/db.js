/**
 * NOMII AI — Database Connection
 * PostgreSQL connection pool using pg
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nomii:nomii_dev_2026@localhost:5432/nomii_ai',
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
