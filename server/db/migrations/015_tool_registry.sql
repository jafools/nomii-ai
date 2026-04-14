-- ============================================================
-- Migration 015 — Configurable Tool Registry per Tenant
--
-- Adds two columns to tenants:
--
--   enabled_tools  — array of tool names active for this tenant
--                    e.g. ["lookup_client_data", "generate_report"]
--
--   tool_configs   — per-tenant overrides for tool descriptions
--                    (makes the same tool sound native to any industry)
--                    e.g. {
--                      "analyze_client_data": {
--                        "description": "Analyzes lumber orders and project specs..."
--                      }
--                    }
--
-- No enabled_tools = no tools passed to Claude = pure conversation mode.
-- The agent picks up tool capability only when a tenant opts in.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enabled_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tool_configs  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for fast lookup (GIN for JSONB array contains queries)
CREATE INDEX IF NOT EXISTS idx_tenants_enabled_tools
  ON tenants USING GIN (enabled_tools);

-- ============================================================
-- Seed: give the Covenant Trust demo tenant sensible defaults
-- (financial advisory toolset)
-- ============================================================
UPDATE tenants
SET
  enabled_tools = '["lookup_client_data", "analyze_client_data", "generate_report", "request_specialist"]'::jsonb,
  tool_configs  = '{
    "lookup_client_data": {
      "description": "Retrieves this client''s financial accounts and records — retirement accounts, investments, income sources, and any other structured data on file. Use this when the client asks about their accounts, balances, or financial situation."
    },
    "analyze_client_data": {
      "description": "Analyzes this client''s financial accounts to compute totals, identify data gaps, and surface key figures (total retirement assets, monthly income, etc.). Use this before providing any account-level guidance."
    },
    "generate_report": {
      "description": "Generates a structured summary report of the client''s financial picture, goals, or account analysis. Use when the client asks for a summary, wants something in writing, or when the advisor would benefit from a formatted overview."
    },
    "request_specialist": {
      "description": "Notifies a human financial advisor that this client needs personal attention. Use when the client asks a specific investment or tax question beyond educational scope, requests a meeting, or when a flag has been raised."
    }
  }'::jsonb
WHERE slug = 'covenant-trust';
