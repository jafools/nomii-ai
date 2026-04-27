import { useState, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, updateCompany, updatePrivacySettings, updateAnonymousOnlyMode, getProducts, addProduct, updateProduct, deleteProduct, getDataApiKey, generateDataApiKey, revokeDataApiKey, getAgentSoul, generateSoul, getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getLabels, createLabel, updateLabel, deleteLabel, getConnectors, updateConnectors, testSlack, testTeams, getEmailTemplates, updateEmailTemplates } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, Plus, Trash2, Pencil, X, ChevronUp, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Brain, Sparkles, Shield, MessageSquare, Webhook, ToggleLeft, ToggleRight, Send, ChevronDown, Tag, Plug2, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";

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


import { card, inputClass, inputStyle } from "./_shared";

const CompanyProfile = () => {
  const { setShenmayTenant, setShenmayUser } = useShenmayAuth();
  const [form, setForm] = useState({
    name: "", agent_name: "", chat_bubble_name: "", vertical: "", primary_color: "#1A1D1A",
    website_url: "", company_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);
  const [urlError, setUrlError] = useState("");

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
          primary_color: t.primary_color || "#1A1D1A",
          website_url: t.website_url || "",
          company_description: t.company_description || t.description || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoadingMe(false));
  }, []);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
    if (k === "website_url") setUrlError("");
  };

  // Empty URL is allowed (the field isn't required). Non-empty must parse.
  const isValidUrl = (v) => {
    if (!v) return true;
    try {
      const u = new URL(v.match(/^https?:\/\//i) ? v : `https://${v}`);
      return Boolean(u.hostname && u.hostname.includes("."));
    } catch {
      return false;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!isValidUrl(form.website_url.trim())) {
      setUrlError("Enter a valid URL (e.g. https://yourcompany.com).");
      return;
    }
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
        <div className="h-4 w-32 rounded-lg" style={{ background: "#EDE7D7" }} />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-xl" style={{ background: "#EDE7D7" }} />)}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="rounded-2xl p-6 space-y-5" style={card}>
      <h3 className="text-sm font-semibold text-[#3A3D39]">Company Profile</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Company Name</label>
          <input type="text" required value={form.name} onChange={set("name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Agent Name</label>
          <input type="text" value={form.agent_name} onChange={set("agent_name")} className={inputClass} style={inputStyle} />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Chat Bubble Label</label>
          <input type="text" value={form.chat_bubble_name} onChange={set("chat_bubble_name")} placeholder="e.g. Chat with Steve" className={inputClass} style={inputStyle} />
          <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>Text shown on the floating chat button. Defaults to "Chat with [Agent Name]" if blank.</p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Industry</label>
          <select value={form.vertical} onChange={set("vertical")} className={inputClass + " cursor-pointer"} style={{ ...inputStyle, colorScheme: "dark" }}>
            <option value="" style={{ background: "#1a2235", color: "#6B6B64" }}>Select…</option>
            {INDUSTRIES.map((v) => <option key={v.value} value={v.value} style={{ background: "#1a2235", color: "#1A1D1A" }}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Website URL</label>
          <input
            type="url"
            value={form.website_url}
            onChange={set("website_url")}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && !isValidUrl(v)) setUrlError("Enter a valid URL (e.g. https://yourcompany.com).");
            }}
            placeholder="https://yourcompany.com"
            className={inputClass}
            style={{ ...inputStyle, ...(urlError ? { borderColor: "#7A1F1A" } : {}) }}
          />
          {urlError && <p className="text-[12px] mt-1.5" style={{ color: "#7A1F1A" }}>{urlError}</p>}
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Primary Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.primary_color} onChange={set("primary_color")} className="w-10 h-9 rounded-lg cursor-pointer p-0.5" style={{ background: "#EDE7D7", border: "1px solid #EDE7D7" }} />
            <input type="text" value={form.primary_color} onChange={set("primary_color")} maxLength={7} className={inputClass + " flex-1"} style={inputStyle} />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Company Description</label>
        <textarea rows={3} value={form.company_description} onChange={set("company_description")} className={inputClass} style={inputStyle} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#2D6A4F" }}>
            <Check size={14} /> Saved ✓
          </span>
        )}
      </div>
    </form>
  );
};

export default CompanyProfile;
