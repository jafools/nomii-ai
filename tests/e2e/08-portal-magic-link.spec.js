// @ts-check
const { test, expect } = require('@playwright/test');
const dbHelper = require('./helpers/db');
const { isOnprem, hasDbAccess } = require('./helpers/mode');

/**
 * Shenmay-native customer license portal — magic-link flow.
 *
 * End-to-end exercise of the /api/public/portal/* suite:
 *
 *   POST /request-login        enumeration-safe response, token persisted in DB
 *   POST /verify               single-use consume → session token
 *   GET  /licenses             Bearer-auth → license list
 *   POST /logout               revoke session
 *
 * We read the magic-link token directly from the `portal_login_tokens` table
 * instead of waiting on Resend. Memory: `reference_shenmay_portal_arch.md`
 * confirms the portal is Shenmay-native (no Worker) and gated by
 * SHENMAY_LICENSE_MASTER=true — set in CI env for this spec to run.
 *
 * This spec also pulls double duty as a regression guard for the portal's
 * enumeration defense: a non-licensed email MUST get the same ok:true
 * response as a licensed one (no differential).
 */

const DISAMBIGUATOR      = `e2e${Date.now().toString(36)}`;
const LICENSED_EMAIL     = `portal-has-${DISAMBIGUATOR}@shenmay.test`;
const UNLICENSED_EMAIL   = `portal-none-${DISAMBIGUATOR}@shenmay.test`;
const MALFORMED_EMAIL    = `not-an-email`;

const PORTAL = '/api/public/portal';

function apiBase() {
  return `http://localhost:${process.env.PORT || 3001}`;
}

