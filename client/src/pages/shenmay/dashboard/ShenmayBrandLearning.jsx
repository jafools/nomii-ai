import { useState, useEffect, useCallback } from "react";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Brain,
  Sparkles,
  MessageCircleQuestion,
  Workflow,
  Mic,
  Users,
  Activity,
  Power,
  PlayCircle,
  AlertOctagon,
  ShieldCheck,
} from "lucide-react";
import {
  TOKENS as T,
  Kicker,
  Display,
  Lede,
  Button,
  Notice,
} from "@/components/shenmay/ui/ShenmayUI";
import {
  getBrandLearning,
  toggleBrandLearning,
  runBrandLearningNow,
  killBrandLearning,
} from "@/lib/shenmayApi";

// ── Local helpers ───────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const INCIDENT_LABELS = {
  pii_breach:           "PII detected — write blocked",
  distill_skip_no_key:  "Skipped — no LLM key configured",
  distill_failed:       "Distillation failed",
  promotion_blocked:    "Candidates held below threshold",
  kill_switch_used:     "Kill switch invoked",
  auto_disabled:        "Learning auto-disabled after repeated failures",
};

// ── UI atoms ────────────────────────────────────────────────────────────

const SectionCard = ({ kicker, title, children, style }) => (
  <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 28, ...style }}>
    <Kicker color={T.mute}>{kicker}</Kicker>
    <h3 style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 18, letterSpacing: "-0.015em", color: T.ink, margin: "10px 0 22px" }}>{title}</h3>
    {children}
  </div>
);

