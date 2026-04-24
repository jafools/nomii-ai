-- ============================================================
-- Migration 037 — Email suppression list (bounces + complaints)
--
-- Populated by the Resend webhook handler (POST /api/webhooks/resend)
-- on `email.bounced` (hard only) + `email.complained` events. Outbound
-- mail helpers consult this table before calling the transporter so we
-- don't burn through Resend's sending reputation by hammering an
-- address that already permfailed.
--
-- The primary key is the lowercased email so we get O(1) lookups and
-- natural dedup — repeat bounces just UPDATE the latest reason / raw
-- payload without inserting a new row.
--
-- Populated asynchronously — if a suppressed row hasn't landed yet
-- for a given recipient, the send still goes through. Trade-off: one
-- wasted send per recipient, never multiple. Acceptable.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_suppressions (
  email       TEXT PRIMARY KEY,
  reason      TEXT NOT NULL,           -- 'bounce' | 'complaint'
  bounce_type TEXT,                    -- 'hard' | 'soft' | NULL (for complaints)
  raw_event   JSONB,                   -- the Resend webhook payload
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_suppressions_reason_idx
  ON email_suppressions (reason);

COMMENT ON TABLE email_suppressions IS
  'Outbound mail deny-list populated by Resend webhook. Emails here are skipped by sendMail wrappers.';
