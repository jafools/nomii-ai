import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getConversation, takeoverConversation, handbackConversation, replyToConversation, downloadTranscript, getLabels, addConversationLabel, removeConversationLabel, scoreConversation } from "@/lib/shenmayApi";
import { fmtTime } from "@/lib/format";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { ArrowLeft, RefreshCw, AlertTriangle, MessageSquare, UserCheck, Bot, Send, Download, Tag, Plus, X, ThumbsUp, ThumbsDown, Star } from "lucide-react";
import { TOKENS as T, Kicker, Button } from "@/components/shenmay/ui/ShenmayUI";

const statusStyle = {
  active:    { bg: "rgba(45,106,79,0.12)",    color: "#2D6A4F",  label: "Active" },
  ended:     { bg: "#EDE7D7",  color: "#6B6B64", label: "Ended" },
  escalated: { bg: "rgba(122,31,26,0.12)",    color: "#7A1F1A",  label: "Escalated" },
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
        <div className="h-6 w-48 rounded-lg" style={{ background: "#EDE7D7" }} />
        <div className="h-4 w-32 rounded-lg" style={{ background: "#EDE7D7" }} />
        <div className="space-y-3 mt-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-start" : "justify-end"}`}>
              <div className="h-14 w-64 rounded-2xl" style={{ background: "#EDE7D7" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(122,31,26,0.1)" }}>
          <AlertTriangle className="h-6 w-6" style={{ color: "#7A1F1A" }} />
        </div>
        <p className="text-sm text-[#6B6B64] mb-4">{error}</p>
        <Button variant="primary" onClick={() => fetchData()}>
          <RefreshCw size={14} /> Retry
        </Button>
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
          onClick={() => navigate("/dashboard/conversations")}
          className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
          style={{ color: "#6B6B64" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="h-5 w-px" style={{ background: "#EDE7D7" }} />
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: "#EDE7D7", color: "#6B6B64" }}>
            {(name[0] || "?").toUpperCase()}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#1A1D1A]">{name}</p>
            {showEmail && <p className="text-[11px] text-[#6B6B64]">{email}</p>}
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
            <Button variant="teal" size="md" onClick={handleTakeover} disabled={takingOver}>
              <UserCheck size={14} /> {takingOver ? "Taking over…" : "Take over"}
            </Button>
          )}
          {isActive && isHuman && (
            <Button variant="primary" size="md" onClick={handleHandback} disabled={handingBack}>
              <Bot size={14} /> {handingBack ? "Handing back…" : "Hand back to AI"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleDownloadTranscript} disabled={downloading} title="Download transcript">
            <Download size={13} /> {downloading ? "Downloading…" : "Transcript"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchData(false)} title="Refresh">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* ── Status banners ── */}
      {st === "escalated" && (
        <div className="rounded-2xl px-5 py-3.5 flex items-center gap-3" style={{ background: "rgba(122,31,26,0.08)", border: "1px solid rgba(122,31,26,0.12)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "#7A1F1A" }} />
          <p className="text-sm font-medium" style={{ color: "#7A1F1A" }}>This conversation was escalated for human review.</p>
        </div>
      )}
      {isActive && !isHuman && (
        <div className="rounded-2xl px-5 py-3.5 flex items-center gap-3" style={{ background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.12)" }}>
          <div className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#2D6A4F" }} />
          <p className="text-sm font-medium" style={{ color: "#2D6A4F" }}>This conversation is live — AI is responding.</p>
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
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: "#6B6B64" }}>
              Note for AI when handing back <span style={{ color: "#6B6B64" }}>(optional)</span>
            </label>
            <textarea
              value={handbackNote}
              onChange={e => setHandbackNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="e.g. Customer is anxious about Q2 fees — I've promised to look into it. Pick up warmly and let them know the team is aware."
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: "#EDE7D7",
                border: "1px solid rgba(16,185,129,0.20)",
                color: "#3A3D39",
                lineHeight: "1.5",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(16,185,129,0.50)"}
              onBlur={e => e.target.style.borderColor = "rgba(16,185,129,0.20)"}
            />
            <p className="text-[10px] mt-1" style={{ color: "#6B6B64" }}>
              The AI reads this once on its first reply, then it's cleared. The customer never sees it.
            </p>
          </div>
        </div>
      )}

      {/* ── Labels row ── */}
      <div className="flex items-center gap-2 flex-wrap relative">
        <Tag size={13} style={{ color: "#6B6B64", flexShrink: 0 }} />
        {convLabels.length === 0 && (
          <span className="text-[11px]" style={{ color: "#D8D0BD" }}>No labels</span>
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
          style={{ background: "#EDE7D7", color: "#6B6B64", border: "1px solid #EDE7D7" }}>
          <Plus size={10} /> Label
        </button>

        {/* Label dropdown */}
        {labelPickerOpen && allLabels.length > 0 && (
          <div className="absolute left-0 top-8 z-10 rounded-xl shadow-2xl overflow-hidden min-w-[160px]"
            style={{ background: "#141c2e", border: "1px solid #EDE7D7" }}>
            {allLabels.map(l => {
              const active = convLabels.some(cl => cl.id === l.id);
              return (
                <button key={l.id}
                  onClick={() => { handleToggleLabel(l); setLabelPickerOpen(false); }}
                  disabled={labelLoading}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-white/5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span style={{ color: active ? l.color : "#3A3D39" }}>{l.name}</span>
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
          style={{ background: convo.csat_score === 2 ? "rgba(45,106,79,0.06)" : "rgba(122,31,26,0.06)", border: `1px solid ${convo.csat_score === 2 ? "rgba(45,106,79,0.12)" : "rgba(122,31,26,0.12)"}` }}>
          {convo.csat_score === 2
            ? <ThumbsUp size={15} style={{ color: "#2D6A4F", flexShrink: 0 }} />
            : <ThumbsDown size={15} style={{ color: "#7A1F1A", flexShrink: 0 }} />}
          <div>
            <p className="text-[12px] font-semibold" style={{ color: convo.csat_score === 2 ? "#2D6A4F" : "#7A1F1A" }}>
              Customer rated this conversation {convo.csat_score === 2 ? "positively" : "negatively"}
            </p>
            {convo.csat_comment && (
              <p className="text-[11px] mt-0.5" style={{ color: "#6B6B64" }}>
                "{convo.csat_comment}"
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Advisor score (only shown for ended conversations) ── */}
      {st === "ended" && (
        <div className="rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
          <p className="text-[11px] font-semibold shrink-0" style={{ color: "#6B6B64" }}>
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
                    color: star <= (score || 0) ? "#0F5F5C" : "#D8D0BD",
                    fill:  star <= (score || 0) ? "#0F5F5C" : "transparent",
                    transition: "color 0.15s, fill 0.15s",
                  }}
                />
              </button>
            ))}
          </div>
          {score && (
            <span className="text-[12px]" style={{ color: "#0F5F5C" }}>
              {["", "Poor", "Fair", "Good", "Great", "Excellent"][score]}
            </span>
          )}
        </div>
      )}

      {/* ── Chat thread ── */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10 }}>
        <div style={{ padding: 24, maxHeight: "55vh", overflowY: "auto", scrollBehavior: "smooth" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <MessageSquare size={28} color={T.paperEdge} style={{ margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: 13, color: T.mute, margin: 0 }}>No messages in this conversation.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const role    = (msg.role || msg.sender || "").toLowerCase();
            const isAgent = role === "agent" || role === "assistant";
            const isHumanSent = isAgent && !!msg.sent_by_admin_id;
            const humanName = isHumanSent
              ? (`${msg.sender_first_name || ""} ${msg.sender_last_name || ""}`.trim() || "Human")
              : null;
            // Operator-as-you convention: agent (you) on the right, customer on
            // the left. Matches the sidebar ThreadView in ShenmayConversations.
            return (
              <div key={msg.id || i} style={{ display: "flex", justifyContent: isAgent ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{
                  maxWidth: "70%",
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: isAgent ? T.ink : T.paperDeep,
                  color: isAgent ? T.paper : T.ink,
                  border: isAgent ? `1px solid ${T.ink}` : `1px solid ${T.paperEdge}`,
                  borderRight: isHumanSent ? "3px solid #0F5F5C" : undefined,
                  borderBottomLeftRadius: isAgent ? 14 : 4,
                  borderBottomRightRadius: isAgent ? 4 : 14,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: isAgent ? `${T.paper}88` : T.mute, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    {isHumanSent && (
                      <span style={{ padding: "1px 5px", borderRadius: 3, background: "#0F5F5C", color: "#FFFFFF", fontSize: 9, letterSpacing: "0.06em" }}>HUMAN</span>
                    )}
                    <span>{isAgent ? (humanName || agentName) : name}</span>
                  </div>
                  <p style={{ fontSize: 14, whiteSpace: "pre-wrap", color: isAgent ? T.paper : T.ink, margin: 0, lineHeight: 1.55 }}>
                    {msg.content || msg.text || msg.message || ""}
                  </p>
                  <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em", color: isAgent ? `${T.paper}55` : T.mute, marginTop: 6 }}>
                    {fmtTime(msg.createdAt || msg.created_at || msg.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Human reply input (only when in human mode and conversation active) ── */}
        {isActive && isHuman && (
          <div style={{ padding: "0 24px 24px" }}>
            <div style={{ borderRadius: 8, padding: 4, display: "flex", alignItems: "flex-end", gap: 8, background: T.paperDeep, border: `1px solid ${T.paperEdge}` }}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleReplyKeyDown}
                placeholder="Type your reply to the customer… (Enter to send)"
                rows={2}
                style={{
                  flex: 1, background: "transparent", resize: "none", outline: "none",
                  fontSize: 14, color: T.ink, fontFamily: T.sans, padding: "8px 12px", border: "none", maxHeight: 120, lineHeight: 1.5,
                }}
                maxLength={2000}
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || sending}
                style={{
                  width: 36, height: 36, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: T.ink, color: T.paper, border: "none", cursor: !replyText.trim() || sending ? "not-allowed" : "pointer",
                  opacity: !replyText.trim() || sending ? 0.4 : 1, flexShrink: 0, margin: "0 4px 4px 0",
                  transition: "background 180ms",
                }}
                onMouseEnter={(e) => { if (replyText.trim() && !sending) e.currentTarget.style.background = T.tealDark; }}
                onMouseLeave={(e) => { if (replyText.trim() && !sending) e.currentTarget.style.background = T.ink; }}
              >
                <Send size={14} />
              </button>
            </div>
            <p style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.08em", color: T.mute, margin: "8px 0 0", textTransform: "uppercase" }}>
              Enter to send · Shift+Enter for new line · Auto-refresh 3s
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShenmayConversationDetail;
