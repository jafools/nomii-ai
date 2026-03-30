-- ============================================================
-- Migration 006 — ToS Tracking & Customer Deletion Support
-- ============================================================

-- Record exactly when a tenant admin accepted the Terms of Service.
-- This creates a timestamped legal record of consent.
ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;

-- IP address at time of ToS acceptance — useful for legal disputes.
ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS tos_accepted_ip VARCHAR(64);

-- Flag on customers: soft-delete support for right-to-erasure requests.
-- When set, the customer record is anonymised rather than hard-deleted
-- so conversation history integrity is preserved.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
