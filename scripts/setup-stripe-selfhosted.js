/**
 * SHENMAY AI — Stripe Self-Hosted Product Setup
 *
 * Creates Stripe products, prices, and payment links for all three
 * self-hosted plans (monthly + annual). Run once from the repo root:
 *
 *   node scripts/setup-stripe-selfhosted.js
 *
 * Requires STRIPE_SECRET_KEY in your root .env file.
 * Uses the stripe package from server/node_modules.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Stripe = require('../server/node_modules/stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY not found in .env');
  process.exit(1);
}

const stripe = Stripe(STRIPE_SECRET_KEY);

// ── Plan definitions ──────────────────────────────────────────────────────────
const PLANS = [
  {
    key:         'starter',
    name:        'Shenmay AI — Self-Hosted Starter',
    description: 'Run Shenmay AI on your own server. Up to 50 customers, 1,000 messages/mo, 10 agents.',
    monthly_usd: 4900,   // $49.00
    annual_usd:  52900,  // $529.00  (= 49 × 12 × 0.9, rounded)
  },
  {
    key:         'growth',
    name:        'Shenmay AI — Self-Hosted Growth',
    description: 'Up to 250 customers, 5,000 messages/mo, 25 agents. Managed AI included.',
    monthly_usd: 14900,  // $149.00
    annual_usd:  159900, // $1,599.00
  },
  {
    key:         'professional',
    name:        'Shenmay AI — Self-Hosted Professional',
    description: 'Up to 1,000 customers, 25,000 messages/mo, 100 agents. Managed AI included.',
    monthly_usd: 39900,  // $399.00
    annual_usd:  429900, // $4,299.00
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nShenmay AI — Stripe Self-Hosted Setup');
  console.log('─'.repeat(50));

  const results = [];

  for (const plan of PLANS) {
    console.log(`\n▶  ${plan.name}`);

    // 1. Create product
    const product = await stripe.products.create({
      name:        plan.name,
      description: plan.description,
      metadata: {
        product_type: 'selfhosted',
        plan:         plan.key,
      },
    });
    console.log(`   Product: ${product.id}`);

    // 2. Create monthly price
    const monthlyPrice = await stripe.prices.create({
      product:     product.id,
      unit_amount: plan.monthly_usd,
      currency:    'usd',
      recurring:   { interval: 'month' },
      metadata: {
        product_type: 'selfhosted',
        plan:         plan.key,
        billing:      'monthly',
      },
    });
    console.log(`   Monthly price: ${monthlyPrice.id}  ($${plan.monthly_usd / 100}/mo)`);

    // 3. Create annual price
    const annualPrice = await stripe.prices.create({
      product:     product.id,
      unit_amount: plan.annual_usd,
      currency:    'usd',
      recurring:   { interval: 'year' },
      metadata: {
        product_type: 'selfhosted',
        plan:         plan.key,
        billing:      'annual',
      },
    });
    console.log(`   Annual price:  ${annualPrice.id}  ($${plan.annual_usd / 100}/yr)`);

    // 4. Create monthly payment link
    const monthlyLink = await stripe.paymentLinks.create({
      line_items: [{ price: monthlyPrice.id, quantity: 1 }],
      metadata: {
        product_type: 'selfhosted',
        plan:         plan.key,
        billing:      'monthly',
      },
      // Collect billing address and phone for compliance
      billing_address_collection: 'auto',
      // Redirect after payment — update this to your actual success page
      after_completion: {
        type:     'redirect',
        redirect: { url: `${process.env.APP_URL || 'https://pontensolutions.com'}/nomii/license-success` },
      },
    });
    console.log(`   Monthly link:  ${monthlyLink.url}`);

    // 5. Create annual payment link
    const annualLink = await stripe.paymentLinks.create({
      line_items: [{ price: annualPrice.id, quantity: 1 }],
      metadata: {
        product_type: 'selfhosted',
        plan:         plan.key,
        billing:      'annual',
      },
      billing_address_collection: 'auto',
      after_completion: {
        type:     'redirect',
        redirect: { url: `${process.env.APP_URL || 'https://pontensolutions.com'}/nomii/license-success` },
      },
    });
    console.log(`   Annual link:   ${annualLink.url}`);

    results.push({
      plan:        plan.key,
      product_id:  product.id,
      monthly: { price_id: monthlyPrice.id, url: monthlyLink.url },
      annual:  { price_id: annualPrice.id,  url: annualLink.url  },
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log('✓ Done! Payment links:\n');

  for (const r of results) {
    console.log(`${r.plan.toUpperCase()}`);
    console.log(`  Monthly: ${r.monthly.url}`);
    console.log(`  Annual:  ${r.annual.url}`);
    console.log('');
  }

  console.log('Add these env vars to your .env for reference:');
  for (const r of results) {
    const k = r.plan.toUpperCase();
    console.log(`STRIPE_SELFHOSTED_PRICE_${k}_MONTHLY=${r.monthly.price_id}`);
    console.log(`STRIPE_SELFHOSTED_PRICE_${k}_ANNUAL=${r.annual.price_id}`);
  }

  console.log('\nNext: make sure your Stripe webhook includes checkout.session.completed');
  console.log(`Webhook URL: ${process.env.APP_URL ? process.env.APP_URL.replace('app.', 'api.') : 'https://api.pontensolutions.com'}/api/stripe/webhook\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
