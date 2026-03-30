-- =============================================================================
-- Migration 017 — Data API Keys
-- Adds a dedicated secret key per tenant for programmatic data ingestion.
-- This key is SEPARATE from the BYOK Anthropic key and the widget embed key.
-- Tenants use it to authenticate requests to POST /api/v1/customers/*
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS data_api_key_hash   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_api_key_prefix TEXT    DEFAULT NULL;

-- data_api_key_hash  : bcrypt hash of the full key (never stored plain)
-- data_api_key_prefix: first 8 chars of the key, shown in UI as "nomii_da_xxxxxxxx..."

COMMENT ON COLUMN tenants.data_api_key_hash   IS 'bcrypt hash of the data ingestion API key';
COMMENT ON COLUMN tenants.data_api_key_prefix IS 'First 8 chars of key for display (safe to show)';
