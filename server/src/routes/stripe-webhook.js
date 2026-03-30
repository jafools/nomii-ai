/**
 * NOMII AI — Stripe Webhook Handler
 *
 * Receives Stripe events and updates subscription records accordingly.
 * Mounted at POST /api/stripe/webhook with raw body parsing.
 *
 * Key events handled:
 *   - checkout.session.completed  → activate subscription
 *   - invoice.paid               → renew period
 *   - invoice.payment_failed     → mark past_due
 *   - customer.subscription.updated → sync plan/status changes
 *   - customer.subscription.deleted → mark canceled
 */

const router = require('express').Router();
const db     = require('../db');

const STRIPE_SECRET_KEY      = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;

// Plan limits lookup
const PLAN_LIMITS = {
  starter:      { max_customers: 50,   max_messages_month: 1000,  managed_ai: false, max_agents: 10  },
  growth:       { max_customers: 250,  max_messages_month: 5000,  managed_ai: true,  max_agents: 25  },
  professional: { max_customers: 1000, max_messages_month: 25000, managed_ai: true,  max_agents: 100 },
  enterprise:   { max_customers: 99999, max_messages_month: 999999, managed_ai: true, max_agents: 999 },
  master:       { max_customers: 99999, max_messages_month: 999999, managed_ai: true, max_agents: 999 },
};

// Reverse price ID → plan name lookup (for Stripe pricing table which doesn't pass metadata.plan)
function getPlanFromPriceId(priceId) {
  const map = {
    [process.env.STRIPE_PRICE_STARTER]:      'starter',
    [process.env.STRIPE_PRICE_GROWTH]:       'growth',
    [process.env.STRIPE_PRICE_PROFESSIONAL]: 'professional',
  };
  return map[priceId] || null;
}

function getStripe() {
  if (!STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
  return require('stripe')(STRIPE_SECRET_KEY);
}


router.post('/', async (req, res) => {
  const stripe = getStripe();
  let event;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Dev mode: no signature verification
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  const { type, data: { object } } = event;
  console.log(`[Stripe Webhook] ${type}`);

  try {
    switch (type) {

      // ── Checkout completed → activate subscription ──────────────────────────
      case 'checkout.session.completed': {
        // Support both custom checkout (metadata.tenant_id) and pricing table (client_reference_id)
        const tenantId = object.metadata?.tenant_id || object.client_reference_id;

        // Detect plan: prefer metadata.plan, then look up from price ID (pricing table flow)
        let plan = object.metadata?.plan || null;
        if (!plan && object.subscription) {
          try {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(object.subscription);
            const priceId = sub.items?.data?.[0]?.price?.id;
            if (priceId) plan = getPlanFromPriceId(priceId);
          } catch (e) {
            console.error('[Stripe] Could not retrieve subscription for plan lookup:', e.message);
          }
        }
        plan = plan || 'starter';
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

        if (tenantId && object.subscription) {
          await db.query(
            `UPDATE subscriptions SET
               plan                    = $1,
               status                  = 'active',
               stripe_subscription_id  = $2,
               stripe_customer_id      = COALESCE(stripe_customer_id, $3),
               max_customers           = $4,
               max_messages_month      = $5,
               managed_ai_enabled      = $6,
               max_agents              = $8,
               current_period_start    = NOW(),
               current_period_end      = NOW() + INTERVAL '1 month',
               updated_at              = NOW()
             WHERE tenant_id = $7`,
            [plan, object.subscription, object.customer, limits.max_customers,
             limits.max_messages_month, limits.managed_ai, tenantId, limits.max_agents]
          );
          console.log(`[Stripe] Tenant ${tenantId} activated on ${plan} plan`);
        } else {
          console.warn('[Stripe] checkout.session.completed missing tenant_id or subscription:', object.id);
        }
        break;
      }

      // ── Invoice paid → renew period, reset usage ───────────────────────────
      case 'invoice.paid': {
        if (object.subscription) {
          await db.query(
            `UPDATE subscriptions SET
               status                    = 'active',
               current_period_start      = to_timestamp($1),
               current_period_end        = to_timestamp($2),
               messages_used_this_month  = 0,
               usage_reset_at            = NOW(),
               updated_at                = NOW()
             WHERE stripe_subscription_id = $3`,
            [object.period_start, object.period_end, object.subscription]
          );
        }
        break;
      }

      // ── Invoice failed → mark past due ─────────────────────────────────────
      case 'invoice.payment_failed': {
        if (object.subscription) {
          await db.query(
            `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [object.subscription]
          );
        }
        break;
      }

      // ── Subscription updated (plan change, cancel at period end, etc.) ─────
      case 'customer.subscription.updated': {
        const stripeStatus = object.status;
        let dbStatus = 'active';
        if (stripeStatus === 'past_due') dbStatus = 'past_due';
        if (stripeStatus === 'canceled') dbStatus = 'canceled';
        if (stripeStatus === 'unpaid')   dbStatus = 'expired';
        if (object.cancel_at_period_end) dbStatus = 'active'; // still active until period end

        await db.query(
          `UPDATE subscriptions SET
             status                = $1,
             current_period_start  = to_timestamp($2),
             current_period_end    = to_timestamp($3),
             canceled_at           = $4,
             updated_at            = NOW()
           WHERE stripe_subscription_id = $5`,
          [dbStatus, object.current_period_start, object.current_period_end,
           object.canceled_at ? new Date(object.canceled_at * 1000) : null,
           object.id]
        );
        break;
      }

      // ── Subscription deleted → mark canceled ───────────────────────────────
      case 'customer.subscription.deleted': {
        await db.query(
          `UPDATE subscriptions SET
             status      = 'canceled',
             canceled_at = NOW(),
             updated_at  = NOW()
           WHERE stripe_subscription_id = $1`,
          [object.id]
        );
        break;
      }

      default:
        // Unhandled event — that's fine, just log it
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Error processing event:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});


module.exports = router;
