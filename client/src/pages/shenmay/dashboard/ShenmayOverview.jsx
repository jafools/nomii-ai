import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard, getVisitors, getSubscription } from "@/lib/shenmayApi";
import { relativeTime, relativeDay } from "@/lib/format";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import ShenmayAnalyticsCharts from "./ShenmayAnalyticsCharts";
import { MessageSquare, Users, AlertTriangle, RefreshCw, TrendingUp, ArrowUpRight, Mail, UserX, ChevronDown, ChevronUp, UserMinus } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Notice, Divider, Button } from "@/components/shenmay/ui/ShenmayUI";

const SkeletonCard = () => (
  <div style={{ background: T.paperDeep, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 20, height: 96, animation: "pulse 1.8s ease-in-out infinite" }}>
    <div style={{ height: 10, width: 80, borderRadius: 3, background: T.paperEdge, marginBottom: 14 }} />
    <div style={{ height: 28, width: 56, borderRadius: 3, background: T.paperEdge }} />
    <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
  </div>
);

const SkeletonRow = () => (
  <div style={{ background: T.paperDeep, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 20, animation: "pulse 1.8s ease-in-out infinite" }}>
    {[...Array(5)].map((_, i) => (
      <div key={i} style={{ display: "flex", gap: 16, marginBottom: i === 4 ? 0 : 10 }}>
        <div style={{ height: 14, width: 120, borderRadius: 3, background: T.paperEdge }} />
        <div style={{ height: 14, flex: 1, borderRadius: 3, background: T.paperEdge }} />
        <div style={{ height: 14, width: 56, borderRadius: 3, background: T.paperEdge }} />
      </div>
    ))}
  </div>
);

const SectionHeader = ({ kicker, title, action }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, padding: "20px 24px", borderBottom: `1px solid ${T.paperEdge}` }}>
    <div>
      <Kicker color={T.mute} style={{ display: "block", marginBottom: 4 }}>{kicker}</Kicker>
      <h3 style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 17, letterSpacing: "-0.015em", color: T.ink, margin: 0 }}>{title}</h3>
    </div>
    {action}
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden", ...style }}>{children}</div>
);

