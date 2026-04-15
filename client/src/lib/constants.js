/**
 * NOMII AI — Client-side shared constants and JSDoc typedefs.
 *
 * Keep in sync with server/src/config/plans.js. The client-side subset covers
 * only values that are rendered or branched on in the dashboard UI.
 *
 * ── JSDoc typedefs ─────────────────────────────────────────────────────────
 * @typedef {'free'|'trial'|'starter'|'growth'|'professional'|'enterprise'|'master'} PlanName
 * @typedef {'active'|'trialing'|'past_due'|'canceled'|'expired'|'incomplete'} SubscriptionStatus
 * @typedef {'flag'|'human_reply'|'escalation'|'limit_reached'} NotificationType
 * @typedef {'selfhosted'|'saas'} DeploymentMode
 *
 * @typedef {Object} Subscription
 * @property {PlanName}           plan
 * @property {SubscriptionStatus} status
 * @property {number}             max_customers
 * @property {number}             max_messages_month
 * @property {number}             messages_used_this_month
 * @property {string|null}        trial_ends_at
 * @property {string|null}        current_period_end
 *
 * @typedef {Object} Notification
 * @property {string}           id
 * @property {NotificationType} type
 * @property {string}           title
 * @property {string|null}      body
 * @property {string|null}      resource_type
 * @property {string|null}      resource_id
 * @property {string|null}      customer_name
 * @property {string|null}      read_at
 * @property {string}           created_at
 */

/** @type {PlanName[]} */
export const UNRESTRICTED_PLANS = ["master", "enterprise"];

/** @type {Record<PlanName, { label: string, color: string }>} */
export const PLAN_LABELS = {
  free:         { label: "Free",         color: "#6B7280" },
  trial:        { label: "Trial",        color: "#8B5CF6" },
  starter:      { label: "Starter",      color: "#3B82F6" },
  growth:       { label: "Growth",       color: "#10B981" },
  professional: { label: "Professional", color: "#C9A84C" },
  enterprise:   { label: "Enterprise",   color: "#C9A84C" },
  master:       { label: "Master",       color: "#C9A84C" },
};

export const NOTIFICATION_TYPES = Object.freeze({
  FLAG:          "flag",
  HUMAN_REPLY:   "human_reply",
  ESCALATION:    "escalation",
  LIMIT_REACHED: "limit_reached",
});

export const SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE:     "active",
  TRIALING:   "trialing",
  PAST_DUE:   "past_due",
  CANCELED:   "canceled",
  EXPIRED:    "expired",
  INCOMPLETE: "incomplete",
});

export const DEPLOYMENT_MODES = Object.freeze({
  SELFHOSTED: "selfhosted",
  SAAS:       "saas",
});

/**
 * @param {Subscription|null|undefined} sub
 * @returns {boolean} true when the plan bypasses all limit checks.
 */
export function isUnrestrictedPlan(sub) {
  return !!sub && UNRESTRICTED_PLANS.includes(sub.plan);
}
