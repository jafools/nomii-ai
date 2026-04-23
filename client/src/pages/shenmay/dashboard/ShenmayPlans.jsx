/**
 * ShenmayPlans — pricing/upgrade page inside the dashboard.
 * Embeds the Stripe pricing table with tenant_id as client_reference_id
 * so the webhook can identify which tenant completed checkout.
 */
import { useEffect, useState, useCallback } from "react";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  createBillingPortal,
  getSubscription as fetchSubscriptionUsage,
  getLicense,
  activateLicense,
  deactivateLicense,
} from "@/lib/shenmayApi";
import { ExternalLink, Crown, Users, MessageSquare, Zap, TrendingUp, AlertTriangle, Key, CheckCircle2, XCircle, Loader2, ArrowRight, ChevronDown } from "lucide-react";
import { PLAN_LABELS, DEPLOYMENT_MODES } from "@/lib/constants";
import { TOKENS as T, Kicker, Display, Lede, Notice, Button, Divider } from "@/components/shenmay/ui/ShenmayUI";

// Live prod defaults
const STRIPE_PRICING_TABLE_ID_LIVE = "prctbl_1TBzcVBlxts7IvMoJ2bWRd47";
const STRIPE_PUBLISHABLE_KEY_LIVE  = "pk_live_U89VEYjy02VivrGxi5QF2IIw00cPn8Ts2n";
const STRIPE_PORTAL_LINK           = "https://billing.stripe.com/p/login/28EbJ0cqz4y5gZEgS68N200";

const UPGRADE_MAP = {
  free:    { next: "starter", delta: "50 customers (vs 1) · 1,000 messages/mo (vs 20) · Keep your own API key" },
  trial:   { next: "starter", delta: "50 customers (vs 1) · 1,000 messages/mo (vs 20) · Keep your own API key" },
  starter: { next: "growth",  delta: "250 customers (vs 50) · 5,000 messages/mo (vs 1,000) · 25 agent seats · Priority support" },
  growth:  { next: "professional", delta: "1,000 customers (vs 250) · 25,000 messages/mo (vs 5,000) · 100 agent seats · Dedicated support" },
};

const PlanChip = ({ plan }) => {
  const info = PLAN_LABELS[plan] || { label: plan, color: T.teal };
  return (
    <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 3, background: `${info.color}18`, color: info.color }}>
      {info.label}
    </span>
  );
};

function UsageMeter({ icon: Icon, label, used, limit, pct, nearLimit, limitReached }) {
  if (limit === null || limit === undefined) {
    return (
      <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Icon size={13} color={T.mute} />
          <Kicker color={T.mute}>{label}</Kicker>
        </div>
        <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 22, color: T.ink, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums" }}>
          {used?.toLocaleString() ?? 0}
          <span style={{ fontSize: 13, color: T.mute, fontWeight: 400, marginLeft: 6 }}>/ unlimited</span>
        </div>
      </div>
    );
  }

  const displayPct = Math.min(100, pct ?? 0);
  const barColor = limitReached ? T.danger : nearLimit ? T.warning : T.teal;

  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${limitReached ? `${T.danger}40` : nearLimit ? `${T.warning}40` : T.paperEdge}`,
      borderRadius: 10,
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon size={13} color={limitReached ? T.danger : nearLimit ? T.warning : T.teal} />
          <Kicker color={T.mute}>{label}</Kicker>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", color: barColor, textTransform: "uppercase" }}>
          {limitReached ? "Limit reached" : `${displayPct}% used`}
        </span>
      </div>
      <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 22, color: limitReached ? T.danger : T.ink, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", marginBottom: 10 }}>
        {used?.toLocaleString() ?? 0}
        <span style={{ fontSize: 13, color: T.mute, fontWeight: 400, marginLeft: 6 }}>/ {limit?.toLocaleString()}</span>
      </div>
      <div style={{ height: 2, borderRadius: 1, background: T.paperEdge, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${displayPct}%`, background: barColor, transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}

function UpgradeNudge({ current, next, delta }) {
  const scrollToPlans = (e) => {
    e.preventDefault();
    document.querySelector("stripe-pricing-table")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div style={{
      borderRadius: 10,
      padding: "22px 24px",
      display: "flex",
      alignItems: "center",
      gap: 20,
      flexWrap: "wrap",
      background: T.paperDeep,
      border: `1px solid ${T.paperEdge}`,
    }}>
      <div style={{ flexShrink: 0 }}>
        <Kicker color={T.mute} style={{ display: "block", marginBottom: 6 }}>Current</Kicker>
        <PlanChip plan={current} />
      </div>
      <ArrowRight size={18} color={T.mute} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <Kicker color={T.teal} style={{ display: "block", marginBottom: 6 }}>Recommended next</Kicker>
        <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 18, color: T.ink, letterSpacing: "-0.015em" }}>
          {PLAN_LABELS[next]?.label || next}
        </div>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: "4px 0 0", lineHeight: 1.5 }}>{delta}</p>
      </div>
      <Button variant="primary" size="md" onClick={scrollToPlans}>
        See plans <ChevronDown size={14} />
      </Button>
    </div>
  );
}

