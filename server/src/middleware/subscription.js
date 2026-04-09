/**
 * NOMII AI — Subscription Enforcement Middleware
 *
 * Checks tenant subscription status before allowing access to portal
 * and widget routes. Master accounts always pass.
 *
 * Usage:
 *   router.use(requireActiveSubscription);           // after requirePortalAuth
 *   router.use(requireActiveWidgetSubscription);     // after requireWidgetAuth
 */

const db = require('../db');
const { sendTrialLimitEmail } = require('../services/emailService');

// Plans that bypass all checks
const UNRESTRICTED_PLANS = ['master', 'enterprise'];

// Plans that show trial-limit UX (small limits, upgrade prompts)
const TRIAL_PLANS = ['trial', 'free'];

/**
 * Load subscription for a tenant. Returns null if none exists.
 */
async function getSubscription(tenantId) {
  const { rows } = await db.query(
    `SELECT s.*, t.is_active
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = $1`,
    [tenantId]
  );
  return rows[0] || null;
}

/**
 * Determine if a subscription is currently valid.
 */
function isSubscriptionValid(sub) {
  if (!sub) return false;
  if (!sub.is_active) return false;
  if (UNRESTRICTED_PLANS.includes(sub.plan)) return true;

  switch (sub.status) {
    case 'active':
      return true;
    case 'trialing':
      return new Date(sub.trial_ends_at) > new Date();
    case 'past_due':
      // Grace period: allow 7 days past_due before blocking
      if (sub.current_period_end) {
        const grace = new Date(sub.current_period_end);
        grace.setDate(grace.getDate() + 7);
        return grace > new Date();
      }
      return false;
    case 'canceled':
    case 'expired':
      return false;
    default:
      return false;
  }
}

/**
 * Build a human-readable reason for subscription failure.
 */
function getBlockReason(sub) {
  if (!sub) return { code: 'no_subscription', message: 'No subscription found. Please upgrade to continue.' };
  if (!sub.is_active) return { code: 'tenant_inactive', message: 'Account has been deactivated.' };

  switch (sub.status) {
    case 'trialing':
      return { code: 'trial_expired', message: 'Your free trial has ended. Upgrade to keep using NomiiAI.' };
    case 'past_due':
      return { code: 'payment_past_due', message: 'Payment is past due. Please update your billing info.' };
    case 'canceled':
      return { code: 'subscription_canceled', message: 'Your subscription has been canceled.' };
    case 'expired':
      return { code: 'subscription_expired', message: 'Your subscription has expired. Please renew.' };
    default:
      return { code: 'subscription_invalid', message: 'Subscription is not active.' };
  }
}

/**
 * Check message limit for the current month.
 */
function isWithinMessageLimit(sub) {
  if (UNRESTRICTED_PLANS.includes(sub.plan)) return true;
  return sub.messages_used_this_month < sub.max_messages_month;
}

/**
 * Check customer limit.
 */
async function isWithinCustomerLimit(sub) {
  if (UNRESTRICTED_PLANS.includes(sub.plan)) return true;

  const { rows } = await db.query(
    `SELECT COUNT(*) FROM customers
     WHERE tenant_id = $1 AND deleted_at IS NULL
       AND email NOT LIKE 'anon\\_%@visitor.nomii'`,
    [sub.tenant_id]
  );
  return parseInt(rows[0].count) < sub.max_customers;
}


// ═══════════════════════════════════════════════════════════════════════════
// PORTAL MIDDLEWARE — runs after requirePortalAuth (req.portal is set)
// ═══════════════════════════════════════════════════════════════════════════

async function requireActiveSubscription(req, res, next) {
  try {
    const sub = await getSubscription(req.portal.tenant_id);

    if (!isSubscriptionValid(sub)) {
      const reason = getBlockReason(sub);
      return res.status(403).json({
        error: 'subscription_required',
        ...reason,
        subscription: sub ? {
          plan:           sub.plan,
          status:         sub.status,
          trial_ends_at:  sub.trial_ends_at,
        } : null,
      });
    }

    // Attach subscription to request for downstream use
    req.subscription = sub;
    next();
  } catch (err) {
    console.error('[Subscription] Portal check failed:', err.message);
    next(err);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// WIDGET MIDDLEWARE — runs after requireWidgetAuth (req.widgetSession is set)
// ═══════════════════════════════════════════════════════════════════════════

async function requireActiveWidgetSubscription(req, res, next) {
  try {
    const sub = await getSubscription(req.widgetSession.tenant_id);

    if (!isSubscriptionValid(sub)) {
      return res.status(403).json({
        error: 'widget_unavailable',
        message: 'This chat service is temporarily unavailable.',
      });
    }

    // Check message limit on chat endpoint
    if (req.path === '/chat' && !isWithinMessageLimit(sub)) {
      // Fire one-time notification email for trial tenants
      sendLimitNotificationIfNeeded(req.widgetSession.tenant_id);
      return res.status(429).json({
        error: 'message_limit_reached',
        message: 'Monthly message limit reached. The site owner needs to upgrade their plan.',
      });
    }

    req.subscription = sub;
    next();
  } catch (err) {
    console.error('[Subscription] Widget check failed:', err.message);
    next(err);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// INCREMENT MESSAGE COUNTER
// ═══════════════════════════════════════════════════════════════════════════

async function incrementMessageCount(tenantId) {
  await db.query(
    `UPDATE subscriptions
     SET messages_used_this_month = messages_used_this_month + 1,
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId]
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// TRIAL LIMIT NOTIFICATION
// Fires a one-time email when a trial tenant first hits a usage limit.
// Uses limit_notified_at as a sent-flag so we never spam.
// ═══════════════════════════════════════════════════════════════════════════

async function sendLimitNotificationIfNeeded(tenantId) {
  try {
    // Only notify for trial plans that haven't been notified yet
    const { rows } = await db.query(
      `SELECT s.plan, s.limit_notified_at,
              t.name AS tenant_name,
              a.email, a.first_name
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN tenant_admins a ON a.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND s.plan IN ('trial', 'free')
         AND s.limit_notified_at IS NULL
       LIMIT 1`,
      [tenantId]
    );

    if (rows.length === 0) return; // already notified, or not a trial plan

    const { email, first_name, tenant_name } = rows[0];

    // Mark as notified BEFORE sending so a retry can't double-send
    await db.query(
      `UPDATE subscriptions SET limit_notified_at = NOW() WHERE tenant_id = $1`,
      [tenantId]
    );

    // Fire email async — don't block the request
    sendTrialLimitEmail({ to: email, firstName: first_name, tenantName: tenant_name })
      .catch(err => console.error('[Subscription] Failed to send trial limit email:', err.message));

    console.log(`[Subscription] Trial limit notification sent for tenant ${tenantId}`);
  } catch (err) {
    // Never let notification errors break the main flow
    console.error('[Subscription] sendLimitNotificationIfNeeded error:', err.message);
  }
}


module.exports = {
  requireActiveSubscription,
  requireActiveWidgetSubscription,
  incrementMessageCount,
  getSubscription,
  isSubscriptionValid,
  getBlockReason,
  isWithinMessageLimit,
  isWithinCustomerLimit,
  sendLimitNotificationIfNeeded,
};
