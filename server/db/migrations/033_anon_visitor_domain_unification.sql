-- ============================================================
-- Migration 033 — Unify anonymous-visitor email domain
--
-- During Phase 5 of the Shenmay rebrand the widget started writing
-- new anonymous-visitor customer rows with `@visitor.shenmay`,
-- but historical rows from the Nomii era still carried
-- `@visitor.nomii`. The application carried a dual-accept helper
-- (server/src/constants/anonDomains.js) so reads matched both.
--
-- Per the Phase 8 zero-customer audit (v3.0.0): no real external
-- customers exist, so the dual-accept window has zero protective
-- value. This migration unifies historical rows onto the canonical
-- `@visitor.shenmay` domain so the helper can drop legacy support.
--
-- Safe to re-run: REPLACE on a string that no longer contains the
-- search substring is a no-op, and the WHERE clause filters to
-- only the legacy form.
-- ============================================================

UPDATE customers
SET    email = REPLACE(email, '@visitor.nomii', '@visitor.shenmay')
WHERE  email LIKE '%@visitor.nomii';
