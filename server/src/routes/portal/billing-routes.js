/**
 * SHENMAY AI — Tenant Portal: Stripe Billing Actions
 *
 * Sub-router mounted by ../portal.js at `/api/portal/billing`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   POST /api/portal/billing/checkout — create Stripe checkout session for plan upgrade
 *   POST /api/portal/billing/portal   — redirect to Stripe customer portal (manage existing subscription)
 *
 * Read-only subscription state lives in subscription-routes.js. The plan
 * catalog (`/plans`) and admin override (`/admin/set-plan`) stay inline in
 * portal.js — they don't share a prefix with the Stripe action endpoints.
 */

const router = require('express').Router();
const db = require('../../db');
const { getSubscription } = require('../../middleware/subscription');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_MAP  = {
  starter:      process.env.STRIPE_PRICE_STARTER      || null,
  growth:       process.env.STRIPE_PRICE_GROWTH        || null,
  professional: process.env.STRIPE_PRICE_PROFESSIONAL  || null,
};
const STRIPE_PORTAL_RETURN_URL = process.env.STRIPE_PORTAL_RETURN_URL || `${(process.env.APP_URL || 'https://pontensolutions.com').replace(/\/$/, '')}/dashboard`;

// Lazy Stripe client — instantiated on first call so unconfigured deploys
// don't crash at module-load time.
let _stripe = null;
function getStripe() {
  if (!STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  if (!_stripe) _stripe = require('stripe')(STRIPE_SECRET_KEY);
  return _stripe;
}

// POST /api/portal/billing/checkout — create Stripe checkout session
router.post('/checkout', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body;

    if (!plan || !STRIPE_PRICE_MAP[plan]) {
      return res.status(400).json({ error: 'Invalid plan. Choose: starter, growth, or professional' });
    }

    const sub = await getSubscription(req.portal.tenant_id);

    // Create or retrieve Stripe customer
    let stripeCustomerId = sub?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: req.portal.email,
        metadata: { tenant_id: req.portal.tenant_id },
      });
      stripeCustomerId = customer.id;
      await db.query(
        'UPDATE subscriptions SET stripe_customer_id = $1 WHERE tenant_id = $2',
        [stripeCustomerId, req.portal.tenant_id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_MAP[plan], quantity: 1 }],
      success_url: STRIPE_PORTAL_RETURN_URL + '?billing=success',
      cancel_url:  STRIPE_PORTAL_RETURN_URL + '?billing=canceled',
      metadata: { tenant_id: req.portal.tenant_id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.message === 'Stripe is not configured') {
      return res.status(503).json({ error: 'Billing is not yet configured. Please contact support.' });
    }
    next(err);
  }
});

// POST /api/portal/billing/portal — redirect to Stripe customer portal
router.post('/portal', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const sub = await getSubscription(req.portal.tenant_id);
    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account. Start a subscription first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: STRIPE_PORTAL_RETURN_URL,
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.message === 'Stripe is not configured') {
      return res.status(503).json({ error: 'Billing is not yet configured.' });
    }
    next(err);
  }
});

module.exports = router;
