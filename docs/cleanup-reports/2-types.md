# Cleanup Report #2 — Type-like definitions & shared enums

**Worktree branch:** `worktree-agent-aeec847b` (based on `main` @ `0566e49`)
**Stack reality:** Server is pure ESM-style CommonJS JavaScript. Client is
mixed — shadcn/ui primitives are `.tsx` but every Shenmay business component
under `client/src/pages/nomii/`, `client/src/layouts/`, `client/src/lib/`, and
`client/src/contexts/` is plain `.jsx`/`.js`. There is no PropTypes, no
`@typedef`, no generated types. Consolidation therefore means **shared
constants modules + JSDoc typedefs**, not a TypeScript migration.

## Methodology

1. Grepped for literal plan names (`'trial'`, `'starter'`, `'master'`, etc.)
   and plan-group patterns (`UNRESTRICTED_PLANS`, `VALID_PLANS`) across both
   halves.
2. Grepped for subscription `status` string comparisons
   (`=== 'active'`/`=== 'trialing'`/`=== 'canceled'`/`=== 'past_due'`).
3. Grepped for notification `type` literals (`'flag'`, `'human_reply'`,
   `'escalation'`, `'limit_reached'`).
4. Grepped for deployment-mode literal checks (`process.env.NOMII_DEPLOYMENT
   === 'selfhosted'` / client `d.deployment === "selfhosted"`).
5. Walked every React component and the API wrapper for repeated inline
   shape objects; inspected `server/src/config/plans.js` and migration 022 to
   anchor the canonical enum values.
6. Verified each SQL migration to be sure the DB never encodes a different
   enum than the JS code does.

## Findings

### HIGH — duplicated enum-like constants

| Constant | File | Line |
|---|---|---|
| `UNRESTRICTED_PLANS = ['master', 'enterprise']` | `server/src/middleware/subscription.js` | 16 |
| `UNRESTRICTED_PLANS = ['master', 'enterprise']` | `server/src/routes/widget.js` | 44 |
| `['master', 'enterprise'].includes(sub.plan)` inline | `server/src/routes/portal.js` | 675 |
| `['master', 'enterprise'].includes(sub.plan)` inline | `server/src/routes/portal.js` | 2112 |
| `UNRESTRICTED = ["master", "enterprise"]` | `client/src/components/nomii/SubscriptionGate.jsx` | 12 |
| `TRIAL_PLANS = ['trial', 'free']` | `server/src/middleware/subscription.js` | 19 |
| `VALID_PLANS = ['starter', 'growth', 'professional', 'enterprise']` | `server/src/routes/platform/licenses.js` | 65 |
| `VALID_PLANS = ['free', 'trial', 'starter', 'growth', 'professional', 'enterprise', 'master']` | `server/src/routes/portal.js` | 2578 |
| `PLAN_LABELS` (4 lookup + color pairs) | `client/src/layouts/NomiiDashboardLayout.jsx` | 83 |
| `PLAN_LABELS` + separate `PLAN_COLORS` | `client/src/pages/nomii/dashboard/NomiiPlans.jsx` | 22, 32 |
| `NOTIF_ICON` keyed by `'flag'`/`'human_reply'`/`'escalation'`/`'limit_reached'` | `client/src/layouts/NomiiDashboardLayout.jsx` | 33 |
| `'limit_reached'` literal notification insert | `server/src/middleware/subscription.js` | 231 |
| `type: 'flag'` notification | `server/src/routes/widget.js` | 828 |
| `type: 'human_reply'` notification | `server/src/routes/widget.js` | 998 |
| Seven inline `process.env.NOMII_DEPLOYMENT === 'selfhosted'` checks despite an existing `isSelfHosted()` helper | `server/src/index.js` (177, 208, 243), `server/src/routes/{onboard,portal,setup}.js`, `server/src/services/licenseService.js` | — |
| Three client `d.deployment === "selfhosted"` checks | `client/src/pages/nomii/NomiiLogin.jsx:41`, `client/src/pages/nomii/NomiiSignup.jsx:144`, `client/src/pages/nomii/dashboard/NomiiPlans.jsx:130` | — |

### MEDIUM — `planDefaults` vs `PLAN_LIMITS`

`server/src/routes/portal.js:2586` defines a `planDefaults` table for the
`/admin/set-plan` endpoint whose shape overlaps `PLAN_LIMITS` in
`server/src/config/plans.js` but **isn't identical**:

