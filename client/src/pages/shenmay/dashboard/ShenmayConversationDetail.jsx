import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getConversation, takeoverConversation, handbackConversation, replyToConversation, downloadTranscript, getLabels, addConversationLabel, removeConversationLabel, scoreConversation } from "@/lib/shenmayApi";
import { fmtTime } from "@/lib/format";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { ArrowLeft, RefreshCw, AlertTriangle, MessageSquare, UserCheck, Bot, Send, Download, Tag, Plus, X, ThumbsUp, ThumbsDown, Star } from "lucide-react";

const statusStyle = {
  active:    { bg: "rgba(34,197,94,0.12)",    color: "#4ADE80",  label: "Active" },
  ended:     { bg: "rgba(255,255,255,0.05)",  color: "rgba(255,255,255,0.35)", label: "Ended" },
  escalated: { bg: "rgba(239,68,68,0.12)",    color: "#F87171",  label: "Escalated" },
};

const modeStyle = {
  ai:    { bg: "rgba(96,165,250,0.12)",   color: "#60A5FA",  icon: "🤖", label: "AI" },
  human: { bg: "rgba(16,185,129,0.12)",   color: "#10B981",  icon: "👤", label: "Human" },
};

const ShenmayConversationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { shenmayTenant } = useShenmayAuth();

  const [convo, setConvo]         = useState(null);
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [mode, setMode]           = useState("ai");        // 'ai' | 'human'
  const [takingOver, setTakingOver] = useState(false);
  const [handingBack, setHandingBack] = useState(false);
  const [handbackNote, setHandbackNote] = useState("");
  const [replyText, setReplyText]       = useState("");
  const [sending, setSending]           = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [score, setScore]               = useState(null);
  const [scoring, setScoring]           = useState(false);

  // Label state
  const [convLabels, setConvLabels]   = useState([]);   // labels on this conversation
  const [allLabels, setAllLabels]     = useState([]);   // all tenant labels
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const pollRef        = useRef(null);
  const lastMessageTs  = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Load conversation ──────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const res = await getConversation(id);
      const c   = res.conversation || res;
      const msgs = res.messages || [];
      setConvo(c);
      setMessages(msgs);
      setMode(c.mode || "ai");
      setConvLabels(c.labels || []);
      if (c.conversation_score) setScore(c.conversation_score);
      if (msgs.length > 0) {
        lastMessageTs.current = msgs[msgs.length - 1].created_at;
      }
    } catch (err) {
      if (!silent) setError(err.message || "Failed to load conversation.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  // Fetch all tenant labels once on mount
  useEffect(() => {
    getLabels().then(d => setAllLabels(d.labels || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Auto-poll when conversation is active or escalated ──────────────────────
  const isLive = convo?.status === "active" || convo?.status === "escalated";
  useEffect(() => {
    if (!isLive) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    // Poll faster (2s) during human mode for snappy advisor ↔ customer chat
    const interval = mode === "human" ? 2000 : 3000;
    pollRef.current = setInterval(() => {
      fetchData(true); // silent refresh — don't show loading spinner
    }, interval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLive, mode, fetchData]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Take Over ──────────────────────────────────────────────────────────────
  const handleTakeover = async () => {
    setTakingOver(true);
    try {
      await takeoverConversation(id);
      await fetchData(true);
    } catch (err) {
      console.error("Takeover failed:", err);
    } finally {
      setTakingOver(false);
    }
  };

  // ── Hand Back to AI ────────────────────────────────────────────────────────
  const handleHandback = async () => {
    setHandingBack(true);
    try {
      await handbackConversation(id, handbackNote.trim() || undefined);
      setHandbackNote("");
      await fetchData(true);
    } catch (err) {
      console.error("Handback failed:", err);
    } finally {
      setHandingBack(false);
    }
  };

  // ── Send reply as human agent ──────────────────────────────────────────────
  const handleReply = async () => {
    const text = replyText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await replyToConversation(id, text);
      setReplyText("");
      await fetchData(true);
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setSending(false);
    }
  };

  const handleDownloadTranscript = async () => {
    setDownloading(true);
    try {
      const displayName = convo?.first_name
        ? `${convo.first_name || ""} ${convo.last_name || ""}`.trim()
        : convo?.email || "Unknown";
      await downloadTranscript(id, displayName);
    } catch (err) {
      console.error("Transcript download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleScore = async (star) => {
    if (scoring) return;
    setScoring(true);
    try {
      await scoreConversation(id, star);
      setScore(star);
    } catch (err) {
      console.error("Score failed:", err);
    } finally {
      setScoring(false);
    }
  };

  const handleReplyKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  // ── Label handlers ─────────────────────────────────────────────────────────
  const handleToggleLabel = async (label) => {
    const alreadyOn = convLabels.some(l => l.id === label.id);
    setLabelLoading(true);
    try {
      if (alreadyOn) {
        const { labels } = await removeConversationLabel(id, label.id);
        setConvLabels(labels);
      } else {
        const { labels } = await addConversationLabel(id, label.id);
        setConvLabels(labels);
      }
    } catch (err) {
      console.error("Label toggle failed:", err);
    } finally {
      setLabelLoading(false);
    }
  };

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-4 w-32 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="space-y-3 mt-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-start" : "justify-end"}`}>
              <div className="h-14 w-64 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertTriangle className="h-6 w-6" style={{ color: "#F87171" }} />
        </div>
        <p className="text-sm text-white/30 mb-4">{error}</p>
        <button onClick={() => fetchData()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const name      = convo?.customer_display_name || convo?.first_name
    ? `${convo?.first_name || ""} ${convo?.last_name || ""}`.trim()
    : convo?.email || "Unknown";
  const email     = convo?.email || "";
  const showEmail = (convo?.first_name || convo?.customer_display_name) && email;
  const st        = (convo?.status || "active").toLowerCase();
  const badge     = statusStyle[st] || statusStyle.active;
  const modeBadge = modeStyle[mode] || modeStyle.ai;
  const isActive  = st === "active" || st === "escalated";
  const isHuman   = mode === "human";
  const agentName = shenmayTenant?.agent_name || "Agent";

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => navigate("/nomii/dashboard/conversations")}
          className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="h-5 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
            {(name[0] || "?").toUpperCase()}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white/80">{name}</p>
            {showEmail && <p className="text-[11px] text-white/25">{email}</p>}
          </div>
        </div>
        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: badge.bg, color: badge.color }}>
          {badge.label}
        </span>
        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: modeBadge.bg, color: modeBadge.color }}>
          {modeBadge.icon} {modeBadge.label} Mode
        </span>

        {/* ── Action buttons (right-aligned) ── */}
        <div className="ml-auto flex items-center gap-2">
          {isActive && !isHuman && (
            <button
              onClick={handleTakeover}
              disabled={takingOver}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}
            >
              <UserCheck className="h-4 w-4" />
              {takingOver ? "Taking over…" : "Take Over Session"}
            </button>
          )}
          {isActive && isHuman && (
            <button
              onClick={handleHandback}
              disabled={handingBack}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #60A5FA, #3B82F6)", color: "#fff" }}
            >
              <Bot className="h-4 w-4" />
              {handingBack ? "Handing back…" : "Hand Back to AI"}
            </button>
          )}
          <button
            onClick={handleDownloadTranscript}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            title="Download transcript"
            style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "Downloading…" : "Transcript"}
          </button>
          <button
            onClick={() => fetchData(false)}
            className="p-2 rounded-xl transition-colors hover:opacity-80"
            title="Refresh"
            style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Status banners ── */}
      {st === "escalated" && (
        <div className="rounded-2xl px-5 py-3.5 flex items-center gap-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.12)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "#F87171" }} />
          <p className="text-sm font-medium" style={{ color: "#F87171" }}>This conversation was escalated for human review.</p>
        </div>
      )}
      {isActive && !isHuman && (
        <div className="rounded-2xl px-5 py-3.5 flex items-center gap-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }}>
          <div className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#4ADE80" }} />
          <p className="text-sm font-medium" style={{ color: "#4ADE80" }}>This conversation is live — AI is responding.</p>
        </div>
      )}
      {isActive && isHuman && (
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#10B981" }} />
            <p className="text-sm font-medium" style={{ color: "#10B981" }}>
              You have taken over this conversation. The customer is waiting for your reply.
            </p>
          </div>
          {/* Handback note — context the advisor can leave for the AI on next turn */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Note for AI when handing back <span style={{ color: "rgba(255,255,255,0.20)" }}>(optional)</span>
            </label>
            <textarea
              value={handbackNote}
              onChange={e => setHandbackNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="e.g. Customer is anxious about Q2 fees — I've promised to look into it. Pick up warmly and let them know the team is aware."
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(16,185,129,0.20)",
                color: "rgba(255,255,255,0.75)",
                lineHeight: "1.5",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(16,185,129,0.50)"}
              onBlur={e => e.target.style.borderColor = "rgba(16,185,129,0.20)"}
            />
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.20)" }}>
              The AI reads this once on its first reply, then it's cleared. The customer never sees it.
            </p>
          </div>
        </div>
      )}

      {/* ── Labels row ── */}
      <div className="flex items-center gap-2 flex-wrap relative">
        <Tag size={13} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
        {convLabels.length === 0 && (
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.18)" }}>No labels</span>
        )}
        {convLabels.map(l => (
          <span key={l.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: l.color + "22", color: l.color, border: `1px solid ${l.color}44` }}>
            {l.name}
            <button onClick={() => handleToggleLabel(l)} disabled={labelLoading}
              className="opacity-50 hover:opacity-100 transition-opacity leading-none ml-0.5">
              <X size={9} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setLabelPickerOpen(v => !v)}
          disabled={allLabels.length === 0}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Plus size={10} /> Label
        </button>

        {/* Label dropdown */}
        {labelPickerOpen && allLabels.length > 0 && (
          <div className="absolute left-0 top-8 z-10 rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
            style={{ background: "#141c2e", border: "1px solid rgba(255,255,255,0.08)" }}>
            {allLabels.map(l => {
              const active = convLabels.some(cl => cl.id === l.id);
              return (
                <button key={l.id}
                  onClick={() => { handleToggleLabel(l); setLabelPickerOpen(false); }}
                  disabled={labelLoading}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-white/5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span style={{ color: active ? l.color : "rgba(255,255,255,0.65)" }}>{l.name}</span>
                  {active && <span className="ml-auto text-[10px]" style={{ color: l.color }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CSAT rating (if submitted) ── */}
      {convo?.csat_score && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
          style={{ background: convo.csat_score === 2 ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${convo.csat_score === 2 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)"}` }}>
          {convo.csat_score === 2
            ? <ThumbsUp size={15} style={{ color: "#4ADE80", flexShrink: 0 }} />
            : <ThumbsDown size={15} style={{ color: "#F87171", flexShrink: 0 }} />}
          <div>
            <p className="text-[12px] font-semibold" style={{ color: convo.csat_score === 2 ? "#4ADE80" : "#F87171" }}>
              Customer rated this conversation {convo.csat_score === 2 ? "positively" : "negatively"}
            </p>
            {convo.csat_comment && (
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                "{convo.csat_comment}"
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Advisor score (only shown for ended conversations) ── */}
      {st === "ended" && (
        <div className="rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[11px] font-semibold shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
            Rate AI
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => handleScore(star)}
                disabled={scoring}
                className="transition-transform hover:scale-110 disabled:opacity-50 focus:outline-none"
                title={["", "Poor", "Fair", "Good", "Great", "Excellent"][star]}
              >
                <Star
                  className="h-5 w-5"
                  style={{
                    color: star <= (score || 0) ? "#C9A84C" : "rgba(255,255,255,0.15)",
                    fill:  star <= (score || 0) ? "#C9A84C" : "transparent",
                    transition: "color 0.15s, fill 0.15s",
                  }}
                />
              </button>
            ))}
          </div>
          {score && (
            <span className="text-[12px]" style={{ color: "#C9A84C" }}>
              {["", "Poor", "Fair", "Good", "Great", "Excellent"][score]}
            </span>
          )}
        </div>
      )}

      {/* ── Chat thread ── */}
      <div className="rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto pr-2" style={{ scrollBehavior: "smooth" }}>
          {messages.length === 0 && (
            <div className="text-center py-10">
              <MessageSquare className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No messages in this conversation.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const role    = (msg.role || msg.sender || "").toLowerCase();
            const isAgent = role === "agent" || role === "assistant";
            return (
              <div key={msg.id || i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                <div
                  className="max-w-[70%] rounded-2xl px-4 py-3"
                  style={
                    isAgent
                      ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }
                      : { background: "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08))", border: "1px solid rgba(201,168,76,0.15)" }
                  }
                >
                  <p className="text-[11px] font-semibold mb-1" style={{ color: isAgent ? "rgba(255,255,255,0.35)" : "#C9A84C" }}>
                    {isAgent ? agentName : name}
                  </p>
                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {msg.content || msg.text || msg.message || ""}
                  </p>
                  <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.15)" }}>
                    {fmtTime(msg.createdAt || msg.created_at || msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Human reply input (only when in human mode and conversation active) ── */}
        {isActive && isHuman && (
          <div className="px-6 pb-6 pt-0">
            <div className="rounded-2xl p-1 flex items-end gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleReplyKeyDown}
                placeholder="Type your reply to the customer… (Enter to send)"
                rows={2}
                className="flex-1 bg-transparent resize-none outline-none text-sm px-3 py-2"
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontFamily: "inherit",
                  maxHeight: 120,
                }}
                maxLength={2000}
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || sending}
                className="mb-1 mr-1 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", flexShrink: 0 }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              Press Enter to send · Shift+Enter for new line · Auto-refreshing every 3s
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShenmayConversationDetail;
