/**
 * Thin helper over process.env for the SHENMAY_* namespace.
 *
 * Used everywhere self-hosted operators configure the backend via env vars
 * (LICENSE_KEY, LICENSE_MASTER, DEPLOYMENT, INSTANCE_ID, LICENSE_VALIDATE_URL).
 * Keeps the lookup in one place so adding another prefix later is a one-line
 * edit rather than a codebase sweep.
 *
 * Reads SHENMAY_<suffix> first; falls back to legacy NOMII_<suffix> so
 * .env files written before the Phase 6 rebrand (2026-04-23) keep working
 * without operator intervention. Drop the NOMII_* branch once the legacy
 * prefix has been absent from every active install for at least one full
 * release cycle.
 */

function envVar(suffix, fallback) {
  const value = process.env[`SHENMAY_${suffix}`] ?? process.env[`NOMII_${suffix}`];
  return value != null ? value : fallback;
}

module.exports = { envVar };
