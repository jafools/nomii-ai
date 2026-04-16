/**
 * NOMII AI — Security Headers Middleware
 *
 * Applies HTTP security headers to all non-widget responses.
 * Widget routes use permissive CORS (cross-origin iframe) and are handled separately.
 *
 * Headers applied:
 *   X-Content-Type-Options      — Prevent MIME sniffing
 *   X-Frame-Options             — Prevent clickjacking (portal / dashboard)
 *   Strict-Transport-Security   — Force HTTPS in production
 *   Content-Security-Policy     — Restrict JS/CSS/image origins
 *   Referrer-Policy             — Limit referrer leakage
 *   Permissions-Policy          — Disable unused browser features
 *   X-XSS-Protection            — Legacy XSS filter (belt + suspenders)
 *   X-DNS-Prefetch-Control      — Prevent DNS prefetch leakage
 *
 * CORS hardening:
 *   Portal + auth routes only accept requests from the known frontend origin.
 *   Unknown origins receive a 403 for non-simple requests.
 *   Widget routes opt out of this middleware (they manage their own CORS).
 *
 * Note: X-Powered-By is removed in the bootstrap below (express default).
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',                                        // Vite dev
  'http://localhost:3000',                                        // Local preview
  'https://nomii.pontensolutions.com',                            // Production portal (primary)
  'https://pontensolutions.com',                                  // Marketing site (license purchase page)
  process.env.FRONTEND_URL,                                       // Override via env
  process.env.FRONTEND_URL_PROD,                                  // Additional override
].filter(Boolean);

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Apply security headers to portal / API responses.
 * Should NOT be applied to widget routes (they run in customer iframes).
 */
function securityHeaders(req, res, next) {
  // Remove Express fingerprint
  res.removeHeader('X-Powered-By');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent this page from being embedded in <iframe> on other origins
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Legacy XSS protection (belt + suspenders alongside CSP)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent DNS prefetching from leaking visited URLs
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Force HTTPS in production — 1 year HSTS with subdomains
  if (IS_PROD) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Limit referrer information to same origin only
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable features that Nomii doesn't use
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()'
  );

  // Content Security Policy
  // - default-src 'self' limits all content to own origin
  // - script-src adds 'unsafe-inline' only for dev (CSP nonces needed for full hardening)
  // - connect-src allows Anthropic API calls from the browser (if any)
  const cspDirectives = [
    "default-src 'self'",
    IS_PROD
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",    // inline styles needed for React
    "img-src 'self' data: https:",         // data URIs for logos, external images
    "font-src 'self' data: https:",
    "connect-src 'self' https://api.anthropic.com",
    "frame-ancestors 'none'",              // no embedding of our portal
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  next();
}

/**
 * CORS middleware for portal / API routes (non-widget).
 *
 * Allows:
 *   - Requests from known frontend origins
 *   - Preflight (OPTIONS) requests
 *   - Credentials (cookies / Authorization header)
 *
 * Rejects requests from unknown origins in production.
 */
function portalCors(req, res, next) {
  const origin = req.headers.origin;

  if (!origin) {
    // Server-to-server or same-origin request — allow
    return next();
  }

  const allowed = ALLOWED_ORIGINS.includes(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    );
    res.setHeader('Vary', 'Origin');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    if (allowed) {
      return res.sendStatus(204);
    }
    return res.sendStatus(403);
  }

  // In development, allow all origins (for localhost flexibility)
  if (!IS_PROD && !allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  next();
}

module.exports = { securityHeaders, portalCors };
