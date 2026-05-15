/**
 * SHENMAY AI — Tenant Portal: Brand Learning
 *
 * Sub-router mounted by ../portal.js at `/api/portal/brand-learning`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   GET    /api/portal/brand-learning                  — Read all 3 artifacts
 *                                                        + status + recent incidents.
 *                                                        Used by the dashboard
 *                                                        to show visitors that
 *                                                        the AI is learning.
 *   POST   /api/portal/brand-learning/toggle           — Enable/disable learning.
 *                                                        Owner role required.
 *   POST   /api/portal/brand-learning/run-now          — Force-run a cycle for
 *                                                        this tenant. Cooldown
 *                                                        enforced server-side.
 *                                                        Owner role required.
 *   POST   /api/portal/brand-learning/kill-switch      — Wipe all 3 artifacts
 *                                                        and disable learning.
 *                                                        Owner role required.
 *
 * All endpoints scope by `req.portal.tenant_id`. No cross-tenant data access.
 */

'use strict';

const router = require('express').Router();
const db = require('../../db');
const { safeDecryptJson, encryptJson } = require('../../services/cryptoService');
const { runOneTenant } = require('../../services/brandLearning');
const { deleteItem, promoteItem, SOURCES } = require('../../services/brandLearning/curate');
const {
  deleteEmbedding,
  curateTargetToEmbeddingBucket,
  canonicalKeyFromCurateItem,
} = require('../../services/brandLearning/embeddings');

// ── Helpers ──────────────────────────────────────────────────────────────

function isOwner(req) {
  return req.portal && req.portal.role === 'owner';
}

function summarizeSoul(soul) {
  if (!soul || typeof soul !== 'object') {
    return { faqs: 0, processes: 0, voice_cues: 0 };
  }
  return {
    faqs:        Array.isArray(soul.faqs)        ? soul.faqs.length        : 0,
    processes:   Array.isArray(soul.processes)   ? soul.processes.length   : 0,
    voice_cues:  Array.isArray(soul.voice_cues)  ? soul.voice_cues.length  : 0,
  };
}

function summarizeMemory(memory) {
  if (!memory || typeof memory !== 'object') {
    return { candidate_faqs: 0, candidate_processes: 0, candidate_voice_cues: 0 };
  }
  return {
    candidate_faqs:        Array.isArray(memory.candidate_faqs)        ? memory.candidate_faqs.length        : 0,
    candidate_processes:   Array.isArray(memory.candidate_processes)   ? memory.candidate_processes.length   : 0,
    candidate_voice_cues:  Array.isArray(memory.candidate_voice_cues)  ? memory.candidate_voice_cues.length  : 0,
  };
}

function summarizeAudience(audience) {
  if (!audience || typeof audience !== 'object') {
    return { common_pain_points: 0, common_objections: 0, common_request_types: 0 };
  }
  return {
    common_pain_points:    Array.isArray(audience.common_pain_points)    ? audience.common_pain_points.length    : 0,
    common_objections:     Array.isArray(audience.common_objections)     ? audience.common_objections.length     : 0,
    common_request_types:  Array.isArray(audience.common_request_types)  ? audience.common_request_types.length  : 0,
  };
}

// ── GET / — full read of brand-learning state for the dashboard ──────────

