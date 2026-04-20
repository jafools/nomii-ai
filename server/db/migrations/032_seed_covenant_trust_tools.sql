-- ============================================================
-- Migration 032 — Seed Covenant Trust tool configuration
--
-- Originally landed as `015b_*.sql` (a targeted re-apply of an UPDATE
-- that failed in 015 due to shell quoting around single quotes in JSONB
-- literals). Renamed to `032_*.sql` 2026-04-20 to fit the NNN_*.sql
-- convention (audit finding #7).
--
-- Safe to re-run on any DB that already has it applied — the UPDATE is
-- idempotent (deterministic WHERE on slug, deterministic value).
--
-- The DELETE below cleans up the orphaned `schema_migrations` row from
-- the old filename on databases (e.g. Hetzner SaaS) where the original
-- `015b_*.sql` was already recorded. On fresh databases the DELETE is
-- a harmless no-op.
-- ============================================================

DELETE FROM schema_migrations WHERE filename = '015b_seed_covenant_trust_tools.sql';

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
