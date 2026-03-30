-- ============================================================
-- Migration 015b — Seed Covenant Trust tool configuration
--
-- This is a targeted re-apply of the UPDATE that failed in 015
-- due to shell quoting issues with single quotes in JSONB literals.
-- Dollar-quoting ($$ ... $$) avoids all shell escaping problems.
--
-- Safe to re-run: uses idempotent WHERE + only updates Covenant Trust.
-- ============================================================

DO $$
BEGIN
  UPDATE tenants
  SET
    enabled_tools = '["lookup_client_data", "analyze_client_data", "generate_report", "request_specialist"]'::jsonb,
    tool_configs  = jsonb_build_object(
      'lookup_client_data', jsonb_build_object(
        'description', 'Retrieves this client''s financial accounts and records — retirement accounts, investments, income sources, and any other structured data on file. Use this when the client asks about their accounts, balances, or financial situation.'
      ),
      'analyze_client_data', jsonb_build_object(
        'description', 'Analyzes this client''s financial accounts to compute totals, identify data gaps, and surface key figures (total retirement assets, monthly income, etc.). Use this before providing any account-level guidance.'
      ),
      'generate_report', jsonb_build_object(
        'description', 'Generates a structured summary report of the client''s financial picture, goals, or account analysis. Use when the client asks for a summary, wants something in writing, or when the advisor would benefit from a formatted overview.'
      ),
      'request_specialist', jsonb_build_object(
        'description', 'Notifies a human financial advisor that this client needs personal attention. Use when the client asks a specific investment or tax question beyond educational scope, requests a meeting, or when a flag has been raised.'
      )
    )
  WHERE slug = 'covenant-trust';

  RAISE NOTICE 'Covenant Trust tool config seeded (rows affected: %)', (SELECT COUNT(*) FROM tenants WHERE slug = 'covenant-trust');
END;
$$;
