/**
 * Env var shim for the Nomii → Shenmay rebrand (Phase 4).
 *
 * Reads SHENMAY_<SUFFIX> first. Falls back to NOMII_<SUFFIX> with a one-time
 * deprecation warning so on-prem operators see it in their logs without their
 * existing .env files breaking. Removal of the NOMII_* fallback is tracked in
 * docs/SHENMAY_MIGRATION_PLAN.md Phase 8 (target 2026-10-20).
 */

const warned = new Set();

function envVar(suffix, fallback) {
  const newKey = `SHENMAY_${suffix}`;
  const oldKey = `NOMII_${suffix}`;

  if (process.env[newKey] != null) return process.env[newKey];

  if (process.env[oldKey] != null) {
    if (!warned.has(oldKey)) {
      warned.add(oldKey);
      console.warn(
        `[deprecated] ${oldKey} is deprecated — rename to ${newKey} ` +
        `before 2026-10-20 (6-month grace window, see docs/SHENMAY_MIGRATION_PLAN.md Phase 8)`
      );
    }
    return process.env[oldKey];
  }

  return fallback;
}

module.exports = { envVar };
