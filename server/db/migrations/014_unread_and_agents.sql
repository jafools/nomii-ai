-- ============================================================
-- Migration 014 — Unread flags + Multi-agent support
-- ============================================================

-- ------------------------------------------------------------
-- 1. Unread flag on conversations
--    Set to TRUE when the widget customer sends a new message.
--    Set to FALSE when a portal agent opens the conversation.
-- ------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS unread BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast badge queries (conversations.customer_id → customers.tenant_id)
CREATE INDEX IF NOT EXISTS idx_conversations_unread
  ON conversations (unread)
  WHERE unread = TRUE;

-- ------------------------------------------------------------
-- 2. Max agents per subscription plan
-- ------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS max_agents INTEGER NOT NULL DEFAULT 3;

-- Update limits per plan
UPDATE subscriptions SET max_agents = 1   WHERE plan = 'free';
UPDATE subscriptions SET max_agents = 3   WHERE plan = 'trial';
UPDATE subscriptions SET max_agents = 10  WHERE plan = 'starter';
UPDATE subscriptions SET max_agents = 25  WHERE plan = 'growth';
UPDATE subscriptions SET max_agents = 100 WHERE plan = 'professional';

-- ------------------------------------------------------------
-- 3. Expand tenant_admins role to include 'agent'
--    owner  = account owner, full access
--    member = legacy (treat as agent)
--    agent  = support agent invited by owner
-- ------------------------------------------------------------
ALTER TABLE tenant_admins
  DROP CONSTRAINT IF EXISTS tenant_admins_role_check;

ALTER TABLE tenant_admins
  ADD CONSTRAINT tenant_admins_role_check
  CHECK (role IN ('owner', 'member', 'agent'));

-- Add invite token columns for agent invite flow
ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS invite_token         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invite_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by           UUID REFERENCES tenant_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_admins_invite_token
  ON tenant_admins (invite_token)
  WHERE invite_token IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Status index on conversations
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations (status);
