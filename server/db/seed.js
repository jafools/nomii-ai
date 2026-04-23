/**
 * SHENMAY AI — Database Seeder
 * Populates the database with Covenant Trust demo data + persona Soul/Memory files
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://shenmay:shenmay_dev_2026@localhost:5432/shenmay_ai',
  });

  try {
    console.log('Seeding database...\n');

    // 1. Run seed SQL
    const seedFile = path.join(__dirname, 'seeds', '001_covenant_trust_demo.sql');
    const sql = fs.readFileSync(seedFile, 'utf-8');
    await pool.query(sql);
    console.log('  ✓ Seed data inserted');

    // 2. Load persona Soul + Memory files into customers
    const personasDir = path.join(__dirname, '..', 'data', 'personas');

    const personas = [
      {
        customerId: 'cccc1111-cccc-cccc-cccc-cccccccccccc',
        soulFile: 'margaret_chen_soul.json',
        memoryFile: 'margaret_chen_memory.json',
      },
      {
        customerId: 'cccc2222-cccc-cccc-cccc-cccccccccccc',
        soulFile: 'jim_thompson_soul.json',
        memoryFile: 'jim_thompson_memory.json',
      },
      {
        customerId: 'cccc3333-cccc-cccc-cccc-cccccccccccc',
        soulFile: 'rivera_family_soul.json',
        memoryFile: 'rivera_family_memory.json',
      },
    ];

    for (const persona of personas) {
      const soul = JSON.parse(fs.readFileSync(path.join(personasDir, persona.soulFile), 'utf-8'));
      const memory = JSON.parse(fs.readFileSync(path.join(personasDir, persona.memoryFile), 'utf-8'));

      await pool.query(
        'UPDATE customers SET soul_file = $1, memory_file = $2 WHERE id = $3',
        [JSON.stringify(soul), JSON.stringify(memory), persona.customerId]
      );
      console.log(`  ✓ Loaded persona: ${persona.soulFile.replace('_soul.json', '')}`);
    }

    console.log('\nSeeding complete!');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
