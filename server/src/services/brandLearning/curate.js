/**
 * SHENMAY AI — Brand Learning · Owner Curation Helpers
 *
 * Pure-function helpers for the curation routes that let an owner:
 *   - delete a learned fact from brand_soul or audience_profile
 *   - delete a pending candidate from brand_memory
 *   - manually promote a pending candidate to brand_soul / audience_profile
 *
 * Pure: take current artifacts + a target, return new artifacts + a
 * `removed` / `promoted` flag + the affected item (for audit logging).
 * No DB access, no side effects, no encryption. The route file wraps these
 * with load + persist + incident-log.
 *
 * Bucket vocabulary:
 *
 *   "soul"               brand_soul.faqs / processes / voice_cues          (objects, canonical_key)
 *   "memory"             brand_memory.candidate_(faqs|processes|voice_cues) (objects, canonical_key)
 *   "audience_profile"   audience_profile.common_(pain_points|objections|request_types) (RAW STRINGS)
 *   "audience_candidate" brand_memory.candidate_audience.common_*           (objects, canonical_key)
 *
 * The asymmetry (raw strings vs objects) is inherited from migration 040 —
 * audience_profile is the user-visible aggregate, intentionally simpler.
 * We compare via canonicalKey(value) for the raw-string case.
 */

'use strict';

const { canonicalKey } = require('./promote');

// Per-source bucket whitelist — protects against route consumers passing
// arbitrary string keys, and gives a single source of truth for the
// allowed shape of curation calls.
const SOURCES = {
  soul: {
    buckets: ['faqs', 'processes', 'voice_cues'],
    promotable: false,
  },
  memory: {
    buckets: ['candidate_faqs', 'candidate_processes', 'candidate_voice_cues'],
    promotable: true,
    // Map memory bucket → corresponding soul bucket the item promotes into.
    promotionTarget: {
      candidate_faqs:        { sourceBag: 'soul', sourceBucket: 'faqs',       shape: 'faq'   },
      candidate_processes:   { sourceBag: 'soul', sourceBucket: 'processes',  shape: 'proc'  },
      candidate_voice_cues:  { sourceBag: 'soul', sourceBucket: 'voice_cues', shape: 'voice' },
    },
  },
  audience_profile: {
    buckets: ['common_pain_points', 'common_objections', 'common_request_types'],
    promotable: false,
    rawStrings: true,
  },
  audience_candidate: {
    buckets: ['common_pain_points', 'common_objections', 'common_request_types'],
    promotable: true,
    promotionTarget: {
      common_pain_points:   { sourceBag: 'audience_profile', sourceBucket: 'common_pain_points',   shape: 'audience' },
      common_objections:    { sourceBag: 'audience_profile', sourceBucket: 'common_objections',    shape: 'audience' },
      common_request_types: { sourceBag: 'audience_profile', sourceBucket: 'common_request_types', shape: 'audience' },
    },
  },
};

/**
 * Validate the (source, bucket) pair is in our whitelist. Returns the
 * descriptor or throws a descriptive Error the route handler can turn into
 * a 400 response.
 */
function validateTarget(source, bucket) {
  const desc = SOURCES[source];
  if (!desc) throw new Error(`Unknown source "${source}"`);
  if (!desc.buckets.includes(bucket)) throw new Error(`Unknown bucket "${bucket}" for source "${source}"`);
  return desc;
}

/**
 * Locate the bucket's array on `state` (the {soul, memory, audience} bundle).
 * Returns null + the parent (so callers can write back) without throwing.
 */
function locateArray(state, source, bucket) {
  if (source === 'soul') {
    const arr = state.soul && Array.isArray(state.soul[bucket]) ? state.soul[bucket] : null;
    return { parent: state.soul, key: bucket, arr };
  }
  if (source === 'memory') {
    const arr = state.memory && Array.isArray(state.memory[bucket]) ? state.memory[bucket] : null;
    return { parent: state.memory, key: bucket, arr };
  }
  if (source === 'audience_profile') {
    const arr = state.audience && Array.isArray(state.audience[bucket]) ? state.audience[bucket] : null;
    return { parent: state.audience, key: bucket, arr };
  }
  if (source === 'audience_candidate') {
    const ac = state.memory && state.memory.candidate_audience;
    const arr = ac && Array.isArray(ac[bucket]) ? ac[bucket] : null;
    return { parent: ac || null, key: bucket, arr };
  }
  return { parent: null, key: null, arr: null };
}

