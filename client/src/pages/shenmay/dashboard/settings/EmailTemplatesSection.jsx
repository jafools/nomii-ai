import { useState, useEffect } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useShenmayAuth } from "@/contexts/ShenmayAuthContext";
import { getMe, updateCompany, updatePrivacySettings, updateAnonymousOnlyMode, getProducts, addProduct, updateProduct, deleteProduct, getDataApiKey, generateDataApiKey, revokeDataApiKey, getAgentSoul, generateSoul, getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, getLabels, createLabel, updateLabel, deleteLabel, getConnectors, updateConnectors, testSlack, testTeams, getEmailTemplates, updateEmailTemplates } from "@/lib/shenmayApi";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, Plus, Trash2, Pencil, X, ChevronUp, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Brain, Sparkles, Shield, MessageSquare, Webhook, ToggleLeft, ToggleRight, Send, ChevronDown, Tag, Plug2, Zap, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { TOKENS as T, Kicker, Display, Lede } from "@/components/shenmay/ui/ShenmayUI";


import { card, inputClass, inputStyle } from "./_shared";

const EmailTemplatesSection = () => {
  const [form, setForm] = useState({ email_from_name: "", email_reply_to: "", email_footer: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [replyToError, setReplyToError] = useState("");

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

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setSaved(false);
    if (k === "email_reply_to") setReplyToError("");
  };

  // Empty Reply-To is allowed (the field isn't required). Non-empty must look like an email.
  const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isValidEmail(form.email_reply_to.trim())) {
      setReplyToError("Enter a valid email address (e.g. support@yourcompany.com).");
      return;
    }
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
        <div className="h-4 w-40 rounded-lg" style={{ background: "#EDE7D7" }} />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl" style={{ background: "#EDE7D7" }} />)}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="rounded-2xl p-6 space-y-5" style={card}>
      <div className="flex items-center gap-2">
        <Mail size={16} style={{ color: "#0F5F5C" }} />
        <div>
          <h3 className="text-[14px] font-semibold text-[#1A1D1A]">Email Templates</h3>
          <p className="text-[11px] text-[#6B6B64] mt-0.5">Customize the sender name, reply-to address, and footer on emails sent to your team and customers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">From Name</label>
          <input type="text" value={form.email_from_name} onChange={set("email_from_name")} maxLength={100}
            placeholder="e.g. Acme Co Support" className={inputClass} style={inputStyle} />
          <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>
            Appears as the sender name. Defaults to "Shenmay AI" if blank.
          </p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Reply-To Address</label>
          <input
            type="email"
            value={form.email_reply_to}
            onChange={set("email_reply_to")}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && !isValidEmail(v)) setReplyToError("Enter a valid email address (e.g. support@yourcompany.com).");
            }}
            maxLength={255}
            placeholder="e.g. support@yourcompany.com"
            className={inputClass}
            style={{ ...inputStyle, ...(replyToError ? { borderColor: "#7A1F1A" } : {}) }}
          />
          {replyToError ? (
            <p className="text-[12px] mt-1.5" style={{ color: "#7A1F1A" }}>{replyToError}</p>
          ) : (
            <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>
              When recipients hit "Reply", their email goes to this address.
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[#6B6B64] mb-1.5">Email Footer</label>
        <textarea rows={2} value={form.email_footer} onChange={set("email_footer")} maxLength={500}
          placeholder="e.g. Acme Co · 123 Main St, Suite 400 · Springfield, IL 62701"
          className={inputClass} style={inputStyle} />
        <p className="text-[11px] mt-1" style={{ color: "#6B6B64" }}>
          Added at the bottom of all emails. Useful for compliance or branding.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #0F5F5C, #083A38)", color: "#F5F1E8" }}>
          {saving ? "Saving…" : "Save email settings"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#2D6A4F" }}>
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </form>
  );
};

export default EmailTemplatesSection;
