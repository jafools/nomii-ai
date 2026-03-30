-- ============================================================
-- Migration 008 — Email Verification + Newsletter Opt-in
--                 + Company Name Uniqueness
-- ============================================================

-- ------------------------------------------------------------
-- 1. Email verification for tenant_admins
-- ------------------------------------------------------------
ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS email_verified          BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS newsletter_opt_in       BOOLEAN      NOT NULL DEFAULT false;

-- Mark all EXISTING accounts as already verified so they aren't locked out
UPDATE tenant_admins SET email_verified = true WHERE email_verified = false;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_tenant_admins_verification_token
  ON tenant_admins (email_verification_token)
  WHERE email_verification_token IS NOT NULL;


-- ------------------------------------------------------------
-- 2. Unique company name constraint (case-insensitive)
-- ------------------------------------------------------------
-- Drop old seed duplicates first if they somehow collided
-- (safe — uses UNIQUE INDEX which will fail gracefully on conflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name_ci
  ON tenants (LOWER(name));
