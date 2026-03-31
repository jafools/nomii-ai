import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCustomer, deleteCustomer, exportCustomerData, getCustomerData, addCustomerDataRecord, deleteCustomerCategory, deleteCustomerRecord, triggerMemorySummary } from "@/lib/nomiiApi";
import { useNomiiAuth } from "@/contexts/NomiiAuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, AlertTriangle, User, MessageSquare, Trash2, Brain, BookOpen, Database, Plus, X, ChevronDown, ChevronRight, Tag, Target, Zap, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const statusStyle = {
  completed: { bg: "rgba(34,197,94,0.12)", color: "#4ADE80", label: "Completed" },
  in_progress: { bg: "rgba(59,130,246,0.12)", color: "#60A5FA", label: "In Progress" },
  pending: { bg: "rgba(245,158,11,0.12)", color: "#FBBF24", label: "Pending" },
  new: { bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", label: "New" },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Never";

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" };

const NomiiCustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { nomiiTenant } = useNomiiAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const pollRef = useRef(null);

  const loadData = useCallback((silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    return getCustomer(id)
      .then((d) => { setData(d); setLastRefreshed(new Date()); })
      .catch((e) => { if (!silent) setError(e.message); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [id]);

  // Initial load
  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh soul/memory every 20s so updates propagate without manual reload
  useEffect(() => {
    pollRef.current = setInterval(() => { loadData(true); }, 20000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  // Also refresh when tab becomes visible again (user switches back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadData(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadData]);

  // Expose manual refresh for error retry button
  const fetch = useCallback(() => loadData(false), [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        {[120, 200, 160].map((h, i) => (
          <div key={i} className="rounded-2xl animate-pulse" style={{ ...card, height: h }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
          <AlertTriangle size={24} style={{ color: "#F87171" }} />
        </div>
        <p className="text-sm text-white/30">{error}</p>
        <button onClick={fetch} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const customer = data?.customer || data || {};
  const soul = customer.soul_file;
  const memory = customer.memory_file;
  const conversations = customer.conversations || [];
  const st = statusStyle[customer.onboarding_status] || statusStyle.new;
  const initials = `${(customer.first_name?.[0] || "").toUpperCase()}${(customer.last_name?.[0] || "").toUpperCase()}`;

  return (
    <div className="space-y-6">
      {/* Back + refresh indicator */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/nomii/dashboard/customers")} className="flex items-center gap-1.5 text-sm transition-colors" style={{ color: "rgba(255,255,255,0.35)" }}>
          <ArrowLeft size={16} /> All customers
        </button>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.18)" }}>
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={fetch} title="Refresh now" className="p-1.5 rounded-lg transition-colors hover:opacity-80" style={{ color: "rgba(255,255,255,0.25)" }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="rounded-2xl p-6 flex items-center gap-5" style={card}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0" style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
          {initials || <User size={24} />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white/90">{customer.first_name} {customer.last_name}</h2>
          <p className="text-sm text-white/30">{customer.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
          <span className="text-[11px] text-white/20">Last interaction: {fmtDate(customer.last_interaction)}</span>
        </div>
      </div>

      {/* Soul Profile */}
      <div className="rounded-2xl p-6" style={card}>
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <Brain size={14} style={{ color: "#C9A84C" }} /> Soul Profile
        </h3>
        {soul && (soul.customer_name || soul.agent_nickname || soul.personal_profile) ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {soul.agent_nickname && (
                <p className="text-white/50"><span className="text-white/25 font-medium">Agent Name: </span>{soul.agent_nickname}</p>
              )}
              {soul.customer_name && (
                <p className="text-white/50"><span className="text-white/25 font-medium">Known As: </span>{soul.customer_name}</p>
              )}
            </div>
            {soul.personal_profile && (
              <div className="space-y-3">
                {[
                  { key: "interests", label: "Interests" },
                  { key: "preferences", label: "Preferences" },
                  { key: "personality_traits", label: "Personality" },
                  { key: "life_details", label: "Life Details" },
                ].map(({ key, label }) => {
                  const items = soul.personal_profile[key];
                  if (!items || !Array.isArray(items) || items.length === 0) return null;
                  return (
                    <div key={key}>
                      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-1.5">{label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((item, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-full text-[12px] font-medium" style={{ background: "rgba(201,168,76,0.1)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.15)" }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/20 italic">No soul data yet — the agent is still getting to know this customer.</p>
        )}
      </div>

      {/* Conversation Memory */}
      <div className="rounded-2xl p-6" style={card}>
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <BookOpen size={14} style={{ color: "#60A5FA" }} /> Conversation Memory
        </h3>
        {memory && (memory.conversation_history?.length > 0 || memory.agent_notes?.length > 0) ? (
          <div className="space-y-5">
            {memory.conversation_history?.length > 0 && (
              <div className="space-y-3">
                {memory.conversation_history.map((entry, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <p className="text-[13px] font-semibold text-white/60">
                        Session #{entry.session || i + 1}
                        {entry.date && <span className="text-white/25 font-normal"> — {new Date(entry.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
                      </p>
                      {entry.message_count != null && (
                        <span className="text-[11px] text-white/25">{entry.message_count} messages</span>
                      )}
                    </div>
                    {entry.summary && <p className="text-[13px] text-white/40 mb-2">{entry.summary}</p>}
                    {entry.topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {entry.topics.map((t, j) => (
                          <span key={j} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.15)" }}>
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {memory.agent_notes?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2">Agent Notes</p>
                <ul className="space-y-1.5">
                  {memory.agent_notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-white/40">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.15)" }} />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/20 italic">No memory yet — this customer hasn't had a completed conversation.</p>
        )}
      </div>

      {/* What the Agent Knows — personal profile */}
      <PersonalProfileSection memory={memory} />

      {/* Goals & Plans */}
      <GoalsSection memory={memory} />

      {/* Conversations */}
      <div className="rounded-2xl p-6" style={card}>
        <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
          <MessageSquare size={14} /> Conversations
        </h3>
        {conversations.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} onSynced={fetch} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/20 italic">No conversations yet.</p>
        )}
      </div>

      {/* Customer Data Records */}
      <CustomerDataSection customerId={id} />

      {/* Export Customer Data (GDPR Art. 20 — Data Portability) */}
      <ExportCustomerCard customerId={id} customerName={`${customer.first_name || ""} ${customer.last_name || ""}`.trim()} />

      {/* Delete Customer Data */}
      <DeleteCustomerCard customerId={id} navigate={navigate} />
    </div>
  );
};

// ── Personal Profile Section ──────────────────────────────────────────────────
// Surfaces memory_file.personal_profile — facts the agent has learned through conversation.

const PersonalProfileSection = ({ memory }) => {
  if (!memory) return null;
  const profile = memory.personal_profile || {};
  const family  = profile.family || {};

  const fields = [
    { label: "Name",            value: profile.name },
    { label: "Age",             value: profile.age },
    { label: "Location",        value: profile.location },
    { label: "Career",          value: profile.career },
    { label: "Tech Comfort",    value: profile.tech_comfort },
    { label: "Communication",   value: profile.communication_preference },
    { label: "Marital Status",  value: family.marital_status },
  ].filter(f => f.value);

  const hasFamily = family.spouse || family.children?.length > 0 || family.late_spouse;
  const hasData   = fields.length > 0 || hasFamily;

  return (
    <div className="rounded-2xl p-6" style={card}>
      <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
        <User size={14} style={{ color: "#A78BFA" }} /> What the Agent Knows
        <span className="text-[11px] font-normal text-white/20 ml-1">— learned through conversation</span>
      </h3>
      {hasData ? (
        <div className="space-y-4">
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {fields.map(({ label, value }) => (
                <div key={label}>
                  <span className="text-[11px] text-white/25 font-medium uppercase tracking-wide">{label}</span>
                  <p className="text-[13px] text-white/55 mt-0.5">{String(value)}</p>
                </div>
              ))}
            </div>
          )}
          {hasFamily && (
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2">Family</p>
              <div className="space-y-1">
                {family.spouse && (
                  <p className="text-[13px] text-white/45">
                    Spouse: {family.spouse.name}{family.spouse.age ? ` (${family.spouse.age})` : ""}
                    {family.spouse.health_notes ? ` — ${family.spouse.health_notes}` : ""}
                  </p>
                )}
                {family.late_spouse && (
                  <p className="text-[13px] text-white/45">
                    Late spouse: {family.late_spouse.name}
                    {family.late_spouse.passed ? ` (passed ${family.late_spouse.passed})` : ""}
                  </p>
                )}
                {family.children?.map((child, i) => (
                  <p key={i} className="text-[13px] text-white/45">
                    {child.name}{child.age ? ` (${child.age})` : ""}{child.location ? ` — ${child.location}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/20 italic">No personal facts learned yet — will populate as the customer shares information in conversation.</p>
      )}
    </div>
  );
};


// ── Goals Section ─────────────────────────────────────────────────────────────
// Surfaces memory_file.life_plan / goals — what this customer cares about.

const GoalsSection = ({ memory }) => {
  if (!memory) return null;
  const plan     = memory.life_plan || memory.goals || {};
  const concerns = plan.concerns || [];
  const goals    = plan.goals    || [];

  // Also grab action items from most recent session
  const history    = memory.conversation_history || [];
  const lastSession = history[history.length - 1];
  const actionItems = lastSession?.action_items || [];

  const hasData = goals.length > 0 || concerns.length > 0 || actionItems.length > 0 || Object.keys(plan).some(k => k !== "goals" && k !== "concerns");

  if (!hasData) return null;

  return (
    <div className="rounded-2xl p-6" style={card}>
      <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
        <Target size={14} style={{ color: "#FB923C" }} /> Goals & Priorities
      </h3>
      <div className="space-y-4">
        {goals.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2">Goals</p>
            <ul className="space-y-1.5">
              {goals.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-white/50">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#FB923C", opacity: 0.6 }} />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
        {concerns.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2">Concerns</p>
            <ul className="space-y-1.5">
              {concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-white/50">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#F87171", opacity: 0.6 }} />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {actionItems.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-1">
              Open Action Items <span className="font-normal text-white/20">(from last session)</span>
            </p>
            <ul className="space-y-1.5">
              {actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-white/50">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#60A5FA", opacity: 0.6 }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};


// ── Conversation Row ──────────────────────────────────────────────────────────
// Single conversation row with an inline "Sync Memory" button.

const ConversationRow = ({ conversation: c, onSynced }) => {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async (e) => {
    e.preventDefault(); // prevent Link navigation
    e.stopPropagation();
    setSyncing(true);
    try {
      await triggerMemorySummary(c.id);
      toast({ title: "Memory sync queued", description: "Agent memory will update in the background." });
      setTimeout(() => onSynced?.(), 3000); // refresh detail after a moment
    } catch (err) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2" style={{ border: "1px solid rgba(255,255,255,0.04)", borderRadius: "0.75rem" }}>
      <Link to={`/nomii/dashboard/conversations/${c.id}`} className="flex-1 flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.02]">
        <div className="text-sm">
          <span className="font-medium text-white/60">{c.status}</span>
          <span className="text-white/25 ml-2">{c.message_count || 0} messages</span>
          {c.summary && <span className="text-white/20 ml-2 text-[12px]">{c.summary.substring(0, 60)}{c.summary.length > 60 ? "…" : ""}</span>}
        </div>
        <span className="text-[11px] text-white/20 ml-3 shrink-0">{fmtDate(c.created_at)}</span>
      </Link>
      <button
        onClick={handleSync}
        disabled={syncing}
        title="Sync memory from this conversation"
        className="mr-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80 disabled:opacity-40"
        style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.15)" }}
      >
        <Zap size={10} />
        {syncing ? "…" : "Sync"}
      </button>
    </div>
  );
};


// ── Customer Data Section ─────────────────────────────────────────────────────

const CustomerDataSection = ({ customerId }) => {
  const [records, setRecords]           = useState({});    // { category: [rows] }
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState({});    // { category: bool }
  const [showAddForm, setShowAddForm]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'category'|'record', category, label? }
  const [form, setForm]                 = useState({ category: "", label: "", value: "", value_type: "" });
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getCustomerData(customerId);
      setRecords(d.records || {});
      setTotal(d.total || 0);
      const cats = Object.keys(d.records || {});
      setExpanded(cats.reduce((a, c) => ({ ...a, [c]: true }), {}));
    } catch (err) {
      toast({ title: "Failed to load data records", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const toggleCategory = (cat) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.category.trim() || !form.label.trim()) return;
    setSaving(true);
    try {
      await addCustomerDataRecord(customerId, {
        category:   form.category.trim(),
        label:      form.label.trim(),
        value:      form.value.trim() || null,
        value_type: form.value_type.trim() || null,
      });
      toast({ title: "Record saved." });
      setForm({ category: "", label: "", value: "", value_type: "" });
      setShowAddForm(false);
      load();
    } catch (err) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === "category") {
        await deleteCustomerCategory(customerId, confirmDelete.category);
        toast({ title: `Category "${confirmDelete.category}" cleared.` });
      } else {
        await deleteCustomerRecord(customerId, confirmDelete.category, confirmDelete.label);
        toast({ title: "Record deleted." });
      }
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setConfirmDelete(null);
    }
  };

  const categories = Object.keys(records);

  return (
    <>
      <div className="rounded-2xl p-6" style={card}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
            <Database size={14} style={{ color: "#34D399" }} />
            Customer Data
            {total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: "rgba(52,211,153,0.1)", color: "#34D399" }}>
                {total} record{total !== 1 ? "s" : ""}
              </span>
            )}
          </h3>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: "rgba(52,211,153,0.1)", color: "#34D399", border: "1px solid rgba(52,211,153,0.15)" }}
          >
            <Plus size={12} /> Add Record
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="rounded-xl p-4 mb-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">New Record</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/30 mb-1">Category <span className="text-red-400">*</span></label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. portfolio, goals"
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm text-white/80 bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/30 mb-1">Label <span className="text-red-400">*</span></label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Account Balance"
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm text-white/80 bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-white/30 mb-1">Value</label>
                <input
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder="e.g. $245,000"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white/80 bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/30 mb-1">Type</label>
                <input
                  value={form.value_type}
                  onChange={(e) => setForm((f) => ({ ...f, value_type: e.target.value }))}
                  placeholder="currency / date / text"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white/80 bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/50">Cancel</button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: "rgba(52,211,153,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.2)" }}
              >
                {saving ? "Saving…" : "Save Record"}
              </button>
            </div>
          </form>
        )}

        {/* Records */}
        {loading ? (
          <div className="space-y-2">
            {[1,2].map((i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-white/20 italic">No data records yet.</p>
            <p className="text-xs text-white/15 mt-1">Add records manually above, or push data via the Data API.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Category header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggleCategory(cat)}
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="flex items-center gap-2">
                    {expanded[cat] ? <ChevronDown size={13} className="text-white/25" /> : <ChevronRight size={13} className="text-white/25" />}
                    <span className="text-[13px] font-semibold text-white/60 capitalize">{cat.replace(/_/g, " ")}</span>
                    <span className="text-[11px] text-white/25">{records[cat]?.length} record{records[cat]?.length !== 1 ? "s" : ""}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "category", category: cat }); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-all hover:opacity-80"
                    style={{ color: "rgba(248,113,113,0.6)", background: "rgba(239,68,68,0.05)" }}
                    title="Clear all records in this category"
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                </div>

                {/* Records */}
                {expanded[cat] && (
                  <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    {(records[cat] || []).map((rec, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 group hover:bg-white/[0.01]">
                        <div className="flex items-center gap-3 min-w-0">
                          <Tag size={11} className="shrink-0 text-white/20" />
                          <div className="min-w-0">
                            <span className="text-[13px] text-white/50 truncate">{rec.label}</span>
                            {rec.source && rec.source !== "portal" && (
                              <span className="ml-2 text-[10px] text-white/20">[{rec.source}]</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {rec.value != null && (
                            <span className="text-[13px] font-medium text-white/70">{rec.value}</span>
                          )}
                          <button
                            onClick={() => setConfirmDelete({ type: "record", category: cat, label: rec.label })}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10"
                            style={{ color: "rgba(248,113,113,0.5)" }}
                            title="Delete this record"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setConfirmDelete(null)}>
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4" style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                <Trash2 size={18} style={{ color: "#F87171" }} />
              </div>
              <h3 className="text-base font-semibold text-white/90">
                {confirmDelete.type === "category" ? `Clear "${confirmDelete.category}"?` : "Delete record?"}
              </h3>
            </div>
            <p className="text-sm text-white/30 mb-6">
              {confirmDelete.type === "category"
                ? `This will delete all ${records[confirmDelete.category]?.length || 0} records in the "${confirmDelete.category}" category.`
                : `This will permanently remove the "${confirmDelete.label}" record.`}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90" style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


const ExportCustomerCard = ({ customerId, customerName }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCustomerData(customerId, customerName);
      toast({ title: "Data export downloaded.", description: "The customer's full data package has been saved to your device." });
    } catch (err) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl p-6" style={{ background: "rgba(201,168,76,0.03)", border: "1px solid rgba(201,168,76,0.12)" }}>
      <h3 className="text-sm font-semibold text-white/70 mb-2 flex items-center gap-2">
        <Download size={14} style={{ color: "#C9A84C" }} /> Export Customer Data
      </h3>
      <p className="text-sm text-white/30 mb-4">
        Under GDPR Article 20 (Right to Data Portability) and CCPA, customers can request a copy of all personal data held about them. Export a complete JSON package including profile, memory, conversation summaries, and structured records.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.2)" }}
      >
        <Download size={14} />
        {exporting ? "Exporting…" : "Export customer data"}
      </button>
    </div>
  );
};


const DeleteCustomerCard = ({ customerId, navigate }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      toast({ title: "Customer data has been anonymised and removed." });
      navigate("/nomii/dashboard/customers");
    } catch (err) {
      toast({ title: "Deletion failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl p-6" style={{ background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.12)" }}>
        <h3 className="text-sm font-semibold text-white/70 mb-2 flex items-center gap-2">
          <Trash2 size={14} style={{ color: "#F87171" }} /> Delete Customer Data
        </h3>
        <p className="text-sm text-white/30 mb-4">
          If this customer has requested to be forgotten under GDPR or CCPA, you can anonymise and remove all their personal data here. <strong className="text-white/50">This cannot be undone.</strong>
        </p>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90"
          style={{ background: "rgba(239,68,68,0.15)", color: "#F87171", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          Delete customer data
        </button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => !deleting && setShowConfirm(false)}>
          <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={{ background: "#0F1A2E", border: "1px solid rgba(255,255,255,0.08)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.1)" }}>
                <AlertTriangle size={20} style={{ color: "#F87171" }} />
              </div>
              <h3 className="text-lg font-semibold text-white/90">Confirm data deletion</h3>
            </div>
            <p className="text-sm text-white/30 mb-6">
              This will permanently anonymise and remove all personal data for this customer, including their soul file, memory file, and conversation history. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}
              >
                {deleting ? "Deleting…" : "Yes, delete all data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NomiiCustomerDetail;
