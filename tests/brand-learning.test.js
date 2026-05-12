/**
 * SHENMAY AI — Brand Learning Unit Tests
 *
 * Pure-JS unit tests — no DB, no server, no network. Runs in ~50ms.
 *
 * Coverage:
 *   - scrub.js: regex detectors strip PII before distillation
 *   - scrub.js: replacement count + types reflect what was found
 *   - promote.js: N-1 distinct sessions does NOT promote
 *   - promote.js: N distinct sessions DOES promote
 *   - promote.js: cross-tenant data is impossible (helper purity)
 *   - promote.js: candidates list size is capped
 *   - distill.js: normalizeObservations drops bad shapes safely
 *   - render.js: empty brand_soul renders empty
 *   - render.js: populated brand_soul renders a usable text block
 *   - PII fuzz: 100 synthetic conversations with diverse PII shapes do not
 *     leak through quickScanForResidualPii once scrubbed
 *
 * Run:  node tests/brand-learning.test.js
 */

'use strict';

const {
  scrubMessagesForDistillation,
  quickScanForResidualPii,
} = require('../server/src/services/brandLearning/scrub');

const {
  applyAndPromote,
  canonicalKey,
  findSimilarEntry,
  tokenizeForSimilarity,
  overlapScore,
  FUZZY_THRESHOLD,
} = require('../server/src/services/brandLearning/promote');

const {
  normalizeObservations,
} = require('../server/src/services/brandLearning/distill');

const {
  renderBrandSoulForPrompt,
} = require('../server/src/services/brandLearning/render');

// ── Test runner (matches existing tests/tokenizer.test.js style) ─────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message || err}`);
    failed++;
    failures.push({ name, message: err.message || String(err) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message || 'Values differ'}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);
}
function assertNotContains(hay, needle, message) {
  if (String(hay).includes(needle)) throw new Error(`${message || 'Contains forbidden value'}: "${hay}" should NOT include "${needle}"`);
}
function assertContains(hay, needle, message) {
  if (!String(hay).includes(needle)) throw new Error(`${message || 'Does not contain'}: expected "${hay}" to include "${needle}"`);
}

console.log('\n== Brand Learning Unit Tests ==\n');

// ═══════════════════════════════════════════════════════════════════════════
// 1. scrub.js — PII pre-distillation pass
// ═══════════════════════════════════════════════════════════════════════════

console.log('Scrub');

test('email is replaced by [EMAIL_n] token', () => {
  const messages = [
    { role: 'customer', content: 'My email is jane@example.com' },
    { role: 'agent',    content: 'Got it!' },
  ];
  const { scrubbedText, replacementCount } = scrubMessagesForDistillation(messages);
  assertNotContains(scrubbedText, 'jane@example.com');
  assertContains(scrubbedText, '[EMAIL_');
  assert(replacementCount >= 1, 'expected at least one replacement');
});

test('phone number is replaced', () => {
  const messages = [{ role: 'customer', content: 'Call me at 555-123-4567' }];
  const { scrubbedText } = scrubMessagesForDistillation(messages);
  assertNotContains(scrubbedText, '555-123-4567');
  assertContains(scrubbedText, '[PHONE_');
});

test('SSN is replaced', () => {
  const messages = [{ role: 'customer', content: 'My SSN is 555-12-3456 if it helps' }];
  const { scrubbedText } = scrubMessagesForDistillation(messages);
  assertNotContains(scrubbedText, '555-12-3456');
  assertContains(scrubbedText, '[SSN_');
});

test('multiple distinct emails get distinct tokens', () => {
  const messages = [
    { role: 'customer', content: 'I am alice@test.com' },
    { role: 'customer', content: 'My friend is bob@test.com' },
  ];
  const { scrubbedText, replacementsByType } = scrubMessagesForDistillation(messages);
  assertNotContains(scrubbedText, 'alice@test.com');
  assertNotContains(scrubbedText, 'bob@test.com');
  assert(replacementsByType.EMAIL >= 2, 'expected EMAIL count >= 2');
});

test('same email used twice yields same token', () => {
  const messages = [
    { role: 'customer', content: 'I am jane@example.com' },
    { role: 'customer', content: 'Yeah that jane@example.com one' },
  ];
  const { scrubbedText, replacementsByType } = scrubMessagesForDistillation(messages);
  assertEqual(replacementsByType.EMAIL, 1, 'same email must dedup to one token');
  // Token should appear at least twice in the text
  const matches = scrubbedText.match(/\[EMAIL_1\]/g) || [];
  assert(matches.length >= 2, 'expected the same token to appear in both messages');
});

