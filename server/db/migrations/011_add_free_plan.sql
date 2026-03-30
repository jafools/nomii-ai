-- ============================================================
-- Migration 011: Add 'free' plan to subscription_plan enum
-- ============================================================
--
-- Adds a permanent free tier for new signups:
-- 10 customers max, 50 messages/month.
-- Run manually on existing DBs:
--   docker exec -it knomi-db psql -U knomi -d knomi_ai -c "ALTER TYPE subscription_plan ADD VALUE 'free';"
--

DO $$ BEGIN
  ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free';
EXCEPTION WHEN others THEN NULL;
END $$;
