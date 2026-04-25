import { PLAN_LABELS } from "@/lib/constants";
import { TOKENS as T } from "@/components/shenmay/ui/ShenmayUI";

export default function PlanChip({ plan }) {
  const info = PLAN_LABELS[plan] || { label: plan, color: T.teal };
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 10, fontWeight: 500,
      letterSpacing: "0.16em", textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 3,
      background: `${info.color}18`, color: info.color,
    }}>
      {info.label}
    </span>
  );
}
