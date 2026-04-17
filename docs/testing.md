# Nomii AI — Testing Guide

## Overview

Two test suites cover the full stack:

| Suite | Command | Count | What it covers |
|---|---|---|---|
| Phase 1 — API integration | `npm test` | 17 tests | Auth, portal /me, widget session, tools validation, memory sync, customers |
| Phase 2 — E2E (Playwright) | `npm run test:e2e` | 35 tests | Login flow, dashboard nav, widget embed, onboarding, email verify |

---

## Prerequisites

### One-time VM setup (Proxmox `pontenprox`)

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install Chromium for Playwright
cd ~/nomii-ai
npm install
npx playwright install chromium --with-deps
```

### Required env vars

Add to **both** `~/nomii-ai/.env` (for Docker Compose) and `~/nomii-ai/server/.env` (for dev server / Playwright):

```
TEST_ADMIN_EMAIL=<your admin email>
TEST_ADMIN_PASSWORD=<your admin password>
LOGIN_RATE_LIMIT_MAX=200
WIDGET_SESSION_RATE_LIMIT_MAX=200
```

`TEST_WIDGET_KEY` is optional — if omitted, tests fetch it via the `/me` API using the admin credentials above.

---

## Running the tests

### Standard run (most common)

```bash
cd ~/nomii-ai
git pull
docker compose up --build -d   # backend on :3001, frontend (nginx) on :80
npm run test:e2e                # Playwright spins up Vite dev server on :5173
npm test                        # Phase 1 API tests (requires backend running)
```

### After code changes only (no server changes)

```bash
git pull
# Kill any stale Vite process so Playwright starts a fresh one
pkill -f "vite" 2>/dev/null || true
npm run test:e2e
```

### After backend changes only

```bash
git pull
docker compose up --build -d   # rebuild backend image
npm run test:e2e
```

### Interactive / debug

```bash
npm run test:e2e:headed    # watch Chromium run
npm run test:e2e:ui        # Playwright interactive UI (pick tests, time-travel)
npm run test:e2e:debug     # step-through debugger
npm run test:e2e:report    # open last HTML report
```

---

## Test file map

```
tests/
├── api.test.js                   # Phase 1 — plain Node.js, no test framework
└── e2e/
    ├── 01-login.spec.js          # 8 tests  — login/logout flow
    ├── 02-dashboard.spec.js      # 9 tests  — sidebar nav, protected routes
    ├── 03-widget.spec.js         # 12 tests — embed launcher, sessions, postMessage
    ├── 04-onboarding.spec.js     # 6 tests  — signup, onboarding wizard, email verify
    ├── helpers/
    │   ├── auth.js               # loginViaAPI(), loginViaUI(), getWidgetKey()
    │   └── constants.js          # selectors, timeouts, API_BASE, TEST_* vars
    └── report/                   # HTML report output (gitignored)
```

---

## Architecture notes

### Why `reuseExistingServer: true` (playwright.config.js)

Playwright's `webServer` block reuses whatever is already listening on the port instead of starting fresh. This means:

- **Backend (port 3001)**: reuses the Docker container — no `node server` process is started
- **Frontend (port 5173)**: starts a Vite dev server if nothing is on 5173, reuses it on subsequent runs

If you change frontend code and the old Vite process is still running, kill it first:
```bash
pkill -f "vite" 2>/dev/null || true
```

### Rate limits and test overrides

The backend uses in-memory rate limiters. Two limiters matter for tests:

| Limiter | Production default | Env var override | Why it matters |
|---|---|---|---|
| Login (`/api/auth/login`, `/api/onboard/login`) | 3/15min | `LOGIN_RATE_LIMIT_MAX` | Dashboard tests do 1 login; login tests do 3 |
| Widget session (`/api/widget/session`) | 6/5min | `WIDGET_SESSION_RATE_LIMIT_MAX` | Widget tests create ~12 sessions |

Set both to `200` in `.env` for testing. These are passed through `docker-compose.yml` to the backend container.

### Dashboard test auth pattern

`02-dashboard.spec.js` uses `beforeAll` to log in once and get a token, then injects it via `localStorage` in each `beforeEach`. This avoids hitting the login endpoint 9× per run.

### Widget authenticated session pattern

First-time authenticated users (new `email`) hit intro screens before `#chat-wrapper` becomes visible:
1. **Agent name screen** — "What would you like to name your assistant?"
2. **Customer name screen** — "What's your name?"

The `completeIntroScreens()` helper in `03-widget.spec.js` handles this automatically.

---

## Adding new tests

### New API test (Phase 1)

Add a new `async function test_<name>()` in `tests/api.test.js` following the existing pattern, then call it in the `main()` function.

### New E2E test

1. Add to the relevant spec file, or create `tests/e2e/05-<feature>.spec.js`
2. Use selectors from `helpers/constants.js` — add new ones there if needed
3. Use `loginViaAPI(page)` in `beforeAll` if the test needs auth
4. If testing the widget with a logged-in user, call `completeIntroScreens(iframe)` before asserting `#chat-wrapper`

### New widget test

```js
test('my new widget test', async ({ page }) => {
  await page.setContent(hostPageHTML());          // anonymous
  // OR
  await page.setContent(hostPageHTML({            // authenticated
    email: 'test@example.com',
    name: 'Test User',
  }));

  await page.locator(SEL_WIDGET.launcher).click();
  const iframe = page.frameLocator(SEL_WIDGET.iframe);

  // If authenticated, handle intro screens first:
  await completeIntroScreens(iframe);

  await expect(iframe.locator('#chat-wrapper')).toBeVisible({ timeout: 15_000 });
  // ... your assertions
});
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Expected 200, got 429` on login tests | Rate limit counter not reset | Restart Docker: `docker compose restart backend` |
| `#chat-wrapper` stays hidden | Widget session rate limit hit | Ensure `WIDGET_SESSION_RATE_LIMIT_MAX=200` is in root `.env`, then `docker compose up --build -d` |
| Dashboard test redirects to `/login` | Full page reload remounts `NomiiAuthProvider`, `getMe()` fails | Use `pushState` for navigation instead of `page.goto` |
| E2E tests use old frontend code | Stale Vite dev server on port 5173 | `pkill -f "vite"` then re-run |
| `dotenv injecting env (0)` | `server/.env` missing `TEST_ADMIN_EMAIL` etc. | Add required vars to `server/.env` |
| Playwright can't find Chromium | Not installed | `npx playwright install chromium --with-deps` |
