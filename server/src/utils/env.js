/**
 * Thin helper over process.env for the SHENMAY_* namespace.
 *
 * Used everywhere self-hosted operators configure the backend via env vars
 * (LICENSE_KEY, LICENSE_MASTER, DEPLOYMENT, INSTANCE_ID, LICENSE_VALIDATE_URL).
 * Keeps the lookup in one place so adding another prefix later is a one-line
 * edit rather than a codebase sweep.
 */

function envVar(suffix, fallback) {
  const value = process.env[`SHENMAY_${suffix}`];
  return value != null ? value : fallback;
}

module.exports = { envVar };
