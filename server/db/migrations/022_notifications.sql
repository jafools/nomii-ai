-- Migration 022: In-app notification system
--
-- Stores real-time alerts for portal advisors:
--   type = 'flag'        → customer raised a concern via widget
--   type = 'human_reply' → customer sent a message while conversation is in human mode
--   type = 'escalation'  → AI auto-escalated a conversation
--
-- Queried by GET /api/portal/notifications (last 30, newest first)
-- Cleared by PATCH /api/portal/notifications/mark-read

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,          -- 'flag' | 'human_reply' | 'escalation'
  title         TEXT        NOT NULL,
  body          TEXT,                          -- short preview / description
  resource_type TEXT,                          -- 'conversation'
  resource_id   UUID,                          -- conversation_id to deep-link into
  customer_name TEXT,                          -- display name for the notification row
  read_at       TIMESTAMPTZ,                   -- NULL = unread
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast unread count per tenant
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
  ON notifications(tenant_id, read_at)
  WHERE read_at IS NULL;

-- Fast recent feed per tenant
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_recent
  ON notifications(tenant_id, created_at DESC);

-- Auto-expire notifications older than 30 days (keeps the table lean)
-- Run via pg_cron or the data-retention job — not enforced at insert time.
-- The portal endpoint already limits to 30 rows so old rows are invisible anyway.
