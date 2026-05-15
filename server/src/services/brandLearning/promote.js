/**
 * SHENMAY AI — Brand Learning · Frequency Promotion
 *
 * Layer 4 of the PII defense (see scope §5): even after the regex scrub +
 * LLM anti-extraction prompt + outbound audit, a *single* visitor's
 * accidental data leak shouldn't, by itself, push anything durable into
 * the brand. We require N≥threshold distinct sessions to surface the same
 * observation before it promotes from `brand_memory` into `brand_soul`.
 *
 * Deduplication has two layers:
 *   1. Exact-match fast path: lowercase + strip punctuation + collapse
 *      whitespace, then byte-equality on the canonical key.
 *   2. Fuzzy fallback: when no exact match, compute Szymkiewicz–Simpson
 *      overlap on stopword-stripped content tokens. Two candidates merge
 *      when overlap ≥ FUZZY_THRESHOLD AND both sides have ≥ FUZZY_MIN_TOKENS
 *      content tokens (so 1–2 word stubs only match exactly).
 *
 * The fuzzy layer exists because Haiku rephrases the same concept across
 * cycles ("pricing transparency" vs "is pricing transparent" vs "why is
 * pricing confusing"). Without it, every cycle creates a parallel
 * candidate row and nothing ever crosses the promotion threshold — the
 * v3.5.2 prod canary confirmed this failure mode for everything except
 * stable-phrasing FAQs.
 *
 * Within a single cycle we also track touched canonical_keys per bucket
 * so multiple paraphrases emitted by the LLM in the same call only
 * increment session_count by 1 total — preserving the design intent
 * that "one cycle = one repetition signal".
 *
 * Phase 3 (v3.5.6) adds an embedding-based semantic-dedup pre-pass in
 * worker.js that rewrites candidate text to match semantically-similar
 * existing entries before this file's exact-match fast path runs — so
 * the token-overlap heuristic below remains the fallback layer for
 * tenants without an embedding-capable provider key.
 */

'use strict';

// ── Fuzzy-match tuning ─────────────────────────────────────────────────
//
// FUZZY_THRESHOLD: Szymkiewicz–Simpson overlap coefficient required to treat
// two canonical keys as the same observation. 0.6 means the shorter set must
// share ≥60% of its content tokens with the longer set. Empirically picked
// against the v3.5.2 canary's actual variant pairs:
//   "pricing transparency"           ↔ "is pricing transparent" → 1.00
//   "why is pricing confusing"       ↔ "is pricing transparent" → 0.50 (no merge)
//   "what are your business hours"   ↔ "your hours of operation" → 0.67
// Lower → more aggressive merging, more false positives. Higher → more
// duplicate candidates, slower promotion. Tune via canary in prod.
const FUZZY_THRESHOLD = 0.6;

// FUZZY_MIN_TOKENS: minimum content tokens (after stopword removal) on BOTH
// sides for fuzzy matching to even be attempted. Short canonical keys like
// "do you ship" → {ship} are too sparse for overlap to be meaningful, so
// they only match via exact equality.
const FUZZY_MIN_TOKENS = 2;

// Small conservative stopword list. Intentionally narrow — we only strip
// words that carry no topic signal in customer-AI exchanges. Topic-bearing
// words (pricing, hours, refund, shipping, order, account) stay even when
// common, because they're the signal that makes paraphrases match.
const STOPWORDS = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'if', 'so', 'as', 'than', 'then',
  'of', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with', 'about',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'done', 'have', 'has', 'had',
  'i', 'me', 'my', 'mine',
  'you', 'your', 'yours',
  'we', 'us', 'our', 'ours',
  'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'it', 'its',
  'can', 'could', 'should', 'would', 'will', 'may', 'might', 'must',
  'what', 'when', 'where', 'why', 'how', 'who', 'which',
  'not', 'no',
  's', 't', 're', 've', 'll', 'd', 'm',
]);

/**
 * Split a canonical key into its content-bearing tokens. Input is assumed
 * pre-normalized via `canonicalKey()` (lowercased, punctuation stripped,
 * whitespace collapsed) — see that function's contract below.
 *
 * @param {string} key
 * @returns {Set<string>}
 */
