-- ============================================================
-- Migration 030 — Self-hosted license key on tenant row
--
-- Adds optional storage of the license key on the tenant so
-- self-hosted operators can activate / change their license
-- from the dashboard (instead of editing .env + restarting).
--
-- Precedence on backend startup:
--   1. process.env.NOMII_LICENSE_KEY  (existing operator behaviour)
--   2. tenants.license_key            (new: dashboard-activated)
--   3. neither                        → trial mode
--
-- The key is stored plaintext: it's already plaintext in .env
-- and in the email the customer received. The licenses table
-- on the master is the authoritative ledger.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS license_key              TEXT,
  ADD COLUMN IF NOT EXISTS license_key_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tenants_license_key_idx ON tenants (license_key)
  WHERE license_key IS NOT NULL;
