/**
 * Anonymous visitor email domains.
 *
 * The widget generates placeholder customer records for visitors who chat
 * without being logged in on the host site. Those records have emails of
 * the form `anon_<hex>@visitor.shenmay`, and every query that counts or
 * filters billable customers must exclude them.
 *
 * Until Phase 8 of the Shenmay migration this file maintained a dual-accept
 * array of `[@visitor.nomii, @visitor.shenmay]` for backwards compatibility.
 * That was unified onto the single canonical domain in migration
 * 033_anon_visitor_domain_unification.sql once the Phase-8 zero-customer
 * audit confirmed the dual-accept window protected no real customer data.
 *
 * Use the helpers below instead of hand-writing `@visitor.shenmay` into a
 * SQL fragment — that was the Phase 5 failure mode.
 */

/** Canonical domain for anon session generation. */
const ANON_EMAIL_DOMAIN = '@visitor.shenmay';

/**
 * SQL fragment that EXCLUDES anon rows from a query.
 * Use in WHERE clauses: `AND ${anonEmailNotLikeGuard()}`.
 * Pass a column name (e.g. `'cu.email'`) when the query uses an alias.
 */
function anonEmailNotLikeGuard(col = 'email') {
  return `${col} NOT LIKE 'anon\\_%@visitor.shenmay'`;
}

/**
 * SQL fragment that MATCHES anon rows. Parenthesised so it can be
 * combined with AND/OR/CASE-WHEN safely.
 * Use: `AND ${anonEmailLikeMatch()}`, `WHEN ${anonEmailLikeMatch('cu.email')} THEN ...`,
 * `${anonEmailLikeMatch('cu.email')} AS is_anonymous`.
 */
function anonEmailLikeMatch(col = 'email') {
  return `(${col} LIKE 'anon\\_%@visitor.shenmay')`;
}

/**
 * ILIKE-based loose match (substring, case-insensitive). Used by the
 * retention job which doesn't care about the `anon_<hex>_` prefix shape.
 */
function anonEmailIlikeMatch(col = 'email') {
  return `(${col} ILIKE '%@visitor.shenmay%')`;
}

/** Runtime JS predicate — true when the email is the recognised anon form. */
function isAnonVisitorEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return email.includes(ANON_EMAIL_DOMAIN);
}

module.exports = {
  ANON_EMAIL_DOMAIN,
  anonEmailNotLikeGuard,
  anonEmailLikeMatch,
  anonEmailIlikeMatch,
  isAnonVisitorEmail,
};
