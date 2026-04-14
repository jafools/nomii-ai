/**
 * NomiiLicense — Public license purchase page.
 * Accessible at /nomii/license (no authentication required).
 *
 * Stripe products must be configured with:
 *   metadata.product_type = 'selfhosted'
 *   metadata.plan         = 'starter' | 'growth' | 'professional'
 *
 * The Stripe webhook (stripe-webhook.js) handles checkout completion:
 * it generates a license key and emails it to the buyer automatically.
 *
 * TO SET UP: Replace the STRIPE_LINKS placeholders below with your
 * actual Stripe payment link URLs from your Stripe dashboard.
 */

import { ExternalLink, Check, Zap, Users, MessageSquare, Bot, Mail, ArrowRight } from "lucide-react";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";

// ── Replace these with your Stripe payment link URLs ──────────────────────────
// Stripe Dashboard → Payment Links → Create link
// Product metadata must include: product_type=selfhosted, plan=<tier>
const STRIPE_LINKS = {
  starter:      "https://buy.stripe.com/YOUR_STARTER_LINK",
  growth:       "https://buy.stripe.com/YOUR_GROWTH_LINK",
  professional: "https://buy.stripe.com/YOUR_PROFESSIONAL_LINK",
};
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    key:      "starter",
    name:     "Starter",
    price:    "$49",
    period:   "/ mo",
    desc:     "Perfect for small businesses getting started with AI-powered support.",
    features: [
      "50 customers",
      "1,000 AI messages / month",
      "10 concurrent agents",
      "Full memory & soul engine",
      "Email support",
    ],
    highlight: false,
    color:     "#3B82F6",
  },
  {
    key:      "growth",
    name:     "Growth",
    price:    "$149",
    period:   "/ mo",
    desc:     "For growing teams that need more capacity and managed AI.",
    features: [
      "250 customers",
      "5,000 AI messages / month",
      "25 concurrent agents",
      "Managed AI included",
      "Priority support",
    ],
    highlight: true,
    color:     "#C9A84C",
  },
  {
    key:      "professional",
    name:     "Professional",
    price:    "$349",
    period:   "/ mo",
    desc:     "For businesses running high-volume AI conversations at scale.",
    features: [
      "1,000 customers",
      "25,000 AI messages / month",
      "100 concurrent agents",
      "Managed AI included",
      "Dedicated support",
    ],
    highlight: false,
    color:     "#10B981",
  },
];

const STEPS = [
  { icon: ExternalLink, text: "Purchase your plan — you'll receive a license key by email." },
  { icon: Mail,         text: "Copy the license key from your email." },
  { icon: Zap,         text: "In your dashboard, go to Plans & Billing and paste the key to activate." },
];

export default function NomiiLicense() {
  return (
    <div
      style={{ background: "#0F1117", minHeight: "100vh", color: "rgba(255,255,255,0.85)" }}
      className="font-sans"
    >
      {/* Nav bar */}
      <div
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,17,23,0.95)" }}
        className="sticky top-0 z-10"
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/nomii/login">
            <img src={nomiiLogo} alt="Nomii AI" className="h-7" />
          </a>
          <a
            href="/nomii/login"
            className="text-xs font-semibold"
            style={{ color: "rgba(255,255,255,0.40)" }}
          >
            Sign in <ArrowRight className="inline h-3 w-3 ml-0.5" />
          </a>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-16">

        {/* Hero */}
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
            style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C" }}
          >
            <Zap className="h-3 w-3" />
            Self-hosted license
          </div>
          <h1 className="text-4xl font-bold" style={{ color: "rgba(255,255,255,0.95)" }}>
            Run Nomii AI on your own server
          </h1>
          <p className="text-base max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
            Purchase a license key, paste it into your dashboard, and unlock the full platform.
            Your data stays on your infrastructure.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className="rounded-2xl p-6 flex flex-col gap-5 relative"
              style={{
                background: plan.highlight ? "rgba(201,168,76,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${plan.highlight ? "rgba(201,168,76,0.30)" : "rgba(255,255,255,0.07)"}`,
              }}
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: "#C9A84C", color: "#0F1117" }}
                >
                  Most popular
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: plan.color }}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold" style={{ color: "rgba(255,255,255,0.92)" }}>
                    {plan.price}
                  </span>
                  <span className="text-sm mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {plan.period}
                  </span>
                </div>
                <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.40)" }}>
                  {plan.desc}
                </p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: plan.color }} />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={STRIPE_LINKS[plan.key]}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={
                  plan.highlight
                    ? { background: "#C9A84C", color: "#0F1117" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.75)" }
                }
              >
                Get {plan.name}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>

        {/* How activation works */}
        <div
          className="rounded-2xl p-8"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: "rgba(255,255,255,0.25)" }}>
            How it works
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.20)" }}
                >
                  {i + 1}
                </div>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.50)" }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise / contact row */}
        <div className="text-center space-y-2">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            Need more than 1,000 customers or a custom contract?
          </p>
          <a
            href="mailto:hello@pontensolutions.com"
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: "#C9A84C" }}
          >
            Contact us for enterprise pricing <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

      </div>
    </div>
  );
}
