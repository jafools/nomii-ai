-- Migration 023: Advisor handback notes
-- Adds a single-use note field on conversations that an advisor can set when
-- handing back to the AI. The widget.js chat route reads it once, injects it
-- into the system prompt as ## ADVISOR HANDOFF NOTE, then clears it.
--
-- Applied: 2026-03-27

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS handback_note TEXT;
