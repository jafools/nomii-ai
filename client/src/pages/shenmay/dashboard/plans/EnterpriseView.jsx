import { Crown } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";

export default function EnterpriseView({ isMaster }) {
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
