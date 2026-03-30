-- =============================================================================
-- Migration 020 — GDPR / Privacy Compliance Infrastructure
-- =============================================================================
--
-- This migration adds the database layer required for:
--   1. AUDIT LOGGING         — every sensitive data access is logged
--   2. GDPR ERASURE          — customers can request full data deletion
--   3. GDPR CONSENT          — widget consent timestamp capture
--   4. DATA RETENTION        — per-tenant configurable retention windows
--   5. PGCRYPTO EXTENSION    — prerequisite for future column-level encryption
--
-- Compliant with: GDPR (EU), CCPA/CPRA (California), GLBA (financial),
--                 general US state privacy laws (VCDPA, CPA, CTDPA, etc.)
--
-- Safe to re-run (uses IF NOT EXISTS / DO $$ blocks throughout).
-- =============================================================================


-- ── 0. Enable pgcrypto (required for future at-rest column encryption) ────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── 1. AUDIT LOGS ─────────────────────────────────────────────────────────────
--
-- Records every meaningful data access event:
--   - Portal logins / logout
--   - Customer record reads (advisor accessing a profile)
--   - Memory / soul file reads and writes
--   - Data exports
--   - Deletion requests + completions
--   - Failed authentication attempts
--
-- Retention: audit logs are kept for 7 years by default (legal requirement).
-- They are NEVER purged by the data retention cron job.
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Actor — who performed the action
    actor_type      VARCHAR(30) NOT NULL
                    CHECK (actor_type IN ('advisor', 'admin', 'platform_admin', 'customer', 'system', 'widget')),
    actor_id        UUID,                           -- NULL for system/widget events
    actor_email     VARCHAR(255),                   -- denormalised for readability after deletion

    -- Scope — which tenant + customer was affected
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
    customer_id     UUID,                           -- NOT a FK — survives customer deletion

    -- Event — what happened
    event_type      VARCHAR(60) NOT NULL,           -- e.g. 'customer.read', 'auth.login.success'
    resource_type   VARCHAR(60),                    -- e.g. 'customer', 'memory_file', 'conversation'
    resource_id     UUID,                           -- the ID of the accessed resource
    description     TEXT,                           -- human-readable detail

    -- Request context
    ip_address      INET,
    user_agent      TEXT,
    http_method     VARCHAR(10),
    request_path    VARCHAR(500),

    -- Outcome
    success         BOOLEAN NOT NULL DEFAULT true,
    error_message   TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant      ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_customer    ON audit_logs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor       ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event       ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created     ON audit_logs(created_at DESC);

-- Audit logs are append-only — no update trigger needed.


-- ── 2. GDPR COMPLIANCE COLUMNS ON CUSTOMERS ──────────────────────────────────

-- Consent tracking (widget / portal sign-up)
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS consent_given_at    TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS consent_ip          INET        DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS consent_version     VARCHAR(20) DEFAULT NULL; -- e.g. '2024-01'

-- Deletion / Erasure workflow
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS deletion_requested_at  TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deletion_requested_by  UUID        DEFAULT NULL, -- advisor or customer id
    ADD COLUMN IF NOT EXISTS anonymized_at           TIMESTAMPTZ DEFAULT NULL;

-- Data portability flag (export already requested)
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS last_export_at  TIMESTAMPTZ DEFAULT NULL;


-- ── 3. DATA RETENTION CONFIG ON TENANTS ──────────────────────────────────────
--
-- message_retention_days:  How many days to keep raw message bodies.
--                          Default 730 (2 years). Minimum 90 (legal counsel advised).
--                          NULL = keep forever (not recommended).
--
-- anon_session_ttl_days:   How long to keep anonymous visitor sessions.
--                          Default 30 days. Anonymous data is lower risk but
--                          GDPR still applies to any fingerprint-linked data.
--
-- gdpr_contact_email:      DPO or privacy contact — required for GDPR Article 37.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS message_retention_days  INTEGER     DEFAULT 730
                             CHECK (message_retention_days IS NULL OR message_retention_days >= 90),
    ADD COLUMN IF NOT EXISTS anon_session_ttl_days   INTEGER     DEFAULT 30
                             CHECK (anon_session_ttl_days >= 7),
    ADD COLUMN IF NOT EXISTS gdpr_contact_email      VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS data_processing_basis   VARCHAR(30)  DEFAULT 'legitimate_interest'
                             CHECK (data_processing_basis IN (
                                 'consent', 'contract', 'legitimate_interest',
                                 'legal_obligation', 'vital_interests', 'public_task'
                             ));


-- ── 4. INDEX: FAST ANONYMOUS SESSION LOOKUP (for TTL purge) ──────────────────
--
-- Queries the customers table for anon sessions older than TTL.
-- Pattern: is_active = false OR (email ILIKE '%@visitor.nomii%' AND last_interaction_at < cutoff)

CREATE INDEX IF NOT EXISTS idx_customers_anon_cleanup
    ON customers(tenant_id, last_interaction_at)
    WHERE email ILIKE '%@visitor.nomii%';


-- ── 5. INDEX: FAST DELETION QUEUE LOOKUP ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_deletion_queue
    ON customers(deletion_requested_at)
    WHERE deletion_requested_at IS NOT NULL AND anonymized_at IS NULL;


-- ── 6. CONVERSATIONS: add soft-purge tracking ─────────────────────────────────
--
-- messages_purged_at: set by the retention cron once message bodies are deleted
-- but the conversation metadata (started_at, ended_at, summary) is kept for
-- analytics. This is the "pseudonymisation" approach GDPR endorses.

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS messages_purged_at  TIMESTAMPTZ DEFAULT NULL;


-- Done.
-- Verify:
--   SELECT COUNT(*) FROM audit_logs;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name LIKE 'consent%';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants'   AND column_name LIKE '%retention%';
