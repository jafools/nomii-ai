-- 041_brand_learning_curate_incidents.sql
--
-- Brand Learning — Owner Curation Incidents (v3.5.4)
--
-- Extends the brand_learning_incidents.type CHECK enum with two new audit
-- types emitted when an owner manually curates the brand:
--   - manual_delete:  owner deleted a promoted fact OR a pending candidate
--   - manual_promote: owner manually promoted a pending candidate to soul
--
-- Wrapped in a DO-block so re-running this migration is a no-op on installs
-- that already updated the constraint (mirrors 040's idempotency pattern).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_learning_incidents_type_check_v2'
      AND conrelid = 'brand_learning_incidents'::regclass
  ) THEN
    -- Drop the old constraint if present (name varies by PG auto-generation
    -- since the inline CHECK in migration 040 didn't name it). We detect
    -- both the conventional autogen name and the explicit one.
    EXECUTE 'ALTER TABLE brand_learning_incidents DROP CONSTRAINT IF EXISTS brand_learning_incidents_type_check';
    EXECUTE 'ALTER TABLE brand_learning_incidents DROP CONSTRAINT IF EXISTS brand_learning_incidents_type_check1';

    ALTER TABLE brand_learning_incidents
      ADD CONSTRAINT brand_learning_incidents_type_check_v2
      CHECK (type IN (
        'pii_breach',
        'distill_skip_no_key',
        'distill_failed',
        'promotion_blocked',
        'kill_switch_used',
        'auto_disabled',
        'manual_delete',
        'manual_promote'
      ));
  END IF;
END $$;

COMMENT ON CONSTRAINT brand_learning_incidents_type_check_v2 ON brand_learning_incidents IS
  'v3.5.4: extends v3.5.0 type enum with manual_delete + manual_promote (owner curation actions on /dashboard/brand-learning).';
