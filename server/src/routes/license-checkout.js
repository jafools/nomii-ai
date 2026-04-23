/**
 * POST /api/public/license/checkout
 *
 * Public endpoint — no auth required.
 * Creates a Stripe Checkout Session for a self-hosted Shenmay AI license purchase.
 *
 * Body:     { plan: 'starter'|'growth'|'professional', interval: 'monthly'|'annual', email?: string }
 * Response: { url: string }  — Stripe-hosted checkout URL to redirect the browser to
 *
 * The webhook (stripe-webhook.js) handles checkout.session.completed:
 *   metadata.product_type === 'selfhosted' → auto-generates license key → emails to buyer
 */

const router = require('express').Router();

const APP_URL = (process.env.APP_URL || 'https://shenmay.ai').replace(/\/$/, '');

const PRICE_IDS = {
  starter: {
    monthly: process.env.STRIPE_SELFHOSTED_PRICE_STARTER_MONTHLY,
    annual:  process.env.STRIPE_SELFHOSTED_PRICE_STARTER_ANNUAL,
  },
  growth: {
    monthly: process.env.STRIPE_SELFHOSTED_PRICE_GROWTH_MONTHLY,
    annual:  process.env.STRIPE_SELFHOSTED_PRICE_GROWTH_ANNUAL,
  },
  professional: {
    monthly: process.env.STRIPE_SELFHOSTED_PRICE_PROFESSIONAL_MONTHLY,
    annual:  process.env.STRIPE_SELFHOSTED_PRICE_PROFESSIONAL_ANNUAL,
  },
};

const VALID_PLANS     = Object.keys(PRICE_IDS);
const VALID_INTERVALS = ['monthly', 'annual'];
const EMAIL_RE        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', async (req, res) => {
  const { plan, interval = 'monthly', email } = req.body || {};

  if (!VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be starter, growth, or professional.' });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return res.status(400).json({ error: 'Invalid interval. Must be monthly or annual.' });
  }

  const priceId = PRICE_IDS[plan]?.[interval];
  if (!priceId) {
    return res.status(503).json({ error: `Price not configured for ${plan} ${interval}.` });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Checkout not available — Stripe not configured on this server.' });
  }

  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);

    const params = {
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/license/success`,
      cancel_url:  `${APP_URL}/license`,
      // Metadata on both the session and the subscription so the webhook can detect selfhosted
      metadata:           { product_type: 'selfhosted', plan, interval },
      subscription_data:  { metadata: { product_type: 'selfhosted', plan, interval } },
      allow_promotion_codes: true,
    };

    if (email && EMAIL_RE.test(email.trim())) {
      params.customer_email = email.trim().toLowerCase();
    }

    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[License Checkout] Stripe error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
});

module.exports = router;
