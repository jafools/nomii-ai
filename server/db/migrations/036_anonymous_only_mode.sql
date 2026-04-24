-- ============================================================
-- Migration 036 — Per-tenant "anonymous-only" widget mode
--
-- Adds: tenants.anonymous_only_mode — BOOLEAN, default FALSE.
--
-- When true, the widget ALWAYS runs in anonymous mode for this tenant:
--   - POST /api/widget/session ignores any `email` / `display_name`
--     passed from the host page and creates an anonymous customer +
--     session just like a visitor with no identity
--   - POST /api/widget/session/claim refuses with 403
--     { error: 'anonymous_only_mode' } so identification attempts
--     after the fact don't attach the conversation to a real customer
--
-- Intended for tenants who operate in regulated or privacy-sensitive
-- verticals where persistent per-customer memory is not acceptable.
-- The widget still functions — the user gets responses in-session —
-- but nothing crosses the session boundary. Existing data retention
-- jobs (server/src/jobs/dataRetention.js) already purge anon rows.
--
-- Default FALSE so behavior is unchanged for all tenants after this
-- migration applies. Only owners can flip this flag from the portal.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS anonymous_only_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tenants.anonymous_only_mode IS
  'When true, widget forces anonymous mode regardless of SPA identification. See migration 036.';
