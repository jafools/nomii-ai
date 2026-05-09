-- 040_brand_learning.sql
--
-- Brand Learning — Anonymous-Visitor Loop (v3.5.0)
--
-- Adds tenant-level "brand learning" artifacts that accumulate
-- BUSINESS-RELEVANT memory over time from anonymous-visitor widget
-- conversations. Mirrors the per-customer soul_file/memory_file pattern but
-- keyed by tenant_id and fed exclusively from anon (`@visitor.shenmay`)
-- conversations.
--
-- Design constraints:
--   - Never store PII. Pre-distillation regex scrub via piiTokenizer +
--     LLM-prompt anti-extraction + outbound BreachError audit defends this.
--   - Frequency promotion (default N=3 distinct sessions) is a hard gate
--     before any candidate fact promotes into brand_soul.
--   - Tenant-scoped only — no cross-tenant joins anywhere in the worker.
--
-- See docs/BRAND_LEARNING_SCOPE.md for the full design.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS brand_learning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS brand_learning_min_sessions INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS brand_learning_auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS brand_soul JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_memory JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audience_profile JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_learning_processed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_learning_last_run_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS brand_learning_sessions_processed INT NOT NULL DEFAULT 0;

-- Range guard for the frequency threshold (1..50). Keeps a malicious
-- direct-DB write or a future API edit from disabling promotion entirely
-- (N=0 → every observation promotes) or pinning it so high nothing ever
-- promotes (N=10000 → silent no-op).
--
-- Wrapped in a DO block because PostgreSQL ≤16 has no
-- `ADD CONSTRAINT IF NOT EXISTS` — direct ALTER TABLE ADD CONSTRAINT
-- throws "constraint already exists" on second run, which trips the
-- backend's auto-migrate idempotency. See
-- feedback_pg_add_constraint_no_if_not_exists memory.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_learning_min_sessions_range'
      AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT brand_learning_min_sessions_range
      CHECK (brand_learning_min_sessions BETWEEN 1 AND 50);
  END IF;
END$$;

-- Audit table for brand-learning incidents. Visible to tenant in dashboard;
-- catches anything the worker had to defend against (PII residue,
-- promotion blocked, kill-switch invoked).
CREATE TABLE IF NOT EXISTS brand_learning_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'pii_breach',          -- auditOutbound() found residual PII; write aborted
    'distill_skip_no_key', -- no LLM key for this tenant; cycle skipped
    'distill_failed',      -- LLM call errored or returned unparseable JSON
    'promotion_blocked',   -- candidate failed frequency threshold
    'kill_switch_used',    -- tenant wiped brand_soul + disabled learning
    'auto_disabled'        -- worker disabled learning after repeated failures
  )),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_learning_incidents_tenant
  ON brand_learning_incidents(tenant_id, created_at DESC);

COMMENT ON COLUMN tenants.brand_learning_enabled IS
  'When TRUE, the nightly brandLearningWorker distills anon conversations into brand_soul/brand_memory/audience_profile. Default OFF — opt-in.';
COMMENT ON COLUMN tenants.brand_soul IS
  'Distilled, durable brand knowledge promoted from anon conversations. Injected into the anon-widget system prompt. PII-scrubbed. JSONB.';
COMMENT ON COLUMN tenants.brand_memory IS
  'Working state for the brand-learning loop — recent observations not yet promoted to brand_soul. Rolling window. JSONB.';
COMMENT ON COLUMN tenants.audience_profile IS
  'Aggregate buyer-persona patterns: pain points, request types, objections. Read-only context for the agent. JSONB.';
COMMENT ON COLUMN tenants.brand_learning_processed_at IS
  'Watermark — anon messages with created_at > this value are eligible for the next worker cycle.';
COMMENT ON COLUMN tenants.brand_learning_min_sessions IS
  'Frequency threshold — a candidate fact only promotes to brand_soul once observed in this many distinct anon sessions.';
