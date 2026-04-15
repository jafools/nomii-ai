/**
 * Post-purchase success page for self-hosted Nomii AI license purchases.
 *
 * Reached via Stripe `success_url` after a payment on
 * pontensolutions.com/nomii/license. Self-contained — no auth, no API calls —
 * so anyone (a fresh buyer who hasn't installed yet, or an existing operator
 * topping up) lands here safely.
 *
 * Works for both paths:
 *   - "I haven't installed Nomii yet"  → primary CTA: Installation Guide
 *   - "I already have Nomii running"   → secondary: activate on your dashboard
 */
import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight, Download, Server } from "lucide-react";
import nomiiLogo from "@/assets/nomiiai-full-dark.svg";

const MARKETING_URL = "https://pontensolutions.com/nomii/self-hosted";

const NomiiLicenseSuccess = () => (
  <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
       style={{ background: "#0B0E14", color: "rgba(255,255,255,0.85)" }}>

    <img src={nomiiLogo} alt="Nomii AI" className="h-8 mb-10 opacity-90" />

    <div className="w-full max-w-xl rounded-2xl border p-8 md:p-10"
         style={{ background: "rgba(255,255,255,0.03)",
                  borderColor: "rgba(255,255,255,0.08)" }}>

      <div className="flex justify-center mb-6">
        <div className="p-3 rounded-full"
             style={{ background: "rgba(201,168,76,0.12)" }}>
          <CheckCircle size={40} style={{ color: "#C9A84C" }} />
        </div>
      </div>

      <h1 className="text-2xl md:text-3xl font-bold text-center mb-3"
          style={{ color: "rgba(255,255,255,0.95)" }}>
        Purchase complete
      </h1>

      <p className="text-center mb-2" style={{ color: "rgba(255,255,255,0.70)" }}>
        Thank you for your Nomii AI self-hosted license.
      </p>
      <p className="text-center text-sm mb-8"
         style={{ color: "rgba(255,255,255,0.55)" }}>
        We've emailed your license key — check your inbox
        (and spam folder) for a message from Nomii AI.
      </p>

      <div className="border-t pt-6 mb-6"
           style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <p className="text-sm font-semibold mb-4"
           style={{ color: "rgba(255,255,255,0.85)" }}>
          Next steps
        </p>

        <div className="flex gap-3 mb-4 p-4 rounded-lg"
             style={{ background: "rgba(255,255,255,0.02)",
                      borderLeft: "2px solid rgba(201,168,76,0.6)" }}>
          <Download size={20} className="flex-shrink-0 mt-0.5"
                    style={{ color: "#C9A84C" }} />
          <div>
            <p className="text-sm font-medium mb-1"
               style={{ color: "rgba(255,255,255,0.9)" }}>
              Haven't installed Nomii yet?
            </p>
            <p className="text-xs mb-2"
               style={{ color: "rgba(255,255,255,0.55)" }}>
              Run the one-line installer on your server to spin up Nomii.
              Takes about 2 minutes.
            </p>
            <a href={MARKETING_URL}
               className="text-sm font-medium inline-flex items-center gap-1
                          hover:opacity-80 transition-opacity"
               style={{ color: "#C9A84C" }}>
              View installation guide <ArrowRight size={14} />
            </a>
          </div>
        </div>

        <div className="flex gap-3 p-4 rounded-lg"
             style={{ background: "rgba(255,255,255,0.02)",
                      borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
          <Server size={20} className="flex-shrink-0 mt-0.5"
                  style={{ color: "rgba(255,255,255,0.6)" }} />
          <div>
            <p className="text-sm font-medium mb-1"
               style={{ color: "rgba(255,255,255,0.9)" }}>
              Already running Nomii?
            </p>
            <p className="text-xs mb-1"
               style={{ color: "rgba(255,255,255,0.55)" }}>
              Open <strong>your</strong> Nomii dashboard (on your own server) →
              Plans &amp; Billing → paste your license key → Activate.
            </p>
            <p className="text-xs"
               style={{ color: "rgba(255,255,255,0.40)" }}>
              Limits lift instantly. No restart, no SSH, no file editing.
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs"
         style={{ color: "rgba(255,255,255,0.45)" }}>
        Need help? Email{" "}
        <a href="mailto:support@pontensolutions.com"
           className="underline hover:opacity-80"
           style={{ color: "#C9A84C" }}>
          support@pontensolutions.com
        </a>
      </p>
    </div>

    <Link to="/nomii/login"
          className="mt-6 text-sm hover:opacity-80 transition-opacity"
          style={{ color: "rgba(255,255,255,0.45)" }}>
      Back to login
    </Link>
  </div>
);

export default NomiiLicenseSuccess;
