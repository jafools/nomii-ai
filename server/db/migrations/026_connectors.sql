-- Migration 026: Slack and Teams connector configuration
--
-- Stores per-tenant incoming webhook URLs for Slack and Microsoft Teams.
-- Tenants choose which events fire to each connector independently.
-- URLs are optional — NULL means the connector is not configured.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS slack_webhook_url   TEXT,
  ADD COLUMN IF NOT EXISTS teams_webhook_url   TEXT,
  ADD COLUMN IF NOT EXISTS slack_notify_events TEXT[] NOT NULL DEFAULT
    ARRAY['conversation.escalated','handoff.requested','human.takeover','csat.received'],
  ADD COLUMN IF NOT EXISTS teams_notify_events TEXT[] NOT NULL DEFAULT
    ARRAY['conversation.escalated','handoff.requested','human.takeover','csat.received'];
