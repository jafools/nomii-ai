/**
 * SHENMAY AI — Webhook URL Validator (SSRF Guard)
 *
 * Rejects webhook URLs that point to private/internal infrastructure to prevent
 * Server-Side Request Forgery (SSRF) attacks.
 *
 * Blocks:
 *  - Non-HTTPS URLs
 *  - Localhost and loopback addresses
 *  - Private IP ranges (RFC 1918 + RFC 4193)
 *  - Link-local / cloud metadata endpoints (169.254.x.x)
 *  - Zero addresses
 *
 * Usage:
 *   const { validateWebhookUrl } = require('../utils/validateWebhookUrl');
 *   const err = validateWebhookUrl(url);
 *   if (err) return res.status(400).json({ error: err });
 */

const { URL } = require('url');
const dns = require('dns');

// Hostname blocklist patterns (checked before DNS resolution)
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0',
]);

// Regex patterns for private/internal hostnames
const BLOCKED_HOSTNAME_PATTERNS = [
  /^127\./,                         // IPv4 loopback
  /^10\./,                          // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./,    // RFC 1918 Class B
  /^192\.168\./,                    // RFC 1918 Class C
  /^169\.254\./,                    // Link-local / AWS metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // Shared address (CGNAT)
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 ULA
  /^fd[0-9a-f]{2}:/i,               // IPv6 ULA
  /^fe80:/i,                        // IPv6 link-local
  /^0\.0\.0\.0$/,                   // Zero address
  /^\[::1\]$/,                      // IPv6 loopback in brackets
];

/**
 * Synchronous validation of the URL string (no DNS resolution).
 * Returns an error string if invalid, or null if OK.
 *
 * @param {string} rawUrl
 * @returns {string|null}
 */
function validateWebhookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return 'Webhook URL is required';
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return 'Webhook URL is not a valid URL';
  }

  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    return 'Webhook URL must use HTTPS';
  }

  // Max URL length
  if (rawUrl.length > 512) {
    return 'Webhook URL is too long (max 512 characters)';
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return 'Webhook URL must point to a public server';
  }

  // Block private IP ranges and link-local addresses
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'Webhook URL must point to a public server';
    }
  }

  // Block URLs with credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    return 'Webhook URL must not contain credentials';
  }

  return null; // valid
}

module.exports = { validateWebhookUrl };
