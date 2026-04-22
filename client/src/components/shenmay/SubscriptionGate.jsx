/**
 * SubscriptionGate — wraps dashboard content and shows a lock overlay
 * when the tenant's subscription is expired, canceled, or trial ended.
 *
 * Pass `subscription` from the /me response. Master & enterprise always pass.
 */

import { useState } from "react";
import { Lock, Zap, Clock } from "lucide-react";
import { createCheckout } from "@/lib/shenmayApi";
import { UNRESTRICTED_PLANS, SUBSCRIPTION_STATUSES } from "@/lib/constants";

function isValid(sub) {
  if (!sub) return false;
  if (UNRESTRICTED_PLANS.includes(sub.plan)) return true;
  if (sub.status === SUBSCRIPTION_STATUSES.ACTIVE) return true;
  if (sub.status === SUBSCRIPTION_STATUSES.TRIALING) return new Date(sub.trial_ends_at) > new Date();
  return false;
}

function daysLeft(dateStr) {
  if (!dateStr) return 0;
  const diff = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function useSubscriptionStatus(subscription) {
  const valid = isValid(subscription);
  const trialing = subscription?.status === SUBSCRIPTION_STATUSES.TRIALING;
  const trialDays = trialing ? daysLeft(subscription?.trial_ends_at) : 0;
  const isMaster = subscription?.plan === "master";
  return { valid, trialing, trialDays, isMaster, plan: subscription?.plan, status: subscription?.status };
}

export default function SubscriptionGate({ subscription, children }) {
  const { valid, trialing, trialDays } = useSubscriptionStatus(subscription);
  const [loading, setLoading] = useState(false);

  if (valid) {
    return (
      <>
        {/* Trial banner */}
        {trialing && trialDays <= 7 && (
          <div className="mb-4 px-4 py-3 rounded-xl flex items-center justify-between text-sm"
            style={{ background: "rgba(15,95,92,0.10)", border: "1px solid rgba(15,95,92,0.20)" }}>
            <span className="flex items-center gap-2" style={{ color: "#0F5F5C" }}>
              <Clock size={14} />
              {trialDays === 0
                ? "Your trial ends today!"
                : `${trialDays} day${trialDays > 1 ? "s" : ""} left in your free trial`}
            </span>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const { url } = await createCheckout("starter");
                  window.open(url, "_blank");
                } catch { /* ignore */ }
                setLoading(false);
              }}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}
              disabled={loading}
            >
              {loading ? "Loading..." : "Upgrade Now"}
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  // ── Locked state ─────────────────────────────────────────────────────────
  const reason = !subscription
    ? "No subscription found."
    : subscription.status === SUBSCRIPTION_STATUSES.TRIALING
    ? "Your free trial has ended."
    : subscription.status === SUBSCRIPTION_STATUSES.PAST_DUE
    ? "Your payment is past due."
    : subscription.status === SUBSCRIPTION_STATUSES.CANCELED
    ? "Your subscription has been canceled."
    : "Your subscription is not active.";

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(15,95,92,0.12)" }}>
        <Lock size={28} style={{ color: "#0F5F5C" }} />
      </div>

      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold mb-2" style={{ color: "#1A1D1A" }}>
          Subscription Required
        </h2>
        <p className="text-sm mb-6" style={{ color: "#6B6B64" }}>
          {reason} Upgrade to a paid plan to unlock your dashboard, widget, and all ShenmayAI features.
        </p>
      </div>

      <button
        onClick={async () => {
          setLoading(true);
          try {
            const { url } = await createCheckout("starter");
            window.open(url, "_blank");
          } catch { /* ignore */ }
          setLoading(false);
        }}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
        style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}
        disabled={loading}
      >
        <Zap size={16} />
        {loading ? "Loading..." : "View Plans & Upgrade"}
      </button>

      <a href="/shenmay/dashboard/plans" className="text-xs underline" style={{ color: "#6B6B64" }}>
        Compare plans
      </a>
    </div>
  );
}
