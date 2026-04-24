/**
 * Run-mode helpers.
 *
 * The Playwright suite runs in three modes (set via PLAYWRIGHT_MODE):
 *
 *   'local'        — dev laptop, server + client spun up by webServer blocks
 *                    (default when PLAYWRIGHT_MODE is unset)
 *   'saas-ci'      — GH Actions `e2e-saas` job against a CI Postgres service
 *   'onprem'       — GH Actions `onprem-e2e` job against docker-compose.selfhosted.yml
 *   'saas-staging' — (future) PR comment / nightly cron against nomii-staging
 *
 * Specs use these helpers to skip themselves when their feature surface
 * isn't available in the current mode (e.g. signup flow in onprem, where
 * registration is disabled).
 */

const MODE = (process.env.PLAYWRIGHT_MODE || 'local').toLowerCase();

function mode() { return MODE; }
function isLocal()       { return MODE === 'local'; }
function isSaasCi()      { return MODE === 'saas-ci'; }
function isOnprem()      { return MODE === 'onprem'; }
function isSaasStaging() { return MODE === 'saas-staging'; }

/** True for any SaaS-capable environment (local dev, SaaS CI, staging). */
function isSaas()   { return !isOnprem(); }

/** True when the test runner can reach the backend's DB directly. */
function hasDbAccess() {
  return (isLocal() || isSaasCi()) && process.env.PLAYWRIGHT_SKIP_SEED !== '1';
}

module.exports = { mode, isLocal, isSaasCi, isOnprem, isSaasStaging, isSaas, hasDbAccess };
