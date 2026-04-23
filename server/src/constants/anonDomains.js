/**
 * Anonymous visitor email domains.
 *
 * The widget generates placeholder customer records for visitors who chat
 * without being logged in on the host site. Those records have emails of
 * the form `anon_<hex>@visitor.<brand>`, and every query that counts or
 * filters billable customers must exclude them.
 *
 * During the Shenmay migration (Phase 5 of docs/SHENMAY_MIGRATION_PLAN.md)
 * both the legacy `@visitor.nomii` and canonical `@visitor.shenmay` domains
 * are accepted. New sessions use `@visitor.shenmay`; old rows are
 * preserved. Every LIKE / NOT LIKE / ILIKE filter must cover both until
 * Phase 8 sunset (target 2026-10-20).
 *
 * Use the helpers below instead of hand-writing `@visitor.nomii` into a
 * SQL fragment — that was the Phase 5 failure mode.
 */

/** Canonical domain for NEW anon session generation. */
const ANON_EMAIL_DOMAIN = '@visitor.shenmay';

/** Every historically-valid anon domain (legacy + canonical). */
const ANON_EMAIL_DOMAINS = ['@visitor.nomii', '@visitor.shenmay'];

/**
 * SQL fragment that EXCLUDES anon rows from a query.
 * Use in WHERE clauses: `AND ${anonEmailNotLikeGuard()}`.
 * Pass a column name (e.g. `'cu.email'`) when the query uses an alias.
 */
function anonEmailNotLikeGuard(col = 'email') {
  return `${col} NOT LIKE 'anon\\_%@visitor.nomii' AND ${col} NOT LIKE 'anon\\_%@visitor.shenmay'`;
}

/**
 * SQL fragment that MATCHES anon rows. Parenthesised so it can be
 * combined with AND/OR/CASE-WHEN safely.
 * Use: `AND ${anonEmailLikeMatch()}`, `WHEN ${anonEmailLikeMatch('cu.email')} THEN ...`,
 * `${anonEmailLikeMatch('cu.email')} AS is_anonymous`.
 */
function anonEmailLikeMatch(col = 'email') {
  return `(${col} LIKE 'anon\\_%@visitor.nomii' OR ${col} LIKE 'anon\\_%@visitor.shenmay')`;
}

/**
 * ILIKE-based loose match (substring, case-insensitive). Used by the
 * retention job which doesn't care about the `anon_<hex>_` prefix shape.
 */
function anonEmailIlikeMatch(col = 'email') {
  return `(${col} ILIKE '%@visitor.nomii%' OR ${col} ILIKE '%@visitor.shenmay%')`;
}

/** Runtime JS predicate — true when the email is any recognised anon form. */
function isAnonVisitorEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return ANON_EMAIL_DOMAINS.some(d => email.includes(d));
}

module.exports = {
  ANON_EMAIL_DOMAIN,
  ANON_EMAIL_DOMAINS,
  anonEmailNotLikeGuard,
  anonEmailLikeMatch,
  anonEmailIlikeMatch,
  isAnonVisitorEmail,
};
