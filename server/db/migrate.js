/**
 * NOMII AI — Database Migration Runner
 * Runs SQL migrations in order, skipping already-applied ones.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://nomii:nomii_dev_2026@localhost:5432/nomii_ai',
  });

  try {
    // Create migration tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));

    console.log('Running migrations...\n');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  Skipping (already applied): ${file}`);
        continue;
      }

      console.log(`  Running: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`  ✓ Done: ${file}`);
      ran++;
    }

    if (ran === 0) {
      console.log('\nAll migrations already applied.');
    } else {
      console.log(`\n${ran} migration(s) applied successfully!`);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