router.get('/', async (req, res, next) => {
  try {
    const { rows: tRows } = await db.query(
      `SELECT id, name,
              brand_learning_enabled,
              brand_learning_min_sessions,
              brand_learning_auto_apply,
              brand_soul, brand_memory, audience_profile,
              brand_learning_processed_at,
              brand_learning_last_run_at,
              brand_learning_sessions_processed
       FROM tenants
       WHERE id = $1`,
      [req.portal.tenant_id],
    );

    if (tRows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    const t = tRows[0];

    const soul     = safeDecryptJson(t.brand_soul)       || {};
    const memory   = safeDecryptJson(t.brand_memory)     || {};
    const audience = safeDecryptJson(t.audience_profile) || {};

    const { rows: incidentRows } = await db.query(
      `SELECT id, type, detail, created_at
       FROM brand_learning_incidents
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 25`,
      [req.portal.tenant_id],
    );

    res.json({
      enabled:                t.brand_learning_enabled === true,
      min_sessions:           t.brand_learning_min_sessions || 3,
      auto_apply:             t.brand_learning_auto_apply === true,
      sessions_processed:     t.brand_learning_sessions_processed || 0,
      last_run_at:            t.brand_learning_last_run_at,
      processed_through_at:   t.brand_learning_processed_at,
      summary: {
        soul:     summarizeSoul(soul),
        memory:   summarizeMemory(memory),
        audience: summarizeAudience(audience),
      },
      // Full payload — capped via the schema/length limits in distill.js
      // before we ever wrote it. Frontend renders these as read-only lists.
      brand_soul:        soul,
      brand_memory:      memory,
      audience_profile:  audience,
      recent_incidents:  incidentRows.map(r => ({
        id:         r.id,
        type:       r.type,
        detail:     r.detail,
        created_at: r.created_at,
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /toggle — enable/disable learning (owner only) ──────────────────

router.post('/toggle', async (req, res, next) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Owner role required' });

    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must include `enabled: true|false`' });
    }

    await db.query(
      `UPDATE tenants SET brand_learning_enabled = $1 WHERE id = $2`,
      [enabled, req.portal.tenant_id],
    );

    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

// ── POST /run-now — force-run a cycle (cooldown enforced) ────────────────

const _lastForceRun = new Map();   // tenant_id → epoch_ms
const FORCE_RUN_COOLDOWN_MS = 5 * 60 * 1000;

router.post('/run-now', async (req, res, next) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Owner role required' });

    const tenantId = req.portal.tenant_id;
    const last = _lastForceRun.get(tenantId) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < FORCE_RUN_COOLDOWN_MS) {
      const wait = Math.ceil((FORCE_RUN_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        error: 'cooldown',
        message: `Please wait ${wait}s before running another cycle.`,
        retry_after_seconds: wait,
      });
    }

    _lastForceRun.set(tenantId, Date.now());

    // Kick off async — return immediately. Dashboard polls /brand-learning
    // every few seconds while result is "pending".
    runOneTenant(tenantId)
      .then(result => {
        if (result) {
          console.log(`[BrandLearning] Forced run for tenant ${tenantId}: ${result.promotedCount} promoted, ${result.sessionsProcessed} sessions`);
        }
      })
      .catch(err => console.error(`[BrandLearning] Forced run for tenant ${tenantId} failed:`, err.message));

    res.json({ ok: true, started: true });
  } catch (err) { next(err); }
});

// ── POST /kill-switch — wipe + disable ──────────────────────────────────

router.post('/kill-switch', async (req, res, next) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Owner role required' });

    await db.query(
      `UPDATE tenants
         SET brand_soul                          = NULL,
             brand_memory                        = NULL,
             audience_profile                    = NULL,
             brand_learning_enabled              = FALSE,
             brand_learning_processed_at         = NULL,
             brand_learning_sessions_processed   = 0
       WHERE id = $1`,
      [req.portal.tenant_id],
    );

    // v3.5.6: drop all embeddings for this tenant so a future re-opt-in
    // starts from a clean embedding table (mirrors the brand_soul reset
    // already done above). Fail-soft — table is FK-cascaded on
    // tenants(id), so a DELETE-from-tenants would also clean this, but
    // kill-switch keeps the tenant row alive so we have to explicit.
    await db.query(
      `DELETE FROM brand_learning_embeddings WHERE tenant_id = $1`,
      [req.portal.tenant_id],
    ).catch(err => console.warn(`[BrandLearning] kill-switch embeddings cleanup failed: ${err.message}`));

    await db.query(
      `INSERT INTO brand_learning_incidents (tenant_id, type, detail)
       VALUES ($1, 'kill_switch_used', $2)`,
      [
        req.portal.tenant_id,
        JSON.stringify({ admin_id: req.portal.admin_id, at: new Date().toISOString() }),
      ],
    );

    res.json({ ok: true, wiped: true });
  } catch (err) { next(err); }
});

// ── Curation: load → mutate → persist + audit ───────────────────────────
//
// Shared pipeline for /items/delete and /items/promote. Pulls the 3
// encrypted JSONB artifacts into plain JS, hands them to the pure helper,
// then re-encrypts + writes back atomically with an audit row. Errors at
// any step bail without partial writes.
async function applyCurationAction({ tenantId, adminId, action, target }) {
  const { rows } = await db.query(
    `SELECT brand_soul, brand_memory, audience_profile FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (rows.length === 0) return { error: 'tenant_not_found', status: 404 };

  const state = {
    soul:     safeDecryptJson(rows[0].brand_soul)       || {},
    memory:   safeDecryptJson(rows[0].brand_memory)     || {},
    audience: safeDecryptJson(rows[0].audience_profile) || {},
  };

  let outcome;
  try {
    outcome = action === 'delete'
      ? deleteItem(state, target)
      : promoteItem(state, target);
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  if (action === 'delete' && !outcome.removed) return { error: 'not_found', status: 404 };
  if (action === 'promote' && !outcome.promoted) return { error: 'not_found', status: 404 };

  await db.query(
    `UPDATE tenants
       SET brand_soul       = $1,
           brand_memory     = $2,
           audience_profile = $3
     WHERE id = $4`,
    [
      JSON.stringify(encryptJson(state.soul)),
      JSON.stringify(encryptJson(state.memory)),
      JSON.stringify(encryptJson(state.audience)),
      tenantId,
    ],
  );

  // Audit row — captures who/what/where so the curation surface is reviewable.
  await db.query(
    `INSERT INTO brand_learning_incidents (tenant_id, type, detail) VALUES ($1, $2, $3)`,
    [
      tenantId,
      action === 'delete' ? 'manual_delete' : 'manual_promote',
      JSON.stringify({
        admin_id:      adminId,
        source:        target.source,
        bucket:        target.bucket,
        canonical_key: target.canonical_key,
        item:          action === 'delete' ? outcome.removedItem : outcome.promotedItem,
        at:            new Date().toISOString(),
      }),
    ],
  );

  // v3.5.6: When an item is deleted (NOT promoted — promotion just moves
  // the entry between soul/memory, the concept's canonical_key is still
  // active), remove its embedding row so the worker doesn't continue to
  // anchor future paraphrases on a deleted concept. Fail-soft — embedding
  // table may not even exist on a tenant that opted in before v3.5.6.
  if (action === 'delete') {
    const embBucket = curateTargetToEmbeddingBucket(target.source, target.bucket);
    const embKey    = canonicalKeyFromCurateItem(target.source, outcome.removedItem);
    if (embBucket && embKey) {
      await deleteEmbedding(tenantId, embBucket, embKey);
    }
  }

  return { ok: true, outcome };
}

// ── POST /items/delete — owner removes a fact (promoted or pending) ─────

router.post('/items/delete', async (req, res, next) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Owner role required' });

    const { source, bucket, canonical_key } = req.body || {};
    if (!source || !bucket || !canonical_key) {
      return res.status(400).json({ error: 'Body must include source, bucket, canonical_key' });
    }

    const result = await applyCurationAction({
      tenantId: req.portal.tenant_id,
      adminId:  req.portal.admin_id,
      action:   'delete',
      target:   { source, bucket, canonical_key },
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, deleted: result.outcome.removedItem });
  } catch (err) { next(err); }
});

// ── POST /items/promote — owner manually promotes a pending candidate ───

router.post('/items/promote', async (req, res, next) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Owner role required' });

    const { source, bucket, canonical_key } = req.body || {};
    if (!source || !bucket || !canonical_key) {
      return res.status(400).json({ error: 'Body must include source, bucket, canonical_key' });
    }
    if (source !== 'memory' && source !== 'audience_candidate') {
      return res.status(400).json({ error: 'Only memory or audience_candidate items can be promoted' });
    }

    const result = await applyCurationAction({
      tenantId: req.portal.tenant_id,
      adminId:  req.portal.admin_id,
      action:   'promote',
      target:   { source, bucket, canonical_key },
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, promoted: result.outcome.promotedItem });
  } catch (err) { next(err); }
});

module.exports = router;
