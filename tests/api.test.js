/**
 * Nomii AI — Phase 1 API Integration Tests
 *
 * Pure Node.js, no test framework. Requires Node 18+ (native fetch).
 * Run with: node tests/api.test.js
 *
 * Before running, add to server/.env:
 *   TEST_ADMIN_EMAIL=your-test-admin@email.com
 *   TEST_ADMIN_PASSWORD=your-test-password
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Load env from server/.env ─────────────────────────────────────────────────

const envPath = path.resolve(__dirname, '../server/.env');

if (!fs.existsSync(envPath)) {
  console.error(`\nERROR: Could not find server/.env at: ${envPath}`);
  console.error('Make sure you are running from the project root.\n');
  process.exit(1);
}

// Simple .env parser (no external deps)
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key   = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!process.env[key]) process.env[key] = value;
}

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL      = `http://localhost:${process.env.PORT || 3001}`;
const TEST_EMAIL    = process.env.TEST_ADMIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

console.log(`\nBase URL: ${BASE_URL}`);

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('\nERROR: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in server/.env');
  console.error('  Example:');
  console.error('    TEST_ADMIN_EMAIL=your-test-admin@email.com');
  console.error('    TEST_ADMIN_PASSWORD=your-test-password\n');
  process.exit(1);
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof AssertionError ? err.message : String(err.message || err);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
    failed++;
    failures.push({ name, message: msg });
  }
}

class AssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new AssertionError(message || 'Assertion failed');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res;
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res;
}

async function del(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers });
  return res;
}

// ── Connection check ──────────────────────────────────────────────────────────

async function checkServerRunning() {
  try {
    await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch (err) {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Connection check
  const isRunning = await checkServerRunning();
  if (!isRunning) {
    console.error(`\nERROR: Server is not running at ${BASE_URL}`);
    console.error('Start it with: npm run dev:server\n');
    process.exit(1);
  }

  // Shared state across tests
  let authToken   = null;
  let widgetKey   = null;
  let createdToolId = null;
  const toolName  = `test_lookup_${Date.now()}`;

  // ── Auth ────────────────────────────────────────────────────────────────────

  console.log('\nAuth');

  await test('POST /api/onboard/login with wrong password returns 401', async () => {
    const res = await post('/api/onboard/login', {
      email:    TEST_EMAIL,
      password: '__definitely_wrong_password__',
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert(body.error, 'Expected an error message');
  });

  await test('POST /api/onboard/login with missing fields returns 400', async () => {
    const res = await post('/api/onboard/login', { email: TEST_EMAIL });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert(body.error, 'Expected an error message');
  });

  await test('POST /api/onboard/login with valid credentials returns token + tenant + admin', async () => {
    const res = await post('/api/onboard/login', {
      email:    TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.token,  'Expected token in response');
    assert(body.tenant, 'Expected tenant in response');
    assert(body.admin,  'Expected admin in response');
    // Store for subsequent tests
    authToken = body.token;
    widgetKey = body.tenant.widget_key;
  });

  // ── Portal /me ──────────────────────────────────────────────────────────────

  console.log('\nPortal /me');

  await test('GET /api/portal/me without token returns 401', async () => {
    const res = await get('/api/portal/me');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /api/portal/me returns tenant, admin, and subscription', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await get('/api/portal/me', authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.tenant,           'Expected tenant in /me response');
    assert(body.admin,            'Expected admin in /me response');
    assert(body.subscription !== undefined, 'Expected subscription field in /me response');
    // Key regression: dashboard welcome must use first_name, not company name
    assert(
      typeof body.admin.first_name === 'string',
      'admin.first_name must be a string — this field drives the dashboard welcome message'
    );
    assert(
      body.admin.first_name.length > 0,
      'admin.first_name must not be empty — dashboard welcome would be blank'
    );
    // Confirm widget_key present (used in widget session tests)
    assert(body.tenant.widget_key, 'Expected tenant.widget_key in /me response');
    // Update widgetKey in case login test populated a different one
    widgetKey = body.tenant.widget_key;
  });

  // ── Widget session ──────────────────────────────────────────────────────────

  console.log('\nWidget session');

  await test('POST /api/widget/session without widget_key returns 400', async () => {
    const res = await post('/api/widget/session', {});
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const body = await res.json();
    assert(body.error, 'Expected an error message');
  });

  await test('POST /api/widget/session with invalid widget_key returns 403', async () => {
    const res = await post('/api/widget/session', { widget_key: 'totally_invalid_key_xyz' });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('POST /api/widget/session (anonymous) returns token + anonymous customer', async () => {
    assert(widgetKey, 'No widget_key — /me test must pass first');
    const res = await post('/api/widget/session', { widget_key: widgetKey });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.token,    'Expected token in widget session response');
    assert(body.customer, 'Expected customer in widget session response');
    assert(body.agent,    'Expected agent in widget session response');
    assert(body.tenant,   'Expected tenant in widget session response');
    assert(body.customer.is_anonymous === true, 'Expected customer.is_anonymous to be true');
  });

  await test('POST /api/widget/session (with email) returns token + non-anonymous customer', async () => {
    assert(widgetKey, 'No widget_key — /me test must pass first');
    const testEmail = `api_test_${Date.now()}@example.com`;
    const res = await post('/api/widget/session', {
      widget_key: widgetKey,
      email:      testEmail,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.token,    'Expected token in widget session response');
    assert(body.customer, 'Expected customer in widget session response');
    assert(body.customer.is_anonymous === false, 'Expected customer.is_anonymous to be false for email session');
  });

  // ── Tools ───────────────────────────────────────────────────────────────────

  console.log('\nTools');

  await test('GET /api/portal/tools without auth returns 401', async () => {
    const res = await get('/api/portal/tools');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /api/portal/tools returns { tools: [] } shape', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await get('/api/portal/tools', authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.tools), 'Expected tools to be an array');
  });

  await test('POST /api/portal/tools with missing data_category returns 400', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await post('/api/portal/tools', {
      name:                'test_lookup_validation',
      display_name:        'Validation Test',
      tool_type:           'lookup',
      trigger_description: 'When client asks about their account',
      config:              {}, // deliberately missing data_category
    }, authToken);
    assert(res.status === 400, `Expected 400 for missing data_category, got ${res.status}`);
    const body = await res.json();
    assert(body.error, 'Expected an error message');
    assert(
      body.error.includes('data_category'),
      `Expected error to mention data_category, got: "${body.error}"`
    );
  });

  await test('POST /api/portal/tools with valid data creates tool (201)', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await post('/api/portal/tools', {
      name:                toolName,
      display_name:        'Test Lookup',
      tool_type:           'lookup',
      trigger_description: 'When client asks about their account',
      config:              { data_category: 'accounts' },
    }, authToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert(body.tool,    'Expected tool in response');
    assert(body.tool.id, 'Expected tool.id in response');
    assert(body.tool.name === toolName, `Expected tool name "${toolName}", got "${body.tool.name}"`);
    createdToolId = body.tool.id;
  });

  // ── Memory sync ─────────────────────────────────────────────────────────────

  console.log('\nMemory sync');

  await test('GET /api/portal/conversations returns list', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await get('/api/portal/conversations', authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.conversations), 'Expected conversations to be an array');
    assert(typeof body.total === 'number',    'Expected total to be a number');
  });

  await test('POST /api/portal/conversations/:id/summarize returns { success: true }', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    // Find a conversation with messages to summarize
    const listRes  = await get('/api/portal/conversations', authToken);
    const listBody = await listRes.json();
    const convWithMessages = listBody.conversations.find(c => parseInt(c.message_count) > 0);

    if (!convWithMessages) {
      // No conversations with messages yet — skip gracefully
      console.log('        (skipped — no conversations with messages found)');
      return;
    }

    const res  = await post(`/api/portal/conversations/${convWithMessages.id}/summarize`, {}, authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `Expected success: true, got: ${JSON.stringify(body)}`);
  });

  // ── Customers ───────────────────────────────────────────────────────────────

  console.log('\nCustomers');

  await test('GET /api/portal/customers returns list with pagination', async () => {
    assert(authToken, 'No auth token — login test must pass first');
    const res = await get('/api/portal/customers', authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.customers), 'Expected customers to be an array');
    assert(typeof body.total === 'number', 'Expected total to be a number');
    assert(typeof body.page  === 'number', 'Expected page to be a number');
    assert(typeof body.limit === 'number', 'Expected limit to be a number');
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  console.log('\nCleanup');

  await test('DELETE /api/portal/tools/:toolId removes created test tool', async () => {
    if (!createdToolId) {
      console.log('        (skipped — tool was never created)');
      return;
    }
    assert(authToken, 'No auth token — login test must pass first');
    const res = await del(`/api/portal/tools/${createdToolId}`, authToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.ok === true, `Expected ok: true, got: ${JSON.stringify(body)}`);
  });

  // ── Summary ─────────────────────────────────────────────────────────────────

  const total = passed + failed;
  console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  - ${f.name}`);
      console.log(`    ${f.message}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\nUnhandled error during test run:', err);
  process.exit(1);
});
