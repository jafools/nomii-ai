/**
 * SHENMAY AI — Brand Learning · Nightly Worker
 *
 * Orchestrator that runs once on server startup, then every 24 hours.
 * For each tenant where `brand_learning_enabled = true`:
 *
 *   1. Pull anonymous conversations newer than `brand_learning_processed_at`.
 *   2. Bail early if not enough distinct sessions to meet the promotion
 *      threshold (no point burning an LLM call to learn nothing).
 *   3. Resolve the tenant's LLM key (BYOK first, platform if managed_ai
 *      is on, env-var if self-hosted). Skip silently if none + log incident.
 *   4. Pre-scrub every message via `piiTokenizer` (Layer 1 of 6).
 *   5. Call Haiku to distill brand-level observations (Layer 2).
 *   6. Apply frequency-threshold promotion via `promote.applyAndPromote`
 *      (Layer 4). Net-new candidates accumulate in `brand_memory`; only
 *      observations seen in ≥ N distinct sessions reach `brand_soul`.
 *   7. `quickScanForResidualPii` on the final JSON → if any PII slipped
 *      through, abort the write and log a `pii_breach` incident (Layer 3).
 *   8. Encrypt + persist all 3 artifacts atomically. Bump watermarks.
 *
 * Errors never propagate. Every failure path logs an incident row tied to
 * the tenant so the dashboard can surface it.
 *
 * Lifecycle mirrors `jobs/dataRetention.js`: `start()` schedules, `stop()`
 * clears the timer, SIGTERM/SIGINT handlers wired for graceful shutdown.
 */

'use strict';

const db = require('../../db');
const { encryptJson, safeDecryptJson } = require('../cryptoService');
const { isAnonVisitorEmail, anonEmailLikeMatch } = require('../../constants/anonDomains');
const { resolveApiKey } = require('../llmService');
const { normalizeProvider } = require('../llm');
const {
  scrubMessagesForDistillation,
  quickScanForResidualPii,
} = require('./scrub');
const {
  distillBrandObservations,
  normalizeObservations,
} = require('./distill');
const { applyAndPromote } = require('./promote');

const INTERVAL_MS = parseInt(process.env.BRAND_LEARNING_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);

// Initial-cycle bootstrap: when a tenant first turns on learning, the
// `processed_at` watermark is NULL — we look back this far so the first
// distillation has material to work with.
const BOOTSTRAP_LOOKBACK_DAYS = 30;

// Don't even run distillation if fewer than this many distinct anon
// sessions are waiting; cheaper to wait for tomorrow's batch.
const MIN_SESSIONS_TO_RUN = 2;

// Cap how many messages get fed into a single distillation call (keeps
// the prompt under Haiku's context window with comfortable headroom).
const MAX_MESSAGES_PER_CYCLE = 400;

let _timer = null;

/** Start the cron job. Idempotent. */
function start() {
  if (_timer) return;
  console.log(`[BrandLearning] Worker starting — interval ${(INTERVAL_MS / 3600000).toFixed(1)}h`);

  // Run once on startup (catches anything missed during a restart). Drop
  // any errors — they're logged inside.
  runCycle().catch(err =>
    console.error('[BrandLearning] Initial cycle failed:', err.message),
  );

  _timer = setInterval(() => {
    runCycle().catch(err =>
      console.error('[BrandLearning] Scheduled cycle failed:', err.message),
    );
  }, INTERVAL_MS);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[BrandLearning] Worker stopped');
  }
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

/**
 * Run one full cycle across all eligible tenants.
 * Errors per-tenant don't poison the rest of the cycle.
 */
