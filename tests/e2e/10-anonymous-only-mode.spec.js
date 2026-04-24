// @ts-check
const { test, expect } = require('@playwright/test');
const { API_BASE } = require('./helpers/constants');
const { hasDbAccess } = require('./helpers/mode');
const db = require('./helpers/db');

/**
 * Anonymous-only mode — tenant-wide widget privacy toggle.
 *
 * Migration 036 adds `tenants.anonymous_only_mode BOOLEAN`. When true:
 *   - POST /api/widget/session ignores the `email` / `display_name` params
 *     and always creates an anonymous session. Response includes
 *     `anonymous_only: true`.
 *   - POST /api/widget/session/claim returns 403 with
 *     `{ error: 'anonymous_only_mode' }`.
 *
 * These specs flip the flag ON the test tenant, hit both endpoints, and
 * restore the original flag state in afterAll. DB-direct, so guarded by
 * `hasDbAccess()` (skipped in onprem CI which doesn't grant the runner
 * direct DB access).
 */

// We lock the tenant flag for this spec file only; serialise these tests
// so the flip/restore doesn't race with another test in the same worker.
test.describe.configure({ mode: 'serial' });

let widgetKey = '';
let tenantId = '';
let originalFlag = false;

test.describe('Anonymous-only mode', () => {
  test.beforeAll(async () => {
    if (!hasDbAccess()) return;

    // Pick the most recently created active tenant — in CI this is the
    // seed-test-admin tenant; on a developer box this may be any dev tenant.
    const rows = await db.query(
      `SELECT id, widget_api_key, anonymous_only_mode
         FROM tenants
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT 1`
    );
    if (rows.length === 0) throw new Error('No active tenant for anonymous-only test');
    tenantId = rows[0].id;
    widgetKey = rows[0].widget_api_key;
    originalFlag = rows[0].anonymous_only_mode === true;

    await db.query(
      `UPDATE tenants SET anonymous_only_mode = true WHERE id = $1`,
      [tenantId]
    );
  });

  test.afterAll(async () => {
    if (!hasDbAccess() || !tenantId) return;
    // Always restore — even after test failures — so subsequent specs get
    // the tenant back in its original posture.
    await db.query(
      `UPDATE tenants SET anonymous_only_mode = $1 WHERE id = $2`,
      [originalFlag, tenantId]
    );
  });

  test('/session with a user email is forced into anonymous mode', async ({ request }) => {
    test.skip(!hasDbAccess(), 'Requires DB access to flip tenant flag');

    const resp = await request.post(`${API_BASE}/api/widget/session`, {
      data: {
        widget_key: widgetKey,
        email: 'forced-anon@example.com',
        display_name: 'Forced Anon',
      },
    });
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.anonymous_only).toBe(true);
    expect(body.customer.is_anonymous).toBe(true);
    // Token still issued so the widget is still usable
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  test('/session/claim returns 403 anonymous_only_mode', async ({ request }) => {
    test.skip(!hasDbAccess(), 'Requires DB access to flip tenant flag');

    // Get an anon session first so we have a valid anon_token to submit
    const init = await request.post(`${API_BASE}/api/widget/session`, {
      data: { widget_key: widgetKey },
    });
    expect(init.status()).toBe(200);
    const { token: anonToken } = await init.json();
    expect(anonToken).toBeTruthy();

    // Attempt to claim — should be refused with the specific error code
    // the widget listens for so it doesn't reload-loop.
    const claim = await request.post(`${API_BASE}/api/widget/session/claim`, {
      data: {
        widget_key:  widgetKey,
        anon_token:  anonToken,
        email:       'claim-attempt@example.com',
      },
    });
    expect(claim.status()).toBe(403);

    const body = await claim.json();
    expect(body.error).toBe('anonymous_only_mode');
  });
});