test.describe('Public license portal — magic-link', () => {
  test.describe.configure({ mode: 'serial' });

  let seededLicenseKey = null;

  test.beforeEach(async () => {
    test.skip(isOnprem(), 'Public portal routes are gated by SHENMAY_LICENSE_MASTER; self-hosted never sets it.');
    test.skip(!hasDbAccess(), 'Portal spec needs direct DB access to read the magic-link token.');
  });

  test.beforeAll(async () => {
    try {
      seededLicenseKey = await dbHelper.seedLicense(LICENSED_EMAIL, 'starter');
    } catch (err) {
      console.warn('[portal-magic-link] license seed failed:', err.message);
    }
  });

  test.afterAll(async () => {
    try {
      await dbHelper.cleanupBySuffix(DISAMBIGUATOR);
    } catch (err) {
      console.warn('[portal-magic-link] cleanup failed:', err.message);
    }
  });

  test('request-login with malformed email returns 400 invalid_email', async ({ request }) => {
    const res = await request.post(`${apiBase()}${PORTAL}/request-login`, {
      data: { email: MALFORMED_EMAIL },
    });
    if (res.status() === 404) {
      test.skip(true, 'Portal routes disabled (SHENMAY_LICENSE_MASTER != true in this env).');
      return;
    }
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('invalid_email');
  });

  test('request-login with an unlicensed email still returns ok:true (enumeration defense)', async ({ request }) => {
    const res = await request.post(`${apiBase()}${PORTAL}/request-login`, {
      data: { email: UNLICENSED_EMAIL },
    });
    if (res.status() === 404) {
      test.skip(true, 'Portal routes disabled.');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // No token should have been inserted for this email.
    const token = await dbHelper.getPortalLoginToken(UNLICENSED_EMAIL);
    expect(token).toBeNull();
  });

  test('request-login with a licensed email persists a magic-link token in DB', async ({ request }) => {
    test.skip(!seededLicenseKey, 'License seed failed — cannot exercise the portal flow.');

    const res = await request.post(`${apiBase()}${PORTAL}/request-login`, {
      data: { email: LICENSED_EMAIL },
    });
    if (res.status() === 404) {
      test.skip(true, 'Portal routes disabled.');
      return;
    }
    expect(res.status()).toBe(200);

    const token = await dbHelper.getPortalLoginToken(LICENSED_EMAIL);
    expect(token, 'Expected a fresh magic-link token in portal_login_tokens').toBeTruthy();
    expect(token.length).toBeGreaterThan(30);
  });

  test('verify consumes the token and returns a session', async ({ request }) => {
    test.skip(!seededLicenseKey, 'License seed failed.');

    const token = await dbHelper.getPortalLoginToken(LICENSED_EMAIL);
    test.skip(!token, 'No magic-link token for licensed email.');

    const res = await request.post(`${apiBase()}${PORTAL}/verify`, {
      data: { token },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.session_token).toBeTruthy();
    expect(body.email.toLowerCase()).toBe(LICENSED_EMAIL.toLowerCase());

    // Attempting to re-use the token should now fail (single-use enforcement).
    const reuseRes = await request.post(`${apiBase()}${PORTAL}/verify`, {
      data: { token },
    });
    expect(reuseRes.status()).toBe(400);
    const reuseBody = await reuseRes.json();
    expect(reuseBody.error).toBe('invalid_token');

    // Stash for subsequent tests.
    test.info().annotations.push({ type: 'session_token', description: body.session_token });
  });

  test('GET /licenses with Bearer session returns the seeded license', async ({ request }) => {
    test.skip(!seededLicenseKey, 'License seed failed.');

    // Mint a fresh magic-link → session pair so we know a valid session exists
    // regardless of previous test ordering. Tests are serial but this keeps
    // the assertion self-contained.
    await request.post(`${apiBase()}${PORTAL}/request-login`, {
      data: { email: LICENSED_EMAIL },
    });
    const magic = await dbHelper.getPortalLoginToken(LICENSED_EMAIL);
    expect(magic).toBeTruthy();

    const verify = await request.post(`${apiBase()}${PORTAL}/verify`, { data: { token: magic } });
    expect(verify.status()).toBe(200);
    const { session_token } = await verify.json();

    const list = await request.get(`${apiBase()}${PORTAL}/licenses`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(list.status()).toBe(200);

    const body = await list.json();
    expect(body.email.toLowerCase()).toBe(LICENSED_EMAIL.toLowerCase());
    expect(body.product).toBe('shenmay');
    expect(Array.isArray(body.licenses)).toBe(true);
    expect(body.licenses.length).toBeGreaterThanOrEqual(1);

    const ours = body.licenses.find((l) => l.license_key === seededLicenseKey);
    expect(ours, 'Expected seeded license in portal response').toBeTruthy();
    expect(ours.plan).toBe('starter');
    expect(ours.status).toBe('active');
  });

  test('missing Authorization returns 401 missing_auth', async ({ request }) => {
    const res = await request.get(`${apiBase()}${PORTAL}/licenses`);
    if (res.status() === 404) {
      test.skip(true, 'Portal routes disabled.');
      return;
    }
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('missing_auth');
  });

  test('logout revokes the session, /licenses then 401 invalid_session', async ({ request }) => {
    test.skip(!seededLicenseKey, 'License seed failed.');

    // Mint yet another session to revoke (keeps the test self-contained).
    await request.post(`${apiBase()}${PORTAL}/request-login`, {
      data: { email: LICENSED_EMAIL },
    });
    const magic = await dbHelper.getPortalLoginToken(LICENSED_EMAIL);
    const verify = await request.post(`${apiBase()}${PORTAL}/verify`, { data: { token: magic } });
    const { session_token } = await verify.json();

    const logoutRes = await request.post(`${apiBase()}${PORTAL}/logout`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(logoutRes.status()).toBe(200);

    const reuseRes = await request.get(`${apiBase()}${PORTAL}/licenses`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(reuseRes.status()).toBe(401);
    const reuseBody = await reuseRes.json();
    expect(reuseBody.error).toBe('invalid_session');
  });
});