test('empty messages array returns empty result', () => {
  const { scrubbedText, replacementCount } = scrubMessagesForDistillation([]);
  assertEqual(scrubbedText, '');
  assertEqual(replacementCount, 0);
});

test('messages with non-string content are skipped silently', () => {
  const messages = [
    { role: 'customer', content: null },
    { role: 'customer', content: 'Hello' },
    { role: 'customer', content: 42 },
  ];
  const { scrubbedText } = scrubMessagesForDistillation(messages);
  assertContains(scrubbedText, 'Hello');
});

test('quickScanForResidualPii returns [] on clean text', () => {
  const findings = quickScanForResidualPii('What is your return policy?');
  assertEqual(findings.length, 0);
});

test('quickScanForResidualPii catches an unscrubbed email', () => {
  const findings = quickScanForResidualPii('My email is sneaky@example.com');
  assert(findings.length > 0, 'expected at least one finding');
  assertContains(findings.join(','), 'EMAIL');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. promote.js — frequency-threshold promotion
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nPromote');

test('canonicalKey is whitespace and case insensitive', () => {
  assertEqual(canonicalKey('  Do You Ship?'), 'do you ship');
  assertEqual(canonicalKey('Do you ship'), 'do you ship');
  assertEqual(canonicalKey('do  you   ship'), 'do you ship');
});

test('canonicalKey strips punctuation', () => {
  assertEqual(canonicalKey("What's your return policy?!"), 'what s your return policy');
});

test('first observation accumulates in brand_memory but does NOT promote', () => {
  const result = applyAndPromote({
    currentSoul: {},
    currentMemory: {},
    currentAudience: {},
    candidates: {
      faqs: [{ question: 'Do you ship to Canada?', suggested_answer: 'Yes', frequency_signal: '1x' }],
    },
    minSessions: 3,
    thisBatchSessions: 1,
  });
  assertEqual(result.promotedCount, 0);
  assertEqual(result.addedCandidates, 1);
  assert(Array.isArray(result.nextMemory.candidate_faqs), 'candidate_faqs should be an array');
  assertEqual(result.nextMemory.candidate_faqs.length, 1);
  assert(!Array.isArray(result.nextSoul.faqs) || result.nextSoul.faqs.length === 0, 'nothing in soul yet');
});

test('threshold reached promotes candidate to brand_soul', () => {
  // Simulate three nightly cycles seeing the same question
  let soul = {};
  let memory = {};
  let audience = {};

  for (let i = 0; i < 3; i++) {
    const r = applyAndPromote({
      currentSoul: soul,
      currentMemory: memory,
      currentAudience: audience,
      candidates: {
        faqs: [{ question: 'What is your refund window?', suggested_answer: '30 days', frequency_signal: '1x' }],
      },
      minSessions: 3,
      thisBatchSessions: 1,
    });
    soul = r.nextSoul;
    memory = r.nextMemory;
    audience = r.nextAudience;
  }

  assert(Array.isArray(soul.faqs), 'soul.faqs should exist');
  assertEqual(soul.faqs.length, 1, 'should have promoted exactly one FAQ');
  assertEqual(soul.faqs[0].session_count, 3);
  assertContains(soul.faqs[0].question, 'refund window');
  // Candidate is removed from memory once promoted
  assert(
    !Array.isArray(memory.candidate_faqs) || memory.candidate_faqs.length === 0,
    'candidate should be cleared from memory after promotion',
  );
});

test('different N=2 threshold means promotion at second sighting', () => {
  let soul = {};
  let memory = {};
  let audience = {};

  for (let i = 0; i < 2; i++) {
    const r = applyAndPromote({
      currentSoul: soul,
      currentMemory: memory,
      currentAudience: audience,
      candidates: { faqs: [{ question: 'How long is shipping?', suggested_answer: '5-7 days' }] },
      minSessions: 2,
      thisBatchSessions: 1,
    });
    soul = r.nextSoul;
    memory = r.nextMemory;
    audience = r.nextAudience;
  }

  assertEqual((soul.faqs || []).length, 1, 'should promote at N=2');
});

test('processes follow the same threshold rule', () => {
  let soul = {};
  let memory = {};
  let audience = {};

  for (let i = 0; i < 3; i++) {
    const r = applyAndPromote({
      currentSoul: soul,
      currentMemory: memory,
      currentAudience: audience,
      candidates: {
        processes: [{ name: 'Reset password', description: 'Click forgot password, enter email' }],
      },
      minSessions: 3,
      thisBatchSessions: 1,
    });
    soul = r.nextSoul;
    memory = r.nextMemory;
    audience = r.nextAudience;
  }

  assertEqual((soul.processes || []).length, 1);
});

test('audience cues promote into audience_profile after threshold', () => {
  let soul = {};
  let memory = {};
  let audience = {};

  for (let i = 0; i < 3; i++) {
    const r = applyAndPromote({
      currentSoul: soul,
      currentMemory: memory,
      currentAudience: audience,
      candidates: {
        audience_cues: { common_pain_points: ['pricing transparency'] },
      },
      minSessions: 3,
      thisBatchSessions: 1,
    });
    soul = r.nextSoul;
    memory = r.nextMemory;
    audience = r.nextAudience;
  }

  assertEqual((audience.common_pain_points || []).length, 1);
  assertEqual(audience.common_pain_points[0], 'pricing transparency');
});

test('helper does not mutate inputs (purity)', () => {
  const inputSoul = { faqs: [] };
  const inputMemory = {};
  const inputAudience = {};

  applyAndPromote({
    currentSoul: inputSoul,
    currentMemory: inputMemory,
    currentAudience: inputAudience,
    candidates: { faqs: [{ question: 'test', suggested_answer: '' }] },
    minSessions: 3,
    thisBatchSessions: 1,
  });

  // Original inputs untouched
  assertEqual(inputSoul.faqs.length, 0);
  assertEqual(Object.keys(inputMemory).length, 0);
  assertEqual(Object.keys(inputAudience).length, 0);
});

// ── Fuzzy-match helpers (Phase 1.5 — semantic dedup heuristic) ──────────

test('tokenizeForSimilarity strips stopwords and short words', () => {
  const tokens = tokenizeForSimilarity('why is the pricing transparent on your website');
  assert(!tokens.has('why'), 'should drop "why"');
  assert(!tokens.has('is'), 'should drop "is"');
  assert(!tokens.has('the'), 'should drop "the"');
  assert(!tokens.has('on'), 'should drop "on"');
  assert(tokens.has('pricing'), 'should keep content word "pricing"');
  assert(tokens.has('transparent'), 'should keep "transparent"');
  assert(tokens.has('website'), 'should keep "website"');
});

test('tokenizeForSimilarity handles empty / non-string input', () => {
  assertEqual(tokenizeForSimilarity(null).size, 0);
  assertEqual(tokenizeForSimilarity('').size, 0);
  assertEqual(tokenizeForSimilarity(undefined).size, 0);
});

test('overlapScore is symmetric and bounded 0..1', () => {
  const a = new Set(['pricing', 'transparency']);
  const b = new Set(['pricing', 'clarity', 'website']);
  const s1 = overlapScore(a, b);
  const s2 = overlapScore(b, a);
  assertEqual(s1, s2);
  assert(s1 >= 0 && s1 <= 1, `expected 0..1, got ${s1}`);
});

test('overlapScore returns 0 for empty or missing sets', () => {
  assertEqual(overlapScore(new Set(), new Set(['a'])), 0);
  assertEqual(overlapScore(new Set(['a']), new Set()), 0);
  assertEqual(overlapScore(null, new Set(['a'])), 0);
});

test('findSimilarEntry returns null on empty list', () => {
  assertEqual(findSimilarEntry('anything', []), null);
  assertEqual(findSimilarEntry('anything', null), null);
});

test('findSimilarEntry returns exact match (fast path)', () => {
  const entries = [
    { canonical_key: 'how do i place an order', session_count: 1 },
    { canonical_key: 'what are your hours',     session_count: 2 },
  ];
  const hit = findSimilarEntry('what are your hours', entries);
  assert(hit, 'expected a match');
  assertEqual(hit.canonical_key, 'what are your hours');
});

test('findSimilarEntry returns fuzzy match above threshold (paraphrase)', () => {
  // The exact failure case from the v3.5.2 prod canary.
  const entries = [
    { canonical_key: 'why is pricing confusing or unclear' },
  ];
  // New key: same concept, different LLM phrasing.
  const hit = findSimilarEntry('why is your pricing unclear can you make pricing more transparent', entries);
  assert(hit, 'expected a fuzzy match for paraphrased pricing question');
  assertEqual(hit.canonical_key, 'why is pricing confusing or unclear');
});

test('findSimilarEntry does NOT match unrelated keys', () => {
  const entries = [
    { canonical_key: 'how do i place an order' },
  ];
  const hit = findSimilarEntry('what are your business hours', entries);
  assertEqual(hit, null, 'unrelated questions must not merge');
});

test('findSimilarEntry refuses fuzzy when either side has < 2 content tokens', () => {
  // Short side: "do you ship?" → {ship} after stopwords (1 token)
  const entries = [
    { canonical_key: 'do you ship' },  // {ship} — 1 content token
  ];
  // Even an overlapping short key should NOT fuzzy match (only exact).
  const hit = findSimilarEntry('can i ship', entries);
  assertEqual(hit, null, 'short keys must require exact match');
});

test('findSimilarEntry threshold is set defensively (not over-aggressive)', () => {
  // Sanity check on the public threshold const — guards against accidental
  // changes that would over-merge unrelated topics.
  assert(FUZZY_THRESHOLD >= 0.5, `FUZZY_THRESHOLD ${FUZZY_THRESHOLD} would over-merge`);
  assert(FUZZY_THRESHOLD <= 0.8, `FUZZY_THRESHOLD ${FUZZY_THRESHOLD} would under-merge`);
});

// ── Integration with applyAndPromote — paraphrase promotion ───────────

test('paraphrased FAQs across 3 cycles DO promote (canary failure mode fix)', () => {
  // Three cycles, each with a different LLM phrasing of the same concept.
  // Each later phrasing must overlap with the STORED canonical key (cycle 1's
  // wording) — token-overlap match is anchored on the first-seen entry, not
  // transitively across paraphrases. See LIMITATION test below.
  //
  // Pre-fuzzy-match, each cycle would create a parallel candidate row at
  // session_count=1 and nothing promoted. Post-fix, all three funnel into
  // the same memory entry and promote on cycle 3.
  const phrasings = [
    { question: 'Why is your pricing unclear on the site?',         suggested_answer: 'A1' },
    { question: 'The pricing on your site is unclear',              suggested_answer: 'A2' },
    { question: 'Pricing is confusing and unclear on the site',     suggested_answer: 'A3' },
  ];

  let soul = {}, memory = {}, audience = {};
  for (const p of phrasings) {
    const r = applyAndPromote({
      currentSoul: soul,
      currentMemory: memory,
      currentAudience: audience,
      candidates: { faqs: [p] },
      minSessions: 3,
      thisBatchSessions: 1,
    });
    soul = r.nextSoul; memory = r.nextMemory; audience = r.nextAudience;
  }

  assert(Array.isArray(soul.faqs) && soul.faqs.length === 1, `expected 1 promoted FAQ, got ${soul.faqs?.length || 0}`);
  assertEqual(soul.faqs[0].session_count, 3);
  // The promoted entry retains the FIRST cycle's question text (anchor wording).
  assertContains(soul.faqs[0].question.toLowerCase(), 'pricing');
});

test('LIMITATION: fuzzy match is anchored on first-seen, not transitive across cycles', () => {
  // Documents a known limitation of the Phase 1.5 heuristic — fixed in
  // Phase 3 (HNSW semantic dedup). If cycle 2 matches cycle 1, and cycle 3
  // matches cycle 2 but NOT cycle 1's stored key, cycle 3 creates a parallel
  // candidate. This test pins the current behavior so a future fix is a
  // deliberate change, not an accidental regression.
  const phrasings = [
    { question: 'Why is pricing confusing or unclear?',                            suggested_answer: 'A1' },
    { question: 'Why is your pricing unclear, can you make pricing transparent?', suggested_answer: 'A2' },
    { question: 'Is pricing transparent and clearly displayed?',                   suggested_answer: 'A3' },
  ];
  let soul = {}, memory = {}, audience = {};
  for (const p of phrasings) {
    const r = applyAndPromote({
      currentSoul: soul, currentMemory: memory, currentAudience: audience,
      candidates: { faqs: [p] }, minSessions: 3, thisBatchSessions: 1,
    });
    soul = r.nextSoul; memory = r.nextMemory; audience = r.nextAudience;
  }
  // Cycle 3 ("transparent...displayed") doesn't share enough tokens with
  // cycle 1's anchor ("confusing or unclear"), so it stays separate.
  // Nothing promotes; we end with 2 candidate entries.
  assertEqual((soul.faqs || []).length, 0, 'transitive linking is not supported in v1');
  assertEqual(memory.candidate_faqs.length, 2, 'expected 2 anchors (cycle 1+2 merged, cycle 3 separate)');
});

test('multiple paraphrases WITHIN one cycle do NOT double-count session_count', () => {
  // LLM emits 3 paraphrases of the same concept in a single cycle. They
  // should funnel into one candidate at session_count=1, not 3.
  const r = applyAndPromote({
    currentSoul: {},
    currentMemory: {},
    currentAudience: {},
    candidates: {
      faqs: [
        { question: 'Why is pricing unclear on the site?',           suggested_answer: 'A' },
        { question: 'The pricing on your site is unclear',           suggested_answer: 'B' },
        { question: 'Pricing is confusing and unclear on the site',  suggested_answer: 'C' },
      ],
    },
    minSessions: 3,
    thisBatchSessions: 1,
  });

  // All 3 paraphrases share ≥2 content tokens with the first one, so they
  // funnel into a single candidate.
  assertEqual(
    r.nextMemory.candidate_faqs.length, 1,
    `expected exactly 1 candidate after intra-cycle dedup, got ${r.nextMemory.candidate_faqs.length}`,
  );
  // session_count must be 1 (one cycle = one repetition signal), not 3.
  assertEqual(r.nextMemory.candidate_faqs[0].session_count, 1, 'within-cycle dedup must not double-count');
});

test('unrelated FAQs stay separate (no false-positive merge)', () => {
  const r = applyAndPromote({
    currentSoul: {},
    currentMemory: {},
    currentAudience: {},
    candidates: {
      faqs: [
        { question: 'What are your hours of operation?',  suggested_answer: 'Mon-Fri 9-5' },
        { question: 'How do I cancel my subscription?',   suggested_answer: 'Email support' },
        { question: 'Where do you ship internationally?', suggested_answer: 'Worldwide'   },
      ],
    },
    minSessions: 3,
    thisBatchSessions: 1,
  });

  assertEqual(r.nextMemory.candidate_faqs.length, 3, 'three distinct topics must stay separate');
});

test('paraphrase merge works for processes too', () => {
  // Process names that share ≥2 content tokens with the anchor (cycle 1).
  const phrasings = [
    { name: 'Place an order on the website',     description: 'browse, cart, checkout' },
    { name: 'Place an order via the website',    description: 'visit website, add to cart, pay' },
    { name: 'Order placement on the website',    description: 'go to site, build cart, complete purchase' },
  ];
  let soul = {}, memory = {}, audience = {};
  for (const p of phrasings) {
    const r = applyAndPromote({
      currentSoul: soul, currentMemory: memory, currentAudience: audience,
      candidates: { processes: [p] },
      minSessions: 3, thisBatchSessions: 1,
    });
    soul = r.nextSoul; memory = r.nextMemory; audience = r.nextAudience;
  }
  assertEqual((soul.processes || []).length, 1, 'expected 1 promoted process via fuzzy merge');
});

test('candidates above cap get truncated', () => {
  // 220 distinct candidates; cap is 200
  const faqs = [];
  for (let i = 0; i < 220; i++) {
    faqs.push({ question: `Question number ${i}`, suggested_answer: `Answer ${i}` });
  }
  const r = applyAndPromote({
    currentSoul: {},
    currentMemory: {},
    currentAudience: {},
    candidates: { faqs },
    minSessions: 3,
    thisBatchSessions: 1,
  });
  assert(r.nextMemory.candidate_faqs.length <= 200, `expected ≤200, got ${r.nextMemory.candidate_faqs.length}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. distill.js — normalizeObservations
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nDistill normalize');

test('normalize drops malformed entries', () => {
  const raw = {
    faqs: [
      { question: 'good one', suggested_answer: 'yes' },
      { question: 42 },                                  // bad — non-string
      { suggested_answer: 'orphan' },                    // bad — no question
      'not an object',                                   // bad — not an object
    ],
    unknown_top_level_key: 'should be ignored',
  };
  const out = normalizeObservations(raw);
  assertEqual(out.faqs.length, 1, 'only the first faq should survive');
  assert(!('unknown_top_level_key' in out), 'unknown keys must be dropped');
});

test('normalize handles null/non-object input', () => {
  assertEqual(JSON.stringify(normalizeObservations(null)), '{}');
  assertEqual(JSON.stringify(normalizeObservations('hi')), '{}');
  assertEqual(JSON.stringify(normalizeObservations(42)), '{}');
});

test('normalize trims oversized strings', () => {
  const big = 'x'.repeat(10_000);
  const out = normalizeObservations({
    faqs: [{ question: big, suggested_answer: big, frequency_signal: big }],
  });
  assert(out.faqs[0].question.length <= 500);
  assert(out.faqs[0].suggested_answer.length <= 1000);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. render.js — prompt block rendering
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nRender');

test('empty brand_soul renders empty string', () => {
  assertEqual(renderBrandSoulForPrompt(null), '');
  assertEqual(renderBrandSoulForPrompt({}), '');
  assertEqual(renderBrandSoulForPrompt({ faqs: [], processes: [], voice_cues: [] }), '');
});

test('populated brand_soul renders a usable block', () => {
  const block = renderBrandSoulForPrompt({
    faqs: [{ question: 'Do you ship?', answer: 'Yes', session_count: 5 }],
    processes: [{ name: 'Refund', description: 'Email support', session_count: 4 }],
    voice_cues: [{ cue: 'Casual tone', session_count: 3 }],
  });
  assertContains(block, 'LEARNED BRAND CONTEXT');
  assertContains(block, 'Do you ship?');
  assertContains(block, 'Refund');
  assertContains(block, 'Casual tone');
});

test('block instructs the agent NEVER to reveal it', () => {
  const block = renderBrandSoulForPrompt({
    faqs: [{ question: 'q', answer: 'a', session_count: 3 }],
  });
  assertContains(block, 'NEVER reference this section explicitly');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PII fuzz — 100 synthetic anon conversations + diverse PII shapes
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nPII fuzz');

test('100 synthetic conversations with diverse PII produce no PII residue', () => {
  // PII shapes the regex detectors are designed to catch. Generic order /
  // reference IDs without an "account|acct|konto" keyword prefix are
  // deliberately OUT of scope for the regex layer (too easy to false-positive
  // on inventory IDs, sku numbers, etc.) — they're caught downstream by the
  // LLM anti-extraction prompt + the worker's auditOutbound step before any
  // DB write. The fuzz test validates scrub-layer coverage of the shapes the
  // detectors are designed to catch.
  const piiSamples = [
    'jane.doe@example.com',
    'bob+tag@gmail.co.uk',
    'support@shenmay.ai',
    '555-123-4567',
    '(415) 555-0199',
    '+44 20 7946 0958',
    '111-22-3333',
    '987 65 4321',
    '4111 1111 1111 1111',
    '5500-0000-0000-0004',
    'GB82 WEST 1234 5698 7654 32',
    'DE89 3704 0044 0532 0130 00',
    '1990-04-12',
    '04/12/1990',
    'SW1A 1AA',
    '90210',
    'M5V 2H1',
    'Account 0123456789',
  ];

  const templates = [
    'Hi I would like to know more, my email is {pii}',
    'You can reach me at {pii} thanks',
    'Charge it to {pii}',
    'My DOB is {pii}',
    'Mailing address {pii}',
    'I called from {pii}',
    'Reference number is {pii}',
    'Order shipped to {pii}',
    'Try the card {pii} for me',
  ];

  for (let i = 0; i < 100; i++) {
    const pii = piiSamples[i % piiSamples.length];
    const tmpl = templates[i % templates.length];
    const messages = [
      { role: 'customer', content: tmpl.replace('{pii}', pii) },
      { role: 'agent',    content: 'Thanks, looking into that.' },
    ];
    const { scrubbedText } = scrubMessagesForDistillation(messages);

    // The literal PII MUST NOT appear in the scrubbed transcript.
    if (scrubbedText.includes(pii)) {
      throw new Error(`PII leaked at iteration ${i} — payload "${pii}" still in scrubbed text`);
    }
    // And the residual scanner must find no remaining PII patterns.
    const findings = quickScanForResidualPii(scrubbedText);
    if (findings.length > 0) {
      throw new Error(`residual PII at iteration ${i}: ${findings.join(',')} (transcript: ${scrubbedText.slice(0, 200)})`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n== Results: ${passed} passed, ${failed} failed ==\n`);
if (failed > 0) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
  process.exit(1);
}
process.exit(0);
