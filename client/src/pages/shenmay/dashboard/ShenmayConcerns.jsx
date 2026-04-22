import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getConcerns, resolveConcern } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, CheckCircle, MessageSquarePlus, CheckCheck } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Notice, Button } from "@/components/shenmay/ui/ShenmayUI";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + "…" : s || "";

const ShenmayConcerns = () => {
  const navigate = useNavigate();
  const [concerns, setConcerns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState({});

  const handleResolve = async (convId) => {
    setResolving(r => ({ ...r, [convId]: true }));
    try {
      await resolveConcern(convId);
      toast({ title: "Concern resolved" });
      setConcerns(cs => cs.filter(c => (c.conversation_id || c.id) !== convId));
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResolving(r => ({ ...r, [convId]: false }));
    }
  };

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    getConcerns()
      .then((data) => setConcerns(data?.concerns || data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const unreadCount = concerns.filter((c) => c.unread).length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <Kicker>Human-in-the-loop</Kicker>
        <Display size={38} italic style={{ marginTop: 12 }}>
          {loading ? "Loading concerns…" : error ? "Something went wrong." : concerns.length === 0 ? "All clear." : `${concerns.length} open concern${concerns.length === 1 ? "" : "s"}.`}
        </Display>
        <Lede>
          Conversations your agent escalated and are waiting for you. Jump in, reply, or resolve.
        </Lede>
      </div>

      {error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "72px 0", textAlign: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#F3E8E4", border: `1px solid ${T.danger}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={24} color={T.danger} />
          </div>
          <Lede style={{ marginTop: 0 }}>{error}</Lede>
          <Button variant="primary" onClick={fetchData}><RefreshCw size={14} /> Retry</Button>
        </div>
      ) : loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ height: 56, borderRadius: 10, background: T.paperDeep, animation: "pulse 1.8s ease-in-out infinite" }} />
          <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden", animation: "pulse 1.8s ease-in-out infinite" }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "14px 24px", borderBottom: i < 4 ? `1px solid ${T.paperEdge}` : "none" }}>
                {[...Array(3)].map((_, j) => <div key={j} style={{ height: 14, flex: 1, borderRadius: 3, background: T.paperEdge }} />)}
              </div>
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
        </div>
      ) : concerns.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "72px 0", textAlign: "center" }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", background: "#EBF1E9", border: `1px solid #CDDCCA`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CheckCircle size={28} color={T.success} />
          </div>
          <Kicker color={T.success}>No open concerns</Kicker>
          <Lede style={{ marginTop: 0, maxWidth: 400 }}>
            Everything looks good — your agent is handling things well.
          </Lede>
        </div>
      ) : (
        <>
          {/* Alert summary */}
          <div style={{ marginBottom: 20 }}>
            <Notice tone="danger" icon={AlertTriangle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
                <div>
                  <strong style={{ color: T.danger }}>
                    {concerns.length} open concern{concerns.length !== 1 ? "s" : ""}
                  </strong>
                  {unreadCount > 0 && (
                    <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 3, background: `${T.danger}22`, color: T.danger, marginLeft: 10 }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <button onClick={fetchData} style={{ background: "none", border: "none", padding: 4, color: T.mute, cursor: "pointer" }} title="Refresh">
                  <RefreshCw size={13} />
                </button>
              </div>
            </Notice>
          </div>

          {/* Table */}
          <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 3fr 1fr auto", gap: 16, padding: "12px 24px", fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mute, borderBottom: `1px solid ${T.paperEdge}` }}>
              <span>Customer</span>
              <span>Last message</span>
              <span>Escalated</span>
              <span style={{ width: 200, textAlign: "right" }}>Action</span>
            </div>
            {concerns.map((c, i) => {
              const customerName = c.customer_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown";
              const isUnread = c.unread;
              const convId = c.conversation_id || c.id;
              return (
                <div
                  key={c.id || convId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 3fr 1fr auto",
                    gap: 16,
                    alignItems: "center",
                    padding: "14px 24px",
                    borderBottom: i < concerns.length - 1 ? `1px solid ${T.paperEdge}` : "none",
                    background: isUnread ? `${T.danger}06` : "transparent",
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = isUnread ? `${T.danger}0A` : T.paper)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isUnread ? `${T.danger}06` : "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {isUnread && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.danger, flexShrink: 0 }} title="New message" />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isUnread ? T.ink : T.inkSoft, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {customerName}
                      </div>
                      {c.email && (
                        <div style={{ fontSize: 11, color: T.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {truncate(c.last_message || c.message, 90)}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.06em", color: T.mute }}>
                    {fmtDate(c.escalated_at || c.created_at)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <Button variant={isUnread ? "primary" : "ghost"} size="sm" onClick={() => navigate(`/shenmay/dashboard/conversations/${convId}`)}>
                      <MessageSquarePlus size={12} />
                      {isUnread ? "Jump in" : "View"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={resolving[convId]} onClick={() => handleResolve(convId)}>
                      <CheckCheck size={12} />
                      {resolving[convId] ? "…" : "Resolve"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ShenmayConcerns;
