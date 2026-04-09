/**
 * NomiiPlans — pricing/upgrade page inside the dashboard.
 * Embeds the Stripe pricing table with tenant_id as client_reference_id
 * so the webhook can identify which tenant completed checkout.
 */

import { useEffect, useState, useCallback } from "react";
import { useNomiiAuth } from "@/contexts/NomiiAuthContext";
import { createBillingPortal, getSubscription as fetchSubscriptionUsage } from "@/lib/nomiiApi";
import { ExternalLink, Crown, Users, MessageSquare, Zap, TrendingUp, AlertTriangle } from "lucide-react";

const STRIPE_PRICING_TABLE_ID  = "prctbl_1TBzcVBlxts7IvMoJ2bWRd47";
const STRIPE_PUBLISHABLE_KEY   = "pk_live_U89VEYjy02VivrGxi5QF2IIw00cPn8Ts2n";
const STRIPE_PORTAL_LINK       = "https://billing.stripe.com/p/login/28EbJ0cqz4y5gZEgS68N200";

const PLAN_LABELS = {
  free:         "Free",
  trial:        "Trial",
  starter:      "Starter",
  growth:       "Growth",
  professional: "Professional",
  enterprise:   "Enterprise",
  master:       "Master",
};

const PLAN_COLORS = {
  free:         "#6B7280",
  trial:        "#8B5CF6",
  starter:      "#3B82F6",
  growth:       "#10B981",
  professional: "#C9A84C",
  enterprise:   "#C9A84C",
  master:       "#C9A84C",
};

