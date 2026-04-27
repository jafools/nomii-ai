/**
 * SHENMAY AI — Rate Limit Helper
 *
 * Thin wrapper around `express-rate-limit` that gracefully degrades to a
 * passthrough middleware if the package isn't installed (so the server can
 * boot in environments where the optional dep is missing).
 *
 *   const limiter = makeRateLimiter({ windowMs: 60000, max: 100, … });
 *   app.use('/api/something', limiter);
 *
 * Install with: npm install express-rate-limit
 */

function makeRateLimiter(opts) {
  try {
    return require('express-rate-limit')(opts);
  } catch {
    // Passthrough if package missing — server still boots, no limiting
    return (req, res, next) => next();
  }
}

module.exports = { makeRateLimiter };
