-- ============================================================
-- NOMII AI — Migration 004: Widget API Keys
-- Adds a widget_api_key to each tenant so their website can
-- authenticate embed widget sessions without exposing passwords.
-- ============================================================

-- pgcrypto is required for gen_random_bytes() used below
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS widget_api_key VARCHAR(64) UNIQUE;

-- Generate a default key for any existing tenants
UPDATE tenants
SET widget_api_key = encode(gen_random_bytes(32), 'hex')
WHERE widget_api_key IS NULL;

-- Index for fast key lookup on every widget session request
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_widget_api_key ON tenants(widget_api_key);