function UsageMeter({ icon: Icon, label, used, limit, pct, nearLimit, limitReached }) {
  if (limit === null || limit === undefined) {
    return (
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4" style={{ color: "rgba(255,255,255,0.30)" }} />
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</span>
        </div>
        <p className="text-lg font-bold" style={{ color: "rgba(255,255,255,0.70)" }}>
          {used?.toLocaleString() ?? 0}
          <span className="text-sm font-normal ml-1" style={{ color: "rgba(255,255,255,0.30)" }}>/ Unlimited</span>
        </p>
      </div>
    );
  }

  const displayPct = Math.min(100, pct ?? 0);
  const barColor = limitReached ? "#EF4444" : nearLimit ? "#F59E0B" : "#C9A84C";
  const statusLabel = limitReached ? "Limit reached" : nearLimit ? `${displayPct}% used` : `${displayPct}% used`;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: limitReached ? "rgba(239,68,68,0.06)" : nearLimit ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${limitReached ? "rgba(239,68,68,0.20)" : nearLimit ? "rgba(245,158,11,0.20)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: limitReached ? "#EF4444" : nearLimit ? "#F59E0B" : "rgba(255,255,255,0.30)" }} />
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</span>
        </div>
        <span className="text-[10px] font-semibold" style={{ color: barColor }}>{statusLabel}</span>
      </div>
      <p className="text-lg font-bold mb-2" style={{ color: limitReached ? "#EF4444" : nearLimit ? "#F59E0B" : "rgba(255,255,255,0.80)" }}>
        {used?.toLocaleString() ?? 0}
        <span className="text-sm font-normal ml-1" style={{ color: "rgba(255,255,255,0.30)" }}>/ {limit?.toLocaleString()}</span>
      </p>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${displayPct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

const NomiiPlans = () => {
  const { nomiiUser, nomiiTenant, subscription } = useNomiiAuth();
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);
  const [isSelfHosted, setIsSelfHosted] = useState(false);

  const currentPlan = subscription?.plan || "free";
  const isMaster    = currentPlan === "master";
  const isEnterprise = currentPlan === "enterprise";
  const isActive    = ["active"].includes(subscription?.status) && !["free", "trial"].includes(currentPlan);
  const planColor   = PLAN_COLORS[currentPlan] || "#6B7280";
  const planLabel   = PLAN_LABELS[currentPlan] || currentPlan;
  const isTrialPlan = ["free", "trial"].includes(currentPlan);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await fetchSubscriptionUsage();
      if (data?.usage) setUsage(data.usage);
    } catch {}
  }, []);

  // Detect deployment mode — determines whether to show Stripe or license panel
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { if (d.deployment === "selfhosted") setIsSelfHosted(true); })
      .catch(() => {});
  }, []);

  // Inject Stripe pricing table script once (SaaS only)
  useEffect(() => {
    if (isSelfHosted) return;
    if (document.querySelector('script[src*="pricing-table"]')) return;
    const script = document.createElement("script");
    script.src   = "https://js.stripe.com/v3/pricing-table.js";
    script.async = true;
    document.head.appendChild(script);
  }, [isSelfHosted]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const handleManageBilling = async () => {
    setBusy(true);
    try {
      const { url } = await createBillingPortal();
      window.open(url, "_blank");
    } catch {
      window.open(STRIPE_PORTAL_LINK, "_blank");
    } finally {
      setBusy(false);
    }
  };

  // ── Self-hosted: show license status instead of Stripe ──────────────────
  if (isSelfHosted) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.92)" }}>License & Usage</h2>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={{ background: `${planColor}22`, color: planColor, border: `1px solid ${planColor}44` }}
            >
              {planLabel}
            </span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
              Self-hosted deployment
            </p>
          </div>
        </div>

        {/* Trial banner */}
        {isTrialPlan && (
          <div className="rounded-xl px-5 py-4 flex items-start gap-3"
            style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <Zap className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#8B5CF6" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#8B5CF6" }}>Free trial active</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(139,92,246,0.80)" }}>
                Trial is limited to 20 messages/mo and 1 customer.
                Purchase a license to unlock your full plan.
              </p>
            </div>
          </div>
        )}

        {/* Limit reached banner */}
        {usage && (usage.customer_limit_reached || usage.message_limit_reached) && (
          <div className="rounded-xl px-5 py-4 flex items-start gap-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#EF4444" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>Plan limit reached</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(239,68,68,0.70)" }}>
                Purchase a license and add your key below to restore service immediately.
              </p>
            </div>
          </div>
        )}

        {/* Usage meters */}
        {usage && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
              Current Usage
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UsageMeter
                icon={Users}
                label="Customers"
                used={usage.customers_count}
                limit={usage.customers_limit}
                pct={usage.customers_pct}
                nearLimit={usage.near_customer_limit}
                limitReached={usage.customer_limit_reached}
              />
              <UsageMeter
                icon={MessageSquare}
                label="Messages this month"
                used={usage.messages_used}
                limit={usage.messages_limit}
                pct={usage.messages_pct}
                nearLimit={usage.near_message_limit}
                limitReached={usage.message_limit_reached}
              />
            </div>
          </div>
        )}

        {/* Upgrade instructions */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <Crown size={20} style={{ color: "#C9A84C" }} />
            <p className="font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
              {isTrialPlan ? "Upgrade from trial" : "Change your license"}
            </p>
          </div>
          <ol className="space-y-3 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            <li className="flex items-start gap-2">
              <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>1.</span>
              <span>
                Purchase a license at{" "}
                <a
                  href="https://pontensolutions.com/nomii/license"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "#C9A84C" }}
                >
                  pontensolutions.com/nomii/license
                </a>
                {" "}— you'll receive a key by email.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>2.</span>
              <span>
                Open your <code className="text-xs px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>.env</code> file
                and set <code className="text-xs px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>NOMII_LICENSE_KEY=your-key</code>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>3.</span>
              <span>
                Restart the backend:{" "}
                <code className="text-xs px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>
                  docker compose -f docker-compose.selfhosted.yml restart backend
                </code>
              </span>
            </li>
          </ol>
          <a
            href="https://pontensolutions.com/nomii/license"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.35)", color: "#C9A84C" }}
          >
            <Zap size={14} />
            Get a license
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    );
  }

  if (isMaster || isEnterprise) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.92)" }}>Plans & Billing</h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
            {isMaster ? "Master account — unlimited access, no billing required." : "Enterprise plan — contact your account manager for billing."}
          </p>
        </div>
        <div className="rounded-2xl p-8 flex items-center gap-6"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,168,76,0.20)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(201,168,76,0.12)" }}>
            <Crown size={28} style={{ color: "#C9A84C" }} />
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: "rgba(255,255,255,0.90)" }}>
              {isMaster ? "Master License" : "Enterprise Plan"}
            </p>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.40)" }}>
              Unlimited customers · Unlimited messages · Never expires
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasLimitWarning = usage && (usage.near_customer_limit || usage.near_message_limit);
  const hasLimitReached = usage && (usage.customer_limit_reached || usage.message_limit_reached);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.92)" }}>Plans & Billing</h2>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              style={{ background: `${planColor}22`, color: planColor, border: `1px solid ${planColor}44` }}
            >
              {planLabel}
            </span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.40)" }}>
              {["free", "trial"].includes(currentPlan)
                ? "Upgrade to unlock more customers and AI messages."
                : `Current plan. ${isActive ? "Manage your billing below." : ""}`}
            </p>
          </div>
        </div>
        {isActive && (
          <button
            onClick={handleManageBilling}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:bg-white/[0.04]"
            style={{ border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.60)" }}
          >
            <ExternalLink size={14} />
            {busy ? "Opening..." : "Manage Billing & Invoices"}
          </button>
        )}
      </div>

      {/* Limit warning banner */}
      {hasLimitReached && (
        <div className="rounded-xl px-5 py-4 flex items-start gap-3"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#EF4444" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#EF4444" }}>Plan limit reached</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(239,68,68,0.70)" }}>
              {usage.customer_limit_reached && "No new AI agents will be spawned for new customers. "}
              {usage.message_limit_reached && "All AI agents are currently halted until the next billing period. "}
              Upgrade your plan to restore service immediately.
            </p>
          </div>
        </div>
      )}
      {!hasLimitReached && hasLimitWarning && (
        <div className="rounded-xl px-5 py-4 flex items-start gap-3"
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.20)" }}>
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#F59E0B" }}>Approaching your plan limits</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(245,158,11,0.70)" }}>
              You're nearing your plan's limits. Consider upgrading to avoid any service interruption.
            </p>
          </div>
        </div>
      )}

      {/* Usage summary */}
      {usage && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
            Current Usage
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UsageMeter
              icon={Users}
              label="Customers"
              used={usage.customers_count}
              limit={usage.customers_limit}
              pct={usage.customers_pct}
              nearLimit={usage.near_customer_limit}
              limitReached={usage.customer_limit_reached}
            />
            <UsageMeter
              icon={MessageSquare}
              label="Messages this month"
              used={usage.messages_used}
              limit={usage.messages_limit}
              pct={usage.messages_pct}
              nearLimit={usage.near_message_limit}
              limitReached={usage.message_limit_reached}
            />
          </div>
        </div>
      )}

      {/* Stripe Pricing Table */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          Available Plans
        </p>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <stripe-pricing-table
            pricing-table-id={STRIPE_PRICING_TABLE_ID}
            publishable-key={STRIPE_PUBLISHABLE_KEY}
            client-reference-id={nomiiTenant?.id || ""}
            customer-email={nomiiUser?.email || ""}
          />
        </div>
      </div>

      {/* Enterprise CTA */}
      <div className="rounded-2xl p-6 text-center"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <TrendingUp className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.15)" }} />
        <h3 className="font-bold mb-1" style={{ color: "rgba(255,255,255,0.80)" }}>Need more?</h3>
        <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
          Enterprise plans with unlimited customers, dedicated SLA, and custom integrations.
        </p>
        <a
          href="https://pontensolutions.com/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:bg-white/[0.05]"
          style={{ border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.60)" }}
        >
          Contact Sales <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
};

export default NomiiPlans;