/**
 * Delete the first item matching `canonical_key` from the target bucket.
 *
 * @param {object} state                          { soul, memory, audience } — mutated
 * @param {object} target                         { source, bucket, canonical_key }
 * @returns {{ removed: boolean, removedItem: object|string|null }}
 */
function deleteItem(state, target) {
  const desc = validateTarget(target.source, target.bucket);
  const { parent, key, arr } = locateArray(state, target.source, target.bucket);
  if (!arr || !parent) return { removed: false, removedItem: null };

  const want = String(target.canonical_key || '').trim();
  if (!want) return { removed: false, removedItem: null };

  let idx = -1;
  if (desc.rawStrings) {
    // audience_profile holds raw user-facing strings (no stored canonical_key).
    // Canonicalize BOTH sides so the caller can pass either a raw value or a
    // pre-canonicalized form — easier for clients that just have the display
    // string from the dashboard render.
    const canonWant = canonicalKey(want);
    for (let i = 0; i < arr.length; i++) {
      if (canonicalKey(arr[i]) === canonWant) { idx = i; break; }
    }
  } else {
    idx = arr.findIndex(e => e && e.canonical_key === want);
  }

  if (idx === -1) return { removed: false, removedItem: null };
  const removedItem = arr[idx];
  parent[key] = arr.slice(0, idx).concat(arr.slice(idx + 1));
  return { removed: true, removedItem };
}

/**
 * Manually promote a candidate from a "memory" or "audience_candidate"
 * source into its corresponding promoted bag (brand_soul or audience_profile).
 *
 * @param {object} state                          { soul, memory, audience } — mutated
 * @param {object} target                         { source, bucket, canonical_key }
 * @returns {{ promoted: boolean, promotedItem: object|string|null }}
 */
function promoteItem(state, target) {
  const desc = validateTarget(target.source, target.bucket);
  if (!desc.promotable) {
    throw new Error(`Items in source "${target.source}" are already promoted`);
  }

  const { parent, key, arr } = locateArray(state, target.source, target.bucket);
  if (!arr || !parent) return { promoted: false, promotedItem: null };

  const want = String(target.canonical_key || '').trim();
  if (!want) return { promoted: false, promotedItem: null };

  const idx = arr.findIndex(e => e && e.canonical_key === want);
  if (idx === -1) return { promoted: false, promotedItem: null };

  const cand = arr[idx];
  const dest = desc.promotionTarget[target.bucket];
  const now = new Date().toISOString();

  // Build the promoted-shape entry per bucket type. Mirrors the shapes
  // `applyAndPromote` produces so downstream consumers see a uniform soul.
  let promotedEntry;
  if (dest.shape === 'faq') {
    promotedEntry = {
      question: cand.question,
      answer:   cand.suggested_answer || '',
      canonical_key: cand.canonical_key,
      session_count: cand.session_count || 0,
      first_seen_at: cand.first_seen_at,
      promoted_at:   now,
      last_seen_at:  now,
      manually_promoted: true,
    };
  } else if (dest.shape === 'proc') {
    promotedEntry = {
      name: cand.name,
      description: cand.description || '',
      canonical_key: cand.canonical_key,
      session_count: cand.session_count || 0,
      first_seen_at: cand.first_seen_at,
      promoted_at:   now,
      last_seen_at:  now,
      manually_promoted: true,
    };
  } else if (dest.shape === 'voice') {
    promotedEntry = {
      cue: cand.cue,
      canonical_key: cand.canonical_key,
      session_count: cand.session_count || 0,
      promoted_at:   now,
      manually_promoted: true,
    };
  } else if (dest.shape === 'audience') {
    // audience_profile holds raw strings.
    promotedEntry = cand.value;
  }

  // Remove from source, push to destination.
  parent[key] = arr.slice(0, idx).concat(arr.slice(idx + 1));

  if (dest.sourceBag === 'soul') {
    state.soul[dest.sourceBucket] = state.soul[dest.sourceBucket] || [];
    state.soul[dest.sourceBucket].push(promotedEntry);
  } else if (dest.sourceBag === 'audience_profile') {
    state.audience[dest.sourceBucket] = state.audience[dest.sourceBucket] || [];
    state.audience[dest.sourceBucket].push(promotedEntry);
  }

  return { promoted: true, promotedItem: promotedEntry };
}

module.exports = {
  deleteItem,
  promoteItem,
  SOURCES,
  // Helpers exposed for tests
  validateTarget,
  locateArray,
};