const ShenmayPlans = () => {
  const { shenmayUser, shenmayTenant, subscription } = useShenmayAuth();
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(null);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const [stripeConfig, setStripeConfig] = useState({
    publishableKey: STRIPE_PUBLISHABLE_KEY_LIVE,
    pricingTableId: STRIPE_PRICING_TABLE_ID_LIVE,
  });

  const [licenseInfo, setLicenseInfo]       = useState(null);
  const [licenseInput, setLicenseInput]     = useState("");
  const [licenseBusy, setLicenseBusy]       = useState(false);
  const [licenseError, setLicenseError]     = useState(null);
  const [licenseSuccess, setLicenseSuccess] = useState(null);

  const currentPlan = subscription?.plan || "free";
  const isMaster    = currentPlan === "master";
  const isEnterprise = currentPlan === "enterprise";
  const isActive    = ["active"].includes(subscription?.status) && !["free", "trial"].includes(currentPlan);
  const isTrialPlan = ["free", "trial"].includes(currentPlan);

  const fetchUsage = useCallback(async () => {
    try { const data = await fetchSubscriptionUsage(); if (data?.usage) setUsage(data.usage); } catch {}
  }, []);

  const fetchLicenseStatus = useCallback(async () => {
    try { const data = await getLicense(); setLicenseInfo(data); } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => {
      if (d.deployment === DEPLOYMENT_MODES.SELFHOSTED) setIsSelfHosted(true);
      if (d.stripe?.publishableKey && d.stripe?.pricingTableId) {
        setStripeConfig({ publishableKey: d.stripe.publishableKey, pricingTableId: d.stripe.pricingTableId });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { if (isSelfHosted) fetchLicenseStatus(); }, [isSelfHosted, fetchLicenseStatus]);

  const handleActivateLicense = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!licenseInput.trim()) return;
    setLicenseBusy(true); setLicenseError(null); setLicenseSuccess(null);
    try {
      const res = await activateLicense(licenseInput.trim());
      setLicenseSuccess(`License activated — ${res.plan} plan${res.expires_at ? ` (expires ${new Date(res.expires_at).toLocaleDateString()})` : ""}.`);
      setLicenseInput("");
      await fetchLicenseStatus(); await fetchUsage();
    } catch (err) { setLicenseError(err.message || "Activation failed"); }
    finally { setLicenseBusy(false); }
  };

  const handleDeactivateLicense = async () => {
    if (!window.confirm("Deactivate this license? You'll revert to trial limits (20 messages/mo, 1 customer).")) return;
    setLicenseBusy(true); setLicenseError(null); setLicenseSuccess(null);
    try {
      await deactivateLicense();
      setLicenseSuccess("License deactivated. Trial limits restored.");
      await fetchLicenseStatus(); await fetchUsage();
    } catch (err) { setLicenseError(err.message || "Deactivation failed"); }
    finally { setLicenseBusy(false); }
  };

  useEffect(() => {
    if (isSelfHosted) return;
    if (document.querySelector('script[src*="pricing-table"]')) return;
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/pricing-table.js";
    script.async = true;
    document.head.appendChild(script);
  }, [isSelfHosted]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const handleManageBilling = async () => {
    setBusy(true);
    try { const { url } = await createBillingPortal(); window.open(url, "_blank"); }
    catch { window.open(STRIPE_PORTAL_LINK, "_blank"); }
    finally { setBusy(false); }
  };

  // ─── SELF-HOSTED view ─────────────────────────────────────────────
  if (isSelfHosted) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <Kicker>Self-hosted · License</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>License & usage.</Display>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <PlanChip plan={currentPlan} />
            <span style={{ fontSize: 14, color: T.mute }}>Running on your own server.</span>
          </div>
        </div>

        {isTrialPlan && (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="teal" icon={Zap}>
              <strong style={{ color: T.ink }}>Free trial active.</strong>{" "}
              Limited to 20 messages/mo and 1 customer. Purchase a license to unlock your full plan.
            </Notice>
          </div>
        )}

        {usage && (usage.customer_limit_reached || usage.message_limit_reached) && (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="danger" icon={AlertTriangle}>
              <strong style={{ color: T.danger }}>Plan limit reached.</strong>{" "}
              Purchase a license and add your key below to restore service immediately.
            </Notice>
          </div>
        )}

        {usage && (
          <>
            <Kicker color={T.mute} style={{ display: "block", margin: "16px 0 14px" }}>Figure 01 · Usage</Kicker>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 32 }}>
              <UsageMeter icon={Users}          label="Customers"           used={usage.customers_count} limit={usage.customers_limit} pct={usage.customers_pct} nearLimit={usage.near_customer_limit} limitReached={usage.customer_limit_reached} />
              <UsageMeter icon={MessageSquare}  label="Messages · this month" used={usage.messages_used}   limit={usage.messages_limit}   pct={usage.messages_pct}  nearLimit={usage.near_message_limit}  limitReached={usage.message_limit_reached} />
            </div>
          </>
        )}

        {licenseInfo?.has_license && (
          <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={16} color={T.success} />
              </div>
              <div>
                <Kicker color={T.success}>License active</Kicker>
                <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 16, color: T.ink, marginTop: 2 }}>
                  {PLAN_LABELS[licenseInfo.plan]?.label || licenseInfo.plan}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, padding: "14px 0", borderTop: `1px solid ${T.paperEdge}` }}>
              <div>
                <Kicker color={T.mute} style={{ display: "block", marginBottom: 6 }}>Key</Kicker>
                <code style={{ fontFamily: T.mono, fontSize: 12, color: T.ink, background: T.paperDeep, padding: "4px 8px", borderRadius: 4 }}>
                  {licenseInfo.key_masked}
                </code>
              </div>
              <div>
                <Kicker color={T.mute} style={{ display: "block", marginBottom: 6 }}>Limits</Kicker>
                <div style={{ fontSize: 13, color: T.ink }}>
                  {licenseInfo.max_messages_month} msg/mo · {licenseInfo.max_customers} customers
                </div>
              </div>
            </div>
            {licenseInfo.validated_at && (
              <p style={{ fontSize: 12, color: T.mute, margin: "12px 0 0" }}>
                Last validated {new Date(licenseInfo.validated_at).toLocaleString()} · revalidates every 24h.
              </p>
            )}
            {!licenseInfo.env_var_in_use && (
              <div style={{ marginTop: 16 }}>
                <Button variant="danger" size="sm" onClick={handleDeactivateLicense} disabled={licenseBusy}>
                  <XCircle size={13} /> Deactivate license
                </Button>
              </div>
            )}
            {licenseInfo.env_var_in_use && (
              <p style={{ fontSize: 12, fontStyle: "italic", color: T.mute, margin: "12px 0 0" }}>
                License is pinned via <code style={{ fontFamily: T.mono, background: T.paperDeep, padding: "2px 6px", borderRadius: 3 }}>SHENMAY_LICENSE_KEY</code> in your .env — to deactivate, remove that line and restart.
              </p>
            )}
          </div>
        )}

        <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${T.teal}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Key size={16} color={T.teal} />
            </div>
            <div>
              <Kicker>{licenseInfo?.has_license ? "Change license" : (isTrialPlan ? "Activate a license" : "Update license")}</Kicker>
              <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 16, color: T.ink, marginTop: 2 }}>
                Paste your key to activate instantly.
              </div>
            </div>
          </div>

          {!licenseInfo?.has_license && (
            <Lede style={{ marginTop: 12, fontSize: 14 }}>
              Purchase a license at{" "}
              <a href="https://pontensolutions.com/nomii/license" target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40` }}>
                pontensolutions.com/nomii/license
              </a>
              . You'll receive a key by email — no restart required.
            </Lede>
          )}

          {licenseInfo?.env_var_in_use ? (
            <p style={{ fontSize: 12, fontStyle: "italic", color: T.mute, margin: "16px 0 0" }}>
              Your license is pinned via <code style={{ fontFamily: T.mono, background: T.paperDeep, padding: "2px 6px", borderRadius: 3 }}>SHENMAY_LICENSE_KEY</code> in .env. To change from the dashboard, remove that line and restart, then come back here.
            </p>
          ) : (
            <form onSubmit={handleActivateLicense} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <Kicker color={T.mute} style={{ display: "block", marginBottom: 8 }}>License key</Kicker>
                <input
                  type="text"
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  placeholder="NOMII-XXXX-XXXX-XXXX-XXXX"
                  disabled={licenseBusy}
                  spellCheck={false}
                  autoComplete="off"
                  style={{
                    width: "100%", padding: "12px 14px",
                    fontFamily: T.mono, fontSize: 14, letterSpacing: "0.04em", color: T.ink,
                    background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 6,
                    outline: "none", transition: "border-color 180ms",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.teal}1F`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = T.paperEdge; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              {licenseError && <Notice tone="danger" icon={XCircle}>{licenseError}</Notice>}
              {licenseSuccess && <Notice tone="success" icon={CheckCircle2}>{licenseSuccess}</Notice>}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button type="submit" variant="primary" disabled={licenseBusy || !licenseInput.trim()}>
                  {licenseBusy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
                  {licenseInfo?.has_license ? "Replace license" : "Activate license"}
                </Button>
                <a href="https://pontensolutions.com/nomii/license" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <Button variant="ghost">Get a license <ExternalLink size={13} /></Button>
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ─── MASTER / ENTERPRISE view ─────────────────────────────────────
  if (isMaster || isEnterprise) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <Kicker>Plans & billing</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>
            {isMaster ? "Master account." : "Enterprise plan."}
          </Display>
          <Lede>{isMaster ? "Unlimited access, no billing required." : "Contact your account manager for billing."}</Lede>
        </div>

        <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 32, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 54, height: 54, borderRadius: 10, background: `${T.teal}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Crown size={26} color={T.teal} />
          </div>
          <div>
            <Kicker color={T.teal}>Your tier</Kicker>
            <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 20, color: T.ink, letterSpacing: "-0.015em", marginTop: 4 }}>
              {isMaster ? "Master license" : "Enterprise plan"}
            </div>
            <p style={{ fontSize: 13, color: T.mute, margin: "4px 0 0" }}>
              Unlimited customers · Unlimited messages · Never expires
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── DEFAULT: SaaS pricing view ───────────────────────────────────
  const hasLimitWarning = usage && (usage.near_customer_limit || usage.near_message_limit);
  const hasLimitReached = usage && (usage.customer_limit_reached || usage.message_limit_reached);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Kicker>Plans & billing</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>Your plan.</Display>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <PlanChip plan={currentPlan} />
            <span style={{ fontSize: 14, color: T.mute }}>
              {isTrialPlan ? "Upgrade to unlock more customers and AI messages." : isActive ? "Manage your billing below." : "Current plan."}
            </span>
          </div>
        </div>
        {isActive && (
          <Button variant="ghost" size="md" onClick={handleManageBilling} disabled={busy}>
            <ExternalLink size={13} /> {busy ? "Opening…" : "Manage billing"}
          </Button>
        )}
      </div>

      {hasLimitReached && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="danger" icon={AlertTriangle}>
            <strong style={{ color: T.danger }}>Plan limit reached.</strong>{" "}
            {usage.customer_limit_reached && "No new AI agents will be spawned for new customers. "}
            {usage.message_limit_reached && "All AI agents are currently halted until the next billing period. "}
            Upgrade your plan to restore service immediately.
          </Notice>
        </div>
      )}
      {!hasLimitReached && hasLimitWarning && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="warning" icon={AlertTriangle}>
            <strong style={{ color: T.warning }}>Approaching your plan limits.</strong>{" "}
            Consider upgrading to avoid service interruption.
          </Notice>
        </div>
      )}

      {usage && (
        <>
          <Kicker color={T.mute} style={{ display: "block", margin: "12px 0 14px" }}>Figure 01 · Usage</Kicker>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 32 }}>
            <UsageMeter icon={Users}          label="Customers"             used={usage.customers_count} limit={usage.customers_limit} pct={usage.customers_pct} nearLimit={usage.near_customer_limit} limitReached={usage.customer_limit_reached} />
            <UsageMeter icon={MessageSquare}  label="Messages · this month" used={usage.messages_used}   limit={usage.messages_limit}   pct={usage.messages_pct}  nearLimit={usage.near_message_limit}  limitReached={usage.message_limit_reached} />
          </div>
        </>
      )}

      {UPGRADE_MAP[currentPlan] && (
        <div style={{ marginBottom: 32 }}>
          <UpgradeNudge current={currentPlan} next={UPGRADE_MAP[currentPlan].next} delta={UPGRADE_MAP[currentPlan].delta} />
        </div>
      )}

      <Kicker color={T.mute} style={{ display: "block", margin: "12px 0 14px" }}>Figure 02 · Choose a tier</Kicker>
      <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden", marginBottom: 32 }}>
        <stripe-pricing-table
          pricing-table-id={stripeConfig.pricingTableId}
          publishable-key={stripeConfig.publishableKey}
          client-reference-id={shenmayTenant?.id || ""}
          customer-email={shenmayUser?.email || ""}
        />
      </div>

      <div style={{ background: T.paperDeep, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 32, textAlign: "center" }}>
        <TrendingUp size={24} color={T.mute} style={{ margin: "0 auto 12px", display: "block" }} />
        <Kicker>Need more?</Kicker>
        <Display size={24} italic style={{ marginTop: 10 }}>Let's talk.</Display>
        <Lede style={{ maxWidth: 440, margin: "10px auto 20px" }}>
          Enterprise plans with unlimited customers, dedicated SLA, and custom integrations.
        </Lede>
        <a href="https://pontensolutions.com/contact" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <Button variant="primary">Contact sales <ExternalLink size={13} /></Button>
        </a>
      </div>
    </div>
  );
};

export default ShenmayPlans;
