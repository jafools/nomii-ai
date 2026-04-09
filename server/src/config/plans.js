/**
 * NOMII AI — Shared Plan Limits
 *
 * Single source of truth for plan limits used by:
 *   - stripe-webhook.js  (SaaS: apply limits after Stripe checkout)
 *   - licenseService.js  (self-hosted: apply limits after license validation)
 *   - seedSelfHostedTenant.js (self-hosted: seed trial subscription on first boot)
 */

const PLAN_LIMITS = {
  trial:        { max_customers: 1,     max_messages_month: 20,     managed_ai: false, max_agents: 1   },
  starter:      { max_customers: 50,    max_messages_month: 1000,   managed_ai: false, max_agents: 10  },
  growth:       { max_customers: 250,   max_messages_month: 5000,   managed_ai: true,  max_agents: 25  },
  professional: { max_customers: 1000,  max_messages_month: 25000,  managed_ai: true,  max_agents: 100 },
  enterprise:   { max_customers: 99999, max_messages_month: 999999, managed_ai: true,  max_agents: 999 },
  master:       { max_customers: 99999, max_messages_month: 999999, managed_ai: true,  max_agents: 999 },
};

/**
 * Returns true when running as a self-hosted single-tenant deployment.
 * Set NOMII_DEPLOYMENT=selfhosted in docker-compose.selfhosted.yml.
 */
function isSelfHosted() {
  return process.env.NOMII_DEPLOYMENT === 'selfhosted';
}

module.exports = { PLAN_LIMITS, isSelfHosted };
