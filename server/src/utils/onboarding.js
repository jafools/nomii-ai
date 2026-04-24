/**
 * Tenant onboarding-progress helpers.
 *
 * Each tenant row carries an `onboarding_steps` JSONB column of the shape
 * `{ "company": true, "products": true, ... }`. Completing a step means
 * merging that key. Portal routes call `markStepComplete(tenantId, 'products')`
 * after a successful first-write in a given domain.
 *
 * Extracted from a duplicate in portal.js + portal/api-key-routes.js so
 * the new portal sub-routers don't each re-declare it.
 */

const db = require('../db');

async function markStepComplete(tenantId, step) {
  await db.query(
    `UPDATE tenants
     SET onboarding_steps = onboarding_steps || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify({ [step]: true }), tenantId]
  );
}

module.exports = { markStepComplete };
