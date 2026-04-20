import { useState, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, updateCompany, updatePrivacySettings, getProducts, addProduct, updateProduct, deleteProduct, getDataApiKey, generateDataApiKey, revokeDataApiKey, getAgentSoul, generateSoul, getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getLabels, createLabel, updateLabel, deleteLabel, getConnectors, updateConnectors, testSlack, testTeams, getEmailTemplates, updateEmailTemplates } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, Plus, Trash2, Pencil, X, ChevronUp, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Brain, Sparkles, Shield, MessageSquare, Webhook, ToggleLeft, ToggleRight, Send, ChevronDown, Tag, Plug2, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";

const INDUSTRIES = [
  { value: "financial", label: "Financial" },
  { value: "retirement", label: "Retirement" },
  { value: "ministry", label: "Ministry" },
  { value: "healthcare", label: "Healthcare" },
  { value: "insurance", label: "Insurance" },
  { value: "education", label: "Education" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Other" },
];

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" };
const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.3)]";
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" };

/* ---------- Company Profile ---------- */
const CompanyProfile = () => {
  const { setShenmayTenant, setShenmayUser } = useShenmayAuth();
  const [form, setForm] = useState({
    name: "", agent_name: "", chat_bubble_name: "", vertical: "", primary_color: "#1E3A5F",
    website_url: "", company_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    getMe()
      .then((data) => {
        const t = data.tenant || {};
        if (data.admin) setShenmayUser(data.admin);
        if (data.tenant) setShenmayTenant(data.tenant);
        setForm({
          name: t.name || "",
          agent_name: t.agent_name || "",
          chat_bubble_name: t.chat_bubble_name || "",
          vertical: t.vertical || "",
          primary_color: t.primary_color || "#1E3A5F",
          website_url: t.website_url || "",
          company_description: t.company_description || t.description || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoadingMe(false));
  }, []);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateCompany(form);
      setShenmayTenant((t) => ({ ...t, ...form, ...(res.tenant || {}) }));
      setSaved(true);
      toast({ title: "Settings saved" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingMe) {
    return (
      <div className="rounded-2xl p-6 animate-pulse space-y-4" style={card}>
        <div className="h-4 w-32 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />)}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-white/70">Company Profile</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Company Name</label>
          <input type="text" required value={form.name} onChange={set("name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Agent Name</label>
          <input type="text" value={form.agent_name} onChange={set("agent_name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Chat Bubble Label</label>
          <input type="text" value={form.chat_bubble_name} onChange={set("chat_bubble_name")} placeholder="e.g. Chat with Steve" className={inputClass} style={inputStyle} />
          <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>Text shown on the floating chat button. Defaults to "Chat with [Agent Name]" if blank.</p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Industry</label>
          <select value={form.vertical} onChange={set("vertical")} className={inputClass + " cursor-pointer"} style={{ ...inputStyle, colorScheme: "dark" }}>
            <option value="" style={{ background: "#1a2235", color: "rgba(255,255,255,0.5)" }}>Select…</option>
            {INDUSTRIES.map((v) => <option key={v.value} value={v.value} style={{ background: "#1a2235", color: "rgba(255,255,255,0.8)" }}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Website URL</label>
          <input type="url" value={form.website_url} onChange={set("website_url")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Primary Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.primary_color} onChange={set("primary_color")} className="w-10 h-9 rounded-lg cursor-pointer p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <input type="text" value={form.primary_color} onChange={set("primary_color")} maxLength={7} className={inputClass + " flex-1"} style={inputStyle} />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-white/30 mb-1.5">Company Description</label>
        <textarea rows={3} value={form.company_description} onChange={set("company_description")} className={inputClass} style={inputStyle} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#4ADE80" }}>
            <Check size={14} /> Saved ✓
          </span>
        )}
      </div>
    </form>
  );
};

/* ---------- Widget ---------- */
const WidgetSection = () => {
  const { shenmayTenant } = useShenmayAuth();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const widgetKey = shenmayTenant?.widget_key || "";
  const apiOrigin = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
    : window.location.origin;
  const snippet = `<script\n  src="${apiOrigin}/embed.js"\n  data-widget-key="${widgetKey}"\n  data-user-email="LOGGED_IN_USER_EMAIL"\n  data-user-name="LOGGED_IN_USER_NAME"\n  async>\n</script>`;

  const copy = (text, setter) => {
    copyToClipboard(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-white/70">Widget</h3>
      <div>
        <label className="block text-[12px] font-medium text-white/30 mb-1.5">Your Widget Key</label>
        <div className="flex gap-2">
          <input type="text" readOnly value={widgetKey} className={inputClass + " flex-1 font-mono text-xs"} style={inputStyle} />
          <button onClick={() => copy(widgetKey, setCopiedKey)} className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
            {copiedKey ? <><Check size={14} style={{ color: "#4ADE80" }} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-white/30 mb-1.5">Verification Status</label>
        {shenmayTenant?.widget_verified ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ADE80" }}>
            <Check size={12} /> Connected
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#FBBF24" }}>Not yet detected</span>
            <Link to="/nomii/onboarding" className="text-xs font-medium hover:underline" style={{ color: "#C9A84C" }}>→ Installation guide</Link>
          </div>
        )}
      </div>
      <div>
        <label className="block text-[12px] font-medium text-white/30 mb-1.5">Embed Snippet</label>
        <div className="relative">
          <pre className="p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{snippet}</pre>
          <button onClick={() => copy(snippet, setCopiedSnippet)} className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            {copiedSnippet ? <><Check size={12} style={{ color: "#4ADE80" }} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Products ---------- */
const ProductsSection = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "", price_info: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data.products || data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setEdit = (field) => (e) => setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addProduct({ ...form, name: form.name.trim() });
      setForm({ name: "", description: "", category: "", price_info: "", notes: "" });
      setShowForm(false);
      toast({ title: "Product added!" });
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p._id || p.id);
    setEditForm({ name: p.name || "", description: p.description || "", category: p.category || "", price_info: p.price_info || "", notes: p.notes || "" });
  };

  const cancelEdit = () => { setEditingId(null); };

  const handleEditSave = async () => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    try {
      await updateProduct(editingId, editForm);
      toast({ title: "Product updated!" });
      cancelEdit();
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id);
      toast({ title: "Product deleted." });
      await fetchProducts();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70">Products & Services</h3>
        <button onClick={() => { setShowForm((v) => !v); cancelEdit(); }} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          {showForm ? <><ChevronUp className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> Add Product</>}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <label className="block text-[12px] font-medium text-white/30 mb-1.5">Name *</label>
            <input type="text" required maxLength={200} value={form.name} onChange={set("name")} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-white/30 mb-1.5">Description</label>
            <textarea rows={2} maxLength={1000} value={form.description} onChange={set("description")} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-white/30 mb-1.5">Category</label>
              <input type="text" maxLength={100} value={form.category} onChange={set("category")} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-white/30 mb-1.5">Price Info</label>
              <input type="text" maxLength={100} value={form.price_info} onChange={set("price_info")} className={inputClass} style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
            {saving ? "Saving…" : "Save Product"}
          </button>
        </form>
      )}

      {/* Product cards */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />)}
        </div>
      ) : products.length === 0 ? (
        <p className="text-sm text-white/25 py-4">No products yet. Add one above.</p>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const pid = p._id || p.id;
            const isEditing = editingId === pid;

            if (isEditing) {
              return (
                <div key={pid} className="rounded-xl p-5 space-y-3" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.15)" }}>
                  <div>
                    <label className="block text-[12px] font-medium text-white/30 mb-1">Name *</label>
                    <input type="text" required value={editForm.name} onChange={setEdit("name")} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-white/30 mb-1">Description</label>
                    <textarea rows={2} value={editForm.description} onChange={setEdit("description")} className={inputClass} style={inputStyle} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-white/30 mb-1">Category</label>
                      <input type="text" value={editForm.category} onChange={setEdit("category")} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-white/30 mb-1">Price Info</label>
                      <input type="text" value={editForm.price_info} onChange={setEdit("price_info")} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={handleEditSave} disabled={editSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
                      {editSaving ? "Saving…" : <><Check size={14} /> Save</>}
                    </button>
                    <button onClick={cancelEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={pid} className="rounded-xl p-4 flex items-start gap-4 transition-colors hover:bg-white/[0.01]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-white/70">{p.name}</p>
                    {p.category && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.1)", color: "#C9A84C" }}>{p.category}</span>
                    )}
                  </div>
                  {p.description && <p className="text-[12px] text-white/30 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04]" style={{ color: "rgba(255,255,255,0.35)" }} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(pid)} className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04]" style={{ color: "#F87171" }} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ---------- Agent Soul ---------- */
const AgentSoulSection = () => {
  const [soul, setSoul]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getAgentSoul();
      setSoul(d.soul || null);
    } catch (err) {
      toast({ title: "Failed to load soul", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const d = await generateSoul();
      setSoul(d.soul || null);
      toast({ title: "Agent soul generated!", description: "Your AI agent's identity has been refreshed." });
    } catch (err) {
      toast({ title: "Failed to generate soul", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-2xl p-6" style={card}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2 mb-1">
            <Brain size={14} style={{ color: "#C9A84C" }} /> Agent Soul
          </h3>
          <p className="text-[12px] text-white/30">
            Your agent's identity, tone, and communication style — auto-generated from your company profile.
            Regenerate any time after updating your profile.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80 shrink-0 ml-4 disabled:opacity-50"
          style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.2)" }}
        >
          <Sparkles size={12} />
          {generating ? "Generating…" : soul ? "Regenerate" : "Generate Soul"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />)}
        </div>
      ) : !soul ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "rgba(201,168,76,0.04)", border: "1px dashed rgba(201,168,76,0.15)" }}>
          <p className="text-sm text-white/30 mb-1">No soul generated yet.</p>
          <p className="text-xs text-white/20">Click <strong className="text-white/30">Generate Soul</strong> to create your agent's identity from your company profile.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Identity */}
          {soul.base_identity && (
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Brain size={10} /> Identity
              </p>
              <div className="space-y-1.5">
                <div className="flex gap-3 text-sm">
                  <span className="text-white/25 w-24 shrink-0">Agent Name</span>
                  <span className="text-white/70 font-medium">{soul.base_identity.agent_name}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-white/25 w-24 shrink-0">Organisation</span>
                  <span className="text-white/70">{soul.base_identity.organization}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-white/25 w-24 shrink-0">Tone</span>
                  <span className="text-white/70 italic">{soul.base_identity.tone_description}</span>
                </div>
                {soul.base_identity.role && (
                  <div className="flex gap-3 text-sm">
                    <span className="text-white/25 w-24 shrink-0">Role</span>
                    <span className="text-white/50 text-xs leading-relaxed">{soul.base_identity.role}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Communication style */}
          {soul.communication_style?.key_principles?.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare size={10} /> Communication Principles
              </p>
              <ul className="space-y-1.5">
                {soul.communication_style.key_principles.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/50">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "rgba(201,168,76,0.4)" }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Compliance */}
          {soul.compliance?.disclaimer && (
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield size={10} /> Compliance
              </p>
              <p className="text-[13px] text-white/40 leading-relaxed">{soul.compliance.disclaimer}</p>
              {soul.compliance.restricted_topics?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {soul.compliance.restricted_topics.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: "rgba(239,68,68,0.08)", color: "rgba(248,113,113,0.6)", border: "1px solid rgba(239,68,68,0.1)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {soul.generated_at && (
            <p className="text-[11px] text-white/15 text-right">
              Last generated {new Date(soul.generated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};


/* ---------- Data API ---------- */
const DataApiSection = () => {
  const [keyInfo, setKeyInfo]     = useState(null);   // { has_key, prefix }
  const [loading, setLoading]     = useState(true);
  const [newKey, setNewKey]       = useState(null);   // shown ONCE after generation
  const [showKey, setShowKey]     = useState(false);
  const [copied, setCopied]       = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking]   = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = async () => {
    try { setKeyInfo(await getDataApiKey()); }
    catch { /* not critical */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setNewKey(null);
    try {
      const res = await generateDataApiKey();
      setNewKey(res.key);
      setShowKey(true);
      await load();
      toast({ title: "Data API key generated", description: "Copy it now — it won't be shown again." });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await revokeDataApiKey();
      setKeyInfo({ has_key: false, prefix: null });
      setNewKey(null);
      setConfirmRevoke(false);
      toast({ title: "API key revoked", description: "Any integrations using it have stopped working." });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setRevoking(false); }
  };

  const copy = (text, setter) => {
    copyToClipboard(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const exampleSnippet = `curl -X POST https://api.pontensolutions.com/api/v1/customers \\
  -H "Authorization: Bearer YOUR_DATA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "external_id": "client-123",
    "name": "Jane Smith",
    "email": "jane@example.com"
  }'

# Push data records for that client:
curl -X POST https://api.pontensolutions.com/api/v1/customers/client-123/records \\
  -H "Authorization: Bearer YOUR_DATA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "records": [
      { "category": "portfolio", "label": "Total Value", "value": "450000" },
      { "category": "goals",     "label": "Retirement Target", "value": "1200000" }
    ]
  }'`;

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center gap-3">
        <Key size={16} style={{ color: "#A78BFA" }} />
        <h3 className="text-sm font-semibold text-white/70">Data API</h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          For developers
        </span>
      </div>

      <p className="text-[13px] text-white/40 leading-relaxed">
        Push customer data directly from your own system — no file uploads needed.
        Your data stays in your CRM; Shenmay reads it at query time. Use this if your
        company's IT team wants to automate the data sync.
      </p>

      {/* Three-model explainer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: "📤", label: "CSV Upload", desc: "Upload a spreadsheet from your computer. Good for manual one-time imports.", nav: "/nomii/dashboard/customers", navLabel: "Go to Customers" },
          { icon: "🔌", label: "Data API", desc: "Push data programmatically. Set it up once; it syncs automatically.", active: true },
          { icon: "🔗", label: "Live Connector", desc: "Shenmay calls your system in real time. Data never leaves your servers.", nav: "/nomii/dashboard/tools", navLabel: "Set up in Tools →" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl p-4" style={{ background: m.active ? "rgba(167,139,250,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${m.active ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)"}` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{m.icon}</span>
              <span className="text-[12px] font-semibold text-white/70">{m.label}</span>
              {m.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA" }}>You are here</span>}
            </div>
            <p className="text-[11px] text-white/30 leading-relaxed">{m.desc}</p>
            {m.nav && <Link to={m.nav} className="text-[11px] font-medium mt-2 inline-block hover:underline" style={{ color: "#C9A84C" }}>{m.navLabel}</Link>}
          </div>
        ))}
      </div>

      {/* Key status */}
      {loading ? (
        <div className="h-10 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[12px] font-medium text-white/30 mb-1">API Key Status</p>
              {keyInfo?.has_key ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ADE80" }}>
                    <Check size={11} /> Active
                  </span>
                  <span className="text-[12px] font-mono text-white/30">{keyInfo.prefix}</span>
                </div>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}>
                  No key generated
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
              >
                <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
                {keyInfo?.has_key ? "Rotate Key" : "Generate Key"}
              </button>
              {keyInfo?.has_key && !confirmRevoke && (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{ border: "1px solid rgba(248,113,113,0.3)", color: "#F87171" }}
                >
                  <Trash2 size={13} /> Revoke
                </button>
              )}
              {confirmRevoke && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-white/40">Confirm revoke?</span>
                  <button onClick={handleRevoke} disabled={revoking} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "rgba(248,113,113,0.15)", color: "#F87171" }}>
                    {revoking ? "Revoking…" : "Yes, revoke"}
                  </button>
                  <button onClick={() => setConfirmRevoke(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white/60">Cancel</button>
                </div>
              )}
            </div>
          </div>

          {/* New key — shown once */}
          {newKey && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.25)" }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} style={{ color: "#FBBF24" }} />
                <p className="text-[12px] font-semibold" style={{ color: "#FBBF24" }}>Copy this key now — it won't be shown again</p>
              </div>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  readOnly
                  value={newKey}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
                />
                <button onClick={() => setShowKey(v => !v)} className="px-2.5 py-2 rounded-xl transition-colors" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={() => copy(newKey, setCopied)} className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  {copied ? <><Check size={13} style={{ color: "#4ADE80" }} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Code snippet */}
      <div>
        <p className="text-[12px] font-medium text-white/30 mb-2">Example API calls</p>
        <div className="relative">
          <pre className="p-4 rounded-xl text-[11px] font-mono overflow-x-auto whitespace-pre" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", lineHeight: "1.6" }}>{exampleSnippet}</pre>
          <button onClick={() => copy(exampleSnippet, setCopiedSnippet)} className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
            {copiedSnippet ? <><Check size={11} style={{ color: "#4ADE80" }} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
        <p className="text-[11px] mt-2 text-white/20">Full API reference: <a href="https://github.com/jafools/nomii-ai/blob/main/docs/DATA-API.md" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#C9A84C" }}>github.com/jafools/nomii-ai/docs/DATA-API.md</a></p>
      </div>
    </div>
  );
};

/* ---------- Webhooks ---------- */
const ALL_EVENTS = [
  { value: "session.started",  label: "Session started" },
  { value: "session.ended",    label: "Session ended" },
  { value: "customer.created", label: "Customer created" },
  { value: "flag.created",     label: "Flag created" },
  { value: "concern.raised",   label: "Concern raised" },
];

const WebhooksSection = () => {
  const [hooks, setHooks]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState({ label: "", url: "", event_types: ["flag.created", "concern.raised"] });
  const [saving, setSaving]           = useState(false);
  const [newSecret, setNewSecret]     = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editForm, setEditForm]       = useState({});
  const [editSaving, setEditSaving]   = useState(false);
  const [testing, setTesting]         = useState({});
  const [deleting, setDeleting]       = useState({});
  const [toggling, setToggling]       = useState({});

  const load = async () => {
    try {
      const data = await getWebhooks();
      setHooks(data.webhooks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleEvent = (arr, val) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.url.trim()) return;
    if (form.event_types.length === 0) {
      toast({ title: "Select at least one event", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const data = await createWebhook(form);
      setNewSecret(data.secret);
      setShowForm(false);
      setForm({ label: "", url: "", event_types: ["flag.created", "concern.raised"] });
      toast({ title: "Webhook registered" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (h) => {
    setEditingId(h.id);
    setEditForm({ label: h.label || "", url: h.url || "", event_types: h.event_types || [] });
  };

  const handleEditSave = async () => {
    if (!editForm.url.trim()) return;
    if (editForm.event_types.length === 0) {
      toast({ title: "Select at least one event", variant: "destructive" }); return;
    }
    setEditSaving(true);
    try {
      await updateWebhook(editingId, editForm);
      setEditingId(null);
      toast({ title: "Webhook updated" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggle = async (h) => {
    setToggling(t => ({ ...t, [h.id]: true }));
    try {
      await updateWebhook(h.id, { enabled: !h.enabled });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setToggling(t => ({ ...t, [h.id]: false }));
    }
  };

  const handleDelete = async (id) => {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      await deleteWebhook(id);
      toast({ title: "Webhook removed" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(d => ({ ...d, [id]: false }));
    }
  };

  const handleTest = async (id) => {
    setTesting(t => ({ ...t, [id]: true }));
    try {
      await testWebhook(id);
      toast({ title: "Test ping sent", description: "Check your endpoint for the test.ping event." });
    } catch (err) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(t => ({ ...t, [id]: false }));
    }
  };

  const copySecret = () => {
    copyToClipboard(newSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const relativeTime = (ts) => {
    if (!ts) return null;
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/70">Webhooks</h3>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            Receive signed POST requests when events occur in your account.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setNewSecret(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
          >
            <Plus size={13} /> Add webhook
          </button>
        )}
      </div>

      {/* One-time secret reveal */}
      {newSecret && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.25)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: "#FBBF24" }} />
            <p className="text-[12px] font-semibold" style={{ color: "#FBBF24" }}>
              Copy your signing secret now — it won't be shown again
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={newSecret}
              className="flex-1 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
            />
            <button
              onClick={copySecret}
              className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            >
              {copiedSecret ? <><Check size={13} style={{ color: "#4ADE80" }} /> Copied</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            Verify the <code style={{ color: "rgba(255,255,255,0.4)" }}>X-Nomii-Signature</code> header on incoming requests using HMAC-SHA256.
          </p>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[12px] font-semibold text-white/60">New webhook</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-white/30 mb-1">Label</label>
              <input
                type="text"
                placeholder="e.g. Slack alerts"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-white/30 mb-1">Endpoint URL <span style={{ color: "#C9A84C" }}>*</span></label>
              <input
                type="url"
                placeholder="https://your-server.com/hooks/nomii"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-white/30 mb-2">Events to send</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map(ev => {
                const on = form.event_types.includes(ev.value);
                return (
                  <button
                    key={ev.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, event_types: toggleEvent(f.event_types, ev.value) }))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      background: on ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${on ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color: on ? "#C9A84C" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {ev.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}
            >
              {saving ? "Saving…" : "Create webhook"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
          ))}
        </div>
      ) : hooks.length === 0 ? (
        <div className="py-8 text-center">
          <Webhook size={28} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.1)" }} />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>No webhooks yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hooks.map(h => (
            <div key={h.id} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {editingId === h.id ? (
                /* inline edit form */
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-white/30 mb-1">Label</label>
                      <input type="text" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-white/30 mb-1">Endpoint URL</label>
                      <input type="url" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/30 mb-2">Events</label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_EVENTS.map(ev => {
                        const on = editForm.event_types?.includes(ev.value);
                        return (
                          <button
                            key={ev.value}
                            type="button"
                            onClick={() => setEditForm(f => ({ ...f, event_types: toggleEvent(f.event_types || [], ev.value) }))}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all"
                            style={{
                              background: on ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${on ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.08)"}`,
                              color: on ? "#C9A84C" : "rgba(255,255,255,0.35)",
                            }}
                          >
                            {ev.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleEditSave} disabled={editSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* read view */
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-white/80 truncate">{h.label}</span>
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={h.enabled
                            ? { background: "rgba(34,197,94,0.1)", color: "#4ADE80" }
                            : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" }}
                        >
                          {h.enabled ? "Active" : "Paused"}
                        </span>
                        {h.consecutive_failures >= 3 && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: "#F87171" }}>
                            {h.consecutive_failures} failures
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{h.url}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(h.event_types || []).map(ev => (
                          <span key={ev} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(201,168,76,0.08)", color: "rgba(201,168,76,0.6)", border: "1px solid rgba(201,168,76,0.15)" }}>
                            {ev}
                          </span>
                        ))}
                      </div>
                      {h.last_triggered_at && (
                        <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                          Last triggered {relativeTime(h.last_triggered_at)}
                          {h.last_success_at && ` · Success ${relativeTime(h.last_success_at)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggle(h)}
                        disabled={toggling[h.id]}
                        title={h.enabled ? "Pause" : "Enable"}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
                        style={{ color: h.enabled ? "#4ADE80" : "rgba(255,255,255,0.3)" }}
                      >
                        {h.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        onClick={() => handleTest(h.id)}
                        disabled={testing[h.id] || !h.enabled}
                        title="Send test ping"
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        <Send size={13} />
                      </button>
                      <button
                        onClick={() => startEdit(h)}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(h.id)}
                        disabled={deleting[h.id]}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
                        style={{ color: "rgba(239,68,68,0.5)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
          All payloads are signed with HMAC-SHA256. Verify using the <code style={{ color: "rgba(255,255,255,0.35)" }}>X-Nomii-Signature</code> header.
          Endpoints must respond within 10 seconds. One automatic retry after 3s on failure.
        </p>
      </div>
    </div>
  );
};

/* ---------- Labels Section ---------- */
const PRESET_COLORS = [
  "#C9A84C", "#4ADE80", "#60A5FA", "#F87171", "#A78BFA",
  "#FB923C", "#34D399", "#F472B6", "#94A3B8", "#FBBF24",
];

const LabelsSection = () => {
  const [labels, setLabels]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [editing, setEditing]   = useState(null);  // label id or 'new'
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);

  const load = async () => {
    try {
      const d = await getLabels();
      setLabels(d.labels || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setFormName(""); setFormColor(PRESET_COLORS[0]); setEditing("new");
  };
  const openEdit = (l) => {
    setFormName(l.name); setFormColor(l.color); setEditing(l.id);
  };
  const cancel = () => setEditing(null);

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editing === "new") {
        await createLabel({ name: formName.trim(), color: formColor });
      } else {
        await updateLabel(editing, { name: formName.trim(), color: formColor });
      }
      await load();
      setEditing(null);
    } catch (err) {
      toast({ title: "Error", description: err.message || "Failed to save label", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this label? It will be removed from all conversations.")) return;
    try {
      await deleteLabel(id);
      setLabels(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      toast({ title: "Error", description: err.message || "Failed to delete label", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-2xl p-6 space-y-5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag size={16} style={{ color: "#C9A84C" }} />
          <div>
            <h3 className="text-[14px] font-semibold text-white/80">Conversation Labels</h3>
            <p className="text-[11px] text-white/30 mt-0.5">Tag conversations to organise and filter them.</p>
          </div>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.20)" }}>
          <Plus size={13} /> New Label
        </button>
      </div>

      {/* New / edit form */}
      {editing && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex gap-3">
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              maxLength={50}
              placeholder="Label name…"
              className="flex-1 px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)" }}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              autoFocus
            />
            {/* Color preview */}
            <div className="w-9 h-9 rounded-lg shrink-0" style={{ background: formColor, border: "2px solid rgba(255,255,255,0.15)" }} />
          </div>
          {/* Color presets */}
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setFormColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{ background: c, outline: formColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className="px-3 py-1.5 rounded-lg text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={!formName.trim() || saving}
              className="px-4 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50 transition-opacity hover:opacity-80"
              style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
              {saving ? "Saving…" : editing === "new" ? "Create" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Labels list */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />)}
        </div>
      ) : labels.length === 0 && !editing ? (
        <div className="text-center py-8">
          <Tag size={28} className="mx-auto mb-2" style={{ color: "rgba(255,255,255,0.08)" }} />
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.20)" }}>No labels yet. Create one to start tagging conversations.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {labels.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl group"
              style={{ background: "rgba(255,255,255,0.025)" }}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
              <span className="flex-1 text-[13px]" style={{ color: "rgba(255,255,255,0.70)" }}>{l.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(l)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: "rgba(255,255,255,0.30)" }}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => handleDelete(l.id)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: "#F87171" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------- Connectors Section ---------- */
const CONNECTOR_EVENTS = [
  { value: "conversation.started",   label: "New conversation started"  },
  { value: "conversation.escalated", label: "Conversation escalated"    },
  { value: "handoff.requested",      label: "Human support requested"   },
  { value: "human.takeover",         label: "Advisor took over"         },
  { value: "human.handback",         label: "Handed back to AI"         },
  { value: "csat.received",          label: "CSAT rating received"      },
];

const ConnectorsSection = () => {
  const [tab,        setTab]        = useState("slack");
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [slackUrl,    setSlackUrl]    = useState("");
  const [teamsUrl,    setTeamsUrl]    = useState("");
  const [slackEvents, setSlackEvents] = useState([]);
  const [teamsEvents, setTeamsEvents] = useState([]);
  const [showSlackUrl, setShowSlackUrl] = useState(false);
  const [showTeamsUrl, setShowTeamsUrl] = useState(false);

  useEffect(() => {
    getConnectors()
      .then(d => {
        const c = d.connectors || {};
        setSlackUrl(c.slack_webhook_url || "");
        setTeamsUrl(c.teams_webhook_url || "");
        setSlackEvents(c.slack_notify_events || []);
        setTeamsEvents(c.teams_notify_events || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleEvent = (setList, val) => {
    setList(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]);
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      await updateConnectors({
        slack_webhook_url:   slackUrl || null,
        teams_webhook_url:   teamsUrl || null,
        slack_notify_events: slackEvents,
        teams_notify_events: teamsEvents,
      });
      toast({ title: "Connectors saved" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (tab === "slack") await testSlack();
      if (tab === "teams") await testTeams();
      setTestResult({ ok: true, message: "Test message sent successfully!" });
    } catch (err) {
      setTestResult({ ok: false, message: err.message || "Delivery failed — check your webhook URL." });
    } finally { setTesting(false); }
  };

  const tabs = [
    { id: "slack",  label: "Slack"             },
    { id: "teams",  label: "Microsoft Teams"   },
    { id: "zapier", label: "Zapier"            },
  ];

  const isSlack   = tab === "slack";
  const isTeams   = tab === "teams";
  const isZapier  = tab === "zapier";
  const currentUrl    = isSlack ? slackUrl    : teamsUrl;
  const setCurrentUrl = isSlack ? setSlackUrl : setTeamsUrl;
  const currentEvents    = isSlack ? slackEvents    : teamsEvents;
  const setCurrentEvents = isSlack ? setSlackEvents : setTeamsEvents;
  const showUrl    = isSlack ? showSlackUrl    : showTeamsUrl;
  const setShowUrl = isSlack ? setShowSlackUrl : setShowTeamsUrl;

  return (
    <div className="rounded-2xl p-6 space-y-5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>

      {/* Header */}
      <div className="flex items-center gap-2">
        <Plug2 size={16} style={{ color: "#C9A84C" }} />
        <div>
          <h3 className="text-[14px] font-semibold text-white/80">Connectors</h3>
          <p className="text-[11px] text-white/30 mt-0.5">Send real-time alerts to Slack, Teams, or Zapier when key events occur.</p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setTestResult(null); }}
            className="flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-all"
            style={tab === t.id
              ? { background: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.20)" }
              : { color: "rgba(255,255,255,0.35)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="h-32 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }} />
        </div>

      ) : isZapier ? (
        /* ── Zapier tab ──────────────────────────────────────────── */
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-2"
            style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.15)" }}>
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: "#FB923C" }} />
              <span className="text-[13px] font-semibold" style={{ color: "#FB923C" }}>Zapier-ready Webhooks</span>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
              Shenmay AI fires outgoing webhooks on every key conversation event. Connect Zapier by creating a <strong className="text-white/60">Webhooks by Zapier</strong> trigger, then paste the Zapier URL into your Shenmay webhook settings below.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.22)" }}>Supported events</p>
            <div className="grid grid-cols-2 gap-2">
              {CONNECTOR_EVENTS.map(ev => (
                <div key={ev.value} className="flex items-start gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ background: "#C9A84C" }} />
                  <div>
                    <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.50)" }}>{ev.value}</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{ev.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-[12px] font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>How to connect</p>
            <ol className="space-y-2 text-[12px]" style={{ color: "rgba(255,255,255,0.38)" }}>
              <li className="flex gap-2.5">
                <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>1.</span>
                In Zapier, create a new Zap and choose <strong className="text-white/55">Webhooks by Zapier</strong> as the trigger.
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>2.</span>
                Select <strong className="text-white/55">Catch Hook</strong> and copy your unique Zapier webhook URL.
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>3.</span>
                Go to <strong className="text-white/55">Settings → Webhooks</strong> and add a new webhook with that URL and the events you need.
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold shrink-0" style={{ color: "#C9A84C" }}>4.</span>
                Trigger any event in Shenmay to let Zapier detect the payload structure, then build your Zap actions.
              </li>
            </ol>
          </div>
        </div>

      ) : (
        /* ── Slack / Teams tab ───────────────────────────────────── */
        <div className="space-y-5">

          {/* Webhook URL field */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.42)" }}>
              {isSlack ? "Slack Incoming Webhook URL" : "Teams Incoming Webhook URL"}
            </label>
            <div className="relative">
              <input
                type={showUrl ? "text" : "password"}
                value={currentUrl}
                onChange={e => { setCurrentUrl(e.target.value); setTestResult(null); }}
                placeholder={isSlack
                  ? "https://hooks.slack.com/services/…"
                  : "https://outlook.office.com/webhook/…"}
                className="w-full px-3 py-2.5 pr-10 rounded-xl text-[13px] outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.78)" }}
              />
              <button onClick={() => setShowUrl(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                {showUrl ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.22)" }}>
              {isSlack
                ? "Create an incoming webhook at api.slack.com/apps → your app → Incoming Webhooks."
                : "Add a connector in Teams: open the channel → Connectors → Incoming Webhook → Configure."}
            </p>
          </div>

          {/* Events */}
          <div className="space-y-2">
            <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.42)" }}>Notify on</p>
            <div className="grid grid-cols-2 gap-2">
              {CONNECTOR_EVENTS.map(ev => {
                const on = currentEvents.includes(ev.value);
                return (
                  <button key={ev.value}
                    onClick={() => toggleEvent(setCurrentEvents, ev.value)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                    style={on
                      ? { background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.22)", color: "#C9A84C" }
                      : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.32)" }}>
                    <div className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: on ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${on ? "rgba(201,168,76,0.45)" : "rgba(255,255,255,0.09)"}`,
                      }}>
                      {on && <Check size={9} strokeWidth={3} />}
                    </div>
                    <span className="text-[12px] leading-tight">{ev.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test result banner */}
          {testResult && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px]"
              style={testResult.ok
                ? { background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.18)", color: "#4ADE80" }
                : { background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.18)", color: "#F87171" }}>
              {testResult.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleTest}
              disabled={testing || !currentUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }}>
              <Send size={12} />
              {testing ? "Sending…" : "Send test message"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Email Templates ---------- */
const EmailTemplatesSection = () => {
  const [form, setForm] = useState({ email_from_name: "", email_reply_to: "", email_footer: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getEmailTemplates()
      .then((data) => setForm({
        email_from_name: data.email_from_name || "",
        email_reply_to:  data.email_reply_to  || "",
        email_footer:    data.email_footer     || "",
      }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateEmailTemplates(form);
      setSaved(true);
      toast({ title: "Email settings saved" });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="rounded-2xl p-6 animate-pulse space-y-4" style={card}>
        <div className="h-4 w-40 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />)}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center gap-2">
        <Mail size={16} style={{ color: "#C9A84C" }} />
        <div>
          <h3 className="text-[14px] font-semibold text-white/80">Email Templates</h3>
          <p className="text-[11px] text-white/30 mt-0.5">Customize the sender name, reply-to address, and footer on emails sent to your team and customers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">From Name</label>
          <input type="text" value={form.email_from_name} onChange={set("email_from_name")} maxLength={100}
            placeholder="e.g. Acme Co Support" className={inputClass} style={inputStyle} />
          <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            Appears as the sender name. Defaults to "Shenmay AI" if blank.
          </p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-white/30 mb-1.5">Reply-To Address</label>
          <input type="email" value={form.email_reply_to} onChange={set("email_reply_to")} maxLength={255}
            placeholder="e.g. support@yourcompany.com" className={inputClass} style={inputStyle} />
          <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            When recipients hit "Reply", their email goes to this address.
          </p>
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-white/30 mb-1.5">Email Footer</label>
        <textarea rows={2} value={form.email_footer} onChange={set("email_footer")} maxLength={500}
          placeholder="e.g. Acme Co · 123 Main St, Suite 400 · Springfield, IL 62701"
          className={inputClass} style={inputStyle} />
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
          Added at the bottom of all emails. Useful for compliance or branding.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #C9A84C, #B8943F)", color: "#0B1222" }}>
          {saving ? "Saving…" : "Save email settings"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#4ADE80" }}>
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </form>
  );
};

/* ---------- Privacy (owner-only) ---------- */
// PII tokenization is the safety control that rewrites SSNs, cards, emails,
// phones, and other regulated identifiers into opaque tokens before any
// outbound Anthropic call (chat, CSV import, AI product extraction). Default
// ON for every tenant. Only the original onboarding owner can disable it —
// the backend enforces this with a 403 for member/agent roles, and we hide
// the section client-side so other team members never see the option at all.
const PrivacySection = () => {
  const [loading, setLoading] = useState(true);
  const [role, setRole]       = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    getMe()
      .then((data) => {
        setRole(data.admin?.role || null);
        setEnabled(data.tenant?.pii_tokenization_enabled !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Hide the whole section for non-owners. Server still enforces — this is UX.
  if (loading || role !== 'owner') return null;

  const onToggle = async (next) => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await updatePrivacySettings(next);
      setEnabled(r.pii_tokenization_enabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast({
        title: 'Could not update privacy setting',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={card}>
      <div className="flex items-center gap-2 mb-1">
        <Shield size={16} style={{ color: 'rgba(201,168,76,0.85)' }} />
        <h3 className="text-base font-semibold text-white/85">Privacy &amp; PII Protection</h3>
      </div>
      <p className="text-xs text-white/40 mb-4">
        Owner-only. Controls whether regulated personal identifiers are tokenized before reaching Anthropic.
      </p>

      <div className="flex items-start justify-between gap-4 p-4 rounded-xl"
           style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/80 mb-1">Tokenize PII before sending to Anthropic</div>
          <p className="text-xs text-white/50 leading-relaxed">
            When ON, SSNs, payment cards, IBANs, emails, phone numbers, dates of birth, postcodes, and
            account numbers are replaced with opaque placeholders (<code style={{ color: 'rgba(201,168,76,0.85)' }}>[SSN_1]</code>,
            <code style={{ color: 'rgba(201,168,76,0.85)' }}> [EMAIL_1]</code>, …) before every outbound Claude call. A second-pass
            breach detector blocks any request that still contains unredacted PII. Disable only if you have a
            specific compliance reason — most tenants should leave this ON.
          </p>
          {!enabled && (
            <div className="mt-3 flex items-start gap-2 text-xs p-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                Tokenization is OFF. Customer SSNs, cards, and other regulated identifiers will be sent to
                Anthropic in the clear. This change is recorded in your audit log.
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!enabled)}
          className="flex-shrink-0 transition-opacity hover:opacity-80 disabled:opacity-50"
          aria-label={enabled ? 'Disable PII tokenization' : 'Enable PII tokenization'}
          style={{ color: enabled ? '#4ADE80' : 'rgba(255,255,255,0.4)' }}
        >
          {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
        </button>
      </div>

      {saved && (
        <div className="mt-3 flex items-center gap-1.5 text-sm font-medium" style={{ color: '#4ADE80' }}>
          <Check size={14} /> Saved
        </div>
      )}
    </section>
  );
};


/* ---------- Main ---------- */
const ShenmaySettings = () => (
  <div className="space-y-6">
    <div className="mb-2">
      <h2 className="text-xl font-bold text-white/90 mb-1">Settings</h2>
      <p className="text-sm text-white/30">Manage your company profile, widget, and products.</p>
    </div>
    <CompanyProfile />
    <AgentSoulSection />
    <WidgetSection />
    <EmailTemplatesSection />
    <WebhooksSection />
    <DataApiSection />
    <ProductsSection />
    <LabelsSection />
    <ConnectorsSection />
    <PrivacySection />
  </div>
);

export default ShenmaySettings;
