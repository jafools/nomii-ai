import { TOKENS as T, Kicker } from "@/components/shenmay/ui/ShenmayUI";

export default function UsageMeter({ icon: Icon, label, used, limit, pct, nearLimit, limitReached }) {
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
