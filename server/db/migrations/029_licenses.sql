-- ============================================================
-- Migration 029 — License keys for self-hosted deployments
--
-- Self-hosted operators must hold a valid license key issued
-- by Shenmay. This table is the authoritative record on the
-- Shenmay cloud instance. Self-hosted instances only hold the
-- key string in their .env; they ping /api/license/validate
-- on startup and every 24 hours to confirm validity.
-- ============================================================

CREATE TABLE IF NOT EXISTS licenses (
  id              SERIAL PRIMARY KEY,

  -- The opaque key sent by the self-hosted instance
  license_key     TEXT        NOT NULL UNIQUE,

  -- 'starter' | 'growth' | 'professional' | 'enterprise'
  plan            TEXT        NOT NULL DEFAULT 'starter',

  issued_to_email TEXT        NOT NULL,
  issued_to_name  TEXT,

  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,                         -- NULL = no expiry

  -- Populated the first time a specific instance validates
  instance_id     TEXT,

  -- Updated on every successful heartbeat
  last_ping_at    TIMESTAMPTZ,

  -- Allow admin to revoke without deleting the row
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Free-text notes for the Shenmay admin (not exposed to operator)
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS licenses_key_idx   ON licenses (license_key);
CREATE INDEX IF NOT EXISTS licenses_email_idx ON licenses (issued_to_email);
