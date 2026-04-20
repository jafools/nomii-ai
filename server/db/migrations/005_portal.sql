-- ============================================================
-- Migration 005 — Tenant Portal (Phase 3)
-- Self-serve onboarding + tenant admin accounts + products
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tenant admin accounts
--    Separate from customer/advisor/admin roles.
--    These are the people who log into pontensolutions.com
--    to manage their Shenmay tenant.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_admins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  first_name       VARCHAR(100),
  last_name        VARCHAR(100),
  role             VARCHAR(20) NOT NULL DEFAULT 'owner'
                   CHECK (role IN ('owner', 'member')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_admins_tenant ON tenant_admins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admins_email  ON tenant_admins(email);


-- ------------------------------------------------------------
-- 2. Products / services table
--    What the tenant sells or does — injected into agent
--    system prompt so agents can answer product questions.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  price_info  VARCHAR(255),
  notes       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_products_tenant ON tenant_products(tenant_id);


-- ------------------------------------------------------------
-- 3. New columns on tenants
-- ------------------------------------------------------------

-- Track which onboarding wizard steps have been completed
-- e.g. {"company": true, "products": true, "customers": false, "widget": false, "test": false}
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS onboarding_steps JSONB NOT NULL DEFAULT '{}';

-- Set when embed.js phones home for the first time — drives the
-- green "widget connected" indicator in the onboarding wizard
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS widget_verified_at TIMESTAMPTZ;

-- Freeform company description fed into the agent system prompt
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS company_description TEXT;

-- Logo URL (uploaded to a CDN or stored as base64 reference)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);

-- Public-facing website URL (used for context + widget verification link)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);


-- ------------------------------------------------------------
-- 4. Backfill onboarding_steps for existing tenants
--    Mark all steps complete so existing tenants (Covenant Trust,
--    HFTN) don't get dropped into the wizard on first portal login.
-- ------------------------------------------------------------
UPDATE tenants
SET onboarding_steps = '{"company": true, "products": true, "customers": true, "widget": true, "test": true}'::jsonb
WHERE onboarding_steps = '{}';
