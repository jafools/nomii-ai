import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getConversations, getConversation, getLabels, bulkConversations, takeoverConversation } from "@/lib/shenmayApi";
import { relTime, fmtTime } from "@/lib/format";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  MessageSquare, AlertTriangle, RefreshCw, ExternalLink, ArrowUpRight,
  Users, Search, X, Circle, ThumbsUp, ThumbsDown, Square, CheckSquare,
  CheckCheck, Tag, ChevronDown, UserCheck,
} from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const statusStyle = {
  active:    { bg: "rgba(34,197,94,0.12)",   color: "#4ADE80",              label: "Active"    },
  ended:     { bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", label: "Ended"   },
  escalated: { bg: "rgba(239,68,68,0.12)",   color: "#F87171",              label: "Escalated" },
};

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ── Filter pill ──────────────────────────────────────────────────────────── */
function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-150 shrink-0"
      style={{
        background: active ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.05)",
        color:      active ? "#C9A84C"               : "rgba(255,255,255,0.35)",
        border:     active ? "1px solid rgba(201,168,76,0.35)" : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

/* ── Left panel: search bar + filters + list ─────────────────────────────── */
const ConversationList = ({
  conversations, selectedId, onSelect, loading, total,
  search, onSearchChange,
  statusFilter, onStatusFilter,
  modeFilter, onModeFilter,
  unreadOnly, onUnreadToggle,
  selectedIds, onToggleSelect, anySelected,
}) => {
  const inputRef = useRef(null);

  const statusPills = [
    { value: "",          label: "All" },
    { value: "active",    label: "Active" },
    { value: "escalated", label: "Escalated" },
    { value: "ended",     label: "Ended" },
  ];
  const modePills = [
    { value: "",      label: "All modes" },
    { value: "ai",    label: "AI" },
    { value: "human", label: "Human" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.25)" }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-8 pr-7 py-2 rounded-lg text-[12px] outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.80)",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(201,168,76,0.4)"}
            onBlur={e  => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
          />
          {search && (
            <button onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X size={12} style={{ color: "rgba(255,255,255,0.30)" }} />
            </button>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
        {statusPills.map(p => (
          <Pill key={p.value} active={statusFilter === p.value}
            onClick={() => onStatusFilter(p.value)}>
            {p.label}
          </Pill>
        ))}
      </div>

      {/* Mode + Unread row */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto shrink-0" style={{ scrollbarWidth: "none" }}>
        {modePills.map(p => (
          <Pill key={p.value} active={modeFilter === p.value}
            onClick={() => onModeFilter(p.value)}>
            {p.label}
          </Pill>
        ))}
        <div className="w-px h-3 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
        <Pill active={unreadOnly} onClick={onUnreadToggle}>
          <span className="flex items-center gap-1">
            <Circle size={5} fill={unreadOnly ? "#EAB308" : "rgba(255,255,255,0.3)"}
              stroke="none" className="shrink-0" />
            Unread
          </span>
        </Pill>
      </div>

      {/* Divider + result count */}
      <div className="shrink-0 flex items-center justify-between px-4 pb-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.20)" }}>
          {loading ? "Loading…" : `${conversations.length} of ${total}`}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-4 space-y-3 animate-pulse flex-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div className="h-9 w-9 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-2.5 w-36 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center p-6">
          <MessageSquare className="h-7 w-7 mb-2" style={{ color: "rgba(255,255,255,0.07)" }} />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.20)" }}>
            {search || statusFilter || modeFilter || unreadOnly
              ? "No conversations match your filters"
              : "No conversations yet"}
          </p>
          {(search || statusFilter || modeFilter || unreadOnly) && (
            <button
              onClick={() => { onSearchChange(""); onStatusFilter(""); onModeFilter(""); onUnreadToggle(false); }}
              className="mt-3 text-[11px] font-medium"
              style={{ color: "rgba(201,168,76,0.65)" }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          {conversations.map((c) => {
            const id         = c._id || c.id;
            const isSelected = id === selectedId;
            const fullName   = [c.first_name, c.last_name].filter(Boolean).join(" ");
            const name       = c.is_anonymous
              ? "Anonymous Visitor"
              : (fullName || c.customer_display_name || c.email || "Unknown");
            const lastMsg    = c.last_message || "";
            const truncMsg   = lastMsg.length > 52 ? lastMsg.slice(0, 52) + "…" : lastMsg;

            const isUnread    = !isSelected && c.unread;
            const isHuman     = c.mode === "human";
            const isEscalated = c.status === "escalated";

            const isChecked  = selectedIds?.has(id);
            const labels     = c.labels || [];
            const csatScore  = c.csat_score;

            return (
              <div
                key={id}
                className="flex items-start gap-0 transition-all duration-150"
                style={{
                  background: isSelected
                    ? "rgba(201,168,76,0.10)"
                    : isUnread
                    ? "rgba(255,255,255,0.025)"
                    : "transparent",
                  borderLeft: isSelected
                    ? "2px solid #C9A84C"
                    : isUnread
                    ? "2px solid rgba(234,179,8,0.6)"
                    : "2px solid transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                {/* Checkbox — visible on hover or when any items selected */}
                <div
                  className={`flex items-center justify-center self-stretch px-2 shrink-0 cursor-pointer transition-opacity ${anySelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  style={{ minWidth: 32 }}
                  onClick={e => { e.stopPropagation(); onToggleSelect?.(id); }}
                >
                  {isChecked
                    ? <CheckSquare size={14} style={{ color: "#C9A84C" }} />
                    : <Square size={14} style={{ color: "rgba(255,255,255,0.20)" }} />}
                </div>

                <button
                  onClick={() => onSelect(id)}
                  className="flex-1 flex items-center gap-3 pr-4 py-3.5 text-left min-w-0"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold"
                      style={{
                        background: isSelected   ? "rgba(201,168,76,0.20)"
                                  : isEscalated  ? "rgba(239,68,68,0.12)"
                                  : "rgba(255,255,255,0.06)",
                        color: isSelected   ? "#C9A84C"
                             : isEscalated  ? "#F87171"
                             : "rgba(255,255,255,0.4)",
                      }}>
                      {name[0]?.toUpperCase() || "?"}
                    </div>
                    {isUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                        style={{ background: "#EAB308", borderColor: "#0B1222" }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] truncate"
                        style={{
                          color: isSelected ? "#C9A84C" : isUnread ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.70)",
                          fontWeight: isUnread ? 700 : 600,
                        }}>
                        {name}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {csatScore === 2 && <ThumbsUp size={10} style={{ color: "#4ADE80" }} />}
                        {csatScore === 1 && <ThumbsDown size={10} style={{ color: "#F87171" }} />}
                        <span className="text-[10px]"
                          style={{ color: isUnread ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.20)" }}>
                          {relTime(c.last_message_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isEscalated && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(239,68,68,0.15)", color: "#F87171" }}>
                          ESCALATED
                        </span>
                      )}
                      {isHuman && !isEscalated && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                          style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
                          <Users size={8} /> HUMAN
                        </span>
                      )}
                      <p className="text-[12px] truncate flex-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {truncMsg || "No messages yet"}
                      </p>
                    </div>

                    {/* Label chips */}
                    {labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {labels.slice(0, 3).map(l => (
                          <span key={l.id}
                            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold"
                            style={{ background: l.color + "22", color: l.color }}>
                            {l.name}
                          </span>
                        ))}
                        {labels.length > 3 && (
                          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.20)" }}>
                            +{labels.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Right panel: thread view ────────────────────────────────────────────── */
const ThreadView = ({ conversationId, shenmayTenant }) => {
  const [convo, setConvo]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [takingOver, setTakingOver] = useState(false);
  const scrollRef               = useRef(null);

  const fetchThread = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true); setError("");
    try {
      const res = await getConversation(conversationId);
      setConvo({ ...(res.conversation || res), messages: res.messages || [] });
    } catch (err) {
      setError(err.message || "Failed to load conversation.");
    } finally { setLoading(false); }
  }, [conversationId]);

  const handleTakeover = async () => {
    setTakingOver(true);
    try {
      await takeoverConversation(conversationId);
      await fetchThread();
    } catch (err) {
      console.error("Takeover failed:", err);
    } finally {
      setTakingOver(false);
    }
  };

  useEffect(() => { fetchThread(); }, [fetchThread]);
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo?.messages]);

  if (!conversationId) return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <MessageSquare className="h-7 w-7" style={{ color: "rgba(255,255,255,0.08)" }} />
      </div>
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.20)" }}>No conversation selected</p>
      <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.10)" }}>Pick one from the list</p>
    </div>
  );

  if (loading) return (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center px-6 animate-pulse"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="h-4 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
      <div className="flex-1 p-6 space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
            <div className="h-14 w-56 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "rgba(239,68,68,0.1)" }}>
        <AlertTriangle className="h-6 w-6" style={{ color: "#F87171" }} />
      </div>
      <p className="text-sm text-white/30 mb-4">{error}</p>
      <button onClick={fetchThread}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
        style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
        <RefreshCw className="h-4 w-4" /> Retry
      </button>
    </div>
  );

  const fullName = [convo?.first_name, convo?.last_name].filter(Boolean).join(" ");
  const name     = convo?.is_anonymous ? "Anonymous Visitor" : (fullName || convo?.customer_display_name || convo?.email || "Unknown");
  const st       = (convo?.status || "active").toLowerCase();
  const badge    = statusStyle[st] || statusStyle.active;
  const messages = convo?.messages || [];
  const isActive = st === "active" || st === "escalated";
  const isHuman  = (convo?.mode || "ai") === "human";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
            style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
            {name[0]?.toUpperCase() || "?"}
          </div>
          <div>
            {convo?.customer_id && !convo?.is_anonymous ? (
              <Link to={`/nomii/dashboard/customers/${convo.customer_id}`}
                className="text-[14px] font-semibold text-white/80 hover:text-[#C9A84C] transition-colors flex items-center gap-1">
                {name}<ExternalLink className="h-3 w-3 opacity-40" />
              </Link>
            ) : (
              <p className="text-[14px] font-semibold text-white/80">{name}</p>
            )}
            {convo?.email && !convo?.is_anonymous && (
              <p className="text-[11px] text-white/25">{convo.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
          {isActive && !isHuman && (
            <button
              onClick={handleTakeover}
              disabled={takingOver}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}
            >
              <UserCheck className="h-3 w-3" />
              {takingOver ? "Taking over…" : "Take Over"}
            </button>
          )}
          {conversationId && (
            <Link to={`/nomii/dashboard/conversations/${conversationId}`}
              title="Open full conversation"
              className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: "rgba(255,255,255,0.20)" }}>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Escalated banner */}
      {st === "escalated" && (
        <div className="mx-6 mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-[13px] font-medium"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.12)", color: "#F87171" }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Escalated for human review
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.06)" }} />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>No messages in this conversation.</p>
          </div>
        ) : messages.map((msg, i) => {
          const role    = (msg.role || msg.sender || "").toLowerCase();
          const isAgent = role === "agent" || role === "assistant";
          const content = msg.content || msg.text || msg.message || "";
          const ts      = fmtTime(msg.createdAt || msg.created_at || msg.timestamp);

          return (
            <div key={msg._id || msg.id || i} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[70%]">
                <div className="rounded-2xl px-4 py-2.5"
                  style={isAgent ? {
                    background: "linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.10))",
                    border: "1px solid rgba(201,168,76,0.15)",
                    borderBottomRightRadius: "6px",
                  } : {
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderBottomLeftRadius: "6px",
                  }}>
                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {content}
                  </p>
                </div>
                <p className="text-[10px] mt-1 px-1" style={{ color: "rgba(255,255,255,0.12)" }}>
                  {isAgent ? (shenmayTenant?.agent_name || "Agent") : ""}
                  {isAgent && ts ? " · " : ""}{ts}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────────────────────── */
const ShenmayConversations = () => {
  const { shenmayTenant } = useShenmayAuth();

  const [conversations, setConversations] = useState([]);
  const [total, setTotal]                 = useState(0);
  const [selectedId, setSelectedId]       = useState(null);
  const [listLoading, setListLoading]     = useState(true);
  const [error, setError]                 = useState("");

  // Filter state
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("");
  const [modeFilter, setMode]         = useState("");
  const [unreadOnly, setUnreadOnly]   = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkLabelOpen, setBulkLabelOpen] = useState(false);
  const [allLabels, setAllLabels]     = useState([]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Load labels for bulk label picker
  useEffect(() => {
    getLabels().then(d => setAllLabels(d.labels || [])).catch(() => {});
  }, []);

  const debouncedSearch = useDebounce(search, 300);
  const intervalRef     = useRef(null);

  const handleBulkResolve = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkConversations([...selectedIds], "resolve");
      clearSelection();
      fetchList();
    } catch (err) { console.error("Bulk resolve failed:", err); }
    finally { setBulkLoading(false); }
  };

  const handleBulkLabel = async (labelId) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setBulkLabelOpen(false);
    try {
      await bulkConversations([...selectedIds], "label", { label_id: labelId });
      clearSelection();
      fetchList();
    } catch (err) { console.error("Bulk label failed:", err); }
    finally { setBulkLoading(false); }
  };

  const fetchList = useCallback(async (bg = false) => {
    if (!bg) setListLoading(true);
    try {
      const res = await getConversations(1, {
        status: statusFilter || undefined,
        mode:   modeFilter   || undefined,
        unread: unreadOnly   || undefined,
        search: debouncedSearch || undefined,
      }, 50);
      const list = res.conversations || [];
      setConversations(list);
      setTotal(res.total || list.length);
      if (!bg && list.length > 0 && !selectedId) {
        setSelectedId(list[0]._id || list[0].id);
      }
    } catch (err) {
      if (!bg) setError(err.message || "Failed to load conversations.");
    } finally {
      if (!bg) setListLoading(false);
    }
  }, [statusFilter, modeFilter, unreadOnly, debouncedSearch, selectedId]);

  // Reload when filters change
  useEffect(() => {
    fetchList();
  }, [statusFilter, modeFilter, unreadOnly, debouncedSearch]);

  // Background poll (30s) — only when no active filters that would make polling confusing
  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchList(true), 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchList]);

  if (error && conversations.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "rgba(239,68,68,0.1)" }}>
        <AlertTriangle className="h-6 w-6" style={{ color: "#F87171" }} />
      </div>
      <p className="text-sm text-white/30 mb-4">{error}</p>
      <button onClick={() => fetchList()}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
        style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
        <RefreshCw className="h-4 w-4" /> Retry
      </button>
    </div>
  );

  return (
    <div className="flex rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        height: "calc(100vh - 7.5rem)",
      }}>
      {/* Left panel */}
      <div className="w-[310px] shrink-0 flex flex-col"
        style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="h-12 flex items-center px-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {selectedIds.size > 0 ? (
            /* Bulk action toolbar */
            <div className="flex items-center gap-2 w-full relative">
              <span className="text-[11px] font-semibold shrink-0" style={{ color: "#C9A84C" }}>
                {selectedIds.size} selected
              </span>
              <button onClick={handleBulkResolve} disabled={bulkLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
                style={{ background: "rgba(34,197,94,0.12)", color: "#4ADE80" }}>
                <CheckCheck size={11} /> Resolve
              </button>
              {allLabels.length > 0 && (
                <div className="relative shrink-0">
                  <button onClick={() => setBulkLabelOpen(v => !v)} disabled={bulkLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
                    <Tag size={11} /> Label <ChevronDown size={9} />
                  </button>
                  {bulkLabelOpen && (
                    <div className="absolute left-0 top-8 z-20 rounded-xl shadow-2xl overflow-hidden min-w-[140px]"
                      style={{ background: "#141c2e", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {allLabels.map(l => (
                        <button key={l.id} onClick={() => handleBulkLabel(l.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-white/5 transition-colors">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
                          <span style={{ color: "rgba(255,255,255,0.65)" }}>{l.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={clearSelection}
                className="ml-auto p-1 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <h3 className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
              Conversations
            </h3>
          )}
        </div>

        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setBulkLabelOpen(false); }}
          loading={listLoading}
          total={total}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatus}
          modeFilter={modeFilter}
          onModeFilter={setMode}
          unreadOnly={unreadOnly}
          onUnreadToggle={() => setUnreadOnly(v => !v)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          anySelected={selectedIds.size > 0}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        <ThreadView
          key={selectedId}
          conversationId={selectedId}
          shenmayTenant={shenmayTenant}
        />
      </div>
    </div>
  );
};

export default ShenmayConversations;
