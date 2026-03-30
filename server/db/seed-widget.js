/**
 * NOMII AI — Seed Widget API Keys
 *
 * Generates a widget_api_key for any tenant that doesn't have one yet,
 * and prints the key for Covenant Trust so you can test the embed widget.
 *
 * Run:
 *   docker compose exec server node db/seed-widget.js
 *   -- or --
 *   node db/seed-widget.js   (from /server directory with DATABASE_URL set)
 */

require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Backfill any tenant missing a widget_api_key
  const { rows: tenants } = await pool.query(
    `SELECT id, name, slug, widget_api_key FROM tenants`
  );

  for (const tenant of tenants) {
    if (!tenant.widget_api_key) {
      const key = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `UPDATE tenants SET widget_api_key = $1 WHERE id = $2`,
        [key, tenant.id]
      );
      tenant.widget_api_key = key;
      console.log(`Generated key for "${tenant.name}" (${tenant.slug})`);
    }
  }

  // Print all keys for easy copy-paste
  console.log('\n── Widget API Keys ──────────────────────────────────────');
  for (const tenant of tenants) {
    console.log(`\nTenant : ${tenant.name}`);
    console.log(`Slug   : ${tenant.slug}`);
    console.log(`Key    : ${tenant.widget_api_key}`);
    console.log(`\nEmbed snippet:`);
    console.log(`  <script`);
    console.log(`    src="https://YOUR_SERVER/embed.js"`);
    console.log(`    data-widget-key="${tenant.widget_api_key}"`);
    console.log(`    data-user-email="USER_EMAIL_HERE"`);
    console.log(`    data-user-name="USER_DISPLAY_NAME"`);
    console.log(`  ></script>`);
  }

  console.log('\n────────────────────────────────────────────────────────\n');
  await pool.end();
}

run().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
