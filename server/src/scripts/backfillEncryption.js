/**
 * NOMII AI — Soul/Memory Encryption Backfill
 *
 * One-time script to encrypt all existing plain-text soul_file and memory_file
 * rows that pre-date the column-level encryption rollout (Session 18).
 *
 * Safe to run multiple times — already-encrypted rows are detected via the
 * { __enc, __iv } sentinel and skipped without any DB write.
 *
 * Usage (from /server directory):
 *   node src/scripts/backfillEncryption.js
 *
 * Or with a dry run to preview what would be encrypted without writing:
 *   DRY_RUN=true node src/scripts/backfillEncryption.js
 *
 * Runs in batches of 100 rows to avoid loading the entire table into memory.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const db                                   = require('../db');
const { encryptJson, isEncrypted }         = require('../services/cryptoService');

const BATCH_SIZE = 100;
const DRY_RUN    = process.env.DRY_RUN === 'true';

if (DRY_RUN) {
  console.log('\n⚠️  DRY RUN — no writes will be made\n');
}

async function backfill() {
  let offset         = 0;
  let totalProcessed = 0;
  let totalEncrypted = 0;
  let totalSkipped   = 0;
  let totalErrors    = 0;

  console.log('🔐 Starting soul_file / memory_file encryption backfill...\n');

  while (true) {
    // Fetch a batch — only rows where at least one column has data
    const { rows } = await db.query(
      `SELECT id, soul_file, memory_file
       FROM customers
       WHERE soul_file IS NOT NULL OR memory_file IS NOT NULL
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      totalProcessed++;

      const soulAlreadyEncrypted   = !row.soul_file   || isEncrypted(row.soul_file);
      const memoryAlreadyEncrypted = !row.memory_file  || isEncrypted(row.memory_file);

      if (soulAlreadyEncrypted && memoryAlreadyEncrypted) {
        totalSkipped++;
        continue;
      }

      try {
        const updates = [];
        const params  = [];
        let   paramN  = 1;

        if (!soulAlreadyEncrypted) {
          updates.push(`soul_file = $${paramN++}::jsonb`);
          params.push(JSON.stringify(encryptJson(row.soul_file)));
        }
        if (!memoryAlreadyEncrypted) {
          updates.push(`memory_file = $${paramN++}::jsonb`);
          params.push(JSON.stringify(encryptJson(row.memory_file)));
        }

        params.push(row.id);

        if (!DRY_RUN) {
          await db.query(
            `UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramN}`,
            params
          );
        }

        const fields = [
          !soulAlreadyEncrypted   ? 'soul_file'   : null,
          !memoryAlreadyEncrypted ? 'memory_file'  : null,
        ].filter(Boolean).join(', ');

        console.log(`  ${DRY_RUN ? '[DRY]' : '✓'} customer ${row.id} — encrypted: ${fields}`);
        totalEncrypted++;
      } catch (err) {
        console.error(`  ✗ customer ${row.id} — ERROR: ${err.message}`);
        totalErrors++;
      }
    }

    offset += BATCH_SIZE;

    // Small pause between batches to avoid hammering the DB
    if (rows.length === BATCH_SIZE) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`  Processed : ${totalProcessed}`);
  console.log(`  Encrypted : ${totalEncrypted}${DRY_RUN ? ' (dry run — no writes)' : ''}`);
  console.log(`  Skipped   : ${totalSkipped} (already encrypted or null)`);
  console.log(`  Errors    : ${totalErrors}`);
  console.log('─────────────────────────────────────\n');

  if (totalErrors > 0) {
    console.error('⚠️  Some rows failed — check the errors above and re-run.');
    process.exit(1);
  } else {
    console.log('✅ Backfill complete.\n');
    process.exit(0);
  }
}

backfill().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
