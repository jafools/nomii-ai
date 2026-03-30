/**
 * NOMII AI — Seed Demo Auth Users
 *
 * Sets passwords for existing demo users so they can log in.
 * Run after the main seed: npm run db:seed-auth
 *
 * Demo credentials:
 *   Margaret Chen (customer)    → margaret.chen@email.com / demo123
 *   Jim Thompson (customer)     → jim.thompson@email.com / demo123
 *   Diana Rivera (customer)     → diana.rivera@email.com / demo123
 *   James Rodriguez (advisor)   → james.rodriguez@covenanttrust.com / demo123
 *   Sarah Kim (advisor)         → sarah.kim@covenanttrust.com / demo123
 *   Michael Torres (admin)      → michael.torres@covenanttrust.com / demo123
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');

const DEMO_PASSWORD = 'demo123';

async function seedAuth() {
  console.log('[SeedAuth] Hashing demo password...');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log('[SeedAuth] Setting passwords for demo customers...');
  await db.query(
    `UPDATE customers SET password_hash = $1
     WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
       AND password_hash IS NULL`,
    [hash]
  );

  console.log('[SeedAuth] Setting passwords for demo advisors...');
  await db.query(
    `UPDATE advisors SET password_hash = $1
     WHERE tenant_id = '11111111-1111-1111-1111-111111111111'
       AND password_hash IS NULL`,
    [hash]
  );

  console.log('[SeedAuth] Done! Demo credentials:');
  console.log('  Customers:');
  console.log('    margaret.chen@email.com / demo123');
  console.log('    jim.thompson@email.com / demo123');
  console.log('    diana.rivera@email.com / demo123');
  console.log('  Advisors:');
  console.log('    james.rodriguez@covenanttrust.com / demo123');
  console.log('    sarah.kim@covenanttrust.com / demo123');
  console.log('  Admin:');
  console.log('    michael.torres@covenanttrust.com / demo123');

  await db.pool.end();
}

seedAuth().catch(err => {
  console.error('[SeedAuth] Error:', err.message);
  process.exit(1);
});
