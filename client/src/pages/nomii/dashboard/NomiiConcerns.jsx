import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getConcerns, resolveConcern } from "@/lib/nomiiApi";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, CheckCircle, ExternalLink, MessageSquarePlus, CheckCheck } from "lucide-react";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + "…" : s || "";

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" };

const NomiiConcerns = () => {
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertTriangle size={24} style={{ color: "#F87171" }} />
        </div>
        <p className="text-sm text-white/30">{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
        <div className="rounded-2xl overflow-hidden animate-pulse" style={card}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 px-6 py-3.5" style={i < 4 ? { borderBottom: "1px solid rgba(255,255,255,0.03)" } : {}}>
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-4 rounded-lg flex-1" style={{ background: "rgba(255,255,255,0.03)" }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (concerns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)" }}>
          <CheckCircle size={28} style={{ color: "#4ADE80" }} />
        </div>
        <p className="text-lg font-semibold text-white/80">No open concerns</p>
        <p className="text-sm text-white/25">Everything looks good — your agent is handling things well.</p>
      </div>
    );
  }

  const unreadCount = concerns.filter((c) => c.unread).length;

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} style={{ color: "#F87171" }} />
          <span className="text-sm font-semibold" style={{ color: "#F87171" }}>
            {concerns.length} open concern{concerns.length !== 1 ? "s" : ""} need{concerns.length === 1 ? "s" : ""} attention
          </span>
          {unreadCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.3)", color: "#F87171" }}>
              {unreadCount} new
            </span>
          )}
        </div>
        <button
          onClick={fetchData}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.3)" }}
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="grid grid-cols-[1.5fr_3fr_1fr_auto] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/20" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span>Customer</span>
          <span>Last Message</span>
          <span>Escalated</span>
          <span className="w-24 text-right">Action</span>
        </div>
        {concerns.map((c, i) => {
          const customerName = c.customer_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown";
          const isUnread = c.unread;
          const convId = c.conversation_id || c.id;
          return (
            <div
              key={c.id || convId}
              className="grid grid-cols-[1.5fr_3fr_1fr_auto] gap-4 items-center px-6 py-3.5 transition-all duration-150 hover:bg-white/[0.02]"
              style={{
                ...(i < concerns.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.03)" } : {}),
                ...(isUnread ? { background: "rgba(239,68,68,0.03)" } : {}),
              }}
            >
              {/* Customer */}
              <div className="min-w-0 flex items-center gap-2">
                {isUnread && (
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#EF4444" }} title="New message" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: isUnread ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.7)" }}>
                    {customerName}
                  </p>
                  {c.email && <p className="text-[11px] text-white/20 truncate">{c.email}</p>}
                </div>
              </div>

              {/* Last message */}
              <p className="text-[13px] truncate" style={{ color: isUnread ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.25)" }}>
                {truncate(c.last_message || c.message, 90)}
              </p>

              {/* Date */}
              <span className="text-[13px] text-white/20">{fmtDate(c.escalated_at || c.created_at)}</span>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/nomii/dashboard/conversations/${convId}`)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
                  style={{ background: isUnread ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)", color: isUnread ? "#F87171" : "rgba(255,255,255,0.5)", border: isUnread ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.08)" }}
                  title="Open conversation"
                >
                  <MessageSquarePlus size={12} />
                  {isUnread ? "Jump In" : "View"}
                </button>
                <button
                  onClick={() => handleResolve(convId)}
                  disabled={resolving[convId]}
                  className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: "rgba(34,197,94,0.1)", color: "#4ADE80", border: "1px solid rgba(34,197,94,0.2)" }}
                  title="Mark as resolved"
                >
                  <CheckCheck size={12} />
                  {resolving[convId] ? "…" : "Resolve"}
                </button>
                {c.customer_id && (
                  <Link
                    to={`/nomii/dashboard/customers/${c.customer_id}`}
                    onClick={(e) => e.stopPropagation()}
                    title="View customer profile"
                    className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NomiiConcerns;