- Field name mismatch (`managed_ai_enabled` vs `managed_ai`).
- Unlimited plans are `null` here but `99999`/`999999` in `PLAN_LIMITS`
  (used as a real limit by message-counter math).
- `planDefaults` also includes `free` (trial UX), which `PLAN_LIMITS`
  deliberately omits.

Unifying these requires deciding whether unlimited is `null` or a large
integer end-to-end (DB, middleware, UI). Too risky for this pass with live
customers imminent.

### LOW — no PropTypes, no JSDoc typedefs anywhere

`grep -R "PropTypes"` and `grep -R "@typedef"` across the repo both returned
zero matches. There is no existing type taxonomy to consolidate — only
strings.

### OUT OF SCOPE / NOT TOUCHED

- `server/public/widget.html` (explicit instruction).
- `server/src/routes/chat.js:299` `type: 'escalation'` — inserts into the
  **`flags` table**, which has its own `CHECK (flag_type IN (…))` with a
  superset of values (`'confusion'`, `'risk_alert'`, …). Not the same enum
  as `notifications.type`; keeping separate is correct.
- `server/src/routes/license-checkout.js`'s `VALID_PLANS = Object.keys(PRICE_IDS)`
  — computed from a Stripe price-ID map, not a hand-rolled duplicate.
- DB migrations (`server/src/migrations/`, `server/db/migrations/`): schema
  is the source of truth; constants modules mirror it.

## Implementation log

1. **Extended `server/src/config/plans.js`** with five new exports plus two
   helpers:
   - Enum arrays: `UNRESTRICTED_PLANS`, `TRIAL_PLANS`, `VALID_ADMIN_PLANS`,
     `VALID_LICENSE_PLANS`.
   - Frozen enum maps: `NOTIFICATION_TYPES`, `SUBSCRIPTION_STATUSES`,
     `DEPLOYMENT_MODES`.
   - Helper: `isUnrestrictedPlan(sub)` (the inline pattern at four call
     sites).
   - JSDoc typedefs for `PlanName`, `SubscriptionStatus`, `NotificationType`,
     `DeploymentMode`, `PlanLimits`, `Subscription` — consumable via
     `@type` annotations without any build tooling.
2. **Created `client/src/lib/constants.js`** with the client-facing subset
   (`UNRESTRICTED_PLANS`, `PLAN_LABELS` as a unified `{label,color}` map,
   `NOTIFICATION_TYPES`, `SUBSCRIPTION_STATUSES`, `DEPLOYMENT_MODES`) and
   mirrored JSDoc typedefs for `Subscription` and `Notification`.
3. **Refactored server call sites** to import from `config/plans.js`:
   `middleware/subscription.js`, `routes/widget.js`, `routes/portal.js`
   (4 inline call sites + `VALID_PLANS` rename), `routes/platform/licenses.js`,
   `routes/setup.js`, `routes/onboard.js`, `index.js`.
4. **Replaced all inline `process.env.NOMII_DEPLOYMENT === 'selfhosted'`
   checks in `server/src/`** with `isSelfHosted()`. Zero remaining.
5. **Refactored client call sites**: `SubscriptionGate.jsx` now uses
   `UNRESTRICTED_PLANS` + `SUBSCRIPTION_STATUSES`; `NomiiDashboardLayout.jsx`
   imports `PLAN_LABELS`/`NOTIFICATION_TYPES` and drops its private copy;
   `NomiiPlans.jsx` was reshaped from two maps to one (`{label,color}`) +
   uses `DEPLOYMENT_MODES.SELFHOSTED`; `NomiiLogin.jsx`/`NomiiSignup.jsx`
   also use `DEPLOYMENT_MODES.SELFHOSTED`.

## Verification

- `node -c` passed for every edited server file.
- `cd client && npm run build` succeeded (4.41s, 2498 modules, no new
  warnings introduced).
- No migrations, tests, or widget.html modified.

## Deferred (report only)

- **Unifying `planDefaults` with `PLAN_LIMITS`** (MEDIUM). Needs a
  single-source audit of whether "unlimited" is `null` or a sentinel int.
- **PropTypes / runtime prop validation** (LOW). The Shenmay components
  accept a lot of shape props (`subscription`, `usage`, `license`,
  `notification`) with no validation. Adding PropTypes would touch ~30
  components; track as a separate clean-up pass.
- **TypeScript migration** (LOW, explicit non-goal here). The client's
  `tsconfig*.json` exists because shadcn/ui ships in TS, not because the
  app is typed. A migration would be a multi-sprint project — not
  warranted before the imminent customer launch.
