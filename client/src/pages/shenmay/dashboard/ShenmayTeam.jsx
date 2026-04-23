import { useState, useEffect, useCallback } from "react";
import { getTeam, inviteAgent, removeAgent } from "@/lib/shenmayApi";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { UserPlus, Trash2, RefreshCw, Mail, CheckCircle, AlertTriangle, Clock, Crown, Shield, User } from "lucide-react";
import { TOKENS as T, Kicker, Display, Lede, Field, Input, Button, Notice } from "@/components/shenmay/ui/ShenmayUI";

const ROLE_INFO = {
  owner:  { label: "Owner",  icon: Crown,  color: T.teal     },
  member: { label: "Admin",  icon: Shield, color: T.tealDark },
  agent:  { label: "Agent",  icon: User,   color: T.mute     },
};

const ShenmayTeam = () => {
  const { shenmayUser } = useShenmayAuth();
  const [agents, setAgents] = useState([]);
  const [maxAgents, setMaxAgents] = useState(3);
  const [plan, setPlan] = useState("trial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [inviteError, setInviteError] = useState(null);

  const [removing, setRemoving] = useState(null);

  const isOwner = shenmayUser?.role === "owner" || shenmayUser?.role === "member";

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTeam();
      setAgents(data.agents || []);
      setMaxAgents(data.max_agents || 1);
      setPlan(data.plan || "trial");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true); setInviteError(null); setInviteSuccess(null);
    try {
      await inviteAgent({ email: inviteEmail.trim(), first_name: inviteFirst.trim() || undefined, last_name: inviteLast.trim() || undefined, role: "agent" });
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail(""); setInviteFirst(""); setInviteLast("");
      setShowInviteForm(false);
      fetchTeam();
    } catch (e) { setInviteError(e.message); }
    finally { setInviting(false); }
  };

  const handleRemove = async (agentId, agentEmail) => {
    if (!window.confirm(`Remove ${agentEmail} from your team?`)) return;
    setRemoving(agentId);
    try {
      await removeAgent(agentId);
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch (e) { alert(e.message); }
    finally { setRemoving(null); }
  };

  const atLimit = agents.length >= maxAgents;
  const capacity = Math.min(100, (agents.length / maxAgents) * 100);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 32 }}>
          <Kicker>Human-in-the-loop</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>Loading team…</Display>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ height: 56, borderRadius: 10, background: T.paperDeep, animation: "pulse 1.8s ease-in-out infinite" }} />)}
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "72px 0", textAlign: "center" }}>
        <AlertTriangle size={28} color={T.danger} />
        <Lede style={{ marginTop: 0 }}>{error}</Lede>
        <Button variant="primary" onClick={fetchTeam}><RefreshCw size={14} /> Retry</Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
        <div>
          <Kicker>Human-in-the-loop · Team</Kicker>
          <Display size={38} italic style={{ marginTop: 12 }}>Your team.</Display>
          <Lede>
            {agents.length} / {maxAgents} agents on the <strong style={{ color: T.ink }}>{plan}</strong> plan.
          </Lede>
        </div>
        {isOwner && (
          <Button
            variant={atLimit ? "ghost" : "primary"}
            disabled={atLimit}
            onClick={() => { setShowInviteForm(true); setInviteError(null); setInviteSuccess(null); }}
            title={atLimit ? `Agent limit reached (${maxAgents}). Upgrade to add more.` : "Invite a new agent"}
          >
            <UserPlus size={14} /> Invite agent
          </Button>
        )}
      </div>

      {/* Capacity meter */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <Kicker color={T.mute}>Seats used</Kicker>
          <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 500, color: atLimit ? T.danger : T.ink, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>
            {agents.length} / {maxAgents}
          </span>
        </div>
        <div style={{ height: 2, borderRadius: 1, background: T.paperEdge, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${capacity}%`, background: atLimit ? T.danger : capacity >= 80 ? T.warning : T.teal, transition: "width 500ms ease" }} />
        </div>
        {atLimit && (
          <p style={{ fontSize: 12, color: T.danger, margin: "10px 0 0" }}>
            Agent limit reached.{" "}
            <a href="/dashboard/plans" style={{ color: T.danger, textDecoration: "none", borderBottom: `1px solid ${T.danger}40`, fontWeight: 500 }}>
              Upgrade your plan
            </a>{" "}
            to add more agents.
          </p>
        )}
      </div>

      {/* Status messages */}
      {inviteSuccess && (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="success" icon={CheckCircle}>{inviteSuccess}</Notice>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <div style={{ background: T.paperDeep, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <Kicker>Invite</Kicker>
              <div style={{ fontFamily: T.sans, fontWeight: 500, fontSize: 16, color: T.ink, marginTop: 4 }}>Add a new agent</div>
            </div>
            <button onClick={() => setShowInviteForm(false)} style={{ background: "none", border: "none", color: T.mute, fontSize: 22, lineHeight: 1, cursor: "pointer" }}>×</button>
          </div>
          <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field id="inviteFirst" label="First name">
                <Input id="inviteFirst" type="text" value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} placeholder="Jane" />
              </Field>
              <Field id="inviteLast" label="Last name">
                <Input id="inviteLast" type="text" value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} placeholder="Smith" />
              </Field>
            </div>
            <Field id="inviteEmail" label="Email">
              <Input id="inviteEmail" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@company.com" />
            </Field>
            {inviteError && <Notice tone="danger">{inviteError}</Notice>}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              <Button type="submit" variant="primary" disabled={inviting || !inviteEmail.trim()}>
                <Mail size={13} /> {inviting ? "Sending…" : "Send invitation"}
              </Button>
              <button type="button" onClick={() => setShowInviteForm(false)} style={{ fontSize: 13, color: T.mute, background: "none", border: "none", padding: "8px 14px", cursor: "pointer", fontFamily: T.sans }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Agent table */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr auto", gap: 16, padding: "12px 24px", fontFamily: T.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mute, borderBottom: `1px solid ${T.paperEdge}` }}>
          <span>Agent</span>
          <span>Role</span>
          <span>Status</span>
          {isOwner && <span style={{ width: 40 }} />}
        </div>
        {agents.map((agent, i) => {
          const roleInfo = ROLE_INFO[agent.role] || ROLE_INFO.agent;
          const RoleIcon = roleInfo.icon;
          const isSelf = agent.id === shenmayUser?.id;
          return (
            <div
              key={agent.id}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr auto", gap: 16, alignItems: "center",
                padding: "14px 24px",
                borderBottom: i < agents.length - 1 ? `1px solid ${T.paperEdge}` : "none",
                transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.paper)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.paperDeep, color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                  {(agent.first_name?.[0] || agent.email?.[0] || "?").toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.ink, letterSpacing: "-0.005em" }}>
                      {agent.first_name || agent.last_name ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() : <span style={{ color: T.mute }}>—</span>}
                    </span>
                    {isSelf && <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mute }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.email}</div>
                </div>
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <RoleIcon size={13} color={roleInfo.color} />
                <span style={{ fontSize: 13, color: roleInfo.color, fontWeight: 500 }}>{roleInfo.label}</span>
              </div>

              <div>
                {agent.email_verified ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.success }}>
                    <CheckCircle size={11} /> Active
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.warning }}>
                    <Clock size={11} /> Pending
                  </span>
                )}
              </div>

              {isOwner && (
                <div>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemove(agent.id, agent.email)}
                      disabled={removing === agent.id}
                      style={{ padding: 6, borderRadius: 4, background: "none", border: "none", color: `${T.danger}88`, cursor: "pointer", transition: "background 180ms, color 180ms" }}
                      title={`Remove ${agent.email}`}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F3E8E4"; e.currentTarget.style.color = T.danger; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = `${T.danger}88`; }}
                    >
                      {removing === agent.id ? <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info footer */}
      <div style={{ background: T.paperDeep, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: "16px 20px" }}>
        <Kicker color={T.mute}>How it works</Kicker>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6, margin: "8px 0 0" }}>
          Invited agents get an email with a link to set their password. Once accepted, they can sign in using the same login page. Agents can view conversations and take over live chats — only the account owner can invite or remove agents.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ShenmayTeam;
