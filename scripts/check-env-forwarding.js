#!/usr/bin/env node
/**
 * Env-var forwarding lint.
 *
 * Catches the "code reads process.env.FOO but docker-compose.yml never
 * forwards FOO into the backend container" class of bug. This was the
 * root cause of the PR #98 → #101 churn where RESEND_WEBHOOK_SECRET was
 * set in Hetzner's .env but invisible to Node because the compose
 * backend.environment block didn't list it.
 *
 * Strategy:
 *   1. Collect every `process.env.NAME` used in server/src/ runtime code.
 *   2. Parse docker-compose.yml's backend.environment block (SaaS prod).
 *   3. Diff against a narrow allowlist of things that legitimately live
 *      outside the compose-forwarded environment (NODE_ENV is hardcoded,
 *      test-only seeds, etc).
 *   4. Report misses — exit 1 on any.
 *
 * No deps; regex parsing is fine because the compose files are hand-
 * edited with predictable indentation and we own them.
 *
 * Run: `node scripts/check-env-forwarding.js` (from repo root)
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Env vars that legitimately are used in code but don't need (or
// shouldn't need) to be forwarded via docker-compose.yml backend env.
// Keep this list tight — every entry is a potential escape hatch that
// masks a real miss. Add a one-line comment next to each entry
// explaining why it's exempt.
const ALLOWLIST = new Set([
  // Hardcoded in compose directly, not interpolated from .env
  'NODE_ENV',       // `NODE_ENV: production` in docker-compose.yml
  'PORT',           // `PORT: 3001` in docker-compose.yml
  'DATABASE_URL',   // constructed inline from DB_PASSWORD via ${DATABASE_URL:-postgresql://...}

  // Dev / script-only (never read in the prod container runtime)
  'DRY_RUN',        // server/src/jobs/dataRetention.js, CLI flag
  'DEBUG',          // common Node convention
  'npm_package_version', // package.json version injection at build

  // Test-only seed + Playwright
  'TEST_ADMIN_EMAIL',      // seed script
  'TEST_ADMIN_PASSWORD',   // seed script
  'TEST_WIDGET_KEY',       // Playwright helpers
  'TEST_DATABASE_URL',     // Playwright helpers
  'PLAYWRIGHT_MODE',       // Playwright specs
  'PLAYWRIGHT_SKIP_SEED',  // Playwright specs
  'PLAYWRIGHT_BASE_URL',   // Playwright specs
  'CI',                    // GH Actions

  // Populated by setup flow, not a deploy-time secret
  'ADMIN_PASSWORD', // one-shot first-admin password passed to /api/setup/complete

  // App-level fallbacks exist; forwarding is optional. Operators who want
  // to override can add to .env + compose — but defaults are sensible so
  // leaving these out of compose isn't a bug.
  'CONTACT_URL',            // derived from APP_URL: `${APP_URL}/contact`
  'SUPPORT_EMAIL',          // derived from APP_URL: `support@${APP_DOMAIN}`
  'PRIVACY_POLICY_VERSION', // hardcoded fallback '2024-01'; rarely changes
  'PUBLIC_PORTAL_URL',      // falls back to APP_URL for license portal links

  // Frontend has hardcoded live-value fallbacks in
  // client/src/pages/shenmay/dashboard/ShenmayPlans.jsx — server /api/config
  // overrides if set, but left unset is a legitimate production config.
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICING_TABLE_ID',
]);

// ─── Collect env vars from runtime code ────────────────────────────────
function collectCodeEnvVars() {
  const dir = path.join(ROOT, 'server', 'src');
  const found = new Set();
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        const re = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
          found.add(m[1]);
        }
      }
    }
  };
  walk(dir);
  return found;
}

// ─── Parse compose backend.environment block ────────────────────────────
function collectComposeEnvVars(composePath) {
  // Normalize CRLF → LF so the regex-based slicing below works the same
  // on Windows checkouts and CI.
  const txt = fs.readFileSync(composePath, 'utf8').replace(/\r\n/g, '\n');

  // Slice from `^  backend:` until the next top-level service (`^  [a-z]`).
  const backendStart = txt.search(/^ {2}backend:/m);
  if (backendStart === -1) {
    throw new Error(`Could not find backend: block in ${composePath}`);
  }
  const tail = txt.slice(backendStart + 1);
  const nextSvc = tail.search(/^ {2}[a-z]/m);
  const block = nextSvc === -1 ? tail : tail.slice(0, nextSvc);

  // Find the `environment:` key inside the backend block. Accept any
  // leading indent ≥ 4 spaces — compose style in this repo is 4, but
  // parse defensively.
  const envKeyMatch = block.match(/^( {2,})environment:\s*$/m);
  if (!envKeyMatch) {
    throw new Error(`Could not find environment block in backend service of ${composePath}`);
  }
  const envKeyIndent = envKeyMatch[1].length;
  const childIndent  = envKeyIndent + 2; // yaml style in this repo — each nesting adds 2
  const envStart = envKeyMatch.index + envKeyMatch[0].length;
  const envTail  = block.slice(envStart);

  const lines = envTail.split('\n');
  const found = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    // Comment lines are fine; skip them but don't break.
    if (/^\s*#/.test(line)) continue;
    // End of block when indent drops below childIndent
    const m = line.match(/^(\s*)([A-Z_][A-Z0-9_]*):/);
    if (!m) {
      // A non-matching line with less indent = block ended
      const firstNonSpace = line.search(/\S/);
      if (firstNonSpace !== -1 && firstNonSpace < childIndent) break;
      continue;
    }
    if (m[1].length < childIndent) break;
    if (m[1].length !== childIndent) continue; // nested structure inside an env value, skip
    found.add(m[2]);
  }
  return found;
}

// ─── Main ──────────────────────────────────────────────────────────────
function main() {
  const codeVars    = collectCodeEnvVars();
  const saasVars    = collectComposeEnvVars(path.join(ROOT, 'docker-compose.yml'));
  const onpremVars  = collectComposeEnvVars(path.join(ROOT, 'docker-compose.selfhosted.yml'));

  // Treat a var as forwarded if EITHER compose file forwards it — some
  // vars (like MANAGED_AI_ENABLED, SaaS-specific) only belong in one
  // file and that's fine. Everything in the ALLOWLIST is also accepted.
  const forwardedAnywhere = new Set([...saasVars, ...onpremVars, ...ALLOWLIST]);

  const missingFromBoth = [];
  const missingSaas     = [];
  const missingOnprem   = [];

  for (const v of codeVars) {
    const inSaas   = saasVars.has(v)   || ALLOWLIST.has(v);
    const inOnprem = onpremVars.has(v) || ALLOWLIST.has(v);
    if (!inSaas && !inOnprem) missingFromBoth.push(v);
    else if (!inSaas)         missingSaas.push(v);
    else if (!inOnprem)       missingOnprem.push(v);
  }

  const report = [];
  report.push(`[env-forwarding] ${codeVars.size} env vars referenced in server/src/, ${saasVars.size} forwarded by docker-compose.yml, ${onpremVars.size} forwarded by docker-compose.selfhosted.yml, ${ALLOWLIST.size} allowlisted.`);

  if (missingFromBoth.length) {
    report.push('');
    report.push('❌ MISSING FROM BOTH compose files (this is the PR #98 bug class):');
    for (const v of missingFromBoth.sort()) report.push(`   - ${v}`);
    report.push('');
    report.push('  Fix: either add to the backend.environment block in docker-compose.yml + docker-compose.selfhosted.yml, or allowlist in scripts/check-env-forwarding.js with a one-line reason.');
  }

  if (missingSaas.length) {
    report.push('');
    report.push('⚠️  Forwarded by selfhosted but NOT by SaaS compose:');
    for (const v of missingSaas.sort()) report.push(`   - ${v}`);
  }

  if (missingOnprem.length) {
    report.push('');
    report.push('⚠️  Forwarded by SaaS but NOT by selfhosted compose:');
    for (const v of missingOnprem.sort()) report.push(`   - ${v}`);
    report.push('   (usually fine — some vars are SaaS-only; allowlist if intentional)');
  }

  console.log(report.join('\n'));

  // Fail closed only on "missing from both" — lopsided forwarding is a
  // warning (intentional for SaaS-only features like Stripe).
  if (missingFromBoth.length > 0) {
    console.error('\n❌ FAIL: env vars referenced in code are not forwarded to the backend container.');
    process.exit(1);
  }
  console.log('\n✅ OK: all runtime env vars are either forwarded or allowlisted.');
}

main();
