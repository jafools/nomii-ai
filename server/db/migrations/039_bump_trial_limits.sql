-- 039_bump_trial_limits.sql
--
-- Bump trial-plan customer + message limits from the original 1/20 (which
-- is unusably low — barely lets a tenant test the product) to 5/100.
--
-- Code source-of-truth at server/src/config/plans.js was bumped in the same
-- commit as this migration; that drives NEW trial signups. This migration
-- backfills EXISTING trial tenants so the bump reaches everyone.
--
-- Idempotent: only updates rows where the limits still match the old defaults.
-- A trial tenant whose limits were ever set custom (e.g. by master admin via
-- /api/portal/admin/set-plan) is left alone.

UPDATE subscriptions
   SET max_customers       = 5,
       max_messages_month  = 100
 WHERE plan                = 'trial'
   AND max_customers       = 1
   AND max_messages_month  = 20;
