-- ============================================================================
-- 035_portal_auth.sql — Shenmay-native customer license portal auth
-- ============================================================================
--
-- Replaces the Lateris Worker-backed portal flow for Shenmay licenses. After
-- this migration the /api/public/portal/* endpoints in Shenmay's backend can
-- own the full magic-link + session auth flow without any cross-system call.
--
-- Three tables:
--   portal_login_tokens  — single-use magic-link tokens (15-min TTL)
--   portal_sessions      — authenticated sessions (30-day TTL)
--   portal_rate_limits   — per-email + per-IP hourly bucket counters
--
-- No GDPR concern: email addresses stored here are the same ones already in
-- the `licenses` table (issued_to_email), which is the identifier customers
-- paid under. Deleting a license does NOT cascade; cleanup is via the expiry
-- cron below.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_login_tokens (
  token        TEXT         PRIMARY KEY,
  email        TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  NOT NULL,
  consumed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS portal_login_tokens_email_idx   ON portal_login_tokens (email);
CREATE INDEX IF NOT EXISTS portal_login_tokens_expires_idx ON portal_login_tokens (expires_at);

CREATE TABLE IF NOT EXISTS portal_sessions (
  session_token  TEXT         PRIMARY KEY,
  email          TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ  NOT NULL,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS portal_sessions_email_idx   ON portal_sessions (email);
CREATE INDEX IF NOT EXISTS portal_sessions_expires_idx ON portal_sessions (expires_at);

CREATE TABLE IF NOT EXISTS portal_rate_limits (
  scope        TEXT    NOT NULL,  -- 'email' or 'ip'
  identifier   TEXT    NOT NULL,  -- lowercased email or IP string
  bucket_hour  BIGINT  NOT NULL,  -- floor(Date.now() / 3_600_000)
  count        INT     NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, identifier, bucket_hour)
);

CREATE INDEX IF NOT EXISTS portal_rate_limits_bucket_idx ON portal_rate_limits (bucket_hour);
