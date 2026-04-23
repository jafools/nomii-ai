/**
 * Post-purchase success page for self-hosted Shenmay AI license purchases.
 *
 * Reached via Stripe `success_url` after a payment on
 * pontensolutions.com/nomii/license. Self-contained — no auth, no API calls —
 * so anyone (a fresh buyer who hasn't installed yet, or an existing operator
 * topping up) lands here safely.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Copy, CheckCheck, Terminal, Server, ExternalLink } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import ShenmayWordmark from "@/components/shenmay/ShenmayWordmark";
import ShenmaySeal from "@/components/shenmay/ShenmaySeal";
import {
  TOKENS as T,
  Kicker,
  Display,
  Lede,
  Card,
  Divider,
  PageShell,
} from "@/components/shenmay/ui/ShenmayUI";

const INSTALL_CMD = `bash <(curl -fsSL https://raw.githubusercontent.com/jafools/shenmay-ai/main/scripts/install.sh)`;
const REPO_URL = "https://github.com/jafools/shenmay-ai";

const ShenmayLicenseSuccess = () => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageShell style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px" }}>
      <div style={{ marginBottom: 40, display: "flex", justifyContent: "center" }}>
        <ShenmayWordmark size={26} />
      </div>

      <div style={{ width: "100%", maxWidth: 640, position: "relative" }}>
        <Card featured style={{ padding: "44px 44px 36px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 24, right: 24, opacity: 0.6 }}>
            <ShenmaySeal size={72} paper="#FFFFFF" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle size={22} color={T.success} />
            </div>
            <Kicker color={T.success}>Purchase complete</Kicker>
          </div>

          <Display size={40} italic>Thank you.</Display>
          <Display size={40} italic={false} style={{ fontWeight: 500, marginTop: 2 }}>Your license is on its way.</Display>

          <Lede style={{ marginTop: 16, fontSize: 15 }}>
            We've emailed your license key — check your inbox (and spam) for a message from Shenmay AI. While you wait, here's how to get running.
          </Lede>

          <Divider style={{ margin: "32px 0" }} />

          {/* Case 1 — fresh buyer */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Terminal size={16} color={T.teal} />
              <Kicker>First time installing</Kicker>
            </div>
            <Lede style={{ fontSize: 14, marginTop: 6 }}>
              SSH to any Linux host with Docker and run:
            </Lede>

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: T.ink, border: `1px solid ${T.ink}`, borderRadius: 8 }}>
              <code style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: T.paper, whiteSpace: "nowrap", overflowX: "auto" }}>
                {INSTALL_CMD}
              </code>
              <button
                onClick={handleCopy}
                style={{ background: "none", border: `1px solid ${copied ? T.tealLight : "rgba(245,241,232,0.2)"}`, padding: "6px 8px", borderRadius: 4, color: copied ? T.tealLight : T.paper, cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                aria-label="Copy install command"
              >
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div style={{ fontSize: 12, color: T.mute, marginTop: 8, lineHeight: 1.55 }}>
              ~2 minutes. After install, open your new dashboard and paste the key into Plans &amp; Billing.
            </div>
          </div>

          <Divider style={{ margin: "24px 0" }} />

          {/* Case 2 — already installed */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Server size={16} color={T.mute} />
              <Kicker color={T.mute}>Already running Shenmay</Kicker>
            </div>
            <Lede style={{ fontSize: 14, marginTop: 6 }}>
              Open your Shenmay dashboard → <strong style={{ color: T.ink }}>Plans &amp; Billing</strong> → paste your license key → Activate. Limits lift instantly. No restart.
            </Lede>
          </div>

          <Divider label="Support" />

          <div style={{ fontSize: 13, color: T.mute, textAlign: "center", lineHeight: 1.7 }}>
            Docs:&nbsp;{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={{ color: T.teal, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, borderBottom: `1px solid ${T.teal}40` }}>
              GitHub <ExternalLink size={11} />
            </a>
            <br />
            Questions?&nbsp;{" "}
            <a href="mailto:support@pontensolutions.com" style={{ color: T.teal, textDecoration: "none", borderBottom: `1px solid ${T.teal}40` }}>
              support@pontensolutions.com
            </a>
          </div>
        </Card>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link to="/shenmay/login" style={{ fontSize: 13, color: T.mute, textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    </PageShell>
  );
};

export default ShenmayLicenseSuccess;
