-- ============================================================
-- Migration 031 — Per-tenant PII tokenization toggle + breach log
--
-- Adds:
--   1. tenants.pii_tokenization_enabled  — BOOLEAN, default TRUE.
--      When true, outbound LLM payloads have identifiers swapped
--      for opaque tokens ([SSN_1], [EMAIL_1], etc.) before Anthropic
--      sees them; response is swapped back before being shown to the
--      user. Default ON so the strongest posture ships by default
--      on new tenants and after this migration applies.
--
--   2. pii_breach_log table — one row per blocked outbound request.
--      Records the tenant, timestamp, and a structured list of
--      findings (TYPE + short sample with the middle redacted).
--      Never stores the raw PII. Retained indefinitely for audit.
--
-- Runbook: enabled flag defaults TRUE for ALL tenants in this
-- migration. Emergency kill-switch: set env PII_TOKENIZER_ENABLED=false
-- to force-off globally regardless of tenant flag. See
-- docs/marketing/PII-PROTECTION.md.
--
-- Safe to re-run.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pii_tokenization_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN tenants.pii_tokenization_enabled IS
  'When true, regulated identifiers (SSN, CC, IBAN, phone, email, DOB, postcode, account numbers) are tokenized before LLM calls and swapped back in responses. Names are pseudonymized using memory_file structure. Default true.';


CREATE TABLE IF NOT EXISTS pii_breach_log (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
    conversation_id   UUID,                                -- nullable; memory updater calls have no conv
    customer_id       UUID,                                -- nullable
    findings          JSONB NOT NULL,                      -- [{type, sample, offset, location?}]
    call_site         VARCHAR(60),                         -- 'chat' | 'memoryUpdater' | 'toolLoop'
    blocked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pii_breach_log_tenant_idx
  ON pii_breach_log (tenant_id, blocked_at DESC);

COMMENT ON TABLE pii_breach_log IS
  'Audit trail of outbound LLM requests that the breach detector blocked. One row = one near-leak. The `findings` column contains TYPE + a partial sample with the middle redacted — never the raw PII.';
