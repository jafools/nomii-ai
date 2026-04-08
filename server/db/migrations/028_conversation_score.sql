-- Migration 028: Per-conversation advisor quality score
-- Advisors rate AI performance 1–5 stars after a conversation ends.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS conversation_score SMALLINT
    CHECK (conversation_score BETWEEN 1 AND 5);