function tokenizeForSimilarity(key) {
  if (!key || typeof key !== 'string') return new Set();
  const out = new Set();
  for (const tok of key.split(/\s+/)) {
    if (!tok) continue;
    if (tok.length < 2) continue;      // single letters (a, b) carry no signal
    if (STOPWORDS.has(tok)) continue;
    out.add(tok);
  }
  return out;
}

/**
 * Szymkiewicz–Simpson overlap coefficient: |A ∩ B| / min(|A|, |B|).
 * Returns 0 when either set is empty. Symmetric, between 0 and 1.
 */
function overlapScore(setA, setB) {
  if (!setA || !setB) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

/**
 * Find an entry in `entries` that matches `newKey` either exactly or — when
 * no exact match — fuzzily via stopword-stripped token overlap.
 *
 * Exact match is the fast path and runs first. Fuzzy match is the fallback,
 * gated on FUZZY_MIN_TOKENS to keep short keys exact-only.
 *
 * Returns the entry object (which the caller mutates in place to bump
 * session_count etc.), or null if nothing matched.
 *
 * Exposed for unit tests.
 */
function findSimilarEntry(newKey, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  if (!newKey) return null;

  // Exact match — fast path, preserves prior behavior byte-for-byte.
  for (const e of entries) {
    if (e && e.canonical_key === newKey) return e;
  }

  // Fuzzy fallback. Require enough content tokens on the new side to make
  // the overlap meaningful; if too sparse, only exact matching applies.
  const newTokens = tokenizeForSimilarity(newKey);
  if (newTokens.size < FUZZY_MIN_TOKENS) return null;

  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    if (!e || typeof e.canonical_key !== 'string') continue;
    const eTokens = tokenizeForSimilarity(e.canonical_key);
    if (eTokens.size < FUZZY_MIN_TOKENS) continue;
    const score = overlapScore(newTokens, eTokens);
    if (score >= FUZZY_THRESHOLD && score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

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

  // Per-bucket "touched this cycle" tracker. When the LLM emits multiple
  // paraphrases of the same concept in one cycle, fuzzy match steers them
  // all to the same existing entry — but we only want session_count to
  // increment by `thisBatchSessions` once per cycle, not per paraphrase.
  const touchedFaqs = new Set();
  const touchedProcesses = new Set();
  const touchedVoiceCues = new Set();
  const touchedAudience = {
    common_pain_points:   new Set(),
    common_objections:    new Set(),
    common_request_types: new Set(),
  };

  // ── FAQs ───────────────────────────────────────────────────────────────
  if (Array.isArray(candidates.faqs)) {
    nextMemory.candidate_faqs = nextMemory.candidate_faqs || [];
    nextSoul.faqs             = nextSoul.faqs             || [];

    for (const cand of candidates.faqs) {
      const key = canonicalKey(cand.question);
      if (!key) continue;

      // If already promoted, just re-increment its session_count (audit only).
      const promoted = findSimilarEntry(key, nextSoul.faqs);
      if (promoted) {
        if (!touchedFaqs.has(promoted.canonical_key)) {
          promoted.session_count = (promoted.session_count || 0) + thisBatchSessions;
          promoted.last_seen_at  = nowIso();
          touchedFaqs.add(promoted.canonical_key);
        }
        continue;
      }

      // Otherwise it lives in brand_memory until it crosses the threshold.
      const existing = findSimilarEntry(key, nextMemory.candidate_faqs);
      if (existing) {
        if (touchedFaqs.has(existing.canonical_key)) {
          // Another paraphrase of this concept already counted in this cycle.
          continue;
        }
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        touchedFaqs.add(existing.canonical_key);
        // Promote if threshold reached
        if (existing.session_count >= minSessions) {
          nextSoul.faqs.push({
            question: existing.question,
            answer:   existing.suggested_answer,
            canonical_key: existing.canonical_key,
            session_count: existing.session_count,
            first_seen_at: existing.first_seen_at,
            promoted_at:   nowIso(),
            last_seen_at:  nowIso(),
          });
          // Remove from candidates list once promoted
          nextMemory.candidate_faqs = nextMemory.candidate_faqs.filter(f => f.canonical_key !== existing.canonical_key);
          promotedCount++;
        } else {
          blockedCount++;
        }
      } else {
        const newEntry = {
          question: cand.question,
          suggested_answer: cand.suggested_answer || '',
          canonical_key: key,
          session_count: thisBatchSessions,
          first_seen_at: nowIso(),
          last_seen_at:  nowIso(),
        };
        nextMemory.candidate_faqs.push(newEntry);
        touchedFaqs.add(key);
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

      const promoted = findSimilarEntry(key, nextSoul.processes);
      if (promoted) {
        if (!touchedProcesses.has(promoted.canonical_key)) {
          promoted.session_count = (promoted.session_count || 0) + thisBatchSessions;
          promoted.last_seen_at  = nowIso();
          touchedProcesses.add(promoted.canonical_key);
        }
        continue;
      }

      const existing = findSimilarEntry(key, nextMemory.candidate_processes);
      if (existing) {
        if (touchedProcesses.has(existing.canonical_key)) continue;
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        touchedProcesses.add(existing.canonical_key);
        if (existing.session_count >= minSessions) {
          nextSoul.processes.push({
            name: existing.name,
            description: existing.description,
            canonical_key: existing.canonical_key,
            session_count: existing.session_count,
            first_seen_at: existing.first_seen_at,
            promoted_at:   nowIso(),
            last_seen_at:  nowIso(),
          });
          nextMemory.candidate_processes = nextMemory.candidate_processes.filter(p => p.canonical_key !== existing.canonical_key);
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
        touchedProcesses.add(key);
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

      // Already promoted — skip silently (matches prior behavior for voice).
      if (findSimilarEntry(key, nextSoul.voice_cues)) continue;

      const existing = findSimilarEntry(key, nextMemory.candidate_voice_cues);
      if (existing) {
        if (touchedVoiceCues.has(existing.canonical_key)) continue;
        existing.session_count = (existing.session_count || 0) + thisBatchSessions;
        existing.last_seen_at  = nowIso();
        touchedVoiceCues.add(existing.canonical_key);
        if (existing.session_count >= minSessions) {
          nextSoul.voice_cues.push({
            cue: existing.cue,
            canonical_key: existing.canonical_key,
            session_count: existing.session_count,
            promoted_at:   nowIso(),
          });
          nextMemory.candidate_voice_cues = nextMemory.candidate_voice_cues.filter(v => v.canonical_key !== existing.canonical_key);
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
        touchedVoiceCues.add(key);
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

      // Synthetic entry list for already-promoted audience items so we can
      // reuse findSimilarEntry. audience_profile stores raw strings (not
      // entry objects), so we wrap them. We maintain this snapshot in sync
      // with nextAudience[profileKey] so freshly-promoted items in this
      // same cycle are also matched (matches prior live-array semantics).
      const promotedAudienceEntries = nextAudience[profileKey].map(v => ({
        canonical_key: canonicalKey(v),
      }));

      const touchedBucket = touchedAudience[candKey];

      for (const item of list) {
        const key = canonicalKey(item);
        if (!key) continue;

        // Already promoted into audience_profile — skip.
        if (findSimilarEntry(key, promotedAudienceEntries)) continue;

        const existing = findSimilarEntry(key, nextMemory.candidate_audience[candKey]);
        if (existing) {
          if (touchedBucket.has(existing.canonical_key)) continue;
          existing.session_count = (existing.session_count || 0) + thisBatchSessions;
          existing.last_seen_at  = nowIso();
          touchedBucket.add(existing.canonical_key);
          if (existing.session_count >= minSessions) {
            nextAudience[profileKey].push(existing.value);
            // Keep snapshot in sync so a later iteration in this cycle that
            // fuzzy-matches the just-promoted item skips it instead of
            // creating a parallel candidate.
            promotedAudienceEntries.push({ canonical_key: existing.canonical_key });
            nextMemory.candidate_audience[candKey] = nextMemory.candidate_audience[candKey].filter(p => p.canonical_key !== existing.canonical_key);
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
          touchedBucket.add(key);
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
  // Exported for unit tests + tuning visibility.
  findSimilarEntry,
  tokenizeForSimilarity,
  overlapScore,
  FUZZY_THRESHOLD,
  FUZZY_MIN_TOKENS,
};
