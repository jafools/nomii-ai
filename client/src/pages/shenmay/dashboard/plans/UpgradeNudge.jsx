import { ArrowRight, ChevronDown } from "lucide-react";
import { PLAN_LABELS } from "@/lib/constants";
import { TOKENS as T, Kicker, Button } from "@/components/shenmay/ui/ShenmayUI";
import PlanChip from "./PlanChip";

export default function UpgradeNudge({ current, next, delta }) {
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
