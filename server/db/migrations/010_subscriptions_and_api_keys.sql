-- ============================================================
-- Migration 010: Subscriptions, Licensing & Per-Tenant API Keys
-- ============================================================
--
-- Adds subscription/license tracking and per-tenant LLM API key storage.
-- Supports: free trial, paid plans, master account bypass, BYOK API keys.
--

-- ── Subscription plans enum ──────────────────────────────────────────────────
-- free       → Permanent free tier (10 customers, 50 msgs/month)
-- trial      → Legacy 14-day free trial
-- starter    → Paid entry tier
-- growth     → Mid tier
-- professional → High tier
-- enterprise → Custom / unlimited
-- master     → Platform owner — never expires, never restricted
DO $$ BEGIN
  CREATE TYPE subscription_plan AS ENUM ('free', 'trial', 'starter', 'growth', 'professional', 'enterprise', 'master');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Subscriptions table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Plan & Status
    plan                subscription_plan NOT NULL DEFAULT 'trial',
    status              subscription_status NOT NULL DEFAULT 'trialing',

    -- Limits (per plan)
    max_customers       INTEGER NOT NULL DEFAULT 25,       -- trial default
    max_messages_month  INTEGER NOT NULL DEFAULT 500,      -- trial default
    managed_ai_enabled  BOOLEAN NOT NULL DEFAULT false,    -- whether platform provides the API key

    -- Billing
    stripe_customer_id     VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_price_id        VARCHAR(255),

    -- Dates
    trial_starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    canceled_at         TIMESTAMPTZ,

    -- Usage tracking (reset monthly via cron or Stripe webhook)
    messages_used_this_month INTEGER NOT NULL DEFAULT 0,
    usage_reset_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT one_subscription_per_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant   ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe   ON subscriptions(stripe_customer_id);


-- ── Per-tenant API key columns on tenants ────────────────────────────────────
-- llm_api_key_encrypted: AES-256-GCM encrypted key (stored as base64)
-- llm_api_key_iv:        initialization vector for decryption
-- llm_api_key_provider:  which provider this key is for (anthropic, openai)
-- llm_api_key_validated: whether the key passed a test call

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS llm_api_key_encrypted  TEXT,
  ADD COLUMN IF NOT EXISTS llm_api_key_iv         TEXT,
  ADD COLUMN IF NOT EXISTS llm_api_key_provider   VARCHAR(50) DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS llm_api_key_validated   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS llm_api_key_last4       VARCHAR(4);


-- ── Auto-create a trial subscription for existing tenants ────────────────────
INSERT INTO subscriptions (tenant_id, plan, status, trial_starts_at, trial_ends_at)
SELECT id, 'trial', 'trialing', created_at, created_at + INTERVAL '14 days'
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM subscriptions)
ON CONFLICT (tenant_id) DO NOTHING;
