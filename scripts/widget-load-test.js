#!/usr/bin/env node
/**
 * Widget concurrency load test.
 *
 *   node scripts/widget-load-test.js \
 *     --base-url https://nomii-staging.pontensolutions.com \
 *     --widget-key <key> \
 *     --concurrency 50 \
 *     --include-chat
 *
 * Phase 1 fires N parallel `POST /api/widget/session`. Each one resolves the
 * tenant, upserts a (synthetic) customer, opens a conversation, and returns a
 * JWT. We collect statuses + JWTs.
 *
 * Phase 2 (only when --include-chat) fires N parallel `POST /api/widget/chat`
 * using each session's JWT. This exercises the full happy path including the
 * LLM round-trip — slowest part of the system.
 *
 * Prints p50/p95/p99 + error breakdown for each phase. No external deps.
 */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith?.('--') === false ? arr[i + 1] : true] : null))
    .filter(Boolean)
);

const BASE = args['base-url'] || process.env.BASE_URL;
const KEY = args['widget-key'] || process.env.WIDGET_KEY;
const N = Number(args['concurrency'] || 50);
const INCLUDE_CHAT = !!args['include-chat'];
const ANON = !!args['anonymous'];

if (!BASE || !KEY) {
  console.error('Usage: node scripts/widget-load-test.js --base-url <url> --widget-key <key> [--concurrency 50] [--include-chat] [--anonymous]');
  process.exit(2);
}

const pct = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, idx)];
};
const summarize = (durations) => {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min_ms: Math.round(sorted[0] || 0),
    p50_ms: Math.round(pct(sorted, 0.5)),
    p95_ms: Math.round(pct(sorted, 0.95)),
    p99_ms: Math.round(pct(sorted, 0.99)),
    max_ms: Math.round(sorted[sorted.length - 1] || 0),
  };
};

async function fireSession(i) {
  const t0 = performance.now();
  try {
    const body = ANON
      ? { widget_key: KEY }
      : { widget_key: KEY, email: `loadtest-${i}-${Date.now()}@example.test`, display_name: `Load ${i}` };
    const r = await fetch(`${BASE}/api/widget/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ms = performance.now() - t0;
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0, 200) }; }
    return { i, ok: r.ok, status: r.status, ms, token: j.token, error: j.error };
  } catch (e) {
    return { i, ok: false, status: 0, ms: performance.now() - t0, error: e.message };
  }
}

async function fireChat(i, token, content) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE}/api/widget/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content }),
    });
    const ms = performance.now() - t0;
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = { _raw: text.slice(0, 200) }; }
    return { i, ok: r.ok, status: r.status, ms, replyChars: (j.content || '').length, error: j.error };
  } catch (e) {
    return { i, ok: false, status: 0, ms: performance.now() - t0, error: e.message };
  }
}

(async () => {
  console.log(`\n=== Widget concurrency load test ===`);
  console.log(`Base:        ${BASE}`);
  console.log(`Widget key:  ${KEY.slice(0, 8)}…${KEY.slice(-4)}`);
  console.log(`Concurrency: ${N}`);
  console.log(`Mode:        ${ANON ? 'anonymous' : 'named (1 customer per session)'}`);
  console.log(`Chat phase:  ${INCLUDE_CHAT ? 'YES — exercises LLM round-trip' : 'no (session-only)'}`);
  console.log('');

  // ── Phase 1: Sessions ───────────────────────────────────────────────────
  console.log(`Phase 1: firing ${N} parallel POST /api/widget/session …`);
  const wallStart1 = performance.now();
  const sessions = await Promise.all(Array.from({ length: N }, (_, i) => fireSession(i)));
  const wallEnd1 = performance.now();

  const ok1 = sessions.filter((s) => s.ok);
  const fail1 = sessions.filter((s) => !s.ok);
  const durs1 = ok1.map((s) => s.ms);
  const sumD1 = summarize(durs1);

  console.log(`  Wall time:   ${Math.round(wallEnd1 - wallStart1)} ms (all ${N} done)`);
  console.log(`  Success:     ${ok1.length}/${N}`);
  console.log(`  Failures:    ${fail1.length}`);
  console.log(`  Per-request: min=${sumD1.min_ms} p50=${sumD1.p50_ms} p95=${sumD1.p95_ms} p99=${sumD1.p99_ms} max=${sumD1.max_ms} ms`);
  if (fail1.length > 0) {
    const byStatus = {};
    fail1.forEach((f) => { byStatus[`${f.status} ${f.error || '-'}`] = (byStatus[`${f.status} ${f.error || '-'}`] || 0) + 1; });
    console.log(`  Errors:`, byStatus);
  }

  if (!INCLUDE_CHAT) {
    console.log('\nDone (session-only).');
    return;
  }

  if (ok1.length === 0) {
    console.log('\nAborting chat phase: no successful sessions.');
    return;
  }

  // ── Phase 2: Chat ───────────────────────────────────────────────────────
  console.log(`\nPhase 2: firing ${ok1.length} parallel POST /api/widget/chat …`);
  const wallStart2 = performance.now();
  const chats = await Promise.all(
    ok1.map((s) => fireChat(s.i, s.token, `Hi! Quick test from load runner ${s.i}.`))
  );
  const wallEnd2 = performance.now();

  const ok2 = chats.filter((c) => c.ok);
  const fail2 = chats.filter((c) => !c.ok);
  const durs2 = ok2.map((c) => c.ms);
  const sumD2 = summarize(durs2);

  console.log(`  Wall time:   ${Math.round(wallEnd2 - wallStart2)} ms (all ${ok1.length} done)`);
  console.log(`  Success:     ${ok2.length}/${ok1.length}`);
  console.log(`  Failures:    ${fail2.length}`);
  console.log(`  Per-request: min=${sumD2.min_ms} p50=${sumD2.p50_ms} p95=${sumD2.p95_ms} p99=${sumD2.p99_ms} max=${sumD2.max_ms} ms`);
  if (fail2.length > 0) {
    const byStatus = {};
    fail2.forEach((f) => { byStatus[`${f.status} ${f.error || '-'}`] = (byStatus[`${f.status} ${f.error || '-'}`] || 0) + 1; });
    console.log(`  Errors:`, byStatus);
  }
  const replyChars = ok2.map((c) => c.replyChars);
  if (replyChars.length > 0) {
    const sumR = summarize(replyChars);
    console.log(`  Reply chars: min=${sumR.min_ms} p50=${sumR.p50_ms} p95=${sumR.p95_ms} max=${sumR.max_ms} (using ms-named fields, but units are chars)`);
  }

  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
