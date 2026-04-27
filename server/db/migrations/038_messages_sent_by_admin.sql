-- ============================================================
-- Migration 038 — Per-message human-sender attribution
--
-- Adds messages.sent_by_admin_id so a human reply (sent through
-- POST /api/portal/conversations/:id/reply) can be distinguished
-- from an AI reply in transcripts and UI. Both have role='agent'
-- already; the new column tells reviewers / auditors which voice
-- was actually a human and who that human was.
--
-- Surfaced by the Apr-27 v3.3.17 Conversations deep-test: after
-- a takeover, every human reply landed in the DB indistinguishable
-- from an AI reply. The conversations table tracks the *currently
-- assigned* human via human_agent_id, but a single conversation
-- can rotate through multiple humans, and a transcript needs to
-- say which one sent which message — not just who is currently
-- on the seat.
--
-- ON DELETE SET NULL preserves transcript integrity if the admin
-- account is later removed (mirrors conversations.human_agent_id
-- in migration 013).
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sent_by_admin_id UUID
    REFERENCES tenant_admins(id) ON DELETE SET NULL;

COMMENT ON COLUMN messages.sent_by_admin_id IS
  'When a human agent replies via the portal, the tenant_admin who sent it. NULL for AI replies + customer messages + system notices. Independent of conversations.human_agent_id (which tracks the currently-assigned admin, not the sender of any specific message).';
