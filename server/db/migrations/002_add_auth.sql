-- ============================================================
-- SHENMAY AI — Migration 002: Authentication
-- Adds password_hash to customers and advisors for JWT auth
-- ============================================================

-- Add password_hash to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add password_hash to advisors
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add indexes for auth lookups (email + tenant_id)
CREATE INDEX IF NOT EXISTS idx_customers_auth ON customers (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_advisors_auth ON advisors (tenant_id, email);

-- Add unique constraint: one email per tenant per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers (tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_advisors_tenant_email ON advisors (tenant_id, email);
