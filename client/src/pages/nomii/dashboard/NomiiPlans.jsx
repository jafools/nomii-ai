/**
 * NomiiPlans — pricing/upgrade page inside the dashboard.
 * Embeds the Stripe pricing table with tenant_id as client_reference_id
 * so the webhook can identify which tenant completed checkout.
 */

import { useEffect, useState, useCallback } from "react";
import { useNomiiAuth } from "@/contexts/NomiiAuthContext";
import {
  createBillingPortal,
  getSubscription as fetchSubscriptionUsage,
  getLicense,
  activateLicense,
  deactivateLicense,
} from "@/lib/nomiiApi";
import { ExternalLink, Crown, Users, MessageSquare, Zap, TrendingUp, AlertTriangle, Key, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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

  // Self-hosted license activation state
  const [licenseInfo, setLicenseInfo]       = useState(null);
  const [licenseInput, setLicenseInput]     = useState("");
  const [licenseBusy, setLicenseBusy]       = useState(false);
  const [licenseError, setLicenseError]     = useState(null);
  const [licenseSuccess, setLicenseSuccess] = useState(null);

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

  const fetchLicenseStatus = useCallback(async () => {
    try {
      const data = await getLicense();
      setLicenseInfo(data);
    } catch { /* 404 on SaaS / non-self-hosted, just ignore */ }
  }, []);

  // Detect deployment mode — determines whether to show Stripe or license panel
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { if (d.deployment === "selfhosted") setIsSelfHosted(true); })
      .catch(() => {});
  }, []);

  // Load license status whenever we discover we're on self-hosted
  useEffect(() => {
    if (isSelfHosted) fetchLicenseStatus();
  }, [isSelfHosted, fetchLicenseStatus]);

  const handleActivateLicense = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!licenseInput.trim()) return;
    setLicenseBusy(true);
    setLicenseError(null);
    setLicenseSuccess(null);
    try {
      const res = await activateLicense(licenseInput.trim());
      setLicenseSuccess(`License activated — ${res.plan} plan${res.expires_at ? ` (expires ${new Date(res.expires_at).toLocaleDateString()})` : ""}.`);
      setLicenseInput("");
      await fetchLicenseStatus();
      await fetchUsage();
    } catch (err) {
      setLicenseError(err.message || "Activation failed");
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleDeactivateLicense = async () => {
    if (!window.confirm("Deactivate this license? You'll revert to trial limits (20 messages/mo, 1 customer).")) return;
    setLicenseBusy(true);
    setLicenseError(null);
    setLicenseSuccess(null);
    try {
      await deactivateLicense();
      setLicenseSuccess("License deactivated. Trial limits restored.");
      await fetchLicenseStatus();
      await fetchUsage();
    } catch (err) {
      setLicenseError(err.message || "Deactivation failed");
    } finally {
      setLicenseBusy(false);
    }
  };

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

        {/* ── Current license status (only if a key is active) ────────────── */}
        {licenseInfo?.has_license && (
          <div className="rounded-2xl p-6 space-y-3"
            style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.20)" }}>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} style={{ color: "#22C55E" }} />
              <p className="font-bold" style={{ color: "rgba(255,255,255,0.92)" }}>
                License active
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: "rgba(255,255,255,0.30)" }}>Key</p>
                <code className="text-xs px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}>
                  {licenseInfo.key_masked}
                </code>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: "rgba(255,255,255,0.30)" }}>Plan</p>
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {(PLAN_LABELS[licenseInfo.plan] || licenseInfo.plan)} — {licenseInfo.max_messages_month} msg/mo, {licenseInfo.max_customers} customers
                </p>
              </div>
            </div>
            {licenseInfo.validated_at && (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.40)" }}>
                Last validated {new Date(licenseInfo.validated_at).toLocaleString()} (revalidates every 24h)
              </p>
            )}
            {!licenseInfo.env_var_in_use && (
              <button
                onClick={handleDeactivateLicense}
                disabled={licenseBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444" }}
              >
                <XCircle size={14} />
                Deactivate license
              </button>
            )}
            {licenseInfo.env_var_in_use && (
              <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.40)" }}>
                License is pinned in <code style={{ background: "rgba(255,255,255,0.08)" }}>NOMII_LICENSE_KEY</code> in your .env — to deactivate, remove that line and restart.
              </p>
            )}
          </div>
        )}

        {/* ── Activate / change license ─────────────────────────────────────── */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <Key size={20} style={{ color: "#C9A84C" }} />
            <p className="font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
              {licenseInfo?.has_license ? "Change license" : (isTrialPlan ? "Activate a license" : "Update license")}
            </p>
          </div>

          {!licenseInfo?.has_license && (
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
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
              {" "}— you'll receive a key by email. Paste it below to activate immediately (no restart needed).
            </p>
          )}

          {licenseInfo?.env_var_in_use ? (
            <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.50)" }}>
              Your license is currently pinned via <code style={{ background: "rgba(255,255,255,0.08)" }}>NOMII_LICENSE_KEY</code> in .env. To change it from the dashboard, remove that line and restart, then come back here.
            </p>
          ) : (
            <form onSubmit={handleActivateLicense} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                  License key
                </label>
                <input
                  type="text"
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  placeholder="NOMII-XXXX-XXXX-XXXX-XXXX"
                  disabled={licenseBusy}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-mono outline-none transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
              </div>

              {licenseError && (
                <div className="flex items-start gap-2 text-xs" style={{ color: "#EF4444" }}>
                  <XCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{licenseError}</span>
                </div>
              )}
              {licenseSuccess && (
                <div className="flex items-start gap-2 text-xs" style={{ color: "#22C55E" }}>
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <span>{licenseSuccess}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={licenseBusy || !licenseInput.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: "rgba(201,168,76,0.20)", border: "1px solid rgba(201,168,76,0.45)", color: "#C9A84C" }}
                >
                  {licenseBusy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {licenseInfo?.has_license ? "Replace license" : "Activate license"}
                </button>
                <a
                  href="https://pontensolutions.com/nomii/license"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)" }}
                >
                  Get a license
                  <ExternalLink size={12} />
                </a>
              </div>
            </form>
          )}
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
