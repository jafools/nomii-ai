import { useState } from "react";
import { createBillingPortal } from "@/lib/shenmayApi";
import { ExternalLink, Users, MessageSquare, AlertTriangle, TrendingUp } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Notice, Button } from "@/components/shenmay/ui/ShenmayUI";
import PlanChip from "./PlanChip";
import UsageMeter from "./UsageMeter";
import UpgradeNudge from "./UpgradeNudge";
import { STRIPE_PORTAL_LINK, UPGRADE_MAP } from "./_constants";

export default function SaaSView({ shenmayUser, shenmayTenant, currentPlan, isTrialPlan, isActive, usage, stripeConfig }) {
  const [busy, setBusy] = useState(false);

  const handleManageBilling = async () => {
    setBusy(true);
    try { const { url } = await createBillingPortal(); window.open(url, "_blank"); }
    catch { window.open(STRIPE_PORTAL_LINK, "_blank"); }
    finally { setBusy(false); }
  };

  const hasLimitWarning = usage && (usage.near_customer_limit || usage.near_message_limit);
  const hasLimitReached = usage && (usage.customer_limit_reached || usage.message_limit_reached);

  return (
    <div>
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
}
