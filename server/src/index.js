/**
 * NOMII AI — Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { securityHeaders, portalCors } = require('./middleware/security');

// ── Startup secret validation ──────────────────────────────────────────────────
// Refuse to start in production with known-default secrets.
(function validateSecrets() {
  const BAD_SECRETS = new Set([
    'nomii-dev-secret',
    'nomii-dev-secret-change-in-production',
    'widget-dev-secret',
    'nomii-dev-encryption-key',
  ]);
  const isProd = process.env.NODE_ENV === 'production';
  const checks = [
    ['JWT_SECRET',                process.env.JWT_SECRET],
    ['WIDGET_JWT_SECRET',         process.env.WIDGET_JWT_SECRET],
    ['API_KEY_ENCRYPTION_SECRET', process.env.API_KEY_ENCRYPTION_SECRET],
  ];
  const issues = checks.filter(([, v]) => !v || BAD_SECRETS.has(v)).map(([k]) => k);
  if (issues.length > 0) {
    const msg = `[Security] WEAK / MISSING secrets: ${issues.join(', ')}`;
    if (isProd) {
      console.error(msg);
      console.error('[Security] Refusing to start in production with default secrets. Set proper values in .env');
      process.exit(1);
    } else {
      console.warn(msg);
      console.warn('[Security] Running with development fallback secrets — NEVER use this in production.\n');
    }
  }
})();

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy (Cloudflare Tunnel adds X-Forwarded-For)
// Required for express-rate-limit to correctly identify client IPs
app.set('trust proxy', 1);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Gracefully degrades: if express-rate-limit is not installed, uses passthrough.
// Install with: npm install express-rate-limit
function makeRateLimiter(opts) {
  try {
    return require('express-rate-limit')(opts);
  } catch {
    return (req, res, next) => next(); // passthrough if package missing
  }
}

// Widget session creation: 6 new sessions per 5 min per IP
// Prevents widget key scraping and anonymous session flooding
const widgetSessionLimiter = makeRateLimiter({
  windowMs: 5 * 60 * 1000,
  max:      6,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many session requests. Please wait a moment.' },
});

// Widget chat: 20 messages per minute per IP
// Primary cost-protection guard — each message calls the LLM
const widgetChatLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Message rate limit reached. Please slow down.' },
});

// Tenant registration: 3 per hour per IP (prevents spam accounts)
const registerLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  max:      3,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many registration attempts. Try again later.' },
});

// Tenant + portal login: 3 per 15 min per IP in production (brute-force protection)
// Non-production uses a high limit so automated test suites aren't blocked.
const loginLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'production' ? 3 : 500,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Global safety net: 150 req/min per IP (catches all other endpoints)
const globalLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      150,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please slow down.' },
});

// ── Security headers (applied before everything except widget routes) ─────────
// Widget routes AND static widget files are excluded:
//   - /api/widget/* — widget API endpoints, manage their own permissive CORS
//   - /widget.html  — loaded cross-origin in customer iframes; frame-ancestors 'none' would block it
//   - /embed.js     — loaded on third-party pages; restrictive headers would break it
function isWidgetPath(path) {
  return path.startsWith('/api/widget') || path === '/widget.html' || path === '/embed.js';
}

app.use((req, res, next) => {
  if (isWidgetPath(req.path)) return next();
  securityHeaders(req, res, next);
});

// ── CORS — portal / API routes (non-widget) ───────────────────────────────────
app.use((req, res, next) => {
  if (isWidgetPath(req.path)) return next(); // widget has its own CORS
  portalCors(req, res, next);
});

// Stripe webhook needs raw body BEFORE json parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripe-webhook'));

app.use(express.json({ limit: '10mb' }));

// Serve embed.js and widget.html from /server/public (cross-origin OK — handled per-route)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Global safety net (applied before all routes)
app.use(globalLimiter);

// Routes — External Data API (authenticated via data_api_key)
// Rate limit: 60 requests/min per IP
const dataApiLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      60,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Data API rate limit reached. Please slow down.' },
});
app.use('/api/v1', dataApiLimiter);
app.use('/api/v1', require('./routes/dataApi'));

// Routes — Widget (public, cross-origin, own CORS headers)
app.use('/api/widget/session', widgetSessionLimiter);
app.use('/api/widget/chat',    widgetChatLimiter);
app.use('/api/widget', require('./routes/widget'));

// Routes — Tenant Onboarding (public — registration + login)
app.use('/api/onboard/register', registerLimiter);
app.use('/api/onboard/login',    loginLimiter);
app.use('/api/onboard', require('./routes/onboard'));

// Routes — Tenant Portal (requires portal JWT)
app.use('/api/portal', require('./routes/portal'));

// Routes — Auth (public, no middleware)
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));

// Routes — Platform Admin (separate auth layer, no tenant scope)
app.use('/api/platform/auth',    require('./routes/platform/auth'));
app.use('/api/platform/tenants', require('./routes/platform/tenants'));

// Routes — Protected (auth middleware applied per-route)
app.use('/api/tenants', require('./routes/customTools'));   // custom tool builder (CRUD)
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/advisors', require('./routes/advisors'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/flags', require('./routes/flags'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'nomii-ai', timestamp: new Date().toISOString() });
});

// Error handler — never expose internal details in production
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error('[ERROR]', status, err.message);
  // Only surface the original message for expected, intentional errors (4xx).
  // For unexpected server errors, send a generic message to avoid leaking internals.
  const safe = status < 500
    ? (err.message || 'Bad request')
    : 'An unexpected error occurred. Please try again.';
  res.status(status).json({ error: safe });
});

app.listen(PORT, () => {
  console.log(`\n🧠 Nomii AI server running on http://localhost:${PORT}`);
  console.log(`   LLM Provider: ${process.env.LLM_PROVIDER || 'mock'}\n`);

  // ── Start data retention cron job ──────────────────────────────────────────
  // Gracefully degrades if the job module fails (won't crash server startup).
  try {
    require('./jobs/dataRetention').start();
  } catch (err) {
    console.error('[Startup] Data retention job failed to start:', err.message);
  }
});