async function runCycle() {
  const startedAt = Date.now();
  console.log('[BrandLearning] Cycle start');

  let tenants;
  try {
    const result = await db.query(
      `SELECT id, name, llm_provider, llm_api_key_encrypted, llm_api_key_iv,
              llm_api_key_validated, brand_learning_min_sessions
       FROM tenants
       WHERE is_active = true
         AND brand_learning_enabled = true`,
    );
    tenants = result.rows;
  } catch (err) {
    console.error('[BrandLearning] Failed to enumerate tenants:', err.message);
    return;
  }

  if (tenants.length === 0) {
    console.log('[BrandLearning] No tenants opted in — cycle complete');
    return;
  }

  let processed = 0;
  let promoted = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    try {
      const result = await runOneTenant(tenant.id);
      if (!result) {
        skipped++;
        continue;
      }
      processed++;
      promoted += result.promotedCount || 0;
    } catch (err) {
      console.error(`[BrandLearning] Tenant ${tenant.id} failed:`, err.message);
      await logIncident(tenant.id, 'distill_failed', { message: err.message });
    }
  }

  const ms = Date.now() - startedAt;
  console.log(`[BrandLearning] Cycle complete in ${ms}ms — processed ${processed}, skipped ${skipped}, promoted ${promoted}`);
}

/**
 * Process one tenant. Returns null if skipped (no key, no eligible sessions),
 * or `{ promotedCount, blockedCount, sessionsProcessed }` on success.
 *
 * Exposed for unit tests + the portal "run now" route.
 */
