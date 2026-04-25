/**
 * ShenmayPlans — pricing/upgrade page inside the dashboard.
 * Branches between three views (self-hosted licensing, master/enterprise stub,
 * default SaaS Stripe-pricing-table) defined in ./plans/. This file owns the
 * shared auth + state lifecycle that every view consumes.
 */
import { useEffect, useState, useCallback } from "react";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  getSubscription as fetchSubscriptionUsage,
  getLicense,
} from "@/lib/shenmayApi";
import { DEPLOYMENT_MODES } from "@/lib/constants";
import {
  STRIPE_PRICING_TABLE_ID_LIVE,
  STRIPE_PUBLISHABLE_KEY_LIVE,
} from "./plans/_constants";
import SelfHostedView from "./plans/SelfHostedView";
import EnterpriseView from "./plans/EnterpriseView";
import SaaSView from "./plans/SaaSView";

const ShenmayPlans = () => {
  const { shenmayUser, shenmayTenant, subscription } = useShenmayAuth();
  const [usage, setUsage] = useState(null);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const [stripeConfig, setStripeConfig] = useState({
    publishableKey: STRIPE_PUBLISHABLE_KEY_LIVE,
    pricingTableId: STRIPE_PRICING_TABLE_ID_LIVE,
  });

  const [licenseInfo, setLicenseInfo] = useState(null);

  const currentPlan  = subscription?.plan || "free";
  const isMaster     = currentPlan === "master";
  const isEnterprise = currentPlan === "enterprise";
  const isActive     = ["active"].includes(subscription?.status) && !["free", "trial"].includes(currentPlan);
  const isTrialPlan  = ["free", "trial"].includes(currentPlan);

  const fetchUsage = useCallback(async () => {
    try { const data = await fetchSubscriptionUsage(); if (data?.usage) setUsage(data.usage); } catch { /* ignored */ }
  }, []);

  const fetchLicenseStatus = useCallback(async () => {
    try { const data = await getLicense(); setLicenseInfo(data); } catch { /* ignored */ }
  }, []);

  // Probe deployment mode + Stripe config on mount.
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((d) => {
      if (d.deployment === DEPLOYMENT_MODES.SELFHOSTED) setIsSelfHosted(true);
      if (d.stripe?.publishableKey && d.stripe?.pricingTableId) {
        setStripeConfig({ publishableKey: d.stripe.publishableKey, pricingTableId: d.stripe.pricingTableId });
      }
    }).catch(() => {});
  }, []);

  // Self-hosted: load license status. SaaS: no-op.
  useEffect(() => { if (isSelfHosted) fetchLicenseStatus(); }, [isSelfHosted, fetchLicenseStatus]);

  // SaaS: lazy-inject the Stripe pricing-table script. Self-hosted skips it
  // because the embed isn't shown in that view.
  useEffect(() => {
    if (isSelfHosted) return;
    if (document.querySelector('script[src*="pricing-table"]')) return;
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/pricing-table.js";
    script.async = true;
    document.head.appendChild(script);
  }, [isSelfHosted]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const refreshSelfHosted = useCallback(async () => {
    await fetchLicenseStatus();
    await fetchUsage();
  }, [fetchLicenseStatus, fetchUsage]);

  if (isSelfHosted) {
    return (
      <SelfHostedView
        currentPlan={currentPlan}
        isTrialPlan={isTrialPlan}
        usage={usage}
        licenseInfo={licenseInfo}
        onRefresh={refreshSelfHosted}
      />
    );
  }

  if (isMaster || isEnterprise) {
    return <EnterpriseView isMaster={isMaster} />;
  }

  return (
    <SaaSView
      shenmayUser={shenmayUser}
      shenmayTenant={shenmayTenant}
      currentPlan={currentPlan}
      isTrialPlan={isTrialPlan}
      isActive={isActive}
      usage={usage}
      stripeConfig={stripeConfig}
    />
  );
};

export default ShenmayPlans;
