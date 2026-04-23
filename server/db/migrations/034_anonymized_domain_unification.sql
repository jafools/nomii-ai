-- ============================================================
-- Migration 034 — Unify GDPR-anonymisation email domain
--
-- Sister migration to 033_anon_visitor_domain_unification.sql, but
-- targeting the *deletion* placeholder used by anonymizeCustomer()
-- in server/src/jobs/dataRetention.js (NOT the widget anon-visitor
-- email written by widget.js).
--
-- During the Shenmay rebrand, deleted customer rows had their email
-- set to `deleted_<uuid>@anonymized.nomii`. This migration unifies
-- any historical rows onto the canonical `@anonymized.shenmay`
-- domain so the codebase no longer references the legacy form.
--
-- Verified before tagging v3.0.5: 0 rows on Hetzner prod match the
-- legacy form (no customer has ever requested GDPR erasure on the
-- prod instance), so this migration is currently a no-op safety net.
-- It will catch any rows that get added between the audit and the
-- deploy, plus stays applied for any future fresh-install dataset
-- that somehow inherits the legacy form.
--
-- Safe to re-run: REPLACE on a substring that no longer exists is
-- a no-op, and the WHERE clause filters to only the legacy form.
-- ============================================================

UPDATE customers
SET    email = REPLACE(email, '@anonymized.nomii', '@anonymized.shenmay')
WHERE  email LIKE '%@anonymized.nomii';
