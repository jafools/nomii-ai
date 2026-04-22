import { useState, useEffect, useCallback } from "react";
import { getTeam, inviteAgent, removeAgent } from "@/lib/shenmayApi";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  Users2, UserPlus, Trash2, RefreshCw, Mail, CheckCircle,
  AlertTriangle, Clock, Crown, Shield, User,
} from "lucide-react";

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" };

const ROLE_INFO = {
  owner:  { label: "Owner",  icon: Crown,  color: "#C9A84C" },
  member: { label: "Admin",  icon: Shield, color: "#6366F1" },
  agent:  { label: "Agent",  icon: User,   color: "#3B82F6" },
};

const PLAN_LIMITS = {
  free:         1,
  trial:        3,
  starter:      10,
  growth:       25,
  professional: 100,
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

const ShenmayTeam = () => {
  const { shenmayUser, subscription } = useShenmayAuth();
  const [agents, setAgents] = useState([]);
  const [maxAgents, setMaxAgents] = useState(3);
  const [plan, setPlan] = useState("trial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [inviteError, setInviteError] = useState(null);

  // Remove
  const [removing, setRemoving] = useState(null);

  const isOwner = shenmayUser?.role === "owner" || shenmayUser?.role === "member";

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getTeam();
      setAgents(data.agents || []);
      // Server now derives max_agents from the plan's limits when the DB column
      // is NULL, so this fallback is only hit if the API call fails entirely.
      setMaxAgents(data.max_agents || 1);
      setPlan(data.plan || "trial");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const data = await inviteAgent({
        email: inviteEmail.trim(),
        first_name: inviteFirst.trim() || undefined,
        last_name: inviteLast.trim() || undefined,
        role: "agent",
      });
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteFirst("");
      setInviteLast("");
      setShowInviteForm(false);
      fetchTeam();
    } catch (e) {
      setInviteError(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (agentId, agentEmail) => {
    if (!window.confirm(`Remove ${agentEmail} from your team?`)) return;
    setRemoving(agentId);
    try {
      await removeAgent(agentId);
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch (e) {
      alert(e.message);
    } finally {
      setRemoving(null);
    }
  };

  const atLimit = agents.length >= maxAgents;

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle size={28} style={{ color: "#F87171" }} />
        <p className="text-sm text-white/30">{error}</p>
        <button onClick={fetchTeam} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white/80">Team Members</h2>
          <p className="text-sm text-white/30 mt-0.5">
            {agents.length} / {maxAgents} agents on {plan} plan
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => { setShowInviteForm(true); setInviteError(null); setInviteSuccess(null); }}
            disabled={atLimit}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
            style={atLimit
              ? { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.2)", cursor: "not-allowed" }
              : { background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }
            }
            title={atLimit ? `Agent limit reached (${maxAgents}). Upgrade to add more.` : "Invite a new agent"}
          >
            <UserPlus size={15} />
            Invite Agent
          </button>
        )}
      </div>

      {/* Capacity bar */}
      <div className="rounded-2xl p-4" style={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-white/40">Agent seats used</span>
          <span className="text-[12px] font-semibold" style={{ color: atLimit ? "#EF4444" : "rgba(255,255,255,0.5)" }}>
            {agents.length} / {maxAgents}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (agents.length / maxAgents) * 100)}%`,
              background: atLimit ? "#EF4444" : agents.length / maxAgents >= 0.8 ? "#F59E0B" : "#C9A84C",
            }}
          />
        </div>
        {atLimit && (
          <p className="text-[11px] mt-2" style={{ color: "#F87171" }}>
            Agent limit reached. <a href="/shenmay/dashboard/plans" className="underline hover:opacity-80">Upgrade your plan</a> to add more agents.
          </p>
        )}
      </div>

      {/* Success message */}
      {inviteSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
          <CheckCircle size={15} style={{ color: "#4ADE80" }} />
          <span className="text-sm text-white/70">{inviteSuccess}</span>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <form onSubmit={handleInvite} className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/70">Invite a new agent</p>
            <button type="button" onClick={() => setShowInviteForm(false)} className="text-white/20 hover:text-white/50 text-xl leading-none">×</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-white/30 mb-1.5">First Name</label>
              <input
                type="text"
                value={inviteFirst}
                onChange={(e) => setInviteFirst(e.target.value)}
                placeholder="Jane"
                className="w-full px-3 py-2 rounded-xl text-sm text-white/80 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-white/30 mb-1.5">Last Name</label>
              <input
                type="text"
                value={inviteLast}
                onChange={(e) => setInviteLast(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2 rounded-xl text-sm text-white/80 outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-white/30 mb-1.5">Email Address *</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full px-3 py-2 rounded-xl text-sm text-white/80 outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          {inviteError && (
            <p className="text-sm" style={{ color: "#F87171" }}>{inviteError}</p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
            >
              <Mail size={14} />
              {inviting ? "Sending…" : "Send Invitation"}
            </button>
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              className="text-sm text-white/30 hover:text-white/50 px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Agent list */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/20" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span>Agent</span>
          <span>Role</span>
          <span>Status</span>
          {isOwner && <span />}
        </div>
        {agents.map((agent, i) => {
          const roleInfo = ROLE_INFO[agent.role] || ROLE_INFO.agent;
          const RoleIcon = roleInfo.icon;
          const isSelf = agent.id === shenmayUser?.id;
          return (
            <div
              key={agent.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 items-center px-6 py-4 transition-all duration-150 hover:bg-white/[0.01]"
              style={i < agents.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,0.03)" } : {}}
            >
              {/* Name + email */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {(agent.first_name?.[0] || agent.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white/75 truncate">
                      {agent.first_name || agent.last_name
                        ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim()
                        : <span className="text-white/30">—</span>
                      }
                      {isSelf && <span className="ml-1.5 text-[10px] text-white/25">(you)</span>}
                    </p>
                    <p className="text-[11px] text-white/25 truncate">{agent.email}</p>
                  </div>
                </div>
              </div>

              {/* Role */}
              <div className="flex items-center gap-1.5">
                <RoleIcon size={13} style={{ color: roleInfo.color }} />
                <span className="text-[13px]" style={{ color: roleInfo.color }}>{roleInfo.label}</span>
              </div>

              {/* Status */}
              <div>
                {agent.email_verified ? (
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: "#4ADE80" }}>
                    <CheckCircle size={11} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: "#F59E0B" }}>
                    <Clock size={11} /> Pending
                  </span>
                )}
              </div>

              {/* Remove */}
              {isOwner && (
                <div>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemove(agent.id, agent.email)}
                      disabled={removing === agent.id}
                      className="p-1.5 rounded-lg transition-all hover:opacity-70 disabled:opacity-30"
                      style={{ color: "rgba(239,68,68,0.5)" }}
                      title={`Remove ${agent.email}`}
                    >
                      {removing === agent.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info box */}
      <div className="rounded-2xl px-5 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <p className="text-[12px] text-white/30 leading-relaxed">
          <span className="font-semibold text-white/40">How it works:</span> Invited agents receive an email with a link to set their password. Once accepted, they can log into the dashboard using the same login page. Agents can view conversations and take over live chats — only the account owner can invite or remove agents.
        </p>
      </div>
    </div>
  );
};

export default ShenmayTeam;