const ShenmayOverview = () => {
  const { shenmayTenant, shenmayUser } = useShenmayAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subUsage, setSubUsage] = useState(null);
  const intervalRef = useRef(null);

  const [visitors, setVisitors] = useState([]);
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [visitorsLoading, setVisitorsLoading] = useState(false);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError("");
    try {
      const [res, sub] = await Promise.all([getDashboard(), getSubscription().catch(() => null)]);
      setData(res);
      if (sub?.usage) setSubUsage(sub.usage);
    } catch (err) {
      if (!isBackground) setError(err.message || "Failed to load dashboard.");
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  useEffect(() => {
    if (!visitorsOpen) return;
    setVisitorsLoading(true);
    getVisitors().then((res) => setVisitors(res.visitors || res || [])).catch(() => {}).finally(() => setVisitorsLoading(false));
  }, [visitorsOpen]);

  const s = data?.stats || {};

  const stats = [
    { label: "Conversations",        value: s.total_conversations ?? 0,    icon: MessageSquare, link: "/dashboard/conversations" },
    { label: "Customers · 30 days",  value: s.active_customers_30d ?? 0,   icon: TrendingUp,    link: "/dashboard/customers" },
    { label: "Total customers",      value: s.total_customers ?? 0,        icon: Users,         link: "/dashboard/customers" },
    { label: "Anonymous visitors",   value: s.anonymous_visitors ?? 0,     icon: UserX,         link: null },
    { label: "Total messages",       value: s.total_messages ?? 0,         icon: Mail,          link: "/dashboard/conversations" },
    { label: "Open concerns",        value: s.open_concerns ?? 0,          icon: AlertTriangle, link: "/dashboard/concerns", emphasis: (s.open_concerns ?? 0) > 0 },
  ];

  const conversations = (data?.recent_conversations ?? []).slice(0, 10);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 40 }}>
          <Kicker>Today at a glance</Kicker>
          <Display size={40} italic style={{ marginTop: 10 }}>Loading your dashboard…</Display>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 32 }}>
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonRow />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "96px 0", textAlign: "center", gap: 16 }}>
        <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={26} color={T.danger} />
        </div>
        <Kicker color={T.danger}>Something went wrong</Kicker>
        <Display size={28} italic>We couldn't load your dashboard.</Display>
        <Lede style={{ marginTop: 0, maxWidth: 420 }}>{error}</Lede>
        <Button variant="primary" onClick={() => fetchData()}><RefreshCw size={14} /> Try again</Button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ───────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <Kicker>Today at a glance</Kicker>
        <Display size={40} italic style={{ marginTop: 12 }}>
          {shenmayUser?.first_name ? <>Welcome back, {shenmayUser.first_name}.</> : <>Welcome back.</>}
        </Display>
        <Lede>Here's what's happening with your agent.</Lede>
      </div>

      {/* ── Alerts ────────────────────────────────────────── */}
      {shenmayTenant && !shenmayTenant.widget_verified && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="teal" icon={AlertTriangle} style={{ paddingRight: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
              <div><strong style={{ color: T.ink }}>Your widget hasn't been detected yet.</strong>{" "}Finish onboarding to activate your agent.</div>
              <Link to="/onboarding" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 500, color: T.teal, textDecoration: "none", whiteSpace: "nowrap", borderBottom: `1px solid ${T.teal}40` }}>
                Complete setup <ArrowUpRight size={13} />
              </Link>
            </div>
          </Notice>
        </div>
      )}

      {subUsage?.customer_limit_reached && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="danger" icon={UserMinus} style={{ paddingRight: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
              <div>New visitors couldn't connect — your customer limit ({subUsage.customers_limit}) has been reached.</div>
              <Link to="/dashboard/plans" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 500, color: T.danger, textDecoration: "none", whiteSpace: "nowrap", borderBottom: `1px solid ${T.danger}40` }}>
                Upgrade plan <ArrowUpRight size={13} />
              </Link>
            </div>
          </Notice>
        </div>
      )}

      {/* ── Stats grid ────────────────────────────────────── */}
      <Kicker color={T.mute} style={{ display: "block", margin: "0 0 14px" }}>Figure 01 · Signals</Kicker>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 40 }}>
        {stats.map((st) => {
          const Icon = st.icon;
          const Wrap = st.link ? Link : "div";
          const wrapProps = st.link ? { to: st.link } : {};
          const emphasis = st.emphasis;
          return (
            <Wrap
              key={st.label}
              {...wrapProps}
              style={{
                background: "#FFFFFF",
                border: emphasis ? `1px solid ${T.danger}40` : `1px solid ${T.paperEdge}`,
                borderRadius: 10,
                padding: "18px 20px",
                cursor: st.link ? "pointer" : "default",
                textDecoration: "none",
                transition: "border-color 180ms, transform 180ms",
                display: "block",
              }}
              onMouseEnter={st.link ? (e) => { e.currentTarget.style.borderColor = T.ink; } : undefined}
              onMouseLeave={st.link ? (e) => { e.currentTarget.style.borderColor = emphasis ? `${T.danger}40` : T.paperEdge; } : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <Kicker color={emphasis ? T.danger : T.mute}>{st.label}</Kicker>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: emphasis ? `${T.danger}12` : `${T.teal}10`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={13} color={emphasis ? T.danger : T.teal} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <span style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 32, letterSpacing: "-0.025em", color: T.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {st.value.toLocaleString()}
                </span>
                {st.link && <ArrowUpRight size={14} color={T.mute} style={{ marginBottom: 2 }} />}
              </div>
            </Wrap>
          );
        })}
      </div>

      {/* ── Analytics (unchanged, own component) ──────────── */}
      <ShenmayAnalyticsCharts />

      {/* ── Recent conversations ──────────────────────────── */}
      <div style={{ marginTop: 40, marginBottom: 20 }}>
        <Card>
          <SectionHeader
            kicker="Figure 02 · Last seen"
            title="Recent conversations"
            action={conversations.length > 0 && (
              <Link to="/dashboard/conversations" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: T.teal, textDecoration: "none", fontFamily: T.mono, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: `1px solid ${T.teal}40`, paddingBottom: 1 }}>
                View all <ArrowUpRight size={12} />
              </Link>
            )}
          />

          {conversations.length === 0 ? (
            <div style={{ padding: "72px 24px", textAlign: "center" }}>
              <MessageSquare size={28} color={T.paperEdge} style={{ margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: 14, color: T.inkSoft, margin: 0 }}>No conversations yet.</p>
              <p style={{ fontSize: 12, color: T.mute, margin: "6px 0 0" }}>They'll appear here once customers start chatting.</p>
            </div>
          ) : (
            conversations.map((c, i) => {
              const id = c._id || c.id;
              const name = c.is_anonymous ? "Anonymous visitor" : (c.customer_display_name || c.email || "Unknown");
              const msg = c.last_message || "";
              const time = c.last_message_at || "";
              const statusColor = c.status === "active" ? T.success : c.status === "closed" ? T.mute : T.teal;
              return (
                <div
                  key={id}
                  onClick={() => navigate(`/dashboard/conversations/${id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 24px",
                    cursor: "pointer",
                    borderBottom: i < conversations.length - 1 ? `1px solid ${T.paperEdge}` : "none",
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.paper)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: c.is_anonymous ? `${T.tealLight}33` : T.paperDeep,
                    color: c.is_anonymous ? T.teal : T.ink,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 500,
                  }}>
                    {c.is_anonymous ? <UserX size={13} /> : (name[0]?.toUpperCase() || "?")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.ink, letterSpacing: "-0.005em" }}>{name}</span>
                      {c.is_anonymous && (
                        <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: `${T.tealLight}33`, color: T.teal }}>Anonymous</span>
                      )}
                      {c.status && !c.is_anonymous && (
                        <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: `${statusColor}15`, color: statusColor }}>{c.status}</span>
                      )}
                      {c.message_count != null && (
                        <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.08em", color: T.mute }}>{c.message_count} msgs</span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: T.mute, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {msg.length > 60 ? msg.slice(0, 60) + "…" : msg}
                    </p>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.08em", color: T.mute, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {relativeTime(time)}
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>

      {/* ── Anonymous sessions (collapsible) ──────────────── */}
      <Card>
        <button
          onClick={() => setVisitorsOpen((v) => !v)}
          style={{
            width: "100%", padding: "16px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left",
            background: "transparent", border: "none", cursor: "pointer", fontFamily: T.sans,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.paper)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserX size={14} color={T.teal} />
            <Kicker color={T.mute}>Anonymous sessions</Kicker>
            {(s.anonymous_visitors ?? 0) > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 3, background: `${T.teal}15`, color: T.teal, letterSpacing: "0.02em" }}>
                {s.anonymous_visitors}
              </span>
            )}
          </div>
          {visitorsOpen ? <ChevronUp size={15} color={T.mute} /> : <ChevronDown size={15} color={T.mute} />}
        </button>

        {visitorsOpen && (
          <div style={{ borderTop: `1px solid ${T.paperEdge}` }}>
            {visitorsLoading ? (
              <div style={{ padding: 24, animation: "pulse 1.8s ease-in-out infinite" }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                    <div style={{ height: 14, width: 112, borderRadius: 3, background: T.paperEdge }} />
                    <div style={{ height: 14, flex: 1, borderRadius: 3, background: T.paperEdge }} />
                    <div style={{ height: 14, width: 56, borderRadius: 3, background: T.paperEdge }} />
                  </div>
                ))}
              </div>
            ) : visitors.length === 0 ? (
              <div style={{ padding: "36px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: T.mute, margin: 0 }}>No anonymous sessions recorded.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16, padding: "12px 24px", fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mute, borderBottom: `1px solid ${T.paperEdge}` }}>
                  <span>Visitor</span>
                  <span>Session</span>
                  <span style={{ textAlign: "right" }}>Messages</span>
                </div>
                {visitors.map((v, i) => (
                  <div
                    key={v._id || v.id || i}
                    style={{
                      display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16, alignItems: "center",
                      padding: "10px 24px",
                      borderBottom: i < visitors.length - 1 ? `1px solid ${T.paperEdge}` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${T.tealLight}33`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <UserX size={11} color={T.teal} />
                      </div>
                      <span style={{ fontSize: 13, color: T.inkSoft }}>Anonymous visitor</span>
                    </div>
                    <span style={{ fontSize: 12, color: T.mute }}>{relativeDay(v.last_interaction_at)}</span>
                    <span style={{ fontSize: 12, color: T.inkSoft, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.message_count ?? 0}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ShenmayOverview;
