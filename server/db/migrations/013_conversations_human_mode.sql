-- Migration 013: Human support takeover mode for conversations
--
-- Adds two columns to conversations:
--   mode           — 'ai' (default) or 'human' (human agent has taken over)
--   human_agent_id — which tenant_admin is currently handling the conversation

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'ai'
    CHECK (mode IN ('ai', 'human')),
  ADD COLUMN IF NOT EXISTS human_agent_id UUID REFERENCES tenant_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_mode ON conversations(mode) WHERE mode = 'human';
