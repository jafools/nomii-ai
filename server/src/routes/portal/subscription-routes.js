/**
 * SHENMAY AI — Tenant Portal: Subscription Summary
 *
 * Sub-router mounted by ../portal.js at `/api/portal/subscription`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   GET /api/portal/subscription — current plan, usage, and limit-percentage display data
 */

const router = require('express').Router();
const db = require('../../db');
const { getSubscription } = require('../../middleware/subscription');
const { UNRESTRICTED_PLANS } = require('../../config/plans');
const { anonEmailNotLikeGuard } = require('../../constants/anonDomains');

// GET /api/portal/subscription — subscription + usage summary
router.get('/', async (req, res, next) => {
  try {
    const sub = await getSubscription(req.portal.tenant_id);
    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    // Count current customers for limit display (anon visitors don't count toward the cap)
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM customers
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND ${anonEmailNotLikeGuard()}`,
      [req.portal.tenant_id]
    );

    const customersCount = parseInt(rows[0].count);
    const messagesUsed   = sub.messages_used_this_month || 0;
    const isUnrestricted = UNRESTRICTED_PLANS.includes(sub.plan);

    // Percentage helpers (null when plan has no cap)
    const customerPct = (!isUnrestricted && sub.max_customers)
      ? Math.min(100, Math.round((customersCount / sub.max_customers) * 100))
      : null;
    const messagePct = (!isUnrestricted && sub.max_messages_month)
      ? Math.min(100, Math.round((messagesUsed / sub.max_messages_month) * 100))
      : null;

    res.json({
      subscription: {
        plan:                    sub.plan,
        status:                  sub.status,
        max_customers:           sub.max_customers,
        max_messages_month:      sub.max_messages_month,
        messages_used_this_month: messagesUsed,
        managed_ai_enabled:      sub.managed_ai_enabled,
        trial_starts_at:         sub.trial_starts_at,
        trial_ends_at:           sub.trial_ends_at,
        current_period_start:    sub.current_period_start,
        current_period_end:      sub.current_period_end,
        canceled_at:             sub.canceled_at,
        stripe_customer_id:      sub.stripe_customer_id || null,
      },
      usage: {
        customers_count:       customersCount,
        customers_limit:       sub.max_customers,
        customers_pct:         customerPct,
        near_customer_limit:   customerPct !== null && customerPct >= 80,
        customer_limit_reached: customerPct !== null && customerPct >= 100,
        messages_used:         messagesUsed,
        messages_limit:        sub.max_messages_month,
        messages_pct:          messagePct,
        near_message_limit:    messagePct !== null && messagePct >= 80,
        message_limit_reached: messagePct !== null && messagePct >= 100,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
