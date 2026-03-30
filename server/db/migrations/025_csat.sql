-- Migration 025: Customer satisfaction (CSAT) ratings
-- Customers can optionally rate a conversation when they close the widget.
-- csat_score: 1 = thumbs down, 2 = thumbs up (binary for simplicity)
-- csat_comment: optional short freeform note (max 500 chars)

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS csat_score        SMALLINT     CHECK (csat_score IN (1, 2)),
  ADD COLUMN IF NOT EXISTS csat_comment      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS csat_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_csat ON conversations(csat_score)
  WHERE csat_score IS NOT NULL;