async function runOneTenant(tenantId) {
  // 1. Reload tenant's full brand-learning state inside the cycle so we
  //    don't act on stale cached values. ALSO pulls subscription's
  //    managed_ai_enabled (resolveApiKey needs it).
  const { rows: tenantRows } = await db.query(
    `SELECT t.id, t.name, t.llm_provider,
            t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated,
            t.brand_learning_enabled,
            t.brand_learning_min_sessions,
            t.brand_soul, t.brand_memory, t.audience_profile,
            t.brand_learning_processed_at,
            t.brand_learning_sessions_processed,
            COALESCE(s.managed_ai_enabled, false) AS managed_ai_enabled
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     WHERE t.id = $1`,
    [tenantId],
  );
  if (tenantRows.length === 0) return null;
  const tenant = tenantRows[0];

  if (!tenant.brand_learning_enabled) return null;

  // 2. Resolve API key (decision 6 ★A: BYOK first, skip if none).
  const apiKey = resolveApiKey(tenant);
  if (!apiKey) {
    await logIncident(tenant.id, 'distill_skip_no_key', {
      reason: 'no_byok_and_no_managed_ai',
    });
    return null;
  }

  // 3. Pull eligible anon conversations + messages.
  const watermark = tenant.brand_learning_processed_at
    ? new Date(tenant.brand_learning_processed_at)
    : new Date(Date.now() - BOOTSTRAP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Distinct conversation_ids first (we want to count sessions, not messages).
  const { rows: convRows } = await db.query(
    `SELECT DISTINCT m.conversation_id
     FROM messages m
     JOIN conversations co ON co.id = m.conversation_id
     JOIN customers cu ON cu.id = co.customer_id
     WHERE cu.tenant_id = $1
       AND ${anonEmailLikeMatch('cu.email')}
       AND m.created_at > $2
     ORDER BY m.conversation_id
     LIMIT 200`,
    [tenant.id, watermark.toISOString()],
  );

  if (convRows.length < MIN_SESSIONS_TO_RUN) {
    // Don't bump the watermark — wait for more material.
    return null;
  }

  const convIds = convRows.map(r => r.conversation_id);

  const { rows: messageRows } = await db.query(
    `SELECT m.role, m.content, m.created_at, cu.email AS customer_email
     FROM messages m
     JOIN conversations co ON co.id = m.conversation_id
     JOIN customers cu ON cu.id = co.customer_id
     WHERE m.conversation_id = ANY($1::uuid[])
     ORDER BY m.created_at ASC
     LIMIT $2`,
    [convIds, MAX_MESSAGES_PER_CYCLE],
  );

  // Belt-and-braces — drop any message whose customer isn't anon (e.g.
  // a session that flipped from anon to identified mid-stream gets
  // included only up to the identification point — Decision 5 ★A).
  const anonOnly = messageRows.filter(m => isAnonVisitorEmail(m.customer_email));

  if (anonOnly.length === 0) {
    // Bump watermark anyway — these messages aren't candidates and we
    // shouldn't keep re-checking them tomorrow.
    await db.query(
      `UPDATE tenants SET brand_learning_processed_at = NOW(),
                          brand_learning_last_run_at = NOW()
       WHERE id = $1`,
      [tenant.id],
    );
    return null;
  }

  // 4. Scrub. Layer 1.
  const { scrubbedText, replacementCount } = scrubMessagesForDistillation(anonOnly);

  // 5. Distill. Layer 2.
  const provider = normalizeProvider(tenant.llm_provider);
  const candidatesRaw = await distillBrandObservations({
    scrubbedTranscript: scrubbedText,
    sessionCount: convIds.length,
    apiKey,
    provider,
    brandName: tenant.name,
  });

  if (candidatesRaw === null) {
    await logIncident(tenant.id, 'distill_failed', {
      reason: 'llm_returned_null_or_breach',
      session_count: convIds.length,
    });
    return null;
  }

  const candidates = normalizeObservations(candidatesRaw);

  // 6. Apply + promote. Layer 4.
  const currentSoul     = safeDecryptJson(tenant.brand_soul)       || {};
  const currentMemory   = safeDecryptJson(tenant.brand_memory)     || {};
  const currentAudience = safeDecryptJson(tenant.audience_profile) || {};

  const minSessions = tenant.brand_learning_min_sessions || 3;

  const result = applyAndPromote({
    currentSoul,
    currentMemory,
    currentAudience,
    candidates,
    minSessions,
    thisBatchSessions: 1,   // each candidate represents at least 1 session this cycle
  });

  // 7. Outbound audit. Layer 3 — last line of defense before write.
  const soulSerialized = JSON.stringify(result.nextSoul);
  const audienceSerialized = JSON.stringify(result.nextAudience);
  const piiInSoul = quickScanForResidualPii(soulSerialized);
  const piiInAudience = quickScanForResidualPii(audienceSerialized);

  if (piiInSoul.length > 0 || piiInAudience.length > 0) {
    await logIncident(tenant.id, 'pii_breach', {
      types_in_soul: piiInSoul,
      types_in_audience: piiInAudience,
      session_count: convIds.length,
      replacement_count: replacementCount,
    });
    // Do NOT write. Bump watermark so we don't keep retrying the same batch.
    await db.query(
      `UPDATE tenants SET brand_learning_processed_at = NOW(),
                          brand_learning_last_run_at = NOW()
       WHERE id = $1`,
      [tenant.id],
    );
    return null;
  }

  // 8. Persist.
  const sessionsProcessed = (tenant.brand_learning_sessions_processed || 0) + convIds.length;

  await db.query(
    `UPDATE tenants
       SET brand_soul                      = $1,
           brand_memory                    = $2,
           audience_profile                = $3,
           brand_learning_processed_at     = NOW(),
           brand_learning_last_run_at      = NOW(),
           brand_learning_sessions_processed = $4
       WHERE id = $5`,
    [
      JSON.stringify(encryptJson(result.nextSoul)),
      JSON.stringify(encryptJson(result.nextMemory)),
      JSON.stringify(encryptJson(result.nextAudience)),
      sessionsProcessed,
      tenant.id,
    ],
  );

  if (result.blockedCount > 0) {
    await logIncident(tenant.id, 'promotion_blocked', {
      blocked: result.blockedCount,
      promoted: result.promotedCount,
      added: result.addedCandidates,
    });
  }

  console.log(
    `[BrandLearning] Tenant ${tenant.name} (${tenant.id}): ${convIds.length} sessions → ` +
    `${result.promotedCount} promoted, ${result.blockedCount} held, ${replacementCount} PII replacements`,
  );

  return {
    promotedCount: result.promotedCount,
    blockedCount:  result.blockedCount,
    addedCandidates: result.addedCandidates,
    sessionsProcessed: convIds.length,
  };
}

/** Insert a row into brand_learning_incidents. Never throws. */
async function logIncident(tenantId, type, detail) {
  try {
    await db.query(
      `INSERT INTO brand_learning_incidents (tenant_id, type, detail) VALUES ($1, $2, $3)`,
      [tenantId, type, JSON.stringify(detail || {})],
    );
  } catch (err) {
    console.error('[BrandLearning] Failed to log incident:', err.message);
  }
}

module.exports = {
  start,
  stop,
  runCycle,
  runOneTenant,
  // Constants exported for tests
  BOOTSTRAP_LOOKBACK_DAYS,
  MIN_SESSIONS_TO_RUN,
  MAX_MESSAGES_PER_CYCLE,
};
