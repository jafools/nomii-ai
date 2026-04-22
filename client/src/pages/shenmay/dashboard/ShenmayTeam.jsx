import { useState, useEffect, useCallback } from "react";
import { getTeam, inviteAgent, removeAgent } from "@/lib/shenmayApi";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import {
  Users2, UserPlus, Trash2, RefreshCw, Mail, CheckCircle,
  AlertTriangle, Clock, Crown, Shield, User,
} from "lucide-react";

const card = { background: "#EDE7D7", border: "1px solid #EDE7D7" };

const ROLE_INFO = {
  owner:  { label: "Owner",  icon: Crown,  color: "#0F5F5C" },
  member: { label: "Admin",  icon: Shield, color: "#6366F1" },
  agent:  { label: "Agent",  icon: User,   color: "#0F5F5C" },
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
          <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "#EDE7D7" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle size={28} style={{ color: "#7A1F1A" }} />
        <p className="text-sm text-[#6B6B64]">{error}</p>
        <button onClick={fetchTeam} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
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
          <h2 className="text-lg font-semibold text-[#1A1D1A]">Team Members</h2>
          <p className="text-sm text-[#6B6B64] mt-0.5">
            {agents.length} / {maxAgents} agents on {plan} plan
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => { setShowInviteForm(true); setInviteError(null); setInviteSuccess(null); }}
            disabled={atLimit}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
            style={atLimit
              ? { background: "#EDE7D7", color: "#6B6B64", cursor: "not-allowed" }
              : { background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }
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
          <span className="text-[12px] text-[#6B6B64]">Agent seats used</span>
          <span className="text-[12px] font-semibold" style={{ color: atLimit ? "#7A1F1A" : "#6B6B64" }}>
            {agents.length} / {maxAgents}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EDE7D7" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (agents.length / maxAgents) * 100)}%`,
              background: atLimit ? "#7A1F1A" : agents.length / maxAgents >= 0.8 ? "#A6660E" : "#0F5F5C",
            }}
          />
        </div>
        {atLimit && (
          <p className="text-[11px] mt-2" style={{ color: "#7A1F1A" }}>
            Agent limit reached. <a href="/shenmay/dashboard/plans" className="underline hover:opacity-80">Upgrade your plan</a> to add more agents.
          </p>
        )}
      </div>

      {/* Success message */}
      {inviteSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(45,106,79,0.08)", border: "1px solid rgba(45,106,79,0.15)" }}>
          <CheckCircle size={15} style={{ color: "#2D6A4F" }} />
          <span className="text-sm text-[#3A3D39]">{inviteSuccess}</span>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <form onSubmit={handleInvite} className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#3A3D39]">Invite a new agent</p>
            <button type="button" onClick={() => setShowInviteForm(false)} className="text-[#6B6B64] hover:text-[#6B6B64] text-xl leading-none">×</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#6B6B64] mb-1.5">First Name</label>
              <input
                type="text"
                value={inviteFirst}
                onChange={(e) => setInviteFirst(e.target.value)}
                placeholder="Jane"
                className="w-full px-3 py-2 rounded-xl text-sm text-[#1A1D1A] outline-none transition-all"
                style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#6B6B64] mb-1.5">Last Name</label>
              <input
                type="text"
                value={inviteLast}
                onChange={(e) => setInviteLast(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2 rounded-xl text-sm text-[#1A1D1A] outline-none transition-all"
                style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#6B6B64] mb-1.5">Email Address *</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full px-3 py-2 rounded-xl text-sm text-[#1A1D1A] outline-none transition-all"
              style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}
            />
          </div>
          {inviteError && (
            <p className="text-sm" style={{ color: "#7A1F1A" }}>{inviteError}</p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}
            >
              <Mail size={14} />
              {inviting ? "Sending…" : "Send Invitation"}
            </button>
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              className="text-sm text-[#6B6B64] hover:text-[#6B6B64] px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Agent list */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B64]" style={{ borderBottom: "1px solid #EDE7D7" }}>
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
              style={i < agents.length - 1 ? { borderBottom: "1px solid #EDE7D7" } : {}}
            >
              {/* Name + email */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: "#EDE7D7", color: "#6B6B64" }}
                  >
                    {(agent.first_name?.[0] || agent.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#1A1D1A]/75 truncate">
                      {agent.first_name || agent.last_name
                        ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim()
                        : <span className="text-[#6B6B64]">—</span>
                      }
                      {isSelf && <span className="ml-1.5 text-[10px] text-[#6B6B64]">(you)</span>}
                    </p>
                    <p className="text-[11px] text-[#6B6B64] truncate">{agent.email}</p>
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
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: "#2D6A4F" }}>
                    <CheckCircle size={11} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: "#A6660E" }}>
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
                      style={{ color: "rgba(122,31,26,0.5)" }}
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
      <div className="rounded-2xl px-5 py-4" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }}>
        <p className="text-[12px] text-[#6B6B64] leading-relaxed">
          <span className="font-semibold text-[#6B6B64]">How it works:</span> Invited agents receive an email with a link to set their password. Once accepted, they can log into the dashboard using the same login page. Agents can view conversations and take over live chats — only the account owner can invite or remove agents.
        </p>
      </div>
    </div>
  );
};

export default ShenmayTeam;
