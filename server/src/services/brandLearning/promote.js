/**
 * SHENMAY AI — Brand Learning · Frequency Promotion
 *
 * Layer 4 of the PII defense (see scope §5): even after the regex scrub +
 * LLM anti-extraction prompt + outbound audit, a *single* visitor's
 * accidental data leak shouldn't, by itself, push anything durable into
 * the brand. We require N≥threshold distinct sessions to surface the same
 * observation before it promotes from `brand_memory` into `brand_soul`.
 *
 * Today's deduplication is intentionally simple: lowercase + strip
 * punctuation + collapse whitespace, then exact-match on the canonical
 * key. Variants that the LLM phrases slightly differently each night
 * will accumulate as separate entries — they'll only promote if the
 * exact phrasing recurs. That's safer than fuzzy matching (which would
 * risk merging unrelated observations). When this becomes a constraint
 * (Phase 3), we'll add semantic dedup via the existing AgentDB HNSW.
 */

'use strict';

/**
 * Apply this cycle's distilled candidates to the existing brand_memory,
 * incrementing session_count for repeats and adding net-new observations.
 * Then promote anything that meets the threshold into brand_soul.
 *
 * @param {object} params
 * @param {object} params.currentSoul         Existing tenants.brand_soul (or empty {}).
 * @param {object} params.currentMemory       Existing tenants.brand_memory (or empty {}).
 * @param {object} params.currentAudience     Existing tenants.audience_profile (or empty {}).
 * @param {object} params.candidates          Output of distill.normalizeObservations().
 * @param {number} params.minSessions         Promotion threshold (tenants.brand_learning_min_sessions).
 * @param {number} params.thisBatchSessions   How many distinct anon sessions fed this batch.
 * @returns {{
 *   nextSoul: object,
 *   nextMemory: object,
 *   nextAudience: object,
 *   promotedCount: number,
 *   blockedCount: number,
 *   addedCandidates: number
 * }}
 */
