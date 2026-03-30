-- Migration 007: Add external_id to customers, relax name constraints
--
-- external_id: optional field for the tenant's own platform ID
--   (Shopify customer ID, Stripe cus_xxx, internal user UUID, etc.)
--   Stored as text so it works with any format.
--   Unique per tenant so it can be used as a lookup key.
--
-- first_name / last_name: change from NOT NULL to nullable with default ''
--   so flexible CSV imports don't fail when name columns are missing.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_external_id
  ON customers (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE customers
  ALTER COLUMN first_name SET DEFAULT '',
  ALTER COLUMN last_name  SET DEFAULT '';

-- Allow nulls temporarily so we can convert without touching existing rows
ALTER TABLE customers
  ALTER COLUMN first_name DROP NOT NULL,
  ALTER COLUMN last_name  DROP NOT NULL;

-- Set empty string where null (existing rows are fine but just in case)
UPDATE customers SET first_name = '' WHERE first_name IS NULL;
UPDATE customers SET last_name  = '' WHERE last_name  IS NULL;