const StatTile = ({ icon: Icon, label, value, color = T.ink, sub }) => (
  <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 20, display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}1A`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={15} color={color} />
      </div>
      <Kicker color={T.mute} style={{ fontSize: 10 }}>{label}</Kicker>
    </div>
    <div style={{ fontSize: 28, fontWeight: 500, color: T.ink, letterSpacing: "-0.02em", fontFamily: T.sans }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: 12, color: T.mute }}>{sub}</div>
    )}
  </div>
);

// Progress bar for a candidate inching toward the promotion threshold.
const ProgressBar = ({ count, threshold }) => {
  const pct = Math.max(0, Math.min(100, (count / threshold) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 140 }}>
      <div style={{ flex: 1, height: 4, background: T.paperEdge, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.teal, transition: "width 280ms ease" }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, minWidth: 36, textAlign: "right" }}>
        {count}/{threshold}
      </span>
    </div>
  );
};

// ── Page ────────────────────────────────────────────────────────────────

export default function ShenmayBrandLearning() {
  const { shenmayUser } = useShenmayAuth();
  const isOwner = shenmayUser?.role === "owner";

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const next = await getBrandLearning();
      setData(next);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load brand-learning status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Light polling so a "Run now" reflects without manual refresh.
  useEffect(() => {
    const id = setInterval(fetchState, 30_000);
    return () => clearInterval(id);
  }, [fetchState]);

  const handleToggle = async () => {
    if (!isOwner || !data) return;
    const next = !data.enabled;
    setBusy(true);
    try {
      await toggleBrandLearning(next);
      toast({ title: next ? "Brand learning enabled" : "Brand learning disabled" });
      await fetchState();
    } catch (err) {
      toast({ title: "Could not change setting", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    if (!isOwner) return;
    setBusy(true);
    try {
      await runBrandLearningNow();
      toast({ title: "Learning cycle started", description: "Refreshing in a few seconds…" });
      setTimeout(fetchState, 4000);
    } catch (err) {
      toast({ title: "Could not run cycle", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!isOwner) return;
    if (!window.confirm("Wipe all learned brand knowledge and disable learning? This cannot be undone.")) return;
    setBusy(true);
    try {
      await killBrandLearning();
      toast({ title: "Brand knowledge wiped", description: "Learning disabled." });
      await fetchState();
    } catch (err) {
      toast({ title: "Kill switch failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: T.mute, fontFamily: T.sans }}>Loading brand-learning status…</div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <Notice variant="danger">{error}</Notice>
      </div>
    );
  }
  if (!data) return null;

  const min = data.min_sessions || 3;
  const soul     = data.brand_soul     || {};
  const memory   = data.brand_memory   || {};
  const audience = data.audience_profile || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, paddingBottom: 40, fontFamily: T.sans }}>
      {/* Hero — what is this, is it on, when did it last run */}
      <header style={{
        background: data.enabled ? "#FFFFFF" : T.paperDeep,
        border: `1px solid ${T.paperEdge}`,
        borderRadius: 12,
        padding: 28,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 24,
      }}>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", maxWidth: 640 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: data.enabled ? `${T.teal}1A` : T.paperEdge,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Brain size={22} color={data.enabled ? T.teal : T.mute} />
          </div>
          <div>
            <Kicker color={T.mute}>Figure 01 · Brand Learning</Kicker>
            <Display style={{ fontSize: 26, marginTop: 6, marginBottom: 8 }}>
              {data.enabled ? "Your brand AI is learning" : "Brand learning is paused"}
            </Display>
            <Lede style={{ marginTop: 0, fontSize: 14, lineHeight: 1.6 }}>
              {data.enabled
                ? "Each night, your AI agent distills aggregate, PII-scrubbed patterns from anonymous-visitor conversations into a brand knowledge base. No individual visitor data is ever stored — only generalized FAQs, processes, voice cues, and audience patterns."
                : "Turn on brand learning to let your agent build a knowledge base from anonymous-visitor conversations over time. PII is regex-scrubbed and frequency-gated before any pattern enters the brand's memory."}
            </Lede>
          </div>
        </div>

        {isOwner && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant={data.enabled ? "ghost" : "primary"}
              onClick={handleToggle}
              disabled={busy}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Power size={14} />
              {data.enabled ? "Pause learning" : "Enable learning"}
            </Button>
            {data.enabled && (
              <Button
                variant="ghost"
                onClick={handleRunNow}
                disabled={busy}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <PlayCircle size={14} />
                Run cycle now
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <StatTile
          icon={Sparkles}
          label="Sessions distilled"
          value={(data.sessions_processed || 0).toLocaleString()}
          color={T.teal}
          sub={`Last cycle: ${timeAgo(data.last_run_at)}`}
        />
        <StatTile
          icon={ShieldCheck}
          label="Learned facts"
          value={
            (soul.faqs?.length || 0) +
            (soul.processes?.length || 0) +
            (soul.voice_cues?.length || 0)
          }
          color={T.tealDark || T.teal}
          sub="Promoted into the brand's voice"
        />
        <StatTile
          icon={Activity}
          label="Pending candidates"
          value={
            (memory.candidate_faqs?.length || 0) +
            (memory.candidate_processes?.length || 0) +
            (memory.candidate_voice_cues?.length || 0)
          }
          color={T.warning || T.teal}
          sub={`Promote at ${min} distinct sessions`}
        />
      </div>

      {/* Promoted FAQs */}
      <SectionCard kicker="Figure 02 · What the brand has learned" title="Frequent questions">
        {Array.isArray(soul.faqs) && soul.faqs.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {soul.faqs.map((f, i) => (
              <li key={i} style={{ borderLeft: `2px solid ${T.teal}`, paddingLeft: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageCircleQuestion size={14} color={T.teal} />
                  <strong style={{ fontSize: 14, color: T.ink }}>{f.question}</strong>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.mute, letterSpacing: "0.1em" }}>
                    {f.session_count}× SESSIONS
                  </span>
                </div>
                {f.answer && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>{f.answer}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Lede style={{ fontSize: 13, color: T.mute, margin: 0 }}>
            No questions have crossed the {min}-session threshold yet. They'll appear here as patterns emerge.
          </Lede>
        )}
      </SectionCard>

      {/* Pending FAQs (the celebratory "we're learning" bit) */}
      {Array.isArray(memory.candidate_faqs) && memory.candidate_faqs.length > 0 && (
        <SectionCard kicker="Figure 03 · Watching" title="Questions trending toward promotion">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {memory.candidate_faqs.slice(0, 12).map((f, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "space-between", paddingBottom: 10, borderBottom: i === Math.min(11, memory.candidate_faqs.length - 1) ? "none" : `1px solid ${T.paperEdge}` }}>
                <span style={{ fontSize: 13, color: T.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.question}
                </span>
                <ProgressBar count={f.session_count || 0} threshold={min} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Promoted Processes */}
      <SectionCard kicker="Figure 04 · Common journeys" title="Processes the brand walks visitors through">
        {Array.isArray(soul.processes) && soul.processes.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {soul.processes.map((p, i) => (
              <li key={i} style={{ borderLeft: `2px solid ${T.tealDark || T.teal}`, paddingLeft: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Workflow size={14} color={T.tealDark || T.teal} />
                  <strong style={{ fontSize: 14, color: T.ink }}>{p.name}</strong>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.mute, letterSpacing: "0.1em" }}>
                    {p.session_count}× SESSIONS
                  </span>
                </div>
                {p.description && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>{p.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Lede style={{ fontSize: 13, color: T.mute, margin: 0 }}>
            No recurring processes detected yet. Once visitors keep asking how to do the same thing, it'll show here.
          </Lede>
        )}
      </SectionCard>

      {/* Voice cues + Audience profile in a 2-column row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <SectionCard kicker="Figure 05 · Brand voice" title="How visitors prefer to be talked to">
          {Array.isArray(soul.voice_cues) && soul.voice_cues.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {soul.voice_cues.map((v, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <Mic size={13} color={T.teal} style={{ marginTop: 4, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>{v.cue || v}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Lede style={{ fontSize: 13, color: T.mute, margin: 0 }}>
              Voice cues will surface as patterns emerge across many conversations.
            </Lede>
          )}
        </SectionCard>

        <SectionCard kicker="Figure 06 · Audience profile" title="Who's reaching out — in aggregate">
          <AudienceList label="Common pain points" items={audience.common_pain_points} />
          <AudienceList label="Common objections" items={audience.common_objections} />
          <AudienceList label="Common request types" items={audience.common_request_types} />
          {!hasAudience(audience) && (
            <Lede style={{ fontSize: 13, color: T.mute, margin: 0 }}>
              Audience patterns will appear once enough anonymous conversations have been distilled.
            </Lede>
          )}
        </SectionCard>
      </div>

      {/* Recent activity */}
      <SectionCard kicker="Figure 07 · Audit log" title="Recent activity">
        {Array.isArray(data.recent_incidents) && data.recent_incidents.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {data.recent_incidents.slice(0, 12).map((inc) => (
              <li key={inc.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                <AlertOctagon size={13} color={inc.type === "pii_breach" ? T.danger : T.mute} style={{ marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ color: T.ink }}>{INCIDENT_LABELS[inc.type] || inc.type}</span>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.mute, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                    {timeAgo(inc.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Lede style={{ fontSize: 13, color: T.mute, margin: 0 }}>No activity recorded yet.</Lede>
        )}
      </SectionCard>

      {/* Owner-only kill switch */}
      {isOwner && data.enabled && (
        <SectionCard kicker="Figure 08 · Danger zone" title="Wipe and disable">
          <Lede style={{ fontSize: 13, color: T.mute, margin: "0 0 18px" }}>
            Resets all learned facts and pending candidates and turns off learning. The watermark
            is reset, so when you turn learning back on it starts fresh from the next 30 days of
            anonymous conversations.
          </Lede>
          <Button
            variant="ghost"
            onClick={handleKillSwitch}
            disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.danger, borderColor: T.danger }}
          >
            <Power size={14} /> Wipe all brand knowledge & disable
          </Button>
        </SectionCard>
      )}
    </div>
  );
}

function AudienceList({ label, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <Kicker color={T.mute} style={{ fontSize: 10, marginBottom: 8 }}>
        <Users size={11} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />
        {label}
      </Kicker>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 8).map((p, i) => (
          <li key={i} style={{ fontSize: 13, color: T.inkSoft }}>· {p}</li>
        ))}
      </ul>
    </div>
  );
}

function hasAudience(a) {
  if (!a || typeof a !== "object") return false;
  return (
    (Array.isArray(a.common_pain_points)   && a.common_pain_points.length   > 0) ||
    (Array.isArray(a.common_objections)    && a.common_objections.length    > 0) ||
    (Array.isArray(a.common_request_types) && a.common_request_types.length > 0)
  );
}