function applyAndPromote({
  currentSoul = {},
  currentMemory = {},
  currentAudience = {},
  candidates = {},
  minSessions = 3,
  thisBatchSessions = 1,
}) {
  const nextSoul     = cloneOrEmpty(currentSoul);
  const nextMemory   = cloneOrEmpty(currentMemory);
  const nextAudience = cloneOrEmpty(currentAudience);

  let promotedCount = 0;
  let blockedCount  = 0;
  let addedCandidates = 0;

  // ── FAQs ───────────────────────────────────────────────────────────────
  if (Array.isArray(candidates.faqs)) {
    nextMemory.candidate_faqs = nextMemory.candidate_faqs || [];
    nextSoul.faqs             = nextSoul.faqs             || [];

    for (const cand of candidates.faqs) {
      const key = canonicalKey(cand.question);
      if (!key) continue;

      // If already promoted, just re-increment its session_count (audit only).
      const promoted = nextSoul.faqs.find(f => f.canonical_key === key);
      if (promoted) {
        promoted.session_count = (promoted.session_count || 0) + thisBatchSessions;
        promoted.last_seen_at  = nowIso();
        continue;
      }

      // Otherwise it lives in brand_memory until it crosses the threshold.
      const existing = nextMemory.candidate_faqs.find(f => f.canonical_key === key);
      if (existing) {
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        // Promote if threshold reached
        if (existing.session_count >= minSessions) {
          nextSoul.faqs.push({
            question: existing.question,
            answer:   existing.suggested_answer,
            canonical_key: key,
            session_count: existing.session_count,
            first_seen_at: existing.first_seen_at,
            promoted_at:   nowIso(),
            last_seen_at:  nowIso(),
          });
          // Remove from candidates list once promoted
          nextMemory.candidate_faqs = nextMemory.candidate_faqs.filter(f => f.canonical_key !== key);
          promotedCount++;
        } else {
          blockedCount++;
        }
      } else {
        nextMemory.candidate_faqs.push({
          question: cand.question,
          suggested_answer: cand.suggested_answer || '',
          canonical_key: key,
          session_count: thisBatchSessions,
          first_seen_at: nowIso(),
          last_seen_at:  nowIso(),
        });
        addedCandidates++;
        blockedCount++;
      }
    }
  }

  // ── Processes ──────────────────────────────────────────────────────────
  if (Array.isArray(candidates.processes)) {
    nextMemory.candidate_processes = nextMemory.candidate_processes || [];
    nextSoul.processes             = nextSoul.processes             || [];

    for (const cand of candidates.processes) {
      const key = canonicalKey(cand.name);
      if (!key) continue;

      const promoted = nextSoul.processes.find(p => p.canonical_key === key);
      if (promoted) {
        promoted.session_count = (promoted.session_count || 0) + thisBatchSessions;
        promoted.last_seen_at  = nowIso();
        continue;
      }

      const existing = nextMemory.candidate_processes.find(p => p.canonical_key === key);
      if (existing) {
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        if (existing.session_count >= minSessions) {
          nextSoul.processes.push({
            name: existing.name,
            description: existing.description,
            canonical_key: key,
            session_count: existing.session_count,
            first_seen_at: existing.first_seen_at,
            promoted_at:   nowIso(),
            last_seen_at:  nowIso(),
          });
          nextMemory.candidate_processes = nextMemory.candidate_processes.filter(p => p.canonical_key !== key);
          promotedCount++;
        } else {
          blockedCount++;
        }
      } else {
        nextMemory.candidate_processes.push({
          name: cand.name,
          description: cand.description || '',
          canonical_key: key,
          session_count: thisBatchSessions,
          first_seen_at: nowIso(),
          last_seen_at:  nowIso(),
        });
        addedCandidates++;
        blockedCount++;
      }
    }
  }

  // ── Voice cues — these go DIRECTLY into brand_soul.voice_cues with a
  //    session_count of their own. Voice is fuzzier and we want it to
  //    blend; the threshold gate still applies.
  if (Array.isArray(candidates.voice_cues)) {
    nextMemory.candidate_voice_cues = nextMemory.candidate_voice_cues || [];
    nextSoul.voice_cues             = nextSoul.voice_cues             || [];

    for (const cue of candidates.voice_cues) {
      const key = canonicalKey(cue);
      if (!key) continue;

      if (nextSoul.voice_cues.some(v => v.canonical_key === key)) continue;

      const existing = nextMemory.candidate_voice_cues.find(v => v.canonical_key === key);
      if (existing) {
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        if (existing.session_count >= minSessions) {
          nextSoul.voice_cues.push({
            cue: existing.cue,
            canonical_key: key,
            session_count: existing.session_count,
            promoted_at:   nowIso(),
          });
          nextMemory.candidate_voice_cues = nextMemory.candidate_voice_cues.filter(v => v.canonical_key !== key);
          promotedCount++;
        } else {
          blockedCount++;
        }
      } else {
        nextMemory.candidate_voice_cues.push({
          cue,
          canonical_key: key,
          session_count: thisBatchSessions,
          first_seen_at: nowIso(),
          last_seen_at:  nowIso(),
        });
        addedCandidates++;
        blockedCount++;
      }
    }
  }

  // ── Audience cues — these update audience_profile DIRECTLY (no separate
  //    soul/memory split — audience_profile IS the working aggregate). We
  //    still apply the frequency gate per item by tracking pending items
  //    in brand_memory.candidate_audience.
  if (candidates.audience_cues && typeof candidates.audience_cues === 'object') {
    nextMemory.candidate_audience = nextMemory.candidate_audience || {};
    nextAudience.common_pain_points  = nextAudience.common_pain_points  || [];
    nextAudience.common_objections   = nextAudience.common_objections   || [];
    nextAudience.common_request_types = nextAudience.common_request_types || [];

    const subBuckets = [
      ['common_pain_points',   'common_pain_points'],
      ['common_objections',    'common_objections'],
      ['common_request_types', 'common_request_types'],
    ];

    for (const [candKey, profileKey] of subBuckets) {
      const list = candidates.audience_cues[candKey];
      if (!Array.isArray(list)) continue;

      nextMemory.candidate_audience[candKey] = nextMemory.candidate_audience[candKey] || [];

      for (const item of list) {
        const key = canonicalKey(item);
        if (!key) continue;

        if (nextAudience[profileKey].some(p => canonicalKey(p) === key)) continue;

        const existing = nextMemory.candidate_audience[candKey].find(p => p.canonical_key === key);
        if (existing) {
          existing.session_count = (existing.session_count || 0) + thisBatchSessions;
          existing.last_seen_at  = nowIso();
          if (existing.session_count >= minSessions) {
            nextAudience[profileKey].push(existing.value);
            nextMemory.candidate_audience[candKey] = nextMemory.candidate_audience[candKey].filter(p => p.canonical_key !== key);
            promotedCount++;
          } else {
            blockedCount++;
          }
        } else {
          nextMemory.candidate_audience[candKey].push({
            value: item,
            canonical_key: key,
            session_count: thisBatchSessions,
            first_seen_at: nowIso(),
            last_seen_at:  nowIso(),
          });
          addedCandidates++;
          blockedCount++;
        }
      }
    }
  }

  // ── Cap brand_memory size — drop oldest unpromoted candidates above cap.
  capCandidates(nextMemory, 'candidate_faqs', 200);
  capCandidates(nextMemory, 'candidate_processes', 100);
  capCandidates(nextMemory, 'candidate_voice_cues', 100);
  if (nextMemory.candidate_audience) {
    capCandidates(nextMemory.candidate_audience, 'common_pain_points', 100);
    capCandidates(nextMemory.candidate_audience, 'common_objections', 100);
    capCandidates(nextMemory.candidate_audience, 'common_request_types', 100);
  }

  return {
    nextSoul,
    nextMemory,
    nextAudience,
    promotedCount,
    blockedCount,
    addedCandidates,
  };
}

/**
 * Canonical key for dedup: lowercase, collapse whitespace, drop most
 * punctuation. Intentionally simple — see module header for tradeoffs.
 */
function canonicalKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Defensive deep-clone via JSON. Brand artifacts are JSONB and known to
 * be small (<30KB total), so the cost is negligible and the safety
 * (no aliasing into the caller's state) is worth it.
 */
function cloneOrEmpty(obj) {
  if (!obj || typeof obj !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return {};
  }
}

/**
 * Drop oldest entries above a soft cap, sorting by last_seen_at desc.
 * Mutates in place. Skips silently if the bucket doesn't exist.
 */
function capCandidates(container, key, max) {
  const list = container && container[key];
  if (!Array.isArray(list) || list.length <= max) return;
  list.sort((a, b) => {
    const aDate = (a && a.last_seen_at) || '';
    const bDate = (b && b.last_seen_at) || '';
    return bDate.localeCompare(aDate);
  });
  container[key] = list.slice(0, max);
}

module.exports = {
  applyAndPromote,
  canonicalKey,
};
