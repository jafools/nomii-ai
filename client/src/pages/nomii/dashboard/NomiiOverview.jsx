import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard, getVisitors, getSubscription } from "@/lib/nomiiApi";
import { relativeTime, relativeDay } from "@/lib/format";
import { useNomiiAuth } from "@/contexts/NomiiAuthContext";
import NomiiAnalyticsCharts from "./NomiiAnalyticsCharts";
import { MessageSquare, Users, AlertTriangle, RefreshCw, TrendingUp, ArrowUpRight, Mail, UserX, ChevronDown, ChevronUp, UserMinus } from "lucide-react";

const cardStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  backdropFilter: "blur(12px)",
};

const SkeletonCard = () => (
  <div className="rounded-2xl p-5 animate-pulse" style={cardStyle}>
    <div className="h-4 w-20 rounded-lg mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
    <div className="h-8 w-14 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
  </div>
);

const SkeletonTable = () => (
  <div className="rounded-2xl p-5 animate-pulse space-y-3" style={cardStyle}>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-32 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="h-4 flex-1 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }} />
        <div className="h-4 w-16 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
    ))}
  </div>
);

const NomiiOverview = () => {
  const { nomiiTenant, nomiiUser } = useNomiiAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subUsage, setSubUsage] = useState(null);
  const intervalRef = useRef(null);

  // Anonymous visitors
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

  // Fetch visitors when section is opened
  useEffect(() => {
    if (!visitorsOpen) return;
    setVisitorsLoading(true);
    getVisitors()
      .then((res) => setVisitors(res.visitors || res || []))
      .catch(() => {})
      .finally(() => setVisitorsLoading(false));
  }, [visitorsOpen]);

  const s = data?.stats || {};

  const stats = [
    {
      label: "Total Conversations",
      value: s.total_conversations ?? 0,
      icon: MessageSquare,
      gradient: "linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)",
      iconColor: "#60A5FA",
      borderColor: "rgba(59,130,246,0.15)",
      link: "/nomii/dashboard/conversations",
    },
    {
      label: "Customers (30 days)",
      value: s.active_customers_30d ?? 0,
      icon: TrendingUp,
      gradient: "linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%)",
      iconColor: "#4ADE80",
      borderColor: "rgba(34,197,94,0.15)",
      link: "/nomii/dashboard/customers",
    },
    {
      label: "Total Customers",
      value: s.total_customers ?? 0,
      icon: Users,
      gradient: "linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%)",
      iconColor: "#C9A84C",
      borderColor: "rgba(201,168,76,0.15)",
      link: "/nomii/dashboard/customers",
    },
    {
      label: "Anonymous Visitors",
      value: s.anonymous_visitors ?? 0,
      icon: UserX,
      gradient: "linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0.05) 100%)",
      iconColor: "#C084FC",
      borderColor: "rgba(168,85,247,0.15)",
      link: null,
    },
    {
      label: "Total Messages",
      value: s.total_messages ?? 0,
      icon: Mail,
      gradient: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)",
      iconColor: "#A78BFA",
      borderColor: "rgba(139,92,246,0.15)",
      link: "/nomii/dashboard/conversations",
    },
    {
      label: "Open Concerns",
      value: s.open_concerns ?? 0,
      icon: AlertTriangle,
      gradient: (s.open_concerns ?? 0) > 0
        ? "linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)"
        : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
      iconColor: (s.open_concerns ?? 0) > 0 ? "#F87171" : "rgba(255,255,255,0.3)",
      borderColor: (s.open_concerns ?? 0) > 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
      link: "/nomii/dashboard/concerns",
    },
  ];

  const conversations = (data?.recent_conversations ?? []).slice(0, 10);

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertTriangle className="h-6 w-6" style={{ color: "#F87171" }} />
        </div>
        <p className="text-white/80 font-medium mb-1">Something went wrong</p>
        <p className="text-sm text-white/30 mb-5 max-w-sm">{error}</p>
        <button
          onClick={() => fetchData()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.92)" }}>
          Welcome back{nomiiUser?.first_name ? (
            <span style={{ color: "#C9A84C" }}>{`, ${nomiiUser.first_name}`}</span>
          ) : ""}
        </h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.30)" }}>Here's what's happening with your AI agent.</p>
      </div>

      {/* Widget warning */}
      {nomiiTenant && !nomiiTenant.widget_verified && (
        <div className="rounded-2xl px-5 py-4 mb-6 flex items-center justify-between" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.15)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)" }}>
              <AlertTriangle size={16} style={{ color: "#C9A84C" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "#C9A84C" }}>
              Your widget hasn't been detected yet
            </p>
          </div>
          <Link
            to="/nomii/onboarding"
            className="text-sm font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{ color: "#C9A84C" }}
          >
            Complete setup <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {/* Blocked customer notification */}
      {subUsage?.customer_limit_reached && (
        <div className="rounded-2xl px-5 py-4 mb-6 flex items-center justify-between" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)" }}>
              <UserMinus size={16} style={{ color: "#F87171" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "#F87171" }}>
              New visitors couldn't connect — your customer limit ({subUsage.customers_limit}) has been reached.
            </p>
          </div>
          <Link to="/nomii/dashboard/plans" className="text-sm font-semibold flex items-center gap-1 whitespace-nowrap hover:opacity-80 transition-opacity ml-4 shrink-0" style={{ color: "#F87171" }}>
            Upgrade plan <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((st) => {
          const Icon = st.icon;
          const CardEl = st.link ? Link : "div";
          return (
            <CardEl
              key={st.label}
              to={st.link || undefined}
              className={`rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg${st.link ? " cursor-pointer" : ""}`}
              style={{ background: st.gradient, border: `1px solid ${st.borderColor}`, boxShadow: "0 2px 12px rgba(0,0,0,0.20)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.30)" }}>{st.label}</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${st.iconColor}18` }}>
                  <Icon className="h-4 w-4" style={{ color: st.iconColor }} />
                </div>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.92)" }}>{st.value}</p>
                {st.link && <ArrowUpRight className="h-3.5 w-3.5 mb-1" style={{ color: "rgba(255,255,255,0.15)" }} />}
              </div>
            </CardEl>
          );
        })}
      </div>

      {/* Analytics charts */}
      <NomiiAnalyticsCharts />

      {/* Recent Conversations */}
      <div className="rounded-2xl overflow-hidden mt-8 mb-6" style={cardStyle}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <h2 className="text-sm font-semibold text-white/70">Recent Conversations</h2>
          {conversations.length > 0 && (
            <Link
              to="/nomii/dashboard/conversations"
              className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: "#C9A84C" }}
            >
              View all <ArrowUpRight size={12} />
            </Link>
          )}
        </div>

        {conversations.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
            <p className="text-sm text-white/25">No conversations yet</p>
            <p className="text-xs text-white/15 mt-1">They'll appear here once customers start chatting</p>
          </div>
        ) : (
          <div>
            {conversations.map((c, i) => {
              const id = c._id || c.id;
              const name = c.is_anonymous ? "Anonymous Visitor" : (c.customer_display_name || c.email || "Unknown");
              const msg = c.last_message || "";
              const time = c.last_message_at || "";
              const statusColor = c.status === "active" ? "#4ADE80" : c.status === "closed" ? "rgba(255,255,255,0.2)" : "#C9A84C";
              return (
                <div
                  key={id}
                  onClick={() => navigate(`/nomii/dashboard/conversations/${id}`)}
                  className="flex items-center gap-4 px-6 py-3.5 cursor-pointer transition-all duration-150 hover:bg-white/[0.02]"
                  style={i < conversations.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.03)" } : {}}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={
                      c.is_anonymous
                        ? { background: "rgba(168,85,247,0.12)", color: "#C084FC" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }
                    }
                  >
                    {c.is_anonymous ? <UserX className="h-3.5 w-3.5" /> : (name[0]?.toUpperCase() || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-white/70">{name}</p>
                      {c.is_anonymous && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(168,85,247,0.12)", color: "#C084FC" }}>
                          anonymous
                        </span>
                      )}
                      {c.status && !c.is_anonymous && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                          {c.status}
                        </span>
                      )}
                      {c.message_count != null && (
                        <span className="text-[10px] text-white/20">{c.message_count} msgs</span>
                      )}
                    </div>
                    <p className="text-xs text-white/25 truncate">{msg.length > 60 ? msg.slice(0, 60) + "…" : msg}</p>
                  </div>
                  <span className="text-[11px] text-white/20 whitespace-nowrap shrink-0">{relativeTime(time)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Anonymous Visitors — collapsible */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <button
          onClick={() => setVisitorsOpen((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between text-left transition-colors hover:bg-white/[0.01]"
        >
          <div className="flex items-center gap-3">
            <UserX className="h-4 w-4" style={{ color: "#C084FC" }} />
            <span className="text-sm font-semibold text-white/70">Anonymous Sessions</span>
            {(s.anonymous_visitors ?? 0) > 0 && (
              <span
                className="text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5"
                style={{ background: "rgba(168,85,247,0.15)", color: "#C084FC" }}
              >
                {s.anonymous_visitors}
              </span>
            )}
          </div>
          {visitorsOpen ? (
            <ChevronUp className="h-4 w-4" style={{ color: "rgba(255,255,255,0.2)" }} />
          ) : (
            <ChevronDown className="h-4 w-4" style={{ color: "rgba(255,255,255,0.2)" }} />
          )}
        </button>

        {visitorsOpen && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            {visitorsLoading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="h-4 w-28 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
                    <div className="h-4 flex-1 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
                    <div className="h-4 w-16 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
                  </div>
                ))}
              </div>
            ) : visitors.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-xs text-white/20">No anonymous sessions recorded</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-6 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/15">
                  <span>Visitor</span>
                  <span>Session</span>
                  <span className="text-right">Messages</span>
                </div>
                {visitors.map((v, i) => (
                  <div
                    key={v._id || v.id || i}
                    className="grid grid-cols-[2fr_1fr_1fr] gap-4 items-center px-6 py-3 transition-colors hover:bg-white/[0.01]"
                    style={i < visitors.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.02)" } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(168,85,247,0.1)" }}>
                        <UserX className="h-3 w-3" style={{ color: "#C084FC" }} />
                      </div>
                      <span className="text-[13px] text-white/50">Anonymous Visitor</span>
                    </div>
                    <span className="text-[12px] text-white/25">{relativeDay(v.last_interaction_at)}</span>
                    <span className="text-[12px] text-white/30 text-right tabular-nums">{v.message_count ?? 0}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NomiiOverview;
