/**
 * SHENMAY AI — Tenant Portal: Current User
 *
 * Sub-router mounted by ../portal.js at `/api/portal/me`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   GET /api/portal/me — combined tenant + admin + subscription summary used
 *                        as the dashboard's bootstrap call after login
 */

const router = require('express').Router();
const db = require('../../db');
const { getSubscription } = require('../../middleware/subscription');
const { DEPLOYMENT_MODES, isSelfHosted } = require('../../config/plans');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         t.id, t.name, t.slug, t.agent_name, t.vertical,
         t.primary_color, t.secondary_color,
         t.widget_api_key, t.website_url, t.company_description, t.logo_url,
         t.chat_bubble_name,
         t.onboarding_steps, t.widget_verified_at, t.is_active,
         t.llm_api_key_last4, t.llm_api_key_validated,
         t.llm_api_key_provider, t.llm_provider,
         t.pii_tokenization_enabled,
         t.anonymous_only_mode,
         a.id AS admin_id, a.email, a.first_name, a.last_name, a.role
       FROM tenants t
       JOIN tenant_admins a ON a.tenant_id = t.id
       WHERE t.id = $1 AND a.id = $2`,
      [req.portal.tenant_id, req.portal.admin_id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const r = rows[0];

    // Load subscription
    const sub = await getSubscription(req.portal.tenant_id);

    res.json({
      tenant: {
        id:                  r.id,
        name:                r.name,
        slug:                r.slug,
        agent_name:          r.agent_name,
        vertical:            r.vertical,
        primary_color:       r.primary_color,
        secondary_color:     r.secondary_color,
        widget_key:          r.widget_api_key,
        website_url:         r.website_url,
        company_description: r.company_description,
        logo_url:            r.logo_url,
        chat_bubble_name:    r.chat_bubble_name,
        onboarding_steps:    r.onboarding_steps,
        widget_verified:     r.widget_verified_at !== null,
        llm_api_key_last4:    r.llm_api_key_last4 || null,
        llm_api_key_validated: r.llm_api_key_validated || false,
        llm_api_key_provider: r.llm_api_key_provider || 'anthropic',
        llm_provider:         r.llm_provider || 'claude',
        pii_tokenization_enabled: r.pii_tokenization_enabled !== false,
        anonymous_only_mode: r.anonymous_only_mode === true,
      },
      admin: {
        id:         r.admin_id,
        email:      r.email,
        first_name: r.first_name,
        last_name:  r.last_name,
        role:       r.role,
      },
      subscription: sub ? {
        plan:                    sub.plan,
        status:                  sub.status,
        max_customers:           sub.max_customers,
        max_messages_month:      sub.max_messages_month,
        messages_used_this_month: sub.messages_used_this_month,
        managed_ai_enabled:      sub.managed_ai_enabled,
        trial_ends_at:           sub.trial_ends_at,
        current_period_end:      sub.current_period_end,
        canceled_at:             sub.canceled_at,
        stripe_customer_id:      sub.stripe_customer_id || null,
      } : null,
      // Lets the dashboard branch its billing UI: SaaS shows Stripe pricing
      // table; self-hosted shows "Buy a license" + Activate-Key form.
      deployment_mode: isSelfHosted() ? DEPLOYMENT_MODES.SELFHOSTED : DEPLOYMENT_MODES.SAAS,
    });
  } catch (err) { next(err); }
});

module.exports = router;
